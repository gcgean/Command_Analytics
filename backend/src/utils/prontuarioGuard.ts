/**
 * Protege o prontuário do cliente (cliente.OBS_VENDA) contra sobrescritas vindas de fora
 * do sistema web — em especial o aplicativo desktop legado, que compartilha o mesmo banco
 * e historicamente trunca esse campo em 200 caracteres, apagando silenciosamente conteúdo
 * maior sem deixar rastro de auditoria.
 *
 * Mecanismo: um trigger BEFORE UPDATE no MySQL reverte qualquer alteração em OBS_VENDA
 * a menos que a sessão tenha marcado a variável @allow_obs_venda_write = 1 — marca que só
 * o endpoint PUT /clientes/:id/prontuario define, dentro de uma transação, imediatamente
 * antes do UPDATE. Qualquer outra origem (import legado, sync do desktop, script direto)
 * que altere OBS_VENDA sem passar por essa marca tem a mudança revertida pelo próprio banco.
 */

import mysql from 'mysql2/promise'
import { prisma } from '../database/client'

const TRIGGER_NAME = 'trg_protect_obs_venda'

let guardPromise: Promise<void> | null = null

/** Garante que o trigger de proteção existe — idempotente e memoizado (seguro para chamar a cada request). */
export function ensureProntuarioGuard(): Promise<void> {
  if (!guardPromise) guardPromise = initProntuarioGuard()
  return guardPromise
}

export async function initProntuarioGuard(): Promise<void> {
  const existentes = await prisma.$queryRaw<Array<{ TRIGGER_NAME: string }>>`
    SELECT TRIGGER_NAME
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE()
      AND TRIGGER_NAME = ${TRIGGER_NAME}
  `
  if (existentes.length > 0) return

  // CREATE TRIGGER com corpo composto (BEGIN...END) não é suportado no protocolo de prepared
  // statement que o Prisma usa por padrão no MySQL (erro 1295). Por isso essa única instrução
  // roda numa conexão mysql2 crua (protocolo de texto simples), fora do Prisma.
  const connection = await mysql.createConnection(process.env.DATABASE_URL as string)
  try {
    await connection.query(`
      CREATE TRIGGER ${TRIGGER_NAME}
      BEFORE UPDATE ON cliente
      FOR EACH ROW
      BEGIN
        IF NOT (NEW.OBS_VENDA <=> OLD.OBS_VENDA) THEN
          IF @allow_obs_venda_write IS NULL OR @allow_obs_venda_write <> 1 THEN
            SET NEW.OBS_VENDA = OLD.OBS_VENDA;
          END IF;
        END IF;
      END
    `)
  } finally {
    await connection.end()
  }
}
