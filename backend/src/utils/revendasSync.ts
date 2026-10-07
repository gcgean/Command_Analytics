import mysql from 'mysql2/promise'
import { prisma } from '../database/client'

/**
 * Conexão com o banco externo das revendas. É um MySQL separado do nosso: nada aqui passa pelo
 * Prisma, que tem um datasource só. O acesso é somente leitura — este módulo nunca escreve lá.
 *
 * A sincronização roda uma vez por dia, no horário configurado, e copia o que interessa para
 * tabelas nossas (`revenda_*`), para o dashboard não depender do banco externo estar no ar.
 */

export async function initRevendasSync(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS revenda_config (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      host          VARCHAR(150) NULL,
      porta         INT NOT NULL DEFAULT 3306,
      usuario       VARCHAR(100) NULL,
      senha         VARCHAR(255) NULL,
      banco         VARCHAR(100) NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 0,
      hora_sync     VARCHAR(5) NOT NULL DEFAULT '03:00',
      ultima_sync   DATETIME NULL,
      ultimo_erro   VARCHAR(500) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [linha] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM revenda_config`)
  if (Number(linha?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`INSERT INTO revenda_config (porta) VALUES (3306)`)
  }
}

export interface ConfigRevendas {
  id: number
  host: string | null
  porta: number
  usuario: string | null
  senha: string | null
  banco: string | null
  ativo: boolean
  horaSync: string
}

export async function obterConfigRevendas(): Promise<ConfigRevendas | null> {
  const [c] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM revenda_config ORDER BY id LIMIT 1`)
  if (!c) return null
  return {
    id: Number(c.id),
    host: c.host ?? null,
    porta: Number(c.porta ?? 3306),
    usuario: c.usuario ?? null,
    senha: c.senha ?? null,
    banco: c.banco ?? null,
    ativo: !!c.ativo,
    horaSync: c.hora_sync ?? '03:00',
  }
}

/** Abre uma conexão de leitura com o banco das revendas. Quem chama é responsável por fechar. */
export async function conectarRevendas(config?: ConfigRevendas | null) {
  const c = config ?? (await obterConfigRevendas())
  if (!c?.host || !c.usuario || !c.banco) {
    throw new Error('Configure host, usuário e banco das revendas antes de conectar.')
  }
  return mysql.createConnection({
    host: c.host,
    port: c.porta,
    user: c.usuario,
    password: c.senha ?? '',
    database: c.banco,
    connectTimeout: 15_000,
    // Leitura apenas: não permitimos múltiplos comandos numa mesma query.
    multipleStatements: false,
    dateStrings: true,
  })
}

/** Testa o acesso e devolve o que dá para saber do servidor sem ler dado nenhum. */
export async function testarConexaoRevendas(): Promise<{
  ok: boolean; versao?: string; banco?: string; tabelas?: number; erro?: string
}> {
  let conexao: mysql.Connection | null = null
  try {
    conexao = await conectarRevendas()
    const [[info]] = await conexao.query<any[]>('SELECT VERSION() AS versao, DATABASE() AS banco')
    const [[cont]] = await conexao.query<any[]>(
      'SELECT COUNT(*) AS q FROM information_schema.tables WHERE table_schema = DATABASE()',
    )
    return { ok: true, versao: info?.versao, banco: info?.banco, tabelas: Number(cont?.q ?? 0) }
  } catch (e: any) {
    return { ok: false, erro: mensagemErro(e) }
  } finally {
    await conexao?.end().catch(() => {})
  }
}

/**
 * Lista as tabelas do banco externo com contagem de linhas e colunas. Serve para mapear onde
 * estão as revendas antes de escrever a sincronização — o esquema de lá não é nosso.
 */
export async function mapearBancoRevendas(filtro?: string): Promise<{
  banco: string | null
  tabelas: Array<{ tabela: string; linhas: number; colunas: string[] }>
}> {
  let conexao: mysql.Connection | null = null
  try {
    conexao = await conectarRevendas()
    const [[info]] = await conexao.query<any[]>('SELECT DATABASE() AS banco')

    const [tabelas] = await conexao.query<any[]>(
      `SELECT table_name AS tabela, COALESCE(table_rows, 0) AS linhas
         FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
          ${filtro ? 'AND table_name LIKE ?' : ''}
        ORDER BY table_name`,
      filtro ? [`%${filtro}%`] : [],
    )

    const [colunas] = await conexao.query<any[]>(
      `SELECT table_name AS tabela, column_name AS coluna, column_type AS tipo
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, ordinal_position`,
    )
    const porTabela = new Map<string, string[]>()
    for (const c of colunas) {
      const lista = porTabela.get(c.tabela) ?? []
      lista.push(`${c.coluna}:${c.tipo}`)
      porTabela.set(c.tabela, lista)
    }

    return {
      banco: info?.banco ?? null,
      tabelas: tabelas.map((t) => ({
        tabela: String(t.tabela),
        // table_rows é estimativa do InnoDB; serve para achar as tabelas que têm dado.
        linhas: Number(t.linhas ?? 0),
        colunas: porTabela.get(t.tabela) ?? [],
      })),
    }
  } finally {
    await conexao?.end().catch(() => {})
  }
}

/** Roda um SELECT de inspeção no banco externo. Só leitura, com teto de linhas. */
export async function consultarRevendas(sql: string, limite = 50): Promise<any[]> {
  const limpo = sql.trim().replace(/;+\s*$/, '')
  if (!/^select\b/i.test(limpo)) throw new Error('Só é permitido SELECT nesta consulta.')
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|replace)\b/i.test(limpo)) {
    throw new Error('Só é permitido SELECT nesta consulta.')
  }
  let conexao: mysql.Connection | null = null
  try {
    conexao = await conectarRevendas()
    const comTeto = /\blimit\b/i.test(limpo) ? limpo : `${limpo} LIMIT ${Math.min(limite, 500)}`
    const [linhas] = await conexao.query<any[]>(comTeto)
    return Array.isArray(linhas) ? linhas : []
  } finally {
    await conexao?.end().catch(() => {})
  }
}

/** Traduz os erros do driver para algo que o usuário consiga agir. */
function mensagemErro(e: any): string {
  const codigo = String(e?.code ?? '')
  if (codigo === 'ETIMEDOUT' || codigo === 'ECONNREFUSED') {
    return 'Não foi possível alcançar o servidor. Confira host, porta e se o IP deste servidor está liberado no banco.'
  }
  if (codigo === 'ER_ACCESS_DENIED_ERROR') return 'Usuário ou senha recusados pelo banco das revendas.'
  if (codigo === 'ER_BAD_DB_ERROR') return 'O banco informado não existe nesse servidor.'
  if (codigo === 'ENOTFOUND') return 'Host não encontrado. Confira o endereço.'
  return String(e?.message ?? e).slice(0, 400)
}

// ── Agendamento diário ───────────────────────────────────────────
// Confere de 10 em 10 minutos se já passou da hora e se hoje ainda não rodou.
const INTERVALO_MS = 10 * 60 * 1000
let handle: ReturnType<typeof setInterval> | null = null
let rodando = false

export function startRevendasSyncScheduler(): void {
  if (handle) return
  const tick = async () => {
    if (rodando) return
    rodando = true
    try {
      const config = await obterConfigRevendas()
      if (!config?.ativo || !config.host) return

      const agora = new Date()
      const [h, m] = String(config.horaSync).split(':').map(Number)
      const alvo = new Date(agora)
      alvo.setHours(h || 0, m || 0, 0, 0)
      if (agora < alvo) return

      const [l] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT ultima_sync FROM revenda_config ORDER BY id LIMIT 1`,
      )
      if (l?.ultima_sync && new Date(l.ultima_sync) >= alvo) return

      const r = await sincronizarRevendas()
      if (!r.erro) console.log(`✓ Revendas: ${r.revendas} revenda(s) sincronizada(s).`)
    } catch (e: any) {
      console.warn('⚠ Revendas (agendamento):', String(e?.message ?? e))
    } finally {
      rodando = false
    }
  }
  handle = setInterval(tick, INTERVALO_MS)
  setTimeout(tick, 5 * 60 * 1000)
}

export interface ResultadoSyncRevendas {
  revendas: number
  clientes: number
  faturamento: number
  erro?: string
}

/**
 * Copia os dados das revendas para as nossas tabelas. O mapeamento depende do esquema do banco
 * externo — use `mapearBancoRevendas()` para levantá-lo antes de preencher esta função.
 */
export async function sincronizarRevendas(): Promise<ResultadoSyncRevendas> {
  const resultado: ResultadoSyncRevendas = { revendas: 0, clientes: 0, faturamento: 0 }
  const config = await obterConfigRevendas()
  if (!config?.ativo) return { ...resultado, erro: 'Integração das revendas desativada.' }

  try {
    const conexao = await conectarRevendas(config)
    try {
      // TODO: mapear as tabelas de revendas do banco externo (ainda não conhecemos o esquema).
      resultado.erro = 'Mapeamento das tabelas de revendas ainda não configurado.'
    } finally {
      await conexao.end().catch(() => {})
    }

    await prisma.$executeRawUnsafe(
      `UPDATE revenda_config SET ultima_sync = NOW(), ultimo_erro = ? WHERE id = ?`,
      resultado.erro ?? null, config.id,
    )
  } catch (e: any) {
    resultado.erro = mensagemErro(e)
    await prisma.$executeRawUnsafe(
      `UPDATE revenda_config SET ultimo_erro = ? WHERE id = ?`, resultado.erro, config.id,
    )
    console.warn('⚠ Revendas:', resultado.erro)
  }
  return resultado
}
