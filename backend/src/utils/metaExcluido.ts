import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'

/**
 * Lançamentos que o usuário tirou da meta à mão.
 *
 * Nasceu de uma assinatura duplicada no PayCore: o mesmo cliente, o mesmo produto e o mesmo
 * valor, assinados três dias seguidos. Deduplicar sozinho seria pior — cliente que contrata
 * de novo no mesmo mês existe, e o sistema não tem como distinguir um caso do outro. Então
 * a decisão fica com quem conhece a venda, registrada com motivo e autor: dinheiro que some
 * da meta sem explicação vira discussão depois.
 *
 * Excluir não apaga nada: a assinatura continua no PayCore e nas telas de carteira. O que
 * muda é só a contagem da meta.
 */

export type TipoExcluido = 'paycore'

export interface MetaExcluido {
  id: number
  tipo: TipoExcluido
  chave: string
  descricao: string | null
  motivo: string | null
  criadoEm: string | null
  criadoPor: string | null
}

export async function initMetaExcluido(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_excluido (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      tipo       VARCHAR(20) NOT NULL,
      -- Para o PayCore é o subscription_id: identifica a assinatura, não o cliente.
      chave      VARCHAR(120) NOT NULL,
      descricao  VARCHAR(300) NULL,
      motivo     VARCHAR(300) NULL,
      criado_em  DATETIME NOT NULL DEFAULT NOW(),
      criado_por INT NULL,
      UNIQUE KEY uq_meta_excluido (tipo, chave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

/**
 * Condição SQL que tira os excluídos da conta. `alias` é como `paycore_assinatura` foi
 * nomeada na consulta.
 *
 * É `NOT EXISTS` e não `NOT IN` de propósito: com a tabela vazia — o caso normal — o
 * otimizador resolve sem varrer nada, e `NOT IN` com NULL devolveria conjunto vazio.
 */
export function sqlSemExcluidosDaMeta(alias = 'a'): string {
  return `NOT EXISTS (
    SELECT 1 FROM meta_excluido me
     WHERE me.tipo = 'paycore' AND me.chave = ${alias}.subscription_id
  )`
}

export async function listarExcluidos(): Promise<MetaExcluido[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT e.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS criado_por_nome
       FROM meta_excluido e
       LEFT JOIN usuario u ON u.COD_USU = e.criado_por
      ORDER BY e.criado_em DESC`).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    tipo: String(r.tipo) as TipoExcluido,
    chave: String(r.chave),
    descricao: r.descricao ?? null,
    motivo: r.motivo ?? null,
    criadoEm: r.criado_em ?? null,
    criadoPor: r.criado_por_nome ?? null,
  }))
}

export async function excluirDaMeta(
  chave: string, descricao: string | null, motivo: string | null, usuarioId?: number | null,
): Promise<void> {
  const limpa = String(chave ?? '').trim()
  if (!limpa) throw new Error('Informe qual lançamento sair da meta.')
  await prisma.$executeRawUnsafe(
    `INSERT INTO meta_excluido (tipo, chave, descricao, motivo, criado_por)
     VALUES ('paycore', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE motivo = VALUES(motivo), descricao = VALUES(descricao)`,
    limpa.slice(0, 120), (descricao ?? '').slice(0, 300) || null,
    (motivo ?? '').slice(0, 300) || null, usuarioId ?? null)
}

/**
 * Devolve o lançamento à meta.
 *
 * Pela chave, não pelo id da exclusão: quem desfaz está olhando a lista de assinaturas,
 * onde o que existe é o subscription_id.
 */
export async function restaurarNaMeta(chave: string): Promise<void> {
  const limpa = String(chave ?? '').trim()
  if (!limpa) return
  await prisma.$executeRawUnsafe(
    `DELETE FROM meta_excluido WHERE tipo = 'paycore' AND chave = ?`, limpa)
}

/** A mesma condição para as consultas que usam template tag em vez de SQL em texto. */
export const semExcluidosDaMeta = (alias = 'a') =>
  Prisma.raw(sqlSemExcluidosDaMeta(alias))
