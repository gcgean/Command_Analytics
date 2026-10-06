import { prisma } from '../database/client'

/**
 * Sincronização com as plataformas PayCore (Command System e Cilos são servidores distintos, cada
 * um com sua base e sua chave). Em vez de webhook, a rotina puxa por API de hora em hora: o dado
 * de lá não é urgente aqui, e assim não dependemos de endpoint público nem de reentrega.
 *
 * Tudo que entra carrega o servidor de origem e a aplicação (produto), senão não dá para saber de
 * onde veio o faturamento nem separar por produto.
 */
/**
 * A primeira versão desta integração era por webhook e criou tabelas sem `servidor_id` nem os
 * campos de produto. Como `CREATE TABLE IF NOT EXISTS` não altera tabela existente, aqui as
 * sobras são removidas — e só quando estão vazias, para nunca descartar dado já sincronizado.
 */
async function removerEsquemaAntigo(): Promise<void> {
  const precisaServidor = ['paycore_cliente', 'paycore_assinatura', 'paycore_faturamento']
  for (const tabela of precisaServidor) {
    const [existe] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, tabela,
    )
    if (Number(existe?.c ?? 0) === 0) continue

    const [temColuna] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'servidor_id'`, tabela,
    )
    if (Number(temColuna?.c ?? 0) > 0) continue

    const [linhas] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM ${tabela}`)
    if (Number(linhas?.c ?? 0) > 0) {
      console.warn(`⚠ ${tabela} está no formato antigo e tem dados — recrie manualmente para incluir o servidor.`)
      continue
    }
    await prisma.$executeRawUnsafe(`DROP TABLE ${tabela}`)
    console.log(`✓ ${tabela} recriada no formato novo (estava vazia, no formato antigo)`)
  }

  // Resíduos da abordagem por webhook, que não é mais usada.
  for (const tabela of ['paycore_evento', 'configuracao_paycore']) {
    const [existe] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, tabela,
    )
    if (Number(existe?.c ?? 0) === 0) continue
    const [linhas] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM ${tabela}`)
    // configuracao_paycore nasce com uma linha vazia; só é descartada se continuar sem segredo.
    const vazia = tabela === 'configuracao_paycore'
      ? Number((await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM configuracao_paycore WHERE COALESCE(webhook_secret,'') <> ''`))[0]?.c ?? 0) === 0
      : Number(linhas?.c ?? 0) === 0
    if (vazia) await prisma.$executeRawUnsafe(`DROP TABLE ${tabela}`)
  }
}

export async function initPaycoreSync(): Promise<void> {
  await removerEsquemaAntigo()

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS paycore_servidor (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(80) NOT NULL,
      base_url      VARCHAR(200) NOT NULL,
      api_key       VARCHAR(255) NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ultima_sync   DATETIME NULL,
      ultimo_erro   VARCHAR(500) NULL,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_paycore_servidor (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Produtos de cada servidor (as "aplicações" do PayCore).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS paycore_aplicacao (
      servidor_id   INT NOT NULL,
      app_id        VARCHAR(80) NOT NULL,
      nome          VARCHAR(150) NULL,
      slug          VARCHAR(100) NULL,
      status        VARCHAR(30) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (servidor_id, app_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS paycore_cliente (
      servidor_id     INT NOT NULL,
      customer_id     VARCHAR(80) NOT NULL,
      documento       VARCHAR(20) NULL,
      razao_social    VARCHAR(200) NULL,
      nome_fantasia   VARCHAR(200) NULL,
      email           VARCHAR(150) NULL,
      telefone        VARCHAR(30) NULL,
      segmento        VARCHAR(100) NULL,
      status          VARCHAR(30) NULL,
      total_gasto     DECIMAL(12,2) NULL,
      cod_cli         INT NULL,
      vendedor_id     INT NULL,
      vendedor_nome   VARCHAR(150) NULL,
      vendedor_origem VARCHAR(30) NULL,
      criado_em       DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (servidor_id, customer_id),
      INDEX idx_paycore_cliente_doc (documento),
      INDEX idx_paycore_cliente_cod (cod_cli)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS paycore_assinatura (
      servidor_id     INT NOT NULL,
      subscription_id VARCHAR(80) NOT NULL,
      customer_id     VARCHAR(80) NULL,
      cliente_nome    VARCHAR(200) NULL,
      app_id          VARCHAR(80) NULL,
      app_nome        VARCHAR(150) NULL,
      plano_id        VARCHAR(80) NULL,
      plano           VARCHAR(150) NULL,
      periodicidade   VARCHAR(30) NULL,
      mensal          DECIMAL(10,2) NOT NULL DEFAULT 0,
      valor_modulos   DECIMAL(10,2) NOT NULL DEFAULT 0,
      modulos         TEXT NULL,
      status          VARCHAR(30) NULL,
      forma_pagamento VARCHAR(30) NULL,
      inicio          DATETIME NULL,
      proxima_renovacao DATETIME NULL,
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (servidor_id, subscription_id),
      INDEX idx_paycore_assin_cliente (servidor_id, customer_id),
      INDEX idx_paycore_assin_app (app_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS paycore_faturamento (
      servidor_id     INT NOT NULL,
      payment_id      VARCHAR(80) NOT NULL,
      charge_id       VARCHAR(80) NULL,
      subscription_id VARCHAR(80) NULL,
      customer_id     VARCHAR(80) NULL,
      cliente_nome    VARCHAR(200) NULL,
      app_id          VARCHAR(80) NULL,
      app_nome        VARCHAR(150) NULL,
      valor           DECIMAL(10,2) NOT NULL DEFAULT 0,
      valor_liquido   DECIMAL(10,2) NULL,
      taxa_gateway    DECIMAL(10,2) NULL,
      metodo          VARCHAR(30) NULL,
      status          VARCHAR(30) NULL,
      pago_em         DATETIME NULL,
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (servidor_id, payment_id),
      INDEX idx_paycore_fat_cliente (servidor_id, customer_id),
      INDEX idx_paycore_fat_pago (pago_em),
      INDEX idx_paycore_fat_app (app_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export interface ServidorPaycore {
  id: number
  nome: string
  baseUrl: string
  apiKey: string | null
  ativo: boolean
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const texto = (v: unknown, max: number) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, max))
const data = (v: unknown) => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}
const numero = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * A URL do painel (paycore.cliente.com.br) e a da API (api-paycore.cliente.com.br) são parecidas,
 * e cadastrar a do painel devolve o HTML do site — que estoura como "Unexpected token '<'". Aqui
 * o prefixo é corrigido sozinho, porque é um engano fácil de cometer e óbvio de resolver.
 */
export function normalizarBaseUrl(url: string): string {
  const limpa = String(url ?? '').trim().replace(/\/+$/, '')
  return limpa.replace(/^(https?:\/\/)(?!api-)paycore\./i, '$1api-paycore.')
}

/**
 * A lista pode vir direto em `data` ou embrulhada no envelope `{ success, data: { data, meta } }`,
 * dependendo da rota. Aqui a lista é extraída de qualquer um dos formatos — espalhar o objeto
 * errado estourava com "Spread syntax requires ...iterable".
 */
export function extrairLista(corpo: any): { itens: any[]; meta: any } {
  if (Array.isArray(corpo)) return { itens: corpo, meta: null }
  if (Array.isArray(corpo?.data)) return { itens: corpo.data, meta: corpo?.meta ?? null }
  if (Array.isArray(corpo?.data?.data)) return { itens: corpo.data.data, meta: corpo?.data?.meta ?? corpo?.meta ?? null }
  if (Array.isArray(corpo?.items)) return { itens: corpo.items, meta: corpo?.meta ?? null }
  if (Array.isArray(corpo?.results)) return { itens: corpo.results, meta: corpo?.meta ?? null }
  return { itens: [], meta: corpo?.meta ?? corpo?.data?.meta ?? null }
}

/** Busca paginada numa rota da API, trazendo todas as páginas. */
async function buscarTudo(servidor: ServidorPaycore, rota: string, params: Record<string, string> = {}): Promise<any[]> {
  const itens: any[] = []
  let pagina = 1
  const limite = 100

  // Teto de páginas: evita laço infinito se a API devolver meta estranho.
  for (let i = 0; i < 100; i++) {
    const qs = new URLSearchParams({ ...params, page: String(pagina), limit: String(limite) })
    const url = `${normalizarBaseUrl(servidor.baseUrl)}${rota}?${qs}`
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${servidor.apiKey ?? ''}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!resposta.ok) {
      throw new Error(`${rota} respondeu ${resposta.status} ${resposta.statusText}`)
    }

    // Resposta em HTML quer dizer que a URL aponta pro painel, não pra API.
    const tipo = resposta.headers.get('content-type') ?? ''
    if (!tipo.includes('json')) {
      throw new Error(`${rota} devolveu ${tipo || 'conteúdo não-JSON'} — confira se a URL é a da API (api-paycore...), não a do painel.`)
    }
    const corpo: any = await resposta.json()
    const { itens: lote, meta } = extrairLista(corpo)
    itens.push(...lote)

    const total = Number(meta?.total ?? meta?.totalItems ?? meta?.count ?? 0)
    const paginas = Number(meta?.lastPage ?? meta?.totalPages ?? meta?.pageCount ?? (total ? Math.ceil(total / limite) : 0))
    if (lote.length < limite || (paginas && pagina >= paginas)) break
    pagina += 1
  }
  return itens
}

/**
 * Quem vendeu, procurando pelo documento na nossa base: primeiro a precificação feita para o
 * cliente, depois o negócio no CRM. A plataforma não informa vendedor — só revenda.
 */
async function descobrirVendedor(documento: string) {
  const doc = soDigitos(documento)
  if (doc.length !== 11 && doc.length !== 14) return { codCli: null, id: null, nome: null, origem: null }

  const [cli] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.cod_cli FROM cliente c
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
      ORDER BY CASE WHEN COALESCE(c.ATIVO,'S')='S' THEN 0 ELSE 1 END LIMIT 1`,
    doc,
  )
  const codCli = cli?.cod_cli ? Number(cli.cod_cli) : null

  if (codCli) {
    const [prec] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT o.usuario_id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome
         FROM orcamento_proposta o LEFT JOIN usuario u ON u.COD_USU = o.usuario_id
        WHERE o.cliente_id = ? AND o.usuario_id IS NOT NULL ORDER BY o.id DESC LIMIT 1`,
      codCli,
    )
    if (prec?.usuario_id) return { codCli, id: Number(prec.usuario_id), nome: prec.nome ?? null, origem: 'precificacao' }
  }

  const [negocio] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT n.id_usu, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU, n.usuario) AS nome
       FROM negocios n
       INNER JOIN negocios_clientes nc ON nc.id = n.id_cli
       LEFT JOIN usuario u ON u.COD_USU = n.id_usu
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(nc.cnpj,'.',''),'/',''),'-',''),' ','') = ?
      ORDER BY n.data_hora_ganho IS NULL, n.data_hora_ganho DESC, n.id DESC LIMIT 1`,
    doc,
  )
  if (negocio) {
    let id = negocio.id_usu ? Number(negocio.id_usu) : null
    const nome = negocio.nome ?? null
    // No CRM o código do vendedor costuma vir nulo e só o nome é preenchido; quando dá, resolve.
    if (!id && nome) {
      const [u] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COD_USU FROM usuario
          WHERE UPPER(TRIM(COALESCE(NOME_USUARIO_COMPLETO, NOME_USU))) = UPPER(TRIM(?))
             OR UPPER(TRIM(NOME_USU)) = UPPER(TRIM(?)) LIMIT 1`,
        nome, nome,
      )
      if (u?.COD_USU) id = Number(u.COD_USU)
    }
    return { codCli, id, nome, origem: 'crm' }
  }
  return { codCli, id: null, nome: null, origem: null }
}

export interface ResultadoSync {
  servidor: string
  aplicacoes: number
  clientes: number
  assinaturas: number
  pagamentos: number
  erro?: string
}

/** Sincroniza um servidor inteiro: produtos, clientes, assinaturas e pagamentos. */
export async function sincronizarServidor(servidor: ServidorPaycore): Promise<ResultadoSync> {
  const resultado: ResultadoSync = { servidor: servidor.nome, aplicacoes: 0, clientes: 0, assinaturas: 0, pagamentos: 0 }

  try {
    // ── Produtos (aplicações) ──
    const apps = await buscarTudo(servidor, '/api/v1/applications')
    for (const a of apps) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO paycore_aplicacao (servidor_id, app_id, nome, slug, status) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE nome=VALUES(nome), slug=VALUES(slug), status=VALUES(status)`,
        servidor.id, texto(a.id, 80), texto(a.name, 150), texto(a.slug, 100), texto(a.status, 30),
      )
      resultado.aplicacoes += 1
    }

    // ── Clientes ──
    const clientes = await buscarTudo(servidor, '/api/v1/customers')
    for (const c of clientes) {
      const documento = soDigitos(c.document)
      const vendedor = await descobrirVendedor(documento)
      const responsavel = Array.isArray(c.responsibles) ? c.responsibles[0] : null
      await prisma.$executeRawUnsafe(
        `INSERT INTO paycore_cliente
           (servidor_id, customer_id, documento, razao_social, nome_fantasia, email, telefone, segmento, status,
            total_gasto, cod_cli, vendedor_id, vendedor_nome, vendedor_origem)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           documento=VALUES(documento), razao_social=VALUES(razao_social), nome_fantasia=VALUES(nome_fantasia),
           email=VALUES(email), telefone=VALUES(telefone), segmento=VALUES(segmento), status=VALUES(status),
           total_gasto=VALUES(total_gasto), cod_cli=COALESCE(VALUES(cod_cli), cod_cli),
           vendedor_id=COALESCE(VALUES(vendedor_id), vendedor_id),
           vendedor_nome=COALESCE(VALUES(vendedor_nome), vendedor_nome),
           vendedor_origem=COALESCE(VALUES(vendedor_origem), vendedor_origem)`,
        servidor.id, texto(c.id, 80), documento || null, texto(c.legalName, 200), texto(c.tradeName, 200),
        texto(c.email, 150), texto(c.mobilePhone ?? c.phone ?? responsavel?.phone, 30),
        texto(c.segment?.name, 100), texto(c.status, 30), numero(c.totalSpent),
        vendedor.codCli, vendedor.id, texto(vendedor.nome, 150), vendedor.origem,
      )
      resultado.clientes += 1
    }

    // ── Assinaturas (trazem appId/app: o produto) ──
    const assinaturas = await buscarTudo(servidor, '/api/v1/subscriptions')
    for (const s of assinaturas) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO paycore_assinatura
           (servidor_id, subscription_id, customer_id, cliente_nome, app_id, app_nome, plano_id, plano,
            periodicidade, mensal, valor_modulos, modulos, status, forma_pagamento, inicio, proxima_renovacao)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           customer_id=VALUES(customer_id), cliente_nome=VALUES(cliente_nome), app_id=VALUES(app_id),
           app_nome=VALUES(app_nome), plano_id=VALUES(plano_id), plano=VALUES(plano),
           periodicidade=VALUES(periodicidade), mensal=VALUES(mensal), valor_modulos=VALUES(valor_modulos),
           modulos=VALUES(modulos), status=VALUES(status), forma_pagamento=VALUES(forma_pagamento),
           inicio=VALUES(inicio), proxima_renovacao=VALUES(proxima_renovacao)`,
        servidor.id, texto(s.id, 80), texto(s.clientId, 80), texto(s.client ?? s.company, 200),
        texto(s.appId, 80), texto(s.app, 150), texto(s.planId, 80), texto(s.plan ?? s.planBase, 150),
        texto(s.periodicity, 30), Number(s.monthly ?? 0), Number(s.modulesValue ?? 0),
        Array.isArray(s.modules) && s.modules.length ? JSON.stringify(s.modules).slice(0, 60000) : null,
        texto(s.status, 30), texto(s.paymentMethod, 30), data(s.startDate), data(s.nextRenewal),
      )
      resultado.assinaturas += 1
    }

    // ── Pagamentos (o faturamento de fato) ──
    const pagamentos = await buscarTudo(servidor, '/api/v1/payments')
    for (const p of pagamentos) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO paycore_faturamento
           (servidor_id, payment_id, charge_id, subscription_id, customer_id, cliente_nome, app_id, app_nome,
            valor, valor_liquido, taxa_gateway, metodo, status, pago_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           charge_id=VALUES(charge_id), subscription_id=VALUES(subscription_id), customer_id=VALUES(customer_id),
           cliente_nome=VALUES(cliente_nome), app_id=VALUES(app_id), app_nome=VALUES(app_nome),
           valor=VALUES(valor), valor_liquido=VALUES(valor_liquido), taxa_gateway=VALUES(taxa_gateway),
           metodo=VALUES(metodo), status=VALUES(status), pago_em=VALUES(pago_em)`,
        servidor.id, texto(p.id, 80), texto(p.chargeId, 80), texto(p.subscriptionId, 80),
        texto(p.clientId, 80), texto(p.client ?? p.company, 200), texto(p.appId, 80), texto(p.app, 150),
        Number(p.amountPaid ?? p.amount ?? 0), numero(p.netAmount), numero(p.gatewayFeeAmount),
        texto(p.paymentMethod, 30), texto(p.status, 30), data(p.paidAt ?? p.confirmedAt ?? p.date),
      )
      resultado.pagamentos += 1
    }

    await prisma.$executeRawUnsafe(
      `UPDATE paycore_servidor SET ultima_sync = NOW(), ultimo_erro = NULL WHERE id = ?`, servidor.id,
    )
  } catch (e: any) {
    resultado.erro = String(e?.message ?? e).slice(0, 500)
    await prisma.$executeRawUnsafe(
      `UPDATE paycore_servidor SET ultimo_erro = ? WHERE id = ?`, resultado.erro, servidor.id,
    )
    console.warn(`⚠ PayCore (${servidor.nome}): ${resultado.erro}`)
  }
  return resultado
}

export async function listarServidoresAtivos(): Promise<ServidorPaycore[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, base_url, api_key, ativo FROM paycore_servidor WHERE ativo = 1 AND COALESCE(api_key,'') <> ''`,
  )
  return linhas.map((l) => ({
    id: Number(l.id), nome: l.nome, baseUrl: l.base_url, apiKey: l.api_key, ativo: true,
  }))
}

export async function sincronizarTodos(): Promise<ResultadoSync[]> {
  const servidores = await listarServidoresAtivos()
  const resultados: ResultadoSync[] = []
  for (const s of servidores) resultados.push(await sincronizarServidor(s))
  return resultados
}

// ── Agendamento de hora em hora ──────────────────────────────────
const INTERVALO_MS = 60 * 60 * 1000
let handle: ReturnType<typeof setInterval> | null = null
let rodando = false

export function startPaycoreSyncScheduler(): void {
  if (handle) return
  const tick = async () => {
    if (rodando) return
    rodando = true
    try {
      const r = await sincronizarTodos()
      for (const x of r) {
        if (x.erro) continue
        console.log(`✓ PayCore ${x.servidor}: ${x.clientes} cliente(s), ${x.assinaturas} assinatura(s), ${x.pagamentos} pagamento(s)`)
      }
    } catch (e: any) {
      console.warn('⚠ Sincronização PayCore:', e?.message)
    } finally {
      rodando = false
    }
  }
  handle = setInterval(() => void tick(), INTERVALO_MS)
  // Primeira execução 2 minutos depois do boot, pra não concorrer com a subida do servidor.
  setTimeout(() => void tick(), 2 * 60 * 1000)
}
