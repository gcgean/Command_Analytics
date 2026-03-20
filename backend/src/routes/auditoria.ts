import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

export async function auditoriaRoutes(app: FastifyInstance) {
  // GET /auditoria?tabela=agenda&registroId=123
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Auditoria'] } }, async (request, reply) => {
    const { tabela, registroId } = request.query as Record<string, string>

    if (!tabela || !registroId) {
      return reply.status(400).send({ error: 'tabela e registroId são obrigatórios' })
    }

    const rows: any[] = await prisma.$queryRaw`
      SELECT
        a.id,
        a.tabela,
        a.registro_id      AS registroId,
        a.acao,
        a.usuario_id       AS usuarioId,
        a.usuario_nome     AS usuarioNome,
        a.dados_antes      AS dadosAntes,
        a.dados_depois     AS dadosDepois,
        a.campos_alterados AS camposAlterados,
        a.criado_em        AS criadoEm
      FROM auditoria a
      WHERE a.tabela = ${tabela} AND a.registro_id = ${Number(registroId)}
      ORDER BY a.criado_em ASC
    `

    return rows.map(r => ({
      id:              Number(r.id),
      tabela:          r.tabela,
      registroId:      Number(r.registroId),
      acao:            r.acao,
      usuarioId:       r.usuarioId != null ? Number(r.usuarioId) : null,
      usuarioNome:     r.usuarioNome ?? null,
      dadosAntes:      r.dadosAntes      ? JSON.parse(r.dadosAntes)      : null,
      dadosDepois:     r.dadosDepois     ? JSON.parse(r.dadosDepois)     : null,
      camposAlterados: r.camposAlterados ? JSON.parse(r.camposAlterados) : null,
      criadoEm:        r.criadoEm,
    }))
  })
}
