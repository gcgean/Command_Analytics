import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, Circle, ChevronRight, Loader2, MessageSquare, RefreshCcw, Search
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { ImplantacaoChecklistDetalhe, ImplantacaoCliente, ImplantacaoPainel } from '../../types'

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

function normalizarBusca(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getDiasDesde(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

type ObsItemMap = Record<string, string>
type ObsExpandidaMap = Record<string, boolean>
type EtapaTimelineInfo = {
  entrouEm?: string | null
  saiuEm?: string | null
  duracaoDias?: number | null
}

export function AcompImplantacao() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const buscaRef = useRef<HTMLInputElement | null>(null)

  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [detalhe, setDetalhe] = useState<ImplantacaoChecklistDetalhe | null>(null)

  const [filtroCliente, setFiltroCliente] = useState('')
  const [loadingPainel, setLoadingPainel] = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [obsNova, setObsNova] = useState('')
  const [obsItemMap, setObsItemMap] = useState<ObsItemMap>({})
  const [obsExpandidaMap, setObsExpandidaMap] = useState<ObsExpandidaMap>({})
  const [statusDestino, setStatusDestino] = useState<number>(0)
  const [motivoAlteracao, setMotivoAlteracao] = useState('')
  const [autocompleteAberto, setAutocompleteAberto] = useState(false)
  const [confirmarAvancoAberto, setConfirmarAvancoAberto] = useState(false)

  const clienteIdSelecionado = Number(searchParams.get('cliente') || 0) || 0

  const clientesFiltrados = useMemo(() => {
    const term = normalizarBusca(filtroCliente)
    const base = painel?.clientes || []
    if (term.length < 2) return []
    return base.filter((cliente) => {
      const fields = [
        cliente.clienteNome,
        cliente.nomeFantasia,
        cliente.cnpj,
      ]
      return fields.some((f) => normalizarBusca(f).includes(term))
    }).slice(0, 12)
  }, [filtroCliente, painel?.clientes])

  const clienteAtual = useMemo(() => {
    if (!painel) return null
    return painel.clientes.find((c) => c.clienteId === clienteIdSelecionado) || null
  }, [painel, clienteIdSelecionado])

  const etapasOrdenadas = useMemo(() => {
    return [...(detalhe?.etapas || [])].sort((a, b) => a.status - b.status)
  }, [detalhe?.etapas])

  const etapaAtualIndex = useMemo(() => {
    if (!detalhe?.cliente) return -1
    return etapasOrdenadas.findIndex((etapa) => etapa.status === detalhe.cliente.statusInstal)
  }, [detalhe?.cliente, etapasOrdenadas])

  const proximaEtapa = useMemo(() => {
    if (!detalhe?.cliente) return null
    return etapasOrdenadas.find((etapa) => etapa.status > detalhe.cliente.statusInstal) || null
  }, [detalhe?.cliente, etapasOrdenadas])

  const timelineOrdenada = useMemo(() => {
    return [...(detalhe?.timeline || [])].sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
  }, [detalhe?.timeline])

  const timelineStatusAsc = useMemo(() => {
    return [...(detalhe?.timeline || [])]
      .filter((item) => item.tipo === 'status')
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
  }, [detalhe?.timeline])

  const observacoesTimeline = useMemo(() => {
    return timelineOrdenada.filter((item) => String(item.observacao || '').trim().length > 0)
  }, [timelineOrdenada])

  const etapasTimelineInfo = useMemo(() => {
    const map = new Map<number, EtapaTimelineInfo>()

    timelineStatusAsc.forEach((evento, index) => {
      const dataEvento = evento.dataHora
      const origem = Number(evento.statusOrigem || 0)
      const destino = Number(evento.statusDestino || 0)

      if (index === 0 && origem > 0 && !map.has(origem)) {
        map.set(origem, {})
      }

      if (origem > 0) {
        const atual = map.get(origem) || {}
        const entrouEm = atual.entrouEm || undefined
        const saiuEm = dataEvento
        const duracaoDias = entrouEm ? Math.max(0, Math.floor((new Date(saiuEm).getTime() - new Date(entrouEm).getTime()) / 86400000)) : null
        map.set(origem, { ...atual, saiuEm, duracaoDias })
      }

      if (destino > 0) {
        const atual = map.get(destino) || {}
        if (!atual.entrouEm) {
          map.set(destino, { ...atual, entrouEm: dataEvento })
        }
      }
    })

    if (detalhe?.cliente?.statusInstal) {
      const statusAtual = Number(detalhe.cliente.statusInstal)
      const atual = map.get(statusAtual) || {}
      if (detalhe.cliente.dataInicioStatusAtual) {
        map.set(statusAtual, { ...atual, entrouEm: detalhe.cliente.dataInicioStatusAtual })
      }
    }

    return map
  }, [timelineStatusAsc, detalhe?.cliente])

  const observacoesChecklistSalvas = useMemo(() => {
    const map: ObsItemMap = {}
    timelineOrdenada
      .filter((item) => item.tipo === 'checklist' && item.checklistId != null && item.itemIndice != null && String(item.observacao || '').trim())
      .forEach((item) => {
        const key = `${item.checklistId}:${item.itemIndice}`
        if (!map[key]) {
          map[key] = String(item.observacao || '').trim()
        }
      })
    return map
  }, [timelineOrdenada])

  const itensPendentesChecklist = useMemo(() => {
    return detalhe?.checklists.reduce((acc, checklist) => {
      return acc + checklist.itens.filter((item) => !item.marcado).length
    }, 0) || 0
  }, [detalhe?.checklists])

  useEffect(() => {
    setObsItemMap(observacoesChecklistSalvas)
    const expandidas: ObsExpandidaMap = {}
    Object.entries(observacoesChecklistSalvas).forEach(([key, value]) => {
      if (String(value).trim()) expandidas[key] = true
    })
    setObsExpandidaMap(expandidas)
  }, [observacoesChecklistSalvas, detalhe?.cliente?.clienteId])

  async function carregarPainel() {
    setLoadingPainel(true)
    try {
      const data = await api.getImplantacaoPainel()
      setPainel(data)
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao carregar painel de implantação.')
    } finally {
      setLoadingPainel(false)
    }
  }

  async function carregarDetalhe(clienteId: number) {
    if (!clienteId) {
      setDetalhe(null)
      setLoadingDetalhe(false)
      return
    }
    setLoadingDetalhe(true)
    try {
      const data = await api.getImplantacaoChecklist(clienteId)
      setDetalhe(data)
      setStatusDestino(Number(data?.cliente?.statusInstal || 0))
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao carregar acompanhamento do cliente.')
    } finally {
      setLoadingDetalhe(false)
    }
  }

  useEffect(() => {
    void carregarPainel()
  }, [])

  useEffect(() => {
    void carregarDetalhe(clienteIdSelecionado)
  }, [clienteIdSelecionado])

  useEffect(() => {
    if (clienteAtual) {
      setFiltroCliente(getNomeDestaque(clienteAtual))
    }
  }, [clienteAtual?.clienteId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return
      const key = event.key.toLowerCase()

      if (key === 'k') {
        event.preventDefault()
        buscaRef.current?.focus()
        setAutocompleteAberto(true)
      }

      if (key === 'p') {
        event.preventDefault()
        navigate('/implantacao')
      }

      if (key === 'd') {
        event.preventDefault()
        navigate('/implantacao/dashboard')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  function selecionarCliente(cliente: ImplantacaoCliente) {
    setFiltroCliente(getNomeDestaque(cliente))
    setAutocompleteAberto(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('cliente', String(cliente.clienteId))
      return next
    })
  }

  async function salvarChecklist(checklistId: number, itemIndex: number, marcado: boolean) {
    if (!detalhe?.cliente) return
    const key = `${checklistId}:${itemIndex}`
    setSalvando(true)
    try {
      await api.marcarItemChecklistImplantacao(detalhe.cliente.clienteId, {
        checklistId,
        itemIndex,
        marcado,
        observacao: String(obsItemMap[key] || '').trim() || undefined,
      })
      await carregarDetalhe(detalhe.cliente.clienteId)
      await carregarPainel()
      toast.success('Checklist atualizado.')
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar o checklist.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarAvancoEtapa() {
    if (!detalhe?.cliente || !proximaEtapa) return
    setSalvando(true)
    try {
      await api.transicaoImplantacao(detalhe.cliente.clienteId, {
        statusDestino: proximaEtapa.status,
        observacao: `Avanço pelo acompanhamento para ${proximaEtapa.status}. ${proximaEtapa.nome}`,
      })
      setConfirmarAvancoAberto(false)
      await carregarDetalhe(detalhe.cliente.clienteId)
      await carregarPainel()
      toast.success(`Cliente movido para ${proximaEtapa.nome}.`)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível avançar a etapa.')
    } finally {
      setSalvando(false)
    }
  }

  async function alterarEtapaManual() {
    if (!detalhe?.cliente) return
    const atual = Number(detalhe.cliente.statusInstal || 0)
    const motivo = motivoAlteracao.trim()
    if (!statusDestino || statusDestino === atual) {
      toast.info('Selecione uma etapa diferente da atual.')
      return
    }
    if (motivo.length < 20) {
      toast.info('Informe um motivo com pelo menos 20 caracteres.')
      return
    }
    setSalvando(true)
    try {
      await api.transicaoImplantacao(detalhe.cliente.clienteId, {
        statusDestino,
        observacao: `Mudança manual no acompanhamento: ${atual} -> ${statusDestino}. Motivo: ${motivo}`,
      })
      setMotivoAlteracao('')
      await carregarDetalhe(detalhe.cliente.clienteId)
      await carregarPainel()
      toast.success('Etapa alterada com sucesso.')
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível alterar a etapa.')
    } finally {
      setSalvando(false)
    }
  }

  async function adicionarObservacao() {
    if (!detalhe?.cliente) return
    const texto = obsNova.trim()
    if (!texto) return
    setSalvando(true)
    try {
      await api.addImplantacaoObservacao(detalhe.cliente.clienteId, texto)
      setObsNova('')
      await carregarDetalhe(detalhe.cliente.clienteId)
      toast.success('Observação adicionada.')
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar a observação.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Implantação &gt; Acompanhamento</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Acompanhamento de Implantação</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Complemento operacional do pipeline para acompanhamento detalhado de cada cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Atalhos: Ctrl+K busca de cliente | Ctrl+P Pipeline | Ctrl+D Dashboard"
            className="h-8 w-8 rounded-full border border-slate-300 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            ?
          </button>
          <Button
            variant="secondary"
            icon={<RefreshCcw className="w-4 h-4" />}
            onClick={() => {
              void carregarPainel()
              if (clienteIdSelecionado) void carregarDetalhe(clienteIdSelecionado)
            }}
            loading={loadingPainel || loadingDetalhe}
            className="w-full sm:w-auto justify-center"
          >
            Atualizar
          </Button>
        </div>
      </div>

      <Card padding="sm">
        <div className="relative">
          <Input
            ref={buscaRef}
            icon={<Search className="w-3.5 h-3.5" />}
            value={filtroCliente}
            onFocus={() => setAutocompleteAberto(true)}
            onChange={(e) => {
              setFiltroCliente(e.target.value)
              setAutocompleteAberto(true)
            }}
            placeholder="Buscar cliente por fantasia, razão social ou CNPJ"
            className="h-7 sm:h-8 text-[11px] sm:text-xs"
          />
          {autocompleteAberto && filtroCliente.trim().length >= 2 && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {clientesFiltrados.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">Nenhum cliente encontrado.</div>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <button
                    key={cliente.clienteId}
                    type="button"
                    className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionarCliente(cliente)}
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(cliente)}</span>
                    <span className="text-xs text-slate-500">
                      {getNomeSecundario(cliente) || 'Sem razão social'} — {cliente.cnpj || 'Sem CNPJ'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Card>

      {loadingDetalhe ? (
        <Card>
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        </Card>
      ) : !clienteIdSelecionado ? (
        <Card>
          <p className="text-sm text-slate-500">Busque e selecione um cliente para abrir o acompanhamento.</p>
        </Card>
      ) : !clienteAtual ? (
        <Card>
          <p className="text-sm text-slate-500">Cliente selecionado não encontrado na consulta atual.</p>
        </Card>
      ) : !detalhe ? (
        <Card>
          <p className="text-sm text-slate-500">Selecione um cliente para acompanhar.</p>
        </Card>
      ) : (
        <>
          <Card padding="sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              <div className="lg:col-span-2">
                <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">{getNomeDestaque(clienteAtual)}</p>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {getNomeSecundario(clienteAtual) || 'Sem razão social'} • {clienteAtual.cnpj || 'Sem CNPJ'}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                  Responsável: {detalhe.cliente.responsavelNome || 'Não definido'} • Etapa atual: {detalhe.etapaAtual.status}. {detalhe.etapaAtual.nome}
                </p>
              </div>
              <div className="flex items-center justify-start lg:justify-end gap-2 flex-wrap">
                {proximaEtapa ? (
                  <Button
                    size="sm"
                    icon={<ChevronRight className="w-3.5 h-3.5" />}
                    onClick={() => setConfirmarAvancoAberto(true)}
                    loading={salvando}
                  >
                    Avançar etapa
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Timeline das Etapas</h3>
              <div className="space-y-1">
                {etapasOrdenadas.map((etapa, index) => {
                  const concluida = etapaAtualIndex >= 0 && index < etapaAtualIndex
                  const atual = etapaAtualIndex === index
                  const futura = etapaAtualIndex >= 0 && index > etapaAtualIndex
                  const etapaInfo = etapasTimelineInfo.get(etapa.status)
                  const diasNaEtapaAtual = atual ? (detalhe.cliente.diasNaEtapa ?? getDiasDesde(detalhe.cliente.dataInicioStatusAtual) ?? 0) : 0
                  const tooltip = concluida
                    ? `Entrou em: ${formatDateTime(etapaInfo?.entrouEm)} | Saiu em: ${formatDateTime(etapaInfo?.saiuEm)} | ${etapaInfo?.duracaoDias ?? '—'} dias`
                    : undefined

                  return (
                    <div key={etapa.status} className="flex items-start gap-3" title={tooltip}>
                      <div className="flex flex-col items-center">
                        <div className={clsx(
                          'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0',
                          concluida && 'bg-emerald-100 text-emerald-600',
                          atual && 'bg-blue-600 text-white ring-4 ring-blue-500/20',
                          futura && 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-400'
                        )}>
                          {concluida ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </div>
                        {index < etapasOrdenadas.length - 1 ? (
                          <div className={clsx('w-0.5 h-5 sm:h-6 mt-1', concluida ? 'bg-emerald-300' : 'bg-slate-200 dark:bg-slate-700')} />
                        ) : null}
                      </div>
                      <div className="pb-1 pt-1">
                        <p className={clsx(
                          'text-xs sm:text-sm font-medium',
                          atual ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'
                        )}>
                          {etapa.status}. {etapa.nome}
                          {atual ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Etapa atual</span> : null}
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{etapa.descricao}</p>
                        {atual ? (
                          <p className={clsx(
                            'text-[11px] sm:text-xs mt-1 font-medium',
                            diasNaEtapaAtual > 5 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500'
                          )}>
                            há {diasNaEtapaAtual} dia{diasNaEtapaAtual === 1 ? '' : 's'} nesta etapa
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Alterar Etapa Manualmente</h3>
                <div className="space-y-2">
                  <select
                    value={String(statusDestino)}
                    onChange={(e) => setStatusDestino(Number(e.target.value))}
                    className="h-8 sm:h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm px-2.5"
                  >
                    {etapasOrdenadas.map((etapa) => (
                      <option key={etapa.status} value={String(etapa.status)}>
                        {etapa.status}. {etapa.nome}
                      </option>
                    ))}
                  </select>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Motivo da alteração (obrigatório)</label>
                    <textarea
                      value={motivoAlteracao}
                      onChange={(e) => setMotivoAlteracao(e.target.value)}
                      rows={4}
                      placeholder="Ex: Cliente solicitou retroceder etapa por problema técnico..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm px-3 py-2 resize-none"
                    />
                  </div>
                  <Button
                    onClick={() => void alterarEtapaManual()}
                    loading={salvando}
                    disabled={motivoAlteracao.trim().length < 20}
                    className="w-full justify-center"
                  >
                    Salvar Etapa
                  </Button>
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Observações Recentes</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {observacoesTimeline.length === 0 ? (
                    <p className="text-[11px] sm:text-xs text-slate-500">Nenhuma observação registrada.</p>
                  ) : (
                    observacoesTimeline.slice(0, 12).map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300">{item.observacao}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {formatDateTime(item.dataHora)} • {item.usuarioNome || 'Sistema'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  Nova Observação
                </h3>
                <textarea
                  value={obsNova}
                  onChange={(e) => setObsNova(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm px-3 py-2 resize-none"
                  placeholder="Digite uma observação..."
                />
                <Button
                  onClick={() => void adicionarObservacao()}
                  loading={salvando}
                  disabled={!obsNova.trim()}
                  className="w-full justify-center mt-2"
                >
                  Adicionar Observação
                </Button>
              </Card>
            </div>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Checklist da Etapa</h3>
              <span className="text-xs text-slate-500">
                {detalhe.resumo.itensMarcados}/{detalhe.resumo.totalItens} itens • {detalhe.resumo.progresso}%
              </span>
            </div>
            <div className="space-y-3">
              {detalhe.checklists.length === 0 ? (
                <p className="text-xs sm:text-sm text-slate-500">Nenhum checklist aplicável para esta etapa.</p>
              ) : (
                detalhe.checklists.map((checklist) => (
                  <div key={checklist.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3">
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">{checklist.nome}</p>
                    {checklist.descricao ? <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{checklist.descricao}</p> : null}
                    <div className="mt-2 space-y-2">
                      {checklist.itens.map((item) => {
                        const key = `${checklist.id}:${item.index}`
                        const observacaoExpandida = obsExpandidaMap[key] || Boolean(String(obsItemMap[key] || '').trim())
                        return (
                          <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <label className="flex items-start gap-2 text-xs sm:text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.marcado}
                                  onChange={(e) => void salvarChecklist(checklist.id, item.index, e.target.checked)}
                                  className="mt-0.5 accent-blue-600"
                                  disabled={salvando}
                                />
                                <span className={clsx('text-slate-700 dark:text-slate-300', item.marcado && 'line-through text-slate-500')}>
                                  {item.texto}
                                </span>
                              </label>
                              {!observacaoExpandida ? (
                                <button
                                  type="button"
                                  className="shrink-0 text-[11px] text-blue-600 hover:text-blue-700"
                                  onClick={() => setObsExpandidaMap((prev) => ({ ...prev, [key]: true }))}
                                >
                                  + adicionar nota
                                </button>
                              ) : null}
                            </div>
                            <div className={clsx(
                              'overflow-hidden transition-all duration-200',
                              observacaoExpandida ? 'mt-2 max-h-20 opacity-100' : 'max-h-0 opacity-0'
                            )}>
                              <input
                                value={obsItemMap[key] || ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setObsItemMap((prev) => ({ ...prev, [key]: value }))
                                  if (value.trim()) {
                                    setObsExpandidaMap((prev) => ({ ...prev, [key]: true }))
                                  }
                                }}
                                placeholder="Observação opcional para o item"
                                className="h-8 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      <Modal
        isOpen={confirmarAvancoAberto}
        onClose={() => !salvando && setConfirmarAvancoAberto(false)}
        title="Confirmar avanço de etapa"
        size="md"
      >
        {!detalhe?.cliente || !proximaEtapa ? (
          <p className="text-sm text-slate-500">Nenhuma próxima etapa disponível.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Deseja mover <strong>{getNomeDestaque(detalhe.cliente)}</strong> de <strong>{detalhe.etapaAtual.nome}</strong> para <strong>{proximaEtapa.nome}</strong>?
            </p>
            {itensPendentesChecklist > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠ {itensPendentesChecklist} itens do checklist ainda não foram marcados
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmarAvancoAberto(false)} disabled={salvando}>Cancelar</Button>
              <Button onClick={() => void confirmarAvancoEtapa()} loading={salvando}>Confirmar avanço</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
