import { prisma } from '../database/client'
import { getUserPermissions } from '../routes/grupos'

async function ensureColumnExists(table: string, column: string, ddl: string) {
  const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `
  if (rows.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

let ensurePromise: Promise<void> | null = null
export function ensureVisibilidadeTables(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureColumnExists('servidor_nuvem', 'somente_admin', 'somente_admin TINYINT(1) NULL DEFAULT 0')
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS conexao_restricoes (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          servidor_id   INT NOT NULL,
          connection_id VARCHAR(255) NOT NULL,
          somente_admin TINYINT(1) NOT NULL DEFAULT 1,
          criado_em     DATETIME NOT NULL DEFAULT NOW(),
          UNIQUE KEY uq_servidor_conexao (servidor_id, connection_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    })()
  }
  return ensurePromise
}

/** Cache curto por processo — evita bater no banco a cada requisição pra checar se é admin. */
const cacheAdmin = new Map<number, { valor: boolean; expiraEm: number }>()
const CACHE_TTL_MS = 60_000

export async function usuarioEhAdmin(usuarioId: number | null | undefined): Promise<boolean> {
  if (!usuarioId) return false
  const agora = Date.now()
  const cache = cacheAdmin.get(usuarioId)
  if (cache && cache.expiraEm > agora) return cache.valor
  const permissoes = await getUserPermissions(usuarioId)
  const valor = permissoes.includes('*')
  cacheAdmin.set(usuarioId, { valor, expiraEm: agora + CACHE_TTL_MS })
  return valor
}
