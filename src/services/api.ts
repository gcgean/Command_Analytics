import type {
  Cliente, Atendimento, AgendaItem, Plano, Assinatura, PipelineItem,
  Negocio, Lead, AnaliseFinanceira, Comissao, Tarefa, Video, Meta,
  AvaliacaoNPS, MonitorAtendimento, Campanha, Contador, Versao, Servidor,
  StatusAtendimento
} from '../types'

// ============================================================
// CONFIGURAÇÃO BASE
// ============================================================
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333'

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ============================================================
// API SERVICE
// ============================================================
export const api = {
  // ─── Auth ──────────────────────────────────────────────────
  login: async (usuario: string, senha: string) => {
    const data = await fetchApi<{ token: string; user: Record<string, unknown> }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, senha }),
    })
    localStorage.setItem('auth_token', data.token)
    return { user: data.user, token: data.token }
  },

  logout: () => {
    localStorage.removeItem('auth_token')
  },

  getMe: () => fetchApi('/auth/me'),

  alterarSenha: (senhaAtual: string, novaSenha: string) =>
    fetchApi('/auth/senha', { method: 'PUT', body: JSON.stringify({ senhaAtual, novaSenha }) }),

  // ─── Dashboard ─────────────────────────────────────────────
  getDashboardKPIs: () => fetchApi('/dashboard/kpis'),

  // ─── Clientes ──────────────────────────────────────────────
  getClientes: (params?: { status?: string; segmento?: string; curvaABC?: string; search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<Cliente[]>(`/clientes${qs}`)
  },
  getClienteById: (id: number) => fetchApi<Cliente>(`/clientes/${id}`),
  createCliente: (data: Partial<Cliente>) => fetchApi<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  updateCliente: (id: number, data: Partial<Cliente>) => fetchApi<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getMonitorClientes: () => fetchApi('/clientes/monitor/resumo'),

  // ─── Atendimentos ──────────────────────────────────────────
  getAtendimentos: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<Atendimento[]>(`/atendimentos${qs}`)
  },
  getAtendimentoById: (id: number) => fetchApi<Atendimento>(`/atendimentos/${id}`),
  createAtendimento: (data: Partial<Atendimento>) =>
    fetchApi<Atendimento>('/atendimentos', { method: 'POST', body: JSON.stringify(data) }),
  updateAtendimento: (id: number, data: Partial<Atendimento>) =>
    fetchApi<Atendimento>(`/atendimentos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStatusAtendimento: (id: number, status: number, extra?: { solucao?: string; dataFechamento?: string }) =>
    fetchApi<Atendimento>(`/atendimentos/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) }),

  // ─── Agenda ────────────────────────────────────────────────
  getAgenda: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<AgendaItem[]>(`/agenda${qs}`)
  },
  createAgendaItem: (data: Partial<AgendaItem>) =>
    fetchApi<AgendaItem>('/agenda', { method: 'POST', body: JSON.stringify(data) }),
  updateAgendaStatus: (id: number, status: number) =>
    fetchApi<AgendaItem>(`/agenda/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateAgendaItem: (id: number, data: Partial<AgendaItem>) =>
    fetchApi<AgendaItem>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgendaItem: (id: number) => fetchApi(`/agenda/${id}`, { method: 'DELETE' }),

  // ─── Disponibilidade de Técnicos ───────────────────────────────
  getDisponibilidades: () => fetchApi<any[]>('/agenda/disponibilidade'),
  saveDisponibilidade: (data: { tecnicoId: number; diasSemana: string; horaInicio: string; horaFim: string; intervaloMin: number; dataInicio?: string | null; dataFim?: string | null; intervaloIni?: string | null; intervaloFim?: string | null }) =>
    fetchApi('/agenda/disponibilidade', { method: 'POST', body: JSON.stringify(data) }),
  deleteDisponibilidade: (tecnicoId: number) => fetchApi(`/agenda/disponibilidade/${tecnicoId}`, { method: 'DELETE' }),
  getSlots: (params: Record<string, string>) =>
    fetchApi<any[]>(`/agenda/slots?${new URLSearchParams(params).toString()}`),
  getAgendamentosProg: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<any[]>(`/agenda/agendamentos-prog${qs}`)
  },
  createAgendamentoProg: (data: { tecnicoId: number; clienteId?: number; data: string; horaInicio: string; duracao?: number; descricao?: string }) =>
    fetchApi('/agenda/agendamentos-prog', { method: 'POST', body: JSON.stringify(data) }),
  cancelAgendamentoProg: (id: number) => fetchApi(`/agenda/agendamentos-prog/${id}`, { method: 'DELETE' }),
  updateAgendamentoProg: (id: number, data: { tecnicoId?: number; clienteId?: number | null; data?: string; horaInicio?: string; duracao?: number; descricao?: string | null }) =>
    fetchApi(`/agenda/agendamentos-prog/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateAgendamentoProgStatus: (id: number, status: number) =>
    fetchApi(`/agenda/agendamentos-prog/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // ─── Bloqueios ─────────────────────────────────────────────
  getBloqueios: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<any[]>(`/agenda/bloqueios${qs}`)
  },
  createBloqueio: (data: { tecnicoId?: number | null; dataIni: string; horaIni: string; dataFim: string; horaFim: string; motivo?: string }) =>
    fetchApi('/agenda/bloqueios', { method: 'POST', body: JSON.stringify(data) }),
  deleteBloqueio: (id: number) => fetchApi(`/agenda/bloqueios/${id}`, { method: 'DELETE' }),

  // ─── Planos ────────────────────────────────────────────────
  getPlanos: () => fetchApi<Plano[]>('/planos'),
  getAssinaturas: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<Assinatura[]>(`/planos/assinaturas${qs}`)
  },
  updateAssinatura: (id: number, data: Partial<Assinatura>) =>
    fetchApi<Assinatura>(`/planos/assinaturas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Pipeline / Implantação ────────────────────────────────
  getPipeline: () => fetchApi<PipelineItem[]>('/pipeline'),
  updatePipelineEtapa: (id: number, etapa: number, observacoes?: string) =>
    fetchApi<PipelineItem>(`/pipeline/${id}/etapa`, { method: 'PATCH', body: JSON.stringify({ etapa, observacoes }) }),

  // ─── CRM ───────────────────────────────────────────────────
  getNegocios: () => fetchApi<Negocio[]>('/crm/negocios'),
  createNegocio: (data: Partial<Negocio>) =>
    fetchApi<Negocio>('/crm/negocios', { method: 'POST', body: JSON.stringify(data) }),
  updateNegocioStatus: (id: number, status: string, dataFechamento?: string) =>
    fetchApi<Negocio>(`/crm/negocios/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, dataFechamento }) }),
  getLeads: () => fetchApi<Lead[]>('/crm/leads'),
  createLead: (data: Partial<Lead>) =>
    fetchApi<Lead>('/crm/leads', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Financeiro ────────────────────────────────────────────
  getAnaliseFinanceira: () => fetchApi<AnaliseFinanceira[]>('/financeiro/analise'),
  getComissoes: () => fetchApi<Comissao[]>('/financeiro/comissoes'),
  updateComissaoStatus: (id: number, status: string, dataPagamento?: string) =>
    fetchApi<Comissao>(`/financeiro/comissoes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, dataPagamento }) }),
  getMRR: () => fetchApi('/financeiro/mrr'),

  // ─── Desenvolvimento ───────────────────────────────────────
  getTarefas: () => fetchApi<Tarefa[]>('/tarefas'),
  createTarefa: (data: Partial<Tarefa>) =>
    fetchApi<Tarefa>('/tarefas', { method: 'POST', body: JSON.stringify(data) }),
  updateTarefaProgresso: (id: number, percentualConclusao: number, status?: string) =>
    fetchApi<Tarefa>(`/tarefas/${id}/progresso`, { method: 'PATCH', body: JSON.stringify({ percentualConclusao, status }) }),

  // ─── Vídeos ────────────────────────────────────────────────
  getVideos: () => fetchApi<Video[]>('/videos'),
  createVideo: (data: Partial<Video>) =>
    fetchApi<Video>('/videos', { method: 'POST', body: JSON.stringify(data) }),
  visualizarVideo: (id: number) => fetchApi(`/videos/${id}/visualizar`, { method: 'POST' }),

  // ─── Metas / NPS ───────────────────────────────────────────
  getMetas: () => fetchApi<Meta[]>('/metas'),
  getNPS: () => fetchApi<AvaliacaoNPS[]>('/metas/nps'),
  getNPSKpi: () => fetchApi('/metas/nps/kpi'),
  createNPS: (data: Partial<AvaliacaoNPS>) =>
    fetchApi<AvaliacaoNPS>('/metas/nps', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Monitor ───────────────────────────────────────────────
  getMonitor: () => fetchApi<MonitorAtendimento[]>('/monitor'),
  updateMonitorStatus: (id: number, status: string, atendente?: string) =>
    fetchApi<MonitorAtendimento>(`/monitor/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, atendente }) }),

  // ─── Campanhas ─────────────────────────────────────────────
  getCampanhas: () => fetchApi<Campanha[]>('/campanhas'),
  createCampanha: (data: Partial<Campanha>) =>
    fetchApi<Campanha>('/campanhas', { method: 'POST', body: JSON.stringify(data) }),
  toggleCampanha: (id: number) =>
    fetchApi<Campanha>(`/campanhas/${id}/toggle`, { method: 'PATCH' }),

  // ─── Contadores ────────────────────────────────────────────
  getContadores: () => fetchApi<Contador[]>('/contadores'),
  createContador: (data: Partial<Contador>) =>
    fetchApi<Contador>('/contadores', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Versões ───────────────────────────────────────────────
  getVersoes: () => fetchApi<Versao[]>('/versoes'),
  createVersao: (data: Partial<Versao>) =>
    fetchApi<Versao>('/versoes', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Servidores ────────────────────────────────────────────
  getServidores: () => fetchApi<Servidor[]>('/servidores'),

  // ─── Usuários ──────────────────────────────────────────────
  getUsuarios: () => fetchApi('/usuarios'),
  updateUsuario: (id: number, data: Record<string, unknown>) =>
    fetchApi(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Grupos de Acesso ────────────────────────────────────
  getGrupos: () => fetchApi<any[]>('/grupos'),
  getGruposRecursos: () => fetchApi<any[]>('/grupos/recursos'),
  getGrupoById: (id: number) => fetchApi<any>(`/grupos/${id}`),
  createGrupo: (data: { nome: string; descricao?: string; superGrupo?: boolean }) =>
    fetchApi('/grupos', { method: 'POST', body: JSON.stringify(data) }),
  updateGrupo: (id: number, data: { nome?: string; descricao?: string; superGrupo?: boolean; ativo?: boolean }) =>
    fetchApi(`/grupos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGrupo: (id: number) => fetchApi(`/grupos/${id}`, { method: 'DELETE' }),
  setGrupoPermissoes: (id: number, recursos: string[]) =>
    fetchApi(`/grupos/${id}/permissoes`, { method: 'PUT', body: JSON.stringify({ recursos }) }),
  addUserToGrupo: (id: number, usuarioId: number) =>
    fetchApi(`/grupos/${id}/usuarios`, { method: 'POST', body: JSON.stringify({ usuarioId }) }),
  removeUserFromGrupo: (id: number, usuarioId: number) =>
    fetchApi(`/grupos/${id}/usuarios/${usuarioId}`, { method: 'DELETE' }),
}

// ============================================================
// LABELS E MAPAS (mantidos no frontend - sem necessidade de API)
// ============================================================
export const statusAtendimentoLabel: Record<StatusAtendimento, string> = {
  0: 'Atrasado',
  1: 'Na Fila',
  2: 'Em Atendimento',
  3: 'Aguardando Cliente',
  4: 'Aguardando Dev',
  5: 'Em Análise Dev',
  6: 'Aguardando Procedimento',
  7: 'Concluído',
  8: 'Cancelado',
  9: 'Aguardando Testes',
  10: 'Em Testes',
  11: 'Testado OK',
  12: 'Aprovado Dev',
  13: 'Em Desenvolvimento',
  14: 'Arquivados',
  15: 'Testado com Erro',
  16: 'Corrigido Dev',
}

export const departamentoColors: Record<string, string> = {
  Suporte: 'bg-blue-500/20 text-blue-400',
  Fiscal: 'bg-amber-500/20 text-amber-400',
  Financeiro: 'bg-green-500/20 text-green-400',
  Comercial: 'bg-purple-500/20 text-purple-400',
  Certificado: 'bg-orange-500/20 text-orange-400',
  CS: 'bg-cyan-500/20 text-cyan-400',
  Instalação: 'bg-pink-500/20 text-pink-400',
  Treinamento: 'bg-indigo-500/20 text-indigo-400',
  Técnico: 'bg-red-500/20 text-red-400',
}
