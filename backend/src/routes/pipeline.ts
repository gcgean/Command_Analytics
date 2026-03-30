import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initEtapas } from '../utils/etapas'
import { initChecklists } from '../utils/checklists'

type EtapaBase = {
  status: number
  nome: string
  descricao: string
  cor: string
  slaDias: number
}

type ClienteImplantacaoRow = {
  clienteId: number
  clienteNome: string | null
  nomeFantasia: string | null
  cnpj: string | null
  cidade: string | null
  uf: string | null
  celular: string | null
  telefone: string | null
  email: string | null
  statusInstal: number | null
  statusPrimPgto: string | null
  dtPrimeiroPgto: Date | null
  ultimaVenda: Date | null
  dataCadastro: Date | null
  observacoes: string | null
  responsavelId: number | null
  responsavelNome: string | null
  responsavelAtualizadoEm: Date | null
  dtStatus1: Date | null
  dtStatus2: Date | null
  dtStatus3: Date | null
  dtStatus4: Date | null
  dtStatus5: Date | null
  dtStatus6: Date | null
  dtStatus7: Date | null
  dtStatus8: Date | null
  dtStatus9: Date | null
  dtStatus10: Date | null
  dtStatus11: Date | null
  dtStatus12: Date | null
  dtStatus13: Date | null
  dtStatus14: Date | null
  dtStatus15: Date | null
  dtStatus16: Date | null
}

type ChecklistRow = {
  id: number
  nome: string
  descricao: string | null
  itens: string | null
  etapas: string | null
  telas: string | null
  ativo: number | boolean
  ordem: number
}

type MarcacaoRow = {
  cliente_id: number
  checklist_id: number
  item_indice: number
  marcado: number | boolean
}

type ChecklistClienteRow = {
  cliente_id: number
  checklist_id: number
}

type EtapaConfigRow = {
  nome: string
  cor: string
  ordem: number
  telas: string | null
  ativo: number | boolean
}

type StatusMovRow = {
  cliente_id: number
  ultima_data: Date | null
}

type TimelineRow = {
  id: number
  tipo: string
  status_origem: number | null
  status_destino: number | null
  checklist_id: number | null
  item_indice: number | null
  marcado: number | boolean | null
  responsavel_id: number | null
  responsavel_nome: string | null
  observacao: string | null
  usuario_id: number | null
  usuario_nome: string | null
  data_hora: Date
}

type UsuarioAtivoRow = {
  id: number
  nome: string | null
}

const ETAPAS_PADRAO: EtapaBase[] = [
  { status: 1, nome: 'Aguardando Instalação', descricao: 'Cliente aguardando início da implantação', cor: '#3b82f6', slaDias: 2 },
  { status: 2, nome: 'Em Instalação', descricao: 'Processo técnico de instalação em execução', cor: '#2563eb', slaDias: 5 },
  { status: 3, nome: 'Agendar Treinamento', descricao: 'Aguardando agendamento com o cliente', cor: '#4f46e5', slaDias: 3 },
  { status: 4, nome: 'Reagendar Treinamento', descricao: 'Treinamento precisa de nova data', cor: '#7c3aed', slaDias: 4 },
  { status: 5, nome: 'Treinamento Concluído', descricao: 'Treinamentos iniciais finalizados', cor: '#16a34a', slaDias: 2 },
  { status: 6, nome: 'Retorno CS', descricao: 'Acompanhamento do sucesso do cliente', cor: '#0ea5e9', slaDias: 7 },
  { status: 7, nome: 'Concluído', descricao: 'Implantação finalizada', cor: '#10b981', slaDias: 0 },
  { status: 8, nome: 'Teste Demonstração', descricao: 'Cliente em período de validação', cor: '#334155', slaDias: 10 },
  { status: 9, nome: 'Pós-venda', descricao: 'Atuação comercial após implantação', cor: '#65a30d', slaDias: 14 },
  { status: 10, nome: 'Desistência', descricao: 'Processo encerrado por desistência', cor: '#dc2626', slaDias: 0 },
  { status: 11, nome: 'Aguardando Cliente para Instalação', descricao: 'Dependência de retorno/aprovação do cliente', cor: '#0ea5e9', slaDias: 5 },
  { status: 12, nome: 'Aguardando Migração', descricao: 'Preparação para migração de dados', cor: '#64748b', slaDias: 5 },
  { status: 13, nome: 'Primeiro Treinamento', descricao: 'Primeiro ciclo de treinamento em andamento', cor: '#14b8a6', slaDias: 3 },
  { status: 14, nome: 'Segundo Treinamento', descricao: 'Segundo ciclo de treinamento em andamento', cor: '#22c55e', slaDias: 3 },
  { status: 15, nome: 'Em Migração', descricao: 'Migração de dados em execução', cor: '#1d4ed8', slaDias: 7 },
  { status: 16, nome: 'Em Conferência de Migração', descricao: 'Validação da migração com o cliente', cor: '#1f2937', slaDias: 4 },
]

type ChecklistSeed = {
  nome: string
  descricao: string
  etapas: string[]
  itens: string[]
  ordem: number
}

const CHECKLISTS_PADRAO: ChecklistSeed[] = [
  {
    nome: 'Preparação Inicial',
    descricao: 'Itens essenciais antes de iniciar a instalação.',
    etapas: ['1', '11'],
    ordem: 10,
    itens: [
      'Confirmar dados cadastrais e contatos principais',
      'Validar CNPJ e regime tributário',
      'Confirmar plano contratado e módulos inclusos',
      'Coletar acesso remoto e permissões técnicas',
      'Agendar janela de implantação com responsável',
    ],
  },
  {
    nome: 'Execução de Instalação',
    descricao: 'Validações técnicas durante instalação.',
    etapas: ['2', '12', '15', '16'],
    ordem: 20,
    itens: [
      'Validar pré-requisitos de servidor e rede',
      'Instalar aplicação principal e serviços',
      'Configurar base de dados e usuários iniciais',
      'Executar checklist fiscal (NFC-e/NF-e/TEF quando aplicável)',
      'Validar impressoras, balança e periféricos críticos',
      'Registrar evidências técnicas da instalação',
    ],
  },
  {
    nome: 'Treinamentos Operacionais',
    descricao: 'Controle dos treinamentos por etapa.',
    etapas: ['3', '4', '13', '14', '5'],
    ordem: 30,
    itens: [
      'Definir agenda e participantes do treinamento',
      'Aplicar treinamento de operação diária',
      'Aplicar treinamento de retaguarda e financeiro',
      'Registrar dúvidas e plano de reforço',
      'Validar entendimento com checklist final de treinamento',
    ],
  },
  {
    nome: 'Go-live e Sucesso do Cliente',
    descricao: 'Acompanhamento após entrada em produção.',
    etapas: ['6', '8', '9', '7', '10'],
    ordem: 40,
    itens: [
      'Validar primeira venda/faturamento em produção',
      'Confirmar envio de documentos fiscais e integrações',
      'Realizar contato de sucesso em até 7 dias',
      'Registrar pendências e plano de ação pós-venda',
      'Formalizar encerramento da implantação',
    ],
  },
]

let bootstrapPromise: Promise<void> | null = null

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function normalizeStatus(status: number | null | undefined): number {
  const value = Number(status ?? 0)
  if (value === 0) return 1
  return value
}

function diffDays(fromIso: string | null | undefined): number {
  if (!fromIso) return 0
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 86400000))
}

function getDataInicioEtapaByStatus(row: ClienteImplantacaoRow, status: number): Date | null {
  switch (normalizeStatus(status)) {
    case 1: return row.dtStatus1
    case 2: return row.dtStatus2
    case 3: return row.dtStatus3
    case 4: return row.dtStatus4
    case 5: return row.dtStatus5
    case 6: return row.dtStatus6
    case 7: return row.dtStatus7
    case 8: return row.dtStatus8
    case 9: return row.dtStatus9
    case 10: return row.dtStatus10
    case 11: return row.dtStatus11
    case 12: return row.dtStatus12
    case 13: return row.dtStatus13
    case 14: return row.dtStatus14
    case 15: return row.dtStatus15
    case 16: return row.dtStatus16
    default: return null
  }
}

async function ensureImplantacaoBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initEtapas()
      await initChecklists()

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS implantacao_checklist_marcacoes (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          cliente_id   INT NOT NULL,
          checklist_id INT NOT NULL,
          item_indice  INT NOT NULL,
          marcado      TINYINT(1) NOT NULL DEFAULT 0,
          marcado_em   DATETIME NULL,
          marcado_por  INT NULL,
          observacao   VARCHAR(500) NULL,
          UNIQUE KEY uniq_cliente_item (cliente_id, checklist_id, item_indice),
          INDEX idx_implantacao_cliente (cliente_id),
          INDEX idx_implantacao_checklist (checklist_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS implantacao_checklist_cliente (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          cliente_id   INT NOT NULL,
          checklist_id INT NOT NULL,
          criado_em    DATETIME NOT NULL DEFAULT NOW(),
          criado_por   INT NULL,
          UNIQUE KEY uniq_implantacao_cli_checklist (cliente_id, checklist_id),
          INDEX idx_implantacao_cli_checklist_cliente (cliente_id),
          INDEX idx_implantacao_cli_checklist_checklist (checklist_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS implantacao_responsavel (
          cliente_id     INT PRIMARY KEY,
          responsavel_id INT NULL,
          atualizado_em  DATETIME NOT NULL DEFAULT NOW(),
          atualizado_por INT NULL,
          observacao     VARCHAR(500) NULL,
          INDEX idx_implantacao_responsavel (responsavel_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS implantacao_movimentacoes (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          cliente_id    INT NOT NULL,
          tipo          VARCHAR(30) NOT NULL,
          status_origem INT NULL,
          status_destino INT NULL,
          checklist_id  INT NULL,
          item_indice   INT NULL,
          marcado       TINYINT(1) NULL,
          responsavel_id INT NULL,
          observacao    VARCHAR(500) NULL,
          usuario_id    INT NULL,
          data_hora     DATETIME NOT NULL DEFAULT NOW(),
          INDEX idx_implantacao_mov_cliente_data (cliente_id, data_hora),
          INDEX idx_implantacao_mov_tipo (tipo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)

      const etapasExistentes = await prisma.$queryRaw<EtapaConfigRow[]>`
        SELECT nome, cor, ordem, telas, ativo FROM cadastro_etapas
      `
      const temEtapaImplantacao = etapasExistentes.some((e) => parseJsonArray(e.telas).includes('implantacao') && Number(e.ativo) === 1)
      if (!temEtapaImplantacao) {
        for (const etapa of ETAPAS_PADRAO) {
          await prisma.$executeRaw`
            INSERT INTO cadastro_etapas (nome, cor, telas, ativo, ordem, criado_em, atualizado_em)
            VALUES (${etapa.nome}, ${etapa.cor}, ${JSON.stringify(['implantacao'])}, 1, ${etapa.status}, NOW(), NOW())
          `
        }
      }

      const checklistsExistentes = await prisma.$queryRaw<ChecklistRow[]>`
        SELECT id, nome, descricao, itens, etapas, telas, ativo, ordem FROM cadastro_checklists
      `
      const nomesImplantacao = new Set(
        checklistsExistentes
          .filter((c) => parseJsonArray(c.telas).includes('implantacao'))
          .map((c) => c.nome.toLowerCase().trim())
      )

      for (const checklist of CHECKLISTS_PADRAO) {
        if (nomesImplantacao.has(checklist.nome.toLowerCase().trim())) continue
        await prisma.$executeRaw`
          INSERT INTO cadastro_checklists (nome, descricao, itens, etapas, telas, ativo, ordem, criado_em, atualizado_em)
          VALUES (
            ${checklist.nome},
            ${checklist.descricao},
            ${JSON.stringify(checklist.itens)},
            ${JSON.stringify(checklist.etapas)},
            ${JSON.stringify(['implantacao'])},
            1,
            ${checklist.ordem},
            NOW(),
            NOW()
          )
        `
      }
    })().catch((err) => {
      bootstrapPromise = null
      throw err
    })
  }
  await bootstrapPromise
}

async function registrarMovimentacao(args: {
  clienteId: number
  tipo: 'status' | 'checklist' | 'responsavel' | 'observacao'
  statusOrigem?: number | null
  statusDestino?: number | null
  checklistId?: number | null
  itemIndice?: number | null
  marcado?: boolean | null
  responsavelId?: number | null
  observacao?: string | null
  usuarioId?: number | null
}) {
  await prisma.$executeRaw`
    INSERT INTO implantacao_movimentacoes
      (cliente_id, tipo, status_origem, status_destino, checklist_id, item_indice, marcado, responsavel_id, observacao, usuario_id, data_hora)
    VALUES
      (
        ${args.clienteId},
        ${args.tipo},
        ${args.statusOrigem ?? null},
        ${args.statusDestino ?? null},
        ${args.checklistId ?? null},
        ${args.itemIndice ?? null},
        ${args.marcado === null || args.marcado === undefined ? null : args.marcado ? 1 : 0},
        ${args.responsavelId ?? null},
        ${args.observacao ?? null},
        ${args.usuarioId ?? null},
        NOW()
      )
  `
}

async function getEtapasConfiguradas() {
  await ensureImplantacaoBootstrap()
  const rows = await prisma.$queryRaw<EtapaConfigRow[]>`
    SELECT nome, cor, ordem, telas, ativo
    FROM cadastro_etapas
    WHERE ativo = 1
    ORDER BY ordem ASC
  `
  const mapByOrdem = new Map<number, { nome: string; cor: string }>()
  rows
    .filter((r) => parseJsonArray(r.telas).includes('implantacao'))
    .forEach((r) => mapByOrdem.set(Number(r.ordem), { nome: r.nome, cor: r.cor || '#3b82f6' }))

  return ETAPAS_PADRAO.map((base) => {
    const override = mapByOrdem.get(base.status)
    return {
      status: base.status,
      nome: override?.nome || base.nome,
      descricao: base.descricao,
      cor: override?.cor || base.cor,
      slaDias: base.slaDias,
    }
  })
}

async function getChecklistsImplantacaoAtivos() {
  await ensureImplantacaoBootstrap()
  const rows = await prisma.$queryRaw<ChecklistRow[]>`
    SELECT id, nome, descricao, itens, etapas, telas, ativo, ordem
    FROM cadastro_checklists
    WHERE ativo = 1
    ORDER BY ordem ASC, nome ASC
  `
  return rows
    .map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      descricao: row.descricao ?? '',
      ordem: Number(row.ordem ?? 0),
      itens: parseJsonArray(row.itens),
      etapas: parseJsonArray(row.etapas),
      telas: parseJsonArray(row.telas),
    }))
    .filter((c) => c.telas.includes('implantacao'))
}

async function carregarClientesImplantacao() {
  await ensureImplantacaoBootstrap()
  const rows = await prisma.$queryRaw<ClienteImplantacaoRow[]>`
    SELECT
      C.cod_cli AS clienteId,
      C.NOME_CLI AS clienteNome,
      C.NOME_FANTASIA AS nomeFantasia,
      C.CNPJ_CLI AS cnpj,
      C.CIDRES_CLI AS cidade,
      C.ESTRES_CLI AS uf,
      C.CELULAR_CLI AS celular,
      C.TELRES_CLI AS telefone,
      C.EMAIL_CLI AS email,
      COALESCE(C.STATUS_INSTAL, 0) AS statusInstal,
      C.STATUS_PRIM_PGTO AS statusPrimPgto,
      C.dt_primeiro_pgto AS dtPrimeiroPgto,
      (
        SELECT D.DATA_HORA_ULT_VENDA
        FROM dados_gerais_clientes D
        WHERE D.COD_CLI = C.cod_cli
        ORDER BY D.DATA_HORA_ULT_VENDA DESC
        LIMIT 1
      ) AS ultimaVenda,
      C.DATACADASTRO_CLI AS dataCadastro,
      PI.obs_treinamento AS observacoes,
      IR.responsavel_id AS responsavelId,
      COALESCE(UR.NOME_USUARIO_COMPLETO, UR.NOME_USU) AS responsavelNome,
      IR.atualizado_em AS responsavelAtualizadoEm,
      C.DT_Aguard_instalacao AS dtStatus1,
      C.DT_em_instalacao AS dtStatus2,
      C.DT_agendar_treinamento AS dtStatus3,
      C.Dt_reagendar_Treinamento AS dtStatus4,
      C.Dt_treinamento_concluido AS dtStatus5,
      C.Dt_retorno_cs AS dtStatus6,
      C.Dt_concluido AS dtStatus7,
      C.DT_Teste_demo AS dtStatus8,
      C.Dt_pos_venda AS dtStatus9,
      C.Dt_desistencia AS dtStatus10,
      C.DT_Aguardandocliente_p_instal AS dtStatus11,
      C.DT_aguardando_migracao AS dtStatus12,
      C.DT_prim_treinamento AS dtStatus13,
      C.Dt_Seg_treinamento AS dtStatus14,
      C.Dt_em_migracao AS dtStatus15,
      C.Dt_em_conf_migracao AS dtStatus16
    FROM cliente C
    LEFT JOIN processo_implantacao PI ON PI.id_cli = C.cod_cli
    LEFT JOIN implantacao_responsavel IR ON IR.cliente_id = C.cod_cli
    LEFT JOIN usuario UR ON UR.COD_USU = IR.responsavel_id
    WHERE C.ATIVO = 'S'
      AND C.cod_cli NOT IN (0, 1, 6, 7, 8)
      AND C.cod_cli < 10000000
      AND C.cod_cla <> 30
    ORDER BY C.cod_cli DESC
  `

  return rows.map((row) => {
    const nomeCompleto = String(row.clienteNome || '').trim()
    const fantasia = String(row.nomeFantasia || '').trim()
    const statusAtual = normalizeStatus(Number(row.statusInstal ?? 0))
    const dataInicioStatusAtual = getDataInicioEtapaByStatus(row, statusAtual)
    return {
      clienteId: Number(row.clienteId),
      clienteNome: nomeCompleto || fantasia || `Cliente #${row.clienteId}`,
      nomeFantasia: fantasia || null,
      cnpj: row.cnpj || null,
      cidade: row.cidade || null,
      uf: row.uf || null,
      celular: row.celular || null,
      telefone: row.telefone || null,
      email: row.email || null,
      statusInstal: statusAtual,
      statusPrimeiroPgto: row.statusPrimPgto || null,
      dataPrimeiroPgto: row.dtPrimeiroPgto ? row.dtPrimeiroPgto.toISOString() : null,
      dataUltimaVenda: row.ultimaVenda ? row.ultimaVenda.toISOString() : null,
      dataCadastro: row.dataCadastro ? row.dataCadastro.toISOString() : null,
      dataInicioStatusAtual: dataInicioStatusAtual ? dataInicioStatusAtual.toISOString() : null,
      observacoes: row.observacoes || null,
      responsavelId: row.responsavelId ? Number(row.responsavelId) : null,
      responsavelNome: row.responsavelNome || null,
      responsavelAtualizadoEm: row.responsavelAtualizadoEm ? row.responsavelAtualizadoEm.toISOString() : null,
    }
  })
}

function filtrarChecklistsPorStatus(
  checklists: Array<{ id: number; nome: string; descricao: string; ordem: number; itens: string[]; etapas: string[] }>,
  statusInstal: number
) {
  const key = String(statusInstal)
  return checklists.filter((c) => c.etapas.length === 0 || c.etapas.includes(key))
}

function resolverChecklistsDoCliente(
  checklists: Array<{ id: number; nome: string; descricao: string; ordem: number; itens: string[]; etapas: string[] }>,
  statusInstal: number,
  checklistIdsCliente?: Set<number>
) {
  if (checklistIdsCliente && checklistIdsCliente.size > 0) {
    return checklists.filter((c) => checklistIdsCliente.has(c.id))
  }
  return filtrarChecklistsPorStatus(checklists, statusInstal)
}

async function carregarTimelineCliente(clienteId: number) {
  const rows = await prisma.$queryRaw<TimelineRow[]>`
    SELECT
      M.id,
      M.tipo,
      M.status_origem,
      M.status_destino,
      M.checklist_id,
      M.item_indice,
      M.marcado,
      M.responsavel_id,
      COALESCE(RU.NOME_USUARIO_COMPLETO, RU.NOME_USU) AS responsavel_nome,
      M.observacao,
      M.usuario_id,
      COALESCE(U.NOME_USUARIO_COMPLETO, U.NOME_USU) AS usuario_nome,
      M.data_hora
    FROM implantacao_movimentacoes M
    LEFT JOIN usuario U ON U.COD_USU = M.usuario_id
    LEFT JOIN usuario RU ON RU.COD_USU = M.responsavel_id
    WHERE M.cliente_id = ${clienteId}
    ORDER BY M.data_hora DESC
    LIMIT 120
  `

  return rows.map((r) => ({
    id: Number(r.id),
    tipo: r.tipo,
    statusOrigem: r.status_origem === null ? null : Number(r.status_origem),
    statusDestino: r.status_destino === null ? null : Number(r.status_destino),
    checklistId: r.checklist_id === null ? null : Number(r.checklist_id),
    itemIndice: r.item_indice === null ? null : Number(r.item_indice),
    marcado: r.marcado === null ? null : Number(r.marcado) === 1,
    responsavelId: r.responsavel_id === null ? null : Number(r.responsavel_id),
    responsavelNome: r.responsavel_nome || null,
    observacao: r.observacao || null,
    usuarioId: r.usuario_id === null ? null : Number(r.usuario_id),
    usuarioNome: r.usuario_nome || null,
    dataHora: r.data_hora instanceof Date ? r.data_hora.toISOString() : String(r.data_hora),
  }))
}

async function carregarResponsaveisAtivos() {
  const rows = await prisma.$queryRaw<UsuarioAtivoRow[]>`
    SELECT COD_USU AS id, COALESCE(NOME_USUARIO_COMPLETO, NOME_USU) AS nome
    FROM usuario
    WHERE ATIVO = 'S'
    ORDER BY nome
  `
  return rows.map((r) => ({ id: Number(r.id), nome: r.nome || `Usuário #${r.id}` }))
}

export async function pipelineRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Pipeline'] } }, async () => {
    const clientes = await carregarClientesImplantacao()
    return clientes.map((c) => ({
      id: c.clienteId,
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      etapa: c.statusInstal,
      etapaDescricao: ETAPAS_PADRAO.find((e) => e.status === c.statusInstal)?.nome ?? `Etapa ${c.statusInstal}`,
      observacoes: c.observacoes ?? '',
    }))
  })

  app.get('/implantacao/painel', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Painel operacional completo da implantação' } }, async (request) => {
    const { search, status } = request.query as { search?: string; status?: string }
    const [etapas, checklists, clientes] = await Promise.all([
      getEtapasConfiguradas(),
      getChecklistsImplantacaoAtivos(),
      carregarClientesImplantacao(),
    ])

    const filtered = clientes.filter((cliente) => {
      const busca = String(search ?? '').trim().toLowerCase()
      if (busca) {
        const haystack = `${cliente.clienteNome} ${cliente.nomeFantasia ?? ''} ${cliente.cnpj ?? ''}`.toLowerCase()
        if (!haystack.includes(busca)) return false
      }
      if (status && status !== 'all') {
        const stage = Number(status)
        if (!Number.isFinite(stage)) return true
        return cliente.statusInstal === stage
      }
      return true
    })

    const checklistIds = checklists.map((c) => c.id)
    const clienteIds = filtered.map((c) => c.clienteId)
    const checklistClienteRows = clienteIds.length
      ? await prisma.$queryRawUnsafe<ChecklistClienteRow[]>(
        `SELECT cliente_id, checklist_id
         FROM implantacao_checklist_cliente
         WHERE cliente_id IN (${clienteIds.map(() => '?').join(',')})`,
        ...clienteIds
      )
      : []
    const checklistsClienteMap = new Map<number, Set<number>>()
    checklistClienteRows.forEach((row) => {
      const clienteId = Number(row.cliente_id)
      const checklistId = Number(row.checklist_id)
      if (!checklistsClienteMap.has(clienteId)) checklistsClienteMap.set(clienteId, new Set())
      checklistsClienteMap.get(clienteId)!.add(checklistId)
    })
    let marcacoes: MarcacaoRow[] = []
    if (checklistIds.length && clienteIds.length) {
      marcacoes = await prisma.$queryRawUnsafe<MarcacaoRow[]>(
        `SELECT cliente_id, checklist_id, item_indice, marcado
         FROM implantacao_checklist_marcacoes
         WHERE checklist_id IN (${checklistIds.map(() => '?').join(',')})
           AND cliente_id IN (${clienteIds.map(() => '?').join(',')})`,
        ...checklistIds,
        ...clienteIds
      )
    }
    const marcadasSet = new Set(
      marcacoes
        .filter((m) => Number(m.marcado) === 1)
        .map((m) => `${Number(m.cliente_id)}:${Number(m.checklist_id)}:${Number(m.item_indice)}`)
    )

    const ultimasMudancas = clienteIds.length
      ? await prisma.$queryRawUnsafe<StatusMovRow[]>(
        `SELECT cliente_id, MAX(data_hora) AS ultima_data
         FROM implantacao_movimentacoes
         WHERE tipo = 'status' AND cliente_id IN (${clienteIds.map(() => '?').join(',')})
         GROUP BY cliente_id`,
        ...clienteIds
      )
      : []
    const stageStartMap = new Map<number, string>()
    ultimasMudancas.forEach((m) => {
      if (m.ultima_data instanceof Date) stageStartMap.set(Number(m.cliente_id), m.ultima_data.toISOString())
    })

    const clientesComProgresso = filtered.map((cliente) => {
      const checklistsDaEtapa = resolverChecklistsDoCliente(
        checklists,
        cliente.statusInstal,
        checklistsClienteMap.get(cliente.clienteId)
      )
      let totalItens = 0
      let itensMarcados = 0

      for (const checklist of checklistsDaEtapa) {
        checklist.itens.forEach((_, itemIndex) => {
          totalItens += 1
          if (marcadasSet.has(`${cliente.clienteId}:${checklist.id}:${itemIndex}`)) itensMarcados += 1
        })
      }

      const progresso = totalItens > 0 ? Math.round((itensMarcados / totalItens) * 100) : 0
      const etapaInfo = etapas.find((e) => e.status === cliente.statusInstal)
      const slaDias = Number(etapaInfo?.slaDias ?? 0)
      const dataBase = stageStartMap.get(cliente.clienteId) ?? cliente.dataInicioStatusAtual ?? cliente.dataCadastro ?? null
      const diasNaEtapa = diffDays(dataBase)
      const emAtraso = slaDias > 0 && diasNaEtapa > slaDias

      return {
        ...cliente,
        totalItensChecklist: totalItens,
        itensChecklistMarcados: itensMarcados,
        progressoChecklist: progresso,
        slaDiasEtapa: slaDias,
        diasNaEtapa,
        emAtraso,
      }
    })

    const contagem = new Map<number, number>()
    etapas.forEach((e) => contagem.set(e.status, 0))
    clientes.forEach((c) => contagem.set(c.statusInstal, (contagem.get(c.statusInstal) || 0) + 1))
    const etapasComCount = etapas.map((e) => ({ ...e, quantidade: contagem.get(e.status) || 0 }))

    const kpis = {
      totalClientes: clientes.length,
      emProcesso: clientes.filter((c) => ![7, 10].includes(c.statusInstal)).length,
      concluidos: clientes.filter((c) => c.statusInstal === 7).length,
      desistencias: clientes.filter((c) => c.statusInstal === 10).length,
      aguardandoInicio: clientes.filter((c) => c.statusInstal === 1).length,
      atrasados: clientesComProgresso.filter((c) => c.emAtraso).length,
    }

    return {
      etapas: etapasComCount,
      kpis,
      clientes: clientesComProgresso,
    }
  })

  app.get('/implantacao/:clienteId/checklist', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Checklist aplicável ao cliente na etapa atual + camada executiva' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const { status } = request.query as { status?: string }
    const id = Number(clienteId)
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })

    const clientes = await carregarClientesImplantacao()
    const cliente = clientes.find((c) => c.clienteId === id)
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })

    const [etapas, checklists, timeline, responsaveis] = await Promise.all([
      getEtapasConfiguradas(),
      getChecklistsImplantacaoAtivos(),
      carregarTimelineCliente(id),
      carregarResponsaveisAtivos(),
    ])

    const statusSelecionado = Number(status)
    const etapaStatus = Number.isFinite(statusSelecionado) && statusSelecionado >= 1 && statusSelecionado <= 16
      ? statusSelecionado
      : cliente.statusInstal
    const etapaAtual = etapas.find((e) => e.status === etapaStatus) || etapas[0]
    const checklistClienteRows = await prisma.$queryRaw<ChecklistClienteRow[]>`
      SELECT cliente_id, checklist_id
      FROM implantacao_checklist_cliente
      WHERE cliente_id = ${id}
    `
    const checklistIdsCliente = new Set(checklistClienteRows.map((r) => Number(r.checklist_id)))
    const checklistsDaEtapa = resolverChecklistsDoCliente(checklists, etapaStatus, checklistIdsCliente)

    const marcacoes = checklistsDaEtapa.length
      ? await prisma.$queryRawUnsafe<MarcacaoRow[]>(
        `SELECT cliente_id, checklist_id, item_indice, marcado
         FROM implantacao_checklist_marcacoes
         WHERE cliente_id = ?
           AND checklist_id IN (${checklistsDaEtapa.map(() => '?').join(',')})`,
        id,
        ...checklistsDaEtapa.map((c) => c.id)
      )
      : []
    const marcadoSet = new Set(
      marcacoes
        .filter((m) => Number(m.marcado) === 1)
        .map((m) => `${Number(m.checklist_id)}:${Number(m.item_indice)}`)
    )

    const data = checklistsDaEtapa.map((checklist) => ({
      id: checklist.id,
      nome: checklist.nome,
      descricao: checklist.descricao,
      itens: checklist.itens.map((texto, index) => ({
        index,
        texto,
        marcado: marcadoSet.has(`${checklist.id}:${index}`),
      })),
    }))

    const totalItens = data.reduce((acc, c) => acc + c.itens.length, 0)
    const itensMarcados = data.reduce((acc, c) => acc + c.itens.filter((i) => i.marcado).length, 0)
    const progresso = totalItens > 0 ? Math.round((itensMarcados / totalItens) * 100) : 0
    const ultimaMudancaStatus = timeline.find((t) => t.tipo === 'status')?.dataHora ?? cliente.dataInicioStatusAtual ?? cliente.dataCadastro
    const diasNaEtapa = diffDays(ultimaMudancaStatus ?? null)
    const slaDiasEtapa = Number(etapaAtual?.slaDias ?? 0)
    const emAtraso = slaDiasEtapa > 0 && diasNaEtapa > slaDiasEtapa

    return {
      cliente: {
        ...cliente,
        statusInstal: etapaStatus,
        totalItensChecklist: totalItens,
        itensChecklistMarcados: itensMarcados,
        progressoChecklist: progresso,
        slaDiasEtapa,
        diasNaEtapa,
        emAtraso,
      },
      etapaAtual,
      etapas,
      resumo: { totalItens, itensMarcados, progresso },
      checklists: data,
      responsaveis,
      timeline,
    }
  })

  app.patch('/implantacao/:clienteId/status', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Atualiza etapa/status de implantação do cliente' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { status, observacao } = request.body as { status: number; observacao?: string }
    const novoStatus = Number(status)
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (!Number.isFinite(novoStatus) || novoStatus < 1 || novoStatus > 16) {
      return reply.status(400).send({ error: 'Status inválido. Informe um valor entre 1 e 16.' })
    }

    await ensureImplantacaoBootstrap()
    const currentStatusRows = await prisma.$queryRaw<{ status: number | null }[]>`SELECT COALESCE(STATUS_INSTAL, 0) AS status FROM cliente WHERE cod_cli = ${id} LIMIT 1`
    const statusOrigem = normalizeStatus(Number(currentStatusRows[0]?.status ?? 0))

    await prisma.$executeRaw`UPDATE cliente SET STATUS_INSTAL = ${novoStatus} WHERE cod_cli = ${id}`
    const existing = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM processo_implantacao WHERE id_cli = ${id} ORDER BY id DESC LIMIT 1`
    const obs = String(observacao ?? '').trim()
    if (existing.length) {
      await prisma.$executeRaw`
        UPDATE processo_implantacao
        SET status = ${novoStatus}, obs_treinamento = ${obs || null}
        WHERE id = ${Number(existing[0].id)}
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO processo_implantacao (id_cli, status, obs_treinamento)
        VALUES (${id}, ${novoStatus}, ${obs || null})
      `
    }

    await registrarMovimentacao({
      clienteId: id,
      tipo: 'status',
      statusOrigem,
      statusDestino: novoStatus,
      observacao: obs || null,
      usuarioId,
    })

    return { ok: true }
  })

  app.patch('/implantacao/:clienteId/responsavel', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Define responsável atual da implantação' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { responsavelId, observacao } = request.body as { responsavelId?: number | null; observacao?: string }
    const novoResponsavelId = responsavelId === null || responsavelId === undefined ? null : Number(responsavelId)
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (novoResponsavelId !== null && (!Number.isFinite(novoResponsavelId) || novoResponsavelId <= 0)) {
      return reply.status(400).send({ error: 'Responsável inválido.' })
    }

    await ensureImplantacaoBootstrap()

    await prisma.$executeRaw`
      INSERT INTO implantacao_responsavel (cliente_id, responsavel_id, atualizado_em, atualizado_por, observacao)
      VALUES (${id}, ${novoResponsavelId}, NOW(), ${usuarioId}, ${String(observacao ?? '').trim() || null})
      ON DUPLICATE KEY UPDATE
        responsavel_id = VALUES(responsavel_id),
        atualizado_em = NOW(),
        atualizado_por = VALUES(atualizado_por),
        observacao = VALUES(observacao)
    `

    await registrarMovimentacao({
      clienteId: id,
      tipo: 'responsavel',
      responsavelId: novoResponsavelId,
      observacao: String(observacao ?? '').trim() || null,
      usuarioId,
    })

    return { ok: true }
  })

  app.patch('/implantacao/:clienteId/checklist', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Marca/desmarca item do checklist da implantação' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { checklistId, itemIndex, marcado, observacao } = request.body as {
      checklistId: number
      itemIndex: number
      marcado: boolean
      observacao?: string
    }
    const checklist = Number(checklistId)
    const item = Number(itemIndex)
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (!Number.isFinite(checklist) || checklist <= 0) return reply.status(400).send({ error: 'Checklist inválido.' })
    if (!Number.isFinite(item) || item < 0) return reply.status(400).send({ error: 'Item inválido.' })

    await ensureImplantacaoBootstrap()

    await prisma.$executeRaw`
      INSERT INTO implantacao_checklist_marcacoes
        (cliente_id, checklist_id, item_indice, marcado, marcado_em, marcado_por, observacao)
      VALUES
        (${id}, ${checklist}, ${item}, ${marcado ? 1 : 0}, ${marcado ? new Date() : null}, ${usuarioId}, ${String(observacao ?? '').trim() || null})
      ON DUPLICATE KEY UPDATE
        marcado = VALUES(marcado),
        marcado_em = VALUES(marcado_em),
        marcado_por = VALUES(marcado_por),
        observacao = VALUES(observacao)
    `

    await registrarMovimentacao({
      clienteId: id,
      tipo: 'checklist',
      checklistId: checklist,
      itemIndice: item,
      marcado: !!marcado,
      observacao: String(observacao ?? '').trim() || null,
      usuarioId,
    })

    return { ok: true }
  })

  app.patch('/implantacao/:clienteId/transicao', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Transição de etapa com checklist e log completo' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { statusDestino, observacao, checklist } = request.body as {
      statusDestino: number
      observacao?: string
      checklist?: Array<{ checklistId: number; itemIndex: number; marcado: boolean; observacao?: string }>
    }
    const destino = Number(statusDestino)
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (!Number.isFinite(destino) || destino < 1 || destino > 16) {
      return reply.status(400).send({ error: 'Etapa de destino inválida.' })
    }

    await ensureImplantacaoBootstrap()
    const statusRows = await prisma.$queryRaw<{ status: number | null }[]>`SELECT COALESCE(STATUS_INSTAL, 0) AS status FROM cliente WHERE cod_cli = ${id} LIMIT 1`
    const origem = normalizeStatus(Number(statusRows[0]?.status ?? 0))

    for (const item of checklist ?? []) {
      const checklistId = Number(item.checklistId)
      const itemIndex = Number(item.itemIndex)
      if (!Number.isFinite(checklistId) || checklistId <= 0) continue
      if (!Number.isFinite(itemIndex) || itemIndex < 0) continue

      await prisma.$executeRaw`
        INSERT INTO implantacao_checklist_marcacoes
          (cliente_id, checklist_id, item_indice, marcado, marcado_em, marcado_por, observacao)
        VALUES
          (${id}, ${checklistId}, ${itemIndex}, ${item.marcado ? 1 : 0}, ${item.marcado ? new Date() : null}, ${usuarioId}, ${String(item.observacao ?? '').trim() || null})
        ON DUPLICATE KEY UPDATE
          marcado = VALUES(marcado),
          marcado_em = VALUES(marcado_em),
          marcado_por = VALUES(marcado_por),
          observacao = VALUES(observacao)
      `

      await registrarMovimentacao({
        clienteId: id,
        tipo: 'checklist',
        checklistId,
        itemIndice: itemIndex,
        marcado: !!item.marcado,
        observacao: String(item.observacao ?? '').trim() || null,
        usuarioId,
      })
    }

    await prisma.$executeRaw`UPDATE cliente SET STATUS_INSTAL = ${destino} WHERE cod_cli = ${id}`
    const processo = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM processo_implantacao WHERE id_cli = ${id} ORDER BY id DESC LIMIT 1`
    const obs = String(observacao ?? '').trim()
    if (processo.length) {
      await prisma.$executeRaw`
        UPDATE processo_implantacao
        SET status = ${destino}, obs_treinamento = ${obs || null}
        WHERE id = ${Number(processo[0].id)}
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO processo_implantacao (id_cli, status, obs_treinamento)
        VALUES (${id}, ${destino}, ${obs || null})
      `
    }

    await registrarMovimentacao({
      clienteId: id,
      tipo: 'status',
      statusOrigem: origem,
      statusDestino: destino,
      observacao: obs || null,
      usuarioId,
    })

    return { ok: true }
  })

  app.post('/implantacao/:clienteId/observacao', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Registra observação no histórico da implantação do cliente' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { observacao } = request.body as { observacao?: string }
    const texto = String(observacao ?? '').trim()
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (!texto) return reply.status(400).send({ error: 'Informe a observação.' })

    await ensureImplantacaoBootstrap()

    const statusRows = await prisma.$queryRaw<{ status: number | null }[]>`
      SELECT COALESCE(STATUS_INSTAL, 0) AS status
      FROM cliente
      WHERE cod_cli = ${id}
      LIMIT 1
    `
    if (!statusRows.length) return reply.status(404).send({ error: 'Cliente não encontrado.' })
    const statusAtual = normalizeStatus(Number(statusRows[0]?.status ?? 0))

    const processo = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id
      FROM processo_implantacao
      WHERE id_cli = ${id}
      ORDER BY id DESC
      LIMIT 1
    `
    if (processo.length) {
      await prisma.$executeRaw`
        UPDATE processo_implantacao
        SET status = ${statusAtual}, obs_treinamento = ${texto}
        WHERE id = ${Number(processo[0].id)}
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO processo_implantacao (id_cli, status, obs_treinamento)
        VALUES (${id}, ${statusAtual}, ${texto})
      `
    }

    await registrarMovimentacao({
      clienteId: id,
      tipo: 'observacao',
      statusDestino: statusAtual,
      observacao: texto,
      usuarioId,
    })

    return { ok: true }
  })

  app.get('/implantacao/:clienteId/configuracao', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Configuração da implantação por cliente (etapa, responsável e checklists)' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })

    const [clientes, etapas, checklists, responsaveis, checklistRows] = await Promise.all([
      carregarClientesImplantacao(),
      getEtapasConfiguradas(),
      getChecklistsImplantacaoAtivos(),
      carregarResponsaveisAtivos(),
      prisma.$queryRaw<ChecklistClienteRow[]>`
        SELECT cliente_id, checklist_id
        FROM implantacao_checklist_cliente
        WHERE cliente_id = ${id}
      `,
    ])

    const cliente = clientes.find((c) => c.clienteId === id)
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })

    const checklistIdsSelecionados = checklistRows.map((row) => Number(row.checklist_id))

    return {
      cliente,
      etapas,
      responsaveis,
      checklists: checklists.map((c) => ({
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        ordem: c.ordem,
        etapas: c.etapas,
        itensQuantidade: c.itens.length,
      })),
      checklistIdsSelecionados,
    }
  })

  app.put('/implantacao/:clienteId/configuracao', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Atualiza configuração da implantação por cliente' } }, async (request, reply) => {
    const { clienteId } = request.params as { clienteId: string }
    const id = Number(clienteId)
    const { statusInstal, responsavelId, checklistIds, observacao } = request.body as {
      statusInstal?: number
      responsavelId?: number | null
      checklistIds?: number[]
      observacao?: string
    }
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })

    await ensureImplantacaoBootstrap()
    const clientes = await carregarClientesImplantacao()
    const cliente = clientes.find((c) => c.clienteId === id)
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })

    const obs = String(observacao ?? '').trim() || null

    const novoStatus = statusInstal === undefined ? undefined : Number(statusInstal)
    if (novoStatus !== undefined && (!Number.isFinite(novoStatus) || novoStatus < 1 || novoStatus > 16)) {
      return reply.status(400).send({ error: 'Etapa inválida.' })
    }

    const novoResponsavelId = responsavelId === undefined
      ? undefined
      : (responsavelId === null ? null : Number(responsavelId))
    if (novoResponsavelId !== undefined && novoResponsavelId !== null && (!Number.isFinite(novoResponsavelId) || novoResponsavelId <= 0)) {
      return reply.status(400).send({ error: 'Responsável inválido.' })
    }

    const idsChecklist = Array.from(new Set((checklistIds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)))

    if (novoStatus !== undefined && novoStatus !== cliente.statusInstal) {
      await prisma.$executeRaw`UPDATE cliente SET STATUS_INSTAL = ${novoStatus} WHERE cod_cli = ${id}`
      const processo = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM processo_implantacao WHERE id_cli = ${id} ORDER BY id DESC LIMIT 1`
      if (processo.length) {
        await prisma.$executeRaw`
          UPDATE processo_implantacao
          SET status = ${novoStatus}, obs_treinamento = ${obs}
          WHERE id = ${Number(processo[0].id)}
        `
      } else {
        await prisma.$executeRaw`
          INSERT INTO processo_implantacao (id_cli, status, obs_treinamento)
          VALUES (${id}, ${novoStatus}, ${obs})
        `
      }
      await registrarMovimentacao({
        clienteId: id,
        tipo: 'status',
        statusOrigem: cliente.statusInstal,
        statusDestino: novoStatus,
        observacao: obs,
        usuarioId,
      })
    }

    if (novoResponsavelId !== undefined) {
      const responsavelAtual = cliente.responsavelId ?? null
      await prisma.$executeRaw`
        INSERT INTO implantacao_responsavel (cliente_id, responsavel_id, atualizado_em, atualizado_por, observacao)
        VALUES (${id}, ${novoResponsavelId}, NOW(), ${usuarioId}, ${obs})
        ON DUPLICATE KEY UPDATE
          responsavel_id = VALUES(responsavel_id),
          atualizado_em = NOW(),
          atualizado_por = VALUES(atualizado_por),
          observacao = VALUES(observacao)
      `
      if (responsavelAtual !== novoResponsavelId) {
        await registrarMovimentacao({
          clienteId: id,
          tipo: 'responsavel',
          responsavelId: novoResponsavelId,
          observacao: obs,
          usuarioId,
        })
      }
    }

    if (checklistIds !== undefined) {
      const existentes = await prisma.$queryRaw<ChecklistClienteRow[]>`
        SELECT cliente_id, checklist_id
        FROM implantacao_checklist_cliente
        WHERE cliente_id = ${id}
      `
      const atuaisSet = new Set(existentes.map((row) => Number(row.checklist_id)))
      const novosSet = new Set(idsChecklist)

      await prisma.$executeRaw`DELETE FROM implantacao_checklist_cliente WHERE cliente_id = ${id}`

      for (const checklistId of idsChecklist) {
        await prisma.$executeRaw`
          INSERT INTO implantacao_checklist_cliente (cliente_id, checklist_id, criado_em, criado_por)
          VALUES (${id}, ${checklistId}, NOW(), ${usuarioId})
        `
      }

      for (const checklistId of idsChecklist) {
        if (!atuaisSet.has(checklistId)) {
          await registrarMovimentacao({
            clienteId: id,
            tipo: 'checklist',
            checklistId,
            marcado: true,
            observacao: 'Checklist vinculado ao cliente',
            usuarioId,
          })
        }
      }
      for (const checklistId of atuaisSet) {
        if (!novosSet.has(checklistId)) {
          await registrarMovimentacao({
            clienteId: id,
            tipo: 'checklist',
            checklistId,
            marcado: false,
            observacao: 'Checklist desvinculado do cliente',
            usuarioId,
          })
        }
      }
    }

    return { ok: true }
  })

  app.get('/resumo/etapas', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Resumo legado por etapa' } }, async () => {
    const painel = await getEtapasConfiguradas()
    const clientes = await carregarClientesImplantacao()
    const contagem = new Map<number, number>()
    painel.forEach((e) => contagem.set(e.status, 0))
    clientes.forEach((c) => contagem.set(c.statusInstal, (contagem.get(c.statusInstal) || 0) + 1))
    return painel.map((etapa) => ({
      etapa: etapa.status,
      etapaDescricao: etapa.nome,
      count: contagem.get(etapa.status) || 0,
    }))
  })

  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Consultar item legado de pipeline por id' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const item = await prisma.pipelineItem.findUnique({
      where: { id: Number(id) },
      include: { cliente: { select: { id: true, nome: true } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item de pipeline não encontrado.' })
    return {
      id: item.id,
      clienteId: item.clienteId,
      clienteNome: item.cliente?.nome ?? '',
      etapa: Number(item.etapa ?? 1),
      observacoes: item.observacoes ?? '',
    }
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Criar item legado de pipeline' } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const item = await prisma.pipelineItem.create({
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send({
      id: item.id,
      clienteId: item.clienteId,
      clienteNome: item.cliente?.nome ?? '',
      etapa: Number(item.etapa ?? 1),
      observacoes: item.observacoes ?? '',
    })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Atualizar item legado de pipeline' } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const item = await prisma.pipelineItem.update({
      where: { id: Number(id) },
      data: body as never,
      include: { cliente: { select: { id: true, nome: true } } },
    })
    return {
      id: item.id,
      clienteId: item.clienteId,
      clienteNome: item.cliente?.nome ?? '',
      etapa: Number(item.etapa ?? 1),
      observacoes: item.observacoes ?? '',
    }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Excluir item legado de pipeline' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.pipelineItem.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  app.patch('/:id/etapa', { preHandler: authMiddleware, schema: { tags: ['Pipeline'], summary: 'Atualizar etapa do item (compatibilidade)' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { etapa, observacoes } = request.body as { etapa: number; observacoes?: string }
    const itemId = Number(id)
    const stage = Number(etapa)
    if (!Number.isFinite(itemId) || !Number.isFinite(stage)) return reply.status(400).send({ error: 'Parâmetros inválidos.' })

    const item = await prisma.pipelineItem.findUnique({ where: { id: itemId } })
    if (!item?.clienteId) return reply.status(404).send({ error: 'Item de implantação não encontrado.' })
    const usuarioId = Number((request.user as any)?.id || 0) || null

    const statusRows = await prisma.$queryRaw<{ status: number | null }[]>`SELECT COALESCE(STATUS_INSTAL, 0) AS status FROM cliente WHERE cod_cli = ${item.clienteId} LIMIT 1`
    const statusOrigem = normalizeStatus(Number(statusRows[0]?.status ?? 0))
    await prisma.$executeRaw`UPDATE cliente SET STATUS_INSTAL = ${stage} WHERE cod_cli = ${item.clienteId}`
    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { etapa: stage, ...(observacoes !== undefined ? { observacoes } : {}) },
    })

    await registrarMovimentacao({
      clienteId: item.clienteId,
      tipo: 'status',
      statusOrigem,
      statusDestino: stage,
      observacao: observacoes ?? null,
      usuarioId,
    })
    return { ok: true }
  })
}
