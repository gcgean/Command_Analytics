
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { TelegramService } from '../services/telegram'
import { authMiddleware } from '../middleware/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function telegramRoutes(app: FastifyInstance) {
  // Rota para envio direto de mensagem (exige autenticação)
  app.post('/enviar', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, mensagem } = request.body as { userId: string, mensagem: string }

    if (!userId || !mensagem) {
      return reply.status(400).send({ error: 'userId e mensagem são obrigatórios.' })
    }

    const result = await TelegramService.enviar({ userId, mensagem })

    if (!result.success) {
      return reply.status(500).send({ error: result.error })
    }

    return { success: true, message: 'Mensagem enviada com sucesso!' }
  })

  // ─── Configurações ──────────────────────────────────────────

  // Obter configuração do Telegram
  app.get('/config', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      let config = await prisma.configuracaoTelegram.findFirst()
      
      if (!config) {
        // Cria uma configuração padrão se não existir
        config = await prisma.configuracaoTelegram.create({
          data: {
            ativo: true,
            nomeBot: 'Command Analytics Bot',
            userIdPadrao: ''
          }
        })
      }

      return config
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar configuração: ' + error.message })
    }
  })

  // Atualizar configuração
  app.put('/config', { preHandler: [authMiddleware] }, async (request, reply) => {
    const data = request.body as any
    
    try {
      const current = await prisma.configuracaoTelegram.findFirst()
      
      if (current) {
        const updated = await prisma.configuracaoTelegram.update({
          where: { id: current.id },
          data: {
            ativo: data.ativo,
            nomeBot: data.nomeBot,
            userIdPadrao: data.userIdPadrao,
            tokenApi: data.tokenApi
          }
        })
        return updated
      } else {
        const created = await prisma.configuracaoTelegram.create({
          data: {
            ativo: data.ativo ?? true,
            nomeBot: data.nomeBot,
            userIdPadrao: data.userIdPadrao,
            tokenApi: data.tokenApi
          }
        })
        return created
      }
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao salvar configuração: ' + error.message })
    }
  })
}
