import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../services/api'
import type { Cliente, CurvaABC, StatusCliente } from '../../types'
import clsx from 'clsx'
import { usePermissions } from '../../contexts/PermissionsContext'

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
  const { can } = usePermissions()
  const canViewValores = can('clientes-valores')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPage, setLoadingPage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Ativo')
  const [classificacoes, setClassificacoes] = useState<Array<{ id: number; nome: string | null }>>([])
  const [filterClassificacao, setFilterClassificacao] = useState('')
  const [filterCurva, setFilterCurva] = useState('')
  const [filterSemMaquininha, setFilterSemMaquininha] = useState(false)
  const LIMIT = 30
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const fetchingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const classificacaoLabelById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of classificacoes) {
      if (c.id) map.set(c.id, c.nome ?? '')
    }
    return map
  }, [classificacoes])

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
      filterClassificacao,
      filterSemMaquininha,
      contadorId,
      statusParams,
    })
  }, [search, filterCurva, filterClassificacao, filterSemMaquininha, contadorId, statusParams])

  useEffect(() => {
    api.getClassificacoes().then(setClassificacoes).catch(() => setClassificacoes([]))
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function loadPage(targetPage: number, opts?: { reset?: boolean }) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    fetchingRef.current = true
    const reset = opts?.reset === true
    if (reset) {
      setLoading(true)
      setClientes([])
      setPage(1)
    } else {
      setLoadingPage(true)
    }
    setError(null)

    try {
      const res = await api.getClientesPaged({
        page: targetPage,
        limit: LIMIT,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(filterCurva ? { curvaABC: filterCurva } : {}),
        ...(filterClassificacao ? { codCla: filterClassificacao } : {}),
        ...(contadorId ? { contadorId } : {}),
        ...(filterSemMaquininha ? { semMaquininha: true } : {}),
        ...statusParams,
      }, { signal: controller.signal })

      if (abortRef.current !== controller) return

      setClientes(res.data)
      setPage(res.page)
      setPages(res.pages)
      setTotal(res.total)
    } catch (e: any) {
      if (abortRef.current !== controller) return
      const msg = String(e?.message ?? '')
      const isAbort = e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')
      if (isAbort) return
      setError(msg || 'Falha ao carregar clientes')
      if (reset) setClientes([])
      setPages(1)
      setTotal(0)
    } finally {
      if (abortRef.current !== controller) return
      setLoading(false)
      setLoadingPage(false)
      fetchingRef.current = false
    }
  }

  useEffect(() => {
    void loadPage(1, { reset: true })
  }, [queryKey])

  const hasCustomFilters = Boolean(search || filterClassificacao || filterCurva || filterSemMaquininha || filterStatus !== 'Ativo')

  const formatSafeDate = (value: any) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

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
            options={classificacoes.map(c => ({ value: String(c.id), label: c.nome ?? String(c.id) }))}
            placeholder="Classificação"
            value={filterClassificacao}
            onChange={e => setFilterClassificacao(e.target.value)}
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
        <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={filterSemMaquininha}
            onChange={(e) => setFilterSemMaquininha(e.target.checked)}
            className="accent-blue-600"
          />
          Sem integração POS informada
        </label>
        {hasCustomFilters && (
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => { setSearch(''); setFilterStatus('Ativo'); setFilterClassificacao(''); setFilterCurva(''); setFilterSemMaquininha(false) }}>
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
                  <th className="table-header text-left">Código</th>
                  <th className="table-header text-left">Nome</th>
                  <th className="table-header text-left">Curva</th>
                  <th className="table-header text-left">Nome fantasia</th>
                  <th className="table-header text-left">Classificação</th>
                  <th className="table-header text-left">CNPJ</th>
                  <th className="table-header text-left">Cidade</th>
                  <th className="table-header text-left">UF</th>
                  <th className="table-header text-left">Endereço</th>
                  <th className="table-header text-left">Telefone</th>
                  <th className="table-header text-left">CEP</th>
                  <th className="table-header text-left">Data cadastro</th>
                  {canViewValores && (
                    <>
                      <th className="table-header text-left">Mensalidade</th>
                    </>
                  )}
                  <th className="table-header text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={canViewValores ? 14 : 13} className="px-4 py-12 text-center text-sm text-red-400">{error}</td></tr>
                ) : clientes.length === 0 ? (
                  <tr><td colSpan={canViewValores ? 14 : 13} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum cliente encontrado.</td></tr>
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
                        </div>
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
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.nomeRazao ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.classificacaoNome ?? '—'}</td>
                      <td className="table-cell font-mono text-xs text-slate-500 dark:text-slate-400">{c.cnpj ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.cidade ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.uf ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.endereco ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.telefoneResidencial ?? c.telefone ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">{c.cep ?? '—'}</td>
                      <td className="table-cell text-slate-700 dark:text-slate-300">
                        {formatSafeDate(c.dataContrato)}
                      </td>
                      {canViewValores && (
                        <>
                          <td className="table-cell font-medium text-slate-800 dark:text-slate-200">
                            R$ {Number(c.mensalidade ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </>
                      )}
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
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Página {page} de {pages} — {total.toLocaleString('pt-BR')} registros
                </p>
                <div className="flex items-center gap-2">
                  {loadingPage && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Carregando...
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingPage || loading || page <= 1}
                    onClick={() => void loadPage(Math.max(page - 1, 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingPage || loading || page >= pages}
                    onClick={() => void loadPage(Math.min(page + 1, pages))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
