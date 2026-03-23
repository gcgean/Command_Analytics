import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Headphones, AlertTriangle, TrendingUp, DollarSign,
  Users, Clock, Shield, Calendar, ChevronRight
} from 'lucide-react'
import { KPICard } from '../../components/ui/KPICard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { api } from '../../services/api'
import { useNavigate } from 'react-router-dom'
import type { StatusAtendimento, Atendimento, AgendaItem, Cliente } from '../../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface KPIData {
  atendimentosHoje: number
  atendimentosAbertos: number
  npsMedia: number
  mrr: number
  clientesAtivos: number
  chamadosUrgentes: number
  atendimentosPorDepartamento: { departamento: string; count: number }[]
  mrrHistorico: { mes: string; mrr: number }[]
}

const tipoContatoIcons: Record<string, string> = {
  WhatsApp: '💬',
  Telefone: '📞',
  'E-mail': '📧',
  Presencial: '🤝',
  'Outras Mídias': '📱',
}

function formatTime(t: any): string {
  if (!t) return ''
  
  if (typeof t === 'string') {
    // Se a string contiver a data e a hora "1970-01-01T09:00:00.000Z", extraímos a hora
    if (t.startsWith('1970-') && (!t.includes('T') || t.includes('T00:00:00'))) return ''
    if (t.includes('T')) {
      const match = t.match(/T(\d{2}:\d{2})/)
      if (match) return match[1]
    }
    // Se for string no formato "HH:MM:SS" ou "HH:MM", retornar
    if (t.includes(':')) return t.substring(0, 5)
  }
  
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function getAgendaStatusLabel(status: number | null | undefined): string {
  if (status === 1) return 'Aguardando'
  if (status === 2) return 'Finalizado'
  return 'Não Finalizado'
}

export function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>([])
  const [ultimosAtendimentos, setUltimosAtendimentos] = useState<Atendimento[]>([])

  useEffect(() => {
    const hoje = format(new Date(), 'yyyy-MM-dd')
    Promise.all([
      api.getDashboardKPIs(),
      api.getClientes(),
      api.getAgenda({ data: hoje }),
      api.getAtendimentos({ limit: '6' }),
    ]).then(([kpiData, clientesData, agendaData, atendimentosData]) => {
      setKpis(kpiData as KPIData)
      setClientes(clientesData as Cliente[])
      setAgendaHoje(agendaData as AgendaItem[])
      setUltimosAtendimentos((atendimentosData as any).data?.slice(0, 6) ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // certificadoVencimento field no longer exists — use empty array
  const certVencendo: any[] = []

  const formatMRR = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Atendimentos Hoje"
          value={kpis?.atendimentosHoje ?? 0}
          icon={<Headphones className="w-5 h-5" />}
          color="blue"
          trend={{ value: 12, label: 'vs ontem', positive: true }}
        />
        <KPICard
          title="Abertos"
          value={kpis?.atendimentosAbertos ?? 0}
          icon={<Clock className="w-5 h-5" />}
          color="amber"
          subtitle="Aguardando resolução"
        />
        <KPICard
          title="NPS Médio"
          value={`${kpis?.npsMedia ?? 0} pts`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="green"
          trend={{ value: 3, label: 'vs mês anterior', positive: true }}
        />
        <KPICard
          title="MRR"
          value={`R$ ${(kpis?.mrr ?? 0).toLocaleString('pt-BR')}`}
          icon={<DollarSign className="w-5 h-5" />}
          color="purple"
          trend={{ value: 4.7, label: 'vs mês anterior', positive: true }}
        />
        <KPICard
          title="Clientes Ativos"
          value={kpis?.clientesAtivos ?? 0}
          icon={<Users className="w-5 h-5" />}
          color="cyan"
          subtitle="Contratos vigentes"
        />
        <KPICard
          title="Chamados Urgentes"
          value={kpis?.chamadosUrgentes ?? 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          subtitle="Requerem atenção"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Atendimentos por Departamento */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Atendimentos por Departamento (últimos 7 dias)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={kpis?.atendimentosPorDepartamento} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="departamento" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="count" name="Atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* MRR Histórico */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">MRR — Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={kpis?.mrrHistorico} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'MRR']}
              />
              <Line
                type="monotone"
                dataKey="mrr"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Certificados Vencendo */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-100">Certificados Vencendo</h3>
            </div>
            <span className="badge bg-amber-500/20 text-amber-400">{certVencendo.length}</span>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-center py-4">Nenhum certificado próximo ao vencimento.</p>
          </div>
        </div>

        {/* Agenda do Dia */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-100">Agenda do Dia</h3>
            </div>
            <button onClick={() => navigate('/agenda')} className="text-xs text-blue-400 hover:text-blue-300">
              Ver tudo
            </button>
          </div>
          <div className="space-y-3">
            {agendaHoje.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum compromisso hoje.</p>
            ) : (
              agendaHoje.map(a => {
                const statusLabel = getAgendaStatusLabel(a.status as number | null)
                return (
                  <div key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-700 last:border-0">
                    <div className="flex-shrink-0 text-center">
                      <span className="block text-xs font-bold text-blue-400">{formatTime(a.horarioIni)}</span>
                      {String(a.data).startsWith('1970') ? null : (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {new Date(String(a.data) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{a.clienteNome}</p>
                      <p className="text-xs text-slate-500">{a.tipo ?? '—'} · {a.tecnicoNome}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusLabel === 'Aguardando' ? 'bg-amber-500/20 text-amber-400' : statusLabel === 'Finalizado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {statusLabel}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Últimos Atendimentos */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-100">Últimos Atendimentos</h3>
            </div>
            <button onClick={() => navigate('/atendimentos')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              Ver todos <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {ultimosAtendimentos.map(a => (
              <div
                key={a.id}
                onClick={() => navigate('/atendimentos')}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors"
              >
                <span className="text-sm flex-shrink-0">💬</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{a.clienteNome?.substring(0, 30)}</p>
                  <p className="text-xs text-slate-500 truncate">{a.tecnicoNome}</p>
                </div>
                <StatusBadge status={a.status as StatusAtendimento} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
