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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_procedimentos_tecnicos (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      procedimento_id INT NOT NULL,
      cod_tecnico     INT NOT NULL,
      criado_em       DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_procedimento_tecnico (procedimento_id, cod_tecnico),
      INDEX idx_proc_tecnico_proc (procedimento_id),
      INDEX idx_proc_tecnico_usuario (cod_tecnico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const [colunaProcedimentoAgendamento] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agendamento_programado'
      AND COLUMN_NAME = 'procedimento_id'
  `)

  if (!Number(colunaProcedimentoAgendamento?.total ?? 0)) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agendamento_programado
      ADD COLUMN procedimento_id INT NULL AFTER cod_cli
    `)
  }

  const [indiceProcedimentoAgendamento] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agendamento_programado'
      AND INDEX_NAME = 'idx_agendamento_prog_procedimento'
  `)

  if (!Number(indiceProcedimentoAgendamento?.total ?? 0)) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agendamento_programado
      ADD INDEX idx_agendamento_prog_procedimento (procedimento_id)
    `)
  }
}
