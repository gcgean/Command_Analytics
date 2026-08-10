import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Loader2, HeartPulse, Play, RotateCcw, Square } from 'lucide-react'
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
  const { can } = usePermissions()
  const podeExecutarAcoes = can('conexoes-acoes')

  const [servidores, setServidores] = useState<Servidor[]>([])
  const [servidorId, setServidorId] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [conexoes, setConexoes] = useState<Conexao[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)
  const [saudeById, setSaudeById] = useState<Record<string, { loading: boolean; texto: string }>>({})

  useEffect(() => {
    api.getServidores().then((data: any) => setServidores(Array.isArray(data) ? data : [])).catch(() => setServidores([]))
  }, [])

  const carregar = () => {
    setLoading(true)
    api.getConexoes({
      servidorId: servidorId ? Number(servidorId) : undefined,
      search: search.trim() || undefined,
      status: status || undefined,
    })
      .then((res) => {
        setConexoes(res.data)
        setTotal(res.total)
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
    const rotulo = acao === 'abrir' ? 'abrir' : acao === 'reiniciar' ? 'reiniciar' : 'fechar'
    if (!window.confirm(`Deseja ${rotulo} a conexão "${c.name}"? Essa ação afeta diretamente o sistema em produção do cliente.`)) return
    const chave = `${c.servidorId}:${c.id}:${acao}`
    setAcaoEmAndamento(chave)
    try {
      await api.executarAcaoConexao(c.servidorId, c.id, acao, c.name)
      setTimeout(carregar, 1500)
    } catch (e: any) {
      window.alert(e?.message || 'Falha ao executar a ação.')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Conexões</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{total} conexão(ões) encontrada(s)</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={carregar}>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {conexoes.map(c => {
            const statusKey = c.status.toLowerCase()
            const saude = saudeById[c.id]
            return (
              <div key={`${c.servidorId}-${c.id}`} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.servidorNome} {c.servidorAnydesk ? `· AnyDesk ${c.servidorAnydesk}` : ''}
                    </p>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[statusKey] ?? 'bg-slate-500/20 text-slate-500')}>
                    {c.status || '—'}
                  </span>
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
                        disabled={acaoEmAndamento !== null}
                      >
                        <Play size={12} /> Abrir
                      </button>
                      <button
                        type="button"
                        className="btn-primary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                        onClick={() => handleAcao(c, 'reiniciar')}
                        disabled={acaoEmAndamento !== null}
                      >
                        <RotateCcw size={12} /> Reiniciar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-1 !py-1.5 !px-3 text-xs"
                        onClick={() => handleAcao(c, 'fechar')}
                        disabled={acaoEmAndamento !== null}
                      >
                        <Square size={12} /> Fechar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
