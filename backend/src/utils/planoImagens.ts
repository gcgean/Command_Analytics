import { prisma } from '../database/client'

/**
 * Imagem do plano.
 *
 * Fica em tabela própria porque `planos` é compartilhada com o Delphi legado — acrescentar
 * coluna lá quebraria o contrato com ele. Aqui guarda-se só o ponteiro para o arquivo; o
 * arquivo em si vai para uploads/planos, como os demais anexos do sistema.
 */
export async function initPlanoImagens(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS plano_imagem (
      plano_id      INT NOT NULL PRIMARY KEY,
      original_name VARCHAR(200) NOT NULL,
      stored_name   VARCHAR(120) NOT NULL,
      mime_type     VARCHAR(120) NOT NULL,
      size_bytes    INT NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      atualizado_por INT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}
