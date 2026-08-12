import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { gerarAnaliseFaturamento } from '../utils/faturamento'

export async function faturamentoRoutes(app: FastifyInstance) {
  app.get('/analise', { preHandler: authMiddleware, schema: { tags: ['Faturamento'], summary: 'Análise de faturamento geral, por forma de pagamento e por maquininha' } }, async (request, reply) => {
    const { meses } = request.query as Record<string, string>
    const qtdMeses = Math.min(24, Math.max(1, Number(meses) || 6))

    try {
      const analise = await gerarAnaliseFaturamento(qtdMeses)
      return analise
    } catch (e: any) {
      return reply.status(500).send({ error: e?.message || 'Falha ao gerar análise de faturamento.' })
    }
  })
}
