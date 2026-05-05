import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

export async function classificacoesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Listar classificações de cliente' } }, async () => {
    const rows = await prisma.classifCliente.findMany({ orderBy: { nome: 'asc' } })
    return rows.map(r => ({ id: r.id, nome: r.nome }))
  })
}

