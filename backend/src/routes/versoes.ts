import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

function fmt(v: any) {
  return {
    id: v.id,
    sistemaId: v.sistemaId,
    softwareName: v.sistema?.descricao ?? v.sistema?.nome ?? null,
    versao: v.versao,
    obrigatoria: v.obrigatoria,
    beta: v.beta,
    data: v.data,
    notas: v.notas ?? [],
  }
}

export async function versoesRoutes(app: FastifyInstance) {
  // GET /versoes
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Versões'] } }, async (request) => {
    const { sistemaId, beta, obrigatoria } = request.query as Record<string, string>

    const versoes = await prisma.versao.findMany({
      where: {
        ...(sistemaId && { sistemaId: Number(sistemaId) }),
        ...(beta !== undefined && { beta: Number(beta) }),
        ...(obrigatoria !== undefined && { obrigatoria }),
      },
      include: {
        sistema: true,
        notas: { orderBy: { id: 'asc' } },
      },
      orderBy: { data: 'desc' },
    })

    return versoes.map(fmt)
  })

  // GET /versoes/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Versões'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const versao = await prisma.versao.findUnique({
      where: { id: Number(id) },
      include: {
        sistema: true,
        notas: { orderBy: { id: 'asc' } },
      },
    })
    if (!versao) return reply.status(404).send({ error: 'Versão não encontrada.' })
    return fmt(versao)
  })

  // POST /versoes
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Versões'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.data) body.data = new Date()
    const versao = await prisma.versao.create({
      data: body as never,
      include: {
        sistema: true,
        notas: true,
      },
    })
    return reply.status(201).send(fmt(versao))
  })

  // PUT /versoes/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Versões'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const versao = await prisma.versao.update({
      where: { id: Number(id) },
      data: body as never,
      include: {
        sistema: true,
        notas: true,
      },
    })
    return fmt(versao)
  })

  // DELETE /versoes/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Versões'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.versao.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── Notas de versão ──────────────────────────────────────

  // POST /versoes/:id/notas
  app.post('/:id/notas', { preHandler: authMiddleware, schema: { tags: ['Versões'], summary: 'Adicionar nota de versão' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const nota = await prisma.notaVersao.create({
      data: { ...body, versaoId: Number(id) } as never,
    })
    return reply.status(201).send(nota)
  })

  // DELETE /versoes/notas/:notaId
  app.delete('/notas/:notaId', { preHandler: authMiddleware, schema: { tags: ['Versões'], summary: 'Remover nota de versão' } }, async (request, reply) => {
    const { notaId } = request.params as { notaId: string }
    await prisma.notaVersao.delete({ where: { id: Number(notaId) } })
    return reply.status(204).send()
  })

  // GET /versoes/sistemas/lista — listar softwares disponíveis
  app.get('/sistemas/lista', { preHandler: authMiddleware, schema: { tags: ['Versões'], summary: 'Listar sistemas/softwares' } }, async () => {
    return prisma.software.findMany({ orderBy: { descricao: 'asc' } })
  })
}
