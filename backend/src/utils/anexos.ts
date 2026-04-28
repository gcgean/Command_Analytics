import { prisma } from '../database/client'

export async function initAnexos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS agendamento_anexo (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      tabela       VARCHAR(40) NOT NULL,
      registro_id  INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name  VARCHAR(120) NOT NULL,
      mime_type    VARCHAR(120) NOT NULL,
      size_bytes   INT NOT NULL,
      created_by   INT NULL,
      created_at   DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_tabela_registro (tabela, registro_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

