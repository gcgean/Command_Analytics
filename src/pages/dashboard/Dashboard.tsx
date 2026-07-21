import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Headphones, AlertTriangle, TrendingUp, DollarSign,
  Users, Clock, Shield, Calendar, ChevronRight, Award, Building2, Trophy
} from 'lucide-react'
import { KPICard } from '../../components/ui/KPICard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { api } from '../../services/api'
import { useNavigate } from 'react-router-dom'
import type { StatusAtendimento, Atendimento, AgendaItem, Cliente, DesempenhoEquipe } from '../../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

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
  const [errorMessage, setErrorMessage] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>([])
  const [ultimosAtendimentos, setUltimosAtendimentos] = useState<Atendimento[]>([])
  const [desempenho, setDesempenho] = useState<DesempenhoEquipe | null>(null)
  const [desempenhoMeses, setDesempenhoMeses] = useState(12)
  const [desempenhoLoading, setDesempenhoLoading] = useState(true)

  useEffect(() => {
    const hoje = format(new Date(), 'yyyy-MM-dd')
    setErrorMessage('')
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
    }).catch((error: any) => {
      setErrorMessage(error?.message || 'Não foi possível carregar o dashboard.')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    setDesempenhoLoading(true)
    api.getDesempenhoEquipe(desempenhoMeses)
      .then((d) => setDesempenho(d))
      .catch(() => setDesempenho(null))
      .finally(() => setDesempenhoLoading(false))
  }, [desempenhoMeses])

  // certificadoVencimento field no longer exists — use empty array
  const certVencendo: any[] = []

  const formatMRR = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  const isDarkMode = document.documentElement.classList.contains('dark')

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {errorMessage}
        </div>
      )}

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
        <div className="card transition-colors duration-300">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Atendimentos por Departamento (últimos 7 dias)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={kpis?.atendimentosPorDepartamento} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} />
              <XAxis dataKey="departamento" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', 
                  border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, 
                  borderRadius: '8px', 
                  fontSize: '12px',
                  boxShadow: isDarkMode ? 'none' : '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
                itemStyle={{ color: isDarkMode ? '#94a3b8' : '#475569' }}
              />
              <Bar dataKey="count" name="Atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* MRR Histórico */}
        <div className="card transition-colors duration-300">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">MRR — Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={kpis?.mrrHistorico} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} />
              <XAxis dataKey="mes" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', 
                  border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, 
                  borderRadius: '8px', 
                  fontSize: '12px',
                  boxShadow: isDarkMode ? 'none' : '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
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
        <div className="card transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Certificados Vencendo</h3>
            </div>
            <span className="badge bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">{certVencendo.length}</span>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-center py-4">Nenhum certificado próximo ao vencimento.</p>
          </div>
        </div>

        {/* Agenda do Dia */}
        <div className="card transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agenda do Dia</h3>
            </div>
            <button onClick={() => navigate('/agenda')} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
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
                  <div key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div className="flex-shrink-0 text-center">
                      <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">{formatTime(a.horarioIni)}</span>
                      {String(a.data).startsWith('1970') ? null : (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {new Date(String(a.data) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{a.clienteNome}</p>
                      <p className="text-xs text-slate-500">{a.tipo ?? '—'} · {a.tecnicoNome}</p>
                    </div>
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium',
                      statusLabel === 'Aguardando' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 
                      statusLabel === 'Finalizado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 
                      'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    )}>
                      {statusLabel}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Últimos Atendimentos */}
        <div className="card transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Últimos Atendimentos</h3>
            </div>
            <button onClick={() => navigate('/atendimentos')} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 font-medium">
              Ver todos <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {ultimosAtendimentos.map(a => (
              <div
                key={a.id}
                onClick={() => navigate('/atendimentos')}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
              >
                <span className="text-sm flex-shrink-0">💬</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{a.clienteNome?.substring(0, 30)}</p>
                  <p className="text-xs text-slate-500 truncate">{a.tecnicoNome}</p>
                </div>
                <StatusBadge status={a.status as StatusAtendimento} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desempenho da Equipe */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Desempenho da Equipe</h2>
            <span className="text-xs text-slate-500">
              {desempenho ? `${(desempenho.totalAtendimentos).toLocaleString('pt-BR')} atendimentos no período` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            {[6, 12, 24].map(m => (
              <button
                key={m}
                onClick={() => setDesempenhoMeses(m)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  desempenhoMeses === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                {m} meses
              </button>
            ))}
          </div>
        </div>

        {desempenhoLoading ? (
          <div className="card flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !desempenho ? (
          <div className="card text-sm text-slate-500 text-center py-8">Não foi possível carregar o desempenho.</div>
        ) : (
          <>
            {/* Evolução mensal */}
            <div className="card transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Evolução mensal de atendimentos</h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={desempenho.evolucaoMensal} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="label" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
                    formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Atendimentos']}
                  />
                  <Line type="monotone" dataKey="total" name="Atendimentos" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Ranking de técnicos */}
              <div className="card transition-colors duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ranking de técnicos (volume)</h3>
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {desempenho.rankingTecnicos.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">Sem dados no período.</p>
                  ) : (
                    (() => {
                      const maxTotal = desempenho.rankingTecnicos[0]?.total || 1
                      return desempenho.rankingTecnicos.map((t, i) => (
                        <div key={t.tecnicoId ?? `x${i}`} className="flex items-center gap-3">
                          <span className={clsx(
                            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
                            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                              : i === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                              : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          )}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{t.tecnicoNome}</span>
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.total.toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(3, (t.total / maxTotal) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      ))
                    })()
                  )}
                </div>
              </div>

              {/* Volume por setor */}
              <div className="card transition-colors duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Volume por setor</h3>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={desempenho.porSetor} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} horizontal={false} />
                    <XAxis type="number" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" width={92} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
                      formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Atendimentos']}
                    />
                    <Bar dataKey="total" name="Atendimentos" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Notas de treinamento */}
            <div className="card transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Qualidade — nota média de treinamentos</h3>
                <span className="text-xs text-slate-500">(por técnico, no período)</span>
              </div>
              {desempenho.notasTreinamento.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma nota de treinamento lançada no período.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {desempenho.notasTreinamento.map((n, i) => (
                    <div key={n.tecnicoId} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{n.tecnicoNome}</p>
                        <p className="text-[11px] text-slate-500">{n.avaliacoes} {n.avaliacoes === 1 ? 'avaliação' : 'avaliações'}</p>
                      </div>
                      <span className={clsx(
                        'flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                        n.media >= 9 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                          : n.media >= 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                      )}>{n.media.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
