import { prisma } from '../database/client'

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
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE cadastro_checklists ADD COLUMN etapas TEXT NULL`)
  } catch (err: any) {
    const message = String(err?.message ?? '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('1060')) {
      throw err
    }
  }
}
