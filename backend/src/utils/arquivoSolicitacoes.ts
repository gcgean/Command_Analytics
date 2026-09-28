import { prisma } from '../database/client'

/**
 * Arquivar é o status 14 (contrato com o Delphi). O status sozinho, porém, não diz de onde o card
 * veio — e desarquivar jogando tudo em "Em Fila" perderia a etapa em que o trabalho parou. Por
 * isso a etapa anterior fica nesta tabela à parte, sem mexer em `atendimentos`.
 */
export async function initArquivoSolicitacoes(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS atendimento_arquivado (
      atendimento_id  INT PRIMARY KEY,
      status_anterior INT NULL,
      motivo          VARCHAR(300) NULL,
      usuario_id      INT NULL,
      arquivado_em    DATETIME NOT NULL DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export async function registrarArquivamento(
  atendimentoId: number,
  statusAnterior: number | null,
  motivo: string | null,
  usuarioId: number | null,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO atendimento_arquivado (atendimento_id, status_anterior, motivo, usuario_id, arquivado_em)
    VALUES (${atendimentoId}, ${statusAnterior}, ${motivo}, ${usuarioId}, NOW())
    ON DUPLICATE KEY UPDATE status_anterior = VALUES(status_anterior), motivo = VALUES(motivo),
                            usuario_id = VALUES(usuario_id), arquivado_em = VALUES(arquivado_em)
  `
}

/** Remove o registro e devolve a etapa de onde o card saiu (null se veio do Delphi, sem registro). */
export async function consumirArquivamento(atendimentoId: number): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ status_anterior: number | null }>>`
    SELECT status_anterior FROM atendimento_arquivado WHERE atendimento_id = ${atendimentoId}
  `
  await prisma.$executeRaw`DELETE FROM atendimento_arquivado WHERE atendimento_id = ${atendimentoId}`
  const anterior = rows[0]?.status_anterior
  return anterior === null || anterior === undefined ? null : Number(anterior)
}

export type InfoArquivamento = { motivo: string | null; arquivadoEm: Date | null; usuarioNome: string | null }

/** Dados de arquivamento dos cards da aba, em uma consulta só. */
export async function infoArquivamento(ids: number[]): Promise<Map<number, InfoArquivamento>> {
  const mapa = new Map<number, InfoArquivamento>()
  if (!ids.length) return mapa
  const rows = await prisma.$queryRawUnsafe<
    Array<{ atendimento_id: number; motivo: string | null; arquivado_em: Date | null; usuario_nome: string | null }>
  >(
    `SELECT a.atendimento_id, a.motivo, a.arquivado_em,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario_nome
       FROM atendimento_arquivado a
       LEFT JOIN usuario u ON u.COD_USU = a.usuario_id
      WHERE a.atendimento_id IN (${ids.map(() => '?').join(',')})`,
    ...ids,
  )
  for (const r of rows) {
    mapa.set(Number(r.atendimento_id), {
      motivo: r.motivo,
      arquivadoEm: r.arquivado_em,
      usuarioNome: r.usuario_nome,
    })
  }
  return mapa
}
