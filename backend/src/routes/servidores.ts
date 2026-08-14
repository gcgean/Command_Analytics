import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { pollServidor } from '../utils/servidorMonitor'
import { usuarioEhAdmin } from '../utils/visibilidade'

// Histórico das últimas 24h (a cada 5min ≈ até 288 pontos), usado nos gráficos de CPU/RAM.
function historico24h() {
  return {
    where: { dataConsulta: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { dataConsulta: 'desc' as const },
  }
}

function fmt(s: any) {
  const ultimo = (s.historico ?? [])[0] ?? null
  return {
    id: s.id,
    nome: s.nome,
    descricao: s.descricao,
    dns: s.dns,
    numeroServidor: s.numeroServidor,
    portaApi: s.portaApi,
    // "online" vem de monitorOnline (coluna própria do monitor) — a coluna legada "disponivel"
    // está travada por um trigger antigo (TRG_SERVIDOR_NUVEM_DISPONIVEL) e não é mais confiável.
    online: s.monitorOnline,
    cpuPercent: s.cpuPercent !== null ? Number(s.cpuPercent) : null,
    ramPercent: s.ramPercent !== null ? Number(s.ramPercent) : null,
    discoTotal: s.discoTotal,
    discoLivre: s.discoLivre,
    driveDisco: s.driveDisco,
    anydesk: s.anydesk,
    desativado: s.desativado,
    somenteAdmin: Boolean(s.somenteAdmin),
    conexoes: ultimo
      ? {
          total: ultimo.conexoesTotal,
          aberto: ultimo.conexoesAberto,
          travado: ultimo.conexoesTravado,
          fechado: ultimo.conexoesFechado,
        }
      : null,
    ultimaVerificacao: ultimo?.dataConsulta ?? null,
    // Histórico das últimas 24h de hist_servidor_nuvem (mais recente primeiro)
    historico: (s.historico ?? []).map((h: any) => ({
      id: h.id,
      cpuPercent: h.usoCpu !== null ? Number(h.usoCpu) : null,
      ramPercent: h.usoMemoria !== null ? Number(h.usoMemoria) : null,
      discoLivre: h.discoLivre,
      online: h.online,
      latencia: h.latencia !== null ? Number(h.latencia) : null,
      conexoesTotal: h.conexoesTotal,
      conexoesAberto: h.conexoesAberto,
      conexoesTravado: h.conexoesTravado,
      conexoesFechado: h.conexoesFechado,
      dataConsulta: h.dataConsulta,
    })),
  }
}

export async function servidoresRoutes(app: FastifyInstance) {
  // GET /servidores
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Servidores'] } }, async (request) => {
    const { online, desativado } = request.query as Record<string, string>
    const admin = await usuarioEhAdmin(Number((request.user as any)?.id))

    const servidores = await prisma.servidor.findMany({
      where: {
        ...(online !== undefined && { monitorOnline: online === 'true' }),
        ...(desativado !== undefined && { desativado: desativado === 'true' }),
        ...(admin ? {} : { somenteAdmin: { not: true } }),
      },
      include: {
        historico: historico24h(),
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
        historico: historico24h(),
      },
    })
    if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })
    if (servidor.somenteAdmin && !(await usuarioEhAdmin(Number((request.user as any)?.id)))) {
      return reply.status(404).send({ error: 'Servidor não encontrado.' })
    }
    return fmt(servidor)
  })

  // PATCH /servidores/:id/somente-admin — restringe/libera visibilidade do servidor (só admin)
  app.patch(
    '/:id/somente-admin',
    { preHandler: authMiddleware, schema: { tags: ['Servidores'], summary: 'Alternar visibilidade somente-admin' } },
    async (request, reply) => {
      if (!(await usuarioEhAdmin(Number((request.user as any)?.id)))) {
        return reply.status(403).send({ error: 'Apenas administradores podem alterar essa visibilidade.' })
      }
      const { id } = request.params as { id: string }
      const servidor = await prisma.servidor.findUnique({ where: { id: Number(id) } })
      if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })
      const updated = await prisma.servidor.update({
        where: { id: Number(id) },
        data: { somenteAdmin: !servidor.somenteAdmin },
        include: { historico: historico24h() },
      })
      return fmt(updated)
    }
  )

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
          latencia: latencia !== undefined ? Number(latencia) : undefined,
          dataConsulta: new Date(),
        } as never,
      })

      const updated = await prisma.servidor.update({
        where: { id: Number(id) },
        data: {
          ...(cpuPercent !== undefined && { cpuPercent: Number(cpuPercent) }),
          ...(ramPercent !== undefined && { ramPercent: Number(ramPercent) }),
          ...(discoLivre !== undefined && { discoLivre: Number(discoLivre) }),
          ...(online !== undefined && { monitorOnline: Boolean(online) }),
        },
        include: {
          historico: { orderBy: { dataConsulta: 'desc' }, take: 7 },
        },
      })

      return fmt(updated)
    }
  )

  // POST /servidores/:id/verificar-agora — dispara checagem imediata (ready + monitor) e retorna o resultado
  app.post(
    '/:id/verificar-agora',
    { preHandler: authMiddleware, schema: { tags: ['Servidores'], summary: 'Verificar servidor agora' } },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const servidor = await prisma.servidor.findUnique({ where: { id: Number(id) } })
      if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado.' })

      await pollServidor(Number(id))

      const updated = await prisma.servidor.findUnique({
        where: { id: Number(id) },
        include: { historico: historico24h() },
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
