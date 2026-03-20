/**
 * Utilitário de auditoria — padrão do projeto.
 * Registra criação, alteração, exclusão e mudança de status de qualquer registro.
 *
 * Pré-requisito: tabela `auditoria` criada no banco:
 *
 * CREATE TABLE IF NOT EXISTS auditoria (
 *   id              INT AUTO_INCREMENT PRIMARY KEY,
 *   tabela          VARCHAR(100) NOT NULL,
 *   registro_id     INT NOT NULL,
 *   acao            VARCHAR(20) NOT NULL,
 *   usuario_id      INT NULL,
 *   usuario_nome    VARCHAR(200) NULL,
 *   dados_antes     TEXT NULL,
 *   dados_depois    TEXT NULL,
 *   campos_alterados TEXT NULL,
 *   criado_em       DATETIME NOT NULL DEFAULT NOW(),
 *   INDEX idx_tabela_registro (tabela, registro_id)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 */

import { prisma } from '../database/client'

export type AcaoAuditoria = 'CRIACAO' | 'ALTERACAO' | 'EXCLUSAO' | 'STATUS'

/** Cria a tabela auditoria se ainda não existir. Chamado na inicialização do servidor. */
export async function initAuditoria(): Promise<void> {
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
}

export async function registrarAuditoria({
  tabela,
  registroId,
  acao,
  usuarioId,
  dadosAntes,
  dadosDepois,
}: {
  tabela: string
  registroId: number
  acao: AcaoAuditoria
  usuarioId?: number | null
  dadosAntes?: Record<string, any> | null
  dadosDepois?: Record<string, any> | null
}): Promise<void> {
  try {
    // Compute which fields actually changed
    let camposAlterados: string[] | null = null
    if (dadosAntes && dadosDepois) {
      const allKeys = new Set([...Object.keys(dadosAntes), ...Object.keys(dadosDepois)])
      camposAlterados = [...allKeys].filter(
        k => JSON.stringify(dadosAntes[k]) !== JSON.stringify(dadosDepois[k])
      )
    }

    // Lookup user name
    let usuarioNome: string | null = null
    if (usuarioId) {
      const rows: any[] = await prisma.$queryRaw`
        SELECT COALESCE(NOME_USUARIO_COMPLETO, NOME_USU) AS nome FROM usuario WHERE COD_USU = ${usuarioId}
      `
      usuarioNome = rows[0]?.nome ?? null
    }

    const antes = dadosAntes != null ? JSON.stringify(dadosAntes) : null
    const depois = dadosDepois != null ? JSON.stringify(dadosDepois) : null
    const campos = camposAlterados?.length ? JSON.stringify(camposAlterados) : null

    await prisma.$executeRaw`
      INSERT INTO auditoria (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois, campos_alterados, criado_em)
      VALUES (${tabela}, ${registroId}, ${acao}, ${usuarioId ?? null}, ${usuarioNome}, ${antes}, ${depois}, ${campos}, NOW())
    `
  } catch {
    // Audit must never break the main operation
  }
}
