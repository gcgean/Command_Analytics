import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// Status fechados: 7=Finalizado, 8=Cancelado, 14=Finalizado confirmado
const STATUS_FECHADOS = [7, 8, 14]

const nomeTecnico = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

export async function atendimentosRoutes(app: FastifyInstance) {
  // GET /atendimentos — listagem paginada (163K registros!)
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'], summary: 'Listar atendimentos (paginado)' } }, async (request) => {
    const {
      status,
      departamento,
      tecnicoId,
      clienteId,
      prioridade,
      dataInicio,
      dataFim,
      page,
      limit,
      abertos,
    } = request.query as Record<string, string>

    const take = Math.min(Number(limit) || 50, 500)
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take

    const where: Record<string, any> = {}

    if (status !== undefined) where.status = Number(status)
    if (departamento !== undefined) where.departamento = Number(departamento)
    if (tecnicoId) where.tecnicoId = Number(tecnicoId)
    if (clienteId) where.clienteId = Number(clienteId)
    if (prioridade) where.prioridade = prioridade
    if (abertos === 'true') where.status = { notIn: STATUS_FECHADOS }

    if (dataInicio || dataFim) {
      where.dataAbertura = {}
      if (dataInicio) where.dataAbertura.gte = new Date(dataInicio)
      if (dataFim) {
        const fim = new Date(dataFim)
        fim.setDate(fim.getDate() + 1)
        where.dataAbertura.lt = fim
      }
    }

    const [total, items] = await Promise.all([
      prisma.atendimento.count({ where }),
      prisma.atendimento.findMany({
        where,
        include: {
          cliente: { select: { id: true, nome: true } },
          tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
        },
        orderBy: { dataAbertura: 'desc' },
        take,
        skip,
      }),
    ])

    return {
      total,
      page: Math.max(Number(page) || 1, 1),
      limit: take,
      pages: Math.ceil(total / take),
      data: items.map(({ cliente, tecnico, ...a }) => ({
        ...a,
        clienteNome: cliente?.nome ?? '',
        tecnicoNome: nomeTecnico(tecnico),
      })),
    }
  })

  // GET /atendimentos/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const item = await prisma.atendimento.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: { select: { id: true, nome: true } },
        tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
      },
    })
    if (!item) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    const { cliente, tecnico, ...rest } = item
    return { ...rest, clienteNome: cliente?.nome ?? '', tecnicoNome: nomeTecnico(tecnico) }
  })

  // POST /atendimentos
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataAbertura) body.dataAbertura = new Date()
    const item = await prisma.atendimento.create({ data: body as never })
    return reply.status(201).send(item)
  })

  // PUT /atendimentos/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.atendimento.update({ where: { id: Number(id) }, data: body as never })
  })

  // PATCH /atendimentos/:id/status
  app.patch('/:id/status', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'], summary: 'Atualizar status do atendimento' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { status, solucao, dataFechamento } = request.body as {
      status: number
      solucao?: string
      dataFechamento?: string
    }
    const data: Record<string, any> = { status }
    if (solucao !== undefined) data.solucao = solucao
    if (dataFechamento !== undefined) data.dataFechamento = new Date(dataFechamento)
    // Auto-preencher dataFechamento ao fechar
    if (STATUS_FECHADOS.includes(status) && !dataFechamento) {
      data.dataFechamento = new Date()
    }
    return prisma.atendimento.update({ where: { id: Number(id) }, data })
  })

  // GET /atendimentos/resumo/hoje — contagens úteis
  app.get('/resumo/hoje', { preHandler: authMiddleware, schema: { tags: ['Atendimentos'], summary: 'Resumo do dia' } }, async () => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)

    const [hoje_total, abertos, urgentes] = await Promise.all([
      prisma.atendimento.count({ where: { dataAbertura: { gte: hoje, lt: amanha } } }),
      prisma.atendimento.count({ where: { status: { notIn: STATUS_FECHADOS } } }),
      prisma.atendimento.count({ where: { prioridade: 'A', status: { notIn: STATUS_FECHADOS } } }),
    ])

    return { hoje: hoje_total, abertos, urgentes }
  })
}
