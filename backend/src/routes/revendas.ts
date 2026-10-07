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
   * Dashboard das revendas. Lê só a cópia do banco das revendas (`revenda_externa`), trazida pela
   * sincronização — as revendas do nosso próprio `ponto_revenda` não entram aqui.
   *
   * A receita de cada mês é RECONSTRUÍDA: o banco guarda só a mensalidade atual de cada cliente,
   * sem histórico de preço. Somamos a mensalidade de hoje dos clientes que estavam ativos naquele
   * mês, então reajustes passados não aparecem. Entradas e saídas, essas sim, são exatas.
   */
  app.get('/dashboard', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async (request) => {
    const { inicio, fim } = request.query as Record<string, string>
    const de = inicio || new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
    const ate = fim || new Date().toISOString().slice(0, 10)

    // Os 12 meses fechados até o atual, com o último dia de cada um.
    const hoje = new Date()
    const meses = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - (11 - i) + 1, 0))
      return { mes: d.toISOString().slice(0, 7), fim: d.toISOString().slice(0, 10) }
    })
    const tabelaMeses = meses.map((m) => `SELECT '${m.mes}' mes, '${m.fim}' fim`).join(' UNION ALL ')

    // O LEFT JOIN traz uma linha com NULL para revenda sem cliente; sem o teste da chave do
    // cliente o COALESCE(ativo,'S') contaria essa linha vazia como um cliente ativo.
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.cod_ponto, r.descricao, r.razao_social, r.cnpj, r.cidade, r.estado,
              r.ativa, r.perc_revenda, r.nome_responsavel, r.telefone, r.email,
              COUNT(c.cod_cli) AS clientes,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ativo,'S') = 'S') AS ativos,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ativo,'S') <> 'S') AS inativos,
              COALESCE(SUM(CASE WHEN COALESCE(c.ativo,'S') = 'S' THEN c.mensalidade END), 0) AS mrr,
              SUM(c.cod_cli IS NOT NULL AND c.cadastro BETWEEN ? AND ?) AS novos,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ativo,'S') <> 'S'
                  AND c.desativacao BETWEEN ? AND ?) AS perdidos,
              COALESCE(SUM(CASE WHEN c.cadastro BETWEEN ? AND ? THEN c.mensalidade END), 0) AS receita_ganha,
              COALESCE(SUM(CASE WHEN COALESCE(c.ativo,'S') <> 'S'
                            AND c.desativacao BETWEEN ? AND ? THEN c.mensalidade END), 0) AS receita_perdida,
              SUM(c.cod_cli IS NOT NULL AND COALESCE(c.ativo,'S') = 'S'
                  AND COALESCE(c.mensalidade, 0) = 0) AS sem_mensalidade,
              SUM(c.cadastro < ? AND (c.desativacao IS NULL OR c.desativacao >= ?)) AS base_inicial
         FROM revenda_externa r
         LEFT JOIN revenda_externa_cliente c ON c.cod_ponto = r.cod_ponto
        GROUP BY r.cod_ponto, r.descricao, r.razao_social, r.cnpj, r.cidade, r.estado,
                 r.ativa, r.perc_revenda, r.nome_responsavel, r.telefone, r.email
        ORDER BY mrr DESC, clientes DESC`,
      de, ate, de, ate, de, ate, de, ate, de, de,
    ).catch(() => [])

    // Receita reconstruída mês a mês, por revenda.
    const serie = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.mes, c.cod_ponto, COALESCE(SUM(c.mensalidade), 0) mrr, COUNT(*) ativos
         FROM (${tabelaMeses}) m
         JOIN revenda_externa_cliente c
           ON c.cadastro IS NOT NULL AND c.cadastro <= m.fim
          AND (c.desativacao IS NULL OR c.desativacao > m.fim)
        GROUP BY m.mes, c.cod_ponto ORDER BY m.mes`).catch(() => [])

    // Receita que entrou e que saiu em cada mês — aqui as datas são exatas.
    const movimento = await prisma.$queryRawUnsafe<any[]>(
      `SELECT mes, SUM(ganha) ganha, SUM(perdida) perdida, SUM(novos) novos, SUM(perdidos) perdidos FROM (
         SELECT DATE_FORMAT(cadastro, '%Y-%m') mes, mensalidade ganha, 0 perdida, 1 novos, 0 perdidos
           FROM revenda_externa_cliente
          WHERE cadastro >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         UNION ALL
         SELECT DATE_FORMAT(desativacao, '%Y-%m') mes, 0 ganha, mensalidade perdida, 0 novos, 1 perdidos
           FROM revenda_externa_cliente
          WHERE COALESCE(ativo,'S') <> 'S' AND desativacao >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       ) x WHERE mes IS NOT NULL GROUP BY mes ORDER BY mes`).catch(() => [])

    const porRevendaMes = new Map<string, { mrr: number; ativos: number }>()
    for (const s of serie) {
      porRevendaMes.set(`${s.cod_ponto}|${s.mes}`, { mrr: Number(s.mrr ?? 0), ativos: Number(s.ativos ?? 0) })
    }
    const primeiroMes = meses[0].mes
    const ultimoMes = meses[meses.length - 1].mes

    const revendas = linhas.map((r) => {
      const cod = Number(r.cod_ponto)
      const ativos = Number(r.ativos ?? 0)
      const mrr = Number(r.mrr ?? 0)
      const perdidos = Number(r.perdidos ?? 0)
      const baseInicial = Number(r.base_inicial ?? 0)
      const inicioSerie = porRevendaMes.get(`${cod}|${primeiroMes}`)?.mrr ?? 0
      const fimSerie = porRevendaMes.get(`${cod}|${ultimoMes}`)?.mrr ?? 0
      return {
        codPonto: cod,
        nome: r.descricao || r.razao_social || `Revenda ${cod}`,
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
        perdidos,
        mrr,
        ticketMedio: ativos ? mrr / ativos : 0,
        receitaGanha: Number(r.receita_ganha ?? 0),
        receitaPerdida: Number(r.receita_perdida ?? 0),
        saldoReceita: Number(r.receita_ganha ?? 0) - Number(r.receita_perdida ?? 0),
        semMensalidade: Number(r.sem_mensalidade ?? 0),
        // Churn sobre a base do início do período — sem base, não há taxa a calcular.
        churn: baseInicial ? (perdidos / baseInicial) * 100 : null,
        // Crescimento da receita nos 12 meses, pela série reconstruída.
        crescimento: inicioSerie ? ((fimSerie - inicioSerie) / inicioSerie) * 100 : null,
        serie: meses.map((m) => ({
          mes: m.mes,
          mrr: porRevendaMes.get(`${cod}|${m.mes}`)?.mrr ?? 0,
          ativos: porRevendaMes.get(`${cod}|${m.mes}`)?.ativos ?? 0,
        })),
      }
    })
    const mrrTotal = revendas.reduce((s, l) => s + l.mrr, 0)

    // Clientes que não apontam para revenda nenhuma — ficam de fora das linhas acima.
    const [sem] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q,
              SUM(COALESCE(ativo,'S') = 'S') AS ativos,
              COALESCE(SUM(CASE WHEN COALESCE(ativo,'S') = 'S' THEN mensalidade END), 0) AS mrr
         FROM revenda_externa_cliente WHERE cod_ponto IS NULL OR cod_ponto = 0`).catch(() => [null])

    const [cfg] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ultima_sync, ativo FROM revenda_config ORDER BY id LIMIT 1`)

    const receitaGanha = revendas.reduce((s, l) => s + l.receitaGanha, 0)
    const receitaPerdida = revendas.reduce((s, l) => s + l.receitaPerdida, 0)
    const maior = revendas[0]

    return {
      periodo: { inicio: de, fim: ate },
      externa: {
        configurada: !!cfg?.ativo,
        ultimaSync: cfg?.ultima_sync ?? null,
        revendas: revendas.length,
      },
      resumo: {
        revendas: revendas.length,
        revendasAtivas: revendas.filter((l) => l.ativa).length,
        clientes: revendas.reduce((s, l) => s + l.clientes, 0),
        ativos: revendas.reduce((s, l) => s + l.ativos, 0),
        mrr: mrrTotal,
        novos: revendas.reduce((s, l) => s + l.novos, 0),
        perdidos: revendas.reduce((s, l) => s + l.perdidos, 0),
        receitaGanha,
        receitaPerdida,
        saldoReceita: receitaGanha - receitaPerdida,
        // Quanto da receita depende de uma revenda só.
        concentracao: mrrTotal && maior ? (maior.mrr / mrrTotal) * 100 : null,
        maiorRevenda: maior?.nome ?? null,
        semMensalidade: revendas.reduce((s, l) => s + l.semMensalidade, 0),
      },
      revendas: revendas.map((l) => ({
        ...l,
        participacao: mrrTotal ? (l.mrr / mrrTotal) * 100 : 0,
      })),
      semRevenda: {
        clientes: Number(sem?.q ?? 0),
        ativos: Number(sem?.ativos ?? 0),
        mrr: Number(sem?.mrr ?? 0),
      },
      meses: meses.map((m) => m.mes),
      movimento: movimento.map((m) => ({
        mes: m.mes,
        ganha: Number(m.ganha ?? 0),
        perdida: Number(m.perdida ?? 0),
        saldo: Number(m.ganha ?? 0) - Number(m.perdida ?? 0),
        novos: Number(m.novos ?? 0),
        perdidos: Number(m.perdidos ?? 0),
      })),
      evolucao: movimento.map((m) => ({
        mes: m.mes, novos: Number(m.novos ?? 0), perdidos: Number(m.perdidos ?? 0),
      })),
    }
  })

  app.post('/sincronizar', { preHandler: authMiddleware, schema: { tags: ['Revendas'] } }, async () =>
    sincronizarRevendas())
}
