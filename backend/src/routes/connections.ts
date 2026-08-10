import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import {
  listarConexoesDoServidor,
  checarSaudeConexao,
  executarAcaoConexao,
  type ServidorParaConexoes,
} from '../utils/servidorConnections'

async function servidoresElegiveis(servidorId?: number): Promise<ServidorParaConexoes[]> {
  const servidores = await prisma.servidor.findMany({
    where: {
      desativado: { not: true },
      dns: { not: null },
      portaApi: { not: null },
      ...(servidorId ? { id: servidorId } : {}),
    },
    select: { id: true, nome: true, dns: true, portaApi: true, anydesk: true },
  })
  return servidores
}

export async function connectionsRoutes(app: FastifyInstance) {
  // GET /connections — lista conexões (todas ou de um servidor específico)
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Conexões'] } }, async (request) => {
    const { servidorId, search, status } = request.query as Record<string, string>

    const servidores = await servidoresElegiveis(servidorId ? Number(servidorId) : undefined)
    const listas = await Promise.all(servidores.map((s) => listarConexoesDoServidor(s)))
    let conexoes = listas.flat()

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
      data: conexoes,
    }
  })

  // GET /connections/saude — saúde detalhada de uma conexão específica
  app.get('/saude', { preHandler: authMiddleware, schema: { tags: ['Conexões'] } }, async (request, reply) => {
    const { servidorId, connectionId } = request.query as Record<string, string>
    if (!servidorId || !connectionId) return reply.status(400).send({ error: 'servidorId e connectionId são obrigatórios.' })

    const [servidor] = await servidoresElegiveis(Number(servidorId))
    if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado ou inativo.' })

    try {
      const saude = await checarSaudeConexao(servidor, connectionId)
      return saude
    } catch (e: any) {
      return reply.status(502).send({ error: e?.message || 'Falha ao consultar saúde da conexão.' })
    }
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

    const [servidor] = await servidoresElegiveis(Number(servidorId))
    if (!servidor) return reply.status(404).send({ error: 'Servidor não encontrado ou inativo.' })

    const usuarioId = Number((request.user as any)?.id || 0) || null

    try {
      await executarAcaoConexao(servidor, connectionId, acao)
      await registrarAuditoria({
        tabela: 'servidor_conexoes',
        registroId: servidor.id,
        acao: 'STATUS',
        usuarioId,
        dadosDepois: { acao, connectionId, connectionName: connectionName ?? null, servidor: servidor.nome },
      })
      return { ok: true }
    } catch (e: any) {
      await registrarAuditoria({
        tabela: 'servidor_conexoes',
        registroId: servidor.id,
        acao: 'STATUS',
        usuarioId,
        dadosDepois: { acao, connectionId, connectionName: connectionName ?? null, servidor: servidor.nome, erro: e?.message },
      })
      return reply.status(502).send({ error: e?.message || 'Falha ao executar ação na conexão.' })
    }
  })
}
