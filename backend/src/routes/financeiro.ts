import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

const nomeUsuario = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

export async function financeiroRoutes(app: FastifyInstance) {
  // ── Comissões ─────────────────────────────────────────────

  // GET /financeiro/comissoes
  app.get('/comissoes', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request) => {
    const { vendedorId, clienteId, dataInicio, dataFim } = request.query as Record<string, string>

    const where: Record<string, any> = {}
    if (vendedorId) where.vendedorId = Number(vendedorId)
    if (clienteId) where.clienteId = Number(clienteId)
    if (dataInicio || dataFim) {
      where.dataVenda = {}
      if (dataInicio) where.dataVenda.gte = new Date(dataInicio)
      if (dataFim) {
        const fim = new Date(dataFim)
        fim.setDate(fim.getDate() + 1)
        where.dataVenda.lt = fim
      }
    }

    const comissoes = await prisma.comissao.findMany({
      where,
      include: {
        vendedor: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
        cliente: { select: { id: true, nome: true } },
      },
      orderBy: { dataVenda: 'desc' },
    })

    return comissoes.map(({ vendedor, cliente, ...c }) => ({
      ...c,
      vendedorNome: nomeUsuario(vendedor),
      clienteNome: cliente?.nome ?? '',
    }))
  })

  // GET /financeiro/comissoes/:id
  app.get('/comissoes/:id', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const comissao = await prisma.comissao.findUnique({
      where: { id: Number(id) },
      include: {
        vendedor: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
        cliente: { select: { id: true, nome: true } },
      },
    })
    if (!comissao) return reply.status(404).send({ error: 'Comissão não encontrada.' })
    const { vendedor, cliente, ...rest } = comissao
    return { ...rest, vendedorNome: nomeUsuario(vendedor), clienteNome: cliente?.nome ?? '' }
  })

  // POST /financeiro/comissoes
  app.post('/comissoes', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataVenda) body.dataVenda = new Date()
    const item = await prisma.comissao.create({ data: body as never })
    return reply.status(201).send(item)
  })

  // PUT /financeiro/comissoes/:id
  app.put('/comissoes/:id', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.comissao.update({ where: { id: Number(id) }, data: body as never })
  })

  // DELETE /financeiro/comissoes/:id
  app.delete('/comissoes/:id', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.comissao.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── MRR ───────────────────────────────────────────────────

  // GET /financeiro/mrr — MRR atual baseado em mensalidades dos clientes ativos
  app.get('/mrr', { preHandler: authMiddleware, schema: { tags: ['Financeiro'], summary: 'MRR atual' } }, async () => {
    const [mrrResult, totalClientes, totalInativos] = await Promise.all([
      prisma.cliente.aggregate({
        where: { ativo: 'S' },
        _sum: { mensalidade: true },
      }),
      prisma.cliente.count({ where: { ativo: 'S', bloqueado: 'N' } }),
      prisma.cliente.count({ where: { ativo: 'N' } }),
    ])
    const mrr = Number(mrrResult._sum.mensalidade ?? 0)
    const ticketMedio = totalClientes > 0 ? mrr / totalClientes : 0
    return {
      mrr,
      totalClientes,
      totalInativos,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
    }
  })

  // ── Assinaturas ───────────────────────────────────────────

  // GET /financeiro/assinaturas
  app.get('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request) => {
    const { clienteId, formaPagamento, status } = request.query as Record<string, string>

    return prisma.assinatura.findMany({
      where: {
        ...(clienteId && { clienteId: Number(clienteId) }),
        ...(formaPagamento !== undefined && { formaPagamento: Number(formaPagamento) }),
        ...(status && { status }),
      },
      include: {
        cliente: { select: { id: true, nome: true } },
      },
      orderBy: { dataCriacao: 'desc' },
    })
  })

  // POST /financeiro/assinaturas
  app.post('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const item = await prisma.assinatura.create({ data: body as never })
    return reply.status(201).send(item)
  })

  // PUT /financeiro/assinaturas/:id
  app.put('/assinaturas/:id', { preHandler: authMiddleware, schema: { tags: ['Financeiro'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.assinatura.update({ where: { id: Number(id) }, data: body as never })
  })

  // ── Análise de rentabilidade por cliente ──────────────────

  // GET /financeiro/analise
  app.get('/analise', { preHandler: authMiddleware, schema: { tags: ['Financeiro'], summary: 'Rentabilidade por cliente' } }, async () => {
    // Taxa estimada por minuto de atendimento (R$ 80/h)
    const CUSTO_POR_MINUTO = 80 / 60
    const CUSTO_FIXO_PERC = 0.10  // 10% da mensalidade como custo fixo

    // Últimos 30 dias
    const dataCorte = new Date()
    dataCorte.setDate(dataCorte.getDate() - 30)

    // Clientes ativos com mensalidade > 0 (top 50 por mensalidade)
    const clientes = await prisma.cliente.findMany({
      where: { ativo: 'S', mensalidade: { gt: 0 } },
      select: { id: true, nome: true, nomeRazao: true, mensalidade: true },
      orderBy: { mensalidade: 'desc' },
      take: 50,
    })

    if (clientes.length === 0) return []

    const clienteIds = clientes.map(c => c.id)

    // Agrega atendimentos dos últimos 30 dias por cliente
    const atendGrupo = await prisma.atendimento.groupBy({
      by: ['clienteId'],
      where: { clienteId: { in: clienteIds }, dataAbertura: { gte: dataCorte } },
      _count: { id: true },
      _sum: { tempoAtendimento: true },
    })

    const atendMap = Object.fromEntries(
      atendGrupo.map(g => [g.clienteId, { count: g._count.id, minutos: Number(g._sum.tempoAtendimento ?? 0) }])
    )

    return clientes.map(c => {
      const mensalidade = Number(c.mensalidade ?? 0)
      const atend = atendMap[c.id] ?? { count: 0, minutos: 0 }
      const custoSuporte = Math.round(atend.minutos * CUSTO_POR_MINUTO * 100) / 100
      const custoFixo = Math.round(mensalidade * CUSTO_FIXO_PERC * 100) / 100
      const custoDev = 0
      const margemValor = Math.round((mensalidade - custoSuporte - custoDev - custoFixo) * 100) / 100
      const margemPercent = mensalidade > 0 ? Math.round((margemValor / mensalidade) * 1000) / 10 : 0
      return {
        clienteId: c.id,
        clienteNome: c.nome ?? c.nomeRazao ?? `Cliente #${c.id}`,
        mensalidade,
        custoSuporte,
        custoDev,
        custoFixo,
        margemValor,
        margemPercent,
      }
    })
  })

  // ── Comissões por vendedor (resumo) ───────────────────────

  // GET /financeiro/comissoes-resumo
  app.get('/comissoes-resumo', { preHandler: authMiddleware, schema: { tags: ['Financeiro'], summary: 'Total de comissões por vendedor' } }, async () => {
    const agrupado = await prisma.comissao.groupBy({
      by: ['vendedorId'],
      _sum: { valor: true, valorOperacao: true },
      _count: { id: true },
    })

    const ids = agrupado.map(a => a.vendedorId).filter(Boolean) as number[]
    const usuarios = await prisma.usuario.findMany({
      where: { id: { in: ids } },
      select: { id: true, nomeUsu: true, nomeCompleto: true },
    })
    const nomePorId = Object.fromEntries(
      usuarios.map(u => [u.id, u.nomeCompleto || u.nomeUsu || 'Usuário'])
    )

    return agrupado.map(a => ({
      vendedorId: a.vendedorId,
      vendedorNome: a.vendedorId ? (nomePorId[a.vendedorId] ?? 'Desconhecido') : 'Desconhecido',
      totalComissao: Number(a._sum.valor ?? 0),
      totalOperacao: Number(a._sum.valorOperacao ?? 0),
      quantidade: a._count.id,
    }))
  })
}
