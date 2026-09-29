import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { useThemeStore } from '../../store/themeStore'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
  LineChart, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Users, Target, ChevronLeft,
  ChevronRight, Zap, Award, AlertTriangle, CheckCircle2,
  Building2, Loader2, RefreshCw, Save, Plus, Settings2, Layers3, Pencil,
} from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import clsx from 'clsx'
import type { Departamento, MetaCadastroItem, TipoMetaCadastro, Usuario } from '../../types'

// ── tipos ──────────────────────────────────────────────────────────
interface Resumo {
  totalAtivos: number; qtdNovos: number; valorClientesNovos: number
  qtdPerdidos: number; receitaPerdida: number; valorUpgrades: number
  qtdReativados: number; valorReativados: number
  receitaNova: number; receitaLiquida: number; percMeta: number
}
interface Filial {
  nome: string; codCon: number; qtd: number
  valor: number; meta: number; perc: number
}
interface EvoMes {
  mes: string; receitaNova: number; clientesNovos: number; anoAnterior: number; meta: number
  receitaPerdida: number; clientesPerdidos: number; saldo: number
}
interface MrrMes { mes: string; valor: number; clientes: number; variacao: number; variacaoPerc: number | null }
interface Projecao {
  mrrAtual: number; mediaEntrada: number; mediaSaida: number; crescimentoMedioMes: number
  meses: Array<{ mes: string; valor: number; acumulado: number }>
}
interface ClienteNovo { codigo: number; nome: string; valor: number; cidade: string; data_cadastro: string; segmento?: string; tipo?: string }
interface ClienteReativado { codigo: number; nome: string; valor: number; cidade: string; data_desativacao: string; segmento?: string }
interface ClientePerdido { codigo: number; nome: string; valor: number; cidade: string; data_desativacao: string }
interface Upgrade { vendedor: string; cliente: string; descricao: string; valor: number; data_venda: string }
interface CidadeResumo { cidade: string; qtd: number; valor: number }
interface SegmentoResumo { seguimento: string; quantidade: number; valor_total: number }
interface ClientePerdidoDetalhado { codigo: number; nome: string; valor: number; data_desativacao: string; cidade: string; telefone: string; motivo: string }
interface MotivoPerda { motivo: string; quantidade: number }
interface DadosComercial {
  periodo: { ano: number; mes: number; inicio: string; fim: string; diasRestantes: number; label: string }
  meta: { geral: number; limoeiro: number; aracati: number }
  resumo: Resumo
  porFilial: Filial[]
  evolucao: EvoMes[]
  mrr?: MrrMes[]
  projecao?: Projecao
  clientesNovos: ClienteNovo[]
  clientesReativados: ClienteReativado[]
  clientesPerdidos: ClientePerdido[]
  upgrades: Upgrade[]
  novosPorCidade: CidadeResumo[]
  novosPorSegmento: SegmentoResumo[]
  clientesPerdidosDetalhado: ClientePerdidoDetalhado[]
  perdidosPorMotivo: MotivoPerda[]
}

const SETORES_META: Departamento[] = [
  'Suporte',
  'Fiscal',
  'Financeiro',
  'Comercial',
  'Certificado',
  'CS',
  'Instalação',
  'Treinamento',
  'Técnico',
]

// ── helpers ────────────────────────────────────────────────────────
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

// O servidor manda a data como "2026-09-15T00:00:00.000Z". Passar isso por new Date() converte
// pro fuso do navegador (UTC-3) e o dia volta um: 15/09 aparecia como 14/09. Aqui a data é lida
// como texto, sem conversão.
const dataBR = (v?: string | null) => {
  if (!v) return ''
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : String(v)
}

const percColor = (p: number) =>
  p >= 100 ? 'text-emerald-400' : p >= 75 ? 'text-blue-400' : p >= 50 ? 'text-amber-400' : 'text-red-400'

const percBg = (p: number) =>
  p >= 100 ? 'bg-emerald-500' : p >= 75 ? 'bg-blue-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500'

const percGradient = (p: number) =>
  p >= 100 ? 'from-emerald-600 to-emerald-400'
    : p >= 75 ? 'from-blue-600 to-blue-400'
    : p >= 50 ? 'from-amber-600 to-amber-400'
    : 'from-red-600 to-red-400'

function ProgressBar({ perc, height = 'h-3' }: { perc: number; height?: string }) {
  const w = Math.min(perc, 100)
  return (
    <div className={`w-full bg-slate-200 dark:bg-slate-700/60 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full bg-gradient-to-r ${percGradient(perc)} transition-all duration-700`}
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

// ── custom tooltip ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-2xl text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
          <span className="text-slate-900 dark:text-slate-100 font-medium">
            {p.name === 'Clientes' ? p.value : brl(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── componente principal ───────────────────────────────────────────
function BoletimComercialTab() {
  const now = new Date()
  const theme = useThemeStore(s => s.theme)
  const isDark = theme === 'dark'
  const gridColor = isDark ? '#1e293b' : '#e2e8f0'
  const tickColor = isDark ? '#64748b' : '#94a3b8'
  const [ano, setAno]   = useState(now.getFullYear())
  const [mes, setMes]   = useState(now.getMonth() + 1)
  const [dados, setDados] = useState<DadosComercial | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  // Segmento clicado na tabela "Novos por Segmento" — abre a lista de quem entrou nele.
  const [segmentoAberto, setSegmentoAberto] = useState<string | null>(null)

  const mesPad = String(mes).padStart(2, '0')
  const mesKey = `${ano}-${mesPad}`

  const navegar = (delta: number) => {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1;  a++ }
    setMes(m); setAno(a)
  }

  useEffect(() => {
    setLoading(true); setErro(false)
    ;(api.getMetasComercial as any)(mesKey)
      .then((d: DadosComercial) => { setDados(d); setLoading(false) })
      .catch(() => { setErro(true); setLoading(false) })
  }, [mesKey])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando boletim comercial...</p>
      </div>
    </div>
  )

  if (erro || !dados) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <AlertTriangle className="w-12 h-12 text-amber-400" />
      <p className="text-slate-400 text-sm">Erro ao carregar os dados</p>
      <button onClick={() => { setLoading(true); setErro(false) }}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
        <RefreshCw className="w-4 h-4" /> Tentar novamente
      </button>
    </div>
  )

  const { periodo, meta, resumo, porFilial, evolucao } = dados
  const perc = resumo.percMeta
  const faltaMeta = Math.max(0, meta.geral - resumo.receitaNova)
  const isMesAtual = ano === now.getFullYear() && mes === now.getMonth() + 1
  const evolucao12Meses = evolucao.slice(-12)
  const receitaInicio12m = evolucao12Meses[0]?.receitaNova ?? 0
  const receitaFim12m = evolucao12Meses[evolucao12Meses.length - 1]?.receitaNova ?? 0
  const delta12m = receitaFim12m - receitaInicio12m
  const delta12mPerc = receitaInicio12m > 0 ? (delta12m / receitaInicio12m) * 100 : null
  const tendenciaSubindo = delta12m >= 0

  return (
    <div className="space-y-5 pb-6">

      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Boletim Comercial
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5 capitalize">{periodo.label}</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
          <button onClick={() => navegar(-1)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[110px] text-center capitalize">
            {new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => navegar(1)} disabled={isMesAtual}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Hero — Meta Geral ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Meta do Período</p>
            <div className="flex items-baseline gap-3">
              <span className={`text-4xl font-black ${percColor(perc)}`}>
                {perc.toFixed(0)}%
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-sm">de {brl(meta.geral)}</span>
            </div>
            <p className={`text-sm mt-1 font-medium ${percColor(perc)}`}>
              {perc >= 100
                ? '🎉 Meta batida!'
                : perc >= 75
                ? `🔥 Faltam ${brl(faltaMeta)} para bater a meta`
                : perc >= 50
                ? `⚠️ Faltam ${brl(faltaMeta)} — acelere!`
                : `🚨 Faltam ${brl(faltaMeta)} — situação crítica`}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-0.5">Realizado</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{brl(resumo.receitaNova)}</p>
            </div>
            {isMesAtual && (
              <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-3">
                <p className="text-xs text-slate-500 mb-0.5">Dias restantes</p>
                <p className={`text-xl font-bold ${periodo.diasRestantes <= 5 ? 'text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {periodo.diasRestantes}d
                </p>
              </div>
            )}
          </div>
        </div>
        <ProgressBar perc={perc} height="h-4" />
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-slate-500">R$ 0</span>
          <span className="text-xs text-slate-500">{brl(meta.geral)}</span>
        </div>

        {/* sub-metas */}
        {resumo.valorUpgrades > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 mb-1">📦 Clientes Novos</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{brl(resumo.valorClientesNovos)}</p>
              <div className="mt-1"><ProgressBar perc={(resumo.valorClientesNovos / meta.geral) * 100} height="h-1.5" /></div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">⚡ Upgrades</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{brl(resumo.valorUpgrades)}</p>
              <div className="mt-1"><ProgressBar perc={(resumo.valorUpgrades / meta.geral) * 100} height="h-1.5" /></div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Total Ativos</p>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{resumo.totalAtivos.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-slate-500 mt-0.5">clientes</p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Novos</p>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{resumo.qtdNovos}</p>
          <p className="text-xs text-slate-500 mt-0.5">{brl(resumo.valorClientesNovos)}</p>
        </div>

        <div className={clsx(
          'bg-white dark:bg-slate-800 rounded-xl p-4 border',
          resumo.qtdPerdidos > 0 ? 'border-red-500/20' : 'border-slate-200 dark:border-slate-700'
        )}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Perdidos</p>
            <TrendingDown className={`w-4 h-4 ${resumo.qtdPerdidos > 0 ? 'text-red-400' : 'text-slate-500'}`} />
          </div>
          <p className={`text-2xl font-black ${resumo.qtdPerdidos > 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {resumo.qtdPerdidos}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{resumo.qtdPerdidos > 0 ? `-${brl(resumo.receitaPerdida)}` : '—'}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Reativados</p>
            <RefreshCw className="w-4 h-4 text-sky-400" />
          </div>
          <p className={`text-2xl font-black ${resumo.qtdReativados > 0 ? 'text-sky-400' : 'text-slate-400'}`}>
            {resumo.qtdReativados}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {resumo.qtdReativados > 0 ? brl(resumo.valorReativados) : '—'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Upgrades</p>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{brl(resumo.valorUpgrades)}</p>
          <p className="text-xs text-slate-500 mt-0.5">comissões</p>
        </div>

        <div className={clsx(
          'bg-white dark:bg-slate-800 rounded-xl p-4 border col-span-2 sm:col-span-1',
          resumo.receitaLiquida >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'
        )}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Saldo Líquido</p>
            {resumo.receitaLiquida >= 0
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              : <AlertTriangle className="w-4 h-4 text-red-400" />
            }
          </div>
          <p className={`text-2xl font-black ${resumo.receitaLiquida >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {brl(resumo.receitaLiquida)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">nova − perdida</p>
        </div>
      </div>

      {/* ── Tendência em Linha (12 meses) ────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-400" /> Tendência dos Últimos 12 Meses (Linha)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {tendenciaSubindo ? 'Tendência de alta' : 'Tendência de queda'}:
              {' '}
              <span className={tendenciaSubindo ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {delta12mPerc === null
                  ? `${brl(delta12m)} em relação ao início`
                  : `${Math.abs(delta12mPerc).toFixed(1)}% ${tendenciaSubindo ? 'acima' : 'abaixo'} do início`}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {tendenciaSubindo ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" /> Subindo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/15 text-red-400">
                <TrendingDown className="w-3.5 h-3.5" /> Descendo
              </span>
            )}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={evolucao12Meses} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: tickColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="anoAnterior"
              name="Ano Anterior"
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="receitaNova"
              name="Ano Atual"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Filiais ───────────────────────────────────────────────── */}
      {porFilial.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Desempenho por Filial
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {porFilial.map(f => (
              <div key={f.codCon} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{f.nome}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{f.qtd} clientes novos</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black ${percColor(f.perc)}`}>{f.perc.toFixed(0)}%</p>
                    {f.meta > 0 && <p className="text-xs text-slate-500">meta {brl(f.meta)}</p>}
                  </div>
                </div>
                <ProgressBar perc={f.perc} height="h-2.5" />
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{brl(f.valor)}</span>
                  {f.meta > 0 && <span className="text-xs text-slate-500">{brl(f.meta)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Evolução Mensal ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-400" /> Evolução dos Últimos 12 Meses
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Ano Atual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-500 inline-block" /> Ano Anterior
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded bg-amber-400 inline-block" /> Meta
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={evolucao} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const atual   = payload.find(p => p.dataKey === 'receitaNova')
                const anterior = payload.find(p => p.dataKey === 'anoAnterior')
                const metaVal  = payload.find(p => p.dataKey === 'meta')
                const diff = atual && anterior
                  ? (Number(atual.value) - Number(anterior.value))
                  : null
                const pct = anterior && Number(anterior.value) > 0 && diff !== null
                  ? ((diff / Number(anterior.value)) * 100).toFixed(1)
                  : null
                return (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs shadow-xl">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{label}</p>
                    {atual && <p className="text-blue-400">Ano atual: R$ {Number(atual.value).toLocaleString('pt-BR')}</p>}
                    {anterior && <p className="text-slate-500 dark:text-slate-400">Ano anterior: R$ {Number(anterior.value).toLocaleString('pt-BR')}</p>}
                    {metaVal && <p className="text-amber-400">Meta: R$ {Number(metaVal.value).toLocaleString('pt-BR')}</p>}
                    {pct !== null && (
                      <p className={`mt-1.5 font-semibold ${diff! >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {diff! >= 0 ? '▲' : '▼'} {Math.abs(Number(pct))}% vs ano anterior
                      </p>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="anoAnterior" name="Ano Anterior" radius={[3, 3, 0, 0]} maxBarSize={18} fill="#475569" fillOpacity={0.6} />
            <Bar dataKey="receitaNova" name="Ano Atual" radius={[3, 3, 0, 0]} maxBarSize={18}>
              {evolucao.map((e, i) => (
                <Cell key={i} fill={
                  i === evolucao.length - 1 ? '#3b82f6'
                    : e.receitaNova >= e.meta ? '#10b981'
                    : e.receitaNova >= e.meta * 0.75 ? '#3b82f6'
                    : '#60a5fa'
                } />
              ))}
            </Bar>
            <Line dataKey="meta" name="Meta" stroke="#f59e0b" strokeWidth={2}
              strokeDasharray="6 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Entradas x Saídas ─────────────────────────────────────────
          Receita que entrou contra a que saiu, mês a mês, com o saldo. É a leitura que o gráfico
          acima não dá: crescer em vendas não significa crescer em receita se a perda acompanha. */}
      {(() => {
        const fluxo = evolucao.map(e => ({
          ...e,
          receitaPerdida: e.receitaPerdida ?? 0,
          saldo: e.saldo ?? (e.receitaNova - (e.receitaPerdida ?? 0)),
        }))
        const totalNova = fluxo.reduce((s, e) => s + e.receitaNova, 0)
        const totalPerdida = fluxo.reduce((s, e) => s + e.receitaPerdida, 0)
        const saldoTotal = totalNova - totalPerdida
        const mesesNegativos = fluxo.filter(e => e.saldo < 0).length
        const saldoMedio = fluxo.length ? saldoTotal / fluxo.length : 0

        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Receita Nova x Receita Perdida (12 meses)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quanto de receita nova sobra por mês depois de descontar o que foi perdido.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Entrou</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Saiu</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded bg-blue-500 inline-block" /> Saldo</span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Entrou (12 meses)</p>
                <p className="text-lg font-bold text-emerald-500">{brl(totalNova)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Saiu (12 meses)</p>
                <p className="text-lg font-bold text-red-500">{brl(totalPerdida)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Saldo acumulado</p>
                <p className={`text-lg font-bold ${saldoTotal >= 0 ? 'text-blue-500' : 'text-red-500'}`}>{brl(saldoTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Sobra média por mês</p>
                <p className={`text-lg font-bold ${saldoMedio >= 0 ? 'text-blue-500' : 'text-red-500'}`}>{brl(saldoMedio)}</p>
                {mesesNegativos > 0 && (
                  <p className="text-[11px] text-red-500 mt-0.5">{mesesNegativos} mês(es) no negativo</p>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={fluxo} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload as EvoMes
                    if (!d) return null
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs shadow-xl">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{label}</p>
                        <p className="text-emerald-500">Entrou: R$ {d.receitaNova.toLocaleString('pt-BR')}</p>
                        <p className="text-red-500">Saiu: R$ {d.receitaPerdida.toLocaleString('pt-BR')}</p>
                        <p className={`mt-1.5 font-semibold ${d.saldo >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                          Saldo: R$ {d.saldo.toLocaleString('pt-BR')}
                        </p>
                        <p className="text-slate-500 mt-1">
                          {d.clientesNovos} entrada(s) · {d.clientesPerdidos ?? 0} saída(s)
                        </p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={0} stroke={tickColor} />
                <Bar dataKey="receitaNova" name="Entrou" radius={[3, 3, 0, 0]} maxBarSize={18} fill="#10b981" />
                <Bar dataKey="receitaPerdida" name="Saiu" radius={[3, 3, 0, 0]} maxBarSize={18} fill="#ef4444" />
                <Line dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* ── MRR mês a mês ─────────────────────────────────────────── */}
      {dados.mrr && dados.mrr.length > 0 && (() => {
        const serie = dados.mrr
        const primeiro = serie[0]
        const ultimo = serie[serie.length - 1]
        const crescimento12m = ultimo.valor - primeiro.valor
        const crescimentoPerc = primeiro.valor > 0 ? (crescimento12m / primeiro.valor) * 100 : null
        const mediaMes = serie.slice(1).reduce((s, m) => s + m.variacao, 0) / Math.max(serie.length - 1, 1)

        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500" /> Faturamento Recorrente (MRR) — 12 meses
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Soma das mensalidades da base ativa no fim de cada mês, e quanto ela cresceu.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">MRR atual</p>
                <p className="text-lg font-bold text-indigo-500">{brl(ultimo.valor)}</p>
                <p className="text-[11px] text-slate-500">{ultimo.clientes} clientes</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Há 12 meses</p>
                <p className="text-lg font-bold text-slate-500">{brl(primeiro.valor)}</p>
                <p className="text-[11px] text-slate-500">{primeiro.clientes} clientes</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Crescimento no período</p>
                <p className={`text-lg font-bold ${crescimento12m >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {crescimento12m >= 0 ? '+' : ''}{brl(crescimento12m)}
                </p>
                {crescimentoPerc !== null && (
                  <p className="text-[11px] text-slate-500">{crescimentoPerc >= 0 ? '+' : ''}{crescimentoPerc.toFixed(1)}%</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Crescimento médio por mês</p>
                <p className={`text-lg font-bold ${mediaMes >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {mediaMes >= 0 ? '+' : ''}{brl(mediaMes)}
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={56} domain={['dataMin - 5000', 'dataMax + 5000']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload as MrrMes
                    if (!d) return null
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs shadow-xl">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{label}</p>
                        <p className="text-indigo-500">MRR: R$ {d.valor.toLocaleString('pt-BR')}</p>
                        <p className="text-slate-500">{d.clientes} clientes na base</p>
                        <p className={`mt-1.5 font-semibold ${d.variacao >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {d.variacao >= 0 ? '▲' : '▼'} R$ {Math.abs(d.variacao).toLocaleString('pt-BR')}
                          {d.variacaoPerc !== null ? ` (${d.variacaoPerc >= 0 ? '+' : ''}${d.variacaoPerc.toFixed(1)}%)` : ''} vs mês anterior
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="variacao" name="Variação" maxBarSize={16} radius={[3, 3, 0, 0]}>
                  {serie.map((m, i) => <Cell key={i} fill={m.variacao >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
                <Line dataKey="valor" name="MRR" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* ── Projeção 12 meses ─────────────────────────────────────── */}
      {dados.projecao && dados.projecao.meses.length > 0 && (() => {
        const pj = dados.projecao
        const ultimoMes = pj.meses[pj.meses.length - 1]
        // Histórico e projeção no mesmo gráfico: duas séries, pra linha cheia virar tracejada no
        // ponto em que o dado deixa de ser real e passa a ser estimativa.
        const historico = (dados.mrr ?? []).map(m => ({ mes: m.mes, real: m.valor, previsto: null as number | null }))
        const emenda = historico.length
          ? [{ mes: historico[historico.length - 1].mes, real: historico[historico.length - 1].real, previsto: historico[historico.length - 1].real }]
          : []
        const futuro = pj.meses.map(m => ({ mes: m.mes, real: null as number | null, previsto: m.valor }))
        const serie = [...historico.slice(0, -1), ...emenda, ...futuro]

        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" /> Projeção dos Próximos 12 Meses
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mantendo o ritmo dos últimos 12 meses: entrada média menos perda média, aplicada sobre o MRR atual.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Entrada média/mês</p>
                <p className="text-lg font-bold text-emerald-500">{brl(pj.mediaEntrada)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Perda média/mês</p>
                <p className="text-lg font-bold text-red-500">{brl(pj.mediaSaida)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-500">Sobra média/mês</p>
                <p className={`text-lg font-bold ${pj.crescimentoMedioMes >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                  {pj.crescimentoMedioMes >= 0 ? '+' : ''}{brl(pj.crescimentoMedioMes)}
                </p>
              </div>
              <div className="rounded-xl border border-purple-200 dark:border-purple-500/40 bg-purple-50 dark:bg-purple-500/10 p-3">
                <p className="text-xs text-slate-500">MRR em 12 meses</p>
                <p className="text-lg font-bold text-purple-500">{brl(ultimoMes.valor)}</p>
                <p className="text-[11px] text-slate-500">
                  {ultimoMes.acumulado >= 0 ? '+' : ''}{brl(ultimoMes.acumulado)} sobre hoje
                </p>
              </div>
            </div>

            {pj.crescimentoMedioMes < 0 && (
              <p className="text-xs text-red-500 mb-3">
                ⚠ A perda média está maior que a entrada média — mantido esse ritmo, a projeção é de queda.
              </p>
            )}

            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={56} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const real = payload.find(p => p.dataKey === 'real' && p.value != null)
                    const previsto = payload.find(p => p.dataKey === 'previsto' && p.value != null)
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs shadow-xl">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{label}</p>
                        {real && <p className="text-indigo-500">Realizado: R$ {Number(real.value).toLocaleString('pt-BR')}</p>}
                        {previsto && <p className="text-purple-500">Projetado: R$ {Number(previsto.value).toLocaleString('pt-BR')}</p>}
                      </div>
                    )
                  }}
                />
                <Line dataKey="real" name="Realizado" stroke="#6366f1" strokeWidth={2.5} dot={false} connectNulls={false} />
                <Line dataKey="previsto" name="Projetado" stroke="#a855f7" strokeWidth={2.5}
                  strokeDasharray="6 4" dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-slate-500 mt-2">
              Projeção de tendência: repete o comportamento dos últimos 12 meses. Não considera reajuste,
              campanha nova nem a saída de um cliente grande.
            </p>
          </div>
        )
      })()}

      {/* ── Ranking do mês ────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Resumo do Período</p>
            <p className="text-slate-700 dark:text-slate-200 text-sm">
              {perc >= 100
                ? 'Meta alcançada! Excelente desempenho da equipe comercial.'
                : perc >= 75
                ? 'Ótimo ritmo! Continue o esforço para bater a meta.'
                : perc >= 50
                ? 'Em andamento. Intensifique os esforços de vendas.'
                : 'Período desafiador. Revise a estratégia comercial.'
              }
            </p>
          </div>
          <div className="flex gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-400">+{resumo.qtdNovos}</p>
              <p className="text-xs text-slate-500">entraram</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-black ${resumo.qtdPerdidos > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                -{resumo.qtdPerdidos}
              </p>
              <p className="text-xs text-slate-500">saíram</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-black ${resumo.qtdNovos - resumo.qtdPerdidos >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {resumo.qtdNovos - resumo.qtdPerdidos >= 0 ? '+' : ''}{resumo.qtdNovos - resumo.qtdPerdidos}
              </p>
              <p className="text-xs text-slate-500">saldo</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Clientes Novos e Reativados ───────────────────────────── */}
      {(() => {
        // Reativados entram na mesma lista dos novos, como no boletim do Delphi: para quem lê, os
        // dois são receita que entrou no período. A data do reativado é a da volta dele.
        const entradas = [
          ...dados.clientesNovos.map(c => ({ ...c, data: c.data_cadastro, tipo: 'NOVO' as const })),
          ...(dados.clientesReativados ?? []).map(c => ({ ...c, data: c.data_desativacao, tipo: 'REATIVADO' as const })),
        ].sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')))
        return entradas.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Clientes Novos e Reativados ({entradas.length})
            {dados.resumo.qtdReativados > 0 && (
              <span className="normal-case tracking-normal text-xs text-sky-500 font-normal">
                — {dados.resumo.qtdReativados} reativado(s), {brl(dados.resumo.valorReativados)}
              </span>
            )}
          </h2>
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cliente</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor Mensal</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cidade</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Tipo</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Data</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{entradas.map((c, i) => (
              <tr key={`${c.tipo}-${c.codigo}-${i}`} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{c.nome}</td>
                <td className="text-right px-3 py-2 text-emerald-400 font-semibold">{brl(c.valor)}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{c.cidade}</td>
                <td className="text-center px-3 py-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    c.tipo === 'NOVO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'
                  }`}>
                    {c.tipo === 'NOVO' ? 'Novo' : 'Reativado'}
                  </span>
                </td>
                <td className="text-center px-3 py-2 text-slate-500 text-xs">{dataBR(c.data)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        ) : null
      })()}

      {/* ── Upgrades Detalhado ────────────────────────────────────── */}
      {dados.upgrades.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Upgrades ({dados.upgrades.length})
          </h2>
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Vendedor</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cliente</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Descrição</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Data</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.upgrades.map((u, i) => (
              <tr key={i} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{u.vendedor}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{u.cliente}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{u.descricao}</td>
                <td className="text-right px-3 py-2 text-amber-400 font-semibold">{brl(u.valor)}</td>
                <td className="text-center px-3 py-2 text-slate-500 text-xs">{dataBR(u.data_venda)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── Clientes Perdidos Detalhado ───────────────────────────── */}
      {dados.clientesPerdidos.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-red-500/20 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" /> Clientes Perdidos ({dados.clientesPerdidos.length})
          </h2>
          <table className="w-full text-sm min-w-[500px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cliente</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor Mensal</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cidade</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Desativação</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.clientesPerdidos.map((c, i) => (
              <tr key={i} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{c.nome}</td>
                <td className="text-right px-3 py-2 text-red-400 font-semibold">{brl(c.valor)}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{c.cidade}</td>
                <td className="text-center px-3 py-2 text-slate-500 text-xs">{dataBR(c.data_desativacao)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── Novos Clientes por Cidade ─────────────────────────────── */}
      {dados.novosPorCidade.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Novos por Cidade
          </h2>
          <table className="w-full text-sm min-w-[400px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cidade</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Quantidade</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.novosPorCidade.map((c, i) => (
              <tr key={i} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{c.cidade}</td>
                <td className="text-center px-3 py-2 text-blue-400 font-semibold">{c.qtd}</td>
                <td className="text-right px-3 py-2 text-emerald-400 font-semibold">{brl(c.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── Novos Clientes por Segmento ────────────────────────────── */}
      {dados.novosPorSegmento.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Novos por Segmento
            <span className="normal-case tracking-normal text-xs text-slate-400 font-normal">— clique numa linha para ver os clientes</span>
          </h2>
          <table className="w-full text-sm min-w-[400px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Segmento</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Quantidade</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.novosPorSegmento.map((s, i) => (
              <tr
                key={i}
                className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30 cursor-pointer"
                onClick={() => setSegmentoAberto(s.seguimento)}
                title={`Ver os ${s.quantidade} cliente(s) de ${s.seguimento}`}
              >
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 underline decoration-dotted underline-offset-4">{s.seguimento}</td>
                <td className="text-center px-3 py-2 text-blue-400 font-semibold">{s.quantidade}</td>
                <td className="text-right px-3 py-2 text-emerald-400 font-semibold">{brl(s.valor_total)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Clientes do segmento clicado — sai do próprio detalhe de novos, que já vem com o
          segmento de cada cliente; não precisa de outra consulta ao servidor. */}
      {segmentoAberto && (() => {
        const lista = dados.clientesNovos.filter(c => (c.segmento || 'SEM CLASSIFICACAO') === segmentoAberto)
        const total = lista.reduce((soma, c) => soma + c.valor, 0)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSegmentoAberto(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{segmentoAberto}</h3>
                  <p className="text-sm text-slate-500">{lista.length} cliente(s) novo(s) · {brl(total)}</p>
                </div>
                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none" onClick={() => setSegmentoAberto(null)}>×</button>
              </div>
              <div className="overflow-y-auto p-5">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-2 py-2 text-slate-500">Cód</th>
                    <th className="text-left px-2 py-2 text-slate-500">Cliente</th>
                    <th className="text-left px-2 py-2 text-slate-500">Cidade</th>
                    <th className="text-left px-2 py-2 text-slate-500">Cadastro</th>
                    <th className="text-right px-2 py-2 text-slate-500">Mensalidade</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {lista.map(c => (
                      <tr key={c.codigo} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                        <td className="px-2 py-2 text-slate-500">{c.codigo}</td>
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{c.nome}</td>
                        <td className="px-2 py-2 text-slate-500">{c.cidade}</td>
                        <td className="px-2 py-2 text-slate-500">
                          {dataBR(c.data_cadastro)}
                        </td>
                        <td className="px-2 py-2 text-right text-emerald-500 font-medium">{brl(c.valor)}</td>
                      </tr>
                    ))}
                    {lista.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-6 text-slate-500">Nenhum cliente neste segmento.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Clientes Perdidos por Motivo ────────────────────────────── */}
      {dados.perdidosPorMotivo.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-red-500/20 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Perdidos por Motivo
          </h2>
          <table className="w-full text-sm min-w-[400px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Motivo</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Quantidade</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.perdidosPorMotivo.map((m, i) => {
              const totalPerdidos = dados.perdidosPorMotivo.reduce((sum, x) => sum + x.quantidade, 0)
              const perc = totalPerdidos > 0 ? (m.quantidade / totalPerdidos) * 100 : 0
              return (
                <tr key={i} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{m.motivo}</td>
                  <td className="text-center px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-red-400 font-semibold">{m.quantidade}</span>
                      <span className="text-xs text-slate-500">({perc.toFixed(1)}%)</span>
                    </div>
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}

      {/* ── Clientes Perdidos Detalhado ────────────────────────────── */}
      {dados.clientesPerdidosDetalhado.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-red-500/20 rounded-2xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" /> Clientes Perdidos Detalhado ({dados.clientesPerdidosDetalhado.length})
          </h2>
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cliente</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-slate-400">Valor</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Cidade</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Telefone</th>
              <th className="text-left px-3 py-2 text-slate-500 dark:text-slate-400">Motivo</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-slate-400">Data Desativação</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{dados.clientesPerdidosDetalhado.map((c, i) => (
              <tr key={i} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{c.nome}</td>
                <td className="text-right px-3 py-2 text-red-400 font-semibold">{brl(c.valor)}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{c.cidade}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{c.telefone || '—'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">{c.motivo}</td>
                <td className="text-center px-3 py-2 text-slate-500 text-xs">{dataBR(c.data_desativacao)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

    </div>
  )
}

type AbaMetas = 'cadastro' | 'tipos' | 'boletim'

type TipoMetaForm = {
  id: number | null
  nome: string
  descricao: string
  ordem: string
  ativo: boolean
}

type MetaCadastroForm = {
  id: number | null
  nome: string
  descricao: string
  tipoMetaId: string
  setorResponsavel: Departamento
  valorMeta: string
  competencia: string
  ativo: boolean
  usuariosVisualizacao: number[]
}

const emptyTipoMetaForm = (): TipoMetaForm => ({
  id: null,
  nome: '',
  descricao: '',
  ordem: '0',
  ativo: true,
})

const emptyMetaCadastroForm = (): MetaCadastroForm => ({
  id: null,
  nome: '',
  descricao: '',
  tipoMetaId: '',
  setorResponsavel: 'Comercial',
  valorMeta: '',
  competencia: '',
  ativo: true,
  usuariosVisualizacao: [],
})

function AbaButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/60'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * Mesma tela em dois endereços: o cadastro de metas (com os tipos) e o boletim comercial viraram
 * menus separados, porque uma coisa é configurar e a outra é o acompanhamento do dia a dia — quem
 * usa o boletim não mexe no cadastro.
 */
function MetasPagina({ modo }: { modo: 'cadastro' | 'boletim' }) {
  const { toast } = useToast()
  const [aba, setAba] = useState<AbaMetas>(modo === 'boletim' ? 'boletim' : 'cadastro')
  const [loadingCadastros, setLoadingCadastros] = useState(true)
  const [salvandoTipo, setSalvandoTipo] = useState(false)
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [tiposMeta, setTiposMeta] = useState<TipoMetaCadastro[]>([])
  const [metasCadastro, setMetasCadastro] = useState<MetaCadastroItem[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [tipoForm, setTipoForm] = useState<TipoMetaForm>(emptyTipoMetaForm())
  const [metaForm, setMetaForm] = useState<MetaCadastroForm>(emptyMetaCadastroForm())

  const carregarCadastros = async () => {
    try {
      setLoadingCadastros(true)
      const [tipos, metas, usuariosTodos] = await Promise.all([
        api.getTiposMeta(),
        api.getMetasCadastro(),
        api.getUsuariosTodos(),
      ])
      setTiposMeta(tipos)
      setMetasCadastro(metas)
      setUsuarios(usuariosTodos.filter((usuario) => usuario.ativo))
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar cadastro de metas.')
    } finally {
      setLoadingCadastros(false)
    }
  }

  useEffect(() => {
    carregarCadastros()
  }, [])

  const editarTipo = (tipo: TipoMetaCadastro) => {
    setTipoForm({
      id: tipo.id,
      nome: tipo.nome,
      descricao: tipo.descricao,
      ordem: String(tipo.ordem ?? 0),
      ativo: tipo.ativo,
    })
    setAba('tipos')
  }

  const editarMeta = (meta: MetaCadastroItem) => {
    setMetaForm({
      id: meta.id,
      nome: meta.nome,
      descricao: meta.descricao,
      tipoMetaId: meta.tipoMetaId ? String(meta.tipoMetaId) : '',
      setorResponsavel: meta.setorResponsavel,
      valorMeta: String(meta.valorMeta ?? ''),
      competencia: meta.competencia || '',
      ativo: meta.ativo,
      usuariosVisualizacao: meta.usuariosVisualizacao.map((item) => item.usuarioId),
    })
    setAba('cadastro')
  }

  const salvarTipo = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSalvandoTipo(true)
      const payload = {
        nome: tipoForm.nome.trim(),
        descricao: tipoForm.descricao.trim(),
        ordem: Number(tipoForm.ordem || 0),
        ativo: tipoForm.ativo,
      }
      if (tipoForm.id) {
        await api.updateTipoMeta(tipoForm.id, payload)
        toast.success('Tipo de meta atualizado.')
      } else {
        await api.createTipoMeta(payload)
        toast.success('Tipo de meta criado.')
      }
      setTipoForm(emptyTipoMetaForm())
      await carregarCadastros()
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar tipo de meta.')
    } finally {
      setSalvandoTipo(false)
    }
  }

  const salvarMeta = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSalvandoMeta(true)
      const payload = {
        nome: metaForm.nome.trim(),
        descricao: metaForm.descricao.trim(),
        tipoMetaId: metaForm.tipoMetaId ? Number(metaForm.tipoMetaId) : null,
        setorResponsavel: metaForm.setorResponsavel,
        valorMeta: Number(metaForm.valorMeta || 0),
        competencia: metaForm.competencia.trim(),
        ativo: metaForm.ativo,
        usuariosVisualizacao: metaForm.usuariosVisualizacao,
      }
      if (metaForm.id) {
        await api.updateMetaCadastro(metaForm.id, payload)
        toast.success('Meta atualizada.')
      } else {
        await api.createMetaCadastro(payload)
        toast.success('Meta criada.')
      }
      setMetaForm(emptyMetaCadastroForm())
      await carregarCadastros()
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar meta.')
    } finally {
      setSalvandoMeta(false)
    }
  }

  const toggleUsuarioVisualizacao = (usuarioId: number) => {
    setMetaForm((current) => ({
      ...current,
      usuariosVisualizacao: current.usuariosVisualizacao.includes(usuarioId)
        ? current.usuariosVisualizacao.filter((id) => id !== usuarioId)
        : [...current.usuariosVisualizacao, usuarioId],
    }))
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            {modo === 'boletim' ? 'Boletim Comercial' : 'Cadastro de Metas'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {modo === 'boletim'
              ? 'Acompanhamento comercial do período.'
              : 'Cadastre metas por setor, organize tipos de meta e controle a visualização por usuário.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {modo === 'cadastro' && (
            <>
              <AbaButton active={aba === 'cadastro'} icon={<Target className="w-4 h-4" />} label="Cadastro de Metas" onClick={() => setAba('cadastro')} />
              <AbaButton active={aba === 'tipos'} icon={<Layers3 className="w-4 h-4" />} label="Tipos de Meta" onClick={() => setAba('tipos')} />
            </>
          )}
        </div>
      </div>

      {aba === 'boletim' ? (
        <BoletimComercialTab />
      ) : (
        <>
          {loadingCadastros ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-400">Carregando cadastro de metas...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[440px_minmax(0,1fr)] gap-5">
              {aba === 'cadastro' ? (
                <>
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {metaForm.id ? 'Editar meta' : 'Nova meta'}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Defina valor, setor responsável, tipo e quem pode visualizar.
                        </p>
                      </div>
                      {metaForm.id && (
                        <button
                          type="button"
                          onClick={() => setMetaForm(emptyMetaCadastroForm())}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          Limpar edição
                        </button>
                      )}
                    </div>

                    <form onSubmit={salvarMeta} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nome da meta</label>
                        <input
                          value={metaForm.nome}
                          onChange={(e) => setMetaForm((current) => ({ ...current, nome: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          placeholder="Ex.: Meta de treinamentos do comercial"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Descrição</label>
                        <textarea
                          value={metaForm.descricao}
                          onChange={(e) => setMetaForm((current) => ({ ...current, descricao: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[88px]"
                          placeholder="Detalhe o objetivo da meta"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Tipo de meta</label>
                          <select
                            value={metaForm.tipoMetaId}
                            onChange={(e) => setMetaForm((current) => ({ ...current, tipoMetaId: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          >
                            <option value="">Sem tipo</option>
                            {tiposMeta.map((tipo) => (
                              <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Setor responsável</label>
                          <select
                            value={metaForm.setorResponsavel}
                            onChange={(e) => setMetaForm((current) => ({ ...current, setorResponsavel: e.target.value as Departamento }))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          >
                            {SETORES_META.map((setor) => (
                              <option key={setor} value={setor}>{setor}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Valor da meta</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={metaForm.valorMeta}
                            onChange={(e) => setMetaForm((current) => ({ ...current, valorMeta: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Competência</label>
                          <input
                            value={metaForm.competencia}
                            onChange={(e) => setMetaForm((current) => ({ ...current, competencia: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            placeholder="Ex.: 2026-05 ou Maio/2026"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={metaForm.ativo}
                          onChange={(e) => setMetaForm((current) => ({ ...current, ativo: e.target.checked }))}
                          className="rounded border-slate-300"
                        />
                        Meta ativa
                      </label>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Usuários que podem visualizar</label>
                          <span className="text-xs text-slate-500">{metaForm.usuariosVisualizacao.length} selecionado(s)</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                          {usuarios.map((usuario) => (
                            <label key={usuario.id} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                              <input
                                type="checkbox"
                                checked={metaForm.usuariosVisualizacao.includes(usuario.id)}
                                onChange={() => toggleUsuarioVisualizacao(usuario.id)}
                                className="rounded border-slate-300"
                              />
                              <span className="flex-1">{usuario.nome}</span>
                              <span className="text-xs text-slate-400">{usuario.departamento}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={salvandoMeta}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
                      >
                        {salvandoMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {metaForm.id ? 'Salvar alterações' : 'Criar meta'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Metas cadastradas</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{metasCadastro.length} meta(s) cadastrada(s)</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMetaForm(emptyMetaCadastroForm())}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                      >
                        <Plus className="w-4 h-4" />
                        Nova
                      </button>
                    </div>

                    <div className="space-y-3">
                      {metasCadastro.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-500">
                          Nenhuma meta cadastrada ainda.
                        </div>
                      ) : metasCadastro.map((meta) => (
                        <div key={meta.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{meta.nome}</h3>
                                <span className={clsx(
                                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                  meta.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                                )}>
                                  {meta.ativo ? 'Ativa' : 'Inativa'}
                                </span>
                                {meta.tipoMetaNome && (
                                  <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium">
                                    {meta.tipoMetaNome}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{meta.descricao || 'Sem descrição informada.'}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                <div>
                                  <span className="text-slate-400">Setor:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-200 font-medium">{meta.setorResponsavel}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Valor:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-200 font-medium">{brl(meta.valorMeta)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Competência:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-200 font-medium">{meta.competencia || 'Não definida'}</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Visualização</p>
                                <div className="flex flex-wrap gap-2">
                                  {meta.usuariosVisualizacao.length > 0 ? meta.usuariosVisualizacao.map((usuario) => (
                                    <span key={`${meta.id}-${usuario.usuarioId}`} className="rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 text-xs">
                                      {usuario.usuarioNome}
                                    </span>
                                  )) : (
                                    <span className="text-sm text-slate-500">Nenhum usuário vinculado.</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => editarMeta(meta)}
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 py-2 text-sm"
                            >
                              <Pencil className="w-4 h-4" />
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {tipoForm.id ? 'Editar tipo de meta' : 'Novo tipo de meta'}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Organize metas por categorias para reutilizar entre setores.
                        </p>
                      </div>
                      {tipoForm.id && (
                        <button
                          type="button"
                          onClick={() => setTipoForm(emptyTipoMetaForm())}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          Limpar edição
                        </button>
                      )}
                    </div>

                    <form onSubmit={salvarTipo} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nome</label>
                        <input
                          value={tipoForm.nome}
                          onChange={(e) => setTipoForm((current) => ({ ...current, nome: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          placeholder="Ex.: Receita, Qualidade, Treinamento"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Descrição</label>
                        <textarea
                          value={tipoForm.descricao}
                          onChange={(e) => setTipoForm((current) => ({ ...current, descricao: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[96px]"
                          placeholder="Explique para que esse tipo será usado"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Ordem</label>
                          <input
                            type="number"
                            min="0"
                            value={tipoForm.ordem}
                            onChange={(e) => setTipoForm((current) => ({ ...current, ordem: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 pt-8">
                          <input
                            type="checkbox"
                            checked={tipoForm.ativo}
                            onChange={(e) => setTipoForm((current) => ({ ...current, ativo: e.target.checked }))}
                            className="rounded border-slate-300"
                          />
                          Tipo ativo
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={salvandoTipo}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
                      >
                        {salvandoTipo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {tipoForm.id ? 'Salvar alterações' : 'Criar tipo'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tipos de meta</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{tiposMeta.length} tipo(s) cadastrado(s)</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTipoForm(emptyTipoMetaForm())}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                      >
                        <Plus className="w-4 h-4" />
                        Novo
                      </button>
                    </div>

                    <div className="space-y-3">
                      {tiposMeta.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-500">
                          Nenhum tipo de meta cadastrado ainda.
                        </div>
                      ) : tiposMeta.map((tipo) => (
                        <div key={tipo.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tipo.nome}</h3>
                              <span className={clsx(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                tipo.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                              )}>
                                {tipo.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{tipo.descricao || 'Sem descrição informada.'}</p>
                            <p className="text-xs text-slate-400">Ordem: {tipo.ordem}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => editarTipo(tipo)}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 py-2 text-sm"
                          >
                            <Pencil className="w-4 h-4" />
                            Editar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Rota /metas — só o acompanhamento comercial. */
export function Metas() {
  return <MetasPagina modo="boletim" />
}

/** Rota /metas/cadastro — cadastro de metas e tipos de meta. */
export function CadastroMetas() {
  return <MetasPagina modo="cadastro" />
}
