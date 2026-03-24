import { useState, useEffect } from 'react'
import { Search, Download, RefreshCw } from 'lucide-react'

const DEPT_LABEL: Record<number, string> = {
  1: 'Suporte', 2: 'Financeiro', 3: 'Comercial', 4: 'Implantação',
  5: 'Desenvolvimento', 6: 'Fiscal', 7: 'Certificado', 8: 'CS', 9: 'Técnico', 10: 'Treinamento',
}
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { api, departamentoColors, statusAtendimentoLabel } from '../../services/api'
import type { Atendimento, StatusAtendimento } from '../../types'
import clsx from 'clsx'

export function HistoricoAtendimentos() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [dataInicio, setDataInicio] = useState('2026-01-01')
  const [dataFim, setDataFim] = useState('2026-03-18')

  useEffect(() => {
    // getAtendimentos returns paginated {total, page, pages, limit, data:[]}
    api.getAtendimentos({ limit: '500' }).then((resp: any) => {
      const lista = resp?.data ?? (Array.isArray(resp) ? resp : [])
      setAtendimentos(lista)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = atendimentos.filter((a: any) => {
    const deptLabel = DEPT_LABEL[a.departamento] ?? String(a.departamento ?? '')
    const matchSearch = !search ||
      (a.clienteNome ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.tecnicoNome ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || String(a.status) === filterStatus
    const matchDept = !filterDept || deptLabel === filterDept
    const dataAt = a.dataAbertura ? new Date(a.dataAbertura) : null
    const matchData = !dataAt || (dataAt >= new Date(dataInicio) && dataAt <= new Date(dataFim + 'T23:59:59'))
    return matchSearch && matchStatus && matchDept && matchData
  })

  const statusOptions = Object.entries(statusAtendimentoLabel).map(([k, v]) => ({ value: k, label: v }))
  const deptOptions = ['Suporte', 'Fiscal', 'Financeiro', 'Comercial', 'Certificado', 'CS', 'Instalação', 'Treinamento', 'Técnico'].map(d => ({ value: d, label: d }))

  // Stats
  const concluidos = filtered.filter(a => a.status === 7).length
  const cancelados = filtered.filter(a => a.status === 8).length
  const avgTempo = filtered.filter(a => a.tempoAtendimento).reduce((acc, a) => acc + (a.tempoAtendimento ?? 0), 0) / (filtered.filter(a => a.tempoAtendimento).length || 1)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total no período', value: filtered.length, color: 'text-slate-100' },
          { label: 'Concluídos', value: concluidos, color: 'text-emerald-400' },
          { label: 'Cancelados', value: cancelados, color: 'text-red-400' },
          { label: 'Tempo médio', value: `${Math.round(avgTempo)}min`, color: 'text-amber-400' },
        ].map(s => (
          <Card key={s.label} padding="sm">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-56">
            <Input
              label="Buscar"
              placeholder="Cliente ou técnico..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="w-44">
            <Select label="Status" options={statusOptions} placeholder="Todos" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} />
          </div>
          <div className="w-40">
            <Select label="Departamento" options={deptOptions} placeholder="Todos" value={filterDept} onChange={e => setFilterDept(e.target.value)} />
          </div>
          <div className="w-36">
            <Input label="Data início" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div className="w-36">
            <Input label="Data fim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterDept('') }}>
            Limpar
          </Button>
          <Button variant="secondary" size="sm" icon={<Download className="w-4 h-4" />}>
            Exportar CSV
          </Button>
        </div>
      </Card>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            Carregando histórico...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['ID', 'Cliente', 'Técnico', 'Departamento', 'Status', 'Abertura', 'Fechamento', 'Tempo', 'Bug'].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum atendimento no período selecionado.</td></tr>
                ) : (
                  filtered.map(a => (
                    <tr key={a.id} className="table-row">
                      <td className="table-cell font-mono text-blue-400 font-semibold">#{a.id}</td>
                      <td className="table-cell">
                        <p className="font-medium text-slate-200 truncate max-w-[160px]">{a.clienteNome}</p>
                      </td>
                      <td className="table-cell text-slate-300">{a.tecnicoNome}</td>
                      <td className="table-cell">
                        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', departamentoColors[DEPT_LABEL[a.departamento]] ?? 'bg-slate-700 text-slate-400')}>
                          {DEPT_LABEL[a.departamento] ?? `Depto ${a.departamento}`}
                        </span>
                      </td>
                      <td className="table-cell"><StatusBadge status={a.status as StatusAtendimento} /></td>
                      <td className="table-cell text-xs text-slate-400">{new Date(a.dataAbertura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                      <td className="table-cell text-xs text-slate-400">
                        {a.dataFechamento ? new Date(a.dataFechamento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </td>
                      <td className="table-cell text-xs text-slate-400">
                        {a.tempoAtendimento ? `${a.tempoAtendimento}min` : '—'}
                      </td>
                      <td className="table-cell">
                        {a.bugSistema === 'S' ? <span className="text-xs text-red-400 font-medium">Sim</span> : <span className="text-xs text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
