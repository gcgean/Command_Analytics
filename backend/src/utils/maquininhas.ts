import { prisma } from '../database/client'

/**
 * Maquininhas de cartão por cliente.
 *
 * São duas tabelas:
 *  - cadastro_operadoras: catálogo (Cielo, Stone, Rede...). Fica em tabela — e não em texto
 *    livre — para que os relatórios agrupem corretamente, sem "STONE" / "Stone" / "stone "
 *    virarem linhas diferentes.
 *  - cliente_maquininhas: uma linha por maquininha do cliente, já que o mesmo cliente pode
 *    ter várias, de operadoras diferentes e com status de integração distintos.
 *
 * A data de integração não é registrada aqui de propósito: quem controla o "quando" é o
 * processo de implantação no Pipeline. Aqui fica só a foto atual (integrado ou não).
 */

export const TIPOS_MAQUININHA = ['TEF', 'SMARTPOS'] as const
export const STATUS_MAQUININHA = ['NAO_INTEGRADO', 'EM_IMPLANTACAO', 'INTEGRADO'] as const

export type TipoMaquininha = (typeof TIPOS_MAQUININHA)[number]
export type StatusMaquininha = (typeof STATUS_MAQUININHA)[number]

const OPERADORAS_PADRAO = [
  'Cielo',
  'Rede',
  'GetNet',
  'Stone',
  'Ton',
  'PagBank (PagSeguro)',
  'Mercado Pago',
  'InfinitePay',
  'SumUp',
  'Turbo (Cora)',
  'Ame Digital',
  'PicPay',
  'SafraPay',
  'Sicredi',
  'Sicoob',
  'Banrisul (Vero)',
  'Bin',
  'Bradesco (Global Payments)',
  'Outra',
]

let initPromise: Promise<void> | null = null

/** Idempotente e memoizado — seguro para chamar a cada request. */
export function ensureMaquininhas(): Promise<void> {
  if (!initPromise) initPromise = initMaquininhas()
  return initPromise
}

export async function initMaquininhas(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cadastro_operadoras (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ordem         INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uniq_operadora_nome (nome),
      INDEX idx_operadora_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cliente_maquininhas (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id        INT NOT NULL,
      operadora_id      INT NOT NULL,
      tipo              VARCHAR(20) NOT NULL,
      quantidade        INT NOT NULL DEFAULT 1,
      status_integracao VARCHAR(20) NOT NULL DEFAULT 'NAO_INTEGRADO',
      observacao        VARCHAR(2000) NULL,
      criado_em         DATETIME NOT NULL DEFAULT NOW(),
      criado_por        INT NULL,
      atualizado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_por    INT NULL,
      INDEX idx_maq_cliente (cliente_id),
      INDEX idx_maq_operadora (operadora_id),
      INDEX idx_maq_tipo (tipo),
      INDEX idx_maq_status (status_integracao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Semeia o catálogo apenas uma vez (INSERT IGNORE respeita a chave única do nome).
  for (let i = 0; i < OPERADORAS_PADRAO.length; i++) {
    await prisma.$executeRaw`
      INSERT IGNORE INTO cadastro_operadoras (nome, ativo, ordem)
      VALUES (${OPERADORAS_PADRAO[i]}, 1, ${(i + 1) * 10})
    `
  }
}
