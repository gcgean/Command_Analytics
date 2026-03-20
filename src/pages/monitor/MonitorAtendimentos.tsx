import { useState, useEffect } from 'react'
import { MessageCircle, Clock, User, AlertTriangle, RefreshCw, Phone, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import type { MonitorAtendimento } from '../../types'

const departamentos = ['Todos', 'Suporte', 'Fiscal', 'Financeiro', 'Comercial', 'CS', 'Técnico']

const statusCor: Record<string, string> = {
  'Em Atendimento': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  'Aguardando': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  'Resolvido': 'bg-emerald-500/20 text-emerald-400',
}

export function MonitorAtendimentos() {
  const [atendimentos, setAtendimentos] = useState<MonitorAtendimento[]>([])
  const [loading, setLoading] = useState(true)
  const [depto, setDepto] = useState('Todos')

  const carregar = () => {
    setLoading(true)
    api.getMonitor().then((data: any) => {
      setAtendimentos(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const filtrados = atendimentos.filter(a => depto === 'Todos' || a.departamento === depto)
  const urgentes = atendimentos.filter(a => a.tempoEspera > 30 && a.status !== 'Resolvido')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Monitor de Atendimentos</h1>
          <p className="text-slate-400 text-sm mt-1">WhatsApp / CRM em tempo real</p>
        </div>
        <button className="btn-secondary" onClick={carregar}><RefreshCw size={16} /> Atualizar</button>
      </div>

      {/* Alertas urgentes */}
      {urgentes.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{urgentes.length} atendimento(s)</strong> com mais de 30 minutos aguardando:{' '}
            {urgentes.map(u => u.clienteNome).join(', ')}
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Em Atendimento', val: atendimentos.filter(a => a.status === 'Em Atendimento').length, cor: 'text-blue-400' },
          { label: 'Aguardando', val: atendimentos.filter(a => a.status === 'Aguardando').length, cor: 'text-amber-400' },
          { label: 'Resolvidos', val: atendimentos.filter(a => a.status === 'Resolvido').length, cor: 'text-emerald-400' },
          { label: 'Urgentes (+30min)', val: urgentes.length, cor: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtro departamento */}
      <div className="flex gap-2 flex-wrap">
        {departamentos.map(d => (
          <button key={d} onClick={() => setDepto(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${depto === d ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'}`}>
            {d}
          </button>
        ))}
      </div>

      {/* Cards de atendimentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map(a => (
          <div key={a.id} className={`card border ${a.tempoEspera > 30 && a.status !== 'Resolvido' ? 'border-red-500/40' : 'border-slate-700'} transition-colors`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-slate-700 rounded-lg">
                  <MessageCircle size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{a.clienteNome}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} />{a.numero}</p>
                </div>
              </div>
              <span className={`badge text-xs ${statusCor[a.status] || 'bg-slate-700 text-slate-400'}`}>{a.status}</span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <User size={11} />
                  {a.atendente || <em className="text-slate-600">Sem atendente</em>}
                </span>
                <span className="badge bg-slate-700 text-slate-400 text-xs">{a.departamento}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={11} className={a.tempoEspera > 30 ? 'text-red-400' : 'text-slate-500'} />
                <span className={a.tempoEspera > 30 ? 'text-red-400 font-semibold' : ''}>{a.tempoEspera} min espera</span>
                {a.tempoEspera > 30 && <AlertTriangle size={11} className="text-red-400" />}
              </div>
              <p className="text-slate-600 text-xs">{a.mensagens} mensagens</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
