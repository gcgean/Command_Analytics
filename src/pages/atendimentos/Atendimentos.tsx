import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MessageSquare, Phone, Mail, Users, MonitorSmartphone, RefreshCw, ChevronLeft, ChevronRight, Bug } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { api, statusAtendimentoLabel } from '../../services/api'
import type { StatusAtendimento } from '../../types'
import clsx from 'clsx'

// ─── Mapeamentos MySQL ──────────────────────────────────────────────────────
const DEPARTAMENTO_LABEL: Record<number, string> = {
  1: 'Suporte',
  2: 'Financeiro',
  3: 'Comercial',
  4: 'Implantação',
  5: 'Desenvolvimento',
  6: 'Fiscal',
  7: 'Certificado',
  8: 'CS',
  9: 'Técnico',
  10: 'Treinamento',
}

const DEPARTAMENTO_COLORS: Record<string, string> = {
  'Suporte': 'bg-blue-500/20 text-blue-400',
  'Fiscal': 'bg-amber-500/20 text-amber-400',
  'Financeiro': 'bg-green-500/20 text-green-400',
  'Comercial': 'bg-purple-500/20 text-purple-400',
  'Certificado': 'bg-orange-500/20 text-orange-400',
  'CS': 'bg-cyan-500/20 text-cyan-400',
  'Implantação': 'bg-pink-500/20 text-pink-400',
  'Treinamento': 'bg-indigo-500/20 text-indigo-400',
  'Técnico': 'bg-red-500/20 text-red-400',
  'Desenvolvimento': 'bg-violet-500/20 text-violet-400',
}

const TIPO_CONTATO_LABEL: Record<number, string> = {
  1: 'WhatsApp',
  2: 'Telefone',
  3: 'E-mail',
  4: 'Presencial',
  5: 'Outras Mídias',
}

const TIPO_CONTATO_ICON: Record<string, React.ReactNode> = {
  'WhatsApp':      <MessageSquare className="w-4 h-4 text-emerald-400" />,
  'Telefone':      <Phone className="w-4 h-4 text-blue-400" />,
  'E-mail':        <Mail className="w-4 h-4 text-amber-400" />,
  'Presencial':    <Users className="w-4 h-4 text-purple-400" />,
  'Outras Mídias': <MonitorSmartphone className="w-4 h-4 text-slate-400" />,
}

const PRIORIDADE_LABEL: Record<string, string> = {
  A: 'Urgente',
  B: 'Normal',
  C: 'Baixa',
  '': 'Normal',
}

const PRIORIDADE_COLOR: Record<string, string> = {
  A: 'text-red-400',
  B: 'text-blue-400',
  C: 'text-slate-400',
  '': 'text-blue-400',
}

interface AtendimentoItem {
  id: number
  clienteNome: string
  tecnicoNome: string
  departamento: number | null
  tipoContato: number | null
  status: number | null
  prioridade: string | null
  bugSistema: string | null
  dataAbertura: string | null
  tempoAtendimento: number | null
}

interface PaginatedResponse {
  total: number
  page: number
  limit: number
  pages: number
  data: AtendimentoItem[]
}

const LIMIT = 50

export function Atendimentos() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AtendimentoItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [page, setPage] = useState(1)

  const carregar = useCallback((pg: number, s: string, st: string, dept: string) => {
    setLoading(true)
    const params: Record<string, string> = {
      page: String(pg),
      limit: String(LIMIT),
    }
    if (st) params.status = st
    if (dept) params.departamento = dept

    api.getAtendimentos(params).then((resp: any) => {
      // Backend returns { total, page, pages, limit, data: [] }
      const paginated = resp as PaginatedResponse
      let data: AtendimentoItem[] = paginated.data ?? (Array.isArray(resp) ? resp : [])

      // Apply client-side name search (search by name/ID can't easily be done server-side)
      if (s) {
        const sl = s.toLowerCase()
        data = data.filter(a =>
          (a.clienteNome ?? '').toLowerCase().includes(sl) ||
          (a.tecnicoNome ?? '').toLowerCase().includes(sl) ||
          String(a.id).includes(s)
        )
      }

      setItems(data)
      setTotal(paginated.total ?? data.length)
      setPages(paginated.pages ?? 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    carregar(page, search, filterStatus, filterDept)
  }, [page, filterStatus, filterDept]) // eslint-disable-line

  // Search triggers on Enter or after 500ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      carregar(1, search, filterStatus, filterDept)
    }, 500)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  const statusOptions = Object.entries(statusAtendimentoLabel).map(([k, v]) => ({ value: k, label: v }))
  const deptOptions = Object.entries(DEPARTAMENTO_LABEL).map(([k, v]) => ({ value: k, label: v }))

  const limpar = () => {
    setSearch('')
    setFilterStatus('')
    setFilterDept('')
    setPage(1)
  }

  const temFiltros = search || filterStatus || filterDept

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="w-full sm:w-64">
            <Input
              placeholder="Buscar por cliente, técnico ou ID..."
              value={search}
              onChange={e => { setSearch(e.target.value) }}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="w-48">
            <Select
              options={statusOptions}
              placeholder="Status"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
            />
          </div>
          <div className="w-40">
            <Select
              options={deptOptions}
              placeholder="Departamento"
              value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setPage(1) }}
            />
          </div>
          {temFiltros && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={limpar}
            >
              Limpar
            </Button>
          )}
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => navigate('/atendimentos/novo')}
        >
          Novo Atendimento
        </Button>
      </div>

      {/* Contagem */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {loading ? 'Carregando...' : `${total.toLocaleString('pt-BR')} atendimento(s) no total`}
        </span>
      </div>

      {/* Tabela */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            Carregando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['ID', 'Cliente', 'Técnico', 'Departamento', 'Contato', 'Prioridade', 'Status', 'Abertura', 'Tempo'].map(h => (
                    <th key={h} className="table-header text-left first:rounded-tl-xl last:rounded-tr-xl">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                      Nenhum atendimento encontrado.
                    </td>
                  </tr>
                ) : (
                  items.map(a => {
                    const deptLabel = a.departamento != null ? (DEPARTAMENTO_LABEL[a.departamento] ?? `Dep. ${a.departamento}`) : '—'
                    const deptColor = DEPARTAMENTO_COLORS[deptLabel] ?? 'bg-slate-500/20 text-slate-400'
                    const tipoLabel = a.tipoContato != null ? (TIPO_CONTATO_LABEL[a.tipoContato] ?? String(a.tipoContato)) : ''
                    const tipoIcon = TIPO_CONTATO_ICON[tipoLabel]
                    const prioLabel = PRIORIDADE_LABEL[a.prioridade ?? ''] ?? 'Normal'
                    const prioColor = PRIORIDADE_COLOR[a.prioridade ?? ''] ?? 'text-blue-400'

                    return (
                      <tr
                        key={a.id}
                        className="table-row cursor-pointer"
                        onClick={() => navigate(`/atendimentos/${a.id}`)}
                      >
                        <td className="table-cell font-mono text-blue-400 font-semibold">#{a.id}</td>
                        <td className="table-cell">
                          <div>
                            <p className="font-medium text-slate-200 truncate max-w-[180px]">{a.clienteNome || '—'}</p>
                            {a.bugSistema === 'S' && (
                              <span className="flex items-center gap-1 text-xs text-red-400">
                                <Bug className="w-3 h-3" /> Bug
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-slate-300 truncate max-w-[120px]">{a.tecnicoNome || '—'}</td>
                        <td className="table-cell">
                          <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', deptColor)}>
                            {deptLabel}
                          </span>
                        </td>
                        <td className="table-cell">
                          {tipoIcon ? (
                            <div className="flex items-center gap-1.5" title={tipoLabel}>
                              {tipoIcon}
                              <span className="text-xs text-slate-400 hidden xl:inline">{tipoLabel}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">{tipoLabel || '—'}</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <span className={clsx('text-xs font-semibold', prioColor)}>{prioLabel}</span>
                        </td>
                        <td className="table-cell">
                          <StatusBadge status={(a.status ?? 1) as StatusAtendimento} />
                        </td>
                        <td className="table-cell text-slate-400 text-xs">
                          {a.dataAbertura ? new Date(a.dataAbertura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        </td>
                        <td className="table-cell text-slate-400 text-xs">
                          {a.tempoAtendimento ? `${a.tempoAtendimento}min` : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação servidor */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Página {page} de {pages} — {total.toLocaleString('pt-BR')} registros
          </p>
          <div className="flex gap-1 items-center">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              icon={<ChevronLeft className="w-4 h-4" />}
            >
              Anterior
            </Button>

            {/* Janela de páginas */}
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              let p: number
              if (pages <= 7) p = i + 1
              else if (page <= 4) p = i + 1
              else if (page >= pages - 3) p = pages - 6 + i
              else p = page - 3 + i
              return (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? 'primary' : 'secondary'}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              )
            })}

            <Button
              variant="secondary"
              size="sm"
              disabled={page === pages}
              onClick={() => setPage(p => p + 1)}
              icon={<ChevronRight className="w-4 h-4" />}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
