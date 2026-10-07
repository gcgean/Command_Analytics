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

  // Cópia das revendas do banco externo. Ficam em tabelas nossas para o dashboard
  // não depender daquele servidor estar no ar na hora da consulta.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS revenda_externa (
      cod_ponto        INT NOT NULL PRIMARY KEY,
      descricao        VARCHAR(100) NULL,
      razao_social     VARCHAR(150) NULL,
      cnpj             VARCHAR(20) NULL,
      cidade           VARCHAR(100) NULL,
      estado           VARCHAR(10) NULL,
      ativa            CHAR(1) NULL,
      perc_revenda     FLOAT NULL,
      nome_responsavel VARCHAR(100) NULL,
      telefone         VARCHAR(30) NULL,
      email            VARCHAR(150) NULL,
      atualizado_em    DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Um cliente do banco externo, já reduzido ao que o dashboard precisa.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS revenda_externa_cliente (
      cod_cli       INT NOT NULL PRIMARY KEY,
      cod_ponto     INT NULL,
      nome          VARCHAR(200) NULL,
      documento     VARCHAR(20) NULL,
      ativo         CHAR(1) NULL,
      mensalidade   DECIMAL(10,2) NOT NULL DEFAULT 0,
      cadastro      DATE NULL,
      desativacao   DATE NULL,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_rev_ext_cli_ponto (cod_ponto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
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

/** Colunas existentes numa tabela do banco externo, em minúsculas → nome real. */
async function colunasDe(conexao: mysql.Connection, tabela: string): Promise<Map<string, string>> {
  const [linhas] = await conexao.query<any[]>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`, [tabela],
  )
  const mapa = new Map<string, string>()
  for (const l of linhas) {
    const nome = String(l.c ?? l.COLUMN_NAME ?? l.column_name)
    mapa.set(nome.toLowerCase(), nome)
  }
  return mapa
}

/** Primeiro nome de coluna que existir, entre os candidatos. */
function achar(mapa: Map<string, string>, ...candidatos: string[]): string | null {
  for (const c of candidatos) {
    const real = mapa.get(c.toLowerCase())
    if (real) return real
  }
  return null
}

/** `coluna AS apelido`, ou NULL quando a coluna não existe lá. */
function campo(mapa: Map<string, string>, apelido: string, ...candidatos: string[]): string {
  const real = achar(mapa, ...candidatos)
  return real ? `\`${real}\` AS ${apelido}` : `NULL AS ${apelido}`
}

const soData = (v: any): string | null => {
  if (!v) return null
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== '0000-00-00' ? s : null
}

/**
 * Copia as revendas e os clientes do banco externo para as nossas tabelas.
 *
 * O esquema de lá não é nosso e pode variar entre instalações, então as colunas são descobertas
 * em tempo de execução: o que existir é copiado, o que faltar vira NULL. Assim a sincronização
 * não quebra por causa de uma coluna com outro nome.
 */
export async function sincronizarRevendas(): Promise<ResultadoSyncRevendas> {
  const resultado: ResultadoSyncRevendas = { revendas: 0, clientes: 0, faturamento: 0 }
  const config = await obterConfigRevendas()
  if (!config?.ativo) return { ...resultado, erro: 'Integração das revendas desativada.' }

  let conexao: mysql.Connection | null = null
  try {
    conexao = await conectarRevendas(config)

    const colRevenda = await colunasDe(conexao, 'ponto_revenda')
    if (colRevenda.size === 0) {
      throw new Error('A tabela `ponto_revenda` não existe nesse banco. Confira o banco informado.')
    }
    const chaveRevenda = achar(colRevenda, 'cod_ponto', 'id', 'codigo')
    if (!chaveRevenda) throw new Error('Não encontrei a coluna de código em `ponto_revenda`.')

    const [revendas] = await conexao.query<any[]>(
      `SELECT \`${chaveRevenda}\` AS cod_ponto,
              ${campo(colRevenda, 'descricao', 'descricao', 'nome', 'fantasia')},
              ${campo(colRevenda, 'razao_social', 'razao_social')},
              ${campo(colRevenda, 'cnpj', 'cnpj', 'documento')},
              ${campo(colRevenda, 'cidade', 'cidade')},
              ${campo(colRevenda, 'estado', 'estado', 'uf')},
              ${campo(colRevenda, 'ativa', 'ATIVO', 'ativa')},
              ${campo(colRevenda, 'perc_revenda', 'perc_revenda', 'percentual')},
              ${campo(colRevenda, 'nome_responsavel', 'nome_responsavel', 'responsavel')},
              ${campo(colRevenda, 'telefone', 'telefone', 'celular_suporte', 'fone')},
              ${campo(colRevenda, 'email', 'email')}
         FROM \`ponto_revenda\``,
    )

    for (const r of revendas) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO revenda_externa
           (cod_ponto, descricao, razao_social, cnpj, cidade, estado, ativa, perc_revenda,
            nome_responsavel, telefone, email)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           descricao=VALUES(descricao), razao_social=VALUES(razao_social), cnpj=VALUES(cnpj),
           cidade=VALUES(cidade), estado=VALUES(estado), ativa=VALUES(ativa),
           perc_revenda=VALUES(perc_revenda), nome_responsavel=VALUES(nome_responsavel),
           telefone=VALUES(telefone), email=VALUES(email)`,
        Number(r.cod_ponto), texto(r.descricao, 100), texto(r.razao_social, 150), texto(r.cnpj, 20),
        texto(r.cidade, 100), texto(r.estado, 10), texto(r.ativa, 1) ?? 'S',
        r.perc_revenda == null ? null : Number(r.perc_revenda),
        texto(r.nome_responsavel, 100), texto(r.telefone, 30), texto(r.email, 150),
      )
      resultado.revendas += 1
    }
    // Revenda que sumiu de lá não deve continuar aparecendo aqui.
    const vivos = revendas.map((r) => Number(r.cod_ponto)).filter((n) => Number.isFinite(n))
    if (vivos.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM revenda_externa WHERE cod_ponto NOT IN (${vivos.map(() => '?').join(',')})`, ...vivos,
      )
    }

    // ── Clientes ──
    const colCliente = await colunasDe(conexao, 'cliente')
    const chaveCliente = achar(colCliente, 'cod_cli', 'id', 'codigo')
    const colPonto = achar(colCliente, 'cod_ponto_revenda', 'cod_ponto', 'id_revenda')
    if (chaveCliente && colPonto) {
      const [clientes] = await conexao.query<any[]>(
        `SELECT \`${chaveCliente}\` AS cod_cli, \`${colPonto}\` AS cod_ponto,
                ${campo(colCliente, 'nome', 'NOME_CLI', 'razao_social', 'nome')},
                ${campo(colCliente, 'documento', 'CNPJ_CLI', 'cnpj', 'documento')},
                ${campo(colCliente, 'ativo', 'ATIVO')},
                ${campo(colCliente, 'mensalidade', 'valor_mensalidade', 'mensalidade')},
                ${campo(colCliente, 'cadastro', 'DATACADASTRO_CLI', 'data_cadastro', 'criado_em')},
                ${campo(colCliente, 'desativacao', 'DATA_DESATIVACAO', 'data_desativacao')}
           FROM \`cliente\``,
      )
      for (const c of clientes) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO revenda_externa_cliente
             (cod_cli, cod_ponto, nome, documento, ativo, mensalidade, cadastro, desativacao)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             cod_ponto=VALUES(cod_ponto), nome=VALUES(nome), documento=VALUES(documento),
             ativo=VALUES(ativo), mensalidade=VALUES(mensalidade),
             cadastro=VALUES(cadastro), desativacao=VALUES(desativacao)`,
          Number(c.cod_cli), c.cod_ponto == null ? null : Number(c.cod_ponto),
          texto(c.nome, 200), texto(String(c.documento ?? '').replace(/\D/g, ''), 20) || null,
          texto(c.ativo, 1) ?? 'S', Number(c.mensalidade ?? 0),
          soData(c.cadastro), soData(c.desativacao),
        )
        resultado.clientes += 1
        if (String(c.ativo ?? 'S') === 'S') resultado.faturamento += Number(c.mensalidade ?? 0)
      }
    } else {
      resultado.erro = 'As revendas vieram, mas não achei em `cliente` a coluna que aponta para a revenda.'
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
  } finally {
    await conexao?.end().catch(() => {})
  }
  return resultado
}

/** Corta o texto no tamanho da coluna e troca vazio por null. */
function texto(v: any, max: number): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}
