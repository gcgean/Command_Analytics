import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock3, Layers,
  Lightbulb, PauseCircle, RefreshCcw, Timer, TrendingUp, UserPlus, UserX, Users,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import type { ImplantacaoCliente, ImplantacaoPainel } from '../../types'

type PeriodoFiltro = 'hoje' | 'semana' | 'mes' | 'tudo'

// Etapas terminais (não contam como "em andamento").
const STATUS_CONCLUIDO = 7
const STATUS_DESISTENCIA = 10
// Dias na mesma etapa a partir dos quais consideramos o processo "parado".
const LIMITE_PARADO_DIAS = 30

function getNomeDestaque(cliente: ImplantacaoCliente) {
  const fantasia = String(cliente?.nomeFantasia || '').trim()
  const razao = String(cliente?.clienteNome || '').trim()
  return fantasia || razao || 'Cliente sem nome'
}

function getNomeSecundario(cliente: ImplantacaoCliente) {
  const fantasia = String(cliente?.nomeFantasia || '').trim()
  const razao = String(cliente?.clienteNome || '').trim()
  if (!fantasia) return ''
  if (!razao || fantasia.toLowerCase() === razao.toLowerCase()) return ''
  return razao
}

function getTipoLabel(tipo?: string | null) {
  return tipo === 'novo_servico' ? 'Serviço (cliente existente)' : 'Novo cliente'
}

function getDataValida(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function isMesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getInicioDaSemana(date: Date) {
  const copia = new Date(date)
  const dia = copia.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  copia.setHours(0, 0, 0, 0)
  copia.setDate(copia.getDate() + diff)
  return copia
}

function pertenceAoPeriodo(value: string | null | undefined, periodo: PeriodoFiltro) {
  if (periodo === 'tudo') return true
  const data = getDataValida(value)
  if (!data) return false

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  if (periodo === 'hoje') return isMesmoDia(data, hoje)

  if (periodo === 'semana') {
    const inicioSemana = getInicioDaSemana(hoje)
    const fimSemana = new Date(inicioSemana)
    fimSemana.setDate(fimSemana.getDate() + 7)
    return data >= inicioSemana && data < fimSemana
  }

  return data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth()
}

function getPeriodoLabel(periodo: PeriodoFiltro) {
  const hoje = new Date()
  if (periodo === 'hoje') return hoje.toLocaleDateString('pt-BR')
  if (periodo === 'semana') {
    const inicio = getInicioDaSemana(hoje)
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 6)
    return `${inicio.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}`
  }
  if (periodo === 'mes') return hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return 'todo o período'
}

type Insight = { nivel: 'critico' | 'alerta' | 'ok'; texto: string }

type ProcessoAtencao = ImplantacaoCliente & { motivos: string[]; severidade: number }

export function DashboardImplantacao() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('tudo')

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.getImplantacaoPainel()
      setPainel(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') { event.preventDefault(); navigate('/implantacao/acompanhamento') }
      if (key === 'p') { event.preventDefault(); navigate('/implantacao') }
      if (key === 'd') { event.preventDefault(); navigate('/implantacao/dashboard') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const etapaMap = useMemo(() => {
    const map = new Map<number, { nome: string; cor: string; slaDias: number }>()
    ;(painel?.etapas || []).forEach((e) => map.set(e.status, { nome: e.nome, cor: e.cor, slaDias: Number(e.slaDias || 0) }))
    return map
  }, [painel?.etapas])

  const dados = useMemo(() => {
    const processos = painel?.clientes || []
    const etapas = painel?.etapas || []

    const ativos = processos.filter((p) => ![STATUS_CONCLUIDO, STATUS_DESISTENCIA].includes(Number(p.statusInstal || 0)))
    const concluidosTodos = processos.filter((p) => Number(p.statusInstal || 0) === STATUS_CONCLUIDO)
    const desistencias = processos.filter((p) => Number(p.statusInstal || 0) === STATUS_DESISTENCIA)

    const concluidosPeriodo = concluidosTodos.filter((p) => pertenceAoPeriodo(p.dataInicioStatusAtual, periodo))
    const novosPeriodo = processos.filter((p) => pertenceAoPeriodo(p.processoCriadoEm, periodo))

    const atrasados = ativos.filter((p) => p.emAtraso)
    const semResponsavel = ativos.filter((p) => !p.responsavelId)
    const parados = ativos.filter((p) => Number(p.diasNaEtapa || 0) >= LIMITE_PARADO_DIAS)

    const progressoMedio = ativos.length
      ? Math.round(ativos.reduce((acc, p) => acc + (p.progressoChecklist || 0), 0) / ativos.length)
      : 0
    const tempoMedioEtapa = ativos.length
      ? Math.round(ativos.reduce((acc, p) => acc + (p.diasNaEtapa || 0), 0) / ativos.length)
      : 0

    const totalConsiderado = ativos.length + concluidosTodos.length + desistencias.length
    const taxaConclusao = totalConsiderado ? Math.round((concluidosTodos.length / totalConsiderado) * 100) : 0

    // Distribuição por etapa (todos os processos, em ordem de etapa).
    const distribuicaoEtapas = etapas
      .map((etapa) => {
        const lista = processos.filter((p) => Number(p.statusInstal) === etapa.status)
        const atrasadosEtapa = lista.filter((p) => p.emAtraso).length
        const tempoMedio = lista.length
          ? Math.round(lista.reduce((acc, p) => acc + (p.diasNaEtapa || 0), 0) / lista.length)
          : 0
        return { status: etapa.status, ordem: etapa.ordem ?? etapa.status, nome: etapa.nome, cor: etapa.cor, quantidade: lista.length, atrasados: atrasadosEtapa, tempoMedio }
      })

    // Gargalos = etapas em andamento com mais processos parados/acumulados.
    const gargalos = distribuicaoEtapas
      .filter((e) => ![STATUS_CONCLUIDO, STATUS_DESISTENCIA].includes(e.status) && e.quantidade > 0)
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6)

    // Etapas mais lentas por tempo médio (revela onde os processos travam).
    const maisLentas = distribuicaoEtapas
      .filter((e) => ![STATUS_CONCLUIDO, STATUS_DESISTENCIA].includes(e.status) && e.quantidade > 0)
      .sort((a, b) => b.tempoMedio - a.tempoMedio)
      .slice(0, 6)

    // Split por tipo (ativos): "Novo cliente" fica como uma barra só, mas cada serviço
    // implantado em cliente existente aparece com o próprio nome, não agrupado num bucket genérico.
    const tipoNovoCliente = ativos.filter((p) => p.processoTipo !== 'novo_servico').length
    const servicosMap = new Map<string, number>()
    ativos
      .filter((p) => p.processoTipo === 'novo_servico')
      .forEach((p) => {
        const nome = String(p.servicoNome || p.processoTitulo || 'Serviço sem nome').trim() || 'Serviço sem nome'
        servicosMap.set(nome, (servicosMap.get(nome) || 0) + 1)
      })
    const distribuicaoPorTipo = [
      { label: 'Novo cliente', quantidade: tipoNovoCliente, cor: 'bg-blue-500' },
      ...Array.from(servicosMap.entries())
        .map(([label, quantidade]) => ({ label, quantidade, cor: 'bg-violet-500' }))
        .sort((a, b) => b.quantidade - a.quantidade),
    ].filter((item) => item.quantidade > 0)

    // Carga por responsável (ativos).
    const respMap = new Map<string, { nome: string; total: number; atrasados: number; semDefinir: boolean }>()
    ativos.forEach((p) => {
      const nome = p.responsavelNome || 'Sem responsável'
      if (!respMap.has(nome)) respMap.set(nome, { nome, total: 0, atrasados: 0, semDefinir: !p.responsavelId })
      const item = respMap.get(nome)!
      item.total += 1
      if (p.emAtraso) item.atrasados += 1
    })
    const cargaPorResponsavel = Array.from(respMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // Processos que precisam de ação (atrasado / sem responsável / parado).
    const atencao: ProcessoAtencao[] = ativos
      .map((p) => {
        const motivos: string[] = []
        let severidade = 0
        if (p.emAtraso) { motivos.push('Atrasado (passou do SLA da etapa)'); severidade += 3 }
        if (!p.responsavelId) { motivos.push('Sem responsável'); severidade += 2 }
        if (Number(p.diasNaEtapa || 0) >= LIMITE_PARADO_DIAS) { motivos.push(`Parado há ${p.diasNaEtapa} dias na etapa`); severidade += 2 }
        if ((p.progressoChecklist || 0) === 0 && ![1, 11].includes(Number(p.statusInstal))) { motivos.push('Checklist não iniciado'); severidade += 1 }
        return { ...p, motivos, severidade }
      })
      .filter((p) => p.motivos.length > 0)
      .sort((a, b) => (b.severidade - a.severidade) || (Number(b.diasNaEtapa || 0) - Number(a.diasNaEtapa || 0)))
      .slice(0, 60)

    // Recomendações automáticas ("norte" para o gestor).
    const insights: Insight[] = []
    const pct = (n: number) => (ativos.length ? Math.round((n / ativos.length) * 100) : 0)
    if (semResponsavel.length > 0 && pct(semResponsavel.length) >= 20) {
      insights.push({ nivel: 'critico', texto: `${pct(semResponsavel.length)}% dos processos ativos (${semResponsavel.length}) estão sem responsável. Distribua a carteira para não perder acompanhamento.` })
    }
    if (atrasados.length > 0 && pct(atrasados.length) >= 15) {
      insights.push({ nivel: 'critico', texto: `${pct(atrasados.length)}% dos processos ativos (${atrasados.length}) passaram do SLA da etapa. Priorize os mais antigos na lista de ação abaixo.` })
    }
    if (parados.length > 0) {
      insights.push({ nivel: 'alerta', texto: `${parados.length} processo(s) estão há mais de ${LIMITE_PARADO_DIAS} dias na mesma etapa. Verifique se estão travados por dependência do cliente ou falta de ação interna.` })
    }
    if (ativos.length > 0 && progressoMedio < 40) {
      insights.push({ nivel: 'alerta', texto: `Progresso médio de checklist em ${progressoMedio}%. Reforce o preenchimento do checklist para dar visibilidade real do andamento.` })
    }
    const gargaloTop = gargalos[0]
    if (gargaloTop && ativos.length > 0 && gargaloTop.quantidade / ativos.length >= 0.25) {
      insights.push({ nivel: 'alerta', texto: `A etapa "${gargaloTop.nome}" concentra ${Math.round((gargaloTop.quantidade / ativos.length) * 100)}% dos processos ativos. Avalie reforço de equipe ou revisão do fluxo nessa etapa.` })
    }
    const lentaTop = maisLentas[0]
    if (lentaTop && lentaTop.tempoMedio >= LIMITE_PARADO_DIAS) {
      insights.push({ nivel: 'alerta', texto: `Processos ficam em média ${lentaTop.tempoMedio} dias na etapa "${lentaTop.nome}" — é o ponto mais lento do fluxo hoje.` })
    }
    if (insights.length === 0) {
      insights.push({ nivel: 'ok', texto: 'Operação saudável: sem gargalos, atrasos ou processos órfãos relevantes no momento.' })
    }

    return {
      totalProcessos: processos.length,
      ativos: ativos.length,
      concluidosTodos: concluidosTodos.length,
      desistencias: desistencias.length,
      concluidosPeriodo: concluidosPeriodo.length,
      novosPeriodo: novosPeriodo.length,
      atrasados: atrasados.length,
      semResponsavel: semResponsavel.length,
      parados: parados.length,
      progressoMedio,
      tempoMedioEtapa,
      taxaConclusao,
      distribuicaoEtapas,
      gargalos,
      maisLentas,
      distribuicaoPorTipo,
      cargaPorResponsavel,
      atencao,
      insights,
    }
  }, [painel, periodo])

  const periodoLabel = useMemo(() => getPeriodoLabel(periodo), [periodo])
  const maxDist = Math.max(1, ...dados.distribuicaoEtapas.map((e) => e.quantidade))
  const maxCarga = Math.max(1, ...dados.cargaPorResponsavel.map((i) => i.total))
  const maxLenta = Math.max(1, ...dados.maisLentas.map((e) => e.tempoMedio))
  const totalTipo = Math.max(1, dados.distribuicaoPorTipo.reduce((acc, item) => acc + item.quantidade, 0))

  const pctAtrasados = dados.ativos ? Math.round((dados.atrasados / dados.ativos) * 100) : 0
  const pctSemResp = dados.ativos ? Math.round((dados.semResponsavel / dados.ativos) * 100) : 0

  function abrirProcesso(p: ImplantacaoCliente) {
    navigate(`/implantacao/acompanhamento?cliente=${p.clienteId}${p.processoId ? `&processo=${p.processoId}` : ''}`)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Implantação &gt; Dashboard</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard de Implantação</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Visão gerencial dos processos de implantação — novos clientes e serviços em clientes existentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Atalhos: Ctrl+K Acompanhamento | Ctrl+P Pipeline | Ctrl+D Dashboard"
            className="h-8 w-8 rounded-full border border-slate-300 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            ?
          </button>
          <Button
            variant="secondary"
            icon={<RefreshCcw className="w-4 h-4" />}
            onClick={() => void carregar()}
            loading={loading}
            className="w-full sm:w-auto justify-center"
          >
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs operacionais — sempre refletem o estado atual dos processos ativos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><Boxes className="w-3.5 h-3.5" /> Processos ativos</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados.ativos}</p>
          <p className="mt-1 text-[11px] text-slate-400">de {dados.totalProcessos} no total</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Atrasados</p>
          <p className="text-xl sm:text-2xl font-bold text-rose-600 mt-1">{dados.atrasados}</p>
          <p className="mt-1 text-[11px] text-slate-400">{pctAtrasados}% dos ativos</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><UserX className="w-3.5 h-3.5 text-amber-500" /> Sem responsável</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">{dados.semResponsavel}</p>
          <p className="mt-1 text-[11px] text-slate-400">{pctSemResp}% dos ativos</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Parados +{LIMITE_PARADO_DIAS}d</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">{dados.parados}</p>
          <p className="mt-1 text-[11px] text-slate-400">na mesma etapa</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Concluídos</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{dados.concluidosPeriodo}</p>
          <p className="mt-1 text-[11px] text-slate-400">{periodoLabel}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5 text-blue-500" /> Novos processos</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">{dados.novosPeriodo}</p>
          <p className="mt-1 text-[11px] text-slate-400">{periodoLabel}</p>
        </Card>
      </div>

      <Card padding="sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-slate-500">O filtro de período afeta apenas <strong>Concluídos</strong> e <strong>Novos processos</strong>. Os demais indicadores mostram o estado atual da operação.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'hoje', label: 'Hoje' },
              { key: 'semana', label: 'Esta semana' },
              { key: 'mes', label: 'Este mês' },
              { key: 'tudo', label: 'Tudo' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriodo(item.key as PeriodoFiltro)}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  periodo === item.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Saúde + Recomendações */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Saúde operacional</p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Progresso médio de checklist</span>
                <strong className="text-slate-900 dark:text-slate-100">{dados.progressoMedio}%</strong>
              </div>
              <div className="mt-1.5 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={clsx('h-full rounded', dados.progressoMedio < 40 ? 'bg-rose-500' : dados.progressoMedio < 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${dados.progressoMedio}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><TrendingUp className="w-4 h-4 text-blue-500" /> Taxa de conclusão</span>
                <strong className="text-slate-900 dark:text-slate-100">{dados.taxaConclusao}%</strong>
              </div>
              <div className="mt-1.5 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded bg-emerald-500" style={{ width: `${dados.taxaConclusao}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><Clock3 className="w-4 h-4 text-blue-500" /> Tempo médio na etapa</span>
              <strong className="text-slate-900 dark:text-slate-100">{dados.tempoMedioEtapa} dias</strong>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><PauseCircle className="w-4 h-4 text-amber-500" /> Desistências (total)</span>
              <strong className="text-slate-900 dark:text-slate-100">{dados.desistencias}</strong>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Recomendações — o que ajustar na operação</p>
          <div className="space-y-2">
            {dados.insights.map((insight, index) => (
              <div
                key={index}
                className={clsx(
                  'flex items-start gap-2 rounded-lg border p-2.5 text-sm',
                  insight.nivel === 'critico'
                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-200'
                    : insight.nivel === 'alerta'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200',
                )}
              >
                <span className="mt-0.5">
                  {insight.nivel === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </span>
                <span>{insight.texto}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Distribuição / tipo / carga */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-blue-500" /> Processos por etapa</p>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {dados.distribuicaoEtapas.map((etapa) => (
              <div key={etapa.status}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{etapa.ordem}. {etapa.nome}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    {etapa.atrasados > 0 ? <span className="text-rose-600 dark:text-rose-300 font-medium">{etapa.atrasados} atras.</span> : null}
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{etapa.quantidade}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.round((etapa.quantidade / maxDist) * 100)}%`, backgroundColor: etapa.cor }} />
                </div>
              </div>
            ))}
            {dados.distribuicaoEtapas.length === 0 ? <p className="text-sm text-slate-500">Sem dados.</p> : null}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-500" /> Processos ativos por tipo</p>
          <div className="space-y-4">
            {dados.distribuicaoPorTipo.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{item.label}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 flex-shrink-0 ml-2">{item.quantidade} <span className="text-xs text-slate-400">({Math.round((item.quantidade / totalTipo) * 100)}%)</span></span>
                </div>
                <div className="mt-1.5 h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={clsx('h-full rounded', item.cor)} style={{ width: `${Math.round((item.quantidade / totalTipo) * 100)}%` }} />
                </div>
              </div>
            ))}
            {dados.distribuicaoPorTipo.length === 0 ? <p className="text-sm text-slate-500">Sem processos ativos.</p> : null}
          </div>

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-5 mb-3 flex items-center gap-2"><Timer className="w-4 h-4 text-amber-500" /> Etapas mais lentas</p>
          <div className="space-y-2">
            {dados.maisLentas.map((etapa) => (
              <div key={etapa.status}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{etapa.nome}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{etapa.tempoMedio} dias</span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded bg-amber-500" style={{ width: `${Math.round((etapa.tempoMedio / maxLenta) * 100)}%` }} />
                </div>
              </div>
            ))}
            {dados.maisLentas.length === 0 ? <p className="text-sm text-slate-500">Sem dados.</p> : null}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /> Carga por responsável</p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {dados.cargaPorResponsavel.map((item) => {
              const isSem = item.nome === 'Sem responsável'
              return (
                <div key={item.nome} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.nome}</p>
                    <p className="text-xs text-slate-500 flex-shrink-0">
                      {item.total} proc.{item.atrasados > 0 ? <span className="text-rose-600 dark:text-rose-300 ml-1">· {item.atrasados} atras.</span> : null}
                    </p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div className={clsx('h-full rounded', isSem ? 'bg-rose-500' : 'bg-blue-500')} style={{ width: `${Math.max(6, Math.round((item.total / maxCarga) * 100))}%` }} />
                  </div>
                </div>
              )
            })}
            {dados.cargaPorResponsavel.length === 0 ? <p className="text-sm text-slate-500">Sem processos ativos.</p> : null}
          </div>
        </Card>
      </div>

      {/* Gargalos por volume */}
      <Card>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Gargalos por etapa (maior acúmulo de processos ativos)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {dados.gargalos.map((etapa) => (
            <div key={etapa.status}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300">{etapa.ordem}. {etapa.nome}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{etapa.quantidade}{etapa.atrasados > 0 ? <span className="text-rose-600 dark:text-rose-300 ml-1 font-normal">({etapa.atrasados} atras.)</span> : null}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${Math.round((etapa.quantidade / Math.max(1, dados.gargalos[0]?.quantidade || 1)) * 100)}%`, backgroundColor: etapa.cor }} />
              </div>
            </div>
          ))}
          {dados.gargalos.length === 0 ? <p className="text-sm text-slate-500">Sem gargalos no momento.</p> : null}
        </div>
      </Card>

      {/* Processos que precisam de ação */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Processos que precisam de ação ({dados.atencao.length})
          </p>
          <p className="text-xs text-slate-500 mt-1">Processos ativos atrasados, sem responsável ou parados há muito tempo — ordenados por severidade.</p>
        </div>

        <div className="md:hidden p-2.5 space-y-2">
          {dados.atencao.map((p) => (
            <div key={p.processoId || p.clienteId} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(p)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{p.processoTitulo || getTipoLabel(p.processoTipo)} · {getTipoLabel(p.processoTipo)}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5">Etapa: {etapaMap.get(p.statusInstal)?.nome || p.statusInstal} · {p.diasNaEtapa || 0} dias</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Responsável: {p.responsavelNome || 'Não definido'}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.motivos.map((m, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{m}</span>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="secondary" className="border border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300" onClick={() => abrirProcesso(p)}>Ver</Button>
              </div>
            </div>
          ))}
          {!loading && dados.atencao.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">Nenhum processo precisando de ação. 🎉</div>
          ) : null}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Cliente / Processo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Dias na etapa</th>
                <th className="px-4 py-3">Checklist</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Motivos</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.atencao.map((p) => (
                <tr key={p.processoId || p.clienteId} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(p)}</p>
                    <p className="text-xs text-slate-500">{p.processoTitulo || getNomeSecundario(p) || p.cnpj || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                      p.processoTipo === 'novo_servico'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                    )}>
                      {getTipoLabel(p.processoTipo)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: etapaMap.get(p.statusInstal)?.cor || '#94a3b8' }} />
                      {etapaMap.get(p.statusInstal)?.nome || `Etapa ${p.statusInstal}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium', p.emAtraso ? 'text-rose-600 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300')}>
                      {p.diasNaEtapa || 0} dias
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      (p.progressoChecklist || 0) <= 20 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                    )}>
                      {p.progressoChecklist || 0}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{p.responsavelNome || <span className="text-rose-600 dark:text-rose-300">Não definido</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.motivos.map((m, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" className="border border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => abrirProcesso(p)}>Ver</Button>
                  </td>
                </tr>
              ))}
              {!loading && dados.atencao.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={8}>Nenhum processo precisando de ação no momento. 🎉</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
