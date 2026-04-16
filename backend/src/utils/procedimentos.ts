import { prisma } from '../database/client'

/** Cria a tabela de procedimentos e campos relacionados aos agendamentos programados. */
export async function initProcedimentos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_procedimentos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(140) NOT NULL,
      descricao     TEXT NULL,
      duracao_min   INT NOT NULL DEFAULT 60,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ordem         INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_procedimentos_ativo (ativo),
      INDEX idx_procedimentos_ordem (ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agendamento_programado
      ADD COLUMN procedimento_id INT NULL AFTER cod_cli
    `)
  } catch (err: any) {
    const message = String(err?.message ?? '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('1060')) {
      throw err
    }
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agendamento_programado
      ADD INDEX idx_agendamento_prog_procedimento (procedimento_id)
    `)
  } catch (err: any) {
    const message = String(err?.message ?? '').toLowerCase()
    if (!message.includes('duplicate key name') && !message.includes('1061')) {
      throw err
    }
  }
}
