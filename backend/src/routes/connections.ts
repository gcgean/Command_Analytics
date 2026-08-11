import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { usuarioEhAdmin } from '../utils/visibilidade'
import {
  listarConexoesDoServidor,
  checarSaudeConexao,
  executarAcaoConexao,
  type ServidorParaConexoes,
} from '../utils/servidorConnections'

async function servidoresElegiveis(admin: boolean, servidorId?: number): Promise<ServidorParaConexoes[]> {
  const servidores = await prisma.servidor.findMany({
    where: {
      desativado: { not: true },
      dns: { not: null },
      portaApi: { not: null },
      ...(admin ? {} : { somenteAdmin: { not: true } }),
      ...(servidorId ? { id: servidorId } : {}),
    },
    select: { id: true, nome: true, dns: true, portaApi: true, anydesk: true },
  })
  return servidores
}

async function conexoesRestritas(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ servidor_id: number; connection_id: string }>>`
    SELECT servidor_id, connection_id FROM conexao_restricoes WHERE somente_admin = 1
  `
  return new Set(rows.map((r) => `${r.servidor_id}:${r.connection_id}`))
}

export async function connectionsRoutes(app: FastifyInstance) {
  // GET /connections — lista conexões (todas ou de um servidor específico)
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Conexões'] } }, async (request) => {
    const { servidorId, search, status } = request.query as Record<string, string>
    const admin = await usuarioEhAdmin(Number((request.user as any)?.id))

    const servidores = await servidoresElegiveis(admin, servidorId ? Number(servidorId) : undefined)
    const listas = await Promise.all(servidores.map((s) => listarConexoesDoServidor(s)))
    let conexoes = listas.flat()

    const restritas = await conexoesRestritas()
    if (!admin) {
      conexoes = conexoes.filter((c) => !restritas.has(`${c.servidorId}:${c.id}`))
    }

    if (status) {
      const statusLower = status.toLowerCase()
      conexoes = conexoes.filter((c) => c.status.toLowerCase() === statusLower)
    }
    if (search) {
      const termo = search.toLowerCase()
      conexoes = conexoes.filter((c) =>
        [c.name, c.servidorNome, c.restPort, c.ports].filter(Boolean).some((v) => String(v).toLowerCase().includes(termo))
      )
    }

    conexoes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    return {
      total: conexoes.length,
      servidoresConsultados: servidores.length,
      data: conexoes.map((c) => ({ ...c, somenteAdmin: restritas.has(`${c.servidorId}:${c.id}`) })),
    }
  })

  // GET /connections/saude — saúde detalhada de uma conexão específica
  app.get('/saude', { preHandler: authMiddleware, schema: { tags: ['Conexões'] } }, async (request, reply) => {
    const { servidorId, connectionId } = request.query as Record<string, string>
    if (!servidorId || !connectionId) return reply.status(400).send({ error: 'servidorId e connectionId são obrigatórios.' })

    const admin = await usuarioEhAdmin(Number((request.user as any)?.id))
    const [servidor] = await servidoresElegiveis(admin, Number(servidorId))
    if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado ou inativo.' })

    if (!admin) {
      const restritas = await conexoesRestritas()
      if (restritas.has(`${servidor.id}:${connectionId}`)) {
        return reply.status(404).send({ error: 'Conexão não encontrada.' })
      }
    }

    try {
      const saude = await checarSaudeConexao(servidor, connectionId)
      return saude
    } catch (e: any) {
      return reply.status(502).send({ error: e?.message || 'Falha ao consultar saúde da conexão.' })
    }
  })

  // POST /connections/visibilidade — restringe/libera visibilidade de uma conexão (só admin)
  app.post('/visibilidade', { preHandler: authMiddleware, schema: { tags: ['Conexões'], summary: 'Alternar visibilidade somente-admin de uma conexão' } }, async (request, reply) => {
    if (!(await usuarioEhAdmin(Number((request.user as any)?.id)))) {
      return reply.status(403).send({ error: 'Apenas administradores podem alterar essa visibilidade.' })
    }
    const { servidorId, connectionId } = request.body as { servidorId: number; connectionId: string }
    if (!servidorId || !connectionId) {
      return reply.status(400).send({ error: 'servidorId e connectionId são obrigatórios.' })
    }

    const restritas = await conexoesRestritas()
    const jaRestrita = restritas.has(`${servidorId}:${connectionId}`)

    if (jaRestrita) {
      await prisma.$executeRaw`DELETE FROM conexao_restricoes WHERE servidor_id = ${servidorId} AND connection_id = ${connectionId}`
    } else {
      await prisma.$executeRaw`
        INSERT INTO conexao_restricoes (servidor_id, connection_id, somente_admin)
        VALUES (${servidorId}, ${connectionId}, 1)
        ON DUPLICATE KEY UPDATE somente_admin = 1
      `
    }
    return { somenteAdmin: !jaRestrita }
  })

  // POST /connections/acao — abrir/reiniciar/fechar aplicação de uma conexão
  app.post('/acao', { preHandler: authMiddleware, schema: { tags: ['Conexões'], summary: 'Executa ação remota em uma conexão' } }, async (request, reply) => {
    const { servidorId, connectionId, connectionName, acao } = request.body as {
      servidorId: number
      connectionId: string
      connectionName?: string
      acao: 'abrir' | 'reiniciar' | 'fechar'
    }
    if (!servidorId || !connectionId || !acao) {
      return reply.status(400).send({ error: 'servidorId, connectionId e acao são obrigatórios.' })
    }
    if (!['abrir', 'reiniciar', 'fechar'].includes(acao)) {
      return reply.status(400).send({ error: 'Ação inválida.' })
    }

    try {
      const admin = await usuarioEhAdmin(Number((request.user as any)?.id))
      const [servidor] = await servidoresElegiveis(admin, Number(servidorId))
      if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado ou inativo.' })

      if (!admin) {
        const restritas = await conexoesRestritas()
        if (restritas.has(`${servidor.id}:${connectionId}`)) {
          return reply.status(404).send({ error: 'Conexão não encontrada.' })
        }
      }

      const usuarioId = Number((request.user as any)?.id || 0) || null

      try {
        await executarAcaoConexao(servidor, connectionId, acao)
        await registrarAuditoria({
          tabela: 'servidor_conexoes',
          registroId: servidor.id,
          acao: 'STATUS',
          usuarioId,
          dadosDepois: { acao, connectionId, connectionName: connectionName ?? null, servidor: servidor.nome },
        }).catch(() => {})
        return { ok: true }
      } catch (e: any) {
        await registrarAuditoria({
          tabela: 'servidor_conexoes',
          registroId: servidor.id,
          acao: 'STATUS',
          usuarioId,
          dadosDepois: { acao, connectionId, connectionName: connectionName ?? null, servidor: servidor.nome, erro: e?.message },
        }).catch(() => {})
        return reply.status(502).send({ error: e?.message || 'Falha ao executar ação na conexão.' })
      }
    } catch (e: any) {
      return reply.status(500).send({ error: e?.message || 'Erro inesperado ao processar a ação.' })
    }
  })
}
