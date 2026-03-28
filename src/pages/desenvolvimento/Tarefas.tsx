import { useState, useEffect } from 'react'
import { Plus, Code2, Bug, ChevronUp, ChevronDown, Minus, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

// MySQL tarefa: status is int, prioridade is char(1)
const STATUS_LABEL: Record<number, string> = {
  0: 'Pendente', 1: 'Em Desenvolvimento', 2: 'Em Teste', 3: 'Concluída', 4: 'Cancelada',
}
const STATUS_FILTRO = ['Pendente', 'Em Desenvolvimento', 'Em Teste', 'Concluída']

const prioridadeCor: Record<string, string> = {
  A: 'bg-red-500/20 text-red-400 border border-red-500/30',
  B: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  C: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  D: 'bg-slate-500/20 text-slate-600 dark:text-slate-400',
}

const statusCor: Record<string, string> = {
  'Pendente': 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  'Em Desenvolvimento': 'bg-blue-500/20 text-blue-400',
  'Em Teste': 'bg-amber-500/20 text-amber-400',
  'Concluída': 'bg-emerald-500/20 text-emerald-400',
  'Cancelada': 'bg-red-500/20 text-red-400',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

export function Tarefas() {
  const { toast } = useToast()
  const [tarefas, setTarefas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('')

  useEffect(() => {
    api.getTarefas().then((data: any) => {
      setTarefas(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  // status is int: 0=Pendente, 1=Em Desenvolvimento, 2=Em Teste, 3=Concluída, 4=Cancelada
  const filtradas = tarefas.filter(t => {
    const statusLabel = STATUS_LABEL[t.status ?? 0] ?? ''
    return (!filtroStatus || statusLabel === filtroStatus) &&
           (!filtroPrioridade || t.prioridade === filtroPrioridade)
  })

  const PrioridadeIcon = ({ p }: { p: string }) => {
    if (p === 'A') return <ChevronUp size={14} className="text-red-400" />
    if (p === 'B') return <Minus size={14} className="text-amber-400" />
    return <ChevronDown size={14} className="text-blue-400" />
  }

  const handleNova = () => {
    setTimeout(() => toast.success('Tarefa criada com sucesso!'), 800)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Desenvolvimento de Software</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Gestão de tarefas e bugs</p>
        </div>
        <button className="btn-primary" onClick={handleNova}><Plus size={16} /> Nova Tarefa</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Pendentes', val: tarefas.filter(t => (t.status ?? 0) === 0).length, cor: 'text-slate-600 dark:text-slate-400' },
          { label: 'Em Desenvolvimento', val: tarefas.filter(t => t.status === 1).length, cor: 'text-blue-400' },
          { label: 'Em Teste', val: tarefas.filter(t => t.status === 2).length, cor: 'text-amber-400' },
          { label: 'Prioridade Alta (A)', val: tarefas.filter(t => t.prioridade === 'A').length, cor: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select className="input-field max-w-[180px]" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos status</option>
          {STATUS_FILTRO.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-field max-w-[180px]" value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
          <option value="">Todas prioridades</option>
          {['A', 'B', 'C', 'D'].map(p => <option key={p} value={p}>Prioridade {p}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtradas.map(t => (
          <div key={t.id} className="card border border-slate-700 hover:border-slate-600 transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-0.5">
                {t.isBug ? <Bug size={18} className="text-red-400" /> : <Code2 size={18} className="text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`badge text-xs ${prioridadeCor[t.prioridade ?? ''] || 'bg-slate-700 text-slate-400'}`}>
                    <PrioridadeIcon p={t.prioridade ?? 'C'} /> {t.prioridade ?? '?'}
                  </span>
                  <span className={`badge text-xs ${statusCor[STATUS_LABEL[t.status ?? 0] ?? ''] || 'bg-slate-700 text-slate-400'}`}>
                    {STATUS_LABEL[t.status ?? 0] ?? `Status ${t.status}`}
                  </span>
                  {t.segmentoId && <span className="badge bg-slate-700 text-slate-400 text-xs">Seg. {t.segmentoId}</span>}
                  {t.isBug && <span className="badge bg-red-500/20 text-red-400 text-xs">Bug</span>}
                </div>
                <p className="text-sm text-slate-200 mb-2">{t.descricao}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  {t.softwareId && <span>Software #{t.softwareId}</span>}
                  {t.clienteNome && <span>Cliente: {t.clienteNome}</span>}
                  {t.dataInicial && <span>Início: {formatDate(t.dataInicial)}</span>}
                  {t.dataFinal && <span>Prazo: {formatDate(t.dataFinal)}</span>}
                </div>
                {(t.status === 1 || t.status === 2) && Number(t.percentualConclusao) > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Progresso</span><span>{t.percentualConclusao}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${t.percentualConclusao}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
