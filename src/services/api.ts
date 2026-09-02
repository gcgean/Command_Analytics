import type {
  Cliente, Atendimento, AgendaItem, Plano, Assinatura, PipelineItem,
  Negocio, Lead, AnaliseFinanceira, AnaliseFaturamento, LancamentoBancoHoras, TipoMovimentoBancoHoras, Comissao, Tarefa, Video, Meta,
  AvaliacaoNPS, MonitorAtendimento, Campanha, Contador, Versao, Servidor, Conexao, ConexoesResposta, EtapaCadastro,
  ChecklistCadastro, ServicoCadastro, ImplantacaoChecklistDetalhe, ImplantacaoPainel, ImplantacaoConfiguracaoCliente, ImplantacaoConcluidosResposta, Usuario,
  StatusAtendimento, ProcedimentoCadastro, ClienteAnexo, ConfiguracaoNotificacaoAgendamento, NotificacaoPlataforma,
  StatusProcessamentoNotificacaoAgendamento, TipoMetaCadastro, MetaCadastroItem, CertificadoDigitalItem, CertificadoDigitalGraficoItem,
  DashboardMensalidadesAbc, DashboardMensalidadesAgrupamento, DashboardMensalidadesConcentracao,
  DashboardMensalidadesEstatisticas, DashboardMensalidadesFaixa, DashboardMensalidadesFiltros,
  DashboardMensalidadesOpcoesFiltros, DashboardMensalidadesRanking, DashboardMensalidadesResumo,
  DesempenhoEquipe, Operadora, ClienteMaquininha, MaquininhasRelatorio, TipoMaquininha, StatusMaquininha,
  ClientesSemMaquininhaResposta, LembretesFixosResposta, TipoRecorrenciaLembrete, Solicitacao
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

type PaginatedResponse<T> = {
  total: number
  page: number
  limit: number
  pages: number
  data: T[]
}

const DEFAULT_TIMEOUT_MS = (() => {
  const raw = (import.meta.env as any)['VITE_API_TIMEOUT_MS'] as string | undefined
  const ms = raw ? Number(raw) : 20000
  return Number.isFinite(ms) && ms > 0 ? ms : 20000
})()

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

function isAbortError(err: unknown): boolean {
  const anyErr = err as any
  if (!anyErr) return false
  if (anyErr.name === 'AbortError') return true
  const message = String(anyErr?.message ?? '')
  return message.toLowerCase().includes('aborted')
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const externalSignal = init.signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (err: any) {
    if (isAbortError(err)) {
      throw new Error('Tempo limite excedido ao conectar na API. Tente novamente.')
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const baseHeaders: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (options.body !== undefined && typeof options.body === 'string') {
    baseHeaders['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetchWithTimeout(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...baseHeaders,
        ...options.headers,
      },
    })
  } catch (err: any) {
    if (String(err?.message ?? '').toLowerCase().includes('tempo limite')) {
      throw err
    }
    throw new Error('Falha de conexão com a API. Verifique sua rede, CORS ou disponibilidade do servidor.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status} ${res.statusText || ''}`.trim() }))
    const backendError = typeof err?.error === 'string' ? err.error.trim() : ''
    const backendMessage = typeof err?.message === 'string' ? err.message.trim() : ''
    const genericErrors = new Set(['Internal Server Error', 'Erro desconhecido'])
    const message =
      backendMessage && (!backendError || genericErrors.has(backendError))
        ? backendMessage
        : backendError || backendMessage || `HTTP ${res.status}`
    const erroApi = new Error(message) as Error & { status?: number; details?: any }
    erroApi.status = res.status
    erroApi.details = err
    throw erroApi
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
      const res = await fetchWithTimeout(`${BASE_URL}/health`, { headers })
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
  getDesempenhoEquipe: (meses = 12) => fetchApi<DesempenhoEquipe>(`/dashboard/desempenho-equipe?meses=${meses}`),
  getDashboardMensalidadesResumo: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<DashboardMensalidadesResumo>(`/dashboard/mensalidades/resumo${qs}`)
  },
  getDashboardMensalidadesFaixas: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<DashboardMensalidadesFaixa[]>(`/dashboard/mensalidades/faixas${qs}`)
  },
  getDashboardMensalidadesAbc: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<DashboardMensalidadesAbc>(`/dashboard/mensalidades/abc${qs}`)
  },
  getDashboardMensalidadesConcentracao: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<DashboardMensalidadesConcentracao>(`/dashboard/mensalidades/concentracao${qs}`)
  },
  getDashboardMensalidadesEstatisticas: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<DashboardMensalidadesEstatisticas>(`/dashboard/mensalidades/estatisticas${qs}`)
  },
  getDashboardMensalidadesRankings: (params: DashboardMensalidadesFiltros & { tipo: string; page?: string; limit?: string }) => {
    const qs = '?' + new URLSearchParams(params as unknown as Record<string, string>).toString()
    return fetchApi<DashboardMensalidadesRanking>(`/dashboard/mensalidades/rankings${qs}`)
  },
  getDashboardMensalidadesAgrupamentos: (params: DashboardMensalidadesFiltros & { agruparPor: string }) => {
    const qs = '?' + new URLSearchParams(params as unknown as Record<string, string>).toString()
    return fetchApi<DashboardMensalidadesAgrupamento[]>(`/dashboard/mensalidades/agrupamentos${qs}`)
  },
  getDashboardMensalidadesInsights: (params?: DashboardMensalidadesFiltros) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<string[]>(`/dashboard/mensalidades/insights${qs}`)
  },
  getDashboardMensalidadesOpcoes: () => fetchApi<DashboardMensalidadesOpcoesFiltros>('/dashboard/mensalidades/opcoes'),

  // ─── Clientes ──────────────────────────────────────────────
  getClientes: (params?: { status?: string; segmento?: string; curvaABC?: string; search?: string; contadorId?: string; page?: string; limit?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<Cliente[]>(`/clientes${qs}`)
  },
  getClientesPaged: (params: {
    page: number
    limit: number
    search?: string
    ativo?: string
    bloqueado?: string
    curvaABC?: string
    codCla?: string
    contadorId?: string
    semMaquininha?: boolean
    somenteBeta?: boolean
  }, options?: RequestInit) => {
    const qs = '?' + new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      ...(params.search ? { search: params.search } : {}),
      ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
      ...(params.bloqueado !== undefined ? { bloqueado: params.bloqueado } : {}),
      ...(params.curvaABC ? { curvaABC: params.curvaABC } : {}),
      ...(params.codCla ? { codCla: params.codCla } : {}),
      ...(params.contadorId ? { contadorId: params.contadorId } : {}),
      ...(params.semMaquininha ? { semMaquininha: 'true' } : {}),
      ...(params.somenteBeta ? { somenteBeta: 'true' } : {}),
    }).toString()
    return fetchApi<PaginatedResponse<Cliente>>(`/clientes${qs}`, options)
  },
  getSegmentos: () => fetchApi<Array<{ id: number; descricao: string }>>('/segmentos'),
  getClassificacoes: (options?: RequestInit) => fetchApi<Array<{ id: number; nome: string | null }>>('/classificacoes', options),
  getClienteById: (id: number, options?: RequestInit) => fetchApi<Cliente>(`/clientes/${id}`, options),
  createCliente: (data: Partial<Cliente>) => fetchApi<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  updateCliente: (id: number, data: Partial<Cliente>) => fetchApi<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateClienteProntuario: (id: number, data: { observacoes: string; baseObservacoes?: string }) =>
    fetchApi<Cliente>(`/clientes/${id}/prontuario`, { method: 'PUT', body: JSON.stringify(data) }),
  getMonitorClientes: () => fetchApi('/clientes/monitor/resumo'),
  toggleClienteBeta: (id: number) => fetchApi<Cliente>(`/clientes/${id}/beta`, { method: 'PATCH' }),

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
  notifyAgendaItem: (id: number) =>
    fetchApi<{ ok: boolean }>(`/agenda/${id}/notificar`, { method: 'POST' }),
  updateAgendaStatus: (id: number, status: number) =>
    fetchApi<AgendaItem>(`/agenda/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateAgendaNota: (id: number, nota: string) =>
    fetchApi<AgendaItem>(`/agenda/${id}/nota`, { method: 'PATCH', body: JSON.stringify({ nota }) }),
  updateAgendaItem: (id: number, data: Partial<AgendaItem>) =>
    fetchApi<AgendaItem>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgendaItem: (id: number) => fetchApi(`/agenda/${id}`, { method: 'DELETE' }),

  // ─── Anexos (Agenda / Agendamentos Programados) ─────────────
  listAnexos: (params: { tabela: 'agenda' | 'agendamento_programado' | 'cliente_prontuario' | 'banco_de_horas' | 'atendimentos'; registroId: number }) => {
    const qs = '?' + new URLSearchParams({ tabela: params.tabela, registroId: String(params.registroId) }).toString()
    return fetchApi<ClienteAnexo[]>(`/anexos${qs}`)
  },
  uploadAnexos: async (params: { tabela: 'agenda' | 'agendamento_programado' | 'cliente_prontuario' | 'banco_de_horas' | 'atendimentos'; registroId: number; files: File[]; onProgress?: (percent: number) => void }) => {
    const qs = '?' + new URLSearchParams({ tabela: params.tabela, registroId: String(params.registroId) }).toString()
    const fd = new FormData()
    for (const file of params.files) fd.append('files', file)

    const token = getToken()

    return await new Promise<ClienteAnexo[]>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/anexos${qs}`)
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return
        const percent = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)))
        params.onProgress?.(percent)
      }

      xhr.onload = () => {
        try {
          if (xhr.status < 200 || xhr.status >= 300) {
            const parsed = JSON.parse(xhr.responseText || '{}')
            reject(new Error(parsed?.error || `HTTP ${xhr.status}`))
            return
          }
          const parsed = JSON.parse(xhr.responseText || '[]')
          resolve(parsed)
        } catch {
          reject(new Error('Resposta inválida do servidor.'))
        }
      }

      xhr.onerror = () => reject(new Error('Falha de rede ao enviar anexos.'))
      xhr.send(fd)
    })
  },
  deleteAnexo: (id: number) => fetchApi(`/anexos/${id}`, { method: 'DELETE' }),
  getAnexoBlob: async (id: number, opts?: { download?: boolean }) => {
    const token = getToken()
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    const download = opts?.download !== false
    const res = await fetch(`${BASE_URL}/anexos/${id}/download?download=${download ? '1' : '0'}`, { headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.blob()
  },

  // ─── Auditoria ─────────────────────────────────────────────
  getAuditoria: (tabela: string, registroId: number) =>
    fetchApi<any[]>(`/auditoria?tabela=${tabela}&registroId=${registroId}`),

  // ─── Maquininhas de cartão ──────────────────────────────────
  getOperadoras: () => fetchApi<Operadora[]>('/maquininhas/operadoras'),
  getMaquininhasCliente: (clienteId: number) =>
    fetchApi<ClienteMaquininha[]>(`/maquininhas?clienteId=${clienteId}`),
  createMaquininha: (data: { clienteId: number; operadoraId: number; tipo: TipoMaquininha; quantidade: number; statusIntegracao: StatusMaquininha; observacao?: string }) =>
    fetchApi<{ ok: boolean; id: number }>('/maquininhas', { method: 'POST', body: JSON.stringify(data) }),
  updateMaquininha: (id: number, data: Partial<{ operadoraId: number; tipo: TipoMaquininha; quantidade: number; statusIntegracao: StatusMaquininha; observacao: string }>) =>
    fetchApi<{ ok: boolean }>(`/maquininhas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMaquininha: (id: number) => fetchApi<{ ok: boolean }>(`/maquininhas/${id}`, { method: 'DELETE' }),
  getMaquininhasRelatorio: (params?: { operadoraId?: number; tipo?: TipoMaquininha; statusIntegracao?: StatusMaquininha }) => {
    const qs = new URLSearchParams()
    if (params?.operadoraId) qs.set('operadoraId', String(params.operadoraId))
    if (params?.tipo) qs.set('tipo', params.tipo)
    if (params?.statusIntegracao) qs.set('statusIntegracao', params.statusIntegracao)
    const s = qs.toString()
    return fetchApi<MaquininhasRelatorio>(`/maquininhas/relatorio${s ? `?${s}` : ''}`)
  },
  getClientesSemMaquininha: (params?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize))
    const s = qs.toString()
    return fetchApi<ClientesSemMaquininhaResposta>(`/maquininhas/sem-cadastro${s ? `?${s}` : ''}`)
  },

  // ─── Banco de Horas ──────────────────────────────────────────
  getBancoHoras: () => fetchApi<LancamentoBancoHoras[]>('/banco-horas'),
  createLancamentoBancoHoras: (data: {
    funcionarioId: number; tipo: TipoMovimentoBancoHoras; horas: number
    dataInicio: string; dataFim: string; observacao: string
  }) => fetchApi<{ ok: boolean; id: number }>('/banco-horas', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Lembretes fixos recorrentes ────────────────────────────
  getLembretesFixos: () => fetchApi<LembretesFixosResposta>('/lembretes-fixos'),
  createLembreteFixo: (data: {
    usuarioId: number; titulo: string; mensagem: string; tipoRecorrencia: TipoRecorrenciaLembrete
    intervaloDias?: number; diaMes?: number; diaSemana?: number; hora: string; somenteUsuarioVisualizar?: boolean
  }) => fetchApi<{ ok: boolean; id: number }>('/lembretes-fixos', { method: 'POST', body: JSON.stringify(data) }),
  updateLembreteFixo: (id: number, data: Partial<{
    usuarioId: number; titulo: string; mensagem: string; tipoRecorrencia: TipoRecorrenciaLembrete
    intervaloDias: number; diaMes: number; diaSemana: number; hora: string; somenteUsuarioVisualizar: boolean; ativo: boolean
  }>) => fetchApi<{ ok: boolean }>(`/lembretes-fixos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLembreteFixo: (id: number) => fetchApi<{ ok: boolean }>(`/lembretes-fixos/${id}`, { method: 'DELETE' }),
  deleteLinhasLembreteLegado: (ids: number[]) =>
    fetchApi<{ ok: boolean; removidos: number }>('/lembretes-fixos/linhas', { method: 'DELETE', body: JSON.stringify({ ids }) }),

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
  createAgendamentoProg: (data: { tecnicoId: number; clienteId?: number; procedimentoId: number; data: string; horaInicio: string; duracao?: number; descricao?: string; temAnexos?: boolean; tipo?: string }) =>
    fetchApi('/agenda/agendamentos-prog', { method: 'POST', body: JSON.stringify(data) }),
  notifyAgendamentoProg: (id: number) =>
    fetchApi<{ ok: boolean }>(`/agenda/agendamentos-prog/${id}/notificar`, { method: 'POST' }),
  cancelAgendamentoProg: (id: number) => fetchApi(`/agenda/agendamentos-prog/${id}`, { method: 'DELETE' }),
  updateAgendamentoProg: (id: number, data: { tecnicoId?: number; clienteId?: number | null; procedimentoId?: number | null; data?: string; horaInicio?: string; duracao?: number; descricao?: string | null; tipo?: string | null }) =>
    fetchApi(`/agenda/agendamentos-prog/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateAgendamentoProgStatus: (id: number, status: number) =>
    fetchApi(`/agenda/agendamentos-prog/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateAgendamentoProgNota: (id: number, nota: string) =>
    fetchApi(`/agenda/agendamentos-prog/${id}/nota`, { method: 'PATCH', body: JSON.stringify({ nota }) }),

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
  getImplantacaoPainel: (params?: { search?: string; status?: string; dataCadastroInicial?: string; dataCadastroFinal?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.dataCadastroInicial) searchParams.set('dataCadastroInicial', params.dataCadastroInicial)
    if (params?.dataCadastroFinal) searchParams.set('dataCadastroFinal', params.dataCadastroFinal)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<ImplantacaoPainel>(`/pipeline/implantacao/painel${qs}`)
  },
  getImplantacaoChecklist: (clienteId: number, status?: number, processoId?: number) => {
    const params = new URLSearchParams()
    if (status) params.set('status', String(status))
    if (processoId) params.set('processoId', String(processoId))
    const qs = params.toString()
    return fetchApi<ImplantacaoChecklistDetalhe>(`/pipeline/implantacao/${clienteId}/checklist${qs ? `?${qs}` : ''}`)
  },
  getImplantacaoConfiguracao: (clienteId: number, processoId?: number) =>
    fetchApi<ImplantacaoConfiguracaoCliente>(`/pipeline/implantacao/${clienteId}/configuracao${processoId ? `?processoId=${processoId}` : ''}`),
  updateImplantacaoConfiguracao: (
    clienteId: number,
    data: { statusInstal?: number; responsavelId?: number | null; checklistIds?: number[]; observacao?: string; processoId?: number; servicoId?: number | null; dataLimite?: string | null }
  ) => fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/configuracao`, { method: 'PUT', body: JSON.stringify(data) }),
  getImplantacaoResponsaveis: () => fetchApi<Array<{ id: number; nome: string }>>('/pipeline/implantacao/responsaveis'),
  desativarProcessoImplantacao: (clienteId: number, processoId: number) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/processos/${processoId}/desativar`, { method: 'PATCH' }),
  updateImplantacaoStatus: (clienteId: number, status: number, observacao?: string, processoId?: number) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/status`, { method: 'PATCH', body: JSON.stringify({ status, observacao, processoId }) }),
  updateImplantacaoResponsavel: (clienteId: number, responsavelId: number | null, observacao?: string, processoId?: number) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/responsavel`, { method: 'PATCH', body: JSON.stringify({ responsavelId, observacao, processoId }) }),
  marcarItemChecklistImplantacao: (clienteId: number, data: { checklistId: number; itemIndex: number; marcado: boolean; observacao?: string; processoId?: number }) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/checklist`, { method: 'PATCH', body: JSON.stringify(data) }),
  transicaoImplantacao: (clienteId: number, data: {
    statusDestino: number
    observacao?: string
    checklist?: Array<{ checklistId: number; itemIndex: number; marcado: boolean; observacao?: string }>
    processoId?: number
    responsavelId?: number | null
  }) => fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/transicao`, { method: 'PATCH', body: JSON.stringify(data) }),
  addImplantacaoObservacao: (clienteId: number, observacao: string, processoId?: number) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/observacao`, { method: 'POST', body: JSON.stringify({ observacao, processoId }) }),
  criarProcessoImplantacao: (data: { clienteId: number; tipo: 'novo_cliente' | 'novo_servico'; titulo: string; servicoId?: number | null; statusInstal?: number; responsavelId?: number | null; observacao?: string; checklistIds?: number[]; criadoPorId?: number | null }) =>
    fetchApi<{ ok: boolean; processoId: number }>('/pipeline/implantacao/processos', { method: 'POST', body: JSON.stringify(data) }),
  getImplantacaoConcluidos: (params?: { search?: string; situacao?: string; responsavelId?: number; dataInicial?: string; dataFinal?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.situacao && params.situacao !== 'all') searchParams.set('situacao', params.situacao)
    if (params?.responsavelId) searchParams.set('responsavelId', String(params.responsavelId))
    if (params?.dataInicial) searchParams.set('dataInicial', params.dataInicial)
    if (params?.dataFinal) searchParams.set('dataFinal', params.dataFinal)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<ImplantacaoConcluidosResposta>(`/pipeline/implantacao/concluidos${qs}`)
  },
  reabrirProcessoImplantacao: (clienteId: number, processoId: number, data: { statusDestino: number; motivo: string }) =>
    fetchApi<{ ok: boolean }>(`/pipeline/implantacao/${clienteId}/processos/${processoId}/reabrir`, { method: 'PATCH', body: JSON.stringify(data) }),

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
  getAnaliseFaturamento: (meses = 6) => fetchApi<AnaliseFaturamento>(`/faturamento/analise?meses=${meses}`),

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
  getTiposMeta: () => fetchApi<TipoMetaCadastro[]>('/metas/tipos'),
  createTipoMeta: (data: Partial<TipoMetaCadastro>) =>
    fetchApi<TipoMetaCadastro>('/metas/tipos', { method: 'POST', body: JSON.stringify(data) }),
  updateTipoMeta: (id: number, data: Partial<TipoMetaCadastro>) =>
    fetchApi(`/metas/tipos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getMetasCadastro: () => fetchApi<MetaCadastroItem[]>('/metas/cadastro'),
  createMetaCadastro: (data: {
    nome?: string
    descricao?: string
    tipoMetaId?: number | null
    setorResponsavel?: string
    valorMeta?: number
    competencia?: string
    ativo?: boolean
    usuariosVisualizacao?: number[]
  }) =>
    fetchApi('/metas/cadastro', { method: 'POST', body: JSON.stringify(data) }),
  updateMetaCadastro: (id: number, data: {
    nome?: string
    descricao?: string
    tipoMetaId?: number | null
    setorResponsavel?: string
    valorMeta?: number
    competencia?: string
    ativo?: boolean
    usuariosVisualizacao?: number[]
  }) =>
    fetchApi(`/metas/cadastro/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
  getCertificadosDigitais: (params?: { dataIni?: string; dataFin?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, value]) => !!value) as [string, string][]).toString() : ''
    return fetchApi<CertificadoDigitalItem[]>(`/certificados/listagem${qs}`)
  },
  getCertificadosDigitaisGrafico: () => fetchApi<CertificadoDigitalGraficoItem[]>('/certificados/proximos-12-meses'),
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
  getServidor: (id: number) => fetchApi<Servidor>(`/servidores/${id}`),
  verificarServidorAgora: (id: number) => fetchApi<Servidor>(`/servidores/${id}/verificar-agora`, { method: 'POST' }),
  toggleServidorSomenteAdmin: (id: number) => fetchApi<Servidor>(`/servidores/${id}/somente-admin`, { method: 'PATCH' }),

  // ─── Conexões ──────────────────────────────────────────────
  getConexoes: (params?: { servidorId?: number; search?: string; status?: string; force?: boolean }) => {
    const qs = params
      ? '?' + new URLSearchParams({
          ...(params.servidorId ? { servidorId: String(params.servidorId) } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.status ? { status: params.status } : {}),
          ...(params.force ? { force: 'true' } : {}),
        }).toString()
      : ''
    return fetchApi<ConexoesResposta>(`/connections${qs}`)
  },
  getSaudeConexao: (servidorId: number, connectionId: string) =>
    fetchApi<{ id: string; name: string; status: string; ok: boolean; checkedAt?: string }>(
      `/connections/saude?servidorId=${servidorId}&connectionId=${encodeURIComponent(connectionId)}`
    ),
  // ─── Mapa de Solicitações (setor de desenvolvimento) ───
  getSolicitacoesSuporte: (params?: { status?: number[]; tecnicoId?: number[]; desenvolvedorId?: number[]; busca?: string; prioritario?: boolean }) => {
    const qs = params
      ? '?' + new URLSearchParams({
          ...(params.status?.length ? { status: params.status.join(',') } : {}),
          ...(params.tecnicoId?.length ? { tecnicoId: params.tecnicoId.join(',') } : {}),
          ...(params.desenvolvedorId?.length ? { desenvolvedorId: params.desenvolvedorId.join(',') } : {}),
          ...(params.busca ? { busca: params.busca } : {}),
          ...(params.prioritario ? { prioritario: 'true' } : {}),
        }).toString()
      : ''
    return fetchApi<{ total: number; data: Solicitacao[] }>(`/solicitacoes/suporte${qs}`)
  },
  getSolicitacoesFinalizadas: (dataInicio: string, dataFim: string) =>
    fetchApi<{ total: number; data: Solicitacao[] }>(
      `/solicitacoes/finalizadas?dataInicio=${dataInicio}&dataFim=${dataFim}`
    ),
  getNotasAtualizacao: (dataInicio: string, dataFim: string) =>
    fetchApi<{ total: number; texto: string }>(`/solicitacoes/notas-atualizacao?dataInicio=${dataInicio}&dataFim=${dataFim}`),
  getSolicitacaoLog: (id: number) =>
    fetchApi<{ data: Array<{ obs: string; data: string; usuario: string | null }> }>(`/solicitacoes/${id}/log`),
  alterarStatusSolicitacao: (id: number, status: number, observacao?: string) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, observacao }),
    }),
  vincularDesenvolvedor: (id: number, desenvolvedorId: number | null) =>
    fetchApi<{ ok: boolean; desenvolvedorNome: string | null }>(`/solicitacoes/${id}/desenvolvedor`, {
      method: 'PATCH',
      body: JSON.stringify({ desenvolvedorId }),
    }),
  togglePrioritarioSolicitacao: (id: number) =>
    fetchApi<{ ok: boolean; prioritario: boolean }>(`/solicitacoes/${id}/prioritario`, { method: 'PATCH' }),
  toggleOrientacaoSolicitacao: (id: number) =>
    fetchApi<{ ok: boolean; somenteOrientacao: boolean }>(`/solicitacoes/${id}/orientacao`, { method: 'PATCH' }),
  criarSolicitacao: (data: {
    clienteId: number; observacoes: string; status: number; tipoContato?: number
    tecnicoId?: number | null; desenvolvedorId?: number | null
    urgente?: boolean; foraHorario?: boolean; bugSistema?: boolean
  }) => fetchApi<{ ok: boolean; id: number }>('/solicitacoes', { method: 'POST', body: JSON.stringify(data) }),
  atualizarSolicitacao: (id: number, data: Record<string, unknown>) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  finalizarSolicitacao: (id: number, solucao: string) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}/finalizar`, { method: 'POST', body: JSON.stringify({ solucao }) }),
  getCatalogoProcedimentos: () =>
    fetchApi<{ data: Array<{ id: number; descricao: string; pontuacao: number }> }>('/solicitacoes/procedimentos'),
  getProcedimentosSolicitacao: (id: number) =>
    fetchApi<{ data: Array<{ id: number; descricao: string; pontuacao: number; data: string }> }>(`/solicitacoes/${id}/procedimentos`),
  addProcedimentoSolicitacao: (id: number, procedimentoId: number) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}/procedimentos`, { method: 'POST', body: JSON.stringify({ procedimentoId }) }),
  removeProcedimentoSolicitacao: (id: number, procedimentoId: number) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}/procedimentos/${procedimentoId}`, { method: 'DELETE' }),

  cancelarSolicitacao: (id: number, motivo: string) =>
    fetchApi<{ ok: boolean }>(`/solicitacoes/${id}/cancelar`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),

  executarAcaoConexao: (servidorId: number, connectionId: string, acao: 'abrir' | 'reiniciar' | 'fechar', connectionName?: string) =>
    fetchApi<{ ok: boolean }>('/connections/acao', {
      method: 'POST',
      body: JSON.stringify({ servidorId, connectionId, connectionName, acao }),
    }),
  toggleConexaoSomenteAdmin: (servidorId: number, connectionId: string) =>
    fetchApi<{ somenteAdmin: boolean }>('/connections/visibilidade', {
      method: 'POST',
      body: JSON.stringify({ servidorId, connectionId }),
    }),

  // ─── Usuários ──────────────────────────────────────────────
  getUsuarios: () => fetchApi<Usuario[]>('/usuarios'),
  getUsuariosTodos: () => fetchApi<Usuario[]>('/usuarios/todos'),
  createUsuario: (data: Partial<Usuario> & { senha?: string }) =>
    fetchApi<Usuario>('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  updateUsuario: (id: number, data: Partial<Usuario> & { senha?: string }) =>
    fetchApi<Usuario>(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleUsuario: (id: number) => fetchApi<Usuario>(`/usuarios/${id}/toggle`, { method: 'PATCH' }),
  gerarCodigoTelegramUsuario: (id: number) =>
    fetchApi<{ codigo: string; botUsername: string | null; expiraEm: number }>(`/usuarios/${id}/telegram/gerar-codigo`, { method: 'POST' }),
  statusTelegramUsuario: (id: number) =>
    fetchApi<{ idTelegram: string | null }>(`/usuarios/${id}/telegram/status`),
  desconectarTelegramUsuario: (id: number) =>
    fetchApi<{ ok: boolean }>(`/usuarios/${id}/telegram/desconectar`, { method: 'POST' }),

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

  // ─── Assistente de IA ────────────────────────────────────────
  getAssistenteStatus: () => fetchApi<{ disponivel: boolean }>('/assistente/status'),
  conversarAssistente: (historico: Array<{ papel: 'user' | 'assistant'; conteudo: string }>) =>
    fetchApi<{ texto: string; proposta: { ferramenta: string; dados: Record<string, any> } | null }>(
      '/assistente/conversar',
      { method: 'POST', body: JSON.stringify({ historico }) }
    ),
  getAssistenteConfig: () =>
    fetchApi<{ ativo: boolean; modelo: string; temApiKey: boolean; modelosDisponiveis: string[] }>('/assistente/config'),
  updateAssistenteConfig: (data: { ativo?: boolean; modelo?: string; apiKey?: string }) =>
    fetchApi<{ ok: boolean }>('/assistente/config', { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Notificações de Agendamento ───────────────────────────
  getNotificacoesAgendamentoConfig: () =>
    fetchApi<ConfiguracaoNotificacaoAgendamento>('/notificacoes/config-agendamento'),
  updateNotificacoesAgendamentoConfig: (data: ConfiguracaoNotificacaoAgendamento) =>
    fetchApi<ConfiguracaoNotificacaoAgendamento>('/notificacoes/config-agendamento', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificacoesPlataforma: (limit = 20) =>
    fetchApi<NotificacaoPlataforma[]>(`/notificacoes/plataforma?limit=${limit}`),
  markNotificacaoPlataformaLida: (id: number) =>
    fetchApi<{ ok: boolean }>(`/notificacoes/plataforma/${id}/lida`, { method: 'PATCH' }),
  getNotificacoesAgendamentoStatus: () =>
    fetchApi<StatusProcessamentoNotificacaoAgendamento>('/notificacoes/status-agendamento'),
  processarNotificacoesAgendamentoAgora: () =>
    fetchApi<StatusProcessamentoNotificacaoAgendamento>('/notificacoes/processar-agendamento', { method: 'POST' }),

  // ─── Cadastro de Etapas ───────────────────────────────────
  getEtapas: (params?: { tela?: string; ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<EtapaCadastro[]>(`/etapas${qs}`)
  },
  getEtapasTelas: () => fetchApi<Array<{ id: string; label: string }>>('/etapas/telas'),
  createEtapa: (data: { nome: string; cor: string; telas: string[]; ordem?: number; ativo?: boolean; slaDias?: number | null }) =>
    fetchApi<{ id: number }>('/etapas', { method: 'POST', body: JSON.stringify(data) }),
  updateEtapa: (id: number, data: { nome: string; cor: string; telas: string[]; ordem?: number; ativo?: boolean; slaDias?: number | null }) =>
    fetchApi(`/etapas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleEtapa: (id: number) => fetchApi<{ ok: boolean; ativo: boolean }>(`/etapas/${id}/toggle`, { method: 'PATCH' }),
  deleteEtapa: (id: number) => fetchApi(`/etapas/${id}`, { method: 'DELETE' }),
  reorderEtapas: (ids: number[]) => fetchApi<{ ok: boolean }>('/etapas/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),

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

  // ─── Cadastro de Serviços ─────────────────────────────────
  getServicos: (params?: { ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<ServicoCadastro[]>(`/servicos${qs}`)
  },
  createServico: (data: { nome: string; descricao?: string; checklistIds?: number[]; ordem?: number; ativo?: boolean }) =>
    fetchApi<{ id: number }>('/servicos', { method: 'POST', body: JSON.stringify(data) }),
  updateServico: (id: number, data: { nome: string; descricao?: string; checklistIds?: number[]; ordem?: number; ativo?: boolean }) =>
    fetchApi(`/servicos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleServico: (id: number) => fetchApi<{ ok: boolean; ativo: boolean }>(`/servicos/${id}/toggle`, { method: 'PATCH' }),
  deleteServico: (id: number) => fetchApi(`/servicos/${id}`, { method: 'DELETE' }),

  // ─── Cadastro de Procedimentos ───────────────────────────
  getProcedimentos: (params?: { ativo?: '0' | '1' }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi<ProcedimentoCadastro[]>(`/procedimentos${qs}`)
  },
  createProcedimento: (data: { nome: string; descricao?: string; duracaoMin?: number; ordem?: number; ativo?: boolean; tecnicoIds?: number[] }) =>
    fetchApi<{ id: number }>('/procedimentos', { method: 'POST', body: JSON.stringify(data) }),
  updateProcedimento: (id: number, data: { nome: string; descricao?: string; duracaoMin?: number; ordem?: number; ativo?: boolean; tecnicoIds?: number[] }) =>
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
  16: 'Corrigido Dev',
  17: 'Testado com Erro',
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
