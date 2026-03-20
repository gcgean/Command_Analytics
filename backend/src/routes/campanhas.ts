import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'

/**
 * NOTA: O modelo Campanha foi removido do schema Prisma
 * durante a migração SQLite → MySQL. Estas rotas retornam dados vazios
 * até que a tabela correspondente seja recriada ou substituída.
 */
export async function campanhasRoutes(app: FastifyInstance) {
  // GET /campanhas
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: '[DESABILITADO] Campanhas removidas do schema' } }, async () => {
    return []
  })

  // POST /campanhas
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Campanhas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de campanhas não disponível. Modelo Campanha removido do schema.' })
  })

  // PUT /campanhas/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Campanhas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de campanhas não disponível. Modelo Campanha removido do schema.' })
  })

  // PATCH /campanhas/:id/toggle
  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Campanhas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de campanhas não disponível. Modelo Campanha removido do schema.' })
  })

  // POST /campanhas/:id/visualizar
  app.post('/:id/visualizar', { preHandler: authMiddleware, schema: { tags: ['Campanhas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de campanhas não disponível. Modelo Campanha removido do schema.' })
  })

  // DELETE /campanhas/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Campanhas'] } }, async (_request, reply) => {
    return reply.status(503).send({ error: 'Módulo de campanhas não disponível. Modelo Campanha removido do schema.' })
  })
}
