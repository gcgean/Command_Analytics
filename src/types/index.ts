// ============================================================
// USUÁRIO / AUTH
// ============================================================
export interface Usuario {
  id: number
  nome: string
  nomeUsu?: string
  email: string
  cargo: string
  departamento: Departamento
  avatar?: string
  idTelegram?: string
  ativo: boolean
  permissoes: string[]
}

// ============================================================
// ENUMS / TIPOS BASE
// ============================================================
export type Departamento =
  | 'Suporte'
  | 'Fiscal'
  | 'Financeiro'
  | 'Comercial'
  | 'Certificado'
  | 'CS'
  | 'Instalação'
  | 'Treinamento'
  | 'Técnico'

export type TipoContato = 'WhatsApp' | 'Telefone' | 'E-mail' | 'Presencial' | 'Outras Mídias'

export type StatusAtendimento =
  | 0  // Atrasado
  | 1  // Na fila
  | 2  // Em Atendimento
  | 3  // Aguardando Cliente
  | 4  // Aguardando Dev
  | 5  // Em Análise Dev
  | 6  // Aguardando Procedimento
  | 7  // Concluído
  | 8  // Cancelado
  | 9  // Aguardando Testes
  | 10 // Em Testes
  | 11 // Testado OK
  | 12 // Aprovado Dev
  | 13 // Em Desenvolvimento
  | 14 // Arquivados
  | 15 // Testado com Erro
  | 16 // Corrigido Dev

export type StatusPipeline =
  | 1  // Aguardando Instalação
  | 2  // Em Instalação
  | 3  // Agendar Treinamento
  | 4  // Reagendar Treinamento
  | 5  // Treinamento Concluído
  | 6  // Retorno CS
  | 7  // Concluído
  | 8  // Teste Demo
  | 9  // Pós-venda
  | 10 // Desistência
  | 11 // Aguardando Cliente p/ Instalação
  | 12 // Aguardando Migração
  | 13 // Primeiro Treinamento
  | 14 // Segundo Treinamento
  | 15 // Em Migração
  | 16 // Em Conferência de Migração

export type CurvaABC = 'A' | 'B' | 'C'
export type StatusCliente = 'Ativo' | 'Bloqueado' | 'Cancelado' | 'Inativo'
export type Segmento = 'Varejo' | 'Atacado' | 'Serviços' | 'Indústria' | 'Farmácia' | 'Posto'
export type Regime = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'MEI'
export type Prioridade = 'Baixa' | 'Normal' | 'Alta' | 'Urgente'

// ============================================================
// CLIENTE
// ============================================================
export interface Cliente {
  id: number
  nome: string | null
  nomeRazao?: string | null
  cnpj?: string | null
  cidade?: string | null
  uf?: string | null
  telefone?: string | null
  email?: string | null
  ativo?: string | null          // 'S'/'N'
  bloqueado?: string | null      // 'S'/'N'
  curvaABC?: string | null
  mensalidade?: number | null
  dataContrato?: string | null
  responsavel?: string | null
  idSegmento?: number | null
  idRegime?: number | null
  idPlano?: number | null
  contadorId?: number | null
  observacoes?: string | null
  // Legacy optional fields for compatibility
  status?: string
  segmento?: string
  planoNome?: string
  codigo?: string
}

// ============================================================
// ATENDIMENTO
// ============================================================
export interface Atendimento {
  id: number
  clienteId: number | null
  clienteNome: string
  tecnicoId: number | null
  tecnicoNome: string
  departamento: number | null    // int FK, not string
  tipoContato: number | null     // int
  status: number | null          // int
  prioridade: string | null      // char(1): 'A'=Alta, 'B'=Baixa, ''=Normal
  bugSistema: string | null      // char(1) 'S'/''
  foraHorario: string | null     // char(1)
  observacoes: string | null
  solucao?: string | null
  dataAbertura: string | null    // DateTime
  dataFechamento?: string | null
  tempoAtendimento?: number | null
  protocolo?: string | null
}

// ============================================================
// AGENDA
// ============================================================
export type TipoAgenda = 'Instalação' | 'Treinamento' | 'Visita' | 'Retorno'
export type StatusAgenda = 'Aguardando' | 'Finalizado' | 'Não Finalizado'

export interface AgendaItem {
  id: number
  clienteId: number | null
  clienteNome: string
  tecnicoId: number | null
  tecnicoNome: string
  tipo: string | null
  status: number | null          // int: 1=Aguardando, 2=Realizado, etc.
  data: string | null            // date string
  dataFim?: string | null        // date string
  horarioIni: string | null      // time (may come as DateTime)
  horarioFim?: string | null
  observacoes?: string | null
  // Legacy field for compatibility
  horario?: string
}

// ============================================================
// PLANO / ASSINATURA
// ============================================================
export interface Plano {
  id: number
  nome: string
  descricao: string
  preco: number
  periodicidade: 'Mensal' | 'Trimestral' | 'Anual'
  funcionalidades: string[]
  destaque?: boolean
}

export type FormaPagamento = 'Boleto' | 'PIX' | 'Cartão de Crédito' | 'Cartão de Débito'

export interface Assinatura {
  id: number
  clienteId: number
  clienteNome: string
  planoId: number
  planoNome: string
  formaPagamento: FormaPagamento
  valor: number
  vencimento: number
  dataInicio: string
  status: 'Ativa' | 'Suspensa' | 'Cancelada'
}

// ============================================================
// IMPLANTAÇÃO / PIPELINE
// ============================================================
export interface PipelineItem {
  id: number
  clienteId: number
  clienteNome: string
  etapa: StatusPipeline
  responsavelId: number
  responsavelNome: string
  dataEntrada: string
  observacoes?: string
}

export interface ImplantacaoEtapa {
  status: number
  nome: string
  descricao: string
  cor: string
  slaDias?: number
  quantidade?: number
}

export interface ImplantacaoCliente {
  clienteId: number
  clienteNome: string
  nomeFantasia?: string | null
  cnpj?: string | null
  cidade?: string | null
  uf?: string | null
  celular?: string | null
  telefone?: string | null
  email?: string | null
  statusInstal: number
  statusPrimeiroPgto?: string | null
  dataPrimeiroPgto?: string | null
  dataUltimaVenda?: string | null
  dataCadastro?: string | null
  dataInicioStatusAtual?: string | null
  observacoes?: string | null
  responsavelId?: number | null
  responsavelNome?: string | null
  responsavelAtualizadoEm?: string | null
  totalItensChecklist: number
  itensChecklistMarcados: number
  progressoChecklist: number
  slaDiasEtapa?: number
  diasNaEtapa?: number
  emAtraso?: boolean
}

export interface ImplantacaoPainel {
  etapas: ImplantacaoEtapa[]
  kpis: {
    totalClientes: number
    emProcesso: number
    concluidos: number
    desistencias: number
    aguardandoInicio: number
    atrasados?: number
  }
  clientes: ImplantacaoCliente[]
}

export interface ImplantacaoChecklistDetalhe {
  cliente: ImplantacaoCliente
  etapaAtual: ImplantacaoEtapa
  etapas: ImplantacaoEtapa[]
  resumo: {
    totalItens: number
    itensMarcados: number
    progresso: number
  }
  checklists: Array<{
    id: number
    nome: string
    descricao?: string
    itens: Array<{
      index: number
      texto: string
      marcado: boolean
    }>
  }>
  responsaveis?: Array<{ id: number; nome: string }>
  timeline?: Array<{
    id: number
    tipo: string
    statusOrigem?: number | null
    statusDestino?: number | null
    checklistId?: number | null
    itemIndice?: number | null
    marcado?: boolean | null
    responsavelId?: number | null
    responsavelNome?: string | null
    observacao?: string | null
    usuarioId?: number | null
    usuarioNome?: string | null
    dataHora: string
  }>
}

export interface ImplantacaoChecklistOpcao {
  id: number
  nome: string
  descricao?: string
  ordem: number
  etapas: string[]
  itensQuantidade: number
}

export interface ImplantacaoConfiguracaoCliente {
  cliente: ImplantacaoCliente
  etapas: ImplantacaoEtapa[]
  responsaveis: Array<{ id: number; nome: string }>
  checklists: ImplantacaoChecklistOpcao[]
  checklistIdsSelecionados: number[]
}

// ============================================================
// CRM / NEGÓCIOS
// ============================================================
export type StatusNegocio = 'Prospecção' | 'Qualificação' | 'Proposta' | 'Negociação' | 'Fechado Ganho' | 'Fechado Perdido'

export interface Negocio {
  id: number
  nome: string
  empresa: string
  responsavelId: number
  responsavelNome: string
  valor: number
  status: StatusNegocio
  dataCriacao: string
  dataFechamento?: string
  telefone?: string
  email?: string
  observacoes?: string
}

export interface Lead {
  id: number
  nome: string
  empresa: string
  telefone: string
  email?: string
  cidade: string
  uf: string
  segmento: Segmento
  origem: string
  responsavelId: number
  responsavelNome: string
  dataCadastro: string
  observacoes?: string
}

// ============================================================
// FINANCEIRO
// ============================================================
export interface AnaliseFinanceira {
  clienteId: number
  clienteNome: string
  mensalidade: number
  custoSuporte: number
  custoDev: number
  custoFixo: number
  margemValor: number
  margemPercent: number
}

export interface Comissao {
  id: number
  vendedorId: number
  vendedorNome: string
  clienteId: number
  clienteNome: string
  tipo: 'Venda' | 'Renovação' | 'Upsell'
  valor: number
  percentual: number
  dataVenda: string
  dataPagamento?: string
  status: 'Pendente' | 'Aprovada' | 'Paga'
}

// ============================================================
// DESENVOLVIMENTO
// ============================================================
export type PrioridadeTarefa = 'A' | 'B' | 'C' | 'D'
export type StatusTarefa = 'Pendente' | 'Em Desenvolvimento' | 'Em Teste' | 'Concluída' | 'Cancelada'

export interface Tarefa {
  id: number
  descricao: string
  clienteId?: number
  clienteNome?: string
  prioridade: PrioridadeTarefa
  status: StatusTarefa
  percentualConclusao: number
  software: string
  segmento?: Segmento
  desenvolvedores: string[]
  dataCriacao: string
  dataPrevisao?: string
  isBug: boolean
}

// ============================================================
// VÍDEOS
// ============================================================
export interface Video {
  id: number
  titulo: string
  categoria: string
  segmento?: Segmento
  colaborador: string
  dataCadastro: string
  url: string
  descricao?: string
  visualizacoes: number
}

// ============================================================
// METAS / NPS
// ============================================================
export interface Meta {
  id: number
  descricao: string
  responsavel: string
  departamento: Departamento
  metaValor: number
  realizado: number
  unidade: string
  periodo: string
  status: 'Em andamento' | 'Concluída' | 'Atrasada'
}

export interface AvaliacaoNPS {
  id: number
  clienteId: number
  clienteNome: string
  nota: number
  comentario?: string
  departamento: Departamento
  data: string
  categoria: 'Promotor' | 'Neutro' | 'Detrator'
}

// ============================================================
// MONITOR ATENDIMENTOS
// ============================================================
export interface MonitorAtendimento {
  id: number
  clienteNome: string
  numero: string
  atendente: string
  departamento: Departamento
  status: 'Aguardando' | 'Em Atendimento' | 'Resolvido'
  inicioAtendimento: string
  tempoEspera: number
  mensagens: number
}

// ============================================================
// CAMPANHAS
// ============================================================
export interface Campanha {
  id: number
  titulo: string
  descricao: string
  dataInicio: string
  dataFim: string
  ativa: boolean
  visualizacoes: number
  tipo: 'Banner' | 'Notificação' | 'E-mail' | 'WhatsApp'
  segmento?: Segmento
}

// ============================================================
// CONTADORES
// ============================================================
export interface Contador {
  id: number
  nome: string
  empresa: string
  telefone: string
  email: string
  cidade: string
  uf: string
  totalClientes: number
  totalIndicacoes: number
  dataCadastro: string
  ativo: boolean
}

// ============================================================
// VERSÕES
// ============================================================
export interface Versao {
  id: number
  software: string
  versao: string
  dataLancamento: string
  obrigatoria: boolean
  beta: boolean
  notas: string
  segmentos: Segmento[]
}

// ============================================================
// SERVIDORES
// ============================================================
export interface Servidor {
  id: number
  nome: string
  ip: string
  provedor: string
  localizacao: string
  cpuPercent: number
  ramPercent: number
  discoUsado: number
  discoTotal: number
  online: boolean
  latencia: number
  historicoUso: number[]
  ultimaVerificacao: string
}

// ============================================================
// GENÉRICO
// ============================================================
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
}

export interface ApiResponse<T> {
  data: T
  meta?: PaginationMeta
}

// ============================================================
// CADASTRO DE ETAPAS
// ============================================================
export interface EtapaCadastro {
  id: number
  nome: string
  cor: string
  telas: string[]
  ativo: boolean
  ordem: number
  criadoEm?: string | null
  atualizadoEm?: string | null
}

// ============================================================
// CADASTRO DE CHECKLISTS
// ============================================================
export interface ChecklistCadastro {
  id: number
  nome: string
  descricao: string
  itens: string[]
  etapas?: string[]
  telas: string[]
  ativo: boolean
  ordem: number
  criadoEm?: string | null
  atualizadoEm?: string | null
}
