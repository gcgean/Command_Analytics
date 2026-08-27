import { prisma } from '../database/client'

let ensurePromise: Promise<void> | null = null

export function ensureConfiguracaoIA(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS configuracao_ia (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          ativo        TINYINT(1) NOT NULL DEFAULT 1,
          provedor     VARCHAR(30) NOT NULL DEFAULT 'deepseek',
          modelo       VARCHAR(50) NOT NULL DEFAULT 'deepseek-chat',
          api_key      VARCHAR(255) NULL,
          data_criacao DATETIME NOT NULL DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    })()
  }
  return ensurePromise
}

export const MODELOS_DEEPSEEK = ['deepseek-chat', 'deepseek-reasoner'] as const

/**
 * Config efetiva do assistente: prioriza o que está salvo no banco (editável pela tela de
 * Configurações), cai pro .env só se não houver linha na tabela ainda — assim quem já tinha o
 * .env configurado continua funcionando sem precisar mexer em nada depois desse deploy.
 */
export async function obterConfigIA(): Promise<{ ativo: boolean; apiKey: string | null; modelo: string }> {
  await ensureConfiguracaoIA()
  const config = await prisma.configuracaoIA.findFirst()
  if (config) {
    return {
      ativo: config.ativo,
      apiKey: config.apiKey || process.env.DEEPSEEK_API_KEY || null,
      modelo: config.modelo || process.env.IA_MODELO || 'deepseek-chat',
    }
  }
  return {
    ativo: true,
    apiKey: process.env.DEEPSEEK_API_KEY || null,
    modelo: process.env.IA_MODELO || 'deepseek-chat',
  }
}
