import { prisma } from '../database/client'

/**
 * Divisão de uma venda entre vendedores.
 *
 * O processo comercial guarda um único `id_usu_vendedor`, e o valor inteiro ia para ele.
 * Acontece de um abrir a venda e outro fechar — e aí não havia como dar a cada um a sua
 * parte sem mentir em algum lugar.
 *
 * Quando o processo tem rateio, ele MANDA: o `id_usu_vendedor` deixa de valer para a
 * comissão. Isso é de propósito — ter as duas regras valendo ao mesmo tempo somaria mais
 * de 100% da venda.
 */

export interface ParticipanteRateio {
  usuarioId: number
  usuario: string | null
  percentual: number
}

export interface RateioVenda {
  idProcesso: number
  cliente: string | null
  data: string | null
  valorTotal: number
  vendedorOriginal: string | null
  participantes: ParticipanteRateio[]
}

export async function initRateioVenda(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS processo_rateio (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      id_processo INT NOT NULL,
      usuario_id  INT NOT NULL,
      percentual  DECIMAL(5,2) NOT NULL,
      criado_em   DATETIME NOT NULL DEFAULT NOW(),
      criado_por  INT NULL,
      UNIQUE KEY uk_processo_rateio (id_processo, usuario_id),
      INDEX idx_processo_rateio_usuario (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const num = (v: any) => (v == null ? 0 : Number(v))

/** Nome do cliente que serve para ler: fantasia só quando não é o próprio CNPJ. */
export const SQL_NOME_CLIENTE = `
  CASE WHEN cli.NOME_FANTASIA REGEXP '[A-Za-z]' THEN cli.NOME_FANTASIA
       ELSE COALESCE(NULLIF(cli.NOME_CLI, ''), cli.NOME_FANTASIA) END`

/** Vendas recentes, com o rateio que já exista. */
export async function listarVendasParaRateio(busca: string, limite = 40): Promise<RateioVenda[]> {
  const termo = busca.trim()
  const cond: string[] = []
  const val: any[] = []
  if (termo) {
    if (/^\d+$/.test(termo)) { cond.push('c.id_processo = ?'); val.push(Number(termo)) }
    else {
      cond.push(`(cli.NOME_FANTASIA LIKE ? OR cli.NOME_CLI LIKE ?)`)
      val.push(`%${termo}%`, `%${termo}%`)
    }
  }

  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.id_processo, ${SQL_NOME_CLIENTE} AS cliente,
            DATE_FORMAT(COALESCE(c.data_venc_implantacao, c.data_hora_dados), '%Y-%m-%d') AS data,
            (c.valor_implantacao + c.valor_migracao + COALESCE(c.valor_mensalidade, 0)) AS total,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS vendedor
       FROM processo_implantacao_comercial c
       LEFT JOIN processo_implantacao pi ON pi.id = c.id_processo
       LEFT JOIN cliente cli ON cli.cod_cli = pi.id_cli
       LEFT JOIN usuario u ON u.COD_USU = c.id_usu_vendedor
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY COALESCE(c.data_venc_implantacao, c.data_hora_dados) DESC
      LIMIT ${limite}`, ...val).catch(() => [])

  if (linhas.length === 0) return []
  const ids = linhas.map((l) => Number(l.id_processo))
  const rateios = await prisma.$queryRawUnsafe<any[]>(
    `SELECT r.id_processo, r.usuario_id, r.percentual,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario
       FROM processo_rateio r
       LEFT JOIN usuario u ON u.COD_USU = r.usuario_id
      WHERE r.id_processo IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => [])

  return linhas.map((l) => ({
    idProcesso: Number(l.id_processo),
    cliente: l.cliente ?? null,
    data: l.data ?? null,
    valorTotal: num(l.total),
    vendedorOriginal: l.vendedor ?? null,
    participantes: rateios
      .filter((r) => Number(r.id_processo) === Number(l.id_processo))
      .map((r) => ({
        usuarioId: Number(r.usuario_id),
        usuario: r.usuario ?? null,
        percentual: num(r.percentual),
      })),
  }))
}

/**
 * Grava a divisão inteira de uma venda. Lista vazia remove o rateio e a venda volta a ser
 * do vendedor original — é o caminho de volta, e precisa existir.
 */
export async function salvarRateio(
  idProcesso: number,
  participantes: Array<{ usuarioId: number; percentual: number }>,
  criadoPor: number | null,
): Promise<void> {
  const validos = participantes
    .map((p) => ({ usuarioId: Number(p.usuarioId), percentual: Number(p.percentual) }))
    .filter((p) => p.usuarioId > 0 && p.percentual > 0)

  if (validos.length > 0) {
    const soma = validos.reduce((s, p) => s + p.percentual, 0)
    // Meio centavo de folga para 33,33 + 33,33 + 33,34 não ser recusado.
    if (Math.abs(soma - 100) > 0.01) {
      throw new Error(`Os percentuais somam ${soma.toFixed(2)}%. Precisa fechar em 100%.`)
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM processo_rateio WHERE id_processo = ?`, idProcesso)
    for (const p of validos) {
      await tx.$executeRawUnsafe(
        `INSERT INTO processo_rateio (id_processo, usuario_id, percentual, criado_por)
         VALUES (?,?,?,?)`, idProcesso, p.usuarioId, p.percentual, criadoPor)
    }
  })
}
