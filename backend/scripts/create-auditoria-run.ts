import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      tabela           VARCHAR(100) NOT NULL,
      registro_id      INT NOT NULL,
      acao             VARCHAR(20) NOT NULL,
      usuario_id       INT NULL,
      usuario_nome     VARCHAR(200) NULL,
      dados_antes      TEXT NULL,
      dados_depois     TEXT NULL,
      campos_alterados TEXT NULL,
      criado_em        DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_tabela_registro (tabela, registro_id),
      INDEX idx_usuario (usuario_id),
      INDEX idx_criado_em (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  console.log('✓ Tabela auditoria criada com sucesso!')
}

main()
  .catch(e => { console.error('Erro:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
