import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, Circle, ChevronRight, Loader2, MessageSquare, RefreshCcw, Search
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { ImplantacaoChecklistDetalhe, ImplantacaoCliente, ImplantacaoPainel } from '../../types'

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
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

type ObsItemMap = Record<string, string>

export function AcompImplantacao() {
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [detalhe, setDetalhe] = useState<ImplantacaoChecklistDetalhe | null>(null)

  const [filtroCliente, setFiltroCliente] = useState('')
  const [loadingPainel, setLoadingPainel] = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [obsNova, setObsNova] = useState('')
  const [obsItemMap, setObsItemMap] = useState<ObsItemMap>({})
  const [statusDestino, setStatusDestino] = useState<number>(0)

  const clienteIdSelecionado = Number(searchParams.get('cliente') || 0) || 0

  const clientesFiltrados = useMemo(() => {
    const term = filtroCliente.trim().toLowerCase()
    const base = painel?.clientes || []
    if (!term) return base
    return base.filter((cliente) => {
      const fields = [
        cliente.clienteNome,
        cliente.nomeFantasia,
        cliente.cnpj,
      ]
      return fields.some((f) => String(f || '').toLowerCase().includes(term))
    })
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

  const observacoesTimeline = useMemo(() => {
    return timelineOrdenada.filter((item) => String(item.observacao || '').trim().length > 0)
  }, [timelineOrdenada])

  async function carregarPainel() {
    setLoadingPainel(true)
    try {
      const data = await api.getImplantacaoPainel()
      setPainel(data)
      const clienteQuery = Number(searchParams.get('cliente') || 0)
      if (!clienteQuery && data.clientes.length > 0) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('cliente', String(data.clientes[0].clienteId))
          return next
        }, { replace: true })
      }
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
    if (!clienteIdSelecionado && painel?.clientes?.length) return
    void carregarDetalhe(clienteIdSelecionado)
  }, [clienteIdSelecionado, painel?.clientes?.length])

  function selecionarCliente(clienteId: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('cliente', String(clienteId))
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

  async function avancarParaProximaEtapa() {
    if (!detalhe?.cliente || !proximaEtapa) return
    setSalvando(true)
    try {
      await api.transicaoImplantacao(detalhe.cliente.clienteId, {
        statusDestino: proximaEtapa.status,
        observacao: `Avanço pelo acompanhamento para ${proximaEtapa.status}. ${proximaEtapa.nome}`,
      })
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
    if (!statusDestino || statusDestino === atual) {
      toast.info('Selecione uma etapa diferente da atual.')
      return
    }
    setSalvando(true)
    try {
      await api.transicaoImplantacao(detalhe.cliente.clienteId, {
        statusDestino,
        observacao: `Mudança manual no acompanhamento: ${atual} -> ${statusDestino}`,
      })
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Acompanhamento de Implantação</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Complemento operacional do pipeline para acompanhamento detalhado de cada cliente.
          </p>
        </div>
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

      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-4">
            <Input
              icon={<Search className="w-3.5 h-3.5" />}
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              placeholder="Buscar cliente por fantasia, razão social ou CNPJ"
              className="h-7 sm:h-8 text-[11px] sm:text-xs"
            />
          </div>
          <div className="md:col-span-8">
            <select
              value={clienteIdSelecionado ? String(clienteIdSelecionado) : ''}
              onChange={(e) => selecionarCliente(Number(e.target.value))}
              className="h-7 sm:h-8 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] sm:text-xs px-2.5"
            >
              {!clientesFiltrados.length ? <option value="">Nenhum cliente disponível</option> : null}
              {clientesFiltrados.map((cliente) => (
                <option key={cliente.clienteId} value={String(cliente.clienteId)}>
                  {getNomeDestaque(cliente)}{getNomeSecundario(cliente) ? ` • ${getNomeSecundario(cliente)}` : ''} • {cliente.cnpj || 'Sem CNPJ'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!clienteAtual || loadingDetalhe ? (
        <Card>
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
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
                    onClick={() => void avancarParaProximaEtapa()}
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
                  return (
                    <div key={etapa.status} className="flex items-start gap-3">
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
                  <Button onClick={() => void alterarEtapaManual()} loading={salvando} className="w-full justify-center">
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
                        return (
                          <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
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
                            <input
                              value={obsItemMap[key] || ''}
                              onChange={(e) => setObsItemMap((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder="Observação opcional para o item"
                              className="mt-2 h-8 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
                            />
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
    </div>
  )
}
