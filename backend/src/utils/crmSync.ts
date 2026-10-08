import { prisma } from '../database/client'

/**
 * Sincronização com o CRM Cilos (app.crm.cilos.com.br). A API é somente leitura e usa login com
 * e-mail/senha, devolvendo um token de 24h — por isso o token fica guardado: a rota de login
 * aceita 10 tentativas a cada 15 minutos, e autenticar a cada chamada derrubaria a integração.
 *
 * Os dados ficam em tabelas próprias (`crm_*`), separadas das tabelas legadas `negocios` /
 * `negocios_clientes`, que são de outro processo e têm outro esquema. A finalidade aqui é
 * consulta: saber de quem é o negócio e qual vendedor atende cada documento.
 */
export async function initCrmSync(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_config (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      base_url      VARCHAR(200) NOT NULL DEFAULT 'https://app.crm.cilos.com.br',
      email         VARCHAR(150) NULL,
      senha         VARCHAR(255) NULL,
      company_id    INT NULL,
      token         TEXT NULL,
      token_expira  DATETIME NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      ultima_sync   DATETIME NULL,
      ultimo_erro   VARCHAR(500) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // A coluna canal foi acrescentada depois; o projeto não usa migrations.
  const [temCanal] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS q FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'crm_negocio' AND column_name = 'canal'`)
  if (Number(temCanal?.q ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE crm_negocio ADD COLUMN canal VARCHAR(100) NULL`)
    await prisma.$executeRawUnsafe(`ALTER TABLE crm_negocio ADD INDEX idx_crm_negocio_canal (canal)`)
      .catch(() => {})
  }

  const [linha] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM crm_config`)
  if (Number(linha?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`INSERT INTO crm_config (base_url) VALUES ('https://app.crm.cilos.com.br')`)
  }

  // Clientes e prospects do CRM. `vendedor_*` vem do responsável do cadastro.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_cliente (
      id             INT PRIMARY KEY,
      nome           VARCHAR(200) NULL,
      nome_fantasia  VARCHAR(200) NULL,
      documento      VARCHAR(20) NULL,
      tipo           VARCHAR(20) NULL,
      email          VARCHAR(150) NULL,
      telefone       VARCHAR(30) NULL,
      whatsapp       VARCHAR(30) NULL,
      codigo_externo VARCHAR(60) NULL,
      ativo          TINYINT(1) NULL,
      cidade         VARCHAR(100) NULL,
      estado         VARCHAR(10) NULL,
      canal          VARCHAR(100) NULL,
      segmento       VARCHAR(100) NULL,
      vendedor_id    INT NULL,
      vendedor_nome  VARCHAR(150) NULL,
      ultimo_ganho   DATETIME NULL,
      criado_em      DATETIME NULL,
      cod_cli        INT NULL,
      atualizado_em  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_crm_cliente_doc (documento),
      INDEX idx_crm_cliente_cod (cod_cli),
      INDEX idx_crm_cliente_vend (vendedor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_negocio (
      id             INT PRIMARY KEY,
      titulo         VARCHAR(200) NULL,
      valor          DECIMAL(12,2) NOT NULL DEFAULT 0,
      data           DATE NULL,
      status         VARCHAR(20) NULL,
      finalizado_em  DATETIME NULL,
      lead_id        INT NULL,
      lead_nome      VARCHAR(200) NULL,
      documento      VARCHAR(20) NULL,
      vendedor_id    INT NULL,
      vendedor_nome  VARCHAR(150) NULL,
      vendedor_email VARCHAR(150) NULL,
      etapa          VARCHAR(100) NULL,
      canal          VARCHAR(100) NULL,
      funil_id       INT NULL,
      motivo_ganho   VARCHAR(150) NULL,
      motivo_perda   VARCHAR(150) NULL,
      criado_em      DATETIME NULL,
      atualizado_em  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_crm_negocio_doc (documento),
      INDEX idx_crm_negocio_canal (canal),
      INDEX idx_crm_negocio_status (status),
      INDEX idx_crm_negocio_vend (vendedor_id),
      INDEX idx_crm_negocio_lead (lead_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_negocio_item (
      negocio_id     INT NOT NULL,
      produto_id     INT NOT NULL,
      produto_nome   VARCHAR(200) NULL,
      quantidade     DECIMAL(10,2) NOT NULL DEFAULT 0,
      valor_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
      desconto       DECIMAL(12,2) NOT NULL DEFAULT 0,
      total          DECIMAL(12,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (negocio_id, produto_id),
      INDEX idx_crm_item_produto (produto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const texto = (v: unknown, max: number) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, max))
const dataHora = (v: unknown) => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

interface ConfigCrm {
  id: number
  baseUrl: string
  email: string | null
  senha: string | null
  companyId: number | null
  token: string | null
  tokenExpira: Date | null
  ativo: boolean
}

export async function obterConfigCrm(): Promise<ConfigCrm | null> {
  const [l] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM crm_config ORDER BY id LIMIT 1`)
  if (!l) return null
  return {
    id: Number(l.id),
    baseUrl: String(l.base_url ?? '').replace(/\/$/, ''),
    email: l.email,
    senha: l.senha,
    companyId: l.company_id ? Number(l.company_id) : null,
    token: l.token,
    tokenExpira: l.token_expira ? new Date(l.token_expira) : null,
    ativo: Number(l.ativo) === 1,
  }
}

/**
 * Token válido, reaproveitando o guardado. O CRM mantém UMA sessão por usuário: um novo login
 * invalida o token anterior, então a conta usada aqui precisa ser exclusiva da integração — se
 * alguém entrar no CRM com ela, a sincronização para até o próximo ciclo.
 */
async function autenticar(config: ConfigCrm, forcar = false): Promise<{ token: string; companyId: number }> {
  const agora = Date.now()
  const margem = 5 * 60 * 1000 // renova 5 min antes de expirar
  if (!forcar && config.token && config.companyId && config.tokenExpira && config.tokenExpira.getTime() - margem > agora) {
    return { token: config.token, companyId: config.companyId }
  }
  if (!config.email || !config.senha) throw new Error('Informe o e-mail e a senha do usuário de integração do CRM.')

  const resposta = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.senha }),
    signal: AbortSignal.timeout(30_000),
  })
  const corpo: any = await resposta.json().catch(() => null)
  if (!resposta.ok || !corpo?.token) {
    throw new Error(corpo?.error || corpo?.message || `Login no CRM falhou (${resposta.status}).`)
  }

  const companyId = Number(corpo?.user?.companyId ?? 0)
  if (!companyId) throw new Error('O login não devolveu o código da empresa (companyId).')

  // Token vale 24h segundo a documentação; guardamos 23h para renovar antes.
  const expira = new Date(agora + 23 * 60 * 60 * 1000)
  await prisma.$executeRawUnsafe(
    `UPDATE crm_config SET token = ?, token_expira = ?, company_id = ? WHERE id = ?`,
    corpo.token, expira, companyId, config.id,
  )
  config.token = corpo.token
  config.tokenExpira = expira
  config.companyId = companyId
  return { token: corpo.token, companyId }
}

async function buscarCrm(config: ConfigCrm, rota: string, autenticacao: { token: string; companyId: number }): Promise<any> {
  const resposta = await fetch(`${config.baseUrl}${rota}`, {
    headers: { Authorization: `Bearer ${autenticacao.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  })
  if (resposta.status === 401) throw new Error('SESSAO_INVALIDA')
  const tipo = resposta.headers.get('content-type') ?? ''
  if (!tipo.includes('json')) {
    throw new Error(`${rota} devolveu ${tipo || 'conteúdo não-JSON'} — confira a URL do CRM.`)
  }
  const corpo: any = await resposta.json()
  if (!resposta.ok) throw new Error(corpo?.error || corpo?.message || `${rota} respondeu ${resposta.status}.`)
  return corpo
}

export interface ResultadoSyncCrm {
  clientes: number
  negocios: number
  itens: number
  erro?: string
}

/**
 * Carrega clientes e negócios. Os negócios vêm de /business/export, que traz tudo de uma vez com
 * produtos e motivos — a própria documentação alerta que ele não pagina e pesa, então é usado com
 * janela de data: a carga inicial pega um período largo e as seguintes só o período recente.
 */
export async function sincronizarCrm(opcoes?: { diasJanela?: number }): Promise<ResultadoSyncCrm> {
  const resultado: ResultadoSyncCrm = { clientes: 0, negocios: 0, itens: 0 }
  const config = await obterConfigCrm()
  if (!config || !config.ativo) return { ...resultado, erro: 'Integração do CRM desativada.' }

  try {
    let auth = await autenticar(config)

    const chamar = async (rota: string) => {
      try {
        return await buscarCrm(config, rota, auth)
      } catch (e: any) {
        // Sessão derrubada por outro login: autentica de novo uma vez e repete.
        if (String(e?.message) === 'SESSAO_INVALIDA') {
          auth = await autenticar(config, true)
          return await buscarCrm(config, rota, auth)
        }
        throw e
      }
    }

    // ── Clientes (leads) ──
    let pagina = 0
    for (let i = 0; i < 200; i++) {
      const corpo = await chamar(`/api/leads?companyId=${auth.companyId}&page=${pagina}&limit=100`)
      const lista: any[] = corpo?.leads ?? corpo?.data ?? []
      for (const c of lista) {
        const documento = soDigitos(c.documento)
        await prisma.$executeRawUnsafe(
          `INSERT INTO crm_cliente
             (id, nome, nome_fantasia, documento, tipo, email, telefone, whatsapp, codigo_externo, ativo,
              cidade, estado, canal, segmento, vendedor_id, vendedor_nome, ultimo_ganho, criado_em, cod_cli)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
             (SELECT cod_cli FROM cliente
               WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
               ORDER BY CASE WHEN COALESCE(ATIVO,'S')='S' THEN 0 ELSE 1 END LIMIT 1))
           ON DUPLICATE KEY UPDATE
             nome=VALUES(nome), nome_fantasia=VALUES(nome_fantasia), documento=VALUES(documento),
             tipo=VALUES(tipo), email=VALUES(email), telefone=VALUES(telefone), whatsapp=VALUES(whatsapp),
             codigo_externo=VALUES(codigo_externo), ativo=VALUES(ativo), cidade=VALUES(cidade),
             estado=VALUES(estado), canal=VALUES(canal), segmento=VALUES(segmento),
             vendedor_id=VALUES(vendedor_id), vendedor_nome=VALUES(vendedor_nome),
             ultimo_ganho=VALUES(ultimo_ganho), cod_cli=COALESCE(VALUES(cod_cli), cod_cli)`,
          Number(c.id), texto(c.nome, 200), texto(c.nomeFantasia, 200), documento || null, texto(c.type, 20),
          texto(c.email, 150), texto(c.telefone, 30), texto(c.whatsapp, 30), texto(c.codigoExterno, 60),
          c.ativo === false ? 0 : 1, texto(c.cidade, 100), texto(c.estado, 10),
          texto(c.canal?.nome, 100), texto(c.segmento?.nome, 100),
          c.user?.id ? Number(c.user.id) : null, texto(c.user?.name, 150),
          dataHora(c.lastWonBusinessDate), dataHora(c.createdAt),
          documento || '___sem_documento___',
        )
        resultado.clientes += 1
      }
      if (!corpo?.hasMore || lista.length === 0) break
      pagina += 1
    }

    // ── Negócios ──
    const dias = opcoes?.diasJanela ?? 3650
    const inicio = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
    const fim = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const corpoNeg = await chamar(`/api/business/export?company_id=${auth.companyId}&startDate=${inicio}&endDate=${fim}`)
    const negocios: any[] = corpoNeg?.negocios ?? corpoNeg?.data ?? []

    for (const n of negocios) {
      const documento = soDigitos(n.lead?.documento)
      await prisma.$executeRawUnsafe(
        `INSERT INTO crm_negocio
           (id, titulo, valor, data, status, finalizado_em, lead_id, lead_nome, documento,
            vendedor_id, vendedor_nome, vendedor_email, etapa, funil_id, motivo_ganho, motivo_perda, criado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           titulo=VALUES(titulo), valor=VALUES(valor), data=VALUES(data), status=VALUES(status),
           finalizado_em=VALUES(finalizado_em), lead_id=VALUES(lead_id), lead_nome=VALUES(lead_nome),
           documento=VALUES(documento), vendedor_id=VALUES(vendedor_id), vendedor_nome=VALUES(vendedor_nome),
           vendedor_email=VALUES(vendedor_email), etapa=VALUES(etapa), funil_id=VALUES(funil_id),
           motivo_ganho=VALUES(motivo_ganho), motivo_perda=VALUES(motivo_perda)`,
        Number(n.id), texto(n.title, 200), Number(n.value ?? 0),
        n.date ? String(n.date).slice(0, 10) : null, texto(n.status, 20), dataHora(n.finishedAt),
        n.leadId ?? n.lead?.id ?? null, texto(n.lead?.nome, 200), documento || null,
        n.user?.id ? Number(n.user.id) : null, texto(n.user?.name, 150), texto(n.user?.email, 150),
        texto(n.stage?.nome, 100), n.funilId ? Number(n.funilId) : null,
        texto(n.motivoGanho?.nome, 150), texto(n.motivoPerda?.nome, 150), dataHora(n.createdAt),
      )
      resultado.negocios += 1

      for (const p of Array.isArray(n.products) ? n.products : []) {
        if (!p?.productId) continue
        await prisma.$executeRawUnsafe(
          `INSERT INTO crm_negocio_item (negocio_id, produto_id, produto_nome, quantidade, valor_unitario, desconto, total)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE produto_nome=VALUES(produto_nome), quantidade=VALUES(quantidade),
             valor_unitario=VALUES(valor_unitario), desconto=VALUES(desconto), total=VALUES(total)`,
          Number(n.id), Number(p.productId), texto(p.productName, 200),
          Number(p.quantidade ?? 0), Number(p.valor_unitario ?? 0), Number(p.desconto ?? 0), Number(p.total ?? 0),
        )
        resultado.itens += 1
      }
    }

    // O canal é do lead, não do negócio: a exportação de negócios não o traz. Carimbamos depois,
    // para o dashboard poder agrupar e filtrar por canal sem um JOIN em toda consulta.
    await prisma.$executeRawUnsafe(
      `UPDATE crm_negocio n
         INNER JOIN crm_cliente c ON c.id = n.lead_id
          SET n.canal = NULLIF(c.canal, '')
        WHERE n.lead_id IS NOT NULL
          AND (n.canal IS NULL OR n.canal <> COALESCE(c.canal, ''))`,
    ).catch((e) => console.warn('⚠ CRM (canal):', e?.message))

    // O CRM responde 200 com lista vazia quando o usuário da integração não enxerga
    // os negócios — avisa em vez de deixar a tela em branco sem explicação.
    const aviso = resultado.clientes > 0 && resultado.negocios === 0
      ? 'O CRM devolveu os clientes, mas nenhum negócio. O usuário da integração '
        + 'provavelmente não tem permissão de ver os negócios dos outros operadores: '
        + 'no CRM, dê a esse usuário acesso aos negócios de toda a equipe.'
      : null

    await prisma.$executeRawUnsafe(
      `UPDATE crm_config SET ultima_sync = NOW(), ultimo_erro = ? WHERE id = ?`, aviso, config.id,
    )
  } catch (e: any) {
    resultado.erro = String(e?.message ?? e).slice(0, 500)
    await prisma.$executeRawUnsafe(`UPDATE crm_config SET ultimo_erro = ? WHERE id = ?`, resultado.erro, config.id)
    console.warn('⚠ CRM:', resultado.erro)
  }
  return resultado
}

/**
 * Vendedor responsável por um documento, segundo o CRM. É a consulta que o resto do sistema usa
 * para saber de quem é o cliente — inclusive os que chegam pelo PayCore.
 */
export async function vendedorDoDocumento(documento: string): Promise<{
  vendedorId: number | null; vendedorNome: string | null; origem: string | null; negocioId?: number
} | null> {
  const doc = soDigitos(documento)
  if (doc.length !== 11 && doc.length !== 14) return null

  // Vale o ÚLTIMO vendedor que atendeu o cliente, não o primeiro que aparecer:
  // o cliente pode ter passado por vários antes de fechar, e quem responde por
  // ele hoje é quem o atendeu por último. Por isso não damos preferência ao
  // negócio ganho — só à data mais recente.
  const [ultimo] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, vendedor_id, vendedor_nome, status
       FROM crm_negocio
      WHERE documento = ? AND vendedor_nome IS NOT NULL AND vendedor_nome <> ''
      ORDER BY COALESCE(finalizado_em, criado_em, data) DESC, id DESC
      LIMIT 1`, doc,
  )
  if (ultimo) {
    return {
      vendedorId: ultimo.vendedor_id ? Number(ultimo.vendedor_id) : null,
      vendedorNome: ultimo.vendedor_nome,
      origem: ultimo.status === 'won' ? 'crm_negocio_ganho' : 'crm_negocio',
      negocioId: Number(ultimo.id),
    }
  }

  // Sem negócio: cai no responsável pelo cadastro do cliente.
  const [cliente] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT vendedor_id, vendedor_nome FROM crm_cliente
      WHERE documento = ? AND vendedor_nome IS NOT NULL AND vendedor_nome <> ''
      ORDER BY atualizado_em DESC LIMIT 1`, doc,
  )
  if (cliente) {
    return {
      vendedorId: cliente.vendedor_id ? Number(cliente.vendedor_id) : null,
      vendedorNome: cliente.vendedor_nome, origem: 'crm_cliente',
    }
  }
  return null
}

// ── Agendamento ──────────────────────────────────────────────────
const INTERVALO_MS = 60 * 60 * 1000
let handle: ReturnType<typeof setInterval> | null = null
let rodando = false

export function startCrmSyncScheduler(): void {
  if (handle) return
  const tick = async () => {
    if (rodando) return
    rodando = true
    try {
      // Depois da carga inicial, só os últimos 60 dias: /business/export não pagina e carrega o
      // histórico de cada negócio, e a documentação pede janelas curtas.
      const [l] = await prisma.$queryRawUnsafe<any[]>(`SELECT ultima_sync FROM crm_config ORDER BY id LIMIT 1`)
      const janela = l?.ultima_sync ? 60 : 3650
      const r = await sincronizarCrm({ diasJanela: janela })
      if (!r.erro && (r.clientes || r.negocios)) {
        console.log(`✓ CRM: ${r.clientes} cliente(s), ${r.negocios} negócio(s), ${r.itens} item(ns)`)
      }
    } catch (e: any) {
      console.warn('⚠ Sincronização CRM:', e?.message)
    } finally {
      rodando = false
    }
  }
  handle = setInterval(() => void tick(), INTERVALO_MS)
  setTimeout(() => void tick(), 3 * 60 * 1000)
}
