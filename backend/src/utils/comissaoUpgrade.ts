import { prisma } from '../database/client'

/**
 * Percentual de comissão dos upgrades, por tipo de produto.
 *
 * Isto vivia fixo no código: 25% quando a descrição do plano continha "tef" ou
 * "delivery - faturamento", 50% no resto. Mudar a regra exigia deploy, e ninguém fora do
 * desenvolvimento sabia onde ela estava.
 *
 * Agora é cadastro. A primeira regra cujo termo aparece na descrição do plano vence; sem
 * nenhuma, vale o percentual padrão. A ordem importa, então ela é editável.
 */

export interface RegraUpgrade {
  id: number
  termo: string | null
  percentual: number
  ordem: number
  ativo: boolean
  /** A linha sem termo: o que vale quando nenhuma outra casa. */
  padrao: boolean
}

/** O que estava no código até aqui — vira a semente do cadastro. */
const SEMENTE: Array<{ termo: string | null; percentual: number; ordem: number }> = [
  { termo: 'delivery - faturamento', percentual: 25, ordem: 10 },
  { termo: 'tef', percentual: 25, ordem: 20 },
  { termo: null, percentual: 50, ordem: 999 },
]

export async function initComissaoUpgrade(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_upgrade_regra (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      -- Texto procurado na descrição do plano. NULL é a regra padrão, usada quando
      -- nenhum termo casa. Só existe uma linha dessas.
      termo      VARCHAR(120) NULL,
      percentual DECIMAL(5,2) NOT NULL,
      ordem      INT NOT NULL DEFAULT 100,
      ativo      TINYINT(1) NOT NULL DEFAULT 1,
      criado_em  DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_upgrade_regra_ordem (ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Semeia só uma vez: depois disso o cadastro manda, inclusive se esvaziarem a tabela
  // de propósito — por isso a verificação é por linha existente, não por contagem zero.
  const [existe] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM comissao_upgrade_regra`)
  if (Number(existe?.total ?? 0) > 0) return

  for (const r of SEMENTE) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_upgrade_regra (termo, percentual, ordem) VALUES (?,?,?)`,
      r.termo, r.percentual, r.ordem)
  }
}

const num = (v: any) => (v == null ? 0 : Number(v))

export async function listarRegrasUpgrade(): Promise<RegraUpgrade[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM comissao_upgrade_regra ORDER BY (termo IS NULL), ordem, id`).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    termo: r.termo ?? null,
    percentual: num(r.percentual),
    ordem: Number(r.ordem ?? 100),
    ativo: Number(r.ativo) === 1,
    padrao: r.termo == null,
  }))
}

/**
 * O percentual de uma descrição de plano, dadas as regras já carregadas.
 *
 * Recebe as regras em vez de buscá-las: a listagem de pendentes resolve dezenas de linhas
 * de uma vez, e uma consulta por linha seria desperdício.
 */
export function percentualPelasRegras(
  descricaoPlano: string | null | undefined, regras: RegraUpgrade[],
): number {
  const d = String(descricaoPlano ?? '').trim().toLowerCase()
  const comTermo = regras.filter((r) => r.ativo && r.termo)
  for (const r of comTermo) {
    if (d.includes(String(r.termo).trim().toLowerCase())) return r.percentual
  }
  const padrao = regras.find((r) => r.padrao && r.ativo)
  return padrao ? padrao.percentual : 0
}

/** Grava o cadastro inteiro. Exige exatamente uma regra padrão. */
export async function salvarRegrasUpgrade(
  regras: Array<{ termo: string | null; percentual: number; ordem?: number; ativo?: boolean }>,
): Promise<void> {
  const limpas = regras
    .map((r, i) => ({
      termo: r.termo == null || String(r.termo).trim() === '' ? null : String(r.termo).trim().slice(0, 120),
      percentual: Number(r.percentual),
      ordem: Number(r.ordem ?? (i + 1) * 10),
      ativo: r.ativo === false ? 0 : 1,
    }))
    .filter((r) => Number.isFinite(r.percentual) && r.percentual >= 0 && r.percentual <= 100)

  const padroes = limpas.filter((r) => r.termo == null)
  if (padroes.length !== 1) {
    throw new Error('Informe exatamente um percentual padrão — o que vale quando nenhum termo casa.')
  }
  const termos = limpas.filter((r) => r.termo != null).map((r) => r.termo!.toLowerCase())
  if (new Set(termos).size !== termos.length) {
    throw new Error('Há termos repetidos. Cada termo pode aparecer uma vez só.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM comissao_upgrade_regra`)
    for (const r of limpas) {
      await tx.$executeRawUnsafe(
        `INSERT INTO comissao_upgrade_regra (termo, percentual, ordem, ativo) VALUES (?,?,?,?)`,
        r.termo, r.percentual, r.ordem, r.ativo)
    }
  })
}

/**
 * Prêmio do campeão de upgrades do mês.
 *
 * Quem somar mais comissão de upgrade no período leva um valor fixo. Fica em cadastro, e
 * não no código, porque é um número que a gestão muda — e empate paga aos dois: dar a
 * apenas um exigiria um critério de desempate que ninguém combinou.
 */
const CHAVE_PREMIO = 'premio_campeao_upgrade'
const CHAVE_PREMIO_ATEND = 'premio_melhor_atendente'
const CHAVE_MIN_ATEND = 'min_atendimentos_ranking'

export async function initComissaoConfig(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_config (
      chave VARCHAR(60) PRIMARY KEY,
      valor DECIMAL(12,2) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  for (const [chave, valor] of [
    [CHAVE_PREMIO, 100],
    [CHAVE_PREMIO_ATEND, 200],
    [CHAVE_MIN_ATEND, 200],
  ] as Array<[string, number]>) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO comissao_config (chave, valor) VALUES (?, ?)`, chave, valor)
  }
}

export async function valorPremioCampeao(): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT valor FROM comissao_config WHERE chave = ?`, CHAVE_PREMIO).catch(() => [])
  return r ? Number(r.valor) : 0
}

export async function salvarPremioCampeao(valor: number): Promise<void> {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor do prêmio inválido.')
  await prisma.$executeRawUnsafe(
    `INSERT INTO comissao_config (chave, valor) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`, CHAVE_PREMIO, valor)
}

/** Quem liderou a comissão de upgrades no período. Empate devolve todos os empatados. */
export async function campeoesDeUpgrade(inicio: string, fim: string): Promise<number[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT co.cod_func AS id, SUM(co.valor_comissao) AS total
       FROM comissoes_funcionario co
       INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      WHERE CAST(co.data_venda AS DATE) BETWEEN ? AND ?
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
      GROUP BY co.cod_func
      ORDER BY total DESC`, inicio, fim).catch(() => [])
  if (linhas.length === 0) return []
  const topo = Number(linhas[0].total ?? 0)
  if (!(topo > 0)) return []
  return linhas.filter((l) => Number(l.total) === topo).map((l) => Number(l.id))
}

async function lerConfig(chave: string, padrao: number): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT valor FROM comissao_config WHERE chave = ?`, chave).catch(() => [])
  return r ? Number(r.valor) : padrao
}

async function gravarConfig(chave: string, valor: number): Promise<void> {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor inválido.')
  await prisma.$executeRawUnsafe(
    `INSERT INTO comissao_config (chave, valor) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`, chave, valor)
}

export const valorPremioAtendente = () => lerConfig(CHAVE_PREMIO_ATEND, 0)
export const salvarPremioAtendente = (v: number) => gravarConfig(CHAVE_PREMIO_ATEND, v)
export const minimoAtendimentos = () => lerConfig(CHAVE_MIN_ATEND, 200)
export const salvarMinimoAtendimentos = (v: number) => gravarConfig(CHAVE_MIN_ATEND, v)
