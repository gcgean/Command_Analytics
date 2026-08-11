import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Server, Wifi, WifiOff, HardDrive, Cpu, MemoryStick, RefreshCw, Loader2, Lock, Unlock } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'

interface HistoricoEntry {
  id: number
  cpuPercent?: number | null
  ramPercent?: number | null
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
  somenteAdmin?: boolean | null
  valor?: number | null
  historico?: HistoricoEntry[]
}

// Agrupa o histórico bruto (a cada ~5min) em até 24 baldes de 1h, com a média de cada hora,
// pra o gráfico não ficar poluído com centenas de pontos.
function bucketsPorHora(hist: HistoricoEntry[]) {
  // Usa o timestamp mais recente do próprio histórico como referência de "agora", em vez do
  // relógio do navegador — o backend/banco tem um desvio de fuso horário conhecido, então
  // comparar com Date.now() faz pontos recentes parecerem "no futuro" e serem descartados.
  const timestamps = hist.map(h => (h.dataConsulta ? new Date(h.dataConsulta).getTime() : null)).filter((t): t is number => t !== null)
  if (timestamps.length === 0) return { cpu: [], ram: [] }
  const agora = Math.max(...timestamps)
  const somas = new Map<number, { cpuSoma: number; cpuQtd: number; ramSoma: number; ramQtd: number }>()

  for (const h of hist) {
    if (!h.dataConsulta) continue
    const horasAtras = Math.floor((agora - new Date(h.dataConsulta).getTime()) / (60 * 60 * 1000))
    if (horasAtras < 0 || horasAtras > 23) continue
    const bucket = 23 - horasAtras
    const atual = somas.get(bucket) ?? { cpuSoma: 0, cpuQtd: 0, ramSoma: 0, ramQtd: 0 }
    if (h.cpuPercent !== null && h.cpuPercent !== undefined) {
      atual.cpuSoma += Number(h.cpuPercent)
      atual.cpuQtd += 1
    }
    if (h.ramPercent !== null && h.ramPercent !== undefined) {
      atual.ramSoma += Number(h.ramPercent)
      atual.ramQtd += 1
    }
    somas.set(bucket, atual)
  }

  const cpu: Array<{ t: number; v: number | null; hora: string }> = []
  const ram: Array<{ t: number; v: number | null; hora: string }> = []
  for (let i = 0; i < 24; i++) {
    const b = somas.get(i)
    const hora = new Date(agora - (23 - i) * 60 * 60 * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    cpu.push({ t: i, v: b && b.cpuQtd > 0 ? Math.round((b.cpuSoma / b.cpuQtd) * 10) / 10 : null, hora })
    ram.push({ t: i, v: b && b.ramQtd > 0 ? Math.round((b.ramSoma / b.ramQtd) * 10) / 10 : null, hora })
  }
  return { cpu, ram }
}

function resumoSerie(pontos: Array<{ v: number | null }>) {
  const valores = pontos.map(p => p.v).filter((v): v is number => v !== null)
  if (valores.length === 0) return null
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const media = valores.reduce((a, v) => a + v, 0) / valores.length
  return { min: Math.round(min), max: Math.round(max), media: Math.round(media) }
}

function MetricBar({ val, cor }: { val: number; cor: string }) {
  const v = Math.min(Math.max(val || 0, 0), 100)
  const color = v > 80 ? 'bg-red-500' : v > 60 ? 'bg-amber-500' : cor
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`text-xs font-medium w-8 text-right ${v > 80 ? 'text-red-400' : v > 60 ? 'text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>{v}%</span>
    </div>
  )
}

function RankingConsumo({ servidores }: { servidores: ServidorMysql[] }) {
  const ranqueaveis = servidores
    .filter(s => s.online && !s.desativado)
    .map(s => {
      const discoTotal = Number(s.discoTotal ?? 0)
      const discoLivre = Number(s.discoLivre ?? 0)
      const discoPercent = discoTotal > 0 ? Math.round(((discoTotal - discoLivre) / discoTotal) * 100) : 0
      const cpuPercent = Math.round(Number(s.cpuPercent ?? 0))
      const ramPercent = Math.round(Number(s.ramPercent ?? 0))
      const score = Math.round((cpuPercent + ramPercent + discoPercent) / 3)
      const metricas = [
        { label: 'CPU', val: cpuPercent },
        { label: 'RAM', val: ramPercent },
        { label: 'Disco', val: discoPercent },
      ]
      const gargalo = metricas.reduce((pior, m) => (m.val > pior.val ? m : pior), metricas[0])
      return { servidor: s, cpuPercent, ramPercent, discoPercent, score, gargalo }
    })
    .sort((a, b) => b.score - a.score)

  const semDados = servidores.filter(s => !s.online || s.desativado)

  const corScore = (score: number) => (score > 80 ? 'text-red-400' : score > 60 ? 'text-amber-400' : 'text-emerald-400')
  const bgScore = (score: number) => (score > 80 ? 'bg-red-500/10 border-red-500/30' : score > 60 ? 'bg-amber-500/10 border-amber-500/30' : 'border-slate-200 dark:border-slate-700')

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Ordenado do maior consumo médio (CPU + RAM + Disco) para o menor — servidores hospedam bancos Firebird 5 dos clientes, então disco cheio ou CPU/RAM no limite afeta o sistema deles diretamente.
      </p>
      <div className="space-y-2">
        {ranqueaveis.map((r, i) => (
          <div key={r.servidor.id} className={clsx('card flex items-center gap-4 border', bgScore(r.score))}>
            <div className="w-8 text-center">
              <span className="text-lg font-bold text-slate-400">{i + 1}º</span>
            </div>
            <div className="w-44 shrink-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.servidor.nome ?? 'Servidor'}</p>
              <p className="text-xs text-slate-500">{r.servidor.dns}</p>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-4">
              {[
                { label: 'CPU', val: r.cpuPercent, cor: 'bg-blue-500' },
                { label: 'RAM', val: r.ramPercent, cor: 'bg-purple-500' },
                { label: 'Disco', val: r.discoPercent, cor: 'bg-cyan-500' },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>{m.label}</span>
                    {r.gargalo.label === m.label && m.val > 60 && (
                      <span className="text-red-400 font-medium">gargalo</span>
                    )}
                  </div>
                  <MetricBar val={m.val} cor={m.cor} />
                </div>
              ))}
            </div>
            <div className="w-16 text-right">
              <p className={clsx('text-xl font-bold', corScore(r.score))}>{r.score}%</p>
              <p className="text-xs text-slate-500">médio</p>
            </div>
          </div>
        ))}
        {ranqueaveis.length === 0 && (
          <div className="card text-center py-8 text-sm text-slate-500">Nenhum servidor online com dados para ranquear.</div>
        )}
      </div>
      {semDados.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Fora do ranking (offline/desativado/sem dados):</p>
          <div className="flex flex-wrap gap-2">
            {semDados.map(s => (
              <span key={s.id} className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                {s.nome ?? `Servidor ${s.id}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Servidores() {
  const { isSuperUser } = usePermissions()
  const [servidores, setServidores] = useState<ServidorMysql[]>([])
  const [loading, setLoading] = useState(true)
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [alternandoVisibilidade, setAlternandoVisibilidade] = useState<number | null>(null)
  const [aba, setAba] = useState<'cards' | 'ranking'>('cards')

  const carregar = () => {
    setLoading(true)
    api.getServidores().then((data: any) => {
      setServidores(Array.isArray(data) ? data : data.data ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  const handleToggleSomenteAdmin = async (s: ServidorMysql) => {
    const acao = s.somenteAdmin ? 'liberar esse servidor para todos os usuários' : 'restringir esse servidor para admins apenas'
    if (!window.confirm(`Deseja ${acao} ("${s.nome}")?`)) return
    setAlternandoVisibilidade(s.id)
    try {
      await api.toggleServidorSomenteAdmin(s.id)
      carregar()
    } catch (e: any) {
      window.alert(e?.message || 'Falha ao alterar a visibilidade.')
    } finally {
      setAlternandoVisibilidade(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const visiveis = somenteAtivos ? servidores.filter(s => !s.desativado) : servidores
  const onlines = visiveis.filter(s => s.online && !s.desativado).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Servidores em Nuvem</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{onlines}/{visiveis.length} servidores online</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={somenteAtivos}
              onChange={(e) => setSomenteAtivos(e.target.checked)}
              className="accent-blue-600"
            />
            Somente ativos
          </label>
          <button className="btn-secondary flex items-center gap-2" onClick={carregar}>
            <RefreshCw size={16} /> Verificar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Online', val: onlines, cor: 'text-emerald-400' },
          { label: 'Offline', val: visiveis.length - onlines, cor: 'text-red-400' },
          {
            label: 'CPU Médio',
            val: `${Math.round(visiveis.filter(s => s.online).reduce((a, s) => a + Number(s.cpuPercent ?? 0), 0) / Math.max(onlines, 1))}%`,
            cor: 'text-blue-400',
          },
          {
            label: 'RAM Médio',
            val: `${Math.round(visiveis.filter(s => s.online).reduce((a, s) => a + Number(s.ramPercent ?? 0), 0) / Math.max(onlines, 1))}%`,
            cor: 'text-amber-400',
          },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-600 dark:text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            aba === 'cards' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
          onClick={() => setAba('cards')}
        >
          Servidores
        </button>
        <button
          type="button"
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            aba === 'ranking' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
          onClick={() => setAba('ranking')}
        >
          Ranking de consumo
        </button>
      </div>

      {aba === 'ranking' && <RankingConsumo servidores={visiveis} />}

      {/* Grid de servidores */}
      {aba === 'cards' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visiveis.map(s => {
          const { cpu: sparkDataCpu, ram: sparkDataRam } = bucketsPorHora(s.historico ?? [])
          const discoTotal = Number(s.discoTotal ?? 0)
          const discoLivre = Number(s.discoLivre ?? 0)
          const discoUsado = discoTotal - discoLivre
          const discoPer = discoTotal > 0 ? Math.round((discoUsado / discoTotal) * 100) : 0
          const ultimaVerif = s.historico?.[0]?.dataConsulta ?? null

          return (
            <div key={s.id} className={`card border-2 ${s.online && !s.desativado ? 'border-slate-200 dark:border-slate-700' : 'border-red-500/30'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${s.online ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <Server size={20} className={s.online ? 'text-emerald-400' : 'text-red-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.nome ?? 'Servidor'}</p>
                      {s.online && !s.desativado
                        ? <span className="flex items-center gap-1 badge bg-emerald-500/20 text-emerald-400 text-xs"><Wifi size={10} /> Online</span>
                        : <span className="flex items-center gap-1 badge bg-red-500/20 text-red-400 text-xs"><WifiOff size={10} /> Offline</span>}
                      {s.somenteAdmin && (
                        <span className="flex items-center gap-1 badge bg-purple-500/20 text-purple-400 text-xs"><Lock size={10} /> Somente admin</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{s.descricao}</p>
                    <p className="text-xs text-slate-600">{s.dns}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500 flex flex-col items-end gap-1">
                  {isSuperUser && (
                    <button
                      type="button"
                      className="btn-secondary flex items-center gap-1 !py-1 !px-2 text-xs"
                      onClick={() => handleToggleSomenteAdmin(s)}
                      disabled={alternandoVisibilidade === s.id}
                    >
                      {alternandoVisibilidade === s.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : s.somenteAdmin ? (
                        <Lock size={11} />
                      ) : (
                        <Unlock size={11} />
                      )}
                      {s.somenteAdmin ? 'Restrito' : 'Visível a todos'}
                    </button>
                  )}
                  {s.anydesk && <p>AnyDesk: {s.anydesk}</p>}
                  {ultimaVerif && (
                    <p>Última atualização: {new Date(ultimaVerif).toLocaleString('pt-BR')}</p>
                  )}
                </div>
              </div>

              {s.online && !s.desativado && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mb-1"><Cpu size={11} /> CPU</div>
                      <MetricBar val={Number(s.cpuPercent ?? 0)} cor="bg-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mb-1"><MemoryStick size={11} /> RAM</div>
                      <MetricBar val={Number(s.ramPercent ?? 0)} cor="bg-purple-500" />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                        <span className="flex items-center gap-1"><HardDrive size={11} /> Disco {s.driveDisco ?? ''}</span>
                        <span>{discoUsado.toFixed(1)}GB / {discoTotal.toFixed(1)}GB livres</span>
                      </div>
                      <MetricBar val={discoPer} cor="bg-cyan-500" />
                    </div>
                  </div>

                  {(sparkDataCpu.some(p => p.v !== null) || sparkDataRam.some(p => p.v !== null)) && (() => {
                    const resumoCpu = resumoSerie(sparkDataCpu)
                    const resumoRam = resumoSerie(sparkDataRam)
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slate-500">CPU (24h)</p>
                            {resumoCpu && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                mín <span className="font-medium">{resumoCpu.min}%</span> · méd <span className="font-medium">{resumoCpu.media}%</span> · pico <span className={clsx('font-semibold', resumoCpu.max > 80 ? 'text-red-400' : resumoCpu.max > 60 ? 'text-amber-400' : 'text-slate-700 dark:text-slate-300')}>{resumoCpu.max}%</span>
                              </p>
                            )}
                          </div>
                          <ResponsiveContainer width="100%" height={50}>
                            <LineChart data={sparkDataCpu}>
                              <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
                              <XAxis hide /><YAxis hide domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 11, color: '#94a3b8' }}
                                formatter={(v: number) => [`${v.toFixed(0)}%`, 'CPU']}
                                labelFormatter={(_t: number, payload) => payload?.[0]?.payload?.hora ?? ''}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slate-500">RAM (24h)</p>
                            {resumoRam && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                mín <span className="font-medium">{resumoRam.min}%</span> · méd <span className="font-medium">{resumoRam.media}%</span> · pico <span className={clsx('font-semibold', resumoRam.max > 80 ? 'text-red-400' : resumoRam.max > 60 ? 'text-amber-400' : 'text-slate-700 dark:text-slate-300')}>{resumoRam.max}%</span>
                              </p>
                            )}
                          </div>
                          <ResponsiveContainer width="100%" height={50}>
                            <LineChart data={sparkDataRam}>
                              <Line type="monotone" dataKey="v" stroke="#a855f7" strokeWidth={1.5} dot={false} connectNulls />
                              <XAxis hide /><YAxis hide domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 11, color: '#94a3b8' }}
                                formatter={(v: number) => [`${v.toFixed(0)}%`, 'RAM']}
                                labelFormatter={(_t: number, payload) => payload?.[0]?.payload?.hora ?? ''}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )
                  })()}
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
      )}
    </div>
  )
}
