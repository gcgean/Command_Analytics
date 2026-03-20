import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSegmento, setFilterSegmento] = useState('')
  const [filterCurva, setFilterCurva] = useState('')

  useEffect(() => {
    api.getClientes().then(d => { setClientes(d); setLoading(false) })
  }, [])

  const filtered = clientes.filter(c => {
    const matchSearch = !search ||
      (c.nome ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.cnpj ?? '').includes(search) ||
      (c.cidade ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || getClienteStatus(c) === filterStatus
    const matchSeg = !filterSegmento || true // segmento field removed from API
    const matchCurva = !filterCurva || (c.curvaABC ?? '') === filterCurva
    return matchSearch && matchStatus && matchSeg && matchCurva
  })

  const totalMRR = filtered.reduce((s, c) => s + Number(c.mensalidade ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: filtered.length, color: 'text-slate-100' },
          { label: 'Ativos', value: filtered.filter(c => getClienteStatus(c) === 'Ativo').length, color: 'text-emerald-400' },
          { label: 'Bloqueados', value: filtered.filter(c => getClienteStatus(c) === 'Bloqueado').length, color: 'text-red-400' },
          { label: 'MRR filtrado', value: `R$ ${totalMRR.toLocaleString('pt-BR')}`, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

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
            options={['Varejo', 'Atacado', 'Serviços', 'Indústria', 'Farmácia', 'Posto'].map(s => ({ value: s, label: s }))}
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
        {(search || filterStatus || filterSegmento || filterCurva) && (
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterSegmento(''); setFilterCurva('') }}>
            Limpar
          </Button>
        )}
        <div className="flex-1" />
        <Button icon={<Plus className="w-4 h-4" />}>Novo Cliente</Button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
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
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum cliente encontrado.</td></tr>
                ) : (
                  filtered.map(c => (
                    <tr
                      key={c.id}
                      className="table-row cursor-pointer"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                    >
                      <td className="table-cell font-mono text-slate-400 text-xs">{c.id}</td>
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-slate-200 truncate max-w-[200px]">{c.nome ?? '—'}</p>
                          <p className="text-xs text-slate-500 truncate">{c.responsavel ?? ''}</p>
                        </div>
                      </td>
                      <td className="table-cell font-mono text-xs text-slate-400">{c.cnpj ?? '—'}</td>
                      <td className="table-cell text-slate-300">{c.cidade ?? '—'}/{c.uf ?? '—'}</td>
                      <td className="table-cell">
                        <span className="text-xs text-slate-400">—</span>
                      </td>
                      <td className="table-cell">
                        <span className="text-xs font-medium text-blue-400">
                          {c.idPlano ? `Plano ${c.idPlano}` : '—'}
                        </span>
                      </td>
                      <td className="table-cell font-medium text-slate-200">
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
          </div>
        )}
      </div>
    </div>
  )
}
