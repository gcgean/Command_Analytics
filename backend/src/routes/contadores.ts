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
    const { search, cidade } = request.query as Record<string, string>

    const contadores = await prisma.contador.findMany({
      where: {
        ...(search && {
          OR: [
            { nome: { contains: search } },
            { nomeComercial: { contains: search } },
            { cnpj: { contains: search } },
          ],
        }),
        ...(cidade && { cidade }),
      },
      include: {
        clientes: {
          select: { id: true, nome: true, ativo: true, bloqueado: true },
        },
      },
      orderBy: { nome: 'asc' },
    })

    return contadores.map(fmt)
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
    const contador = await prisma.contador.create({ data: body as never })
    return reply.status(201).send(fmt(contador))
  })

  // PUT /contadores/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const contador = await prisma.contador.update({
      where: { id: Number(id) },
      data: body as never,
    })
    return fmt(contador)
  })

  // DELETE /contadores/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Contadores'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.contador.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // GET /contadores/:id/clientes — listar clientes de um contador
  app.get('/:id/clientes', { preHandler: authMiddleware, schema: { tags: ['Contadores'], summary: 'Clientes do contador' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const contador = await prisma.contador.findUnique({ where: { id: Number(id) } })
    if (!contador) return reply.status(404).send({ error: 'Contador não encontrado.' })

    return prisma.cliente.findMany({
      where: { contadorId: Number(id) },
      orderBy: { nome: 'asc' },
    })
  })
}
