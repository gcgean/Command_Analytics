import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Server, Wifi, WifiOff, HardDrive, Cpu, MemoryStick, RefreshCw, Loader2 } from 'lucide-react'
import { api } from '../../services/api'

interface HistoricoEntry {
  id: number
  usoCpu?: number | null
  usoMemoria?: number | null
  online?: number | null
  dataConsulta?: string | null
}

interface ServidorMysql {
  id: number
  nome?: string | null
  descricao?: string | null
  dns?: string | null
  online?: boolean | null
  cpuPercent?: number | null
  ramPercent?: number | null
  discoTotal?: number | null
  discoLivre?: number | null
  driveDisco?: string | null
  anydesk?: string | null
  desativado?: boolean | null
  valor?: number | null
  historico?: HistoricoEntry[]
}

function MetricBar({ val, cor }: { val: number; cor: string }) {
  const v = Math.min(Math.max(val || 0, 0), 100)
  const color = v > 80 ? 'bg-red-500' : v > 60 ? 'bg-amber-500' : cor
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`text-xs font-medium w-8 text-right ${v > 80 ? 'text-red-400' : v > 60 ? 'text-amber-400' : 'text-slate-300'}`}>{v}%</span>
    </div>
  )
}

export function Servidores() {
  const [servidores, setServidores] = useState<ServidorMysql[]>([])
  const [loading, setLoading] = useState(true)

  const carregar = () => {
    setLoading(true)
    api.getServidores().then((data: any) => {
      setServidores(Array.isArray(data) ? data : data.data ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const onlines = servidores.filter(s => s.online && !s.desativado).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Servidores em Nuvem</h1>
          <p className="text-slate-400 text-sm mt-1">{onlines}/{servidores.length} servidores online</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={carregar}>
          <RefreshCw size={16} /> Verificar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Online', val: onlines, cor: 'text-emerald-400' },
          { label: 'Offline', val: servidores.length - onlines, cor: 'text-red-400' },
          {
            label: 'CPU Médio',
            val: `${Math.round(servidores.filter(s => s.online).reduce((a, s) => a + Number(s.cpuPercent ?? 0), 0) / Math.max(onlines, 1))}%`,
            cor: 'text-blue-400',
          },
          {
            label: 'RAM Médio',
            val: `${Math.round(servidores.filter(s => s.online).reduce((a, s) => a + Number(s.ramPercent ?? 0), 0) / Math.max(onlines, 1))}%`,
            cor: 'text-amber-400',
          },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Grid de servidores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {servidores.map(s => {
          const hist = s.historico ?? []
          const sparkData = hist.map((h, i) => ({ t: i, v: Number(h.usoCpu ?? 0) }))
          const discoTotal = Number(s.discoTotal ?? 0)
          const discoLivre = Number(s.discoLivre ?? 0)
          const discoUsado = discoTotal - discoLivre
          const discoPer = discoTotal > 0 ? Math.round((discoUsado / discoTotal) * 100) : 0
          const ultimaVerif = hist.length > 0 ? hist[hist.length - 1]?.dataConsulta : null

          return (
            <div key={s.id} className={`card border-2 ${s.online && !s.desativado ? 'border-slate-700' : 'border-red-500/30'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${s.online ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <Server size={20} className={s.online ? 'text-emerald-400' : 'text-red-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-100">{s.nome ?? 'Servidor'}</p>
                      {s.online && !s.desativado
                        ? <span className="flex items-center gap-1 badge bg-emerald-500/20 text-emerald-400 text-xs"><Wifi size={10} /> Online</span>
                        : <span className="flex items-center gap-1 badge bg-red-500/20 text-red-400 text-xs"><WifiOff size={10} /> Offline</span>}
                    </div>
                    <p className="text-xs text-slate-500">{s.descricao}</p>
                    <p className="text-xs text-slate-600">{s.dns}</p>
                  </div>
                </div>
                {s.anydesk && (
                  <div className="text-right text-xs text-slate-500">
                    <p>AnyDesk: {s.anydesk}</p>
                  </div>
                )}
              </div>

              {s.online && !s.desativado && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-400 mb-1"><Cpu size={11} /> CPU</div>
                      <MetricBar val={Number(s.cpuPercent ?? 0)} cor="bg-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-400 mb-1"><MemoryStick size={11} /> RAM</div>
                      <MetricBar val={Number(s.ramPercent ?? 0)} cor="bg-purple-500" />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span className="flex items-center gap-1"><HardDrive size={11} /> Disco {s.driveDisco ?? ''}</span>
                        <span>{discoUsado.toFixed(1)}GB / {discoTotal.toFixed(1)}GB livres</span>
                      </div>
                      <MetricBar val={discoPer} cor="bg-cyan-500" />
                    </div>
                  </div>

                  {sparkData.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Histórico CPU</p>
                      <ResponsiveContainer width="100%" height={50}>
                        <LineChart data={sparkData}>
                          <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                          <XAxis hide /><YAxis hide domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 11, color: '#94a3b8' }}
                            formatter={(v: number) => [`${v.toFixed(0)}%`, 'CPU']}
                            labelFormatter={() => ''}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

              {(!s.online || s.desativado) && (
                <div className="text-center py-6 text-red-400 text-sm">
                  <WifiOff size={32} className="mx-auto mb-2 opacity-50" />
                  <p>{s.desativado ? 'Servidor desativado' : 'Servidor inacessível'}</p>
                  {ultimaVerif && (
                    <p className="text-xs text-slate-600 mt-1">
                      Verificado: {new Date(ultimaVerif).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
