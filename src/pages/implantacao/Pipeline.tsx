import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GripVertical, LayoutList, Loader2, RefreshCcw, Search,
  SlidersHorizontal, Users, KanbanSquare, MoveRight, Pencil, History
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import type {
  ImplantacaoChecklistOpcao, ImplantacaoCliente, ImplantacaoEtapa, ImplantacaoPainel
} from '../../types'

type ViewMode = 'lista' | 'kanban'

type TransitionItem = {
  checklistId: number
  itemIndex: number
  texto: string
  marcado: boolean
  observacao: string
}

function formatCidadeUf(cidade?: string | null, uf?: string | null) {
  if (cidade && uf) return `${cidade}/${uf}`
  return cidade || uf || '—'
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

function formatTempoDesde(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const dias = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  if (dias < 30) return `${dias} dias`
  if (dias < 365) return `${Math.floor(dias / 30)} meses`
  const anos = dias / 365
  return `${anos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} anos`
}

function getNomeDestaque(cliente: ImplantacaoCliente) {
  const fantasia = String(cliente.nomeFantasia || '').trim()
  const razao = String(cliente.clienteNome || '').trim()
  return fantasia || razao || 'Cliente sem nome'
}

function getNomeSecundario(cliente: ImplantacaoCliente) {
  const fantasia = String(cliente.nomeFantasia || '').trim()
  const razao = String(cliente.clienteNome || '').trim()
  if (!fantasia) return ''
  if (!razao || fantasia.toLowerCase() === razao.toLowerCase()) return ''
  return razao
}

function StageBadge({ etapa }: { etapa: ImplantacaoEtapa | undefined }) {
  if (!etapa) return <span className="text-xs text-slate-500">Sem etapa</span>
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: etapa.cor }}
    >
      {etapa.nome}
    </span>
  )
}

function colorWithAlpha(color: string, alpha: number) {
  const safeAlpha = Math.max(0, Math.min(1, alpha))
  if (!color) return `rgba(59, 130, 246, ${safeAlpha})`
  if (color.startsWith('#')) {
    const hex = color.replace('#', '').trim()
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
    }
  }
  return color
}

export function Pipeline() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('lista')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)

  const [draggingClienteId, setDraggingClienteId] = useState<number | null>(null)
  const [draggingFromStatus, setDraggingFromStatus] = useState<number | null>(null)

  const [transitionOpen, setTransitionOpen] = useState(false)
  const [transitionTargetStatus, setTransitionTargetStatus] = useState<number | null>(null)
  const [transitionCliente, setTransitionCliente] = useState<ImplantacaoCliente | null>(null)
  const [transitionItems, setTransitionItems] = useState<TransitionItem[]>([])
  const [transitionObs, setTransitionObs] = useState('')
  const [loadingTransitionChecklist, setLoadingTransitionChecklist] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editCliente, setEditCliente] = useState<ImplantacaoCliente | null>(null)
  const [editEtapa, setEditEtapa] = useState<number>(1)
  const [editResponsavel, setEditResponsavel] = useState<string>('none')
  const [editChecklistIds, setEditChecklistIds] = useState<number[]>([])
  const [editChecklists, setEditChecklists] = useState<ImplantacaoChecklistOpcao[]>([])
  const [editResponsaveis, setEditResponsaveis] = useState<Array<{ id: number; nome: string }>>([])
  const [editEtapasDisponiveis, setEditEtapasDisponiveis] = useState<ImplantacaoEtapa[]>([])
  const [editObs, setEditObs] = useState('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState<any | null>(null)
  const [historyCliente, setHistoryCliente] = useState<ImplantacaoCliente | null>(null)

  const etapaMap = useMemo(() => {
    const map = new Map<number, ImplantacaoEtapa>()
    ;(painel?.etapas || []).forEach((e) => map.set(e.status, e))
    return map
  }, [painel?.etapas])

  const clientesPorEtapa = useMemo(() => {
    const map = new Map<number, ImplantacaoCliente[]>()
    ;(painel?.etapas || []).forEach((e) => map.set(e.status, []))
    ;(painel?.clientes || []).forEach((c) => {
      if (!map.has(c.statusInstal)) map.set(c.statusInstal, [])
      map.get(c.statusInstal)!.push(c)
    })
    return map
  }, [painel?.etapas, painel?.clientes])

  async function carregarPainel() {
    setLoading(true)
    try {
      const data = await api.getImplantacaoPainel({
        search: search.trim() || undefined,
        status: status !== 'all' ? status : undefined,
      })
      setPainel(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void carregarPainel()
    }, 250)
    return () => window.clearTimeout(id)
  }, [search, status])

  async function aplicarFiltros() {
    await carregarPainel()
  }

  async function abrirEdicaoCliente(cliente: ImplantacaoCliente) {
    setEditOpen(true)
    setEditLoading(true)
    setEditCliente(cliente)
    setEditObs('')
    try {
      const data = await api.getImplantacaoConfiguracao(cliente.clienteId)
      setEditEtapasDisponiveis(data.etapas)
      setEditResponsaveis(data.responsaveis || [])
      setEditChecklists(data.checklists || [])
      setEditEtapa(data.cliente.statusInstal)
      setEditResponsavel(data.cliente.responsavelId ? String(data.cliente.responsavelId) : 'none')
      setEditChecklistIds(data.checklistIdsSelecionados || [])
    } finally {
      setEditLoading(false)
    }
  }

  async function salvarEdicaoCliente() {
    if (!editCliente) return
    setEditSaving(true)
    try {
      await api.updateImplantacaoConfiguracao(editCliente.clienteId, {
        statusInstal: editEtapa,
        responsavelId: editResponsavel === 'none' ? null : Number(editResponsavel),
        checklistIds: editChecklistIds,
        observacao: editObs.trim() || undefined,
      })
      setEditOpen(false)
      await carregarPainel()
    } finally {
      setEditSaving(false)
    }
  }

  function alternarChecklistEdicao(checklistId: number, marcado: boolean) {
    setEditChecklistIds((prev) => {
      if (marcado) return prev.includes(checklistId) ? prev : [...prev, checklistId]
      return prev.filter((id) => id !== checklistId)
    })
  }

  async function abrirHistoricoCliente(cliente: ImplantacaoCliente) {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryCliente(cliente)
    try {
      const data = await api.getImplantacaoChecklist(cliente.clienteId)
      setHistoryData(data)
    } finally {
      setHistoryLoading(false)
    }
  }

  function onDragStart(cliente: ImplantacaoCliente) {
    setDraggingClienteId(cliente.clienteId)
    setDraggingFromStatus(cliente.statusInstal)
  }

  async function abrirModalTransicao(cliente: ImplantacaoCliente, fromStatus: number, targetStatus: number) {
    if (fromStatus === targetStatus) return
    setTransitionCliente(cliente)
    setTransitionTargetStatus(targetStatus)
    setTransitionObs('')
    setTransitionItems([])
    setTransitionOpen(true)
    setLoadingTransitionChecklist(true)
    try {
      const data = await api.getImplantacaoChecklist(cliente.clienteId, targetStatus)
      const items: TransitionItem[] = []
      data.checklists.forEach((checklist) => {
        checklist.itens.forEach((item) => {
          items.push({
            checklistId: checklist.id,
            itemIndex: item.index,
            texto: `${checklist.nome}: ${item.texto}`,
            marcado: item.marcado,
            observacao: '',
          })
        })
      })
      setTransitionItems(items)
    } finally {
      setLoadingTransitionChecklist(false)
    }
  }

  async function onDropToStage(targetStatus: number) {
    if (!draggingClienteId || !draggingFromStatus) return
    const cliente = (painel?.clientes || []).find((c) => c.clienteId === draggingClienteId)
    setDraggingClienteId(null)
    setDraggingFromStatus(null)
    if (!cliente) return
    await abrirModalTransicao(cliente, draggingFromStatus, targetStatus)
  }

  async function confirmarTransicao() {
    if (!transitionCliente || !transitionTargetStatus) return
    setUpdating(true)
    try {
      await api.transicaoImplantacao(transitionCliente.clienteId, {
        statusDestino: transitionTargetStatus,
        observacao: transitionObs.trim() || undefined,
        checklist: transitionItems.map((item) => ({
          checklistId: item.checklistId,
          itemIndex: item.itemIndex,
          marcado: item.marcado,
          observacao: item.observacao.trim() || undefined,
        })),
      })
      setTransitionOpen(false)
      await carregarPainel()
    } finally {
      setUpdating(false)
    }
  }

  const clientes = painel?.clientes || []
  const etapas = painel?.etapas || []
  const etapasKanban = useMemo(() => etapas.filter((etapa) => etapa.status !== 7), [etapas])
  const timelineOrdenada = useMemo(() => {
    if (!historyData?.timeline) return []
    return [...historyData.timeline].sort((a: any, b: any) => {
      const da = new Date(a.dataHora).getTime()
      const db = new Date(b.dataHora).getTime()
      return da - db
    })
  }, [historyData])
  const etapasHistorico = useMemo(() => {
    if (!historyData) return []
    const mapa = new Map<number, ImplantacaoEtapa>()
    ;(historyData.etapas || []).forEach((e: ImplantacaoEtapa) => mapa.set(e.status, e))
    const eventosStatus = timelineOrdenada.filter((item: any) => item.tipo === 'status')
    const sequencia: number[] = []
    eventosStatus.forEach((evento: any) => {
      if (evento.statusOrigem && !sequencia.length) sequencia.push(Number(evento.statusOrigem))
      if (evento.statusDestino) sequencia.push(Number(evento.statusDestino))
    })
    if (!sequencia.length && historyData.cliente?.statusInstal) {
      sequencia.push(Number(historyData.cliente.statusInstal))
    }
    const normalizada = sequencia.filter((status, index) => index === 0 || status !== sequencia[index - 1])
    return normalizada.map((status) => mapa.get(status) || { status, nome: `Etapa ${status}`, cor: '#3b82f6', descricao: '' })
  }, [historyData, timelineOrdenada])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Pipeline de Implantação</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Visualização em lista ou kanban. Arraste clientes entre etapas para avançar o processo.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCcw className="w-4 h-4" />}
          onClick={aplicarFiltros}
          loading={loading || updating}
          className="w-full sm:w-auto justify-center"
        >
          Atualizar
        </Button>
      </div>

      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-11 gap-2 items-center">
          <div className="md:col-span-4">
            <Input
              icon={<Search className="w-3.5 h-3.5" />}
              placeholder="Buscar por nome, fantasia ou CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 sm:h-8 text-[11px] sm:text-xs"
            />
          </div>
          <div className="md:col-span-4">
            <div className="flex items-center gap-1.5">
              <div className="px-2 h-7 sm:h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center">
                <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-7 sm:h-8 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] sm:text-xs px-2.5"
              >
                <option value="all">Todas as etapas</option>
                {etapas.map((etapa) => (<option key={etapa.status} value={String(etapa.status)}>{etapa.status}. {etapa.nome}</option>))}
              </select>
            </div>
          </div>
          <div className="md:col-span-3 flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden h-7 sm:h-8">
            <button className={clsx('flex-1 text-[11px] sm:text-xs flex items-center justify-center gap-1.5', viewMode === 'lista' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300')} onClick={() => setViewMode('lista')}>
              <LayoutList className="w-3.5 h-3.5" /> Lista
            </button>
            <button className={clsx('flex-1 text-[11px] sm:text-xs flex items-center justify-center gap-1.5', viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300')} onClick={() => setViewMode('kanban')}>
              <KanbanSquare className="w-3.5 h-3.5" /> Kanban
            </button>
          </div>
        </div>
      </Card>

      {viewMode === 'lista' ? (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Clientes ({clientes.length})</h2>
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : null}
          </div>
          <div className="md:hidden p-2.5 space-y-2">
            {clientes.map((cliente) => (
              <div key={cliente.clienteId} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(cliente)}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{getNomeSecundario(cliente) || 'Sem razão social'} • {cliente.cnpj || 'Sem CNPJ'}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5">Cidade/UF: {formatCidadeUf(cliente.cidade, cliente.uf)}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">Responsável: {cliente.responsavelNome || 'Não definido'}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">Status Pgto: {cliente.statusPrimeiroPgto || '—'}</p>
                <div className="mt-2"><StageBadge etapa={etapaMap.get(cliente.statusInstal)} /></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" icon={<History className="w-3.5 h-3.5" />} onClick={() => void abrirHistoricoCliente(cliente)}>
                    Histórico
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => void abrirEdicaoCliente(cliente)}>
                    Editar
                  </Button>
                </div>
              </div>
            ))}
            {!loading && clientes.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">Nenhum cliente encontrado.</div>
            ) : null}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Status Pgto</th>
                  <th className="px-4 py-3">Data 1º Pgto</th>
                  <th className="px-4 py-3">Cidade/UF</th>
                  <th className="px-4 py-3">Data Cadastro</th>
                  <th className="px-4 py-3">Tempo Últ Venda</th>
                  <th className="px-4 py-3">Tempo Cadastrado</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Etapa</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => (
                  <tr key={cliente.clienteId} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(cliente)}</p>
                      <p className="text-xs text-slate-500">
                        {getNomeSecundario(cliente) || 'Sem razão social'} • {cliente.cnpj || 'Sem CNPJ'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold',
                        String(cliente.statusPrimeiroPgto || '').toUpperCase() === 'PAGOU'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      )}>
                        {cliente.statusPrimeiroPgto || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(cliente.dataPrimeiroPgto)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCidadeUf(cliente.cidade, cliente.uf)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(cliente.dataCadastro)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTempoDesde(cliente.dataUltimaVenda)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTempoDesde(cliente.dataCadastro)}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{cliente.responsavelNome || 'Não definido'}</td>
                    <td className="px-4 py-3"><StageBadge etapa={etapaMap.get(cliente.statusInstal)} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<History className="w-3.5 h-3.5" />}
                          onClick={() => void abrirHistoricoCliente(cliente)}
                        >
                          Histórico
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => void abrirEdicaoCliente(cliente)}
                        >
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && clientes.length === 0 ? (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>Nenhum cliente encontrado.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Kanban da Implantação</h2>
          </div>
          <div className="overflow-x-auto p-2 sm:p-4">
            <div className="flex gap-2 min-w-max">
              {etapasKanban.map((etapa) => (
                <div
                  key={etapa.status}
                  className="w-48 sm:w-56 rounded-lg border border-slate-200 dark:border-slate-700"
                  style={{ backgroundColor: colorWithAlpha(etapa.cor, 0.1) }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void onDropToStage(etapa.status)}
                >
                  <div className="p-2 sm:p-2.5 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight whitespace-normal break-words">
                        {etapa.status}. {etapa.nome}
                      </p>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: etapa.cor }} />
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-1">{(clientesPorEtapa.get(etapa.status) || []).length} clientes</p>
                  </div>
                  <div className="p-1.5 sm:p-2 space-y-2 min-h-[180px] sm:min-h-[220px]">
                    {(clientesPorEtapa.get(etapa.status) || []).map((cliente) => (
                      <div key={cliente.clienteId} draggable onDragStart={() => onDragStart(cliente)} className={clsx('rounded-lg border bg-white dark:bg-slate-800 p-1.5 sm:p-2 cursor-grab border-slate-200 dark:border-slate-700', draggingClienteId === cliente.clienteId && 'opacity-50')}>
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400 mt-0.5" />
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight whitespace-normal break-words">
                                {getNomeDestaque(cliente)}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil className="w-3.5 h-3.5" />}
                                className="h-6 px-2 text-[11px] leading-none"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void abrirEdicaoCliente(cliente)
                                }}
                                title="Editar implantação do cliente"
                              >
                                Editar
                              </Button>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-500 leading-tight whitespace-normal break-words mt-0.5">
                              {getNomeSecundario(cliente) || 'Sem razão social'}
                            </p>
                            <p className="text-[11px] sm:text-xs text-slate-500 mt-1">{cliente.progressoChecklist}% checklist • {cliente.responsavelNome || 'Sem responsável'}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <button
                                type="button"
                                className="text-[11px] text-blue-600 hover:text-blue-700"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void abrirHistoricoCliente(cliente)
                                }}
                              >
                                Ver histórico
                              </button>
                              <button
                                type="button"
                                className="text-[11px] text-blue-600 hover:text-blue-700"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/implantacao/acompanhamento?cliente=${cliente.clienteId}`)
                                }}
                              >
                                Abrir acompanhamento
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          Governança de Mudança
        </h3>
        <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
          No Kanban, o usuário arrasta o cliente entre etapas e confirma a transição após revisar checklist.
          O sistema grava automaticamente no log: usuário, data/hora, etapa origem e etapa destino.
        </p>
      </Card>

      <Modal isOpen={transitionOpen} onClose={() => !updating && setTransitionOpen(false)} title="Confirmar Transição de Etapa" size="lg">
        {!transitionCliente || !transitionTargetStatus ? (
          <p className="text-sm text-slate-500">Selecione uma transição.</p>
        ) : loadingTransitionChecklist ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(transitionCliente)}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                {draggingFromStatus || transitionCliente.statusInstal} <MoveRight className="w-3.5 h-3.5" /> {transitionTargetStatus}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Checklist da Etapa Destino</label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {transitionItems.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum item de checklist para essa etapa.</p>
                ) : (
                  transitionItems.map((item, idx) => (
                    <div key={`${item.checklistId}-${item.itemIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.marcado}
                          onChange={(e) => setTransitionItems((prev) => prev.map((p, i) => i === idx ? { ...p, marcado: e.target.checked } : p))}
                          className="mt-1 accent-blue-600"
                        />
                        <span className={clsx('text-slate-700 dark:text-slate-200', item.marcado && 'line-through text-slate-500')}>{item.texto}</span>
                      </label>
                      <input
                        value={item.observacao}
                        onChange={(e) => setTransitionItems((prev) => prev.map((p, i) => i === idx ? { ...p, observacao: e.target.value } : p))}
                        placeholder="Observação opcional para este item"
                        className="mt-2 w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Observação Geral</label>
              <textarea
                value={transitionObs}
                onChange={(e) => setTransitionObs(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTransitionOpen(false)} disabled={updating}>Cancelar</Button>
              <Button onClick={() => void confirmarTransicao()} loading={updating}>Confirmar Mudança de Etapa</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={editOpen} onClose={() => !editSaving && setEditOpen(false)} title="Editar Implantação do Cliente" size="lg">
        {!editCliente || editLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(editCliente)}</p>
              <p className="text-xs text-slate-500 mt-1">{getNomeSecundario(editCliente) || 'Sem razão social'} • {editCliente.cnpj || 'Sem CNPJ'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Etapa da Implantação</label>
                <select
                  value={String(editEtapa)}
                  onChange={(e) => setEditEtapa(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  {editEtapasDisponiveis.map((etapa) => (
                    <option key={etapa.status} value={String(etapa.status)}>
                      {etapa.status}. {etapa.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Responsável</label>
                <select
                  value={editResponsavel}
                  onChange={(e) => setEditResponsavel(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="none">Sem responsável</option>
                  {editResponsaveis.map((responsavel) => (
                    <option key={responsavel.id} value={String(responsavel.id)}>{responsavel.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Checklist(s) do Cliente</label>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 max-h-64 overflow-y-auto space-y-2">
                {editChecklists.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum checklist de implantação cadastrado.</p>
                ) : (
                  editChecklists.map((checklist) => {
                    const marcado = editChecklistIds.includes(checklist.id)
                    return (
                      <label key={checklist.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) => alternarChecklistEdicao(checklist.id, e.target.checked)}
                          className="mt-1 accent-blue-600"
                        />
                        <span className="text-slate-700 dark:text-slate-200">
                          <span className="font-medium">{checklist.nome}</span>
                          <span className="block text-xs text-slate-500">
                            {checklist.itensQuantidade} itens • Etapas: {checklist.etapas.length ? checklist.etapas.join(', ') : 'todas'}
                          </span>
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Se nenhum checklist for selecionado, o sistema usa automaticamente o checklist padrão da etapa.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Observação da Alteração</label>
              <textarea
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancelar</Button>
              <Button onClick={() => void salvarEdicaoCliente()} loading={editSaving}>Salvar Implantação</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Histórico da Implantação do Cliente" size="xl">
        {!historyCliente || historyLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(historyCliente)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {getNomeSecundario(historyCliente) || 'Sem razão social'} • {historyCliente.cnpj || 'Sem CNPJ'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pipeline (ordem cronológica)</p>
              <div className="flex flex-wrap items-center gap-2">
                {etapasHistorico.length === 0 ? (
                  <span className="text-sm text-slate-500">Sem movimentações registradas.</span>
                ) : (
                  etapasHistorico.map((etapa, index) => (
                    <div key={`${etapa.status}-${index}`} className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: etapa.cor }}
                      >
                        {etapa.status}. {etapa.nome}
                      </span>
                      {index < etapasHistorico.length - 1 ? <MoveRight className="w-3.5 h-3.5 text-slate-400" /> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Timeline completa (cronológica)</p>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
                {timelineOrdenada.length === 0 ? (
                  <p className="text-sm text-slate-500">Ainda não há eventos para este cliente.</p>
                ) : (
                  timelineOrdenada.map((evento: any) => {
                    const origem = historyData?.etapas?.find((e: ImplantacaoEtapa) => e.status === evento.statusOrigem)
                    const destino = historyData?.etapas?.find((e: ImplantacaoEtapa) => e.status === evento.statusDestino)
                    const tipoLabel =
                      evento.tipo === 'status'
                        ? 'Mudança de etapa'
                        : evento.tipo === 'checklist'
                          ? 'Checklist'
                          : evento.tipo === 'responsavel'
                            ? 'Responsável'
                            : 'Observação'
                    return (
                      <div key={evento.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{tipoLabel}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(evento.dataHora)}</p>
                        </div>
                        {evento.tipo === 'status' ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {origem ? `${origem.status}. ${origem.nome}` : `Etapa ${evento.statusOrigem ?? '—'}`}
                            {' '}→{' '}
                            {destino ? `${destino.status}. ${destino.nome}` : `Etapa ${evento.statusDestino ?? '—'}`}
                          </p>
                        ) : null}
                        {evento.tipo === 'checklist' ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            Checklist #{evento.checklistId ?? '—'} • Item {evento.itemIndice ?? '—'} • {evento.marcado ? 'Marcado' : 'Desmarcado'}
                          </p>
                        ) : null}
                        {evento.tipo === 'responsavel' ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            Responsável: {evento.responsavelNome || 'Não definido'}
                          </p>
                        ) : null}
                        {evento.observacao ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{evento.observacao}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500 mt-1">
                          Usuário: {evento.usuarioNome || 'Sistema'}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
