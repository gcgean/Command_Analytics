import { prisma } from '../database/client'

/**
 * Comissão por canal de aquisição.
 *
 * Nasceu para o marketing: "a cada R$ 1.000 fechados no tráfego pago, R$ 50 de comissão".
 * A regra é por pessoa e por canal, porque quem cuida do tráfego não é quem cuida da
 * indicação de contador, e cada canal pode valer um valor diferente.
 *
 * Paga por bloco COMPLETO: R$ 1.900 no canal rendem um bloco, não um e nove décimos. É como
 * a regra foi dita, e é o que torna o valor conferível de cabeça.
 */

export interface RegraCanal {
  id: number
  usuarioId: number
  usuario: string | null
  canal: string
  blocoValor: number
  valorPorBloco: number
  ativo: boolean
}

export interface ApuracaoCanal {
  canal: string
  faturamento: number
  negocios: number
  blocoValor: number
  valorPorBloco: number
  blocos: number
  valor: number
  /** Quanto falta fechar no canal para completar o próximo bloco. */
  faltaProximoBloco: number
}

export async function initComissaoCanal(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_canal (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id      INT NOT NULL,
      -- Nome do canal como vem do CRM ('Trafego Pago', 'Instagram'...).
      canal           VARCHAR(100) NOT NULL,
      -- A cada quanto fechado paga, e quanto paga por bloco.
      bloco_valor     DECIMAL(12,2) NOT NULL DEFAULT 1000,
      valor_por_bloco DECIMAL(12,2) NOT NULL DEFAULT 0,
      ativo           TINYINT(1) NOT NULL DEFAULT 1,
      criado_em       DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_comissao_canal (usuario_id, canal),
      INDEX idx_comissao_canal_usuario (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const num = (v: any) => (v == null ? 0 : Number(v))

export async function listarRegrasCanal(usuarioId?: number): Promise<RegraCanal[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario
       FROM comissao_canal c
       LEFT JOIN usuario u ON u.COD_USU = c.usuario_id
      ${usuarioId ? 'WHERE c.usuario_id = ?' : ''}
      ORDER BY usuario, c.canal`, ...(usuarioId ? [usuarioId] : [])).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    usuarioId: Number(r.usuario_id),
    usuario: r.usuario ?? null,
    canal: String(r.canal ?? ''),
    blocoValor: num(r.bloco_valor),
    valorPorBloco: num(r.valor_por_bloco),
    ativo: Number(r.ativo) === 1,
  }))
}

/** Faturamento ganho por canal no período — a mesma fonte da tela de canais do CRM. */
export async function faturamentoPorCanal(
  inicio: string, fim: string,
): Promise<Map<string, { faturamento: number; negocios: number }>> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(NULLIF(canal, ''), 'Sem canal') AS canal,
            COUNT(*) AS negocios,
            COALESCE(SUM(valor), 0) AS faturamento
       FROM crm_negocio
      WHERE status = 'won'
        AND DATE(COALESCE(finalizado_em, data)) BETWEEN ? AND ?
      GROUP BY canal`, inicio, fim).catch(() => [])
  return new Map(linhas.map((r) => [String(r.canal), {
    faturamento: num(r.faturamento), negocios: Number(r.negocios ?? 0),
  }]))
}

/** O que cada pessoa recebe por canal no período. */
export async function comissaoPorCanal(
  inicio: string, fim: string,
): Promise<Map<number, ApuracaoCanal[]>> {
  const regras = await listarRegrasCanal()
  if (regras.length === 0) return new Map()

  const porCanal = await faturamentoPorCanal(inicio, fim)
  const saida = new Map<number, ApuracaoCanal[]>()

  for (const r of regras) {
    if (!r.ativo || r.blocoValor <= 0 || r.valorPorBloco <= 0) continue
    const dados = porCanal.get(r.canal) ?? { faturamento: 0, negocios: 0 }
    const blocos = Math.floor(dados.faturamento / r.blocoValor)
    const lista = saida.get(r.usuarioId) ?? []
    lista.push({
      canal: r.canal,
      faturamento: dados.faturamento,
      negocios: dados.negocios,
      blocoValor: r.blocoValor,
      valorPorBloco: r.valorPorBloco,
      blocos,
      valor: Number((blocos * r.valorPorBloco).toFixed(2)),
      faltaProximoBloco: Number((r.blocoValor - (dados.faturamento % r.blocoValor)).toFixed(2)),
    })
    saida.set(r.usuarioId, lista)
  }
  return saida
}
