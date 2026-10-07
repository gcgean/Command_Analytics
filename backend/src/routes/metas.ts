import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { prisma } from '../database/client'

const META_GERAL    = 8333
const META_LIMOEIRO = 2000
const META_ARACATI  = 6333

function n(v: any) { return v == null ? 0 : Number(v) }

const SETORES_META = ['Suporte', 'Fiscal', 'Financeiro', 'Comercial', 'Certificado', 'CS', 'Instalação', 'Treinamento', 'Técnico'] as const

async function tabelaExiste(nomeTabela: string): Promise<boolean> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${nomeTabela}'
  `)

  return Number(row?.total ?? 0) > 0
}

export async function metasRoutes(app: FastifyInstance) {

  app.get('/tipos', { preHandler: authMiddleware }, async () => {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, nome, descricao, ativo, ordem, criado_em AS criadoEm, atualizado_em AS atualizadoEm
      FROM tipo_meta
      ORDER BY ordem ASC, nome ASC
    `

    return rows.map((row) => ({
      id: n(row.id),
      nome: row.nome,
      descricao: row.descricao || '',
      ativo: Number(row.ativo ?? 0) === 1,
      ordem: n(row.ordem),
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    }))
  })

  app.post('/tipos', { preHandler: authMiddleware }, async (request, reply) => {
    const body = request.body as { nome?: string; descricao?: string; ativo?: boolean; ordem?: number }
    const nome = String(body.nome || '').trim()

    if (!nome) {
      return reply.status(400).send({ error: 'Informe o nome do tipo de meta.' })
    }

    await prisma.$executeRaw`
      INSERT INTO tipo_meta (nome, descricao, ativo, ordem, criado_em, atualizado_em)
      VALUES (${nome}, ${String(body.descricao || '').trim() || null}, ${body.ativo === false ? 0 : 1}, ${n(body.ordem)}, NOW(), NOW())
    `

    const [row] = await prisma.$queryRaw<any[]>`
      SELECT id, nome, descricao, ativo, ordem, criado_em AS criadoEm, atualizado_em AS atualizadoEm
      FROM tipo_meta
      WHERE nome = ${nome}
      ORDER BY id DESC
      LIMIT 1
    `

    return {
      id: n(row?.id),
      nome: row?.nome || nome,
      descricao: row?.descricao || '',
      ativo: Number(row?.ativo ?? 0) === 1,
      ordem: n(row?.ordem),
      criadoEm: row?.criadoEm ?? null,
      atualizadoEm: row?.atualizadoEm ?? null,
    }
  })

  app.put('/tipos/:id', { preHandler: authMiddleware }, async (request, reply) => {
    const id = n((request.params as any)?.id)
    const body = request.body as { nome?: string; descricao?: string; ativo?: boolean; ordem?: number }
    const nome = String(body.nome || '').trim()

    if (!id) return reply.status(400).send({ error: 'Tipo de meta inválido.' })
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do tipo de meta.' })

    await prisma.$executeRaw`
      UPDATE tipo_meta
         SET nome = ${nome},
             descricao = ${String(body.descricao || '').trim() || null},
             ativo = ${body.ativo === false ? 0 : 1},
             ordem = ${n(body.ordem)},
             atualizado_em = NOW()
       WHERE id = ${id}
    `

    return { ok: true }
  })

  app.get('/cadastro', { preHandler: authMiddleware }, async () => {
    const metas = await prisma.$queryRaw<any[]>`
      SELECT m.id, m.nome, m.descricao, m.tipo_meta_id AS tipoMetaId, tm.nome AS tipoMetaNome,
             m.setor_responsavel AS setorResponsavel, m.valor_meta AS valorMeta,
             m.competencia, m.data_inicio AS dataInicio, m.data_fim AS dataFim,
             m.ativo, m.criado_em AS criadoEm, m.atualizado_em AS atualizadoEm
        FROM meta_cadastro m
        LEFT JOIN tipo_meta tm ON tm.id = m.tipo_meta_id
       ORDER BY m.ativo DESC, m.setor_responsavel ASC, m.nome ASC
    `

    const vinculos = await prisma.$queryRaw<any[]>`
      SELECT mu.meta_id AS metaId, mu.usuario_id AS usuarioId,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuarioNome
        FROM meta_cadastro_usuario mu
        INNER JOIN usuario u ON u.COD_USU = mu.usuario_id
    `

    const vinculosPorMeta = new Map<number, Array<{ usuarioId: number; usuarioNome: string }>>()
    for (const vinculo of vinculos) {
      const metaId = n(vinculo.metaId)
      if (!vinculosPorMeta.has(metaId)) vinculosPorMeta.set(metaId, [])
      vinculosPorMeta.get(metaId)!.push({
        usuarioId: n(vinculo.usuarioId),
        usuarioNome: vinculo.usuarioNome || 'Usuário',
      })
    }

    return metas.map((row) => ({
      id: n(row.id),
      nome: row.nome,
      descricao: row.descricao || '',
      tipoMetaId: row.tipoMetaId ? n(row.tipoMetaId) : null,
      tipoMetaNome: row.tipoMetaNome || null,
      setorResponsavel: row.setorResponsavel,
      valorMeta: n(row.valorMeta),
      competencia: row.competencia || '',
      dataInicio: row.dataInicio ? String(row.dataInicio).slice(0, 10) : '',
      dataFim: row.dataFim ? String(row.dataFim).slice(0, 10) : '',
      ativo: Number(row.ativo ?? 0) === 1,
      usuariosVisualizacao: vinculosPorMeta.get(n(row.id)) || [],
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    }))
  })

  app.post('/cadastro', { preHandler: authMiddleware }, async (request, reply) => {
    const body = request.body as {
      nome?: string
      descricao?: string
      tipoMetaId?: number | null
      setorResponsavel?: string
      valorMeta?: number
      competencia?: string
      dataInicio?: string
      dataFim?: string
      ativo?: boolean
      usuariosVisualizacao?: number[]
    }

    const nome = String(body.nome || '').trim()
    const setorResponsavel = String(body.setorResponsavel || '').trim()

    if (!nome) return reply.status(400).send({ error: 'Informe o nome da meta.' })
    if (!setorResponsavel) return reply.status(400).send({ error: 'Informe o setor responsável.' })
    if (!SETORES_META.includes(setorResponsavel as any)) return reply.status(400).send({ error: 'Setor responsável inválido.' })

    await prisma.$executeRaw`
      INSERT INTO meta_cadastro (
        nome, descricao, tipo_meta_id, setor_responsavel, valor_meta, competencia, data_inicio, data_fim, ativo, criado_em, atualizado_em
      ) VALUES (
        ${nome},
        ${String(body.descricao || '').trim() || null},
        ${body.tipoMetaId ? n(body.tipoMetaId) : null},
        ${setorResponsavel},
        ${Number(body.valorMeta || 0)},
        ${String(body.competencia || '').trim() || null},
        ${String(body.dataInicio || '').trim() || null},
        ${String(body.dataFim || '').trim() || null},
        ${body.ativo === false ? 0 : 1},
        NOW(),
        NOW()
      )
    `

    const [metaCriada] = await prisma.$queryRaw<any[]>`
      SELECT id FROM meta_cadastro
      WHERE nome = ${nome}
      ORDER BY id DESC
      LIMIT 1
    `

    const metaId = n(metaCriada?.id)
    const usuarios = Array.from(new Set((body.usuariosVisualizacao || []).map((id) => n(id)).filter(Boolean)))

    for (const usuarioId of usuarios) {
      await prisma.$executeRaw`
        INSERT IGNORE INTO meta_cadastro_usuario (meta_id, usuario_id, criado_em)
        VALUES (${metaId}, ${usuarioId}, NOW())
      `
    }

    return { ok: true, id: metaId }
  })

  app.put('/cadastro/:id', { preHandler: authMiddleware }, async (request, reply) => {
    const id = n((request.params as any)?.id)
    const body = request.body as {
      nome?: string
      descricao?: string
      tipoMetaId?: number | null
      setorResponsavel?: string
      valorMeta?: number
      competencia?: string
      dataInicio?: string
      dataFim?: string
      ativo?: boolean
      usuariosVisualizacao?: number[]
    }

    const nome = String(body.nome || '').trim()
    const setorResponsavel = String(body.setorResponsavel || '').trim()

    if (!id) return reply.status(400).send({ error: 'Meta inválida.' })
    if (!nome) return reply.status(400).send({ error: 'Informe o nome da meta.' })
    if (!setorResponsavel) return reply.status(400).send({ error: 'Informe o setor responsável.' })
    if (!SETORES_META.includes(setorResponsavel as any)) return reply.status(400).send({ error: 'Setor responsável inválido.' })

    await prisma.$executeRaw`
      UPDATE meta_cadastro
         SET nome = ${nome},
             descricao = ${String(body.descricao || '').trim() || null},
             tipo_meta_id = ${body.tipoMetaId ? n(body.tipoMetaId) : null},
             setor_responsavel = ${setorResponsavel},
             valor_meta = ${Number(body.valorMeta || 0)},
             competencia = ${String(body.competencia || '').trim() || null},
             data_inicio = ${String(body.dataInicio || '').trim() || null},
             data_fim = ${String(body.dataFim || '').trim() || null},
             ativo = ${body.ativo === false ? 0 : 1},
             atualizado_em = NOW()
       WHERE id = ${id}
    `

    await prisma.$executeRaw`DELETE FROM meta_cadastro_usuario WHERE meta_id = ${id}`

    const usuarios = Array.from(new Set((body.usuariosVisualizacao || []).map((usuarioId) => n(usuarioId)).filter(Boolean)))
    for (const usuarioId of usuarios) {
      await prisma.$executeRaw`
        INSERT IGNORE INTO meta_cadastro_usuario (meta_id, usuario_id, criado_em)
        VALUES (${id}, ${usuarioId}, NOW())
      `
    }

    return { ok: true }
  })

  // ── GET /metas/comercial ─────────────────────────────────────────
  app.get('/comercial', { preHandler: authMiddleware }, async (request) => {
    console.log('🔧 DEBUG: /metas/comercial route accessed')
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
    const possuiMotivoClienteDesativado = await tabelaExiste('motivo_cliente_desativado').catch(() => false)

    const labelMes = new Date(ano, mesNum - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    // 1. Upgrades
    const [upgRow] = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
      FROM comissoes_funcionario co
      INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      WHERE CAST(co.data_venda AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
    `.catch((err) => { console.error('Erro upgrades (summary):', err); return [{ valor: 0 }] })

    // 2. Clientes novos
    const [novosRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
    `.catch((err) => { console.error('Erro clientes novos (summary):', err); return [{ qtd: 0, valor: 0 }] })

    // 3. Clientes perdidos
    // A tabela historico_bloqueio_cliente daqui NAO e a do Firebird que o Delphi usa: tem outro
    // esquema (id_cliente/status_atual, sem `tipo` nem `data_hora_bloqueio_desbloqueio`) e parou
    // de receber dados em 11/2023. A consulta antiga falhava e o .catch devolvia zero — por isso o
    // boletim mostrava "Perdidos 0" para sempre. A fonte viavel aqui e a propria tabela cliente:
    // quem esta inativo e tem data de desativacao dentro do periodo.
    const [perdRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'N'
        AND c.DATA_DESATIVACAO BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30
    `.catch((err) => { console.error('Erro clientes perdidos (summary):', err); return [{ qtd: 0, valor: 0 }] })

    // 3b. Clientes reativados — estavam desativados e voltaram: hoje ativos, com a desativacao
    // datada dentro do periodo. Quem entrou como cliente novo no mesmo periodo fica de fora, senao
    // a mensalidade entraria duas vezes no realizado (o sistema legado conta duas vezes).
    const [reativRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATA_DESATIVACAO BETWEEN ${dataIni} AND ${dataFim}
        AND NOT (c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim})
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
    `.catch((err) => { console.error('Erro clientes reativados (summary):', err); return [{ qtd: 0, valor: 0 }] })

    // 4. Total ativos
    const [totalRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(cod_cli) AS qtd FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8,816) AND c.cod_cli < 10000000
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        AND c.ATIVO = 'S'
    `.catch((err) => { console.error('Erro total ativos:', err); return [{ qtd: 0 }] })

    // 5. Por filial
    const porFilialRaw = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(NULLIF(p.descricao, ''), CONCAT('Filial ', c.COD_CON)) AS nome,
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
      GROUP BY c.COD_CON, p.descricao
      ORDER BY valor DESC
    `.catch((err) => { console.error('Erro por filial:', err); return [] as any[] })

    // 6. Evolução 12 meses com comparativo do ano anterior
    const evolucao: any[] = []
    for (let i = 11; i >= 0; i--) {
      const d    = new Date(ano, mesNum - 1 - i, 1)
      const dAnt = new Date(d.getFullYear() - 1, d.getMonth(), 1)

      const ini    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const ld     = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const fim    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${ld}`
      const iniAnt = `${dAnt.getFullYear()}-${String(dAnt.getMonth() + 1).padStart(2, '0')}-01`
      const ldAnt  = new Date(dAnt.getFullYear(), dAnt.getMonth() + 1, 0).getDate()
      const fimAnt = `${dAnt.getFullYear()}-${String(dAnt.getMonth() + 1).padStart(2, '0')}-${ldAnt}`

      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '').replace(' de ', '/')

      const [[ev], [up], [evAnt], [upAnt], [perd], [reat], [pay]] = await Promise.all([
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
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(c.valor_mensalidade),0) AS vNovos, COUNT(c.cod_cli) AS qtd
          FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'S' AND c.DATACADASTRO_CLI BETWEEN ${iniAnt} AND ${fimAnt}
            AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL,0) <> 8
        `.catch(() => [{ vNovos: 0, qtd: 0 }]),
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(co.Valor_operacao),0) AS vUpg
          FROM comissoes_funcionario co
          INNER JOIN cliente c ON c.cod_cli = co.cod_cli
          WHERE CAST(co.data_venda AS DATE) BETWEEN ${iniAnt} AND ${fimAnt}
            AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
        `.catch(() => [{ vUpg: 0 }]),
        // Receita que saiu no mês: mesma regra do resumo (cliente inativo com a desativação no mês).
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(c.valor_mensalidade),0) AS vPerd, COUNT(c.cod_cli) AS qtd
          FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'N' AND c.DATA_DESATIVACAO BETWEEN ${ini} AND ${fim}
            AND c.cod_cla <> 30
        `.catch(() => [{ vPerd: 0, qtd: 0 }]),
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(c.valor_mensalidade),0) AS vReat
          FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'S' AND c.DATA_DESATIVACAO BETWEEN ${ini} AND ${fim}
            AND NOT (c.DATACADASTRO_CLI BETWEEN ${ini} AND ${fim})
            AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL,0) <> 8
        `.catch(() => [{ vReat: 0 }]),
        // PayCore: mesma regra do realizado, para a tendência não contradizer o topo da tela.
        prisma.$queryRaw<any[]>`
          SELECT COALESCE(SUM(a.mensal + a.valor_modulos),0) AS vPay
          FROM paycore_assinatura a
          LEFT JOIN paycore_cliente pc
            ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
          LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
          WHERE DATE(a.inicio) BETWEEN ${ini} AND ${fim}
            AND (c.cod_cli IS NULL OR NOT (DATE(c.DATACADASTRO_CLI) BETWEEN ${ini} AND ${fim}))
        `.catch(() => [{ vPay: 0 }]),
      ])

      const receitaNovaMes    = n(ev.vNovos) + n(up.vUpg) + n(reat.vReat) + n(pay.vPay)
      const receitaPerdidaMes = n(perd.vPerd)

      evolucao.push({
        mes: label,
        receitaNova: receitaNovaMes,
        clientesNovos: n(ev.qtd),
        anoAnterior: n(evAnt.vNovos) + n(upAnt.vUpg),
        meta: META_GERAL,
        // Entradas x saídas do mês: é o que mostra quanto de receita nova realmente sobra.
        receitaPerdida: receitaPerdidaMes,
        clientesPerdidos: n(perd.qtd),
        saldo: receitaNovaMes - receitaPerdidaMes,
      })
    }

    // ── MRR mês a mês ────────────────────────────────────────────────
    // Base recorrente no fim de cada mês: soma da mensalidade de quem já era cliente naquela data e
    // ainda não tinha saído. Usa o valor de mensalidade de HOJE, porque o banco não guarda o
    // histórico de reajustes — então é a base de clientes que é reconstruída, não o preço de cada
    // um. Para leitura de tendência serve; não é um relatório contábil.
    const mrr: Array<{ mes: string; valor: number; clientes: number; variacao: number; variacaoPerc: number | null }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ano, mesNum - 1 - i, 1)
      const ld = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const fimMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${ld}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '').replace(' de ', '/')

      const [linha] = await prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(c.valor_mensalidade),0) AS valor, COUNT(c.cod_cli) AS qtd
        FROM cliente c
        WHERE c.cod_cli NOT IN (1,6,7,8,816) AND c.cod_cli < 10000000
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL,0) <> 8
          AND c.DATACADASTRO_CLI <= ${fimMes}
          AND (c.ATIVO = 'S' OR c.DATA_DESATIVACAO IS NULL OR c.DATA_DESATIVACAO > ${fimMes})
      `.catch(() => [{ valor: 0, qtd: 0 }])

      const valor = n(linha.valor)
      const anterior = mrr.length ? mrr[mrr.length - 1].valor : 0
      mrr.push({
        mes: label,
        valor,
        clientes: n(linha.qtd),
        variacao: mrr.length ? valor - anterior : 0,
        variacaoPerc: mrr.length && anterior > 0 ? ((valor - anterior) / anterior) * 100 : null,
      })
    }

    // ── Projeção dos próximos 12 meses ───────────────────────────────
    // Parte do MRR atual e soma, a cada mês, a média do que entrou menos a média do que saiu nos
    // últimos 12 meses. É uma projeção de tendência: mantém o ritmo observado, sem prever nada
    // novo (campanha, reajuste, perda grande de um cliente específico).
    const mesesBase = evolucao.length || 1
    const mediaEntrada = evolucao.reduce((soma, e: any) => soma + (e.receitaNova ?? 0), 0) / mesesBase
    const mediaSaida = evolucao.reduce((soma, e: any) => soma + (e.receitaPerdida ?? 0), 0) / mesesBase
    const crescimentoMedioMes = mediaEntrada - mediaSaida
    const mrrAtual = mrr.length ? mrr[mrr.length - 1].valor : 0

    const projecao: Array<{ mes: string; valor: number; acumulado: number }> = []
    for (let i = 1; i <= 12; i++) {
      const d = new Date(ano, mesNum - 1 + i, 1)
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '').replace(' de ', '/')
      const valor = mrrAtual + crescimentoMedioMes * i
      projecao.push({ mes: label, valor, acumulado: crescimentoMedioMes * i })
    }

    // ── PayCore ──
    // O boletim mede receita RECORRENTE nova, então o que entra na meta é a mensalidade das
    // assinaturas que começaram no período — não o caixa recebido, que é outra unidade.
    // Assinatura de cliente que já foi contado como "novo" aqui fica de fora, senão a mesma
    // receita entraria duas vezes na meta.
    const [paycoreRow] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         LEFT JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
          AND (c.cod_cli IS NULL OR DATE(c.DATACADASTRO_CLI) NOT BETWEEN ? AND ?)`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch((err) => { console.error('Erro PayCore (meta):', err); return [{ qtd: 0, valor: 0 }] })

    // Caixa efetivamente recebido no período. Fica fora da meta, só como informação.
    const [paycoreCaixaRow] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS bruto,
              COALESCE(SUM(COALESCE(valor_liquido, valor)), 0) AS liquido
         FROM paycore_faturamento
        WHERE status = 'succeeded' AND DATE(pago_em) BETWEEN ? AND ?`,
      dataIni, dataFim,
    ).catch(() => [{ qtd: 0, bruto: 0, liquido: 0 }])

    const paycoreDetail = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.subscription_id, a.cliente_nome, a.app_nome, a.plano,
              (a.mensal + a.valor_modulos) AS valor, a.inicio, a.status,
              s.nome AS servidor, pc.cod_cli, pc.vendedor_nome,
              (c.cod_cli IS NOT NULL AND DATE(c.DATACADASTRO_CLI) BETWEEN ? AND ?) AS jaContado
         FROM paycore_assinatura a
         LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
         LEFT JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
        ORDER BY a.inicio DESC`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch(() => [] as any[])

    // Receita nova dia a dia do período: é o que permite comparar o acumulado com o ritmo ideal.
    const porDiaRaw = await prisma.$queryRawUnsafe<any[]>(
      `SELECT dia, SUM(valor) AS valor FROM (
         SELECT DATE(c.DATACADASTRO_CLI) AS dia, c.valor_mensalidade AS valor
           FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
            AND c.DATACADASTRO_CLI BETWEEN ? AND ?
            AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
         UNION ALL
         SELECT CAST(co.data_venda AS DATE) AS dia, co.Valor_operacao AS valor
           FROM comissoes_funcionario co
           INNER JOIN cliente c ON c.cod_cli = co.cod_cli
          WHERE CAST(co.data_venda AS DATE) BETWEEN ? AND ?
            AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
         UNION ALL
         SELECT DATE(c.DATA_DESATIVACAO) AS dia, c.valor_mensalidade AS valor
           FROM cliente c
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
            AND c.DATA_DESATIVACAO BETWEEN ? AND ?
            AND NOT (c.DATACADASTRO_CLI BETWEEN ? AND ?)
            AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
         UNION ALL
         SELECT DATE(a.inicio) AS dia, (a.mensal + a.valor_modulos) AS valor
           FROM paycore_assinatura a
           LEFT JOIN paycore_cliente pc
             ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
           LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
          WHERE DATE(a.inicio) BETWEEN ? AND ?
            AND (c.cod_cli IS NULL OR DATE(c.DATACADASTRO_CLI) NOT BETWEEN ? AND ?)
       ) x WHERE dia IS NOT NULL GROUP BY dia ORDER BY dia`,
      dataIni, dataFim, dataIni, dataFim, dataIni, dataFim, dataIni, dataFim,
      dataIni, dataFim, dataIni, dataFim,
    ).catch((err) => { console.error('Erro receita por dia:', err); return [] as any[] })

    // ── Quebras da receita nova: produto, plano e vendedor ──
    // Tudo medido na mesma unidade da meta (mensalidade nova), para as partes somarem o todo.

    // PayCore por produto e plano. A mesma exclusão de dupla contagem do somatório da meta.
    const paycorePorPlano = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(s.nome, 'PayCore') AS servidor,
              COALESCE(a.app_nome, 'Sem produto') AS produto,
              COALESCE(NULLIF(a.plano, ''), 'Sem plano') AS plano,
              a.periodicidade,
              COUNT(*) AS assinaturas,
              COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
         LEFT JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
          AND (c.cod_cli IS NULL OR DATE(c.DATACADASTRO_CLI) NOT BETWEEN ? AND ?)
        GROUP BY servidor, produto, plano, a.periodicidade
        ORDER BY valor DESC`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch(() => [] as any[])

    // Vendedor das assinaturas do PayCore (vem do CRM / precificação, via paycore_cliente).
    const paycorePorVendedor = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(NULLIF(pc.vendedor_nome, ''), 'Sem vendedor') AS vendedor,
              COUNT(*) AS qtd, COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         LEFT JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
          AND (c.cod_cli IS NULL OR DATE(c.DATACADASTRO_CLI) NOT BETWEEN ? AND ?)
        GROUP BY vendedor`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch(() => [] as any[])

    // Upgrades por vendedor — aqui o vendedor é o da própria operação de comissão.
    const upgradesPorVendedor = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(NULLIF(u.NOME_USU, ''), 'Sem vendedor') AS vendedor,
             COUNT(*) AS qtd, COALESCE(SUM(co.Valor_operacao), 0) AS valor
      FROM comissoes_funcionario co
      INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      LEFT JOIN usuario u ON u.COD_USU = co.cod_func
      WHERE CAST(co.data_venda AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
      GROUP BY vendedor
    `.catch(() => [] as any[])

    // Clientes novos e reativados por vendedor. A tabela `cliente` não guarda vendedor, então a
    // atribuição vem do CRM pelo CNPJ (último vendedor que atendeu) e, na falta dele, de quem fez
    // o cadastro. Sem isso a soma por vendedor ficava menor que a soma por produto.
    const vendedorDoCliente = `COALESCE(
      (SELECT nn.vendedor_nome FROM crm_negocio nn
        WHERE nn.documento = REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','')
          AND nn.vendedor_nome IS NOT NULL AND nn.vendedor_nome <> ''
        ORDER BY COALESCE(nn.finalizado_em, nn.criado_em, nn.data) DESC, nn.id DESC LIMIT 1),
      NULLIF(u.NOME_USU, ''),
      'Sem vendedor')`

    const novosPorVendedor = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${vendedorDoCliente} AS vendedor,
              COUNT(*) AS qtd, COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
         LEFT JOIN usuario u ON u.COD_USU = c.cod_usu_local_Cad
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
          AND c.DATACADASTRO_CLI BETWEEN ? AND ?
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        GROUP BY vendedor`,
      dataIni, dataFim,
    ).catch((err) => { console.error('Erro novos por vendedor:', err); return [] as any[] })

    const reativadosPorVendedor = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${vendedorDoCliente} AS vendedor,
              COUNT(*) AS qtd, COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
         LEFT JOIN usuario u ON u.COD_USU = c.cod_usu_local_Cad
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
          AND c.DATA_DESATIVACAO BETWEEN ? AND ?
          AND NOT (c.DATACADASTRO_CLI BETWEEN ? AND ?)
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        GROUP BY vendedor`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch(() => [] as any[])

    // Receita em risco: assinatura suspensa ainda ocupa a base mas pode nunca mais pagar.
    const paycoreSaude = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(a.status, 'desconhecido') AS status, COUNT(*) AS qtd,
              COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a GROUP BY a.status`,
    ).catch(() => [] as any[])

    // Como os clientes do PayCore pagam — boleto que atrasa é cobrança manual depois.
    const paycorePorMetodo = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(metodo, 'não informado') AS metodo, COUNT(*) AS qtd,
              COALESCE(SUM(valor), 0) AS bruto,
              SUM(valor_liquido IS NULL) AS sem_liquido,
              COALESCE(SUM(COALESCE(valor_liquido, valor)), 0) AS liquido
         FROM paycore_faturamento
        WHERE status = 'succeeded' AND DATE(pago_em) BETWEEN ? AND ?
        GROUP BY metodo ORDER BY bruto DESC`,
      dataIni, dataFim,
    ).catch(() => [] as any[])

    const valorUpgrades      = n(upgRow.valor)
    const valorClientesNovos = n(novosRow.valor)
    const qtdNovos           = n(novosRow.qtd)
    const qtdPerdidos        = n(perdRow.qtd)
    const receitaPerdida     = n(perdRow.valor)
    const qtdReativados      = n(reativRow.qtd)
    const valorReativados    = n(reativRow.valor)
    const totalAtivos        = n(totalRow.qtd)
    const qtdPaycore         = n(paycoreRow.qtd)
    const valorPaycore       = n(paycoreRow.valor)
    // Reativado entra no realizado igual ao legado: e receita que voltou no periodo.
    const receitaNova        = valorUpgrades + valorClientesNovos + valorReativados + valorPaycore
    const receitaLiquida     = receitaNova - receitaPerdida
    const percMeta           = META_GERAL > 0 ? (receitaNova / META_GERAL) * 100 : 0

    // Upgrades e PayCore por filial, para a filial ser medida com a mesma régua da meta geral.
    const upgPorFilial = await prisma.$queryRaw<any[]>`
      SELECT c.COD_CON AS codCon, COALESCE(SUM(co.Valor_operacao), 0) AS valor
      FROM comissoes_funcionario co
      INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      WHERE CAST(co.data_venda AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30 AND c.COD_CON IS NOT NULL
      GROUP BY c.COD_CON
    `.catch(() => [] as any[])

    const paycorePorFilial = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.COD_CON AS codCon, COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         INNER JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         INNER JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
          AND NOT (DATE(c.DATACADASTRO_CLI) BETWEEN ? AND ?)
          AND c.COD_CON IS NOT NULL
        GROUP BY c.COD_CON`,
      dataIni, dataFim, dataIni, dataFim,
    ).catch(() => [] as any[])

    const extraFilial = new Map<number, { upgrades: number; paycore: number }>()
    for (const u of upgPorFilial) {
      const cod = n(u.codCon)
      const at = extraFilial.get(cod) ?? { upgrades: 0, paycore: 0 }
      at.upgrades += n(u.valor)
      extraFilial.set(cod, at)
    }
    for (const u of paycorePorFilial) {
      const cod = n(u.codCon)
      const at = extraFilial.get(cod) ?? { upgrades: 0, paycore: 0 }
      at.paycore += n(u.valor)
      extraFilial.set(cod, at)
    }

    const filialMetas: Record<number, number> = { 1: META_LIMOEIRO, 2: META_ARACATI }
    const codsFilial = new Set<number>([
      ...porFilialRaw.map((f: any) => n(f.codCon)),
      ...extraFilial.keys(),
    ])
    const porFilial = [...codsFilial].map((cod) => {
      const f = porFilialRaw.find((x: any) => n(x.codCon) === cod)
      const extra = extraFilial.get(cod) ?? { upgrades: 0, paycore: 0 }
      const novos = n(f?.valor)
      const val = novos + extra.upgrades + extra.paycore
      const metaF = filialMetas[cod] ?? 0
      return {
        nome: f?.nome ?? `Filial ${cod}`,
        codCon: cod,
        qtd: n(f?.qtd),
        valor: val,
        novos,
        upgrades: extra.upgrades,
        paycore: extra.paycore,
        meta: metaF,
        perc: metaF > 0 ? (val / metaF) * 100 : 0,
      }
    }).sort((a, b) => b.valor - a.valor)

    // Detalhes de clientes novos (apenas NOVO - para simplificar)
    const clientesNovosDetail = await prisma.$queryRaw<any[]>`
      SELECT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome, c.valor_mensalidade AS valor,
             c.CIDRES_CLI AS cidade, CAST(c.DATACADASTRO_CLI AS DATE) AS data_cadastro,
             COALESCE(cc.NOME_CLA, 'SEM CLASSIFICACAO') AS segmento,
             'NOVO' AS tipo
      FROM cliente c
      LEFT JOIN classif_cliente cc ON cc.COD_CLA = c.cod_cla
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
      ORDER BY c.DATACADASTRO_CLI DESC
    `.catch((err) => { console.error('Erro clientes novos:', err); return [] as any[] })

    // Detalhe dos reativados — mesma regra do resumo, pra tela poder listar quem voltou.
    const clientesReativadosDetail = await prisma.$queryRaw<any[]>`
      SELECT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome, c.valor_mensalidade AS valor,
             c.CIDRES_CLI AS cidade, CAST(c.DATA_DESATIVACAO AS DATE) AS data_desativacao,
             COALESCE(cc.NOME_CLA, 'SEM CLASSIFICACAO') AS segmento
      FROM cliente c
      LEFT JOIN classif_cliente cc ON cc.COD_CLA = c.cod_cla
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATA_DESATIVACAO BETWEEN ${dataIni} AND ${dataFim}
        AND NOT (c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim})
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
      ORDER BY c.DATA_DESATIVACAO DESC
    `.catch((err) => { console.error('Erro clientes reativados:', err); return [] as any[] })

    // Detalhes de clientes perdidos
    const clientesPerdidosDetail = await prisma.$queryRaw<any[]>`
      SELECT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome, c.valor_mensalidade AS valor,
             c.CIDRES_CLI AS cidade, CAST(c.DATA_DESATIVACAO AS DATE) AS data_desativacao
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'N'
        AND c.DATA_DESATIVACAO BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30
      ORDER BY c.DATA_DESATIVACAO DESC
    `.catch((err) => { console.error('Erro clientes perdidos:', err); return [] as any[] })

    // Detalhes de upgrades
    const upgradesDetail = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(u.NOME_USU, 'N/A') AS vendedor, c.NOME_FANTASIA AS cliente,
             'Upgrade de serviço' AS descricao, co.Valor_operacao AS valor,
             CAST(co.data_venda AS DATE) AS data_venda
      FROM comissoes_funcionario co
      INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      LEFT JOIN usuario u ON u.COD_USU = co.cod_func
      WHERE CAST(co.data_venda AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30
      ORDER BY co.data_venda DESC
    `.catch((err) => { console.error('Erro upgrades:', err); return [] as any[] })

    // Novos clientes por cidade
    const novosPorCidade = await prisma.$queryRaw<any[]>`
      SELECT c.CIDRES_CLI AS cidade, COUNT(c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        AND c.CIDRES_CLI IS NOT NULL
      GROUP BY c.CIDRES_CLI
      ORDER BY valor DESC
    `.catch((err) => { console.error('Erro novos por cidade:', err); return [] as any[] })

    // Novos clientes por segmento
    const novosPorSegmento = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(cc.NOME_CLA, 'SEM CLASSIFICACAO') AS seguimento,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor_total,
             COUNT(c.cod_cli) AS quantidade
      FROM cliente c
      LEFT JOIN classif_cliente cc ON cc.COD_CLA = c.cod_cla
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
      GROUP BY seguimento
      ORDER BY valor_total DESC, seguimento
    `.catch((err) => { console.error('Erro novos por segmento:', err); return [] as any[] })

    // Clientes perdidos detalhado
    const clientesPerdidosDetalhado = possuiMotivoClienteDesativado
      ? await prisma.$queryRaw<any[]>`
          SELECT DISTINCT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome,
                 c.valor_mensalidade AS valor,
                 CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) AS data_desativacao,
                 c.CIDRES_CLI AS cidade, c.telres_cli AS telefone,
                 COALESCE(m.descricao, 'Não informado') AS motivo
          FROM historico_bloqueio_cliente hb
          INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
          LEFT JOIN motivo_cliente_desativado m ON m.cod_motivo = hb.cod_motivo_desativacao
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'N'
            AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
            AND c.cod_cla <> 30
            AND hb.tipo = 'D'
          ORDER BY hb.data_hora_bloqueio_desbloqueio DESC
        `.catch((err) => { console.error('Erro clientes perdidos detalhado:', err); return [] as any[] })
      : await prisma.$queryRaw<any[]>`
          SELECT DISTINCT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome,
                 c.valor_mensalidade AS valor,
                 CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) AS data_desativacao,
                 c.CIDRES_CLI AS cidade, c.telres_cli AS telefone,
                 'Não informado' AS motivo
          FROM historico_bloqueio_cliente hb
          INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND c.ATIVO = 'N'
            AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
            AND c.cod_cla <> 30
            AND hb.tipo = 'D'
          ORDER BY hb.data_hora_bloqueio_desbloqueio DESC
        `.catch((err) => { console.error('Erro clientes perdidos detalhado:', err); return [] as any[] })

    // Clientes perdidos por motivo (resumido)
    const perdidosPorMotivo = possuiMotivoClienteDesativado
      ? await prisma.$queryRaw<any[]>`
          SELECT COALESCE(m.descricao, 'Não informado') AS motivo,
                 COUNT(DISTINCT hb.cod_cli) AS quantidade
          FROM historico_bloqueio_cliente hb
          INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
          LEFT JOIN motivo_cliente_desativado m ON m.cod_motivo = hb.cod_motivo_desativacao
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
            AND c.cod_cla <> 30
            AND hb.tipo = 'D'
          GROUP BY m.descricao
          ORDER BY quantidade DESC
        `.catch((err) => { console.error('Erro perdidos por motivo:', err); return [] as any[] })
      : await prisma.$queryRaw<any[]>`
          SELECT 'Não informado' AS motivo,
                 COUNT(DISTINCT hb.cod_cli) AS quantidade
          FROM historico_bloqueio_cliente hb
          INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
          WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
            AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
            AND c.cod_cla <> 30
            AND hb.tipo = 'D'
        `.catch((err) => { console.error('Erro perdidos por motivo:', err); return [] as any[] })

    /** Moeda dentro de textos gerados no servidor. */
    const brlTexto = (v: number) =>
      Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    // ── Quebra por produto, plano e vendedor ──
    // A base própria entra como um produto só: é como o gestor enxerga o Command vendido aqui.
    const produtos: Array<{
      produto: string; servidor: string | null; origem: 'paycore' | 'base'
      itens: number; valor: number; perc: number; percMeta: number
      composicao?: string
    }> = []

    const porProdutoPaycore = new Map<string, { servidor: string; itens: number; valor: number }>()
    for (const l of paycorePorPlano) {
      const chave = `${l.servidor}|${l.produto}`
      const atual = porProdutoPaycore.get(chave) ?? { servidor: l.servidor, itens: 0, valor: 0 }
      atual.itens += n(l.assinaturas)
      atual.valor += n(l.valor)
      porProdutoPaycore.set(chave, atual)
    }
    for (const [chave, v] of porProdutoPaycore) {
      produtos.push({
        produto: chave.split('|')[1], servidor: v.servidor, origem: 'paycore',
        itens: v.itens, valor: v.valor, perc: 0, percMeta: 0,
      })
    }
    const valorBase = valorClientesNovos + valorUpgrades + valorReativados
    if (valorBase > 0 || produtos.length === 0) {
      produtos.push({
        produto: 'Sistema Command (base própria)', servidor: null, origem: 'base',
        itens: qtdNovos + qtdReativados, valor: valorBase, perc: 0, percMeta: 0,
        // O valor não é só dos clientes novos: diz a composição para ninguém somar errado.
        composicao: [
          qtdNovos > 0 ? `${qtdNovos} cliente(s) novo(s): ${brlTexto(valorClientesNovos)}` : null,
          valorUpgrades > 0 ? `upgrades: ${brlTexto(valorUpgrades)}` : null,
          qtdReativados > 0 ? `${qtdReativados} reativado(s): ${brlTexto(valorReativados)}` : null,
        ].filter(Boolean).join(' · '),
      })
    }
    produtos.sort((a, b) => b.valor - a.valor)
    for (const p of produtos) {
      p.perc = receitaNova > 0 ? (p.valor / receitaNova) * 100 : 0
      p.percMeta = META_GERAL > 0 ? (p.valor / META_GERAL) * 100 : 0
    }

    const planos = paycorePorPlano.map((l: any) => ({
      produto: l.produto,
      plano: l.plano,
      servidor: l.servidor,
      periodicidade: l.periodicidade ?? null,
      assinaturas: n(l.assinaturas),
      valor: n(l.valor),
      perc: receitaNova > 0 ? (n(l.valor) / receitaNova) * 100 : 0,
      percMeta: META_GERAL > 0 ? (n(l.valor) / META_GERAL) * 100 : 0,
    }))

    // Vendedor: junta upgrades da base com as assinaturas do PayCore.
    type Fonte = 'novos' | 'upgrades' | 'reativados' | 'paycore'
    const porVendedor = new Map<string, Record<Fonte, number> & { itens: number }>()
    const somaVend = (nome: string, campo: Fonte, valor: number, itens: number) => {
      const atual = porVendedor.get(nome)
        ?? { novos: 0, upgrades: 0, reativados: 0, paycore: 0, itens: 0 }
      atual[campo] += valor
      atual.itens += itens
      porVendedor.set(nome, atual)
    }
    for (const v of novosPorVendedor)      somaVend(String(v.vendedor), 'novos', n(v.valor), n(v.qtd))
    for (const v of upgradesPorVendedor)   somaVend(String(v.vendedor), 'upgrades', n(v.valor), n(v.qtd))
    for (const v of reativadosPorVendedor) somaVend(String(v.vendedor), 'reativados', n(v.valor), n(v.qtd))
    for (const v of paycorePorVendedor)    somaVend(String(v.vendedor), 'paycore', n(v.valor), n(v.qtd))

    const vendedores = [...porVendedor.entries()]
      .map(([nome, v]) => {
        const total = v.novos + v.upgrades + v.reativados + v.paycore
        return {
          vendedor: nome,
          novos: v.novos,
          upgrades: v.upgrades,
          reativados: v.reativados,
          paycore: v.paycore,
          itens: v.itens,
          valor: total,
          perc: receitaNova > 0 ? (total / receitaNova) * 100 : 0,
          percMeta: META_GERAL > 0 ? (total / META_GERAL) * 100 : 0,
        }
      })
      .sort((a, b) => b.valor - a.valor)

    // Receita nova que não tem vendedor identificado — não dá para cobrar nem premiar ninguém.
    const semVendedor = vendedores.find((v) => v.vendedor === 'Sem vendedor')?.valor ?? 0

    const saudePaycore = paycoreSaude.map((s: any) => ({
      status: String(s.status),
      assinaturas: n(s.qtd),
      valor: n(s.valor),
    }))
    const suspensas = saudePaycore.find((s) => s.status === 'suspended')
    const ativasPaycore = saudePaycore.find((s) => s.status === 'active')

    const metodos = paycorePorMetodo.map((m: any) => ({
      metodo: String(m.metodo),
      pagamentos: n(m.qtd),
      bruto: n(m.bruto),
      liquido: n(m.liquido),
      semLiquido: n(m.sem_liquido),
    }))
    const caixaBruto = metodos.reduce((s, m) => s + m.bruto, 0)
    const pagamentosSemTaxa = metodos.reduce((s, m) => s + m.semLiquido, 0)

    // ── Ritmo: onde deveríamos estar hoje e onde estamos ──
    // Dias corridos, igual ao calendário que o comercial usa para cobrar.
    const diasDecorridosMes = Math.min(lastDay, Math.max(1, lastDay - diasRestantes))
    const metaDiaria   = META_GERAL / lastDay
    const esperadoHoje = metaDiaria * diasDecorridosMes
    const mediaDiaria  = receitaNova / diasDecorridosMes
    // Onde o mês termina se o ritmo de hoje continuar igual até o último dia.
    const projecaoFim  = mediaDiaria * lastDay
    const necessarioPorDia = diasRestantes > 0 ? Math.max(0, META_GERAL - receitaNova) / diasRestantes : 0

    // Acumulado dia a dia, para o gráfico contra a linha do ritmo ideal.
    const porDia = new Map<string, number>()
    for (const d of porDiaRaw) porDia.set(String(d.dia).slice(0, 10), n(d.valor))
    let acumulado = 0
    const curva: Array<{ dia: string; valor: number; acumulado: number | null; ideal: number }> = []
    for (let i = 1; i <= lastDay; i++) {
      const dia = `${ano}-${String(mesNum).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const valor = porDia.get(dia) ?? 0
      acumulado += valor
      curva.push({
        dia,
        valor,
        // Depois de hoje a linha do realizado não existe — não se desenha futuro como se fosse fato.
        acumulado: i <= diasDecorridosMes ? acumulado : null,
        ideal: metaDiaria * i,
      })
    }

    const ritmo = {
      diasNoMes: lastDay,
      diasDecorridos: diasDecorridosMes,
      diasRestantes,
      metaDiaria,
      esperadoHoje,
      percEsperadoHoje: META_GERAL > 0 ? (esperadoHoje / META_GERAL) * 100 : 0,
      mediaDiaria,
      necessarioPorDia,
      projecaoFim,
      percProjecao: META_GERAL > 0 ? (projecaoFim / META_GERAL) * 100 : 0,
      // Negativo = atrás do que deveria ter vendido até hoje.
      distanciaRitmo: receitaNova - esperadoHoje,
      // Quantas vezes o ritmo atual precisa crescer para fechar a meta.
      fatorNecessario: mediaDiaria > 0 && diasRestantes > 0 ? necessarioPorDia / mediaDiaria : null,
      curva,
    }

    // ── Insights: leitura do período, não repetição dos números ──
    const insights: Array<{ tom: 'bom' | 'alerta' | 'critico' | 'neutro'; titulo: string; texto: string }> = []

    // Ritmo necessário para fechar a meta.
    if (META_GERAL > 0 && receitaNova < META_GERAL) {
      const falta = META_GERAL - receitaNova
      const f = ritmo.fatorNecessario
      // O alarme é o ritmo, não o percentual: 22% no dia 7 de 31 é estar em dia.
      const tomRitmo = diasRestantes <= 0 ? 'critico'
        : ritmo.distanciaRitmo >= 0 ? 'bom'
        : f !== null && f > 2 ? 'critico'
        : f !== null && f > 1.25 ? 'alerta'
        : 'neutro'
      insights.push({
        tom: tomRitmo,
        titulo: 'Ritmo para bater a meta',
        texto: diasRestantes <= 0
          ? `O período fechou ${brlTexto(falta)} abaixo da meta.`
          : ritmo.distanciaRitmo >= 0
            ? `No ritmo: ${brlTexto(ritmo.distanciaRitmo)} à frente do esperado para hoje. `
              + `Mantendo ${brlTexto(ritmo.necessarioPorDia)} por dia nos ${diasRestantes} dia(s) restantes, a meta fecha.`
            : `Faltam ${brlTexto(falta)} em ${diasRestantes} dia(s): é preciso fechar ${brlTexto(ritmo.necessarioPorDia)} por dia, contra ${brlTexto(ritmo.mediaDiaria)} por dia no ritmo atual`
              + (f ? ` — ${f.toFixed(1)}x o que vem sendo feito.` : '.'),
      })
    } else if (META_GERAL > 0) {
      insights.push({
        tom: 'bom',
        titulo: 'Meta batida',
        texto: `A meta de ${brlTexto(META_GERAL)} foi superada em ${brlTexto(receitaNova - META_GERAL)}.`,
      })
    }

    // Quanto da receita nova o churn comeu.
    if (receitaPerdida > 0 && receitaNova > 0) {
      const comido = (receitaPerdida / receitaNova) * 100
      insights.push({
        tom: comido >= 100 ? 'critico' : comido >= 50 ? 'alerta' : 'neutro',
        titulo: 'Peso do churn',
        texto: `As saídas levaram ${brlTexto(receitaPerdida)}, ou ${comido.toFixed(0)}% de tudo que entrou. `
          + `Sobraram ${brlTexto(receitaLiquida)} de receita recorrente nova.`,
      })
    }

    // Concentração num produto só.
    if (produtos.length > 1 && produtos[0].perc >= 60) {
      insights.push({
        tom: 'alerta',
        titulo: 'Receita concentrada num produto',
        texto: `${produtos[0].perc.toFixed(0)}% do que entrou veio de "${produtos[0].produto}". `
          + `Se esse produto desacelerar, não há outro sustentando a meta.`,
      })
    }

    // Concentração num vendedor só.
    const vendReais = vendedores.filter((v) => v.vendedor !== 'Sem vendedor')
    if (vendReais.length > 1 && vendReais[0].perc >= 50) {
      insights.push({
        tom: 'alerta',
        titulo: 'Receita concentrada num vendedor',
        texto: `${vendReais[0].vendedor} responde por ${vendReais[0].perc.toFixed(0)}% da receita nova do período.`,
      })
    }

    // Receita sem dono.
    if (semVendedor > 0 && receitaNova > 0) {
      insights.push({
        tom: 'alerta',
        titulo: 'Receita sem vendedor identificado',
        texto: `${brlTexto(semVendedor)} (${((semVendedor / receitaNova) * 100).toFixed(0)}% do período) não têm vendedor vinculado. `
          + `Sem isso não dá para medir desempenho nem calcular comissão.`,
      })
    }

    // Assinaturas suspensas: receita que ainda está na base mas parou de entrar.
    if (suspensas && suspensas.assinaturas > 0) {
      const totalAssin = saudePaycore.reduce((s, x) => s + x.assinaturas, 0)
      insights.push({
        tom: suspensas.assinaturas > (ativasPaycore?.assinaturas ?? 0) ? 'critico' : 'alerta',
        titulo: 'Assinaturas suspensas no PayCore',
        texto: `${suspensas.assinaturas} de ${totalAssin} assinaturas estão suspensas, somando ${brlTexto(suspensas.valor)} por mês. `
          + `É receita que parou de entrar e tende a virar cancelamento se ninguém cobrar.`,
      })
    }

    // Boleto exige cobrança ativa.
    const boleto = metodos.find((m) => m.metodo === 'boleto')
    if (boleto && caixaBruto > 0 && boleto.bruto / caixaBruto >= 0.3) {
      insights.push({
        tom: 'neutro',
        titulo: 'Dependência de boleto',
        texto: `${((boleto.bruto / caixaBruto) * 100).toFixed(0)}% do caixa do período veio de boleto. `
          + `Boleto não renova sozinho: cada mês é uma cobrança a acompanhar.`,
      })
    }

    // Taxa de gateway desconhecida distorce a margem.
    if (pagamentosSemTaxa > 0) {
      insights.push({
        tom: 'neutro',
        titulo: 'Taxas do gateway incompletas',
        texto: `${pagamentosSemTaxa} pagamento(s) do período vieram sem o valor líquido. `
          + `O líquido mostrado está otimista: a taxa desses ainda não foi informada pela plataforma.`,
      })
    }

    const response = {
      periodo: { ano, mes: mesNum, inicio: dataIni, fim: dataFim, diasRestantes, label: labelMes },
      meta: { geral: META_GERAL, limoeiro: META_LIMOEIRO, aracati: META_ARACATI },
      resumo: {
        totalAtivos, qtdNovos, valorClientesNovos,
        qtdPerdidos, receitaPerdida, valorUpgrades,
        qtdReativados, valorReativados,
        qtdPaycore, valorPaycore,
        receitaNova, receitaLiquida, percMeta,
      },
      ritmo,
      // Quebras da receita nova do período, todas na mesma unidade da meta.
      analise: {
        produtos,
        planos,
        vendedores,
        saudePaycore,
        metodos,
        insights,
      },
      paycore: {
        assinaturas: qtdPaycore,
        valor: valorPaycore,
        // Caixa recebido no período — informativo, não entra na meta.
        caixa: {
          pagamentos: n(paycoreCaixaRow?.qtd),
          bruto: n(paycoreCaixaRow?.bruto),
          liquido: n(paycoreCaixaRow?.liquido),
        },
        detalhe: paycoreDetail.map((a: any) => ({
          id: a.subscription_id,
          cliente: a.cliente_nome,
          produto: a.app_nome,
          plano: a.plano,
          valor: n(a.valor),
          inicio: a.inicio,
          status: a.status,
          servidor: a.servidor,
          vendedor: a.vendedor_nome,
          // Já contado como cliente novo na base — não soma de novo na meta.
          jaContado: Number(a.jaContado ?? 0) === 1,
        })),
      },
      porFilial,
      evolucao,
      mrr,
      projecao: {
        mrrAtual,
        mediaEntrada,
        mediaSaida,
        crescimentoMedioMes,
        meses: projecao,
      },
      clientesNovos: clientesNovosDetail.map((c: any) => ({
        codigo: n(c.codigo),
        nome: c.nome,
        valor: n(c.valor),
        cidade: c.cidade,
        data_cadastro: c.data_cadastro,
        segmento: c.segmento,
        tipo: c.tipo,
      })),
      clientesReativados: clientesReativadosDetail.map((c: any) => ({
        codigo: n(c.codigo),
        nome: c.nome,
        valor: n(c.valor),
        cidade: c.cidade,
        data_desativacao: c.data_desativacao,
        segmento: c.segmento,
      })),
      clientesPerdidos: clientesPerdidosDetail.map((c: any) => ({
        codigo: n(c.codigo),
        nome: c.nome,
        valor: n(c.valor),
        cidade: c.cidade,
        data_desativacao: c.data_desativacao,
      })),
      upgrades: upgradesDetail.map((u: any) => ({
        vendedor: u.vendedor || 'N/A',
        cliente: u.cliente,
        descricao: u.descricao,
        valor: n(u.valor),
        data_venda: u.data_venda,
      })),
      novosPorCidade: novosPorCidade.map((nc: any) => ({
        cidade: nc.cidade || 'N/A',
        qtd: n(nc.qtd),
        valor: n(nc.valor),
      })),
      novosPorSegmento: novosPorSegmento.map((ns: any) => ({
        seguimento: ns.seguimento || 'N/A',
        quantidade: n(ns.quantidade),
        valor_total: n(ns.valor_total),
      })),
      clientesPerdidosDetalhado: clientesPerdidosDetalhado.map((c: any) => ({
        codigo: n(c.codigo),
        nome: c.nome,
        valor: n(c.valor),
        data_desativacao: c.data_desativacao,
        cidade: c.cidade,
        telefone: c.telefone,
        motivo: c.motivo,
      })),
      perdidosPorMotivo: perdidosPorMotivo.map((pm: any) => ({
        motivo: pm.motivo,
        quantidade: n(pm.quantidade),
      })),
    }
    return response
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
