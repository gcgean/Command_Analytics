import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

function fmt(c: any) {
  return {
    id: c.id,
    nome: c.nome,
    nomeComercial: c.nomeComercial,
    cnpj: c.cnpj,
    email: c.email,
    telefone: c.telefone,
    responsavel: c.responsavel,
    emailResp: c.emailResp,
    cidade: c.cidade,
    crc: c.crc,
    descricao: c.descricao,
    perfilContador: c.perfilContador,
    chavePix: c.chavePix,
    emailEnvio: c.emailEnvio,
    sistemaContador: c.sistemaContador,
    melhorDiaEnvio: c.melhorDiaEnvio ? String(c.melhorDiaEnvio) : '',
    usaPlataforma: c.usaPlataforma,
    cpfContador: c.cpfContador,
    // Clientes associados (quando incluídos)
    clientes: c.clientes
      ? c.clientes.map((cl: any) => ({
          id: cl.id,
          nome: cl.nome,
          ativo: cl.ativo,
          bloqueado: cl.bloqueado,
        }))
      : undefined,
    totalClientes: c.clientes?.length ?? undefined,
  }
}

export async function contadoresRoutes(app: FastifyInstance) {
  // GET /contadores
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request) => {
    const { search, cidade, page, limit } = request.query as Record<string, string>
    const where = {
      ...(search && {
        OR: [
          { nome: { contains: search } },
          { nomeComercial: { contains: search } },
          { cnpj: { contains: search } },
        ],
      }),
      ...(cidade && { cidade }),
    }
    const pg = page ? Math.max(Number(page), 1) : undefined
    const lm = limit ? Math.max(Number(limit), 1) : undefined

    if (pg && lm) {
      const total = await prisma.contador.count({ where })
      const pages = Math.max(Math.ceil(total / lm), 1)
      const data = await prisma.contador.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (pg - 1) * lm,
        take: lm,
      })
      const ids = data.map(d => d.id)
      let counts: Record<string, number> = {}
      if (ids.length) {
        try {
          const grouped = await prisma.contadorCliente.groupBy({
            by: ['contadorId'],
            where: { contadorId: { in: ids } },
            _count: { _all: true },
          })
          counts = Object.fromEntries(grouped.map(g => [String(g.contadorId), g._count._all]))
        } catch {
          const pairs = await Promise.all(ids.map(async (cid) => {
            const n = await prisma.contadorCliente.count({ where: { contadorId: cid } })
            return [String(cid), n] as [string, number]
          }))
          counts = Object.fromEntries(pairs)
        }
      }
      return {
        total,
        page: pg,
        limit: lm,
        pages,
        data: data.map((c: any) => ({
          ...fmt(c),
          totalClientes: counts[String(c.id)] ?? 0,
        })),
      }
    }

    const contadores = await prisma.contador.findMany({
      where,
      orderBy: { nome: 'asc' },
    })
    if (contadores.length === 0) return []
    const ids = contadores.map(c => c.id)
    let counts: Record<string, number> = {}
    try {
      const grouped = await prisma.contadorCliente.groupBy({
        by: ['contadorId'],
        where: { contadorId: { in: ids } },
        _count: { _all: true },
      })
      counts = Object.fromEntries(grouped.map(g => [String(g.contadorId), g._count._all]))
    } catch {
      const pairs = await Promise.all(ids.map(async (cid) => {
        const n = await prisma.contadorCliente.count({ where: { contadorId: cid } })
        return [String(cid), n] as [string, number]
      }))
      counts = Object.fromEntries(pairs)
    }
    return contadores.map((c: any) => ({ ...fmt(c), totalClientes: counts[String(c.id)] ?? 0 }))
  })

  // GET /contadores/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const contador = await prisma.contador.findUnique({
      where: { id: Number(id) },
      include: {
        clientes: {
          select: { id: true, nome: true, ativo: true, bloqueado: true, curvaABC: true, mensalidade: true },
        },
      },
    })
    if (!contador) return reply.status(404).send({ error: 'Contador não encontrado.' })
    return fmt(contador)
  })

  // POST /contadores
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const maxId = await prisma.contador.aggregate({ _max: { id: true } })
    const nextId = (maxId._max.id ?? 0) + 1
    try {
      const contador = await prisma.contador.create({ data: { id: nextId, ...(body as object) } as never })
      return reply.status(201).send(fmt(contador))
    } catch {
      // Fallback: enviar apenas campos básicos caso o client Prisma ainda não tenha sido regenerado
      const basic = (({ nome, nomeComercial, cnpj, email, telefone, responsavel, emailResp, cidade, crc }) => ({
        nome, nomeComercial, cnpj, email, telefone, responsavel, emailResp, cidade, crc,
      }))(body as any)
      const contador = await prisma.contador.create({ data: { id: nextId, ...basic } as never })
      return reply.status(201).send(fmt(contador))
    }
  })

  // PUT /contadores/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    try {
      const contador = await prisma.contador.update({
        where: { id: Number(id) },
        data: body as never,
      })
      return fmt(contador)
    } catch {
      const basic = (({ nome, nomeComercial, cnpj, email, telefone, responsavel, emailResp, cidade, crc }) => ({
        nome, nomeComercial, cnpj, email, telefone, responsavel, emailResp, cidade, crc,
      }))(body as any)
      const contador = await prisma.contador.update({
        where: { id: Number(id) },
        data: basic as never,
      })
      return fmt(contador)
    }
  })

  // DELETE /contadores/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.contador.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // GET /contadores/:id/clientes — listar clientes de um contador (paginado)
  app.get('/:id/clientes', { preHandler: authMiddleware, schema: { tags: ['Contadores'], summary: 'Clientes do contador' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { page, limit } = request.query as Record<string, string>
    const contador = await prisma.contador.findUnique({ where: { id: Number(id) } })
    if (!contador) return reply.status(404).send({ error: 'Contador não encontrado.' })

    const links = await prisma.contadorCliente.findMany({
      where: { contadorId: Number(id) },
      select: { clienteId: true },
    })
    const clientIds = links.map(l => l.clienteId).filter(cid => cid !== null) as number[]
    const where = { id: { in: clientIds } }
    const pg = page ? Math.max(Number(page), 1) : undefined
    const lm = limit ? Math.max(Number(limit), 1) : undefined

    if (pg && lm) {
      const total = await prisma.cliente.count({ where })
      const pages = Math.max(Math.ceil(total / lm), 1)
      const data = await prisma.cliente.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (pg - 1) * lm,
        take: lm,
      })
      return { total, page: pg, limit: lm, pages, data }
    }

    return prisma.cliente.findMany({ where, orderBy: { nome: 'asc' } })
  })
}
