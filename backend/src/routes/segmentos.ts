import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

export async function segmentosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Listar segmentos' } }, async () => {
    const segmentos = await prisma.segmento.findMany({ orderBy: { descricao: 'asc' } })
    return segmentos.map(s => ({ id: s.id, descricao: s.descricao }))
  })
}

