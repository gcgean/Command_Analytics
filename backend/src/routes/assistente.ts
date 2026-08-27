import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'
import { ProvedorDeepSeek } from '../ia/deepseek'
import { conversarComAssistente } from '../ia/assistente'
import { ensureConfiguracaoIA, obterConfigIA, MODELOS_DEEPSEEK } from '../ia/config'

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

async function ehAdmin(usuarioId: number): Promise<boolean> {
  const permissoes = await getUserPermissions(usuarioId)
  return permissoes.includes('*')
}

export async function assistenteRoutes(app: FastifyInstance) {
  app.get('/status', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async () => {
    const config = await obterConfigIA()
    return { disponivel: config.ativo && Boolean(config.apiKey) }
  })

  // Config visível/editável só por admin — nunca devolve a chave em texto puro, só se existe uma.
  app.get('/config', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async (request, reply) => {
    const usuarioId = Number((request.user as any)?.id || 0)
    if (!(await ehAdmin(usuarioId))) return reply.status(403).send({ error: 'Apenas administradores podem ver essa configuração.' })

    await ensureConfiguracaoIA()
    const config = await prisma.configuracaoIA.findFirst()
    return {
      ativo: config?.ativo ?? true,
      modelo: config?.modelo || process.env.IA_MODELO || 'deepseek-chat',
      temApiKey: Boolean(config?.apiKey || process.env.DEEPSEEK_API_KEY),
      modelosDisponiveis: MODELOS_DEEPSEEK,
    }
  })

  app.put('/config', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async (request, reply) => {
    const usuarioId = Number((request.user as any)?.id || 0)
    if (!(await ehAdmin(usuarioId))) return reply.status(403).send({ error: 'Apenas administradores podem alterar essa configuração.' })

    const { ativo, modelo, apiKey } = request.body as { ativo?: boolean; modelo?: string; apiKey?: string }
    if (modelo && !MODELOS_DEEPSEEK.includes(modelo as any)) {
      return reply.status(400).send({ error: `Modelo inválido. Use um de: ${MODELOS_DEEPSEEK.join(', ')}.` })
    }

    await ensureConfiguracaoIA()
    const atual = await prisma.configuracaoIA.findFirst()
    const dados = {
      ativo: ativo ?? atual?.ativo ?? true,
      modelo: modelo || atual?.modelo || 'deepseek-chat',
      // Campo em branco = não mexe na chave já salva (mesma convenção de "nova senha" do resto do sistema).
      apiKey: apiKey && apiKey.trim() ? apiKey.trim() : atual?.apiKey ?? null,
    }

    if (atual) {
      await prisma.configuracaoIA.update({ where: { id: atual.id }, data: dados })
    } else {
      await prisma.configuracaoIA.create({ data: { ...dados, provedor: 'deepseek' } })
    }
    return { ok: true }
  })

  app.post('/conversar', { preHandler: authMiddleware, schema: { tags: ['Assistente IA'] } }, async (request, reply) => {
    const config = await obterConfigIA()
    if (!config.ativo || !config.apiKey) return reply.status(503).send({ error: 'Assistente de IA não configurado.' })

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
      const provedor = new ProvedorDeepSeek(config.apiKey, config.modelo)
      const resultado = await conversarComAssistente(provedor, historico, { usuarioId, permissoes })
      return resultado
    } catch (e: any) {
      request.log.error(e)
      return reply.status(502).send({ error: 'Falha ao consultar o assistente de IA. Tente novamente.' })
    }
  })
}
