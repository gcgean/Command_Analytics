import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../services/api'
import type { Cliente, CurvaABC, StatusCliente } from '../../types'
import clsx from 'clsx'

function getClienteStatus(c: Cliente): StatusCliente {
  if (c.ativo === 'N') return 'Inativo'
  if (c.bloqueado === 'S') return 'Bloqueado'
  return 'Ativo'
}

const curvaColors: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  B: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  C: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

const statusColors: Record<StatusCliente, string> = {
  Ativo: 'bg-emerald-500/20 text-emerald-400',
  Bloqueado: 'bg-red-500/20 text-red-400',
  Cancelado: 'bg-slate-600/40 text-slate-500',
  Inativo: 'bg-slate-600/40 text-slate-500',
}

export function Clientes() {
  const navigate = useNavigate()
  const location = useLocation()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Ativo')
  const [segmentos, setSegmentos] = useState<Array<{ id: number; descricao: string }>>([])
  const [filterSegmento, setFilterSegmento] = useState('')
  const [filterCurva, setFilterCurva] = useState('')
  const LIMIT = 50
  const [page, setPage] = useState(1)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const fetchingRef = useRef(false)

  const segmentoLabelById = useMemo(() => {
    const map = new Map<number, string>()
    for (const s of segmentos) map.set(s.id, s.descricao)
    return map
  }, [segmentos])

  const statusParams = useMemo(() => {
    return filterStatus === 'Ativo'
      ? { ativo: 'S', bloqueado: 'N' }
      : filterStatus === 'Bloqueado'
        ? { bloqueado: 'S' }
        : (filterStatus === 'Inativo' || filterStatus === 'Cancelado')
          ? { ativo: 'N' }
          : {}
  }, [filterStatus])

  const contadorId = useMemo(() => {
    const qs = new URLSearchParams(location.search)
    return qs.get('contadorId') || ''
  }, [location.search])

  const queryKey = useMemo(() => {
    return JSON.stringify({
      search: search.trim(),
      filterCurva,
      filterSegmento,
      contadorId,
      statusParams,
    })
  }, [search, filterCurva, filterSegmento, contadorId, statusParams])

  useEffect(() => {
    api.getSegmentos().then(setSegmentos).catch(() => setSegmentos([]))
  }, [])

  async function loadPage(targetPage: number, opts?: { reset?: boolean }) {
    if (fetchingRef.current) return
    fetchingRef.current = true
    const reset = opts?.reset === true
    if (reset) {
      setLoading(true)
      setClientes([])
      setPage(1)
      setHasMore(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const res = await api.getClientesPaged({
        page: targetPage,
        limit: LIMIT,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(filterCurva ? { curvaABC: filterCurva } : {}),
        ...(filterSegmento ? { idSegmento: filterSegmento } : {}),
        ...(contadorId ? { contadorId } : {}),
        ...statusParams,
      })

      setClientes(prev => {
        const next = reset ? res.data : [...prev, ...res.data]
        const byId = new Map<number, Cliente>()
        for (const c of next) byId.set(c.id, c)
        return Array.from(byId.values())
      })

      setPage(res.page)
      setHasMore(res.page < res.pages)
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar clientes')
      if (reset) setClientes([])
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      fetchingRef.current = false
    }
  }

  useEffect(() => {
    void loadPage(1, { reset: true })
  }, [queryKey])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (loading || loadingMore || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        void loadPage(page + 1)
      },
      { root: null, rootMargin: '300px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, loadingMore, hasMore, page, queryKey])

  const hasCustomFilters = Boolean(search || filterSegmento || filterCurva || filterStatus !== 'Ativo')

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-64">
          <Input
            placeholder="Buscar por nome, CNPJ ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-36">
          <Select
            options={[{ value: 'Ativo', label: 'Ativo' }, { value: 'Bloqueado', label: 'Bloqueado' }, { value: 'Inativo', label: 'Inativo' }, { value: 'Cancelado', label: 'Cancelado' }]}
            placeholder="Status"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            options={segmentos.map(s => ({ value: String(s.id), label: s.descricao }))}
            placeholder="Segmento"
            value={filterSegmento}
            onChange={e => setFilterSegmento(e.target.value)}
          />
        </div>
        <div className="w-32">
          <Select
            options={['A', 'B', 'C'].map(c => ({ value: c, label: `Curva ${c}` }))}
            placeholder="Curva ABC"
            value={filterCurva}
            onChange={e => setFilterCurva(e.target.value)}
          />
        </div>
        {hasCustomFilters && (
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => { setSearch(''); setFilterStatus('Ativo'); setFilterSegmento(''); setFilterCurva('') }}>
            Limpar
          </Button>
        )}
        <div className="flex-1" />
        <Button icon={<Plus className="w-4 h-4" />}>Novo Cliente</Button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 dark:text-slate-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            Carregando clientes...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Código', 'Nome', 'CNPJ', 'Cidade/UF', 'Segmento', 'Plano', 'Mensalidade', 'Curva', 'Status'].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-red-400">{error}</td></tr>
                ) : clientes.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum cliente encontrado.</td></tr>
                ) : (
                  clientes.map(c => (
                    <tr
                      key={c.id}
                      className="table-row cursor-pointer"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                    >
                      <td className="table-cell font-mono text-slate-500 dark:text-slate-400 text-xs">{c.id}</td>
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200 whitespace-normal break-words">{c.nome ?? '—'}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {c.nomeRazao && c.nomeRazao !== c.nome ? c.nomeRazao : ''}
                          </p>
                        </div>
                      </td>
                      <td className="table-cell font-mono text-xs text-slate-500 dark:text-slate-400">{c.cnpj ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.cidade ?? '—'}/{c.uf ?? '—'}</td>
                      <td className="table-cell">
                        <span className="text-xs text-slate-700 dark:text-slate-300">
                          {c.idSegmento ? (segmentoLabelById.get(Number(c.idSegmento)) ?? '—') : '—'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="text-xs font-medium text-blue-400">
                          {c.idPlano ? `Plano ${c.idPlano}` : '—'}
                        </span>
                      </td>
                      <td className="table-cell font-medium text-slate-800 dark:text-slate-200">
                        R$ {Number(c.mensalidade ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="table-cell">
                        {(c.curvaABC ?? '') !== '' ? (
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', curvaColors[(c.curvaABC ?? '') as CurvaABC] ?? '')}>
                            {c.curvaABC}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[getClienteStatus(c) as StatusCliente])}>
                          {getClienteStatus(c)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-slate-200 dark:border-slate-700">
              <div ref={sentinelRef} className="h-1" />
              <div className="px-4 py-3">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Carregando mais...
                  </div>
                ) : hasMore ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Role para carregar mais…</p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fim da lista.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
