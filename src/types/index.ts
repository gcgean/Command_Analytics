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
  endereco?: string | null
  telefoneResidencial?: string | null
  cep?: string | null
  classificacaoNome?: string | null
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
  obsVenda?: string | null
  ultimoFTP?: string | null
  ultimoBackup?: string | null
  certificadoVencimento?: string | null
  versaoSistema?: string | null
  conexoes?: number | null
  caixas?: number | null
  legado?: ClienteLegado | null
  // Legacy optional fields for compatibility
  status?: string
  segmento?: string
  planoNome?: string
  codigo?: string
}

// ============================================================
// DASHBOARD DE MENSALIDADES
// ============================================================
export type DashboardMensalidadesClasseAbc = 'A' | 'B' | 'C'

export interface DashboardMensalidadesFiltros {
  status?: string
  faixaMensalidade?: string
  classeAbc?: DashboardMensalidadesClasseAbc | ''
  plano?: string
  cidade?: string
  uf?: string
  segmento?: string
  tipoContrato?: string
  vendedor?: string
  dataEntradaInicial?: string
  dataEntradaFinal?: string
}

export interface DashboardMensalidadesResumo {
  totalClientesAtivos: number
  totalClientesPagantes: number
  totalMensalidadeZerada: number
  mrr: number
  arr: number
  ticketMedio: number
  mediana: number
  menorMensalidade: number
  maiorMensalidade: number
  clientesAbaixoTicketMedio: number
  clientesAcimaTicketMedio: number
  percentualAbaixoTicketMedio: number
  percentualAcimaTicketMedio: number
}

export interface DashboardMensalidadesFaixa {
  faixa: string
  valorInicial: number
  valorFinal: number | null
  quantidadeClientes: number
  percentualClientes: number
  receitaTotal: number
  percentualReceita: number
  ticketMedioFaixa: number
  menorValor: number
  maiorValor: number
}

export interface DashboardMensalidadesCliente {
  id: number
  nome: string
  mensalidade: number
  plano: string | null
  cidade: string | null
  uf: string | null
  segmento: string | null
  status: string
  classeAbc: DashboardMensalidadesClasseAbc
  faixaMensalidade: string
  percentualReceita: number
  percentualAcumulado: number
}

export interface DashboardMensalidadesResumoClasse {
  classe: DashboardMensalidadesClasseAbc
  quantidadeClientes: number
  percentualClientes: number
  receitaTotal: number
  percentualReceita: number
  ticketMedio: number
}

export interface DashboardMensalidadesAbc {
  resumoPorClasse: DashboardMensalidadesResumoClasse[]
  clientesClassificados: DashboardMensalidadesCliente[]
  curvaReceitaAcumulada: Array<{ posicao: number; cliente: string; receitaAcumulada: number; percentualAcumulado: number }>
}

export interface DashboardMensalidadesConcentracao {
  clientesPara50Receita: number
  clientesPara70Receita: number
  clientesPara80Receita: number
  clientesPara90Receita: number
  participacaoTop10: number
  participacaoTop20: number
  participacaoTop50: number
  participacaoTop100: number
  curvaAcumulada: Array<{ posicao: number; percentualClientes: number; percentualReceita: number }>
}

export interface DashboardMensalidadesEstatisticas {
  media: number
  mediana: number
  moda: number | null
  desvioPadrao: number
  percentil25: number
  percentil50: number
  percentil75: number
  percentil90: number
  percentil95: number
  minimo: number
  maximo: number
  leitura: string
}

export interface DashboardMensalidadesRanking {
  total: number
  page: number
  limit: number
  pages: number
  data: DashboardMensalidadesCliente[]
}

export interface DashboardMensalidadesAgrupamento {
  grupo: string
  quantidadeClientes: number
  receitaMensalTotal: number
  ticketMedio: number
  percentualCarteira: number
  percentualReceitaTotal: number
}

export interface DashboardMensalidadesOpcoesFiltros {
  status: string[]
  faixas: string[]
  classesAbc: DashboardMensalidadesClasseAbc[]
  planos: string[]
  cidades: string[]
  ufs: string[]
  segmentos: string[]
  tiposContrato: string[]
  vendedores: string[]
}

export interface ClienteLegadoContato {
  descricao: string
  numero: string
  setor?: string | null
}

export interface ClienteLegadoVendaCampo {
  label: string
  value: string
}

export interface ClienteNuvemInfo {
  idGrupo?: number | null
  descricaoNuvemCliente?: string | null
  descPlanoNuvem?: string | null
  portaPrincipal?: string | null
  portaArquivos?: string | null
  portaAplicativos?: string | null
  idServerNuvem?: number | null
  nomeServidor?: string | null
  descricaoNuvem?: string | null
  numeroServidor?: string | null
  portaApiServidor?: string | null
}

export interface ClienteLegadoAgenda {
  id: number
  origem?: 'agenda' | 'agendamento_programado'
  tipo?: string | null
  status?: number | null
  data?: string | null
  dataFim?: string | null
  horarioIni?: string | null
  horarioFim?: string | null
  observacoes?: string | null
  tecnicoNome?: string | null
}

export interface ClienteHistoricoDesenvolvimento {
  id: number
  clienteId?: number | null
  clienteNome: string
  solicitacao: string
  dataSolicitacao?: string | null
  dataReferencia?: string | null
  tecnicoNome?: string | null
  desenvolvedorNome?: string | null
}

export interface ClienteLegado {
  observacaoPlataforma?: string | null
  contatos?: ClienteLegadoContato[]
  vendaCampos?: ClienteLegadoVendaCampo[]
  agendaObservacoes?: ClienteLegadoAgenda[]
}

export interface ClienteAnexo {
  id: number
  tabela: 'agenda' | 'agendamento_programado' | 'cliente_prontuario'
  registroId: number
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
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
  nota?: number | null
  procedimentos?: string | null
  departamentoLabel?: string | null
  tempoAtendimento?: number | null
  protocolo?: string | null
}

export interface ClienteResumoAtendimentos {
  totalChamados: number
  tempoMedioMinutos: number | null
  mediaChamadosPorDia: number | null
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
  procedimentoId?: number | null
  procedimentoNome?: string | null
  duracao?: number | null
  status: number | null          // int: 1=Aguardando, 2=Realizado, etc.
  data: string | null            // date string
  dataFim?: string | null        // date string
  horarioIni: string | null      // time (may come as DateTime)
  horarioFim?: string | null
  observacoes?: string | null
  nota?: string | null
  notaUsuarioId?: number | null
  notaUsuarioNome?: string | null
  notaAtualizadaEm?: string | null
  temAnexos?: boolean
  origem?: string
  // Legacy field for compatibility
  horario?: string
}

export interface ConfiguracaoNotificacaoAgendamento {
  ativoPlataforma: boolean
  ativoTelegram: boolean
  horarioResumoDia: string
  antecedenciaMin: number
}

export interface NotificacaoPlataforma {
  id: number
  titulo: string
  mensagem: string
  tipo: 'agenda_dia' | 'agenda_lembrete' | 'agenda_inicio' | 'implantacao_processo'
  lida: boolean
  criadoEm: string
  agendaOrigem?: 'agenda' | 'programado' | null
  agendaId?: number | null
  agendamentoData?: string | null
  agendamentoHora?: string | null
}

export interface StatusProcessamentoNotificacaoAgendamento {
  executando: boolean
  ultimaExecucaoEm: string | null
  ultimoSucessoEm: string | null
  ultimaFalhaEm: string | null
  ultimaMensagemErro: string | null
  ultimoResumo: {
    agendamentosHoje: number
    agendamentosJanela: number
    resumosGerados: number
    lembretesGerados: number
    telegramEnviados: number
    plataformaGeradas: number
  }
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
  ordem?: number
  nome: string
  descricao: string
  cor: string
  slaDias?: number
  quantidade?: number
}

export interface ImplantacaoCliente {
  processoId?: number
  processoTipo?: 'novo_cliente' | 'novo_servico'
  processoTitulo?: string | null
  processoPrincipal?: boolean
  processoCriadoEm?: string | null
  processoAtualizadoEm?: string | null
  servicoNome?: string | null
  servicoId?: number | null
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
  diasUltimaVenda?: number | null
  dataCadastro?: string | null
  dataInicioStatusAtual?: string | null
  observacoes?: string | null
  responsavelId?: number | null
  responsavelNome?: string | null
  responsavelAtualizadoEm?: string | null
  criadoPor?: number | null
  criadorNome?: string | null
  totalItensChecklist?: number
  itensChecklistMarcados?: number
  progressoChecklist?: number
  slaDiasEtapa?: number
  diasNaEtapa?: number
  emAtraso?: boolean
}

export interface DesempenhoEquipe {
  periodo: { meses: number; inicio: string }
  totalAtendimentos: number
  rankingTecnicos: Array<{ tecnicoId: number | null; tecnicoNome: string; total: number }>
  porSetor: Array<{ departamento: number | null; nome: string; total: number }>
  evolucaoMensal: Array<{ mes: string; label: string; total: number }>
  notasTreinamento: Array<{ tecnicoId: number; tecnicoNome: string; media: number; avaliacoes: number }>
}

export interface ImplantacaoConcluidosResposta {
  etapas: ImplantacaoEtapa[]
  resumo: {
    total: number
    concluidos: number
    desistencias: number
  }
  processos: ImplantacaoCliente[]
  paginacao: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
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
  clientesDisponiveis?: Array<{
    clienteId: number
    clienteNome: string
    nomeFantasia?: string | null
    cnpj?: string | null
  }>
  paginacao?: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
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
      observacao?: string
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
  itensQuantidade: number
}

export interface ImplantacaoConfiguracaoCliente {
  cliente: ImplantacaoCliente
  etapas: ImplantacaoEtapa[]
  responsaveis: Array<{ id: number; nome: string }>
  checklists: ImplantacaoChecklistOpcao[]
  checklistIdsSelecionados: number[]
  servicos?: Array<{ id: number; nome: string }>
  servicoIdAtual?: number | null
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
  contador?: string | null
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

export interface TipoMetaCadastro {
  id: number
  nome: string
  descricao: string
  ativo: boolean
  ordem: number
  criadoEm?: string | null
  atualizadoEm?: string | null
}

export interface MetaCadastroVisualizacao {
  usuarioId: number
  usuarioNome: string
}

export interface MetaCadastroItem {
  id: number
  nome: string
  descricao: string
  tipoMetaId: number | null
  tipoMetaNome: string | null
  setorResponsavel: Departamento
  valorMeta: number
  competencia: string
  ativo: boolean
  usuariosVisualizacao: MetaCadastroVisualizacao[]
  criadoEm?: string | null
  atualizadoEm?: string | null
}

export interface CertificadoDigitalItem {
  id: number
  razaoEmpresa: string
  nomeFantasia: string
  cidade: string
  telefone: string
  celular: string
  email: string
  cnpj: string
  tipo: string
  validade: string | null
  ultimaSincronizacao: string | null
  tipoCliente: string
  contadorNome: string
  contadorTelefone: string
  contadorEmail: string
  diasParaVencimento: number | null
  situacao: string
}

export interface CertificadoDigitalGraficoItem {
  referencia: string
  mesLabel: string
  total: number
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
  slaDias?: number | null
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

// ============================================================
// CADASTRO DE SERVIÇOS
// ============================================================
export interface ServicoCadastro {
  id: number
  nome: string
  descricao: string
  checklistIds: number[]
  ativo: boolean
  ordem: number
  criadoEm?: string | null
  atualizadoEm?: string | null
}

// ============================================================
// CADASTRO DE PROCEDIMENTOS
// ============================================================
export interface ProcedimentoCadastro {
  id: number
  nome: string
  descricao: string
  duracaoMin: number
  ativo: boolean
  ordem: number
  tecnicoIds?: number[]
  tecnicos?: Array<{ id: number; nome: string }>
  criadoEm?: string | null
  atualizadoEm?: string | null
}
