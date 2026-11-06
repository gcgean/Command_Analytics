import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../database/client'

/**
 * Chaves de API para aplicações externas.
 *
 * Login de usuário não serve aqui: o token do sistema expira, está preso a uma pessoa e dá
 * acesso a tudo. Uma aplicação externa precisa de uma credencial própria, revogável sem mexer
 * em ninguém, e limitada ao que ela faz.
 *
 * Guarda só o SHA-256 do token. Quem perder a chave gera outra — não existe "ver a chave de
 * novo", e isso é de propósito: um vazamento do banco não entrega acesso a quem o ler.
 */

export interface ChaveApi {
  id: number
  nome: string
  ativo: boolean
  criadoEm: string | null
  ultimoUsoEm: string | null
  chamadas: number
}

const hash = (token: string) => createHash('sha256').update(token.trim()).digest('hex')

export async function initApiChaves(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS api_chave (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      token_hash    CHAR(64) NOT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      criado_por    INT NULL,
      ultimo_uso_em DATETIME NULL,
      chamadas      INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_api_chave_token (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

/** Gera a chave e devolve o token em claro — a única vez em que ele existe fora do cliente. */
export async function criarChave(
  nome: string, criadoPor?: number | null,
): Promise<{ id: number; token: string }> {
  const limpo = String(nome ?? '').trim().slice(0, 120)
  if (!limpo) throw new Error('Dê um nome à chave — é por ele que se sabe o que revogar.')
  const token = `ca_${randomBytes(24).toString('hex')}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO api_chave (nome, token_hash, criado_por) VALUES (?,?,?)`,
    limpo, hash(token), criadoPor ?? null)
  const [r] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
  return { id: Number(r?.id ?? 0), token }
}

export async function listarChaves(): Promise<ChaveApi[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, ativo, criado_em, ultimo_uso_em, chamadas
       FROM api_chave ORDER BY ativo DESC, nome`).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    nome: String(r.nome ?? ''),
    ativo: Number(r.ativo) === 1,
    criadoEm: r.criado_em ?? null,
    ultimoUsoEm: r.ultimo_uso_em ?? null,
    chamadas: Number(r.chamadas ?? 0),
  }))
}

/** Revoga em vez de apagar: o histórico de quem chamou o quê continua fazendo sentido. */
export async function revogarChave(id: number): Promise<void> {
  await prisma.$executeRawUnsafe(`UPDATE api_chave SET ativo = 0 WHERE id = ?`, Number(id))
}

export interface ChaveAutenticada { id: number; nome: string }

/**
 * Valida o token e marca o uso. Devolve `null` para chave inexistente, revogada ou ausente —
 * a rota responde 401 sem distinguir os casos, que é o que se deve a quem não tem acesso.
 */
export async function autenticarChave(token: string | undefined): Promise<ChaveAutenticada | null> {
  const limpo = String(token ?? '').trim()
  if (!limpo) return null
  const [r] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome FROM api_chave WHERE token_hash = ? AND ativo = 1 LIMIT 1`,
    hash(limpo)).catch(() => [])
  if (!r) return null
  prisma.$executeRawUnsafe(
    `UPDATE api_chave SET ultimo_uso_em = NOW(), chamadas = chamadas + 1 WHERE id = ?`,
    Number(r.id)).catch(() => {})
  return { id: Number(r.id), nome: String(r.nome ?? '') }
}

/**
 * Limite de ritmo por chave, em memória.
 *
 * Não é proteção contra abuso distribuído — é o que impede uma integração com laço errado de
 * derrubar o banco. Reinício do processo zera, e isso é aceitável para o que ele protege.
 */
const JANELA_MS = 60_000
const MAX_POR_JANELA = 120
const contadores = new Map<number, { ate: number; usos: number }>()

export function dentroDoLimite(chaveId: number): boolean {
  const agora = Date.now()
  const atual = contadores.get(chaveId)
  if (!atual || agora > atual.ate) {
    contadores.set(chaveId, { ate: agora + JANELA_MS, usos: 1 })
    return true
  }
  atual.usos += 1
  return atual.usos <= MAX_POR_JANELA
}
