import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'
import { ProvedorDeepSeek } from '../ia/deepseek'
import { conversarComAssistente } from '../ia/assistente'

// Limite diário simples por usuário — evita loop/uso descontrolado consumindo crédito da API.
// Em memória (reseta em restart) segue o mesmo padrão leve já usado em outros lugares do projeto.
const LIMITE_DIARIO = 60
const usoDiario = new Map<number, { dia: string; qtd: number }>()

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function excedeuLimite(usuarioId: number): boolean {
  const hoje = hojeISO()
  const atual = usoDiario.get(usuarioId)
  if (!atual || atual.dia !== hoje) {
    usoDiario.set(usuarioId, { dia: hoje, qtd: 1 })
    return false
  }
  if (atual.qtd >= LIMITE_DIARIO) return true
  atual.qtd += 1
  return false
}

export async function assistenteRoutes(app: FastifyInstance) {
  app.get('/status', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async () => {
    return { disponivel: Boolean(process.env.DEEPSEEK_API_KEY) }
  })

  app.post('/conversar', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async (request, reply) => {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) return reply.status(503).send({ error: 'Assistente de IA não configurado.' })

    const usuarioId = Number((request.user as any)?.id || 0)
    if (!usuarioId) return reply.status(401).send({ error: 'Sessão inválida.' })

    if (excedeuLimite(usuarioId)) {
      return reply.status(429).send({ error: 'Limite diário de uso do assistente atingido. Tente novamente amanhã.' })
    }

    const { historico } = request.body as { historico?: Array<{ papel: 'user' | 'assistant'; conteudo: string }> }
    if (!Array.isArray(historico) || historico.length === 0) {
      return reply.status(400).send({ error: 'Histórico de mensagens vazio.' })
    }
    // Nunca confia num "quem está perguntando" vindo do corpo da requisição — o usuarioId
    // sempre vem do JWT autenticado, é isso que é passado como contexto pras ferramentas.
    const permissoes = await getUserPermissions(usuarioId)

    try {
      const provedor = new ProvedorDeepSeek(apiKey)
      const resultado = await conversarComAssistente(provedor, historico, { usuarioId, permissoes })
      return resultado
    } catch (e: any) {
      request.log.error(e)
      return reply.status(502).send({ error: 'Falha ao consultar o assistente de IA. Tente novamente.' })
    }
  })
}
