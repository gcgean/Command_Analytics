import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { prisma } from '../database/client'

const META_GERAL    = 8333
const META_LIMOEIRO = 2000
const META_ARACATI  = 6333

function n(v: any) { return v == null ? 0 : Number(v) }

export async function metasRoutes(app: FastifyInstance) {

  // ── GET /metas/comercial ─────────────────────────────────────────
  app.get('/comercial', { preHandler: authMiddleware }, async (request) => {
    const { mes } = request.query as { mes?: string }
    const now = new Date()
    let ano = now.getFullYear()
    let mesNum = now.getMonth() + 1

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      [ano, mesNum] = mes.split('-').map(Number)
    }

    const dataIni = `${ano}-${String(mesNum).padStart(2, '0')}-01`
    const lastDay = new Date(ano, mesNum, 0).getDate()
    const dataFim = `${ano}-${String(mesNum).padStart(2, '0')}-${lastDay}`
    const diasRestantes = Math.max(0, Math.ceil(
      (new Date(ano, mesNum - 1, lastDay).getTime() - now.getTime()) / 86400000
    ))

    const labelMes = new Date(ano, mesNum - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    // 1. Upgrades
    const [upgRow] = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
      FROM comissoes_funcionario co
      INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      WHERE CAST(co.data_venda AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
    `.catch(() => [{ valor: 0 }])

    // 2. Clientes novos
    const [novosRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
    `.catch(() => [{ qtd: 0, valor: 0 }])

    // 3. Clientes perdidos
    const [perdRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM historico_bloqueio_cliente hb
      INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND hb.tipo = 'D'
    `.catch(() => [{ qtd: 0, valor: 0 }])

    // 4. Total ativos
    const [totalRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(cod_cli) AS qtd FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8,816) AND c.cod_cli < 10000000
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        AND c.ATIVO = 'S'
    `.catch(() => [{ qtd: 0 }])

    // 5. Por filial
    const porFilialRaw = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(p.NOME_CON, CONCAT('Filial ', c.COD_CON)) AS nome,
             c.COD_CON AS codCon,
             COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      LEFT JOIN ponto_revenda p ON p.cod_ponto = c.COD_CON
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        AND c.COD_CON IS NOT NULL
      GROUP BY c.COD_CON, p.NOME_CON
      ORDER BY valor DESC
    `.catch(() => [] as any[])

    // 6. Evolução 6 meses
    const evolucao: any[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ano, mesNum - 1 - i, 1)
      const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const ld  = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${ld}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '').replace(' de ', '/')

      const [[ev], [up]] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(c.valor_mensalidade),0) AS vNovos, COUNT(c.cod_cli) AS qtd
          FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'S' AND c.DATACADASTRO_CLI BETWEEN ${ini} AND ${fim}
            AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL,0) <> 8
        `.catch(() => [{ vNovos: 0, qtd: 0 }]),
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(co.Valor_operacao),0) AS vUpg
          FROM comissoes_funcionario co
          INNER JOIN cliente c ON c.cod_cli = co.cod_cli
          WHERE CAST(co.data_venda AS DATE) BETWEEN ${ini} AND ${fim}
            AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
        `.catch(() => [{ vUpg: 0 }]),
      ])

      evolucao.push({
        mes: label,
        receitaNova: n(ev.vNovos) + n(up.vUpg),
        clientesNovos: n(ev.qtd),
        meta: META_GERAL,
      })
    }

    const valorUpgrades      = n(upgRow.valor)
    const valorClientesNovos = n(novosRow.valor)
    const qtdNovos           = n(novosRow.qtd)
    const qtdPerdidos        = n(perdRow.qtd)
    const receitaPerdida     = n(perdRow.valor)
    const totalAtivos        = n(totalRow.qtd)
    const receitaNova        = valorUpgrades + valorClientesNovos
    const receitaLiquida     = receitaNova - receitaPerdida
    const percMeta           = META_GERAL > 0 ? (receitaNova / META_GERAL) * 100 : 0

    const filialMetas: Record<number, number> = { 1: META_LIMOEIRO, 2: META_ARACATI }
    const porFilial = porFilialRaw.map((f: any) => {
      const cod = n(f.codCon)
      const val = n(f.valor)
      const metaF = filialMetas[cod] ?? 0
      return {
        nome: f.nome ?? `Filial ${cod}`,
        codCon: cod,
        qtd: n(f.qtd),
        valor: val,
        meta: metaF,
        perc: metaF > 0 ? (val / metaF) * 100 : 0,
      }
    })

    return {
      periodo: { ano, mes: mesNum, inicio: dataIni, fim: dataFim, diasRestantes, label: labelMes },
      meta: { geral: META_GERAL, limoeiro: META_LIMOEIRO, aracati: META_ARACATI },
      resumo: {
        totalAtivos, qtdNovos, valorClientesNovos,
        qtdPerdidos, receitaPerdida, valorUpgrades,
        receitaNova, receitaLiquida, percMeta,
      },
      porFilial,
      evolucao,
    }
  })

  // ── Rotas legadas (mantidas para compatibilidade) ────────────────
  app.get('/', { preHandler: authMiddleware }, async () => [])
  app.get('/nps', { preHandler: authMiddleware }, async () => [])
  app.get('/nps/kpi', { preHandler: authMiddleware }, async () => (
    { nps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0, mediaNotas: 0 }
  ))
  app.post('/', { preHandler: authMiddleware }, async (_req, reply) =>
    reply.status(503).send({ error: 'disabled' }))
  app.put('/:id', { preHandler: authMiddleware }, async (_req, reply) =>
    reply.status(503).send({ error: 'disabled' }))
  app.post('/nps', { preHandler: authMiddleware }, async (_req, reply) =>
    reply.status(503).send({ error: 'disabled' }))
}
