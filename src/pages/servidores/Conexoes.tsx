import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, RefreshCw, Loader2, HeartPulse, Play, RotateCcw, Square, Lock, Unlock } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { Conexao, Servidor } from '../../types'

const statusColors: Record<string, string> = {
  aberto: 'bg-emerald-500/20 text-emerald-400',
  fechado: 'bg-slate-500/20 text-slate-500',
  travado: 'bg-amber-500/20 text-amber-400',
}

export function Conexoes() {
  const { can, isSuperUser } = usePermissions()
  const podeExecutarAcoes = can('conexoes-acoes')
  const location = useLocation()
  const navigate = useNavigate()
  const [alternandoVisibilidade, setAlternandoVisibilidade] = useState<string | null>(null)
  const acaoConexaoPrefill = (location.state as any)?.acaoConexaoPrefill as
    | { servidorId: number; connectionId: string; connectionName: string; acao: 'abrir' | 'reiniciar' | 'fechar' }
    | undefined

  const [servidores, setServidores] = useState<Servidor[]>([])
  const [servidorId, setServidorId] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [conexoes, setConexoes] = useState<Conexao[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saudeById, setSaudeById] = useState<Record<string, { loading: boolean; texto: string }>>({})
  const [acoesEmAndamento, setAcoesEmAndamento] = useState<Record<string, boolean>>({})

  const PAGINA = 24
  const [visivelAte, setVisivelAte] = useState(PAGINA)
  const sentinelaRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    api.getServidores().then((data: any) => setServidores(Array.isArray(data) ? data : [])).catch(() => setServidores([]))
  }, [])

  // Veio do assistente de IA pedindo pra abrir/reiniciar/fechar uma conexão específica — filtra
  // pra ela aparecer, mas quem confirma a ação de verdade é a pessoa, no botão real abaixo.
  const acaoConexaoDisparada = useRef(false)
  useEffect(() => {
    if (acaoConexaoPrefill) setSearch(acaoConexaoPrefill.connectionName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const carregar = (force = false) => {
    setLoading(true)
    api.getConexoes({
      servidorId: servidorId ? Number(servidorId) : undefined,
      search: search.trim() || undefined,
      status: status || undefined,
      force,
    })
      .then((res) => {
        setConexoes(res.data)
        setTotal(res.total)
        setVisivelAte(PAGINA)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(carregar, search ? 400 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servidorId, status, search])

  const servidoresAtivos = useMemo(() => servidores.filter(s => !s.desativado), [servidores])
  const conexoesVisiveis = useMemo(() => conexoes.slice(0, visivelAte), [conexoes, visivelAte])

  // Rolagem infinita: quando a sentinela no fim da lista entra na tela, revela mais 24 itens
  // já carregados em memória (sem nova consulta aos servidores, que é a parte lenta).
  useEffect(() => {
    const alvo = sentinelaRef.current
    if (!alvo) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisivelAte((atual) => Math.min(atual + PAGINA, conexoes.length))
      }
    }, { rootMargin: '200px' })
    observer.observe(alvo)
    return () => observer.disconnect()
  }, [conexoes.length])

  const handleToggleSomenteAdmin = async (c: Conexao) => {
    const acao = c.somenteAdmin ? 'liberar essa conexão para todos os usuários' : 'restringir essa conexão para admins apenas'
    if (!window.confirm(`Deseja ${acao} ("${c.name}")?`)) return
    setAlternandoVisibilidade(`${c.servidorId}:${c.id}`)
    try {
      await api.toggleConexaoSomenteAdmin(c.servidorId, c.id)
      carregar(true)
    } catch (e: any) {
      window.alert(e?.message || 'Falha ao alterar a visibilidade.')
    } finally {
      setAlternandoVisibilidade(null)
    }
  }

  const handleVerSaude = async (c: Conexao) => {
    setSaudeById(prev => ({ ...prev, [c.id]: { loading: true, texto: '' } }))
    try {
      const saude = await api.getSaudeConexao(c.servidorId, c.id)
      setSaudeById(prev => ({ ...prev, [c.id]: { loading: false, texto: saude.ok ? 'Saudável' : 'Com problema' } }))
    } catch (e: any) {
      setSaudeById(prev => ({ ...prev, [c.id]: { loading: false, texto: e?.message || 'Erro ao verificar' } }))
    }
  }

  const handleAcao = async (c: Conexao, acao: 'abrir' | 'reiniciar' | 'fechar') => {
    if (!window.confirm(`Deseja ${acao} a conexão "${c.name}"? Essa ação afeta diretamente o sistema em produção do cliente.`)) return
    const chave = `${c.servidorId}:${c.id}:${acao}`
    setAcoesEmAndamento((prev) => ({ ...prev, [chave]: true }))
    try {
      await api.executarAcaoConexao(c.servidorId, c.id, acao, c.name)
      window.setTimeout(() => carregar(true), 1500)
    } catch (e: any) {
      window.alert(e?.message || 'Falha ao executar a ação.')
    } finally {
      setAcoesEmAndamento((prev) => {
        const proximo = { ...prev }
        delete proximo[chave]
        return proximo
      })
    }
  }

  useEffect(() => {
    if (!acaoConexaoPrefill || acaoConexaoDisparada.current || loading || !podeExecutarAcoes) return
    const c = conexoes.find((x) => x.servidorId === acaoConexaoPrefill.servidorId && x.id === acaoConexaoPrefill.connectionId)
    if (!c) return
    acaoConexaoDisparada.current = true
    navigate(location.pathname, { replace: true, state: {} })
    handleAcao(c, acaoConexaoPrefill.acao)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexoes, loading])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Conexões</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{total} conexão(ões) encontrada(s)</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => carregar(true)}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-64">
          <Input
            placeholder="Pesquisar por nome, porta, servidor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-56">
          <Select
            options={servidoresAtivos.map(s => ({ value: s.id, label: s.nome ?? `Servidor ${s.id}` }))}
            placeholder="Todos os servidores"
            value={servidorId}
            onChange={e => setServidorId(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            options={[{ value: 'Aberto', label: 'Aberto' }, { value: 'Fechado', label: 'Fechado' }, { value: 'Travado', label: 'Travado' }]}
            placeholder="Todos os status"
            value={status}
            onChange={e => setStatus(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando conexões...
        </div>
      ) : conexoes.length === 0 ? (
        <div className="card text-center py-12 text-sm text-slate-500">Nenhuma conexão encontrada.</div>
      ) : (
        <>
        <p className="text-xs text-slate-500">{conexoesVisiveis.length} de {conexoes.length} itens</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {conexoesVisiveis.map(c => {
            const statusKey = c.status.toLowerCase()
            const saude = saudeById[c.id]
            const abrindo = acoesEmAndamento[`${c.servidorId}:${c.id}:abrir`]
            const reiniciando = acoesEmAndamento[`${c.servidorId}:${c.id}:reiniciar`]
            const fechando = acoesEmAndamento[`${c.servidorId}:${c.id}:fechar`]
            return (
              <div key={`${c.servidorId}-${c.id}`} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{c.name}</p>
                      {c.somenteAdmin && (
                        <span className="flex items-center gap-1 badge bg-purple-500/20 text-purple-400 text-xs"><Lock size={10} /> Somente admin</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.servidorNome} {c.servidorAnydesk ? `· AnyDesk ${c.servidorAnydesk}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSuperUser && (
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-1 !py-1 !px-2 text-xs"
                        onClick={() => handleToggleSomenteAdmin(c)}
                        disabled={alternandoVisibilidade === `${c.servidorId}:${c.id}`}
                        title={c.somenteAdmin ? 'Liberar para todos' : 'Restringir a admins'}
                      >
                        {alternandoVisibilidade === `${c.servidorId}:${c.id}` ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : c.somenteAdmin ? (
                          <Lock size={11} />
                        ) : (
                          <Unlock size={11} />
                        )}
                      </button>
                    )}
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[statusKey] ?? 'bg-slate-500/20 text-slate-500')}>
                      {c.status || '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400 mb-3">
                  <div><span className="text-slate-500">REST:</span> {c.restPort ?? '—'}</div>
                  <div><span className="text-slate-500">Processo:</span> {c.processId ?? '—'}</div>
                  <div><span className="text-slate-500">Ativo:</span> {c.processActive ? 'Sim' : 'Não'}</div>
                  <div className="col-span-3"><span className="text-slate-500">Portas:</span> {c.ports ?? '—'}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                    onClick={() => handleVerSaude(c)}
                    disabled={saude?.loading}
                  >
                    {saude?.loading ? <Loader2 size={12} className="animate-spin" /> : <HeartPulse size={12} />}
                    {saude?.loading ? 'Verificando...' : saude?.texto || 'Ver saúde'}
                  </button>
                  {podeExecutarAcoes && (
                    <>
                      <button
                        type="button"
                        className="btn-primary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                        onClick={() => handleAcao(c, 'abrir')}
                        disabled={abrindo || reiniciando || fechando}
                      >
                        {abrindo ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Abrir
                      </button>
                      <button
                        type="button"
                        className="btn-primary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                        onClick={() => handleAcao(c, 'reiniciar')}
                        disabled={abrindo || reiniciando || fechando}
                      >
                        {reiniciando ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Reiniciar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                        onClick={() => handleAcao(c, 'fechar')}
                        disabled={abrindo || reiniciando || fechando}
                      >
                        {fechando ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Fechar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {visivelAte < conexoes.length && (
          <div ref={sentinelaRef} className="flex items-center justify-center py-4 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando mais...
          </div>
        )}
        </>
      )}
    </div>
  )
}
