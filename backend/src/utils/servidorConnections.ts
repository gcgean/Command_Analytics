const REQUEST_TIMEOUT_MS = 8000

function authHeader(): Record<string, string> {
  const username = process.env.SERVIDOR_MONITOR_API_USERNAME || ''
  const password = process.env.SERVIDOR_MONITOR_API_PASSWORD || ''
  if (!username && !password) return {}
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return { Authorization: `Basic ${token}` }
}

async function fetchJson(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers: authHeader(), signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export interface ServidorParaConexoes {
  id: number
  nome: string | null
  dns: string | null
  portaApi: number | null
  anydesk: string | null
}

export interface Conexao {
  id: string
  name: string
  status: string
  restPort: number | string | null
  processId: number | string | null
  processActive: boolean
  ports: string | null
  servidorId: number
  servidorNome: string | null
  servidorAnydesk: string | null
}

function baseUrl(servidor: ServidorParaConexoes) {
  return `http://${servidor.dns}:${servidor.portaApi}/api`
}

export async function listarConexoesDoServidor(servidor: ServidorParaConexoes): Promise<Conexao[]> {
  if (!servidor.dns || !servidor.portaApi) return []
  try {
    const response = await fetchJson(`${baseUrl(servidor)}/web/Connections`)
    const lista = Array.isArray(response) ? response : Array.isArray(response?.connections) ? response.connections : Array.isArray(response?.data) ? response.data : []
    return lista.map((c: any, index: number) => ({
      id: String(c?.id ?? c?.connectionId ?? c?.name ?? `${servidor.id}-${index}`),
      name: String(c?.name ?? c?.descricao ?? 'Sem nome'),
      status: String(c?.status ?? ''),
      restPort: c?.restPort ?? c?.portaREST ?? null,
      processId: c?.processId ?? c?.pid ?? null,
      processActive: Boolean(c?.processActive ?? c?.ativo),
      ports: c?.ports ?? c?.portas ?? null,
      servidorId: servidor.id,
      servidorNome: servidor.nome,
      servidorAnydesk: servidor.anydesk,
    }))
  } catch {
    return []
  }
}

export async function checarSaudeConexao(servidor: ServidorParaConexoes, connectionId: string): Promise<any> {
  return fetchJson(`${baseUrl(servidor)}/web/ConnectionHealth?id=${encodeURIComponent(connectionId)}`)
}

const ACAO_PATH: Record<'abrir' | 'reiniciar' | 'fechar', string> = {
  abrir: '/connections/OpenApplication',
  reiniciar: '/connections/RestartApplication',
  fechar: '/connections/CloseApplication',
}

export async function executarAcaoConexao(
  servidor: ServidorParaConexoes,
  connectionId: string,
  acao: 'abrir' | 'reiniciar' | 'fechar'
): Promise<void> {
  const path = ACAO_PATH[acao]
  if (!path) throw new Error('Ação inválida.')
  // Os endpoints de ação (Open/Restart/Close) só confirmam com um 2xx — nem sempre respondem
  // JSON, então não tenta interpretar o corpo, só valida o status.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl(servidor)}${path}?id=${encodeURIComponent(connectionId)}`, {
      headers: authHeader(),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } finally {
    clearTimeout(timer)
  }
}
