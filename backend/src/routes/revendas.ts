import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import {
  obterConfigRevendas, testarConexaoRevendas, mapearBancoRevendas,
  consultarRevendas, sincronizarRevendas,
} from '../utils/revendasSync'

/** Integração com o banco externo das revendas (MySQL separado, somente leitura). */
export async function revendasRoutes(app: FastifyInstance) {
  app.get('/config', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async () => {
    const c = await obterConfigRevendas()
    const [l] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ultima_sync, ultimo_erro FROM revenda_config ORDER BY id LIMIT 1`,
    )
    return {
      host: c?.host ?? '',
      porta: c?.porta ?? 3306,
      usuario: c?.usuario ?? '',
      // A senha nunca volta para a tela.
      temSenha: !!c?.senha,
      banco: c?.banco ?? '',
      ativo: c?.ativo ?? false,
      horaSync: c?.horaSync ?? '03:00',
      ultimaSync: l?.ultima_sync ?? null,
      ultimoErro: l?.ultimo_erro ?? null,
    }
  })

  app.put('/config', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const host = String(b.host ?? '').trim()
    const banco = String(b.banco ?? '').trim()
    const usuario = String(b.usuario ?? '').trim()
    if (!host) return reply.status(400).send({ error: 'Informe o host do banco das revendas.' })
    if (!banco) return reply.status(400).send({ error: 'Informe o nome do banco.' })

    const porta = Number(b.porta) || 3306
    const hora = /^\d{2}:\d{2}$/.test(String(b.horaSync ?? '')) ? String(b.horaSync) : '03:00'
    const senha = String(b.senha ?? '').trim()

    // Senha em branco mantém a atual — a tela nunca recebe a senha de volta para reenviar.
    if (senha) {
      await prisma.$executeRawUnsafe(
        `UPDATE revenda_config SET host=?, porta=?, usuario=?, senha=?, banco=?, ativo=?, hora_sync=?
          ORDER BY id LIMIT 1`,
        host, porta, usuario || null, senha, banco, b.ativo === false ? 0 : 1, hora,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE revenda_config SET host=?, porta=?, usuario=?, banco=?, ativo=?, hora_sync=?
          ORDER BY id LIMIT 1`,
        host, porta, usuario || null, banco, b.ativo === false ? 0 : 1, hora,
      )
    }
    return { ok: true }
  })

  app.post('/testar', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async () =>
    testarConexaoRevendas())

  // Levantamento do esquema: é como descobrimos onde estão as revendas no banco de lá.
  app.get('/mapa', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async (request, reply) => {
    const { filtro } = request.query as { filtro?: string }
    try {
      return await mapearBancoRevendas(filtro?.trim() || undefined)
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e).slice(0, 400) })
    }
  })

  // Amostra de uma tabela, para conferir o conteúdo antes de mapear.
  app.get('/amostra', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async (request, reply) => {
    const { tabela, limite } = request.query as { tabela?: string; limite?: string }
    const nome = String(tabela ?? '').trim()
    if (!/^[A-Za-z0-9_]+$/.test(nome)) return reply.status(400).send({ error: 'Nome de tabela inválido.' })
    try {
      const linhas = await consultarRevendas(`SELECT * FROM \`${nome}\``, Number(limite) || 20)
      return { tabela: nome, linhas }
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e).slice(0, 400) })
    }
  })

  app.post('/sincronizar', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async () =>
    sincronizarRevendas())
}
