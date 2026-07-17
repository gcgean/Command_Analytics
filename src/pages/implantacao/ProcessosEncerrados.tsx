import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive, ArrowLeft, Search, RefreshCcw, Loader2, History, ShieldCheck,
  RotateCcw, CheckCircle2, XCircle, MoveRight,
} from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { DateInput } from '../../components/ui/DateInput'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { AuditoriaTimeline } from '../../components/ui/AuditoriaTimeline'
import { useToast } from '../../components/ui/Toast'
import { usePermissions } from '../../contexts/PermissionsContext'
import { api } from '../../services/api'
import type { ImplantacaoCliente, ImplantacaoEtapa } from '../../types'

const STATUS_CONCLUIDO = 7
const STATUS_DESISTENCIA = 10

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function getNomeCliente(p: ImplantacaoCliente) {
  return (p.nomeFantasia || p.clienteNome || `Cliente #${p.clienteId}`).trim()
}

function getServicoLabel(p: ImplantacaoCliente) {
  return String(p.processoTitulo || p.servicoNome || 'Implantação').trim()
}

export function ProcessosEncerrados() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { can } = usePermissions()
  const podeReabrir = can('implantacao-concluidos-reabrir')

  const [filtros, setFiltros] = useState({
    search: '',
    situacao: 'all',
    responsavelId: '',
    dataInicial: '',
    dataFinal: '',
  })
  const [buscaInput, setBuscaInput] = useState('')
  const [processos, setProcessos] = useState<ImplantacaoCliente[]>([])
  const [etapas, setEtapas] = useState<ImplantacaoEtapa[]>([])
  const [resumo, setResumo] = useState({ total: 0, concluidos: 0, desistencias: 0 })
  const [responsaveis, setResponsaveis] = useState<Array<{ id: number; nome: string }>>([])
  const [loading, setLoading] = useState(true)

  // Histórico (timeline de movimentações)
  const [historyProcesso, setHistoryProcesso] = useState<ImplantacaoCliente | null>(null)
  const [historyData, setHistoryData] = useState<any | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Auditoria
  const [auditProcesso, setAuditProcesso] = useState<ImplantacaoCliente | null>(null)

  // Reabertura
  const [reabrirProcesso, setReabrirProcesso] = useState<ImplantacaoCliente | null>(null)
  const [reabrirDestino, setReabrirDestino] = useState<number | ''>('')
  const [reabrirMotivo, setReabrirMotivo] = useState('')
  const [reabrindo, setReabrindo] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.getImplantacaoConcluidos({
        search: filtros.search || undefined,
        situacao: filtros.situacao,
        responsavelId: filtros.responsavelId ? Number(filtros.responsavelId) : undefined,
        dataInicial: filtros.dataInicial || undefined,
        dataFinal: filtros.dataFinal || undefined,
      })
      setProcessos(data.processos)
      setEtapas(data.etapas)
      setResumo(data.resumo)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os processos encerrados.')
      setProcessos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.getImplantacaoResponsaveis().then(setResponsaveis).catch(() => {})
  }, [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros])

  function aplicarBusca() {
    setFiltros((f) => ({ ...f, search: buscaInput.trim() }))
  }

  const etapasReabertura = useMemo(
    () => etapas.filter((e) => e.status !== STATUS_CONCLUIDO && e.status !== STATUS_DESISTENCIA),
    [etapas],
  )

  const etapaNome = (status?: number | null) => {
    if (status === null || status === undefined) return '—'
    const etapa = etapas.find((e) => e.status === status)
    return etapa ? `${etapa.ordem ?? etapa.status}. ${etapa.nome}` : `Etapa ${status}`
  }

  async function abrirHistorico(p: ImplantacaoCliente) {
    setHistoryProcesso(p)
    setHistoryData(null)
    setHistoryLoading(true)
    try {
      const data = await api.getImplantacaoChecklist(p.clienteId, undefined, p.processoId)
      setHistoryData(data)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar o histórico.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const timelineOrdenada = useMemo(() => {
    if (!historyData?.timeline) return []
    return [...historyData.timeline].sort((a: any, b: any) => {
      const da = new Date(a.dataHora).getTime()
      const db = new Date(b.dataHora).getTime()
      return db - da
    })
  }, [historyData])

  function abrirReabertura(p: ImplantacaoCliente) {
    setReabrirProcesso(p)
    setReabrirDestino('')
    setReabrirMotivo('')
  }

  async function confirmarReabertura() {
    if (!reabrirProcesso || !reabrirProcesso.processoId) return
    if (!reabrirDestino) {
      toast.error('Selecione a etapa de destino.')
      return
    }
    if (reabrirMotivo.trim().length < 5) {
      toast.error('Informe o motivo da reabertura (mínimo de 5 caracteres).')
      return
    }
    setReabrindo(true)
    try {
      await api.reabrirProcessoImplantacao(reabrirProcesso.clienteId, reabrirProcesso.processoId, {
        statusDestino: Number(reabrirDestino),
        motivo: reabrirMotivo.trim(),
      })
      toast.success('Processo reaberto com sucesso.')
      setReabrirProcesso(null)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível reabrir o processo.')
    } finally {
      setReabrindo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <button
          onClick={() => navigate('/implantacao')}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o Pipeline
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg">
            <Archive className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Processos Encerrados</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Consulta de implantações concluídas e desistências, com histórico completo, auditoria e reabertura.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total encerrados</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{resumo.total}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Concluídos
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{resumo.concluidos}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-rose-500" /> Desistências
          </p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{resumo.desistencias}</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Buscar</label>
            <div className="flex gap-2">
              <input
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && aplicarBusca()}
                placeholder="Cliente, fantasia, CNPJ ou serviço"
                className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
              />
              <Button icon={<Search className="w-4 h-4" />} onClick={aplicarBusca}>Buscar</Button>
            </div>
          </div>
          <Select
            label="Situação"
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'concluido', label: 'Concluído' },
              { value: 'desistencia', label: 'Desistência' },
            ]}
            value={filtros.situacao}
            onChange={(e) => setFiltros((f) => ({ ...f, situacao: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Responsável</label>
            <SearchableSelect
              value={filtros.responsavelId}
              onChange={(v) => setFiltros((f) => ({ ...f, responsavelId: v }))}
              options={[{ value: '', label: 'Todos' }, ...responsaveis.map((r) => ({ value: String(r.id), label: r.nome }))]}
              placeholder="Todos"
            />
          </div>
          <DateInput
            label="Encerrado de"
            mode="iso"
            value={filtros.dataInicial}
            onChange={(v) => setFiltros((f) => ({ ...f, dataInicial: v }))}
          />
          <DateInput
            label="Encerrado até"
            mode="iso"
            value={filtros.dataFinal}
            onChange={(v) => setFiltros((f) => ({ ...f, dataFinal: v }))}
          />
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="secondary" icon={<RefreshCcw className="w-4 h-4" />} onClick={carregar}>Atualizar</Button>
        </div>
      </Card>

      {/* Lista */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                {['Cliente', 'Serviço', 'Situação', 'Responsável', 'Encerrado em', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td>
                </tr>
              ) : processos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Nenhum processo encerrado encontrado para os filtros informados.
                  </td>
                </tr>
              ) : (
                processos.map((p) => {
                  const concluido = Number(p.statusInstal) === STATUS_CONCLUIDO
                  return (
                    <tr key={`${p.processoId}-${p.clienteId}`} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{getNomeCliente(p)}</p>
                        {p.cnpj ? <p className="text-xs text-slate-500">{p.cnpj}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{getServicoLabel(p)}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                          concluido
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                        )}>
                          {concluido ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {concluido ? 'Concluído' : 'Desistência'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.responsavelNome || 'Sem responsável'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(p.processoAtualizadoEm || p.processoCriadoEm)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => abrirHistorico(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <History className="w-3.5 h-3.5" /> Histórico
                          </button>
                          <button
                            onClick={() => setAuditProcesso(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Auditoria
                          </button>
                          {podeReabrir && (
                            <button
                              onClick={() => abrirReabertura(p)}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-500/40 px-2 py-1 text-xs text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Histórico */}
      <Modal isOpen={!!historyProcesso} onClose={() => setHistoryProcesso(null)} title="Histórico do Processo" size="lg">
        {!historyProcesso ? null : historyLoading ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeCliente(historyProcesso)}</p>
              <p className="text-xs text-slate-500 mt-1">{getServicoLabel(historyProcesso)} • {historyProcesso.cnpj || 'Sem CNPJ'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Timeline completa (mais recente primeiro)</p>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
                {timelineOrdenada.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum evento registrado para este processo.</p>
                ) : (
                  timelineOrdenada.map((evento: any) => {
                    const processoCriado = evento.tipo === 'status' && (evento.statusOrigem === null || evento.statusOrigem === undefined)
                    const tipoLabel =
                      evento.tipo === 'status'
                        ? (processoCriado ? 'Processo criado' : 'Mudança de etapa')
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
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 inline-flex items-center gap-1 flex-wrap">
                            {processoCriado
                              ? `Etapa inicial: ${etapaNome(evento.statusDestino)}`
                              : <>{etapaNome(evento.statusOrigem)} <MoveRight className="w-3.5 h-3.5" /> {etapaNome(evento.statusDestino)}</>}
                          </p>
                        ) : null}
                        {evento.tipo === 'responsavel' ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Responsável: {evento.responsavelNome || 'Não definido'}</p>
                        ) : null}
                        {evento.observacao ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{evento.observacao}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500 mt-1">Usuário: {evento.usuarioNome || 'Sistema'}</p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Auditoria */}
      {auditProcesso && auditProcesso.processoId ? (
        <AuditoriaTimeline
          tabela="implantacao_processos"
          registroId={auditProcesso.processoId}
          titulo={getNomeCliente(auditProcesso)}
          onClose={() => setAuditProcesso(null)}
        />
      ) : null}

      {/* Modal Reabertura */}
      <Modal isOpen={!!reabrirProcesso} onClose={() => !reabrindo && setReabrirProcesso(null)} title="Reabrir Processo Encerrado" size="md">
        {reabrirProcesso ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeCliente(reabrirProcesso)}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {getServicoLabel(reabrirProcesso)} • Situação atual: {Number(reabrirProcesso.statusInstal) === STATUS_CONCLUIDO ? 'Concluído' : 'Desistência'}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                Esta ação é auditada (usuário, data/hora e motivo ficam registrados).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Mover para a etapa</label>
              <Select
                options={[
                  { value: '', label: 'Selecione a etapa...' },
                  ...etapasReabertura.map((e) => ({ value: String(e.status), label: `${e.ordem ?? e.status}. ${e.nome}` })),
                ]}
                value={String(reabrirDestino)}
                onChange={(e) => setReabrirDestino(e.target.value ? Number(e.target.value) : '')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Motivo da reabertura</label>
              <textarea
                value={reabrirMotivo}
                onChange={(e) => setReabrirMotivo(e.target.value)}
                rows={3}
                placeholder="Descreva por que o processo está sendo reaberto"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReabrirProcesso(null)} disabled={reabrindo}>Cancelar</Button>
              <Button icon={<RotateCcw className="w-4 h-4" />} onClick={() => void confirmarReabertura()} loading={reabrindo}>
                Reabrir processo
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
