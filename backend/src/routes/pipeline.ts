import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// Mapeamento de etapas (status int → descrição)
const ETAPAS: Record<number, string> = {
  1: 'Aguardando início',
  2: 'Em andamento',
  3: 'Treinamento',
  4: 'Homologação',
  5: 'Concluído',
  6: 'Cancelado',
}

function fmt(p: any) {
  return {
    id: p.id,
    clienteId: p.clienteId,
    clienteNome: p.cliente?.nome ?? '',
    etapa: p.etapa,
    etapaDescricao: ETAPAS[p.etapa] ?? `Etapa ${p.etapa}`,
    // responsavelId é id_negocio (FK quebrada — mantido como int simples)
    responsavelId: p.responsavelId,
    observacoes: p.observacoes,
  }
}

export async function pipelineRoutes(app: FastifyInstance) {
  // GET /pipeline
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async (request) => {
    const { etapa, clienteId } = request.query as Record<string, string>

    const items = await prisma.pipelineItem.findMany({
      where: {
        ...(etapa !== undefined && { etapa: Number(etapa) }),
        ...(clienteId && { clienteId: Number(clienteId) }),
      },
      include: {
        cliente: { select: { id: true, nome: true, uf: true, cidade: true } },
      },
      orderBy: [{ etapa: 'asc' }, { clienteId: 'asc' }],
    })

    return items.map(fmt)
  })

  // GET /pipeline/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const item = await prisma.pipelineItem.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: { select: { id: true, nome: true, uf: true, cidade: true } },
      },
    })
    if (!item) return reply.status(404).send({ error: 'Item de pipeline não encontrado.' })
    return fmt(item)
  })

  // POST /pipeline
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const item = await prisma.pipelineItem.create({
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send(fmt(item))
  })

  // PUT /pipeline/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const item = await prisma.pipelineItem.update({
      where: { id: Number(id) },
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return fmt(item)
  })

  // PATCH /pipeline/:id/etapa — avançar/retroceder etapa
  app.patch('/:id/etapa', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Atualizar etapa do item' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { etapa, observacoes } = request.body as { etapa: number; observacoes?: string }
    const data: Record<string, any> = { etapa }
    if (observacoes !== undefined) data.observacoes = observacoes
    const item = await prisma.pipelineItem.update({
      where: { id: Number(id) },
      data,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return fmt(item)
  })

  // DELETE /pipeline/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.pipelineItem.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // GET /pipeline/resumo/etapas — contagem por etapa
  app.get('/resumo/etapas', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Contagem por etapa' } }, async () => {
    const agrupado = await prisma.pipelineItem.groupBy({
      by: ['etapa'],
      _count: { id: true },
      orderBy: { etapa: 'asc' },
    })
    return agrupado.map(a => ({
      etapa: a.etapa,
      etapaDescricao: ETAPAS[a.etapa ?? 0] ?? `Etapa ${a.etapa}`,
      count: a._count.id,
    }))
  })
}
