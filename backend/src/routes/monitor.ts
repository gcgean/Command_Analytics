import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'

/**
 * NOTA: O modelo MonitorAtendimento foi removido do schema Prisma
 * durante a migração SQLite → MySQL. Estas rotas retornam dados vazios
 * até que a tabela correspondente seja recriada ou substituída.
 */
export async function monitorRoutes(app: FastifyInstance) {
  // GET /monitor
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Monitor'], summary: '[DESABILITADO] Monitor removido do schema' } }, async () => {
    return []
  })

  // POST /monitor
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Monitor'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de monitor não disponível. Modelo MonitorAtendimento removido do schema.' })
  })

  // PATCH /monitor/:id/status
  app.patch('/:id/status', { preHandler: authMiddleware, schema: { tags: ['Monitor'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de monitor não disponível. Modelo MonitorAtendimento removido do schema.' })
  })

  // PATCH /monitor/:id/tempo
  app.patch('/:id/tempo', { preHandler: authMiddleware, schema: { tags: ['Monitor'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de monitor não disponível. Modelo MonitorAtendimento removido do schema.' })
  })
}
