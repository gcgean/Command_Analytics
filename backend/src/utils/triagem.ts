import crypto from 'node:crypto'
import { prisma } from '../database/client'

/**
 * Motor de triagem guiada.
 *
 * É genérico de propósito: a triagem de meios de pagamento é a primeira, mas virão outras, e
 * três telas quase iguais acabam divergindo. Aqui o questionário, as ramificações e os cenários
 * são CADASTRO — criar uma triagem nova não exige programar.
 *
 * O atendimento resultante vira um processo do Pipeline (`implantacao_processos` com um `tipo`
 * próprio), então herda quadro, auditoria, SLA, responsáveis e histórico que já existem.
 */

export async function initTriagem(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_modelo (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(160) NOT NULL,
      slug          VARCHAR(60) NOT NULL,
      descricao     VARCHAR(500) NULL,
      -- Vai para implantacao_processos.tipo, separando este fluxo dos demais no Pipeline.
      tipo_processo VARCHAR(60) NOT NULL,
      -- Etapa inicial do processo criado, de cadastro_etapas.
      etapa_inicial INT NULL,
      -- Permite que o próprio cliente responda por link.
      permite_link  TINYINT(1) NOT NULL DEFAULT 1,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_triagem_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_pergunta (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      modelo_id   INT NOT NULL,
      -- Identificador estável usado pelas condições e pelos cenários.
      chave       VARCHAR(60) NOT NULL,
      texto       VARCHAR(400) NOT NULL,
      ajuda       VARCHAR(400) NULL,
      -- texto | numero | opcao | multipla | sim_nao | cnpj | telefone | data | longo
      tipo        VARCHAR(20) NOT NULL DEFAULT 'texto',
      opcoes      TEXT NULL,
      obrigatoria TINYINT(1) NOT NULL DEFAULT 0,
      -- Quem responde: 'ambos', 'tecnico' (não aparece no link do cliente) ou 'cliente'.
      publico     VARCHAR(10) NOT NULL DEFAULT 'ambos',
      -- Só aparece quando a condição bate. JSON: {chave, operador, valor}
      condicao    TEXT NULL,
      grupo       VARCHAR(80) NULL,
      ordem       INT NOT NULL DEFAULT 0,
      -- Preenchida sozinha a partir do cadastro: 'cliente.cnpj', 'contato.nome' etc.
      origem      VARCHAR(40) NULL,
      ativo       TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_triagem_pergunta_modelo (modelo_id),
      UNIQUE KEY uk_triagem_pergunta (modelo_id, chave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_cenario (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      modelo_id     INT NOT NULL,
      nome          VARCHAR(160) NOT NULL,
      descricao     VARCHAR(600) NULL,
      -- Condições que identificam o cenário. JSON: [{chave, operador, valor}] — todas precisam bater.
      condicoes     TEXT NULL,
      -- Roteiro mostrado ao atendente. JSON: ["passo 1", "passo 2"]
      passos        TEXT NULL,
      -- Aviso em destaque, para cenários que exigem cuidado.
      alerta        VARCHAR(600) NULL,
      prioridade    VARCHAR(20) NOT NULL DEFAULT 'normal',
      etapa_destino INT NULL,
      checklist_id  INT NULL,
      ordem         INT NOT NULL DEFAULT 0,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_triagem_cenario_modelo (modelo_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_atendimento (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      modelo_id     INT NOT NULL,
      -- O processo criado no Pipeline. Null enquanto a triagem não foi concluída.
      processo_id   INT NULL,
      cliente_id    INT NULL,
      cnpj          VARCHAR(20) NULL,
      cliente_nome  VARCHAR(200) NULL,
      contato       VARCHAR(120) NULL,
      telefone      VARCHAR(30) NULL,
      cenario_id    INT NULL,
      respostas     LONGTEXT NULL,
      situacao      VARCHAR(30) NOT NULL DEFAULT 'rascunho',
      -- Link para o cliente responder sozinho.
      token         VARCHAR(48) NULL,
      token_expira  DATETIME NULL,
      respondido_por VARCHAR(20) NULL,
      atendente_id  INT NULL,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_triagem_token (token),
      INDEX idx_triagem_atend_modelo (modelo_id),
      INDEX idx_triagem_atend_cliente (cliente_id),
      INDEX idx_triagem_atend_processo (processo_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS triagem_resposta_pronta (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      modelo_id        INT NULL,
      categoria        VARCHAR(80) NULL,
      pergunta         VARCHAR(400) NOT NULL,
      resposta_cliente TEXT NULL,
      orientacao       TEXT NULL,
      proxima_acao     VARCHAR(300) NULL,
      setor            VARCHAR(80) NULL,
      fonte            VARCHAR(300) NULL,
      -- Resposta com efeito fiscal só aparece depois de aprovada por quem responde por isso.
      impacto_fiscal   TINYINT(1) NOT NULL DEFAULT 0,
      aprovada         TINYINT(1) NOT NULL DEFAULT 0,
      aprovada_por     INT NULL,
      revisado_em      DATE NULL,
      ativo            TINYINT(1) NOT NULL DEFAULT 1,
      criado_em        DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em    DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_resposta_modelo (modelo_id),
      INDEX idx_resposta_categoria (categoria)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Bancos que já tinham a tabela antes de 'origem' existir.
  const [col] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'triagem_pergunta' AND COLUMN_NAME = 'origem'`)
  if (!Number(col?.total ?? 0)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE triagem_pergunta ADD COLUMN origem VARCHAR(40) NULL`).catch(() => {})
  }
}

/**
 * De onde cada resposta pode vir automaticamente. É uma lista fechada de propósito: o campo
 * `origem` é cadastro, e cadastro não deve conseguir apontar para uma coluna qualquer.
 */
export const ORIGENS: Record<string, { fonte: 'cliente' | 'contato'; coluna: string }> = {
  'cliente.cnpj':          { fonte: 'cliente', coluna: 'CNPJ_CLI' },
  'cliente.razao_social':  { fonte: 'cliente', coluna: 'NOME_CLI' },
  'cliente.nome_fantasia': { fonte: 'cliente', coluna: 'NOME_FANTASIA' },
  'cliente.email':         { fonte: 'cliente', coluna: 'EMAIL_CLI' },
  'cliente.telefone':      { fonte: 'cliente', coluna: 'TELRES_CLI' },
  'contato.nome':          { fonte: 'contato', coluna: 'contato' },
  'contato.telefone':      { fonte: 'contato', coluna: 'telefone' },
}

const json = <T>(v: unknown, padrao: T): T => {
  if (v === null || v === undefined || v === '') return padrao
  try { return JSON.parse(String(v)) as T } catch { return padrao }
}

export interface Condicao {
  chave: string
  /** igual | diferente | contem | preenchido | vazio | maior | menor */
  operador: string
  valor?: string | number
}

/**
 * Avalia uma condição contra as respostas. Resposta ausente nunca satisfaz uma condição
 * positiva: pergunta que depende de outra só aparece quando a outra foi respondida.
 */
export function condicaoAtende(c: Condicao, respostas: Record<string, any>): boolean {
  const bruto = respostas[c.chave]
  const texto = Array.isArray(bruto) ? bruto.join('|') : String(bruto ?? '')
  const vazio = texto.trim() === ''

  switch (c.operador) {
    case 'preenchido': return !vazio
    case 'vazio': return vazio
    case 'diferente': return texto !== String(c.valor ?? '')
    case 'contem': return !vazio && texto.toLowerCase().includes(String(c.valor ?? '').toLowerCase())
    case 'maior': return !vazio && Number(texto) > Number(c.valor ?? 0)
    case 'menor': return !vazio && Number(texto) < Number(c.valor ?? 0)
    case 'igual':
    default: return !vazio && texto === String(c.valor ?? '')
  }
}

export interface PerguntaTriagem {
  id: number
  chave: string
  texto: string
  ajuda: string | null
  tipo: string
  opcoes: string[]
  obrigatoria: boolean
  publico: string
  condicao: Condicao | null
  grupo: string | null
  ordem: number
  /** Quando preenchida pelo cadastro, a chave de ORIGENS que a alimenta. */
  origem: string | null
}

export interface CenarioTriagem {
  id: number
  nome: string
  descricao: string | null
  condicoes: Condicao[]
  passos: string[]
  alerta: string | null
  prioridade: string
  etapaDestino: number | null
  checklistId: number | null
}

export async function carregarModelo(slugOuId: string | number) {
  const [m] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM triagem_modelo WHERE ${typeof slugOuId === 'number' ? 'id' : 'slug'} = ? AND ativo = 1`,
    slugOuId)
  if (!m) return null

  const perguntas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM triagem_pergunta WHERE modelo_id = ? AND ativo = 1 ORDER BY ordem, id`, Number(m.id))
  const cenarios = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM triagem_cenario WHERE modelo_id = ? AND ativo = 1 ORDER BY ordem, id`, Number(m.id))

  return {
    id: Number(m.id),
    nome: m.nome as string,
    slug: m.slug as string,
    descricao: (m.descricao ?? null) as string | null,
    tipoProcesso: m.tipo_processo as string,
    etapaInicial: m.etapa_inicial == null ? null : Number(m.etapa_inicial),
    permiteLink: !!m.permite_link,
    perguntas: perguntas.map((p): PerguntaTriagem => ({
      id: Number(p.id),
      chave: p.chave,
      texto: p.texto,
      ajuda: p.ajuda ?? null,
      tipo: p.tipo,
      opcoes: json<string[]>(p.opcoes, []),
      obrigatoria: !!p.obrigatoria,
      publico: p.publico ?? 'ambos',
      condicao: json<Condicao | null>(p.condicao, null),
      grupo: p.grupo ?? null,
      ordem: Number(p.ordem ?? 0),
      origem: p.origem ?? null,
    })),
    cenarios: cenarios.map((c): CenarioTriagem => ({
      id: Number(c.id),
      nome: c.nome,
      descricao: c.descricao ?? null,
      condicoes: json<Condicao[]>(c.condicoes, []),
      passos: json<string[]>(c.passos, []),
      alerta: c.alerta ?? null,
      prioridade: c.prioridade ?? 'normal',
      etapaDestino: c.etapa_destino == null ? null : Number(c.etapa_destino),
      checklistId: c.checklist_id == null ? null : Number(c.checklist_id),
    })),
  }
}

export type Modelo = NonNullable<Awaited<ReturnType<typeof carregarModelo>>>

/** Perguntas que fazem sentido agora, dadas as respostas já dadas. */
export function perguntasVisiveis(
  modelo: Modelo, respostas: Record<string, any>, paraCliente = false,
): PerguntaTriagem[] {
  return modelo.perguntas.filter((p) => {
    if (paraCliente && p.publico === 'tecnico') return false
    if (!paraCliente && p.publico === 'cliente') return false
    return !p.condicao || condicaoAtende(p.condicao, respostas)
  })
}

/**
 * O primeiro cenário cujas condições todas batem. A ordem do cadastro é a prioridade: cenários
 * mais específicos devem vir antes dos genéricos.
 */
export function identificarCenario(
  modelo: Modelo, respostas: Record<string, any>,
): CenarioTriagem | null {
  for (const c of modelo.cenarios) {
    if (c.condicoes.length === 0) continue
    if (c.condicoes.every((cond) => condicaoAtende(cond, respostas))) return c
  }
  return null
}

/** O que ainda falta responder entre as perguntas visíveis e obrigatórias. */
export function pendencias(
  modelo: Modelo, respostas: Record<string, any>, paraCliente = false,
): PerguntaTriagem[] {
  return perguntasVisiveis(modelo, respostas, paraCliente).filter((p) => {
    if (!p.obrigatoria) return false
    const v = respostas[p.chave]
    if (Array.isArray(v)) return v.length === 0
    return v === undefined || v === null || String(v).trim() === ''
  })
}

export const gerarToken = () => crypto.randomBytes(18).toString('hex')
