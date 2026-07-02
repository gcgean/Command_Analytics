import { prisma } from '../database/client'

/** Cria a tabela de cadastro de serviços caso ainda não exista. */
export async function initServicos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_servicos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      descricao     TEXT NULL,
      checklist_ids TEXT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ordem         INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_servicos_ativo (ativo),
      INDEX idx_servicos_ordem (ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}
