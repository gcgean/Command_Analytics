import { prisma } from '../database/client'

/**
 * Catálogo de SmartPOS homologados, por adquirente.
 *
 * É cadastro, não código: a lista muda quando o fornecedor homologa um aparelho novo, e
 * isso não deveria exigir deploy. A tela da triagem manda conferir compatibilidade antes de
 * prometer — é aqui que se confere.
 */
export async function initSmartPos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS smartpos_homologado (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      adquirente    VARCHAR(80) NOT NULL,
      modelo        VARCHAR(80) NOT NULL,
      fabricante    VARCHAR(60) NULL,
      observacao    VARCHAR(400) NULL,
      -- De onde veio a informação, para quem consultar saber o quanto confiar.
      fonte         VARCHAR(200) NULL,
      -- Imagem própria: a do fornecedor é dele, aqui a equipe sobe a que quiser.
      imagem_nome   VARCHAR(120) NULL,
      imagem_mime   VARCHAR(120) NULL,
      -- Aparelho que fala direto com o Command, sem passar pelo Smart TEF. O caminho de
      -- habilitação é outro, então precisa saltar aos olhos no card.
      integracao_propria TINYINT(1) NOT NULL DEFAULT 0,
      integracao_nome    VARCHAR(120) NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ordem         INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_smartpos (adquirente, modelo),
      INDEX idx_smartpos_adq (adquirente),
      INDEX idx_smartpos_modelo (modelo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Bancos que já tinham a tabela antes destas colunas.
  for (const [coluna, tipo] of [
    ['integracao_propria', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['integracao_nome', 'VARCHAR(120) NULL'],
  ]) {
    const [existe] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'smartpos_homologado'
         AND COLUMN_NAME = ?`, coluna)
    if (!Number(existe?.total ?? 0)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE smartpos_homologado ADD COLUMN ${coluna} ${tipo}`).catch(() => {})
    }
  }
}
