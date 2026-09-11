import { prisma } from '../database/client'

/**
 * Cria a tabela de cadastro de projetos e garante a coluna cod_projeto em atendimentos, caso
 * ainda não existam. atendimentos é a mesma tabela usada pelo sistema Delphi legado — a coluna
 * nova é nullable e sem constraint, então não quebra nenhum INSERT/UPDATE que o Delphi já faça
 * (ele simplesmente não sabe que ela existe).
 */
export async function initProjetos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_projetos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      cor           VARCHAR(20) NULL,
      tipo          VARCHAR(10) NOT NULL DEFAULT 'WEB',
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_projetos_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // A tabela pode já existir de uma versão anterior sem a coluna 'tipo' (CREATE TABLE IF NOT
  // EXISTS acima não adiciona colunas em tabela já existente) — garante ela também.
  const tipoExiste = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cadastro_projetos' AND COLUMN_NAME = 'tipo'
  `)
  if (Number(tipoExiste[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE cadastro_projetos ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'WEB'`).catch((e: any) => {
      if (!String(e?.message ?? '').includes('1060')) throw e
    })
  }

  // Checa-antes-de-alterar não é atômico: essa função roda tanto no boot do servidor quanto
  // sob demanda na rota /projetos, e as duas podem disparar juntas na primeira inicialização.
  // Em vez de depender de uma única Promise compartilhada entre módulos, cada ALTER engole o
  // próprio erro de "já existe" (MySQL 1060 = coluna duplicada, 1061 = índice duplicado).
  // Qual versão do cliente esse projeto acompanha — usado pela aba "Clientes a atualizar" pra
  // saber com qual coluna de dados_gerais_clientes comparar. Vazio = projeto não acompanha versão.
  const sistemaExiste = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cadastro_projetos' AND COLUMN_NAME = 'sistema_versao'
  `)
  if (Number(sistemaExiste[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE cadastro_projetos ADD COLUMN sistema_versao VARCHAR(20) NULL`).catch((e: any) => {
      if (!String(e?.message ?? '').includes('1060')) throw e
    })
  }

  const colunaExiste = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'atendimentos' AND COLUMN_NAME = 'cod_projeto'
  `)
  if (Number(colunaExiste[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE atendimentos ADD COLUMN cod_projeto INT NULL`).catch((e: any) => {
      if (!String(e?.message ?? '').includes('1060')) throw e
    })
    await prisma.$executeRawUnsafe(`ALTER TABLE atendimentos ADD INDEX idx_atendimentos_projeto (cod_projeto)`).catch((e: any) => {
      if (!String(e?.message ?? '').includes('1061')) throw e
    })
  }
}
