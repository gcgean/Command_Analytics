import type {
  Cliente, Atendimento, AgendaItem, Plano, Assinatura, PipelineItem,
  Negocio, Lead, AnaliseFinanceira, Comissao, Tarefa, Video, Meta,
  AvaliacaoNPS, MonitorAtendimento, Campanha, Contador, Versao, Servidor, EtapaCadastro,
  ChecklistCadastro, ImplantacaoChecklistDetalhe, ImplantacaoPainel, ImplantacaoConfiguracaoCliente, Usuario,
  StatusAtendimento, ProcedimentoCadastro
} from '../types'

// ============================================================
// CONFIGURAÇÃO BASE
// ============================================================
function normalizeApiBaseUrl(raw: string): string {
  try {
    const parsed = new URL(raw)
    const normalizedPath = parsed.pathname.replace(/\/+$/, '')
    if (normalizedPath === '' || normalizedPath === '/') {
      parsed.pathname = '/api'
    } else if (normalizedPath === '/api') {
      parsed.pathname = '/api'
    }
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

const BASE_URL = (() => {
  // 1) Query-string override: ?api=https://example.com/api
  if (typeof window !== 'undefined') {
    const qsApi = new URLSearchParams(window.location.search).get('api')
    if (qsApi) return normalizeApiBaseUrl(qsApi)
  }
  // 2) LocalStorage override (útil para testes): api_base_override
  const lsOverride = typeof window !== 'undefined' ? localStorage.getItem('api_base_override') : null
  if (lsOverride) return normalizeApiBaseUrl(lsOverride)
  // 3) VITE_API_URL (se definido)
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envUrl) {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && envUrl.startsWith('http://')) {
      // Em páginas HTTPS, evitar conteúdo misto
      return normalizeApiBaseUrl(envUrl.replace('http://', 'https://'))
    }
    return normalizeApiBaseUrl(envUrl)
  }
  // 4) Autodetecção por domínio
  if (typeof window !== 'undefined') {
    const { origin, hostname, protocol } = window.location
    // Ambiente local
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3333/api'
    }
    // Produção: usar o mesmo domínio com prefixo /api
    const base = `${origin}/api`
    // Se por alguma razão estiver em HTTP, manter; em HTTPS, já é seguro
    return base
  }
  // Fallback (build sem window)
  return 'http://localhost:3333/api'
})()

export const API_BASE_URL = BASE_URL

function getToken(): string | null {
  const directToken = localStorage.getItem('auth_token')
  if (directToken) return directToken

  // Fallback: token persistido no Zustand (evita chamadas sem token em sessões restauradas).
  const persistedAuth = localStorage.getItem('command-analytics-auth')
  if (!persistedAuth) return null

  try {
    const parsed = JSON.parse(persistedAuth) as { state?: { token?: string | null } }
    const restoredToken = parsed?.state?.token ?? null
    if (restoredToken) {
      localStorage.setItem('auth_token', restoredToken)
      return restoredToken
    }
  } catch {
    // ignore parse failure and proceed without token
  }

  return null
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const baseHeaders: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (options.body !== undefined) {
    baseHeaders['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...baseHeaders,
        ...options.headers,
      },
    })
  } catch (err: any) {
    throw new Error('Falha de conexão com a API. Verifique sua rede, CORS ou disponibilidade do servidor.')
  }
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
  health: async () => fetchApi('/health'),
  healthRaw: async () => {
    const token = getToken()
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    try {
      const res = await fetch(`${BASE_URL}/health`, { headers })
      return { ok: res.ok, status: res.status, statusText: res.statusText }
    } catch {
      return { ok: false, status: 0, statusText: 'network_error' }
    }
  },
  login: async (usuario: string, senha: string) => {
    const data = await fetchApi<{ token: string; user: Record<string, unknown> }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, senha }),
    })
    localStorage.setItem('auth_token', data.token)
    return { user: data.user, token: data.token }
  },
  refreshToken: async () => {
    const data = await fetchApi<{ token: string; user: Record<string, unknown> }>('/auth/refresh', {
      method: 'POST',
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
  getClientes: (params?: { status?: string; segmento?: string; curvaABC?: string; search?: string; contadorId?: string; page?: string; limit?: string }) => {
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

  // ─── Auditoria ─────────────────────────────────────────────
  getAuditoria: (tabela: string, registroId: number) =>
    fetchApi<any[]>(`/auditoria?tabela=${tabela}&registroId=${registroId}`),

  // ─── Disponibilidade de Técnicos ───────────────────────────────
  getDisponibilidades: () => fetchApi<any[]>('/agenda/disponibilidade'),
  saveDisponibilidade: (data: {
    tecnicoId: number
    diasSemana: string
    horaInicio: string
    horaFim: string
    intervaloMin: number
    dataInicio?: string | null
    dataFim?: string | null
    intervaloIni?: string | null
    intervaloFim?: string | null
    diasConfiguracao?: Array<{
      diaSemana: number
      horaInicio: string
      horaFim: string
      intervaloMin: number
      intervaloIni?: string | null
      intervaloFim?: string | null
    }>
  }) =>
    fetchApi('/agenda/disponibilidade', { method: 'POST', body: JSON.stringify(data) }),
  deleteDisponibilidade: (tecnicoId: number) => fetchApi(`/agenda/disponibilidade/${tecnicoId}`, { method: 'DELETE' }),
  getSlots: (params: Record<string, string>) =>
    fetchApi<any[]>(`/agenda/slots?${new URLSearchParams(params).toString()}`),
  getAgendamentosProg: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<any[]>(`/agenda/agendamentos-prog${qs}`)
  },
  validarDuracaoAgendamentoProg: (data: { tecnicoId: number; data: string; horaInicio: string; duracao: number; agendamentoIdIgnorar?: number | null }) =>
    fetchApi<{ ok: boolean }>('/agenda/agendamentos-prog/validar-duracao', { method: 'POST', body: JSON.stringify(data) }),
  createAgendamentoProg: (data: { tecnicoId: number; clienteId?: number; procedimentoId: number; data: string; horaInicio: string; duracao?: number; descricao?: string }) =>
    fetchApi('/agenda/agendamentos-prog', { method: 'POST', body: JSON.stringify(data) }),
  cancelAgendamentoProg: (id: number) => fetchApi(`/agenda/agendamentos-prog/${id}`, { method: 'DELETE' }),
  updateAgendamentoProg: (id: number, data: { tecnicoId?: number; clienteId?: number | null; procedimentoId?: number | null; data?: string; horaInicio?: string; duracao?: number; descricao?: string | null }) =>
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
  getImplantacaoPainel: (params?: { search?: string; status?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.status) searchParams.set('status', params.status)
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<ImplantacaoPainel>(`/pipeline/implantacao/painel${qs}`)
  },
  getImplantacaoChecklist: (clienteId: number, status?: number) =>
    fetchApi<ImplantacaoChecklistDetalhe>(`/pipeline/implantacao/${clienteId}/checklist${status ? `?status=${status}` : ''}`),
  getImplantacaoConfiguracao: (clienteId: number) =>
    fetchApi<ImplantacaoConfiguracaoCliente>(`/pipeline/implantacao/${clienteId}/configuracao`),
  updateImplantacaoConfiguracao: (
    clienteId: number,
    data: { statusInstal?: number; responsavelId?: number | null; checklistIds?: number[]; observacao?: string }
  ) => fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/configuracao`, { method: 'PUT', body: JSON.stringify(data) }),
  updateImplantacaoStatus: (clienteId: number, status: number, observacao?: string) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/status`, { method: 'PATCH', body: JSON.stringify({ status, observacao }) }),
  updateImplantacaoResponsavel: (clienteId: number, responsavelId: number | null, observacao?: string) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/responsavel`, { method: 'PATCH', body: JSON.stringify({ responsavelId, observacao }) }),
  marcarItemChecklistImplantacao: (clienteId: number, data: { checklistId: number; itemIndex: number; marcado: boolean; observacao?: string }) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/checklist`, { method: 'PATCH', body: JSON.stringify(data) }),
  transicaoImplantacao: (clienteId: number, data: {
    statusDestino: number
    observacao?: string
    checklist?: Array<{ checklistId: number; itemIndex: number; marcado: boolean; observacao?: string }>
  }) => fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/transicao`, { method: 'PATCH', body: JSON.stringify(data) }),
  addImplantacaoObservacao: (clienteId: number, observacao: string) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/observacao`, { method: 'POST', body: JSON.stringify({ observacao }) }),

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
  getVideos: (params?: { page?: string; limit?: string; categoriaId?: string; tipo?: string; search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi(`/videos${qs}`)
  },
  createVideo: (data: Partial<Video>) =>
    fetchApi<Video>('/videos', { method: 'POST', body: JSON.stringify(data) }),
  visualizarVideo: (id: number) => fetchApi(`/videos/${id}/visualizar`, { method: 'POST' }),

  // ─── Metas / NPS ───────────────────────────────────────────
  getMetas: () => fetchApi<Meta[]>('/metas'),
  getNPS: () => fetchApi<AvaliacaoNPS[]>('/metas/nps'),
  getNPSKpi: () => fetchApi('/metas/nps/kpi'),
  getMetasComercial: (mes?: string) => fetchApi(`/metas/comercial${mes ? `?mes=${mes}` : ''}`),
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
  getContadores: (params?: { page?: string; limit?: string; search?: string; cidade?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi(`/contadores${qs}`)
  },
  getContador: (id: number) => fetchApi(`/contadores/${id}`),
  createContador: (data: Partial<Contador> | Record<string, unknown>) =>
    fetchApi('/contadores', { method: 'POST', body: JSON.stringify(data) }),
  updateContador: (id: number, data: Partial<Contador> | Record<string, unknown>) =>
    fetchApi(`/contadores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Versões ───────────────────────────────────────────────
  getVersoes: () => fetchApi<Versao[]>('/versoes'),
  createVersao: (data: Partial<Versao>) =>
    fetchApi<Versao>('/versoes', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Servidores ────────────────────────────────────────────
  getServidores: () => fetchApi<Servidor[]>('/servidores'),

  // ─── Usuários ──────────────────────────────────────────────
  getUsuarios: () => fetchApi<Usuario[]>('/usuarios'),
  getUsuariosTodos: () => fetchApi<Usuario[]>('/usuarios/todos'),
  createUsuario: (data: Partial<Usuario> & { senha?: string }) =>
    fetchApi<Usuario>('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  updateUsuario: (id: number, data: Partial<Usuario> & { senha?: string }) =>
    fetchApi<Usuario>(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleUsuario: (id: number) => fetchApi<Usuario>(`/usuarios/${id}/toggle`, { method: 'PATCH' }),

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

  // ─── Telegram ──────────────────────────────────────────────
  getTelegramConfig: () => fetchApi<any>('/telegram/config'),
  updateTelegramConfig: (data: any) =>
    fetchApi('/telegram/config', { method: 'PUT', body: JSON.stringify(data) }),
  sendTelegramMessage: (data: { userId: string; mensagem: string }) =>
    fetchApi('/telegram/enviar', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Cadastro de Etapas ───────────────────────────────────
  getEtapas: (params?: { tela?: string; ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<EtapaCadastro[]>(`/etapas${qs}`)
  },
  getEtapasTelas: () => fetchApi<Array<{ id: string; label: string }>>('/etapas/telas'),
  createEtapa: (data: { nome: string; cor: string; telas: string[]; ordem?: number; ativo?: boolean }) =>
    fetchApi<{ id: number }>('/etapas', { method: 'POST', body: JSON.stringify(data) }),
  updateEtapa: (id: number, data: { nome: string; cor: string; telas: string[]; ordem?: number; ativo?: boolean }) =>
    fetchApi(`/etapas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleEtapa: (id: number) => fetchApi<{ ok: boolean; ativo: boolean }>(`/etapas/${id}/toggle`, { method: 'PATCH' }),
  deleteEtapa: (id: number) => fetchApi(`/etapas/${id}`, { method: 'DELETE' }),

  // ─── Cadastro de Checklists ───────────────────────────────
  getChecklists: (params?: { tela?: string; ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<ChecklistCadastro[]>(`/checklists${qs}`)
  },
  getChecklistsTelas: () => fetchApi<Array<{ id: string; label: string }>>('/checklists/telas'),
  createChecklist: (data: { nome: string; descricao?: string; itens: string[]; etapas?: string[]; telas: string[]; ordem?: number; ativo?: boolean }) =>
    fetchApi<{ id: number }>('/checklists', { method: 'POST', body: JSON.stringify(data) }),
  updateChecklist: (id: number, data: { nome: string; descricao?: string; itens: string[]; etapas?: string[]; telas: string[]; ordem?: number; ativo?: boolean }) =>
    fetchApi(`/checklists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleChecklist: (id: number) => fetchApi<{ ok: boolean; ativo: boolean }>(`/checklists/${id}/toggle`, { method: 'PATCH' }),
  deleteChecklist: (id: number) => fetchApi(`/checklists/${id}`, { method: 'DELETE' }),

  // ─── Cadastro de Procedimentos ───────────────────────────
  getProcedimentos: (params?: { ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<ProcedimentoCadastro[]>(`/procedimentos${qs}`)
  },
  createProcedimento: (data: { nome: string; descricao?: string; duracaoMin?: number; ordem?: number; ativo?: boolean }) =>
    fetchApi<{ id: number }>('/procedimentos', { method: 'POST', body: JSON.stringify(data) }),
  updateProcedimento: (id: number, data: { nome: string; descricao?: string; duracaoMin?: number; ordem?: number; ativo?: boolean }) =>
    fetchApi(`/procedimentos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleProcedimento: (id: number) => fetchApi<{ ok: boolean; ativo: boolean }>(`/procedimentos/${id}/toggle`, { method: 'PATCH' }),
  deleteProcedimento: (id: number) => fetchApi(`/procedimentos/${id}`, { method: 'DELETE' }),
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
