import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

export async function planosRoutes(app: FastifyInstance) {
  // GET /planos
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { sistemaId, tipo, todos } = request.query as Record<string, string>
    return prisma.plano.findMany({
      where: {
        ...(todos !== 'true' && { ativo: true }),
        ...(sistemaId && { sistemaId: Number(sistemaId) }),
        ...(tipo !== undefined && tipo !== '' && { tipo: Number(tipo) }),
      },
      orderBy: { valor: 'asc' },
    })
  })

  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const plano = await prisma.plano.findUnique({ where: { id: Number(id) } })
    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado.' })
    return plano
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const plano = await prisma.plano.create({ data: body as never })
    return reply.status(201).send(plano)
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.plano.update({ where: { id: Number(id) }, data: body as never })
  })

  // GET /planos/assinaturas
  app.get('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { clienteId } = request.query as Record<string, string>
    return prisma.assinatura.findMany({
      where: { ...(clienteId && { clienteId: Number(clienteId) }) },
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: { clienteId: 'asc' },
      take: 100,
    })
  })

  app.post('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const assinatura = await prisma.assinatura.create({ data: body as never })
    return reply.status(201).send(assinatura)
  })

  app.put('/assinaturas/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.assinatura.update({ where: { id: Number(id) }, data: body as never })
  })
}
