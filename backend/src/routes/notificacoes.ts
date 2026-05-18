import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import {
  getConfigNotificacaoAgendamento,
  listNotificacoesPlataforma,
  marcarNotificacaoLida,
  saveConfigNotificacaoAgendamento,
} from '../utils/notificacoesAgendamento'

export async function notificacoesRoutes(app: FastifyInstance) {
  app.get('/config-agendamento', { preHandler: [authMiddleware] }, async () => {
    return getConfigNotificacaoAgendamento()
  })

  app.put('/config-agendamento', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const body = request.body as {
        ativoPlataforma?: boolean
        ativoTelegram?: boolean
        horarioResumoDia?: string
        antecedenciaMin?: number
      }

      return await saveConfigNotificacaoAgendamento(body)
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao salvar configuração de notificações.', message: error?.message })
    }
  })

  app.get('/plataforma', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const usuarioId = Number((request.user as any)?.id || 0)
      if (!usuarioId) {
        return reply.status(401).send({ error: 'Usuário não autenticado.' })
      }

      const limit = Number((request.query as any)?.limit || 20)
      return await listNotificacoesPlataforma(usuarioId, limit)
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao listar notificações.', message: error?.message })
    }
  })

  app.patch('/plataforma/:id/lida', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const usuarioId = Number((request.user as any)?.id || 0)
      const id = Number((request.params as any)?.id || 0)

      if (!usuarioId) {
        return reply.status(401).send({ error: 'Usuário não autenticado.' })
      }

      if (!id) {
        return reply.status(400).send({ error: 'ID da notificação inválido.' })
      }

      const ok = await marcarNotificacaoLida(id, usuarioId)
      if (!ok) {
        return reply.status(404).send({ error: 'Notificação não encontrada.' })
      }

      return { ok: true }
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao marcar notificação como lida.', message: error?.message })
    }
  })
}
