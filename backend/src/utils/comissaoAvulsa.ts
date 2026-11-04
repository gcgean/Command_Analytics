import { prisma } from '../database/client'

/**
 * Prêmio ou comissão lançada à mão, para o que não tem regra no sistema.
 *
 * Nasceu da premiação de melhor nota do suporte: existe, é paga, e não derivava de nenhuma
 * tabela. Em vez de inventar uma regra para cada prêmio novo, o lançamento é direto —
 * competência, pessoa, descrição e valor — e entra no total do mês como as demais parcelas.
 *
 * Guarda quem lançou e quando: dinheiro lançado à mão é o que mais gera pergunta depois.
 */

export interface ComissaoAvulsa {
  id: number
  usuarioId: number
  usuario: string | null
  competencia: string
  /** Quando a premiação aconteceu. Pode cair fora da competência em que o valor entra. */
  data: string | null
  descricao: string
  valor: number
  criadoEm: string | null
  criadoPor: string | null
}

export async function initComissaoAvulsa(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_avulsa (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id   INT NOT NULL,
      -- AAAA-MM: o mês em que o valor entra, que nem sempre é o mês do lançamento.
      competencia  CHAR(7) NOT NULL,
      descricao    VARCHAR(200) NOT NULL,
      valor        DECIMAL(12,2) NOT NULL,
      criado_em    DATETIME NOT NULL DEFAULT NOW(),
      criado_por   INT NULL,
      INDEX idx_comissao_avulsa_comp (competencia),
      INDEX idx_comissao_avulsa_usuario (usuario_id, competencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Data da premiação. Chegou depois, e os lançamentos antigos ficam com NULL — a
  // competência continua sendo o que define o mês de pagamento, a data é o registro
  // de quando o prêmio foi conquistado.
  const [temData] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comissao_avulsa'
       AND COLUMN_NAME = 'data_premiacao'`)
  if (!Number(temData?.total ?? 0)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE comissao_avulsa ADD COLUMN data_premiacao DATE NULL`).catch(() => {})
  }
}

const num = (v: any) => (v == null ? 0 : Number(v))

export async function listarAvulsas(competencia?: string): Promise<ComissaoAvulsa[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.*, DATE_FORMAT(a.data_premiacao, '%Y-%m-%d') AS data_fmt,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario,
            COALESCE(c.NOME_USUARIO_COMPLETO, c.NOME_USU) AS criado_por_nome
       FROM comissao_avulsa a
       LEFT JOIN usuario u ON u.COD_USU = a.usuario_id
       LEFT JOIN usuario c ON c.COD_USU = a.criado_por
      ${competencia ? 'WHERE a.competencia = ?' : ''}
      ORDER BY a.competencia DESC, a.data_premiacao DESC, usuario`,
    ...(competencia ? [competencia] : [])).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    usuarioId: Number(r.usuario_id),
    usuario: r.usuario ?? null,
    competencia: String(r.competencia),
    data: r.data_fmt ?? null,
    descricao: String(r.descricao ?? ''),
    valor: num(r.valor),
    criadoEm: r.criado_em ?? null,
    criadoPor: r.criado_por_nome ?? null,
  }))
}

/** O que cada pessoa tem de avulso na competência. */
export async function avulsasPorUsuario(
  competencia: string,
): Promise<Map<number, ComissaoAvulsa[]>> {
  const linhas = await listarAvulsas(competencia)
  const saida = new Map<number, ComissaoAvulsa[]>()
  for (const l of linhas) {
    const lista = saida.get(l.usuarioId) ?? []
    lista.push(l)
    saida.set(l.usuarioId, lista)
  }
  return saida
}
