import { prisma } from '../database/client'

/**
 * Pedidos de cancelamento de integração de pagamento.
 *
 * Tabela nova: o cadastro do cliente é compartilhado com o Delphi e não recebe coluna nova.
 * O pedido passa por duas mãos — quem atende registra e manda para a operadora, e o
 * financeiro confirma a baixa. Cada etapa guarda quem fez e quando, porque "já cancelaram?"
 * é a pergunta que aparece semanas depois, quando ninguém lembra.
 */
export async function initCancelamentos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_cancelamento (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id        INT NULL,
      cliente_nome      VARCHAR(200) NULL,
      cnpj              VARCHAR(20) NULL,
      -- Quando o cliente pediu, que não é quando foi registrado aqui.
      data_solicitacao  DATE NOT NULL,
      operadora         VARCHAR(80) NULL,
      observacao        TEXT NULL,
      -- Etapa 1: pedido encaminhado à operadora.
      enviado_operadora    TINYINT(1) NOT NULL DEFAULT 0,
      enviado_operadora_em DATETIME NULL,
      enviado_operadora_por INT NULL,
      -- Etapa 2: baixa confirmada pelo financeiro.
      cancelado_financeiro    TINYINT(1) NOT NULL DEFAULT 0,
      cancelado_financeiro_em DATETIME NULL,
      cancelado_financeiro_por INT NULL,
      criado_em      DATETIME NOT NULL DEFAULT NOW(),
      criado_por     INT NULL,
      atualizado_em  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_cancel_cliente (cliente_id),
      INDEX idx_cancel_data (data_solicitacao),
      INDEX idx_cancel_situacao (cancelado_financeiro, enviado_operadora)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}
