import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

function fmt(s: any) {
  return {
    id: s.id,
    nome: s.nome,
    descricao: s.descricao,
    dns: s.dns,
    online: s.online,
    cpuPercent: s.cpuPercent !== null ? Number(s.cpuPercent) : null,
    ramPercent: s.ramPercent !== null ? Number(s.ramPercent) : null,
    discoTotal: s.discoTotal,
    discoLivre: s.discoLivre,
    driveDisco: s.driveDisco,
    latencia: s.latencia,
    anydesk: s.anydesk,
    desativado: s.desativado,
    // Histórico: últimos 7 registros de hist_servidor_nuvem
    historico: (s.historico ?? []).map((h: any) => ({
      id: h.id,
      cpuPercent: h.cpuPercent !== null ? Number(h.cpuPercent) : null,
      ramPercent: h.ramPercent !== null ? Number(h.ramPercent) : null,
      discoLivre: h.discoLivre,
      online: h.online,
      data: h.data,
    })),
  }
}

export async function servidoresRoutes(app: FastifyInstance) {
  // GET /servidores
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request) => {
    const { online, desativado } = request.query as Record<string, string>

    const servidores = await prisma.servidor.findMany({
      where: {
        ...(online !== undefined && { online: online === 'true' }),
        ...(desativado !== undefined && { desativado: desativado === 'true' }),
      },
      include: {
        historico: {
          orderBy: { dataConsulta: 'desc' },
          take: 7,
        },
      },
      orderBy: { nome: 'asc' },
    })

    return servidores.map(fmt)
  })

  // GET /servidores/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const servidor = await prisma.servidor.findUnique({
      where: { id: Number(id) },
      include: {
        historico: {
          orderBy: { dataConsulta: 'desc' },
          take: 7,
        },
      },
    })
    if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })
    return fmt(servidor)
  })

  // POST /servidores
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const servidor = await prisma.servidor.create({
      data: body as never,
      include: { historico: { take: 7 } },
    })
    return reply.status(201).send(fmt(servidor))
  })

  // PUT /servidores/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const servidor = await prisma.servidor.update({
      where: { id: Number(id) },
      data: body as never,
      include: { historico: { orderBy: { dataConsulta: 'desc' }, take: 7 } },
    })
    return fmt(servidor)
  })

  // PATCH /servidores/:id/metricas — atualizar métricas de monitoramento
  app.patch(
    '/:id/metricas',
    { preHandler: authMiddleware, schema: { tags: ['Servidores'], summary: 'Atualizar métricas do servidor' } },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { cpuPercent, ramPercent, discoLivre, online, latencia } = request.body as Record<string, number | boolean | null>

      const servidor = await prisma.servidor.findUnique({ where: { id: Number(id) } })
      if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })

      // Persiste snapshot no histórico
      await prisma.historicoServidor.create({
        data: {
          servidorId: Number(id),
          usoCpu: cpuPercent !== undefined ? Number(cpuPercent) : undefined,
          usoMemoria: ramPercent !== undefined ? Number(ramPercent) : undefined,
          online: online !== undefined ? (Boolean(online) ? 1 : 0) : undefined,
          dataConsulta: new Date(),
        } as never,
      })

      const updated = await prisma.servidor.update({
        where: { id: Number(id) },
        data: {
          ...(cpuPercent !== undefined && { cpuPercent: Number(cpuPercent) }),
          ...(ramPercent !== undefined && { ramPercent: Number(ramPercent) }),
          ...(discoLivre !== undefined && { discoLivre: Number(discoLivre) }),
          ...(online !== undefined && { online: Boolean(online) }),
          ...(latencia !== undefined && { latencia: Number(latencia) }),
        },
        include: {
          historico: { orderBy: { dataConsulta: 'desc' }, take: 7 },
        },
      })

      return fmt(updated)
    }
  )

  // PATCH /servidores/:id/toggle — ativar/desativar servidor
  app.patch(
    '/:id/toggle',
    { preHandler: authMiddleware, schema: { tags: ['Servidores'], summary: 'Ativar/desativar servidor' } },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const servidor = await prisma.servidor.findUnique({ where: { id: Number(id) } })
      if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })
      const updated = await prisma.servidor.update({
        where: { id: Number(id) },
        data: { desativado: !servidor.desativado },
        include: { historico: { orderBy: { dataConsulta: 'desc' }, take: 7 } },
      })
      return fmt(updated)
    }
  )

  // DELETE /servidores/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.servidor.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })
}
