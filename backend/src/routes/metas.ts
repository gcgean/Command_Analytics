import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'

/**
 * NOTA: Os modelos Meta e AvaliacaoNPS foram removidos do schema Prisma
 * durante a migração SQLite → MySQL. Estas rotas retornam dados vazios/mock
 * até que as tabelas correspondentes sejam recriadas ou substituídas.
 */
export async function metasRoutes(app: FastifyInstance) {
  // GET /metas
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Metas'], summary: '[DESABILITADO] Metas removidas do schema' } }, async () => {
    return []
  })

  // POST /metas
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Metas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de metas não disponível. Modelo Meta removido do schema.' })
  })

  // PUT /metas/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Metas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de metas não disponível. Modelo Meta removido do schema.' })
  })

  // GET /metas/nps
  app.get('/nps', { preHandler: authMiddleware, schema: { tags: ['Metas'], summary: '[DESABILITADO] NPS removido do schema' } }, async () => {
    return []
  })

  // POST /metas/nps
  app.post('/nps', { preHandler: authMiddleware, schema: { tags: ['Metas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo NPS não disponível. Modelo AvaliacaoNPS removido do schema.' })
  })

  // GET /metas/nps/kpi
  app.get('/nps/kpi', { preHandler: authMiddleware, schema: { tags: ['Metas'], summary: '[DESABILITADO] KPI NPS removido do schema' } }, async () => {
    return { nps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0, mediaNotas: 0 }
  })
}
