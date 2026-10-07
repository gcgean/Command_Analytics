import { prisma } from '../database/client'

export async function initMetasCadastro(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tipo_meta (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      descricao VARCHAR(255) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      ordem INT NOT NULL DEFAULT 0,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_tipo_meta_nome (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_cadastro (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(160) NOT NULL,
      descricao TEXT NULL,
      tipo_meta_id INT NULL,
      setor_responsavel VARCHAR(80) NOT NULL,
      valor_meta DECIMAL(15,2) NOT NULL DEFAULT 0,
      competencia VARCHAR(20) NULL,
      data_inicio DATE NULL,
      data_fim DATE NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_meta_tipo (tipo_meta_id),
      INDEX idx_meta_setor (setor_responsavel),
      CONSTRAINT fk_meta_tipo FOREIGN KEY (tipo_meta_id) REFERENCES tipo_meta(id)
        ON UPDATE CASCADE ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_cadastro_usuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meta_id INT NOT NULL,
      usuario_id INT NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_meta_usuario (meta_id, usuario_id),
      INDEX idx_meta_usuario_usuario (usuario_id),
      CONSTRAINT fk_meta_usuario_meta FOREIGN KEY (meta_id) REFERENCES meta_cadastro(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // A competência era um texto livre ("2026-05"); o período agora tem começo e fim.
  await garantirColuna('meta_cadastro', 'data_inicio', 'DATE NULL')
  await garantirColuna('meta_cadastro', 'data_fim', 'DATE NULL')
}

/** Adiciona a coluna só se ela ainda não existir — o projeto não usa migrations. */
async function garantirColuna(tabela: string, coluna: string, definicao: string): Promise<void> {
  const [existe] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS q FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, tabela, coluna)
  if (Number(existe?.q ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`)
  }
}
