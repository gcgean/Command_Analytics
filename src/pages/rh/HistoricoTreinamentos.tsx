import { useMemo, useState } from 'react'
import { GraduationCap, Search } from 'lucide-react'

type StatusTreinamento = 'Concluído' | 'Agendado' | 'Cancelado'

type Treinamento = {
  id: number
  cliente: string
  tecnico: string
  data: string
  tipo: string
  status: StatusTreinamento
  observacao?: string
}

const mockTreinamentos: Treinamento[] = [
  {
    id: 168,
    cliente: 'TOP 10 COSMÉTICOS',
    tecnico: 'LORENA',
    data: '2026-04-27',
    tipo: 'Treinamento Presencial',
    status: 'Concluído',
    observacao: 'Treinamento para 4 pessoas. Migração de dados com Diego Palhares.',
  },
  {
    id: 11887,
    cliente: 'TOP 10',
    tecnico: 'LORENA',
    data: '2026-04-27',
    tipo: 'Treinamento',
    status: 'Agendado',
    observacao: 'Lançando para colocar observação do cliente.',
  },
]

const statusClasses: Record<StatusTreinamento, string> = {
  Concluído: 'bg-emerald-500/20 text-emerald-400',
  Agendado: 'bg-amber-500/20 text-amber-400',
  Cancelado: 'bg-red-500/20 text-red-400',
}

export function HistoricoTreinamentos() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return mockTreinamentos
    return mockTreinamentos.filter(t =>
      t.cliente.toLowerCase().includes(q) ||
      t.tecnico.toLowerCase().includes(q) ||
      t.tipo.toLowerCase().includes(q) ||
      String(t.id).includes(q)
    )
  }, [search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-lg">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de Treinamentos</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Registro e consulta de treinamentos realizados</p>
          </div>
        </div>

        <div className="relative w-full sm:w-96">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar por cliente, técnico, tipo ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['ID', 'Cliente', 'Técnico', 'Data', 'Tipo', 'Status', 'Observação'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="table-row">
                <td className="table-cell font-mono text-blue-400 font-semibold">#{t.id}</td>
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{t.cliente}</td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{t.tecnico}</td>
                <td className="table-cell text-slate-600 dark:text-slate-400">
                  {new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{t.tipo}</td>
                <td className="table-cell">
                  <span className={"badge text-xs " + statusClasses[t.status]}>{t.status}</span>
                </td>
                <td className="table-cell text-slate-500">{t.observacao || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="table-cell text-center text-slate-500 py-10">
                  Nenhum treinamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

