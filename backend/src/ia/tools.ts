import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import type { ContextoIA } from './seguranca'
import { possuiPermissao } from './seguranca'
import { obterConexoesAgregadas } from '../routes/connections'
import { usuarioEhAdmin } from '../utils/visibilidade'

export type NivelRisco = 'consulta' | 'escrita' | 'critica'

export interface Ferramenta {
  nome: string
  descricao: string
  risco: NivelRisco
  // Recurso do sistema de permissões (mesmo id usado nas telas, ver grupos.ts/SYSTEM_RESOURCES).
  // A ferramenta só aparece pro modelo se o usuário logado tiver esse acesso — ver
  // ferramentasParaUsuario() no fim do arquivo.
  permissao: string
  schemaParametros: Record<string, any>
  executar: (args: Record<string, any>, ctx: ContextoIA) => Promise<any>
}

const TIPOS_AGENDA_VALIDOS = ['Instalação', 'Treinamento', 'Retorno', 'Visita', 'Suporte']
const TIPOS_BANCO_HORAS_VALIDOS = ['Hora Extra', 'Horas por Km', 'Falta c/ Atestado', 'Falta s/ Atestado', 'Home Office', 'Desconto de Horas Padrão']

function tipoParaMovFalta(tipo: string): { tipoMov: string; tipoFalta: number | null } {
  switch (tipo) {
    case 'Hora Extra': return { tipoMov: 'C', tipoFalta: null }
    case 'Horas por Km': return { tipoMov: 'C', tipoFalta: 4 }
    case 'Falta c/ Atestado': return { tipoMov: 'D', tipoFalta: 1 }
    case 'Falta s/ Atestado': return { tipoMov: 'D', tipoFalta: 2 }
    case 'Home Office': return { tipoMov: 'D', tipoFalta: 3 }
    default: return { tipoMov: 'D', tipoFalta: 0 }
  }
}

export const ferramentas: Ferramenta[] = [
  // ─────────────────────────── CONSULTA ───────────────────────────
  {
    nome: 'buscar_clientes',
    descricao:
      'Busca clientes ativos pelo nome fantasia, razão social ou CNPJ. Use SEMPRE antes de ' +
      'criar um agendamento pra descobrir o id real do cliente — nunca invente um id.',
    risco: 'consulta',
    permissao: 'clientes',
    schemaParametros: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Nome, parte do nome ou CNPJ do cliente' } },
      required: ['busca'],
    },
    async executar(args) {
      const busca = String(args.busca ?? '').trim()
      if (!busca) return { erro: 'Informe um termo de busca.' }
      const clientes = await prisma.cliente.findMany({
        where: {
          ativo: 'S',
          OR: [
            { nome: { contains: busca } },
            { nomeRazao: { contains: busca } },
            { cnpj: { contains: busca } },
          ],
        },
        select: { id: true, nome: true, nomeRazao: true, cnpj: true, cidade: true },
        take: 10,
      })
      return { clientes }
    },
  },
  {
    nome: 'buscar_funcionarios',
    descricao:
      'Busca funcionários/técnicos ativos pelo nome. Use SEMPRE antes de criar um agendamento ' +
      'ou lançar horas no banco de horas pra descobrir o id real da pessoa — nunca invente um id.',
    risco: 'consulta',
    // Sem gate específico — nomes/cargos de funcionários ativos já são visíveis em selects por
    // todo o sistema pra qualquer usuário logado (ex.: escolher técnico numa agenda), não é uma
    // tela própria com permissão dedicada.
    permissao: '',
    schemaParametros: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Nome ou parte do nome do funcionário' } },
      required: ['busca'],
    },
    async executar(args) {
      const busca = String(args.busca ?? '').trim()
      if (!busca) return { erro: 'Informe um termo de busca.' }
      const funcionarios = await prisma.usuario.findMany({
        where: {
          ativo: 'S',
          OR: [{ nomeUsu: { contains: busca } }, { nomeCompleto: { contains: busca } }],
        },
        select: { id: true, nomeUsu: true, nomeCompleto: true, cargo: true },
        take: 10,
      })
      return { funcionarios }
    },
  },
  {
    nome: 'consultar_agenda',
    descricao: 'Lista agendamentos num período, opcionalmente filtrando por cliente ou técnico (já resolvidos pra id).',
    risco: 'consulta',
    permissao: 'agenda',
    schemaParametros: {
      type: 'object',
      properties: {
        dataInicio: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
        dataFim: { type: 'string', description: 'Data final no formato YYYY-MM-DD' },
        clienteId: { type: 'integer' },
        tecnicoId: { type: 'integer' },
      },
      required: ['dataInicio', 'dataFim'],
    },
    async executar(args) {
      const where: Record<string, any> = {}
      if (args.dataInicio || args.dataFim) {
        where.data = {}
        if (args.dataInicio) where.data.gte = new Date(String(args.dataInicio))
        if (args.dataFim) where.data.lte = new Date(String(args.dataFim))
      }
      if (args.clienteId) where.clienteId = Number(args.clienteId)
      if (args.tecnicoId) where.tecnicoId = Number(args.tecnicoId)

      const itens = await prisma.agendaItem.findMany({
        where,
        include: { cliente: { select: { nome: true } }, tecnico: { select: { nomeUsu: true } } },
        orderBy: { data: 'asc' },
        take: 30,
      })
      return {
        agendamentos: itens.map((i) => ({
          id: i.id,
          cliente: i.cliente?.nome ?? null,
          tecnico: i.tecnico?.nomeUsu ?? null,
          tipo: i.tipo,
          data: i.data,
          status: i.status,
          observacoes: i.observacoes,
        })),
      }
    },
  },
  {
    nome: 'consultar_atendimentos',
    descricao: 'Lista atendimentos recentes, opcionalmente filtrando por cliente já resolvido pra id.',
    risco: 'consulta',
    permissao: 'atendimentos',
    schemaParametros: {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        limite: { type: 'integer', description: 'Quantos registros retornar (padrão 15, máx 30)' },
      },
    },
    async executar(args) {
      const limite = Math.min(30, Math.max(1, Number(args.limite) || 15))
      const atendimentos = await prisma.atendimento.findMany({
        where: args.clienteId ? { clienteId: Number(args.clienteId) } : undefined,
        include: { cliente: { select: { nome: true } } },
        orderBy: { dataAbertura: 'desc' },
        take: limite,
      })
      return {
        atendimentos: atendimentos.map((a) => ({
          id: a.id,
          cliente: a.cliente?.nome ?? null,
          status: a.status,
          observacoes: a.observacoes,
          dataAbertura: a.dataAbertura,
          dataFechamento: a.dataFechamento,
        })),
      }
    },
  },
  {
    nome: 'consultar_banco_horas',
    descricao: 'Mostra o saldo atual e os últimos lançamentos de banco de horas de um funcionário (id já resolvido).',
    risco: 'consulta',
    permissao: 'banco-horas',
    schemaParametros: {
      type: 'object',
      properties: { funcionarioId: { type: 'integer' } },
      required: ['funcionarioId'],
    },
    async executar(args) {
      const funcionarioId = Number(args.funcionarioId)
      const rows = await prisma.$queryRaw<Array<{ QTD_HORAS: number; TIPO_MOV: string; TIPO_FALTA: number | null; OBS: string | null; DATA_HORA_INI: Date | null }>>`
        SELECT QTD_HORAS, TIPO_MOV, TIPO_FALTA, OBS, DATA_HORA_INI
        FROM banco_de_horas WHERE COD_FUNCIONARIO = ${funcionarioId}
        ORDER BY DATA_HORA_INI ASC
      `
      let saldo = 0
      for (const r of rows) {
        const falta = r.TIPO_FALTA ?? 0
        const afetaSaldo = r.TIPO_MOV === 'C' || falta === 0
        if (afetaSaldo) saldo += r.TIPO_MOV === 'C' ? Number(r.QTD_HORAS) : -Number(r.QTD_HORAS)
      }
      const ultimos = rows.slice(-10).reverse().map((r) => ({
        horas: Number(r.QTD_HORAS),
        tipoMov: r.TIPO_MOV,
        observacao: r.OBS,
        data: r.DATA_HORA_INI,
      }))
      return { saldoAtual: Math.round(saldo * 100) / 100, ultimosLancamentos: ultimos }
    },
  },

  {
    nome: 'consultar_pipeline_implantacao',
    descricao:
      'Lista processos do Pipeline de Implantação (etapa atual, responsável, data limite), ' +
      'opcionalmente filtrando por cliente já resolvido pra id.',
    risco: 'consulta',
    permissao: 'implantacao',
    schemaParametros: {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        limite: { type: 'integer', description: 'Quantos registros retornar (padrão 15, máx 30)' },
      },
    },
    async executar(args) {
      const limite = Math.min(30, Math.max(1, Number(args.limite) || 15))
      const rows = await prisma.$queryRaw<Array<{
        id: number; clienteNome: string | null; tipo: string; titulo: string | null
        statusAtual: number; dataLimite: Date | null; observacao: string | null
        responsavelNome: string | null
      }>>`
        SELECT p.id, c.NOME_FANTASIA AS clienteNome, p.tipo, p.titulo, p.status_atual AS statusAtual,
               p.data_limite AS dataLimite, p.observacao,
               u.NOME_USU AS responsavelNome
        FROM implantacao_processos p
        LEFT JOIN cliente c ON c.cod_cli = p.cliente_id
        LEFT JOIN implantacao_responsavel_processo r ON r.processo_id = p.id
        LEFT JOIN usuario u ON u.COD_USU = r.responsavel_id
        WHERE p.ativo = 1 ${args.clienteId ? Prisma.sql`AND p.cliente_id = ${Number(args.clienteId)}` : Prisma.empty}
        ORDER BY p.atualizado_em DESC
        LIMIT ${limite}
      `
      return {
        processos: rows.map((r) => ({
          id: r.id,
          cliente: r.clienteNome,
          tipo: r.tipo,
          titulo: r.titulo,
          statusAtual: r.statusAtual,
          responsavel: r.responsavelNome,
          dataLimite: r.dataLimite,
          observacao: r.observacao,
        })),
      }
    },
  },
  {
    nome: 'consultar_negocios_crm',
    descricao:
      'Lista negócios do CRM/pipeline de vendas (etapa, funil, responsável), opcionalmente ' +
      'filtrando por cliente já resolvido pra id.',
    risco: 'consulta',
    permissao: 'crm',
    schemaParametros: {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        limite: { type: 'integer', description: 'Quantos registros retornar (padrão 15, máx 30)' },
      },
    },
    async executar(args) {
      const limite = Math.min(30, Math.max(1, Number(args.limite) || 15))
      const negocios = await prisma.negocio.findMany({
        where: args.clienteId ? { clienteId: Number(args.clienteId) } : undefined,
        include: {
          cliente: { select: { nome: true } },
          responsavel: { select: { nomeUsu: true } },
        },
        orderBy: { dataCriacao: 'desc' },
        take: limite,
      })
      return {
        negocios: negocios.map((n) => ({
          id: n.id,
          titulo: n.nome,
          cliente: n.cliente?.nome ?? null,
          responsavel: n.responsavel?.nomeUsu ?? null,
          etapa: n.etapa,
          funil: n.funil,
          status: n.status,
          descricao: n.descricao,
        })),
      }
    },
  },
  {
    nome: 'buscar_conexao',
    descricao:
      'Busca a conexão de um cliente na tela de Conexões (infraestrutura) pelo nome. Use essa ' +
      'ferramenta sempre que o usuário pedir o AnyDesk, servidor, portas ou status de conexão de ' +
      'um cliente — o AnyDesk retornado é do SERVIDOR onde a conexão do cliente está hospedada ' +
      '(pode ser o mesmo AnyDesk de outros clientes no mesmo servidor).',
    risco: 'consulta',
    permissao: 'conexoes',
    schemaParametros: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Nome do cliente ou da conexão' } },
      required: ['busca'],
    },
    async executar(args, ctx) {
      const busca = String(args.busca ?? '').trim().toLowerCase()
      if (!busca) return { erro: 'Informe um termo de busca.' }
      const admin = await usuarioEhAdmin(ctx.usuarioId)
      const todas = await obterConexoesAgregadas(admin, false)
      const encontradas = todas
        .filter((c) => c.name.toLowerCase().includes(busca))
        .slice(0, 10)
        .map((c) => ({
          nome: c.name,
          status: c.status,
          servidor: c.servidorNome,
          servidorAnydesk: c.servidorAnydesk,
          portas: c.ports,
        }))
      if (encontradas.length === 0) {
        return { erro: `Nenhuma conexão encontrada com "${args.busca}". Confira o nome ou peça pra buscar por outra variação.` }
      }
      return { conexoes: encontradas }
    },
  },

  // ─────────────────────────── CRÍTICA (vira proposta) ───────────────────────────
  {
    nome: 'criar_agendamento',
    descricao:
      'Prepara um novo agendamento na Agenda com os ids já resolvidos (use buscar_clientes e ' +
      'buscar_funcionarios antes). NÃO grava sozinho: gera um preview que abre o formulário real ' +
      `de Novo Agendamento pra pessoa conferir e salvar. Tipos válidos: ${TIPOS_AGENDA_VALIDOS.join(', ')}.`,
    risco: 'critica',
    permissao: 'agenda',
    schemaParametros: {
      type: 'object',
      properties: {
        clienteId: { type: 'integer' },
        tecnicoId: { type: 'integer' },
        tipo: { type: 'string', enum: TIPOS_AGENDA_VALIDOS },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        horaInicio: { type: 'string', description: 'HH:MM' },
        horaFim: { type: 'string', description: 'HH:MM' },
        observacoes: { type: 'string' },
      },
      required: ['clienteId', 'tecnicoId', 'tipo', 'data', 'horaInicio', 'horaFim'],
    },
    async executar(args) {
      const [cliente, tecnico] = await Promise.all([
        prisma.cliente.findUnique({ where: { id: Number(args.clienteId) }, select: { id: true, nome: true } }),
        prisma.usuario.findUnique({ where: { id: Number(args.tecnicoId) }, select: { id: true, nomeUsu: true } }),
      ])
      if (!cliente) return { erro: 'Cliente não encontrado. Use buscar_clientes pra achar o id certo.' }
      if (!tecnico) return { erro: 'Técnico não encontrado. Use buscar_funcionarios pra achar o id certo.' }
      if (!TIPOS_AGENDA_VALIDOS.includes(String(args.tipo))) return { erro: `Tipo inválido. Use um de: ${TIPOS_AGENDA_VALIDOS.join(', ')}.` }

      return {
        proposta: 'criar_agendamento',
        dados: {
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          tecnicoId: tecnico.id,
          tecnicoNome: tecnico.nomeUsu,
          tipo: args.tipo,
          data: args.data,
          horaInicio: args.horaInicio,
          horaFim: args.horaFim,
          observacoes: args.observacoes ?? '',
        },
        mensagemParaUsuario: 'Preparei o agendamento — confira e salve na tela que vai abrir.',
      }
    },
  },
  {
    nome: 'lancar_horas',
    descricao:
      'Prepara um lançamento no Banco de Horas com o id do funcionário já resolvido (use ' +
      'buscar_funcionarios antes). NÃO grava sozinho: gera um preview que abre o formulário real ' +
      `de Lançar Horas pra pessoa conferir e salvar. Tipos válidos: ${TIPOS_BANCO_HORAS_VALIDOS.join(', ')}.`,
    risco: 'critica',
    permissao: 'banco-horas-lancar',
    schemaParametros: {
      type: 'object',
      properties: {
        funcionarioId: { type: 'integer' },
        tipo: { type: 'string', enum: TIPOS_BANCO_HORAS_VALIDOS },
        horas: { type: 'number' },
        dataInicio: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        dataFim: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        observacao: { type: 'string' },
      },
      required: ['funcionarioId', 'tipo', 'horas', 'dataInicio', 'dataFim', 'observacao'],
    },
    async executar(args, ctx) {
      if (!possuiPermissao(ctx, 'banco-horas-lancar')) {
        return { erro: 'Você não tem permissão para lançar ou descontar horas no Banco de Horas.' }
      }
      const funcionarioId = Number(args.funcionarioId)
      if (funcionarioId === ctx.usuarioId) {
        return { erro: 'Não é permitido lançar horas para si mesmo.' }
      }
      const funcionario = await prisma.usuario.findUnique({ where: { id: funcionarioId }, select: { id: true, nomeUsu: true } })
      if (!funcionario) return { erro: 'Funcionário não encontrado. Use buscar_funcionarios pra achar o id certo.' }
      if (!TIPOS_BANCO_HORAS_VALIDOS.includes(String(args.tipo))) return { erro: `Tipo inválido. Use um de: ${TIPOS_BANCO_HORAS_VALIDOS.join(', ')}.` }
      const horas = Number(args.horas)
      if (!Number.isFinite(horas) || horas <= 0) return { erro: 'Quantidade de horas inválida.' }

      // tipoParaMovFalta só serve pra confirmar que o tipo mapeia certo — a gravação real
      // acontece quando a pessoa confirma no formulário de Banco de Horas, não aqui.
      tipoParaMovFalta(String(args.tipo))

      return {
        proposta: 'lancar_horas',
        dados: {
          funcionarioId: funcionario.id,
          funcionarioNome: funcionario.nomeUsu,
          tipo: args.tipo,
          horas,
          dataInicio: args.dataInicio,
          dataFim: args.dataFim,
          observacao: args.observacao,
        },
        mensagemParaUsuario: 'Preparei o lançamento — confira e salve na tela que vai abrir.',
      }
    },
  },
]

export function ferramentasParaUsuario(ctx: ContextoIA): Ferramenta[] {
  // O modelo só recebe a DECLARAÇÃO de ferramentas cujo recurso o usuário logado tem acesso —
  // ele nem fica sabendo que elas existem, não é só um erro depois de tentar chamar. Isso segue
  // a mesma regra de acesso das telas (SYSTEM_RESOURCES em grupos.ts).
  return ferramentas.filter((f) => !f.permissao || possuiPermissao(ctx, f.permissao))
}
