import { useEffect, useState } from 'react'
import { Calendar, GraduationCap, Search } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { DateInput } from '../../components/ui/DateInput'
import { Select } from '../../components/ui/Select'
import { api } from '../../services/api'
import type { AgendaItem } from '../../types'

const TIPOS = ['Treinamento', 'Instalação', 'Visita', 'Retorno', 'Outros']

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: '2', label: 'Efetuado' },
  { value: '3', label: 'Não efetuado' },
  { value: '4', label: 'Reagendado' },
]

const statusColors: Record<string, string> = {
  Aguardando: 'bg-amber-500/20 text-amber-400',
  Efetuado: 'bg-emerald-500/20 text-emerald-400',
  'Não efetuado': 'bg-red-500/20 text-red-400',
  Reagendado: 'bg-purple-500/20 text-purple-400',
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toBRDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fromBRDate(br: string) {
  if (!br) return ''
  const [d, m, y] = br.split('/')
  if (!d || !m || !y) return ''
  return `${y}-${m}-${d}`
}

function formatDate(value?: string | Date | null) {
  if (!value) return '—'
  const iso = value instanceof Date ? value.toISOString().substring(0, 10) : String(value).substring(0, 10)
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

function getStatusLabel(status: number | null | undefined): string {
  if (status === 0 || status === 1) return 'Aguardando'
  if (status === 2) return 'Efetuado'
  if (status === 3) return 'Não efetuado'
  if (status === 4) return 'Reagendado'
  return 'Aguardando'
}

function normalizeTipo(tipo?: string | null): string {
  const raw = String(tipo ?? '').trim()
  if (!raw) return 'Outros'
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (normalized.includes('TREIN')) return 'Treinamento'
  if (normalized.includes('INSTAL')) return 'Instalação'
  if (normalized.includes('RETORN')) return 'Retorno'
  if (normalized.includes('VISIT')) return 'Visita'
  return 'Outros'
}

export function HistoricoTreinamentos() {
  const [filters, setFilters] = useState({
    dataInicio: toBRDate(todayStr()),
    dataFim: toBRDate(todayStr()),
    clienteId: '',
    tecnicoId: '',
    tipo: 'Treinamento',
    status: '',
  })
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([])
  const [results, setResults] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    api.getUsuarios()
      .then((usuarios: any[]) => {
        setTecnicos(
          usuarios.map((usuario: any) => ({
            id: Number(usuario.id),
            nome: usuario.nome || usuario.nomeCompleto || usuario.nomeUsu || `#${usuario.id}`,
          })),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    buscar()
  }, [])

  function buscar(overrides?: typeof filters) {
    const current = overrides ?? filters
    const dataInicio = fromBRDate(current.dataInicio)
    const dataFim = fromBRDate(current.dataFim)

    if (!dataInicio || !dataFim) {
      setErrorMessage('Informe a data inicial e final.')
      setResults([])
      setSearched(true)
      return
    }

    setLoading(true)
    setSearched(true)
    setErrorMessage('')

    const params: Record<string, string> = {
      dataInicio,
      dataFim,
      tipo: current.tipo || 'Treinamento',
    }

    if (current.clienteId) params.clienteId = current.clienteId
    if (current.tecnicoId) params.tecnicoId = current.tecnicoId
    if (current.status) params.status = current.status

    api.getAgenda(params)
      .then((items) => {
        const treinamentos = (items as AgendaItem[]).filter((item) => normalizeTipo(item.tipo) === 'Treinamento')
        setResults(treinamentos)
      })
      .catch((error: any) => {
        setResults([])
        setErrorMessage(error?.message || 'Não foi possível carregar o histórico de treinamentos.')
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-500/10 rounded-lg">
          <GraduationCap className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de Treinamentos</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Registro e consulta de treinamentos por período</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[130px]">
            <DateInput
              label="Data início"
              mode="br"
              value={filters.dataInicio}
              onChange={(value) => setFilters((current) => ({ ...current, dataInicio: value }))}
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <DateInput
              label="Data fim"
              mode="br"
              value={filters.dataFim}
              onChange={(value) => setFilters((current) => ({ ...current, dataFim: value }))}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <ClienteSearch
              label="Cliente"
              value={filters.clienteId}
              onChange={(id) => setFilters((current) => ({ ...current, clienteId: id }))}
              placeholder="Buscar cliente..."
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              label="Técnico"
              options={[{ value: '', label: 'Todos' }, ...tecnicos.map((tecnico) => ({ value: String(tecnico.id), label: tecnico.nome }))]}
              value={filters.tecnicoId}
              onChange={(event) => setFilters((current) => ({ ...current, tecnicoId: event.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              label="Tipo"
              options={TIPOS.map((tipo) => ({ value: tipo, label: tipo }))}
              value={filters.tipo}
              onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              label="Status"
              options={statusOptions}
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            />
          </div>
          <Button icon={<Search className="w-4 h-4" />} onClick={() => buscar()}>
            Buscar
          </Button>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {searched && !loading && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{results.length}</span>
              {' '}treinamento{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['ID', 'Cliente', 'Técnico', 'Data', 'Tipo', 'Status', 'Nota', 'Observação'].map((header) => (
                  <th key={header} className="table-header text-left">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const statusLabel = getStatusLabel(item.status)
                return (
                  <tr key={`${item.origem ?? 'agenda'}-${item.id}`} className="table-row">
                    <td className="table-cell font-mono text-blue-400 font-semibold">#{item.id}</td>
                    <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{item.clienteNome || '—'}</td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{item.tecnicoNome || '—'}</td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(item.data)}</td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{item.tipo || 'Treinamento'}</td>
                    <td className="table-cell">
                      <span className={`badge text-xs ${statusColors[statusLabel] ?? 'bg-slate-500/20 text-slate-500'}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{item.nota || '—'}</td>
                    <td className="table-cell text-slate-500">{item.observacoes || '—'}</td>
                  </tr>
                )
              })}

              {!loading && results.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-slate-500 py-10">
                    Nenhum treinamento encontrado para os filtros informados.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-slate-500 py-10">
                    Carregando treinamentos...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
