import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

function fmt(c: any) {
  return {
    id: c.id,
    nome: c.nome,
    nomeRazao: c.nomeRazao,
    cnpj: c.cnpj,
    cidade: c.cidade,
    uf: c.uf,
    telefone: c.telefone,
    email: c.email,
    ativo: c.ativo,
    bloqueado: c.bloqueado,
    curvaABC: c.curvaABC,
    mensalidade: c.mensalidade,
    dataContrato: c.dataContrato,
    responsavel: c.responsavel,
    idSegmento: c.idSegmento,
    idRegime: c.idRegime,
    idPlano: c.idPlano,
    contadorId: c.contadorId,
    observacoes: c.observacoes,
    // Contador embutido se incluído
    contador: c.contador
      ? {
          id: c.contador.id,
          nome: c.contador.nome,
          nomeComercial: c.contador.nomeComercial,
          email: c.contador.email,
          telefone: c.contador.telefone,
        }
      : undefined,
  }
}

export async function clientesRoutes(app: FastifyInstance) {
  // GET /clientes
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Listar clientes' } }, async (request) => {
    const { ativo, bloqueado, curvaABC, search, idSegmento, idRegime, idPlano, page, limit } = request.query as Record<string, string>

    const where = {
      ...(ativo !== undefined && { ativo }),
      ...(bloqueado !== undefined && { bloqueado }),
      ...(curvaABC && { curvaABC }),
      ...(search && { nome: { contains: search } }),
      ...(idSegmento && { idSegmento: Number(idSegmento) }),
      ...(idRegime && { idRegime: Number(idRegime) }),
      ...(idPlano && { idPlano: Number(idPlano) }),
    }

    const pg = page ? Math.max(Number(page), 1) : undefined
    const lm = limit ? Math.max(Number(limit), 1) : undefined

    if (pg && lm) {
      const total = await prisma.cliente.count({ where })
      const pages = Math.max(Math.ceil(total / lm), 1)
      const data = await prisma.cliente.findMany({
        where,
        include: {
          contador: {
            select: { id: true, nome: true, nomeComercial: true, email: true, telefone: true },
          },
        },
        orderBy: { nome: 'asc' },
        skip: (pg - 1) * lm,
        take: lm,
      })
      return { total, page: pg, limit: lm, pages, data: data.map(fmt) }
    }

    const clientes = await prisma.cliente.findMany({
      where,
      include: {
        contador: {
          select: { id: true, nome: true, nomeComercial: true, email: true, telefone: true },
        },
      },
      orderBy: { nome: 'asc' },
    })
    return clientes.map(fmt)
  })

  // GET /clientes/ativos — atalho para clientes ativos e não bloqueados
  app.get('/ativos', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Clientes ativos e não bloqueados' } }, async () => {
    const clientes = await prisma.cliente.findMany({
      where: { ativo: 'S', bloqueado: 'N' },
      orderBy: { nome: 'asc' },
    })
    return clientes.map(fmt)
  })

  // GET /clientes/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(id) },
      include: {
        contador: true,
        atendimentos: {
          include: {
            tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
          },
          orderBy: { dataAbertura: 'desc' },
          take: 10,
        },
        assinaturas: {
          orderBy: { dataCriacao: 'desc' },
        },
      },
    })
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })

    const { atendimentos, assinaturas, ...rest } = cliente as any
    return {
      ...fmt(rest),
      atendimentos: atendimentos.map(({ tecnico, ...a }: any) => ({
        ...a,
        clienteNome: cliente.nome,
        tecnicoNome: tecnico?.nomeCompleto || tecnico?.nomeUsu || 'Usuário',
      })),
      assinaturas,
    }
  })

  // POST /clientes
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const cliente = await prisma.cliente.create({ data: body as never })
    return reply.status(201).send(fmt(cliente))
  })

  // PUT /clientes/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const cliente = await prisma.cliente.update({
      where: { id: Number(id) },
      data: body as never,
    })
    return fmt(cliente)
  })

  // PATCH /clientes/:id/toggle — ativar/inativar
  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Ativar/inativar cliente' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })
    const novoAtivo = cliente.ativo === 'S' ? 'N' : 'S'
    const updated = await prisma.cliente.update({
      where: { id: Number(id) },
      data: { ativo: novoAtivo },
    })
    return fmt(updated)
  })

  // GET /clientes/monitor/resumo — contagens por status
  app.get('/monitor/resumo', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Resumo de clientes por status' } }, async () => {
    const [total, ativos, inativos, bloqueados, curvaA, curvaB, curvaC] = await Promise.all([
      prisma.cliente.count(),
      prisma.cliente.count({ where: { ativo: 'S', bloqueado: 'N' } }),
      prisma.cliente.count({ where: { ativo: 'N' } }),
      prisma.cliente.count({ where: { bloqueado: 'S' } }),
      prisma.cliente.count({ where: { curvaABC: 'A' } }),
      prisma.cliente.count({ where: { curvaABC: 'B' } }),
      prisma.cliente.count({ where: { curvaABC: 'C' } }),
    ])
    return { total, ativos, inativos, bloqueados, curvaA, curvaB, curvaC }
  })
}
