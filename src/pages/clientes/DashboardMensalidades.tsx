import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, BarChart3, CircleDollarSign, Download, Filter, PieChart as PieChartIcon,
  RefreshCw, Search, TrendingUp, Users,
} from 'lucide-react'
import { api } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import type {
  DashboardMensalidadesAbc,
  DashboardMensalidadesAgrupamento,
  DashboardMensalidadesConcentracao,
  DashboardMensalidadesEstatisticas,
  DashboardMensalidadesFaixa,
  DashboardMensalidadesFiltros,
  DashboardMensalidadesOpcoesFiltros,
  DashboardMensalidadesRanking,
  DashboardMensalidadesResumo,
} from '../../types'

type TabId = 'geral' | 'faixas' | 'abc' | 'concentracao' | 'estatisticas' | 'rankings' | 'agrupamentos'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'geral', label: 'Visão Geral' },
  { id: 'faixas', label: 'Faixas de Mensalidade' },
  { id: 'abc', label: 'Curva ABC' },
  { id: 'concentracao', label: 'Concentração' },
  { id: 'estatisticas', label: 'Estatísticas' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'agrupamentos', label: 'Análises Complementares' },
]

const rankingOptions = [
  { value: 'maiores', label: 'Top maiores mensalidades' },
  { value: 'menores', label: 'Top menores mensalidades' },
  { value: 'abaixo-media', label: 'Abaixo do ticket médio' },
  { value: 'acima-media', label: 'Acima do ticket médio' },
  { value: 'abaixo-mediana', label: 'Abaixo da mediana' },
  { value: 'acima-mediana', label: 'Acima da mediana' },
  { value: 'classe-a', label: 'Clientes Classe A' },
  { value: 'classe-b', label: 'Clientes Classe B' },
  { value: 'classe-c', label: 'Clientes Classe C' },
]

const agrupamentoOptions = [
  { value: 'plano', label: 'Plano' },
  { value: 'cidade', label: 'Cidade' },
  { value: 'uf', label: 'UF' },
  { value: 'segmento', label: 'Segmento' },
  { value: 'vendedor', label: 'Responsável' },
]

const chartColors = ['#2563eb', '#059669', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#16a34a']

function currency(value?: number | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

function number(value?: number | null) {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0)
}

function percent(value?: number | null) {
  return `${(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function filterOptions(values?: string[]) {
  return (values ?? []).map(value => ({ value, label: value }))
}

function cleanFilters(filters: DashboardMensalidadesFiltros) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  ) as DashboardMensalidadesFiltros
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100 break-words">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          {icon}
        </div>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {message}
    </div>
  )
}

export function DashboardMensalidades() {
  const [activeTab, setActiveTab] = useState<TabId>('geral')
  const [filters, setFilters] = useState<DashboardMensalidadesFiltros>({})
  const [selectedRanking, setSelectedRanking] = useState('maiores')
  const [selectedAgrupamento, setSelectedAgrupamento] = useState('plano')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [opcoes, setOpcoes] = useState<DashboardMensalidadesOpcoesFiltros | null>(null)
  const [resumo, setResumo] = useState<DashboardMensalidadesResumo | null>(null)
  const [faixas, setFaixas] = useState<DashboardMensalidadesFaixa[]>([])
  const [abc, setAbc] = useState<DashboardMensalidadesAbc | null>(null)
  const [concentracao, setConcentracao] = useState<DashboardMensalidadesConcentracao | null>(null)
  const [estatisticas, setEstatisticas] = useState<DashboardMensalidadesEstatisticas | null>(null)
  const [ranking, setRanking] = useState<DashboardMensalidadesRanking | null>(null)
  const [agrupamentos, setAgrupamentos] = useState<DashboardMensalidadesAgrupamento[]>([])
  const [insights, setInsights] = useState<string[]>([])

  const activeFilters = useMemo(() => cleanFilters(filters), [filters])

  useEffect(() => {
    api.getDashboardMensalidadesOpcoes()
      .then(setOpcoes)
      .catch(() => setOpcoes(null))
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    Promise.all([
      api.getDashboardMensalidadesResumo(activeFilters),
      api.getDashboardMensalidadesFaixas(activeFilters),
      api.getDashboardMensalidadesAbc(activeFilters),
      api.getDashboardMensalidadesConcentracao(activeFilters),
      api.getDashboardMensalidadesEstatisticas(activeFilters),
      api.getDashboardMensalidadesRankings({ ...activeFilters, tipo: selectedRanking, page: '1', limit: '20' }),
      api.getDashboardMensalidadesAgrupamentos({ ...activeFilters, agruparPor: selectedAgrupamento }),
      api.getDashboardMensalidadesInsights(activeFilters),
    ]).then(([resumoData, faixasData, abcData, concentracaoData, estatisticasData, rankingData, agrupamentosData, insightsData]) => {
      if (!mounted) return
      setResumo(resumoData)
      setFaixas(faixasData)
      setAbc(abcData)
      setConcentracao(concentracaoData)
      setEstatisticas(estatisticasData)
      setRanking(rankingData)
      setAgrupamentos(agrupamentosData)
      setInsights(insightsData)
    }).catch((err: any) => {
      if (!mounted) return
      setError(err?.message || 'Não foi possível carregar a dashboard de mensalidades.')
    }).finally(() => {
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [activeFilters, selectedRanking, selectedAgrupamento])

  const updateFilter = (key: keyof DashboardMensalidadesFiltros, value: string) => {
    setFilters(current => ({ ...current, [key]: value }))
  }

  const resetFilters = () => setFilters({})

  const topAgrupamentos = agrupamentos.slice(0, 10)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard de Mensalidades</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Análise da carteira de clientes por mensalidade, MRR, concentração e curva ABC.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => setFilters(current => ({ ...current }))}
          loading={loading}
        >
          Atualizar
        </Button>
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Filter className="h-4 w-4 text-blue-600" />
          Filtros
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Select label="Status" placeholder="Ativos" value={filters.status ?? ''} onChange={e => updateFilter('status', e.target.value)} options={filterOptions(opcoes?.status)} />
          <Select label="Faixa" placeholder="Todas" value={filters.faixaMensalidade ?? ''} onChange={e => updateFilter('faixaMensalidade', e.target.value)} options={filterOptions(opcoes?.faixas)} />
          <Select label="Classe ABC" placeholder="Todas" value={filters.classeAbc ?? ''} onChange={e => updateFilter('classeAbc', e.target.value)} options={filterOptions(opcoes?.classesAbc)} />
          <Select label="Plano" placeholder="Todos" value={filters.plano ?? ''} onChange={e => updateFilter('plano', e.target.value)} options={filterOptions(opcoes?.planos)} />
          <Select label="UF" placeholder="Todas" value={filters.uf ?? ''} onChange={e => updateFilter('uf', e.target.value)} options={filterOptions(opcoes?.ufs)} />
          <Select label="Cidade" placeholder="Todas" value={filters.cidade ?? ''} onChange={e => updateFilter('cidade', e.target.value)} options={filterOptions(opcoes?.cidades)} />
          <Select label="Segmento" placeholder="Todos" value={filters.segmento ?? ''} onChange={e => updateFilter('segmento', e.target.value)} options={filterOptions(opcoes?.segmentos)} />
          <Select label="Responsável" placeholder="Todos" value={filters.vendedor ?? ''} onChange={e => updateFilter('vendedor', e.target.value)} options={filterOptions(opcoes?.vendedores)} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Entrada inicial</label>
            <input
              type="date"
              value={filters.dataEntradaInicial ?? ''}
              onChange={e => updateFilter('dataEntradaInicial', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Entrada final</label>
            <input
              type="date"
              value={filters.dataEntradaFinal ?? ''}
              onChange={e => updateFilter('dataEntradaFinal', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>Limpar filtros</Button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Carregando carteira...</p>
          </div>
        </div>
      )}

      {!loading && resumo && (
        <>
          {activeTab === 'geral' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Clientes ativos" value={number(resumo.totalClientesAtivos)} subtitle={`${number(resumo.totalMensalidadeZerada)} com mensalidade zerada`} icon={<Users className="h-5 w-5" />} />
                <MetricCard title="Clientes pagantes" value={number(resumo.totalClientesPagantes)} subtitle="Mensalidade maior que zero" icon={<Search className="h-5 w-5" />} />
                <MetricCard title="MRR" value={currency(resumo.mrr)} subtitle="Receita mensal recorrente" icon={<CircleDollarSign className="h-5 w-5" />} />
                <MetricCard title="ARR" value={currency(resumo.arr)} subtitle="MRR projetado por 12 meses" icon={<TrendingUp className="h-5 w-5" />} />
                <MetricCard title="Ticket médio" value={currency(resumo.ticketMedio)} subtitle="Média dos pagantes" icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Mediana" value={currency(resumo.mediana)} subtitle="Valor central da carteira" icon={<PieChartIcon className="h-5 w-5" />} />
                <MetricCard title="Menor mensalidade" value={currency(resumo.menorMensalidade)} subtitle="Entre clientes pagantes" icon={<Download className="h-5 w-5" />} />
                <MetricCard title="Maior mensalidade" value={currency(resumo.maiorMensalidade)} subtitle="Entre clientes pagantes" icon={<TrendingUp className="h-5 w-5" />} />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Section title="Clientes por faixa">
                  {faixas.some(f => f.quantidadeClientes > 0) ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={faixas}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="faixa" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => [number(value), 'Clientes']} />
                        <Bar dataKey="quantidadeClientes" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="Sem clientes pagantes para exibir." />}
                </Section>

                <Section title="Insights da Carteira">
                  <div className="space-y-3">
                    {insights.length ? insights.map((insight, index) => (
                      <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                        {insight}
                      </div>
                    )) : <EmptyState message="Sem insights disponíveis para a seleção atual." />}
                  </div>
                </Section>
              </div>
            </div>
          )}

          {activeTab === 'faixas' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Section title="Receita por faixa">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={faixas}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="faixa" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${Math.round(Number(v) / 1000)}k`} />
                      <Tooltip formatter={(value: number) => [currency(value), 'Receita']} />
                      <Bar dataKey="receitaTotal" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>

                <Section title="Participação de clientes por faixa">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={faixas.filter(f => f.quantidadeClientes > 0)} dataKey="quantidadeClientes" nameKey="faixa" outerRadius={95} label>
                        {faixas.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => [number(value), 'Clientes']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Section>
              </div>
              <Section title="Tabela detalhada por faixa">
                <FaixasTable faixas={faixas} />
              </Section>
            </div>
          )}

          {activeTab === 'abc' && abc && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {abc.resumoPorClasse.map(item => (
                  <MetricCard
                    key={item.classe}
                    title={`Classe ${item.classe}`}
                    value={currency(item.receitaTotal)}
                    subtitle={`${number(item.quantidadeClientes)} clientes, ${percent(item.percentualReceita)} da receita`}
                    icon={<BarChart3 className="h-5 w-5" />}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Section title="Receita por classe ABC">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={abc.resumoPorClasse}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="classe" />
                      <YAxis tickFormatter={v => `R$${Math.round(Number(v) / 1000)}k`} />
                      <Tooltip formatter={(value: number) => [currency(value), 'Receita']} />
                      <Bar dataKey="receitaTotal" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
                <Section title="Receita acumulada">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={abc.curvaReceitaAcumulada}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="posicao" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(value: number) => [percent(value), 'Receita acumulada']} />
                      <Area type="monotone" dataKey="percentualAcumulado" stroke="#2563eb" fill="#bfdbfe" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Section>
              </div>
              <Section title="Clientes classificados">
                <ClientesTable data={abc.clientesClassificados} />
              </Section>
            </div>
          )}

          {activeTab === 'concentracao' && concentracao && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="50% da receita" value={`${number(concentracao.clientesPara50Receita)} clientes`} icon={<Users className="h-5 w-5" />} />
                <MetricCard title="70% da receita" value={`${number(concentracao.clientesPara70Receita)} clientes`} icon={<Users className="h-5 w-5" />} />
                <MetricCard title="80% da receita" value={`${number(concentracao.clientesPara80Receita)} clientes`} icon={<Users className="h-5 w-5" />} />
                <MetricCard title="90% da receita" value={`${number(concentracao.clientesPara90Receita)} clientes`} icon={<Users className="h-5 w-5" />} />
                <MetricCard title="Top 10" value={percent(concentracao.participacaoTop10)} subtitle="Da receita mensal" icon={<TrendingUp className="h-5 w-5" />} />
                <MetricCard title="Top 20" value={percent(concentracao.participacaoTop20)} subtitle="Da receita mensal" icon={<TrendingUp className="h-5 w-5" />} />
                <MetricCard title="Top 50" value={percent(concentracao.participacaoTop50)} subtitle="Da receita mensal" icon={<TrendingUp className="h-5 w-5" />} />
                <MetricCard title="Top 100" value={percent(concentracao.participacaoTop100)} subtitle="Da receita mensal" icon={<TrendingUp className="h-5 w-5" />} />
              </div>
              <Section title="Curva de concentração acumulada">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={concentracao.curvaAcumulada}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="percentualClientes" tickFormatter={v => `${v}%`} />
                    <YAxis tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(value: number) => [percent(value), 'Receita acumulada']} />
                    <Line type="monotone" dataKey="percentualReceita" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Section>
            </div>
          )}

          {activeTab === 'estatisticas' && estatisticas && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Média" value={currency(estatisticas.media)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Mediana" value={currency(estatisticas.mediana)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Moda" value={estatisticas.moda == null ? 'Sem moda' : currency(estatisticas.moda)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Desvio padrão" value={currency(estatisticas.desvioPadrao)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Percentil 25" value={currency(estatisticas.percentil25)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Percentil 75" value={currency(estatisticas.percentil75)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Percentil 90" value={currency(estatisticas.percentil90)} icon={<BarChart3 className="h-5 w-5" />} />
                <MetricCard title="Percentil 95" value={currency(estatisticas.percentil95)} icon={<BarChart3 className="h-5 w-5" />} />
              </div>
              <Section title="Leitura estatística">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{estatisticas.leitura}</p>
              </Section>
            </div>
          )}

          {activeTab === 'rankings' && ranking && (
            <Section
              title="Rankings de clientes"
              action={
                <div className="w-full sm:w-72">
                  <Select value={selectedRanking} onChange={e => setSelectedRanking(e.target.value)} options={rankingOptions} />
                </div>
              }
            >
              <ClientesTable data={ranking.data} />
            </Section>
          )}

          {activeTab === 'agrupamentos' && (
            <div className="space-y-5">
              <Section
                title="Análise agrupada"
                action={
                  <div className="w-full sm:w-60">
                    <Select value={selectedAgrupamento} onChange={e => setSelectedAgrupamento(e.target.value)} options={agrupamentoOptions} />
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topAgrupamentos}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="grupo" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis tickFormatter={v => `R$${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(value: number) => [currency(value), 'Receita']} />
                    <Bar dataKey="receitaMensalTotal" fill="#0891b2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title="Tabela de agrupamentos">
                <AgrupamentosTable data={agrupamentos} />
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FaixasTable({ faixas }: { faixas: DashboardMensalidadesFaixa[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <th className="px-3 py-3">Faixa</th>
            <th className="px-3 py-3">Clientes</th>
            <th className="px-3 py-3">% Carteira</th>
            <th className="px-3 py-3">Receita</th>
            <th className="px-3 py-3">% Receita</th>
            <th className="px-3 py-3">Ticket médio</th>
            <th className="px-3 py-3">Menor</th>
            <th className="px-3 py-3">Maior</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {faixas.map(faixa => (
            <tr key={faixa.faixa} className="text-slate-700 dark:text-slate-200">
              <td className="px-3 py-3 font-medium">{faixa.faixa}</td>
              <td className="px-3 py-3">{number(faixa.quantidadeClientes)}</td>
              <td className="px-3 py-3">{percent(faixa.percentualClientes)}</td>
              <td className="px-3 py-3">{currency(faixa.receitaTotal)}</td>
              <td className="px-3 py-3">{percent(faixa.percentualReceita)}</td>
              <td className="px-3 py-3">{currency(faixa.ticketMedioFaixa)}</td>
              <td className="px-3 py-3">{currency(faixa.menorValor)}</td>
              <td className="px-3 py-3">{currency(faixa.maiorValor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClientesTable({ data }: { data: NonNullable<DashboardMensalidadesRanking['data']> }) {
  if (!data.length) return <EmptyState message="Nenhum cliente encontrado para a seleção atual." />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Mensalidade</th>
            <th className="px-3 py-3">Plano</th>
            <th className="px-3 py-3">Cidade/UF</th>
            <th className="px-3 py-3">Segmento</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">ABC</th>
            <th className="px-3 py-3">Faixa</th>
            <th className="px-3 py-3">% Receita</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map(cliente => (
            <tr key={cliente.id} className="text-slate-700 dark:text-slate-200">
              <td className="px-3 py-3 font-medium">{cliente.nome}</td>
              <td className="px-3 py-3">{currency(cliente.mensalidade)}</td>
              <td className="px-3 py-3">{cliente.plano || 'Não informado'}</td>
              <td className="px-3 py-3">{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ') || 'Não informado'}</td>
              <td className="px-3 py-3">{cliente.segmento || 'Não informado'}</td>
              <td className="px-3 py-3">{cliente.status}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {cliente.classeAbc}
                </span>
              </td>
              <td className="px-3 py-3">{cliente.faixaMensalidade}</td>
              <td className="px-3 py-3">{percent(cliente.percentualReceita)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AgrupamentosTable({ data }: { data: DashboardMensalidadesAgrupamento[] }) {
  if (!data.length) return <EmptyState message="Nenhum agrupamento disponível para a seleção atual." />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <th className="px-3 py-3">Grupo</th>
            <th className="px-3 py-3">Clientes</th>
            <th className="px-3 py-3">Receita mensal</th>
            <th className="px-3 py-3">Ticket médio</th>
            <th className="px-3 py-3">% Carteira</th>
            <th className="px-3 py-3">% Receita</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map(item => (
            <tr key={item.grupo} className="text-slate-700 dark:text-slate-200">
              <td className="px-3 py-3 font-medium">{item.grupo}</td>
              <td className="px-3 py-3">{number(item.quantidadeClientes)}</td>
              <td className="px-3 py-3">{currency(item.receitaMensalTotal)}</td>
              <td className="px-3 py-3">{currency(item.ticketMedio)}</td>
              <td className="px-3 py-3">{percent(item.percentualCarteira)}</td>
              <td className="px-3 py-3">{percent(item.percentualReceitaTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
