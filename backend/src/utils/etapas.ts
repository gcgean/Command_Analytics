import { prisma } from '../database/client'

/** Cria a tabela de cadastro de etapas caso ainda não exista. */
export async function initEtapas(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_etapas (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      nome         VARCHAR(120) NOT NULL,
      cor          VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
      telas        TEXT NULL,
      ativo        TINYINT(1) NOT NULL DEFAULT 1,
      ordem        INT NOT NULL DEFAULT 0,
      criado_em    DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_etapas_ativo (ativo),
      INDEX idx_etapas_ordem (ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

