import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

const nomeUsuario = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

export async function crmRoutes(app: FastifyInstance) {
  // ── Negócios ──────────────────────────────────────────────

  // GET /crm/negocios
  app.get('/negocios', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { status, responsavelId, funilId, clienteId } = request.query as Record<string, string>

    const negocios = await prisma.negocio.findMany({
      where: {
        ...(status !== undefined && { status: Number(status) }),
        ...(responsavelId && { responsavelId: Number(responsavelId) }),
        ...(funilId && { funilId: Number(funilId) }),
        ...(clienteId && { clienteId: Number(clienteId) }),
      },
      include: {
        responsavel: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
      },
      orderBy: { dataCriacao: 'desc' },
    })

    return negocios.map(({ responsavel, ...n }) => ({
      ...n,
      responsavelNome: nomeUsuario(responsavel),
    }))
  })

  // GET /crm/negocios/:id
  app.get('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const negocio = await prisma.negocio.findUnique({
      where: { id: Number(id) },
      include: {
        responsavel: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
      },
    })
    if (!negocio) return reply.status(404).send({ error: 'Negócio não encontrado.' })
    const { responsavel, ...rest } = negocio
    return { ...rest, responsavelNome: nomeUsuario(responsavel) }
  })

  // POST /crm/negocios
  app.post('/negocios', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataCriacao) body.dataCriacao = new Date()
    const item = await prisma.negocio.create({ data: body as never })
    return reply.status(201).send(item)
  })

  // PUT /crm/negocios/:id
  app.put('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.negocio.update({ where: { id: Number(id) }, data: body as never })
  })

  // PATCH /crm/negocios/:id/status
  app.patch('/negocios/:id/status', { preHandler: authMiddleware, schema: { tags: ['CRM'], summary: 'Atualizar status do negócio' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { status, dataFechamento } = request.body as { status: number; dataFechamento?: string }
    const data: Record<string, any> = { status }
    if (dataFechamento) data.dataFechamento = new Date(dataFechamento)
    return prisma.negocio.update({ where: { id: Number(id) }, data })
  })

  // DELETE /crm/negocios/:id
  app.delete('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.negocio.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── Leads ─────────────────────────────────────────────────

  // GET /crm/leads
  app.get('/leads', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { segmento, cidade, search } = request.query as Record<string, string>

    return prisma.lead.findMany({
      where: {
        ...(segmento && { segmento }),
        ...(cidade && { cidade }),
        ...(search && {
          OR: [
            { nome: { contains: search } },
            { empresa: { contains: search } },
          ],
        }),
      },
      orderBy: { dataCadastro: 'desc' },
    })
  })

  // GET /crm/leads/:id
  app.get('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const lead = await prisma.lead.findUnique({ where: { id: Number(id) } })
    if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' })
    return lead
  })

  // POST /crm/leads
  app.post('/leads', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataCadastro) body.dataCadastro = new Date()
    const lead = await prisma.lead.create({ data: body as never })
    return reply.status(201).send(lead)
  })

  // PUT /crm/leads/:id
  app.put('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.lead.update({ where: { id: Number(id) }, data: body as never })
  })

  // DELETE /crm/leads/:id
  app.delete('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.lead.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── KPIs CRM ──────────────────────────────────────────────

  // GET /crm/resumo
  app.get('/resumo', { preHandler: authMiddleware, schema: { tags: ['CRM'], summary: 'Resumo CRM' } }, async () => {
    const [totalNegocios, totalLeads, negociosAbertos, negociosFechados] = await Promise.all([
      prisma.negocio.count(),
      prisma.lead.count(),
      prisma.negocio.count({ where: { status: { notIn: [2, 3] } } }), // assumindo 2=ganho, 3=perdido
      prisma.negocio.count({ where: { status: { in: [2, 3] } } }),
    ])
    return { totalNegocios, totalLeads, negociosAbertos, negociosFechados }
  })
}
