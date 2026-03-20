import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// prioridade: 'A'=Alta, 'B'=Média, 'C'=Baixa
const PRIORIDADE_LABEL: Record<string, string> = {
  A: 'Alta',
  B: 'Média',
  C: 'Baixa',
}

function fmt(t: any) {
  return {
    id: t.id,
    descricao: t.descricao,
    clienteId: t.clienteId,
    clienteNome: t.cliente?.nome ?? null,
    softwareId: t.softwareId,
    segmentoId: t.segmentoId,
    prioridade: t.prioridade,
    prioridadeLabel: PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade,
    percentualConclusao: t.percentualConclusao,
    status: t.status,
    dataInicial: t.dataInicial,
    dataFinal: t.dataFinal,
    isBug: t.isBug,
  }
}

export async function tarefasRoutes(app: FastifyInstance) {
  // GET /tarefas
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Tarefas'] } }, async (request) => {
    const { status, prioridade, softwareId, segmentoId, isBug, clienteId } = request.query as Record<string, string>

    const tarefas = await prisma.tarefa.findMany({
      where: {
        ...(status !== undefined && { status: Number(status) }),
        ...(prioridade && { prioridade }),
        ...(softwareId && { softwareId: Number(softwareId) }),
        ...(segmentoId && { segmentoId: Number(segmentoId) }),
        ...(clienteId && { clienteId: Number(clienteId) }),
        ...(isBug !== undefined && { isBug: isBug === 'true' }),
      },
      include: {
        cliente: { select: { id: true, nome: true } },
      },
      orderBy: [{ prioridade: 'asc' }, { dataFinal: 'asc' }],
    })

    return tarefas.map(fmt)
  })

  // GET /tarefas/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Tarefas'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tarefa = await prisma.tarefa.findUnique({
      where: { id: Number(id) },
      include: { cliente: { select: { id: true, nome: true } } },
    })
    if (!tarefa) return reply.status(404).send({ error: 'Tarefa não encontrada.' })
    return fmt(tarefa)
  })

  // POST /tarefas
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Tarefas'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const tarefa = await prisma.tarefa.create({
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send(fmt(tarefa))
  })

  // PUT /tarefas/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Tarefas'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const tarefa = await prisma.tarefa.update({
      where: { id: Number(id) },
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return fmt(tarefa)
  })

  // PATCH /tarefas/:id/progresso — atualizar percentual e status
  app.patch('/:id/progresso', { preHandler: authMiddleware, schema: { tags: ['Tarefas'], summary: 'Atualizar progresso da tarefa' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { percentualConclusao, status } = request.body as { percentualConclusao?: number; status?: number }
    const data: Record<string, any> = {}
    if (percentualConclusao !== undefined) data.percentualConclusao = percentualConclusao
    if (status !== undefined) data.status = status
    const tarefa = await prisma.tarefa.update({
      where: { id: Number(id) },
      data,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return fmt(tarefa)
  })

  // PATCH /tarefas/:id/prioridade — alterar prioridade
  app.patch('/:id/prioridade', { preHandler: authMiddleware, schema: { tags: ['Tarefas'], summary: 'Alterar prioridade da tarefa' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { prioridade } = request.body as { prioridade: string }
    const tarefa = await prisma.tarefa.update({
      where: { id: Number(id) },
      data: { prioridade },
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return fmt(tarefa)
  })

  // DELETE /tarefas/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Tarefas'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.tarefa.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // GET /tarefas/resumo/status — contagem por status
  app.get('/resumo/status', { preHandler: authMiddleware, schema: { tags: ['Tarefas'], summary: 'Contagem de tarefas por status' } }, async () => {
    const agrupado = await prisma.tarefa.groupBy({
      by: ['status'],
      _count: { id: true },
    })
    return agrupado.map(a => ({ status: a.status, count: a._count.id }))
  })
}
