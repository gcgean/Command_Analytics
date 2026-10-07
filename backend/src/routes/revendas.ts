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

  /**
   * Dashboard das revendas. Os dados vêm do nosso próprio banco: `ponto_revenda` é a lista de
   * revendas e `cliente.cod_ponto_revenda` liga cada cliente à sua. Não depende do banco externo.
   *
   * Receita = soma da mensalidade dos clientes ativos (MRR). Não existe histórico de preço, então
   * a evolução conta entradas e saídas de clientes, não o valor cobrado em cada mês passado.
   */
  app.get('/dashboard', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async (request) => {
    const { inicio, fim } = request.query as Record<string, string>
    const de = inicio || new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
    const ate = fim || new Date().toISOString().slice(0, 10)

    // O LEFT JOIN traz uma linha com NULL para revenda sem cliente; sem o teste de cod_cli
    // o COALESCE(ATIVO,'S') contaria essa linha vazia como um cliente ativo.
    const revendas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.cod_ponto, r.descricao, r.razao_social, r.cnpj, r.cidade, r.estado,
              r.ATIVO AS ativa, r.perc_revenda, r.nome_responsavel, r.telefone, r.email,
              COUNT(c.cod_cli) AS clientes,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ATIVO,'S') = 'S') AS ativos,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ATIVO,'S') <> 'S') AS inativos,
              COALESCE(SUM(CASE WHEN COALESCE(c.ATIVO,'S') = 'S' THEN c.valor_mensalidade END), 0) AS mrr,
              SUM(c.cod_cli IS NOT NULL AND DATE(c.DATACADASTRO_CLI) BETWEEN ? AND ?) AS novos,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ATIVO,'S') <> 'S'
                  AND DATE(c.DATA_DESATIVACAO) BETWEEN ? AND ?) AS perdidos
         FROM ponto_revenda r
         LEFT JOIN cliente c ON c.cod_ponto_revenda = r.cod_ponto
        GROUP BY r.cod_ponto, r.descricao, r.razao_social, r.cnpj, r.cidade, r.estado,
                 r.ATIVO, r.perc_revenda, r.nome_responsavel, r.telefone, r.email
        ORDER BY mrr DESC, clientes DESC`,
      de, ate, de, ate,
    )

    // Clientes que não apontam para revenda nenhuma — ficam de fora dos totais por revenda.
    const [sem] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q,
              SUM(COALESCE(ATIVO,'S') = 'S') AS ativos,
              COALESCE(SUM(CASE WHEN COALESCE(ATIVO,'S') = 'S' THEN valor_mensalidade END), 0) AS mrr
         FROM cliente WHERE cod_ponto_revenda IS NULL OR cod_ponto_revenda = 0`)

    // Entradas e saídas mês a mês, últimos 12 meses, por revenda.
    const evolucao = await prisma.$queryRawUnsafe<any[]>(
      `SELECT mes, cod_ponto, SUM(novos) novos, SUM(perdidos) perdidos FROM (
         SELECT DATE_FORMAT(c.DATACADASTRO_CLI, '%Y-%m') mes,
                COALESCE(c.cod_ponto_revenda, 0) cod_ponto, 1 novos, 0 perdidos
           FROM cliente c
          WHERE c.DATACADASTRO_CLI >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         UNION ALL
         SELECT DATE_FORMAT(c.DATA_DESATIVACAO, '%Y-%m') mes,
                COALESCE(c.cod_ponto_revenda, 0) cod_ponto, 0 novos, 1 perdidos
           FROM cliente c
          WHERE COALESCE(c.ATIVO,'S') <> 'S'
            AND c.DATA_DESATIVACAO >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       ) x WHERE mes IS NOT NULL GROUP BY mes, cod_ponto ORDER BY mes`)

    const linhas = revendas.map((r) => {
      const ativos = Number(r.ativos ?? 0)
      const mrr = Number(r.mrr ?? 0)
      return {
        codPonto: Number(r.cod_ponto),
        nome: r.descricao || r.razao_social || `Revenda ${r.cod_ponto}`,
        razaoSocial: r.razao_social ?? null,
        cnpj: r.cnpj ?? null,
        cidade: r.cidade ?? null,
        estado: r.estado ?? null,
        responsavel: r.nome_responsavel ?? null,
        telefone: r.telefone || null,
        email: r.email ?? null,
        ativa: String(r.ativa ?? 'S') === 'S',
        percentual: r.perc_revenda == null ? null : Number(r.perc_revenda),
        clientes: Number(r.clientes ?? 0),
        ativos,
        inativos: Number(r.inativos ?? 0),
        novos: Number(r.novos ?? 0),
        perdidos: Number(r.perdidos ?? 0),
        mrr,
        ticketMedio: ativos ? mrr / ativos : 0,
      }
    })
    const mrrTotal = linhas.reduce((s, l) => s + l.mrr, 0)

    return {
      periodo: { inicio: de, fim: ate },
      resumo: {
        revendas: linhas.length,
        revendasAtivas: linhas.filter((l) => l.ativa).length,
        clientes: linhas.reduce((s, l) => s + l.clientes, 0),
        ativos: linhas.reduce((s, l) => s + l.ativos, 0),
        mrr: mrrTotal,
        novos: linhas.reduce((s, l) => s + l.novos, 0),
        perdidos: linhas.reduce((s, l) => s + l.perdidos, 0),
      },
      revendas: linhas.map((l) => ({
        ...l,
        participacao: mrrTotal ? (l.mrr / mrrTotal) * 100 : 0,
      })),
      semRevenda: {
        clientes: Number(sem?.q ?? 0),
        ativos: Number(sem?.ativos ?? 0),
        mrr: Number(sem?.mrr ?? 0),
      },
      evolucao: evolucao.map((e) => ({
        mes: e.mes,
        codPonto: Number(e.cod_ponto ?? 0),
        novos: Number(e.novos ?? 0),
        perdidos: Number(e.perdidos ?? 0),
      })),
    }
  })

  app.post('/sincronizar', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async () =>
    sincronizarRevendas())
}
