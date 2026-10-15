import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { sincronizarServidor, sincronizarTodos, normalizarBaseUrl, extrairLista, type ServidorPaycore } from '../utils/paycoreSync'

/**
 * Consulta e administração dos dados vindos das plataformas PayCore. A carga em si é feita pela
 * rotina de sincronização (utils/paycoreSync.ts), que roda de hora em hora.
 */
export async function paycoreRoutes(app: FastifyInstance) {
  // ── Servidores ───────────────────────────────────────────────────
  app.get('/servidores', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*,
              (SELECT COUNT(*) FROM paycore_cliente c WHERE c.servidor_id = s.id) AS clientes,
              (SELECT COUNT(*) FROM paycore_aplicacao a WHERE a.servidor_id = s.id) AS aplicacoes
         FROM paycore_servidor s ORDER BY s.nome`,
    )
    return linhas.map((l) => ({
      id: Number(l.id),
      nome: l.nome,
      baseUrl: l.base_url,
      // A chave nunca volta pra tela — só a informação de que existe.
      temChave: !!l.api_key,
      ativo: Number(l.ativo) === 1,
      ultimaSync: l.ultima_sync,
      ultimoErro: l.ultimo_erro,
      clientes: Number(l.clientes ?? 0),
      aplicacoes: Number(l.aplicacoes ?? 0),
    }))
  })

  app.post('/servidores', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim().slice(0, 80)
    const baseUrl = normalizarBaseUrl(String(b.baseUrl ?? '')).slice(0, 200)
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do servidor.' })
    if (!/^https?:\/\//.test(baseUrl)) return reply.status(400).send({ error: 'Informe a URL da API (começando com https://).' })

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO paycore_servidor (nome, base_url, api_key, ativo) VALUES (?,?,?,?)`,
        nome, baseUrl, String(b.apiKey ?? '').trim() || null, b.ativo === false ? 0 : 1,
      )
    } catch (e: any) {
      if (String(e?.message ?? '').includes('Duplicate')) {
        return reply.status(409).send({ error: `Já existe um servidor chamado "${nome}".` })
      }
      throw e
    }
    return reply.status(201).send({ ok: true })
  })

  app.put('/servidores/:id', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim().slice(0, 80)
    const baseUrl = normalizarBaseUrl(String(b.baseUrl ?? '')).slice(0, 200)
    if (!nome || !/^https?:\/\//.test(baseUrl)) {
      return reply.status(400).send({ error: 'Informe o nome e a URL da API.' })
    }
    // Chave em branco mantém a atual — a tela nunca recebe a chave de volta pra reenviar.
    const chave = String(b.apiKey ?? '').trim()
    if (chave) {
      await prisma.$executeRawUnsafe(
        `UPDATE paycore_servidor SET nome=?, base_url=?, api_key=?, ativo=? WHERE id=?`,
        nome, baseUrl, chave, b.ativo === false ? 0 : 1, Number(id),
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE paycore_servidor SET nome=?, base_url=?, ativo=? WHERE id=?`,
        nome, baseUrl, b.ativo === false ? 0 : 1, Number(id),
      )
    }
    return { ok: true }
  })

  app.delete('/servidores/:id', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM paycore_servidor WHERE id = ?`, Number(id))
    return { ok: true }
  })

  /**
   * POST /paycore/servidores/:id/testar — bate na API e mostra o que ela devolveu.
   * O mapeamento dos campos foi escrito a partir da documentação, sem nunca ter rodado contra a
   * API real. Este teste busca um registro de cada tipo e devolve os campos que importam, para
   * conferir se o contrato bate antes de confiar na sincronização.
   */
  app.post('/servidores/:id/testar', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [l] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome, base_url, api_key FROM paycore_servidor WHERE id = ?`, Number(id),
    )
    if (!l) return reply.status(404).send({ error: 'Servidor não encontrado.' })
    if (!l.api_key) return reply.status(400).send({ error: 'Cadastre a chave de API antes de testar.' })

    const base = normalizarBaseUrl(String(l.base_url))
    const testes: Array<{ rota: string; status: number | string; total: number | null; campos: string[]; amostra: any; erro?: string }> = []

    for (const rota of ['/api/v1/applications', '/api/v1/customers', '/api/v1/subscriptions', '/api/v1/payments']) {
      try {
        const resposta = await fetch(`${base}${rota}?page=1&limit=1`, {
          headers: { Authorization: `Bearer ${l.api_key}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        })
        const tipo = resposta.headers.get('content-type') ?? ''
        const corpo: any = tipo.includes('json') ? await resposta.json().catch(() => null) : null
        const { itens, meta } = extrairLista(corpo)
        const primeiro = itens[0] ?? null

        // Só os nomes dos campos e um punhado de valores — nada de despejar o cadastro inteiro.
        const amostra = primeiro
          ? Object.fromEntries(
              ['id', 'name', 'legalName', 'document', 'app', 'appId', 'plan', 'monthly', 'status', 'amountPaid', 'paidAt']
                .filter((k) => primeiro[k] !== undefined)
                .map((k) => [k, primeiro[k]]),
            )
          : null

        testes.push({
          rota,
          status: resposta.status,
          total: meta?.total ?? meta?.totalItems ?? meta?.count ?? itens.length,
          campos: primeiro ? Object.keys(primeiro) : [],
          amostra,
          erro: !tipo.includes('json')
            ? 'A URL respondeu HTML, não JSON — use o endereço da API (api-paycore...), não o do painel.'
            : resposta.ok ? undefined : String(corpo?.message ?? resposta.statusText),
        })
      } catch (e: any) {
        testes.push({ rota, status: 'falhou', total: null, campos: [], amostra: null, erro: String(e?.message ?? e).slice(0, 200) })
      }
    }

    const ok = testes.every((t) => t.status === 200)
    return { servidor: l.nome, ok, testes, meta: { paginacao: null } }
  })

  // POST /paycore/sincronizar — puxa agora, sem esperar a rotina da hora
  app.post('/sincronizar', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request) => {
    const { servidorId } = request.body as { servidorId?: number }
    if (!servidorId) return { resultados: await sincronizarTodos() }

    const [l] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome, base_url, api_key, ativo FROM paycore_servidor WHERE id = ?`, Number(servidorId),
    )
    if (!l) return { resultados: [] }
    const servidor: ServidorPaycore = {
      id: Number(l.id), nome: l.nome, baseUrl: l.base_url, apiKey: l.api_key, ativo: Number(l.ativo) === 1,
    }
    return { resultados: [await sincronizarServidor(servidor)] }
  })

  // ── Consulta ─────────────────────────────────────────────────────
  app.get('/clientes', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request) => {
    const { servidorId, appId } = request.query as Record<string, string>
    const condicoes: string[] = []
    const valores: any[] = []
    if (servidorId) { condicoes.push('c.servidor_id = ?'); valores.push(Number(servidorId)) }
    if (appId) {
      condicoes.push(`EXISTS (SELECT 1 FROM paycore_assinatura a
                               WHERE a.servidor_id = c.servidor_id AND a.customer_id = c.customer_id AND a.app_id = ?)`)
      valores.push(appId)
    }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, s.nome AS servidor_nome,
              (SELECT COUNT(*) FROM paycore_assinatura a
                WHERE a.servidor_id = c.servidor_id AND a.customer_id = c.customer_id) AS assinaturas,
              (SELECT COALESCE(SUM(f.valor),0) FROM paycore_faturamento f
                WHERE f.servidor_id = c.servidor_id AND f.customer_id = c.customer_id) AS faturado,
              (SELECT GROUP_CONCAT(DISTINCT a.app_nome ORDER BY a.app_nome SEPARATOR ', ')
                 FROM paycore_assinatura a
                WHERE a.servidor_id = c.servidor_id AND a.customer_id = c.customer_id) AS produtos
         FROM paycore_cliente c
         LEFT JOIN paycore_servidor s ON s.id = c.servidor_id
        ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
        ORDER BY faturado DESC, c.razao_social LIMIT 1000`,
      ...valores,
    )

    return linhas.map((l) => ({
      servidorId: Number(l.servidor_id),
      servidorNome: l.servidor_nome,
      customerId: l.customer_id,
      documento: l.documento,
      razaoSocial: l.razao_social,
      nomeFantasia: l.nome_fantasia,
      email: l.email,
      segmento: l.segmento,
      status: l.status,
      codCli: l.cod_cli ? Number(l.cod_cli) : null,
      vendedorId: l.vendedor_id ? Number(l.vendedor_id) : null,
      vendedorNome: l.vendedor_nome,
      vendedorOrigem: l.vendedor_origem,
      produtos: l.produtos,
      assinaturas: Number(l.assinaturas ?? 0),
      faturado: Number(l.faturado ?? 0),
    }))
  })

  // Faturamento consolidado por produto e servidor — base para a meta depois.
  /**
   * Saúde da cobrança. Responde a pergunta que o churn aparente esconde: o cliente cancelou, ou
   * a cobrança nunca chegou nele? Assinatura sem nenhuma cobrança emitida é falha de
   * configuração do gateway, não cliente insatisfeito — e o remédio é outro.
   */
  app.get('/saude-cobranca', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async () => {
    const porStatus = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(s.nome, 'PayCore') AS servidor,
             COALESCE(c.app_nome, 'Sem produto') AS produto,
             COALESCE(c.status, 'desconhecido') AS status,
             COUNT(*) AS quantidade,
             COALESCE(SUM(c.valor), 0) AS valor
        FROM paycore_cobranca c
        LEFT JOIN paycore_servidor s ON s.id = c.servidor_id
       GROUP BY servidor, produto, status
       ORDER BY servidor, produto, valor DESC`).catch(() => [])

    // O coração do diagnóstico: assinaturas que nunca geraram cobrança.
    const semCobranca = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(s.nome, 'PayCore') AS servidor,
             COALESCE(a.app_nome, 'Sem produto') AS produto,
             a.status,
             COUNT(*) AS assinaturas,
             COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS mensal
        FROM paycore_assinatura a
        LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
       WHERE NOT EXISTS (
               SELECT 1 FROM paycore_cobranca c
                WHERE c.servidor_id = a.servidor_id AND c.subscription_id = a.subscription_id)
       GROUP BY servidor, produto, a.status
       ORDER BY mensal DESC`).catch(() => [])

    // Vencidas e a vencer: a lista que a cobrança usa para correr atrás.
    const emAberto = await prisma.$queryRawUnsafe<any[]>(`
      SELECT c.charge_id, COALESCE(s.nome, 'PayCore') AS servidor, c.cliente_nome, c.app_nome,
             c.descricao, c.valor, c.valor_com_encargos, c.status, c.metodo, c.vencimento,
             c.link_pagamento, DATEDIFF(CURDATE(), c.vencimento) AS dias_vencida
        FROM paycore_cobranca c
        LEFT JOIN paycore_servidor s ON s.id = c.servidor_id
       WHERE c.status IN ('pending', 'overdue')
       ORDER BY c.vencimento`).catch(() => [])

    const [tot] = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS cobrancas,
             SUM(status = 'paid') AS pagas,
             SUM(status = 'overdue') AS vencidas,
             SUM(status = 'pending') AS pendentes,
             SUM(status = 'canceled') AS canceladas,
             COALESCE(SUM(CASE WHEN status = 'overdue' THEN valor END), 0) AS valor_vencido
        FROM paycore_cobranca`).catch(() => [null])

    const linhasSem = semCobranca.map((l) => ({
      servidor: l.servidor,
      produto: l.produto,
      status: l.status,
      assinaturas: Number(l.assinaturas ?? 0),
      mensal: Number(l.mensal ?? 0),
    }))

    return {
      resumo: {
        cobrancas: Number(tot?.cobrancas ?? 0),
        pagas: Number(tot?.pagas ?? 0),
        vencidas: Number(tot?.vencidas ?? 0),
        pendentes: Number(tot?.pendentes ?? 0),
        canceladas: Number(tot?.canceladas ?? 0),
        valorVencido: Number(tot?.valor_vencido ?? 0),
        assinaturasSemCobranca: linhasSem.reduce((s, l) => s + l.assinaturas, 0),
        mensalSemCobranca: linhasSem.reduce((s, l) => s + l.mensal, 0),
      },
      porStatus: porStatus.map((l) => ({
        servidor: l.servidor, produto: l.produto, status: l.status,
        quantidade: Number(l.quantidade ?? 0), valor: Number(l.valor ?? 0),
      })),
      semCobranca: linhasSem,
      emAberto: emAberto.map((l) => ({
        id: l.charge_id,
        servidor: l.servidor,
        cliente: l.cliente_nome ?? null,
        produto: l.app_nome ?? null,
        descricao: l.descricao ?? null,
        valor: Number(l.valor ?? 0),
        valorComEncargos: l.valor_com_encargos == null ? null : Number(l.valor_com_encargos),
        status: l.status,
        metodo: l.metodo ?? null,
        vencimento: l.vencimento ? String(l.vencimento).slice(0, 10) : null,
        link: l.link_pagamento ?? null,
        diasVencida: Number(l.dias_vencida ?? 0),
      })),
    }
  })

  app.get('/faturamento', { preHandler: authMiddleware, schema: { tags: ['PayCore'] } }, async (request) => {
    const { inicio, fim } = request.query as Record<string, string>
    const condicoes: string[] = ["f.status IN ('paid','confirmed','received','succeeded')"]
    const valores: any[] = []
    if (inicio) { condicoes.push('DATE(f.pago_em) >= ?'); valores.push(inicio) }
    if (fim) { condicoes.push('DATE(f.pago_em) <= ?'); valores.push(fim) }

    const porProduto = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.nome AS servidor, f.app_nome AS produto, COUNT(*) AS pagamentos,
              COALESCE(SUM(f.valor),0) AS bruto, COALESCE(SUM(f.valor_liquido),0) AS liquido
         FROM paycore_faturamento f
         LEFT JOIN paycore_servidor s ON s.id = f.servidor_id
        WHERE ${condicoes.join(' AND ')}
        GROUP BY s.nome, f.app_nome ORDER BY bruto DESC`,
      ...valores,
    )
    const porVendedor = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(c.vendedor_nome, 'Não identificado') AS vendedor, COUNT(*) AS pagamentos,
              COALESCE(SUM(f.valor),0) AS bruto
         FROM paycore_faturamento f
         LEFT JOIN paycore_cliente c ON c.servidor_id = f.servidor_id AND c.customer_id = f.customer_id
        WHERE ${condicoes.join(' AND ')}
        GROUP BY vendedor ORDER BY bruto DESC`,
      ...valores,
    )

    const n = (v: any) => Number(v ?? 0)
    return {
      porProduto: porProduto.map((l) => ({
        servidor: l.servidor, produto: l.produto ?? 'Sem produto',
        pagamentos: n(l.pagamentos), bruto: n(l.bruto), liquido: n(l.liquido),
      })),
      porVendedor: porVendedor.map((l) => ({ vendedor: l.vendedor, pagamentos: n(l.pagamentos), bruto: n(l.bruto) })),
      total: porProduto.reduce((soma, l) => soma + n(l.bruto), 0),
    }
  })
}
