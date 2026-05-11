import { prisma } from '../database/client'

function isDuplicateSchemaError(error: unknown, snippets: string[]): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return snippets.some((snippet) => message.includes(snippet))
}

/** Cria a tabela de cadastro de checklists caso ainda não exista. */
export async function initChecklists(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_checklists (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      descricao     TEXT NULL,
      itens         LONGTEXT NULL,
      etapas        TEXT NULL,
      telas         TEXT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ordem         INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_checklists_ativo (ativo),
      INDEX idx_checklists_ordem (ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Compatibilidade com bancos onde a tabela já existia sem a coluna "etapas".
  const [colunaEtapas] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cadastro_checklists'
      AND COLUMN_NAME = 'etapas'
  `)

  if (!Number(colunaEtapas?.total ?? 0)) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE cadastro_checklists ADD COLUMN etapas TEXT NULL`)
    } catch (error) {
      if (!isDuplicateSchemaError(error, ["Duplicate column name 'etapas'"])) {
        throw error
      }
    }
  }
}
