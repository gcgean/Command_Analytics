import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Loader2, Search, TrendingUp, Trophy, XCircle, Clock, Percent, Users,
  ChevronLeft, ChevronRight, RotateCcw,
} from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { useThemeStore } from '../../store/themeStore'
import { Card } from '../../components/ui/Card'
import type { FiltrosFunil, ListaNegociosFunil, PainelCrm } from '../../types'

const dataBR = (v?: string | null) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : '—'
}
const mesBR = (ym: string) => {
  const [a, m] = ym.split('-')
  return `${['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m)]}/${a.slice(2)}`
}

// status da tabela `negocios`: a etapa não serve para isso — existem
// negócios ganhos que ficaram parados em "SEM CONTATO".
const SITUACAO: Record<number, { rotulo: string; classe: string }> = {
  0: { rotulo: 'Em aberto', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  1: { rotulo: 'Ganho', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  2: { rotulo: 'Perdido', classe: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
}

const CORES_ETAPA = [
  'bg-slate-400', 'bg-sky-500', 'bg-indigo-500',
  'bg-amber-500', 'bg-orange-500', 'bg-emerald-500', 'bg-red-500',
]

const FILTROS_VAZIOS: FiltrosFunil = { busca: '', funil: '', vendedor: '', etapa: '', situacao: '', inicio: '', fim: '' }

export function Negocios() {
  const { toast } = useToast()
  const isDark = useThemeStore((s) => s.theme) === 'dark'
  const [aba, setAba] = useState<'painel' | 'lista'>('painel')
  const [filtros, setFiltros] = useState<FiltrosFunil>(FILTROS_VAZIOS)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [painel, setPainel] = useState<PainelCrm | null>(null)
  const [lista, setLista] = useState<ListaNegociosFunil | null>(null)
  const [carregando, setCarregando] = useState(true)

  // A busca só entra no filtro depois que o usuário para de digitar.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => ({ ...f, busca })), 400)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => { setPagina(1) }, [filtros])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [p, l] = await Promise.all([
        api.getPainelCrm(filtros),
        api.getNegocios({ ...filtros, pagina, limite: 50 }),
      ])
      setPainel(p)
      setLista(l)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar o funil.')
    } finally {
      setCarregando(false)
    }
  }, [filtros, pagina, toast])

  useEffect(() => { void carregar() }, [carregar])

  const r = painel?.resumo
  const temFiltro = useMemo(
    () => Object.entries(filtros).some(([, v]) => v !== '' && v !== undefined),
    [filtros],
  )
  // O topo do funil é a referência para enxergar onde os negócios travam.
  const topoFunil = painel?.etapas[0]?.quantidade ?? 0

  const indicadores = [
    { rotulo: 'Em aberto', valor: r?.abertos ?? 0, icone: Clock, cor: 'text-blue-600 dark:text-blue-400', fundo: 'bg-blue-50 dark:bg-blue-500/10' },
    { rotulo: 'Ganhos', valor: r?.ganhos ?? 0, icone: Trophy, cor: 'text-emerald-600 dark:text-emerald-400', fundo: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { rotulo: 'Perdidos', valor: r?.perdidos ?? 0, icone: XCircle, cor: 'text-red-600 dark:text-red-400', fundo: 'bg-red-50 dark:bg-red-500/10' },
    {
      rotulo: 'Conversão', valor: r?.taxaConversao == null ? '—' : `${r.taxaConversao.toFixed(1)}%`,
      icone: Percent, cor: 'text-amber-600 dark:text-amber-400', fundo: 'bg-amber-50 dark:bg-amber-500/10',
      nota: 'sobre os já decididos',
    },
    { rotulo: 'Total', valor: r?.total ?? 0, icone: TrendingUp, cor: 'text-slate-700 dark:text-slate-300', fundo: 'bg-slate-100 dark:bg-slate-700/40' },
  ]

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Funil de Vendas</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
            {painel ? `${painel.resumo.total.toLocaleString('pt-BR')} negócios no período e filtros selecionados` : 'Carregando...'}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {([['painel', 'Painel'], ['lista', 'Negócios']] as const).map(([id, rotulo]) => (
            <button key={id} onClick={() => setAba(id)}
              className={clsx('px-4 py-2 text-sm font-medium transition-colors',
                aba === id ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700')}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <Card padding="sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input-field pl-9" placeholder="Buscar por cliente, vendedor ou descrição..."
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select className="input-field" value={filtros.funil ?? ''}
            onChange={(e) => setFiltros({ ...filtros, funil: e.target.value })}>
            <option value="">Todos os funis</option>
            {painel?.opcoes.funis.map((f) => (
              <option key={f.funil} value={f.funil}>{f.funil} ({f.quantidade})</option>
            ))}
          </select>
          <select className="input-field" value={filtros.vendedor ?? ''}
            onChange={(e) => setFiltros({ ...filtros, vendedor: e.target.value })}>
            <option value="">Todos os vendedores</option>
            {painel?.opcoes.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="input-field" value={filtros.situacao ?? ''}
            onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value as FiltrosFunil['situacao'] })}>
            <option value="">Todas as situações</option>
            <option value="aberto">Em aberto</option>
            <option value="ganho">Ganhos</option>
            <option value="perdido">Perdidos</option>
          </select>
          <div className="flex gap-2 items-center">
            <input type="date" className="input-field" title="Criado a partir de" value={filtros.inicio ?? ''}
              onChange={(e) => setFiltros({ ...filtros, inicio: e.target.value })} />
            <input type="date" className="input-field" title="Criado até" value={filtros.fim ?? ''}
              onChange={(e) => setFiltros({ ...filtros, fim: e.target.value })} />
            {temFiltro && (
              <button onClick={() => { setBusca(''); setFiltros(FILTROS_VAZIOS) }}
                title="Limpar filtros"
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {indicadores.map((k) => (
          <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{k.rotulo}</p>
                <p className={clsx('text-2xl font-bold mt-0.5', k.cor)}>
                  {typeof k.valor === 'number' ? k.valor.toLocaleString('pt-BR') : k.valor}
                </p>
                {k.nota && <p className="text-[10px] text-slate-400 mt-0.5">{k.nota}</p>}
              </div>
              <div className={clsx('p-2 rounded-lg shrink-0', k.fundo)}>
                <k.icone className={clsx('w-4 h-4', k.cor)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}

      {!carregando && aba === 'painel' && painel && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Funil */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Onde estão os negócios em aberto</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">Etapas na ordem do funil. A barra compara com a etapa de entrada.</p>
              <div className="space-y-3">
                {painel.etapas.map((e, i) => {
                  const pct = topoFunil ? (e.quantidade / topoFunil) * 100 : 0
                  return (
                    <button key={e.etapa} onClick={() => { setAba('lista'); setFiltros({ ...filtros, etapa: e.etapa, situacao: 'aberto' }) }}
                      className="w-full text-left group">
                      <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {e.etapa}
                        </span>
                        <span className="text-slate-500">
                          {e.quantidade.toLocaleString('pt-BR')}
                          <span className="text-slate-400 ml-1.5">{pct.toFixed(0)}%</span>
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className={clsx('h-full rounded-full transition-all', CORES_ETAPA[i % CORES_ETAPA.length])}
                          style={{ width: `${Math.max(pct, 1.5)}%` }} />
                      </div>
                    </button>
                  )
                })}
                {painel.etapas.length === 0 && (
                  <p className="text-sm text-slate-500 py-6 text-center">Nenhum negócio em aberto com esses filtros.</p>
                )}
              </div>
            </Card>

            {/* Evolução */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Ganhos × perdidos nos últimos 12 meses</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">Pelo mês em que o negócio foi fechado.</p>
              {painel.evolucao.length === 0 ? (
                <p className="text-sm text-slate-500 py-12 text-center">Nenhum negócio fechado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={painel.evolucao.map((e) => ({ ...e, mes: mesBR(e.mes) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} allowDecimals={false} />
                    <Tooltip contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      borderRadius: 8, fontSize: 12,
                    }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="ganhos" name="Ganhos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Vendedores */}
            <Card className="lg:col-span-2" padding="none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Desempenho por vendedor
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Clique no vendedor para filtrar o funil inteiro por ele.</p>
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                    <tr className="text-left text-slate-600 dark:text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Vendedor</th>
                      <th className="px-3 py-2.5 font-medium text-center">Abertos</th>
                      <th className="px-3 py-2.5 font-medium text-center">Ganhos</th>
                      <th className="px-3 py-2.5 font-medium text-center">Perdidos</th>
                      <th className="px-4 py-2.5 font-medium text-right">Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.vendedores.map((v) => {
                      const fechados = v.ganhos + v.perdidos
                      const taxa = fechados ? (v.ganhos / fechados) * 100 : null
                      return (
                        <tr key={v.vendedor}
                          onClick={() => setFiltros({ ...filtros, vendedor: v.vendedor })}
                          className="border-t border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{v.vendedor}</td>
                          <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300">{v.abertos}</td>
                          <td className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400 font-medium">{v.ganhos}</td>
                          <td className="px-3 py-2.5 text-center text-red-500">{v.perdidos}</td>
                          <td className="px-4 py-2.5 text-right">
                            {taxa === null ? <span className="text-slate-400">—</span> : (
                              <span className="inline-flex items-center gap-2">
                                <span className="hidden sm:block w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                  <span className="block h-full bg-emerald-500" style={{ width: `${taxa}%` }} />
                                </span>
                                <span className="text-slate-700 dark:text-slate-300 tabular-nums">{taxa.toFixed(0)}%</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {painel.vendedores.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={5}>Sem dados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Motivos de perda */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Por que estamos perdendo</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">Motivos mais registrados nas perdas.</p>
              <div className="space-y-2">
                {painel.motivosPerda.map((m) => (
                  <div key={m.motivo} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-slate-600 dark:text-slate-300 leading-snug">
                      {m.motivo.replace(/^[-\s]+/, '')}
                    </span>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 font-medium">
                      {m.quantidade}
                    </span>
                  </div>
                ))}
                {painel.motivosPerda.length === 0 && (
                  <p className="text-sm text-slate-500 py-6 text-center">Nenhum motivo registrado.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {!carregando && aba === 'lista' && lista && (
        <Card padding="none">
          {filtros.etapa && (
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
              <span className="text-slate-500">Etapa:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium">
                {filtros.etapa}
              </span>
              <button className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                onClick={() => setFiltros({ ...filtros, etapa: '' })}>remover</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="px-4 py-2.5 font-medium">Etapa</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Entrada</th>
                  <th className="px-4 py-2.5 font-medium">Fechamento</th>
                </tr>
              </thead>
              <tbody>
                {lista.itens.map((n) => {
                  const s = SITUACAO[n.status] ?? SITUACAO[0]
                  return (
                    <tr key={n.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-4 py-2.5">
                        <p className="text-slate-800 dark:text-slate-200">{n.titulo}</p>
                        <p className="text-[11px] text-slate-400">#{n.id}{n.funil ? ` · ${n.funil}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{n.vendedor ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{n.etapa ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('text-xs px-2 py-1 rounded-full font-medium', s.classe)}>{s.rotulo}</span>
                        {n.motivoPerda && (
                          <span className="block text-[11px] text-slate-400 mt-0.5 max-w-[22rem] truncate" title={n.motivoPerda}>
                            {n.motivoPerda.replace(/^[-\s]+/, '')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{dataBR(n.criadoEm)}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{dataBR(n.ganhoEm ?? n.perdidoEm)}</td>
                    </tr>
                  )
                })}
                {lista.itens.length === 0 && (
                  <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={6}>Nenhum negócio com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {lista.total > lista.limite && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-sm">
              <span className="text-slate-500 text-xs">
                {(lista.pagina - 1) * lista.limite + 1}–{Math.min(lista.pagina * lista.limite, lista.total)} de {lista.total.toLocaleString('pt-BR')}
              </span>
              <div className="flex items-center gap-1">
                <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 px-2">
                  {lista.pagina} / {Math.ceil(lista.total / lista.limite)}
                </span>
                <button disabled={pagina >= Math.ceil(lista.total / lista.limite)} onClick={() => setPagina((p) => p + 1)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
