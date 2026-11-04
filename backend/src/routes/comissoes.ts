import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { listarPlanos, apurar, fechar, reabrir, nomesCrmDoVendedor } from '../utils/comissoes'
import { getUserPermissions } from './grupos'
import { listarRegrasCanal, faturamentoPorCanal } from '../utils/comissaoCanal'
import { listarAvulsas } from '../utils/comissaoAvulsa'
import { listarVendasParaRateio, salvarRateio } from '../utils/rateioVenda'

/** Plano de remuneração comercial: planos, faixas, vendedores e apuração mensal. */
export async function comissoesRoutes(app: FastifyInstance) {
  app.get('/planos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () =>
    listarPlanos())

  app.put('/planos/:id', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do plano.' })
    if (!['vencimento', 'processo'].includes(String(b.baseCalculo))) {
      return reply.status(400).send({ error: 'Base de cálculo inválida.' })
    }
    const tipo = ['escada', 'proporcional'].includes(String(b.tipo)) ? String(b.tipo) : 'escada'
    const escopo = ['todos', 'command', 'cilos'].includes(String(b.escopoProduto))
      ? String(b.escopoProduto) : 'todos'

    await prisma.$executeRawUnsafe(
      `UPDATE comissao_plano SET nome=?, descricao=?, base_calculo=?, tipo=?, valor_bonus=?,
         escopo_produto=?, fixo_inicial=?, fixo_efetivo=?, meses_fase_inicial=?,
         meta_referencia=?, treino_nota_minima=?, treino_valor_base=?,
         treino_valor_unitario=?, ativo=? WHERE id=?`,
      nome, String(b.descricao ?? '') || null, String(b.baseCalculo), tipo,
      Number(b.valorBonus) || 0, escopo,
      Number(b.fixoInicial) || 0, Number(b.fixoEfetivo) || 0,
      Number(b.mesesFaseInicial) || 0, Number(b.metaReferencia) || 0,
      Number(b.treinoNotaMinima) || 9,
      Number(b.treinoValorBase) || 0, Number(b.treinoValorUnitario) || 0,
      b.ativo === false ? 0 : 1, Number(id),
    )

    // As faixas vêm inteiras: substituir é mais previsível do que casar linha a linha.
    if (Array.isArray(b.faixas)) {
      const validas = b.faixas
        .map((f: any) => ({ valorDe: Number(f.valorDe), percentual: Number(f.percentual) }))
        .filter((f: any) => Number.isFinite(f.valorDe) && Number.isFinite(f.percentual) && f.valorDe >= 0)
      await prisma.$executeRawUnsafe(`DELETE FROM comissao_faixa WHERE plano_id = ?`, Number(id))
      for (const f of validas) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO comissao_faixa (plano_id, valor_de, percentual) VALUES (?,?,?)`,
          Number(id), f.valorDe, f.percentual,
        )
      }
    }
    return { ok: true }
  })

  app.post('/planos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do plano.' })
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_plano
         (nome, descricao, base_calculo, tipo, valor_bonus, escopo_produto,
          fixo_inicial, fixo_efetivo, meses_fase_inicial, meta_referencia)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      nome, String(b.descricao ?? '') || null, 'vencimento',
      ['escada', 'proporcional'].includes(String(b.tipo)) ? String(b.tipo) : 'escada',
      Number(b.valorBonus) || 0,
      ['todos', 'command', 'cilos'].includes(String(b.escopoProduto)) ? String(b.escopoProduto) : 'todos',
      0, 0, 0, Number(b.metaReferencia) || 0,
    )
    return reply.status(201).send({ ok: true })
  })

  app.delete('/planos/:id', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [uso] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q FROM comissao_vendedor WHERE plano_id = ?`, Number(id))
    if (Number(uso?.q ?? 0) > 0) {
      return reply.status(400).send({ error: 'Há pessoas vinculadas a este plano. Mova-as antes de excluir.' })
    }
    await prisma.$executeRawUnsafe(`DELETE FROM comissao_plano WHERE id = ?`, Number(id))
    return { ok: true }
  })

  app.get('/vendedores', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT v.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, p.nome AS plano_nome
         FROM comissao_vendedor v
         LEFT JOIN usuario u ON u.COD_USU = v.usuario_id
         LEFT JOIN comissao_plano p ON p.id = v.plano_id
        ORDER BY v.ativo DESC, nome`)
    return linhas.map((v) => ({
      id: Number(v.id),
      usuarioId: Number(v.usuario_id),
      nome: v.nome ?? `Usuário ${v.usuario_id}`,
      planoId: Number(v.plano_id),
      planoNome: v.plano_nome ?? null,
      dataAdmissao: v.data_admissao ? String(v.data_admissao).slice(0, 10) : null,
      fixoPersonalizado: v.fixo_personalizado == null ? null : Number(v.fixo_personalizado),
      metaIndividual: v.meta_individual == null ? null : Number(v.meta_individual),
      // Valor cheio do bônus de meta desta pessoa. Null = não recebe por meta.
      bonusMeta: v.bonus_meta == null ? null : Number(v.bonus_meta),
      bonusTreinamento: Number(v.bonus_treinamento ?? 0) === 1,
      ativo: !!v.ativo,
    }))
  })

  app.post('/vendedores', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number(b.usuarioId)
    const planoId = Number(b.planoId)
    if (!usuarioId || !planoId) return reply.status(400).send({ error: 'Informe o usuário e o plano.' })
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_vendedor
         (usuario_id, plano_id, data_admissao, fixo_personalizado, meta_individual,
          bonus_meta, bonus_treinamento, ativo)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE plano_id=VALUES(plano_id), data_admissao=VALUES(data_admissao),
         fixo_personalizado=VALUES(fixo_personalizado), meta_individual=VALUES(meta_individual),
         bonus_meta=VALUES(bonus_meta), bonus_treinamento=VALUES(bonus_treinamento),
         ativo=VALUES(ativo)`,
      usuarioId, planoId, b.dataAdmissao || null,
      b.fixoPersonalizado === '' || b.fixoPersonalizado == null ? null : Number(b.fixoPersonalizado),
      b.metaIndividual === '' || b.metaIndividual == null ? null : Number(b.metaIndividual),
      // Zero e vazio viram null: "nao recebe por meta" e um estado, nao um valor de R$ 0,00.
      b.bonusMeta === '' || b.bonusMeta == null || Number(b.bonusMeta) <= 0
        ? null : Number(b.bonusMeta),
      b.bonusTreinamento ? 1 : 0,
      b.ativo === false ? 0 : 1,
    )
    return reply.status(201).send({ ok: true })
  })

  app.delete('/vendedores/:usuarioId', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { usuarioId } = request.params as { usuarioId: string }
    await prisma.$executeRawUnsafe(`DELETE FROM comissao_vendedor WHERE usuario_id = ?`, Number(usuarioId))
    return { ok: true }
  })

  /**
   * Quem pode ser vinculado a um plano: todo usuário ativo.
   *
   * Antes a lista exigia ao menos um processo de implantação, o que servia enquanto só
   * vendedor recebia. Com o bônus por meta batida entrou gente que nunca vendeu — líder,
   * suporte — e que precisava aparecer aqui. Quem já vendeu continua no topo, com a contagem.
   */
  // ── Divisão de uma venda entre vendedores ──

  app.get('/rateios', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { busca } = request.query as { busca?: string }
    return listarVendasParaRateio(String(busca ?? ''))
  })

  app.post('/rateios/:idProcesso', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const idProcesso = Number((request.params as { idProcesso: string }).idProcesso)
    if (!idProcesso) return reply.status(400).send({ error: 'Processo inválido.' })
    const b = request.body as { participantes?: Array<{ usuarioId: number; percentual: number }> }
    try {
      await salvarRateio(idProcesso, b.participantes ?? [], Number((request.user as any)?.id || 0) || null)
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
    return { ok: true }
  })

  // ── Comissão avulsa (prêmios lançados à mão) ──

  app.get('/avulsas', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { competencia } = request.query as { competencia?: string }
    return listarAvulsas(/^\d{4}-\d{2}$/.test(competencia ?? '') ? competencia : undefined)
  })

  app.post('/avulsas', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number(b.usuarioId ?? 0)
    const competencia = String(b.competencia ?? '')
    const descricao = String(b.descricao ?? '').trim()
    const valor = Number(b.valor ?? 0)
    // Data da premiação: opcional no corpo, mas registrada sempre. Sem ela, assume o
    // primeiro dia da competência — nunca "hoje", que mentiria num lançamento retroativo.
    const dataInformada = String(b.data ?? '').trim()
    if (dataInformada && !/^\d{4}-\d{2}-\d{2}$/.test(dataInformada)) {
      return reply.status(400).send({ error: 'Data da premiação inválida.' })
    }
    if (!usuarioId) return reply.status(400).send({ error: 'Escolha quem recebe.' })
    if (!/^\d{4}-\d{2}$/.test(competencia)) return reply.status(400).send({ error: 'Competência inválida. Use AAAA-MM.' })
    if (!descricao) return reply.status(400).send({ error: 'Descreva o que está sendo pago.' })
    if (!(valor > 0)) return reply.status(400).send({ error: 'O valor precisa ser maior que zero.' })

    // Mês já fechado não aceita lançamento novo: o que foi pago não muda depois.
    const [fechado] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 1 AS x FROM comissao_apuracao WHERE competencia = ? AND usuario_id = ? LIMIT 1`,
      competencia, usuarioId)
    if (fechado) {
      return reply.status(400).send({
        error: 'A competência desta pessoa já foi fechada. Reabra antes de lançar.',
      })
    }

    const data = dataInformada || `${competencia}-01`
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_avulsa
         (usuario_id, competencia, data_premiacao, descricao, valor, criado_por)
       VALUES (?,?,?,?,?,?)`,
      usuarioId, competencia, data, descricao.slice(0, 200), valor,
      Number((request.user as any)?.id || 0) || null)
    return reply.status(201).send({ ok: true })
  })

  app.delete('/avulsas/:id', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM comissao_avulsa WHERE id = ?`, Number(id))
    return { ok: true }
  })

  // ── Comissão por canal de aquisição ──

  app.get('/canais', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () =>
    listarRegrasCanal())

  /** Canais disponíveis no CRM, com o que cada um fechou — ajuda a escolher a regra. */
  app.get('/canais/opcoes', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(NULLIF(canal, ''), 'Sem canal') AS canal,
              COUNT(*) AS negocios,
              COALESCE(SUM(CASE WHEN status = 'won' THEN valor END), 0) AS faturamento
         FROM crm_negocio GROUP BY canal ORDER BY faturamento DESC`).catch(() => [])
    return linhas.map((r) => ({
      canal: String(r.canal),
      negocios: Number(r.negocios ?? 0),
      faturamento: Number(r.faturamento ?? 0),
    }))
  })

  app.post('/canais', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number(b.usuarioId ?? 0)
    const canal = String(b.canal ?? '').trim()
    const blocoValor = Number(b.blocoValor ?? 0)
    const valorPorBloco = Number(b.valorPorBloco ?? 0)
    if (!usuarioId || !canal) return reply.status(400).send({ error: 'Informe a pessoa e o canal.' })
    if (!(blocoValor > 0)) return reply.status(400).send({ error: 'O valor do bloco precisa ser maior que zero.' })
    if (!(valorPorBloco > 0)) return reply.status(400).send({ error: 'Informe quanto paga por bloco.' })

    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_canal (usuario_id, canal, bloco_valor, valor_por_bloco, ativo)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE bloco_valor = VALUES(bloco_valor),
         valor_por_bloco = VALUES(valor_por_bloco), ativo = VALUES(ativo)`,
      usuarioId, canal.slice(0, 100), blocoValor, valorPorBloco, b.ativo === false ? 0 : 1)
    return reply.status(201).send({ ok: true })
  })

  app.delete('/canais/:id', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM comissao_canal WHERE id = ?`, Number(id))
    return { ok: true }
  })

  /** Prévia: o que as regras pagariam no período, sem depender da apuração. */
  app.get('/canais/apuracao', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const q = request.query as Record<string, string>
    const hoje = new Date().toISOString().slice(0, 10)
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(q.inicio ?? '') ? q.inicio : `${hoje.slice(0, 7)}-01`
    const fim = /^\d{4}-\d{2}-\d{2}$/.test(q.fim ?? '') ? q.fim : hoje
    const regras = await listarRegrasCanal()
    const porCanal = await faturamentoPorCanal(inicio, fim)
    return {
      inicio, fim,
      itens: regras.map((r) => {
        const d = porCanal.get(r.canal) ?? { faturamento: 0, negocios: 0 }
        const blocos = r.blocoValor > 0 ? Math.floor(d.faturamento / r.blocoValor) : 0
        return {
          ...r,
          faturamento: d.faturamento,
          negocios: d.negocios,
          blocos,
          valor: Number((blocos * r.valorPorBloco).toFixed(2)),
        }
      }),
    }
  })

  app.get('/candidatos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome,
              COUNT(c.id_processo) AS processos
         FROM usuario u
         LEFT JOIN processo_implantacao_comercial c ON c.id_usu_vendedor = u.COD_USU
        WHERE COALESCE(u.ATIVO, 'S') = 'S'
        GROUP BY u.COD_USU, nome
        ORDER BY processos DESC, nome`)
    return linhas.map((u) => ({
      id: Number(u.id), nome: u.nome, processos: Number(u.processos ?? 0),
    }))
  })

  app.get('/apuracao', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { competencia } = request.query as { competencia?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    try {
      const linhas = await apurar(comp)
      return {
        competencia: comp,
        linhas,
        totais: {
          base: linhas.reduce((s, l) => s + l.base, 0),
          variavel: linhas.reduce((s, l) => s + l.variavel, 0),
          fixo: linhas.reduce((s, l) => s + l.fixo, 0),
          total: linhas.reduce((s, l) => s + l.total, 0),
        },
      }
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
  })

  app.post('/apuracao/fechar', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const b = request.body as { competencia: string; usuarioId?: number }
    const quem = (request as any).user?.id ?? null
    return fechar(b.competencia, b.usuarioId ?? null, quem ? Number(quem) : null)
  })

  /**
   * "Meu desempenho": o que o próprio vendedor vê. Usa sempre o usuário do token — ninguém
   * consulta a comissão de outra pessoa por aqui, nem trocando o parâmetro.
   */
  app.get('/meu-desempenho', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { competencia, usuarioId } = request.query as { competencia?: string; usuarioId?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    const logado = Number((request.user as { id: number } | undefined)?.id ?? 0)
    if (!logado) return reply.status(401).send({ error: 'Sessão inválida.' })

    // Só quem administra a remuneração pode abrir o desempenho de outra pessoa. Para todos os
    // demais vale o usuário do token, mesmo que mandem usuarioId na query.
    const permissoes = await getUserPermissions(logado).catch(() => [] as string[])
    const gestor = permissoes.includes('*') || permissoes.includes('remuneracao-comercial')
    const pedido = Number(usuarioId ?? 0)
    if (pedido && pedido !== logado && !gestor) {
      return reply.status(403).send({ error: 'Você só pode ver o seu próprio desempenho.' })
    }
    const eu = gestor && pedido ? pedido : logado

    // O mês e os seis do histórico não dependem um do outro: esperar os dois juntos corta
    // quase metade do tempo de abertura da tela.
    const [anoH, mesH] = comp.split('-').map(Number)
    const competencias = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(anoH, mesH - 6 + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })

    let linhas
    let apuracoes: Awaited<ReturnType<typeof apurar>>[]
    try {
      [linhas, apuracoes] = await Promise.all([
        apurar(comp),
        Promise.all(competencias.map((c) => apurar(c, { detalhe: false }).catch(() => []))),
      ])
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
    const minha = linhas.find((l) => l.usuarioId === eu) ?? null

    const [anoC, mesC] = comp.split('-').map(Number)
    const fimDoMes = `${comp}-${String(new Date(anoC, mesC, 0).getDate()).padStart(2, '0')}`
    const [u] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT NOME_USU AS nome FROM usuario WHERE COD_USU = ?`, eu).catch(() => [null])
    const nomeUsu = u?.nome ?? ''

    // Os últimos 6 meses, para a pessoa ver a própria evolução e não só a foto do mês.
    const historico = competencias.map((c, i) => {
      const l = apuracoes[i].find((x) => x.usuarioId === eu)
      return {
        competencia: c,
        base: l?.base ?? 0,
        percentual: l?.percentual ?? 0,
        variavel: l?.variavel ?? 0,
        total: l?.total ?? 0,
      }
    })


    const planos = await listarPlanos()
    const plano = planos.find((p) => p.id === minha?.planoId) ?? planos[0] ?? null

    // ── O que a pessoa fez no período, item a item ──
    // Sem isso o vendedor vê só o total e não tem como conferir de onde ele saiu.
    const planoDaPessoa = (await listarPlanos()).find((pl) => pl.id === minha?.planoId)
    // O MESMO recorte da apuração. Sem o COALESCE a lista escondia as vendas sem data de
    // vencimento — que entram no total — e o vendedor via um valor que a lista não explicava.
    const colunaData = planoDaPessoa?.baseCalculo === 'processo'
      ? 'c.data_hora_dados'
      : 'COALESCE(c.data_venc_implantacao, c.data_hora_dados)'

    // O CRM chama a pessoa pelo nome completo; o cadastro guarda o primeiro. Mesma regra da
    // apuração, senão a lista mostra menos clientes do que o total soma.
    const nomesCrmTodos = (await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT vendedor_nome AS nome FROM crm_negocio
        WHERE vendedor_nome IS NOT NULL AND vendedor_nome <> ''`).catch(() => []))
      .map((r) => String(r.nome))
    const nomesDaPessoa = [
      ...new Set([
        minha?.nome ?? '', nomeUsu,
        ...nomesCrmDoVendedor(minha?.nome ?? null, nomeUsu, nomesCrmTodos),
      ].filter((n) => String(n).trim() !== '')),
    ]

    const implantacoes = minha ? await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id_processo, CASE WHEN cli.NOME_FANTASIA REGEXP '[A-Za-z]' THEN cli.NOME_FANTASIA
                   ELSE COALESCE(NULLIF(cli.NOME_CLI, ''), cli.NOME_FANTASIA) END AS cliente, cli.CIDRES_CLI AS cidade,
              pl.descricao AS plano,
              c.valor_implantacao * (COALESCE(r.percentual, 100) / 100) AS valor_implantacao,
              c.valor_migracao * (COALESCE(r.percentual, 100) / 100) AS valor_migracao,
              c.valor_mensalidade * (COALESCE(r.percentual, 100) / 100) AS valor_mensalidade,
              COALESCE(r.percentual, 100) AS percentual,
              DATE_FORMAT(${colunaData}, '%Y-%m-%d') AS data
         FROM processo_implantacao_comercial c
         LEFT JOIN processo_implantacao pi ON pi.id = c.id_processo
         LEFT JOIN cliente cli ON cli.cod_cli = pi.id_cli
         LEFT JOIN planos pl ON pl.id = c.id_plano
         LEFT JOIN processo_rateio r ON r.id_processo = c.id_processo AND r.usuario_id = ?
        WHERE DATE(${colunaData}) BETWEEN ? AND ?
          AND (r.usuario_id IS NOT NULL
               OR (c.id_usu_vendedor = ?
                   AND NOT EXISTS (SELECT 1 FROM processo_rateio x
                                    WHERE x.id_processo = c.id_processo)))
        ORDER BY data DESC`,
      eu, `${comp}-01`, fimDoMes, eu,
    ).catch(() => [] as any[]) : []

    const clientesNovos = minha ? await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.cod_cli, CASE WHEN c.NOME_FANTASIA REGEXP '[A-Za-z]' THEN c.NOME_FANTASIA
                   ELSE COALESCE(NULLIF(c.NOME_CLI, ''), c.NOME_FANTASIA) END AS cliente, c.CIDRES_CLI AS cidade,
              c.valor_mensalidade AS valor, DATE_FORMAT(c.DATACADASTRO_CLI, '%Y-%m-%d') AS data,
              COALESCE(cc.NOME_CLA, 'Sem classificação') AS segmento
         FROM cliente c
         LEFT JOIN classif_cliente cc ON cc.COD_CLA = c.cod_cla
         LEFT JOIN usuario u ON u.COD_USU = c.cod_usu_local_Cad
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
          AND c.DATACADASTRO_CLI BETWEEN ? AND ?
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
          AND UPPER(TRIM(COALESCE(
                (SELECT nn.vendedor_nome FROM crm_negocio nn
                  WHERE nn.documento = REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','')
                    AND nn.vendedor_nome IS NOT NULL AND nn.vendedor_nome <> ''
                  ORDER BY COALESCE(nn.finalizado_em, nn.criado_em, nn.data) DESC, nn.id DESC LIMIT 1),
                NULLIF(u.NOME_USU, ''), ''))) IN (${nomesDaPessoa.map(() => 'UPPER(TRIM(?))').join(', ')})
        ORDER BY data DESC`,
      `${comp}-01`, fimDoMes, ...nomesDaPessoa,
    ).catch(() => [] as any[]) : []

    const upgrades = minha ? await prisma.$queryRawUnsafe<any[]>(
      `SELECT co.descricao, CASE WHEN cli.NOME_FANTASIA REGEXP '[A-Za-z]' THEN cli.NOME_FANTASIA
                   ELSE COALESCE(NULLIF(cli.NOME_CLI, ''), cli.NOME_FANTASIA) END AS cliente, co.Valor_operacao AS valor,
              co.valor_comissao AS comissao,
              DATE_FORMAT(co.data_venda, '%Y-%m-%d') AS data
         FROM comissoes_funcionario co
         INNER JOIN cliente cli ON cli.cod_cli = co.cod_cli
        WHERE co.cod_func = ? AND CAST(co.data_venda AS DATE) BETWEEN ? AND ?
          AND cli.cod_cli NOT IN (1,6,7,8) AND cli.cod_cla <> 30
        ORDER BY data DESC`,
      eu, `${comp}-01`, fimDoMes,
    ).catch(() => [] as any[]) : []

    const assinaturas = minha ? await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.cliente_nome AS cliente, a.app_nome AS produto, a.plano, a.periodicidade,
              (a.mensal + a.valor_modulos) AS valor, DATE_FORMAT(a.inicio, '%Y-%m-%d') AS data,
              s.nome AS servidor
         FROM paycore_assinatura a
         INNER JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
        WHERE pc.vendedor_id = ? AND DATE(a.inicio) BETWEEN ? AND ?
        ORDER BY data DESC`,
      eu, `${comp}-01`, fimDoMes,
    ).catch(() => [] as any[]) : []

    const dataTexto = (v: any) => (v ? String(v).slice(0, 10) : null)

    // Para o gestor poder trocar de pessoa sem sair da tela.
    const equipe = gestor
      ? linhas.map((l) => ({ usuarioId: l.usuarioId, nome: l.nome }))
      : []

    return {
      competencia: comp,
      gestor,
      usuarioId: eu,
      equipe,
      vendedor: minha,
      // Sem vínculo com plano não há comissão a mostrar — a tela diz isso em vez de zerar tudo.
      semPlano: !minha,
      escada: plano?.faixas ?? [],
      detalhe: {
        implantacoes: implantacoes.map((i) => ({
          percentual: Number(i.percentual ?? 100),
          processo: Number(i.id_processo),
          cliente: i.cliente ?? `Processo ${i.id_processo}`,
          cidade: i.cidade ?? null,
          plano: i.plano ?? null,
          implantacao: Number(i.valor_implantacao ?? 0),
          migracao: Number(i.valor_migracao ?? 0),
          mensalidade: Number(i.valor_mensalidade ?? 0),
          data: dataTexto(i.data),
        })),
        clientesNovos: clientesNovos.map((c) => ({
          codigo: Number(c.cod_cli),
          cliente: c.cliente ?? `Cliente ${c.cod_cli}`,
          cidade: c.cidade ?? null,
          segmento: c.segmento ?? null,
          valor: Number(c.valor ?? 0),
          data: dataTexto(c.data),
        })),
        upgrades: upgrades.map((u2) => {
          const operacao = Number(u2.valor ?? 0)
          const comissao = Number(u2.comissao ?? 0)
          return {
            cliente: u2.cliente ?? '—',
            descricao: u2.descricao ?? '—',
            valor: operacao,
            comissao,
            // O percentual não é guardado: sai da razão entre os dois, como no relatório antigo.
            percentual: operacao > 0 ? Number(((comissao / operacao) * 100).toFixed(2)) : 0,
            data: dataTexto(u2.data),
          }
        }),
        assinaturas: assinaturas.map((a4) => ({
          cliente: a4.cliente ?? '—',
          produto: a4.produto ?? null,
          plano: a4.plano ?? null,
          periodicidade: a4.periodicidade ?? null,
          servidor: a4.servidor ?? null,
          valor: Number(a4.valor ?? 0),
          data: dataTexto(a4.data),
        })),
      },
      historico,
    }
  })

  app.post('/apuracao/reabrir', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const b = request.body as { competencia: string; usuarioId: number }
    return reabrir(b.competencia, Number(b.usuarioId))
  })
}
