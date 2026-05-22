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
             m.competencia, m.ativo, m.criado_em AS criadoEm, m.atualizado_em AS atualizadoEm
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
        nome, descricao, tipo_meta_id, setor_responsavel, valor_meta, competencia, ativo, criado_em, atualizado_em
      ) VALUES (
        ${nome},
        ${String(body.descricao || '').trim() || null},
        ${body.tipoMetaId ? n(body.tipoMetaId) : null},
        ${setorResponsavel},
        ${Number(body.valorMeta || 0)},
        ${String(body.competencia || '').trim() || null},
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
    const [perdRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT c.cod_cli) AS qtd,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor
      FROM historico_bloqueio_cliente hb
      INNER JOIN cliente c ON c.cod_cli = hb.cod_cli
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND CAST(hb.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND hb.tipo = 'D'
    `.catch((err) => { console.error('Erro clientes perdidos (summary):', err); return [{ qtd: 0, valor: 0 }] })

    // 4. Total ativos
    const [totalRow] = await prisma.$queryRaw<any[]>`
      SELECT COUNT(cod_cli) AS qtd FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8,816) AND c.cod_cli < 10000000
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
        AND c.ATIVO = 'S'
    `.catch((err) => { console.error('Erro total ativos:', err); return [{ qtd: 0 }] })

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

      const [[ev], [up], [evAnt], [upAnt]] = await Promise.all([
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
      ])

      evolucao.push({
        mes: label,
        receitaNova: n(ev.vNovos) + n(up.vUpg),
        clientesNovos: n(ev.qtd),
        anoAnterior: n(evAnt.vNovos) + n(upAnt.vUpg),
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

    // Detalhes de clientes novos (apenas NOVO - para simplificar)
    const clientesNovosDetail = await prisma.$queryRaw<any[]>`
      SELECT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome, c.valor_mensalidade AS valor,
             c.CIDRES_CLI AS cidade, CAST(c.DATACADASTRO_CLI AS DATE) AS data_cadastro,
             'NOVO' AS tipo
      FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
      ORDER BY c.DATACADASTRO_CLI DESC
    `.catch((err) => { console.error('Erro clientes novos:', err); return [] as any[] })

    // Detalhes de clientes perdidos
    const clientesPerdidosDetail = await prisma.$queryRaw<any[]>`
      SELECT c.cod_cli AS codigo, c.NOME_FANTASIA AS nome, c.valor_mensalidade AS valor,
             c.CIDRES_CLI AS cidade,
             CAST(h.data_hora_bloqueio_desbloqueio AS DATE) AS data_desativacao
      FROM historico_bloqueio_cliente h
      INNER JOIN cliente c ON c.cod_cli = h.cod_cli
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND CAST(h.data_hora_bloqueio_desbloqueio AS DATE) BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND h.tipo = 'D'
      ORDER BY h.data_hora_bloqueio_desbloqueio DESC
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
      SELECT cc.NOME_CLA AS seguimento,
             COALESCE(SUM(c.valor_mensalidade), 0) AS valor_total,
             COUNT(c.cod_cli) AS quantidade
      FROM cliente c
      INNER JOIN classif_cliente cc ON cc.COD_CLA = c.cod_cla
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
        AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ${dataIni} AND ${dataFim}
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
      GROUP BY cc.NOME_CLA
      ORDER BY valor_total DESC, cc.NOME_CLA
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

    const response = {
      periodo: { ano, mes: mesNum, inicio: dataIni, fim: dataFim, diasRestantes, label: labelMes },
      meta: { geral: META_GERAL, limoeiro: META_LIMOEIRO, aracati: META_ARACATI },
      resumo: {
        totalAtivos, qtdNovos, valorClientesNovos,
        qtdPerdidos, receitaPerdida, valorUpgrades,
        receitaNova, receitaLiquida, percMeta,
      },
      porFilial,
      evolucao,
      clientesNovos: clientesNovosDetail.map((c: any) => ({
        codigo: n(c.codigo),
        nome: c.nome,
        valor: n(c.valor),
        cidade: c.cidade,
        data_cadastro: c.data_cadastro,
        tipo: c.tipo,
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
