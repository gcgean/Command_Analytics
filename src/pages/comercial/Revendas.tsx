import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  BarChart, Bar, Line, ComposedChart, LineChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Store, Loader2, Save, PlugZap, Search, Table2, RefreshCw, CheckCircle2, AlertTriangle,
  Users, Wallet, TrendingUp, TrendingDown, DownloadCloud, Minus,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useThemeStore } from '../../store/themeStore'
import type { ConfigRevendas, DashboardRevendas, MapaRevendas, TesteRevendas } from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Uma cor por revenda, estável pela posição na lista. */
const CORES = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#ef4444', '#6366f1']
const pct = (v: number | null, casas = 1) => (v === null ? '—' : `${v >= 0 ? '' : ''}${v.toFixed(casas)}%`)
const mesBR = (ym: string) => {
  const [a, m] = ym.split('-')
  return MESES[Number(m)] + '/' + a.slice(2)
}

export function Revendas() {
  const { toast } = useToast()
  const isDark = useThemeStore((s) => s.theme) === 'dark'
  const [aba, setAba] = useState<'dashboard' | 'conexao' | 'mapa'>('dashboard')
  const [painel, setPainel] = useState<DashboardRevendas | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [config, setConfig] = useState<ConfigRevendas | null>(null)
  const [form, setForm] = useState({ host: '', porta: 3306, usuario: '', senha: '', banco: '', ativo: true, horaSync: '03:00' })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<TesteRevendas | null>(null)
  const [mapa, setMapa] = useState<MapaRevendas | null>(null)
  const [mapeando, setMapeando] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [amostra, setAmostra] = useState<{ tabela: string; linhas: any[] } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [c, d] = await Promise.all([
        api.getConfigRevendas(),
        api.getDashboardRevendas().catch(() => null),
      ])
      setConfig(c)
      setPainel(d)
      setForm((f) => ({
        ...f, host: c.host, porta: c.porta, usuario: c.usuario, banco: c.banco,
        ativo: c.ativo, horaSync: c.horaSync, senha: '',
      }))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a configuração.')
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar() {
    setSalvando(true)
    try {
      await api.salvarConfigRevendas({ ...form, senha: form.senha.trim() || undefined })
      setForm((f) => ({ ...f, senha: '' }))
      toast.success('Conexão salva!')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function testar() {
    setTestando(true)
    setTeste(null)
    try {
      const r = await api.testarConexaoRevendas()
      setTeste(r)
      if (r.ok) toast.success('Conexão estabelecida!')
      else toast.error(r.erro || 'Não foi possível conectar.')
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar.')
    } finally {
      setTestando(false)
    }
  }

  async function sincronizar() {
    setSincronizando(true)
    try {
      const r = await api.sincronizarRevendas()
      if (r.erro) toast.error(r.erro)
      else toast.success(`${r.revendas} revenda(s) e ${r.clientes} cliente(s) sincronizados.`)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao sincronizar com o banco das revendas.')
    } finally {
      setSincronizando(false)
    }
  }

  async function mapear() {
    setMapeando(true)
    try {
      const m = await api.mapearBancoRevendas(filtro.trim() || undefined)
      setMapa(m)
      setAba('mapa')
      if (m.tabelas.length === 0) toast.error('Nenhuma tabela encontrada com esse filtro.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ler o esquema do banco.')
    } finally {
      setMapeando(false)
    }
  }

  async function verAmostra(tabela: string) {
    if (aberta === tabela) { setAberta(null); setAmostra(null); return }
    setAberta(tabela)
    setAmostra(null)
    try {
      setAmostra(await api.amostraTabelaRevendas(tabela, 10))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ler a tabela.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white"><Store size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Revendas</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Clientes e receita de cada ponto de revenda.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={sincronizando} onClick={sincronizar}>
            {sincronizando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...</>
              : <><DownloadCloud className="w-4 h-4" /> Sincronizar agora</>}
          </Button>
          <Button variant="secondary" disabled={testando} onClick={testar}>
            {testando ? <><Loader2 className="w-4 h-4 animate-spin" /> Testando...</> : <><PlugZap className="w-4 h-4" /> Testar conexão</>}
          </Button>
        </div>
      </div>

      {config?.ultimoErro && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{config.ultimoErro}</span>
        </div>
      )}

      {teste && (
        <div className={clsx('rounded-lg border p-3 text-xs flex gap-2',
          teste.ok
            ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            : 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300')}>
          {teste.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>
            {teste.ok
              ? `Conectado ao banco ${teste.banco} (MySQL ${teste.versao}) — ${teste.tabelas} tabela(s).`
              : teste.erro}
          </span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['dashboard', 'Dashboard'], ['conexao', 'Conexão'], ['mapa', 'Mapa do banco']] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>}

      {!carregando && aba === 'dashboard' && painel && (
        <div className="space-y-5">
          {painel.externa.ultimaSync && (
            <p className="text-[11px] text-slate-400 text-right">
              Sincronizado em {new Date(painel.externa.ultimaSync).toLocaleString('pt-BR')}
            </p>
          )}

          {!painel.externa.configurada && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                O banco das revendas ainda não está conectado. Preencha o acesso na aba
                {' '}<strong>Conexão</strong> e clique em <strong>Sincronizar agora</strong>.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { rotulo: 'Revendas ativas', valor: painel.resumo.revendasAtivas + ' de ' + painel.resumo.revendas, icone: Store, cor: 'text-violet-600 dark:text-violet-400' },
              { rotulo: 'Clientes ativos', valor: painel.resumo.ativos.toLocaleString('pt-BR'), icone: Users, cor: 'text-blue-600 dark:text-blue-400' },
              { rotulo: 'Receita mensal', valor: brl(painel.resumo.mrr), icone: Wallet, cor: 'text-emerald-600 dark:text-emerald-400' },
              {
                rotulo: 'Saldo de receita (12m)',
                valor: (painel.resumo.saldoReceita >= 0 ? '+' : '') + brl(painel.resumo.saldoReceita),
                icone: painel.resumo.saldoReceita >= 0 ? TrendingUp : TrendingDown,
                cor: painel.resumo.saldoReceita >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                nota: brl(painel.resumo.receitaGanha) + ' ganhos − ' + brl(painel.resumo.receitaPerdida) + ' perdidos',
              },
            ].map((k) => (
              <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{k.rotulo}</p>
                    <p className={clsx('text-xl font-bold mt-0.5 truncate', k.cor)}>{k.valor}</p>
                    {k.nota && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{k.nota}</p>}
                  </div>
                  <k.icone className={clsx('w-4 h-4 shrink-0 mt-1', k.cor)} />
                </div>
              </div>
            ))}
          </div>

          {/* O que o gestor precisa olhar antes de decidir */}
          {(() => {
            const avisos: Array<{ tom: 'alerta' | 'atencao'; texto: React.ReactNode }> = []
            if (painel.resumo.concentracao !== null && painel.resumo.concentracao >= 50) {
              avisos.push({
                tom: 'alerta',
                texto: <><strong>{pct(painel.resumo.concentracao)} da receita vem de uma única revenda</strong> ({painel.resumo.maiorRevenda}). Perder esse parceiro derruba o faturamento das revendas pela metade.</>,
              })
            }
            const encolhendo = painel.revendas.filter((r) => r.crescimento !== null && r.crescimento < 0)
            if (encolhendo.length) {
              avisos.push({
                tom: 'atencao',
                texto: <><strong>{encolhendo.length} revenda(s) com receita menor que há 12 meses:</strong> {encolhendo.map((r) => `${r.nome} (${pct(r.crescimento)})`).join(', ')}.</>,
              })
            }
            if (painel.resumo.semMensalidade > 0) {
              avisos.push({
                tom: 'atencao',
                texto: <><strong>{painel.resumo.semMensalidade} cliente(s) ativo(s) com mensalidade zerada.</strong> Eles contam como base mas não geram receita — vale conferir se é cortesia ou cadastro incompleto.</>,
              })
            }
            if (painel.semRevenda.clientes > 0) {
              avisos.push({
                tom: 'atencao',
                texto: <><strong>{painel.semRevenda.clientes.toLocaleString('pt-BR')} cliente(s) sem revenda informada</strong> ({brl(painel.semRevenda.mrr)} de mensalidade). Ficam de fora de todas as linhas abaixo.</>,
              })
            }
            if (avisos.length === 0) return null
            return (
              <Card>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Pontos de atenção</h2>
                <div className="space-y-2">
                  {avisos.map((a, i) => (
                    <div key={i} className={clsx('rounded-lg border p-3 text-xs flex gap-2',
                      a.tom === 'alerta'
                        ? 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300'
                        : 'border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{a.texto}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })()}

          {/* Receita de cada revenda, mês a mês */}
          <Card>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Faturamento de cada revenda por mês</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              Últimos 12 meses. Reconstruído a partir de quem estava ativo em cada mês — o banco
              guarda só a mensalidade atual, então reajustes passados não aparecem.
            </p>
            {(() => {
              const dados = painel.meses.map((mes) => {
                const linha: Record<string, string | number> = { mes: mesBR(mes) }
                for (const r of painel.revendas) {
                  linha[r.nome] = r.serie.find((s) => s.mes === mes)?.mrr ?? 0
                }
                return linha
              })
              if (painel.revendas.length === 0) {
                return <p className="text-sm text-slate-500 py-10 text-center">Nenhuma revenda sincronizada.</p>
              }
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dados}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                      tickFormatter={(v) => 'R$ ' + Number(v).toLocaleString('pt-BR')} width={90} />
                    <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      border: '1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
                      borderRadius: 8, fontSize: 12,
                    }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {painel.revendas.map((r, i) => (
                      <Line key={r.codPonto} type="monotone" dataKey={r.nome}
                        stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )
            })()}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Receita ganha x perdida */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Faturamento ganho e perdido por mês</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Mensalidade dos clientes que entraram e dos que saíram em cada mês, e o saldo.
              </p>
              {painel.movimento.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">Sem movimentação no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={painel.movimento.map((m) => ({
                    mes: mesBR(m.mes), Ganho: m.ganha, Perdido: -m.perdida, Saldo: m.saldo,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                      tickFormatter={(v) => Number(v).toLocaleString('pt-BR')} width={60} />
                    <Tooltip formatter={(v) => brl(Math.abs(Number(v)))} contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      border: '1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
                      borderRadius: 8, fontSize: 12,
                    }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ganho" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Perdido" fill="#ef4444" radius={[0, 0, 4, 4]} />
                    <Line type="monotone" dataKey="Saldo" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Entradas e saídas de clientes */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Entradas e saídas de clientes</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Últimos 12 meses, somando todas as revendas.
              </p>
              {painel.evolucao.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">Sem movimentação no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={painel.evolucao.map((d) => ({ ...d, mes: mesBR(d.mes) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} allowDecimals={false} />
                    <Tooltip contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      border: '1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
                      borderRadius: 8, fontSize: 12,
                    }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="novos" name="Novos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Tabela detalhada */}
          <Card padding="none">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Desempenho de cada revenda</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Receita mensal = mensalidade dos clientes ativos hoje. Ganho, perdido, churn e
                crescimento referem-se aos últimos 12 meses.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr className="text-left text-slate-600 dark:text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Revenda</th>
                    <th className="px-3 py-2.5 font-medium text-center">Ativos</th>
                    <th className="px-3 py-2.5 font-medium text-center">Novos</th>
                    <th className="px-3 py-2.5 font-medium text-center">Perdidos</th>
                    <th className="px-3 py-2.5 font-medium text-center">Churn</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ganho</th>
                    <th className="px-4 py-2.5 font-medium text-right">Perdido</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ticket médio</th>
                    <th className="px-4 py-2.5 font-medium text-right">Crescimento</th>
                    <th className="px-4 py-2.5 font-medium text-right">Receita mensal</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.revendas.map((r, i) => (
                    <tr key={r.codPonto} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CORES[i % CORES.length] }} />
                          <span className="text-slate-800 dark:text-slate-200">{r.nome}</span>
                          {!r.ativa && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">inativa</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 pl-4">
                          {[r.responsavel, [r.cidade, r.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-800 dark:text-slate-200 font-medium">
                        {r.ativos}
                        <span className="block text-[10px] text-slate-400">de {r.clientes}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400">{r.novos || '—'}</td>
                      <td className="px-3 py-2.5 text-center text-red-500">{r.perdidos || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {r.churn === null ? <span className="text-slate-400">—</span> : (
                          <span className={clsx(r.churn >= 15 ? 'text-red-500' : r.churn > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500')}>
                            {pct(r.churn, 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                        {r.receitaGanha ? brl(r.receitaGanha) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-500">
                        {r.receitaPerdida ? brl(r.receitaPerdida) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {r.ativos ? brl(r.ticketMedio) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.crescimento === null ? <span className="text-slate-400">—</span> : (
                          <span className={clsx('inline-flex items-center gap-1',
                            r.crescimento > 0 ? 'text-emerald-600 dark:text-emerald-400'
                              : r.crescimento < 0 ? 'text-red-500' : 'text-slate-500')}>
                            {r.crescimento > 0 ? <TrendingUp className="w-3 h-3" />
                              : r.crescimento < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {pct(r.crescimento, 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{brl(r.mrr)}</span>
                        <span className="block text-[11px] text-slate-400">{r.participacao.toFixed(1)}% do total</span>
                      </td>
                    </tr>
                  ))}
                  {painel.revendas.length === 0 && (
                    <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>Nenhuma revenda sincronizada ainda.</td></tr>
                  )}
                </tbody>
                {painel.revendas.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-medium">
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">Total</td>
                      <td className="px-3 py-2.5 text-center text-slate-800 dark:text-slate-200">{painel.resumo.ativos}</td>
                      <td className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400">{painel.resumo.novos}</td>
                      <td className="px-3 py-2.5 text-center text-red-500">{painel.resumo.perdidos}</td>
                      <td />
                      <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{brl(painel.resumo.receitaGanha)}</td>
                      <td className="px-4 py-2.5 text-right text-red-500">{brl(painel.resumo.receitaPerdida)}</td>
                      <td />
                      <td />
                      <td className="px-4 py-2.5 text-right text-slate-800 dark:text-slate-200">{brl(painel.resumo.mrr)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </div>
      )}

      {!carregando && aba === 'conexao' && (
        <div className="max-w-2xl">
          <Card>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Acesso ao banco das revendas</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Use um usuário <strong>somente leitura</strong> (apenas SELECT) e libere o IP deste servidor
                  no banco de origem. O Analytics nunca escreve nessa base.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Host</label>
                  <input className="input-field font-mono text-xs" placeholder="ex.: 191.0.0.10 ou db.suaempresa.com.br"
                    value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Porta</label>
                  <input className="input-field" type="number" value={form.porta}
                    onChange={(e) => setForm({ ...form, porta: Number(e.target.value) || 3306 })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Usuário</label>
                  <input className="input-field" value={form.usuario}
                    onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Senha</label>
                  <input className="input-field" type="password" autoComplete="new-password"
                    placeholder={config?.temSenha ? '•••••••• (já configurada)' : 'senha do usuário'}
                    value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                  <p className="text-[11px] text-slate-400 mt-1">Em branco mantém a atual.</p>
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Banco</label>
                  <input className="input-field font-mono text-xs" value={form.banco}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Horário da sincronização diária</label>
                  <input className="input-field" type="time" value={form.horaSync}
                    onChange={(e) => setForm({ ...form, horaSync: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
                  <input type="checkbox" className="accent-violet-600" checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Sincronizar automaticamente todo dia
                </label>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-slate-500">
                Última sincronização:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {config?.ultimaSync ? new Date(config.ultimaSync).toLocaleString('pt-BR') : 'nunca'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={salvando} onClick={salvar}>
                  {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar</>}
                </Button>
                <Button variant="secondary" disabled={mapeando} onClick={mapear}>
                  {mapeando ? <><Loader2 className="w-4 h-4 animate-spin" /> Lendo...</> : <><Table2 className="w-4 h-4" /> Mapear o banco</>}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!carregando && aba === 'mapa' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input-field pl-9" placeholder="Filtrar tabelas (ex.: revenda)"
                value={filtro} onChange={(e) => setFiltro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void mapear() }} />
            </div>
            <Button variant="secondary" disabled={mapeando} onClick={mapear}>
              {mapeando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
            </Button>
          </div>

          {!mapa && (
            <Card><p className="text-sm text-slate-500 py-6 text-center">
              Clique em "Mapear o banco" para listar as tabelas do banco das revendas.
            </p></Card>
          )}

          {mapa && (
            <Card padding="none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {mapa.banco} · {mapa.tabelas.length} tabela(s)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clique numa tabela para ver as colunas e uma amostra das primeiras linhas.
                </p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[560px] overflow-y-auto">
                {mapa.tabelas.map((t) => (
                  <div key={t.tabela}>
                    <button onClick={() => verAmostra(t.tabela)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200">{t.tabela}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {t.colunas.length} colunas · ~{t.linhas.toLocaleString('pt-BR')} linhas
                      </span>
                    </button>
                    {aberta === t.tabela && (
                      <div className="px-4 pb-4 space-y-3 bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          {t.colunas.map((c) => (
                            <span key={c} className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                              {c}
                            </span>
                          ))}
                        </div>
                        {!amostra && <p className="text-xs text-slate-500">Carregando amostra...</p>}
                        {amostra?.tabela === t.tabela && amostra.linhas.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="text-[11px] w-full bg-white dark:bg-slate-800">
                              <thead className="bg-slate-100 dark:bg-slate-900/60">
                                <tr>
                                  {Object.keys(amostra.linhas[0]).map((k) => (
                                    <th key={k} className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {amostra.linhas.map((linha, i) => (
                                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                                    {Object.values(linha).map((v, j) => (
                                      <td key={j} className="px-2 py-1 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[16rem] truncate">
                                        {v === null ? <span className="text-slate-400">null</span> : String(v)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {amostra?.tabela === t.tabela && amostra.linhas.length === 0 && (
                          <p className="text-xs text-slate-500">Tabela vazia.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
