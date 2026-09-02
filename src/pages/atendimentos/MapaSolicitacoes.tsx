import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  RefreshCw, Loader2, Star, Search, MoreVertical, AlertTriangle,
  Code2, FlaskConical, CheckCircle2, XCircle, History, UserPlus, Lightbulb, Pencil, Plus, FileText, Copy,
} from 'lucide-react'
import { api, statusAtendimentoLabel } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../components/ui/Toast'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { LancamentoSolicitacao } from './LancamentoSolicitacao'
import type { Solicitacao, StatusAtendimento, Usuario } from '../../types'

type Aba = 'suporte' | 'testes' | 'finalizadas'

// Mesmos códigos do Delphi (UMapaAtendimentos.pas). Não existe status 15.
const S = {
  EM_ATENDIMENTO: 2,
  AGUARDANDO_ANALISE_DEV: 4,
  EM_DESENVOLVIMENTO: 13,
  AGUARDANDO_TESTES: 9,
  EM_TESTES: 10,
  TESTADO_OK: 11,
  CORRIGIDO_DEV: 16,
  TESTADO_COM_ERRO: 17,
} as const

// Cor da faixa do rodapé do card, seguindo a leitura do mapa legado.
const CORES_RODAPE: Record<number, string> = {
  1: 'bg-slate-500 text-white',
  2: 'bg-teal-700 text-white',
  3: 'bg-amber-600 text-white',
  4: 'bg-orange-700 text-white',
  5: 'bg-indigo-900 text-white',
  6: 'bg-slate-400 text-slate-900',
  9: 'bg-sky-200 text-slate-900',
  10: 'bg-blue-600 text-white',
  11: 'bg-fuchsia-900 text-white',
  13: 'bg-amber-900 text-white',
  16: 'bg-violet-700 text-white',
  17: 'bg-rose-700 text-white',
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarDataHora(valor: string | null): string {
  if (!valor) return '—'
  const d = new Date(valor)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function MapaSolicitacoes() {
  const { can } = usePermissions()
  const podeAgir = can('solicitacoes-acoes')
  const { toast } = useToast()

  const [aba, setAba] = useState<Aba>('suporte')
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState<number | ''>('')
  const [selecionado, setSelecionado] = useState<Solicitacao | null>(null)
  const [menuAberto, setMenuAberto] = useState<number | null>(null)

  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(hojeISO())

  const [devs, setDevs] = useState<Usuario[]>([])
  const [modalLog, setModalLog] = useState<Solicitacao | null>(null)
  const [logLinhas, setLogLinhas] = useState<Array<{ obs: string; data: string; usuario: string | null }>>([])
  const [modalDev, setModalDev] = useState<Solicitacao | null>(null)
  const [modalJustificativa, setModalJustificativa] = useState<{ item: Solicitacao; status: number; titulo: string } | null>(null)
  const [modalCancelar, setModalCancelar] = useState<Solicitacao | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [lancamento, setLancamento] = useState<{ aberto: boolean; item: Solicitacao | null }>({ aberto: false, item: null })
  const [modalNotas, setModalNotas] = useState(false)
  const [notasTexto, setNotasTexto] = useState('')
  const [carregandoNotas, setCarregandoNotas] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    const req =
      aba === 'suporte'
        ? api.getSolicitacoesSuporte({
            ...(busca.trim() ? { busca: busca.trim() } : {}),
            ...(filtroEtapa ? { status: filtroEtapa } : {}),
          })
        : aba === 'testes'
          ? api.getSolicitacoesTestes()
          : api.getSolicitacoesFinalizadas(dataInicio, dataFim)

    req
      .then((res) => {
        setItens(res.data)
        setLoading(false)
      })
      .catch((e: any) => {
        toast.error(e?.message || 'Falha ao carregar as solicitações.')
        setLoading(false)
      })
  }, [aba, busca, filtroEtapa, dataInicio, dataFim, toast])

  useEffect(() => {
    // Busca é digitada — espera o usuário parar antes de bater no servidor.
    const timer = setTimeout(carregar, busca ? 400 : 0)
    return () => clearTimeout(timer)
  }, [carregar, busca])

  useEffect(() => {
    api.getUsuarios().then((u) => setDevs(Array.isArray(u) ? u : [])).catch(() => setDevs([]))
  }, [])

  // Fecha o menu de contexto ao clicar em qualquer lugar fora dele.
  const gridRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (menuAberto === null) return
    const fechar = () => setMenuAberto(null)
    document.addEventListener('click', fechar)
    return () => document.removeEventListener('click', fechar)
  }, [menuAberto])

  const executar = async (fn: () => Promise<any>, sucesso: string) => {
    setSalvando(true)
    try {
      await fn()
      toast.success(sucesso)
      carregar()
      return true
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível concluir a ação.')
      return false
    } finally {
      setSalvando(false)
    }
  }

  const mudarStatus = (item: Solicitacao, status: number, rotulo: string) =>
    executar(() => api.alterarStatusSolicitacao(item.id, status), `${rotulo} — #${item.id}`)

  const abrirNotasAtualizacao = async () => {
    setModalNotas(true)
    setCarregandoNotas(true)
    try {
      const res = await api.getNotasAtualizacao(dataInicio, dataFim)
      setNotasTexto(res.texto)
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar as notas.')
      setNotasTexto('')
    } finally {
      setCarregandoNotas(false)
    }
  }

  const abrirLog = async (item: Solicitacao) => {
    setModalLog(item)
    setLogLinhas([])
    try {
      const res = await api.getSolicitacaoLog(item.id)
      setLogLinhas(res.data)
    } catch {
      toast.error('Falha ao carregar o log.')
    }
  }

  const contagens = useMemo(() => {
    const porStatus: Record<number, number> = {}
    for (const i of itens) porStatus[i.status] = (porStatus[i.status] || 0) + 1
    return porStatus
  }, [itens])

  const acoesDoCard = (item: Solicitacao) => {
    const base = [
      { label: 'Consultar Log', icon: <History size={13} />, onClick: () => abrirLog(item), sempre: true },
    ]
    if (!podeAgir) return base

    if (aba === 'testes') {
      return [
        { label: 'Em Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.EM_TESTES, 'Em Testes') },
        { label: 'Testado com Erro', icon: <XCircle size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.TESTADO_COM_ERRO, titulo: 'Motivo do erro' }) } },
        { label: 'Corrigido pelo Dev', icon: <Code2 size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.CORRIGIDO_DEV, titulo: 'Observação da correção' }) } },
        { label: 'Testado OK', icon: <CheckCircle2 size={13} />, onClick: () => mudarStatus(item, S.TESTADO_OK, 'Testado OK') },
        { label: 'Voltar p/ Em Atendimento', icon: <RefreshCw size={13} />, onClick: () => mudarStatus(item, S.EM_ATENDIMENTO, 'Voltou para Em Atendimento') },
        ...base,
      ]
    }

    return [
      { label: 'Alterar / Finalizar', icon: <Pencil size={13} />, onClick: () => setLancamento({ aberto: true, item }) },
      { label: 'Vincular Dev', icon: <UserPlus size={13} />, onClick: () => setModalDev(item) },
      { label: 'Em Desenvolvimento', icon: <Code2 size={13} />, onClick: () => mudarStatus(item, S.EM_DESENVOLVIMENTO, 'Em Desenvolvimento') },
      { label: 'Aguardando Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_TESTES, 'Aguardando Testes') },
      { label: 'Aguardando Análise Dev', icon: <AlertTriangle size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_ANALISE_DEV, 'Aguardando Análise do Dev') },
      {
        label: item.prioritario === 'S' ? 'Remover Prioritário' : 'Marcar como Prioritário',
        icon: <Star size={13} />,
        onClick: () => executar(() => api.togglePrioritarioSolicitacao(item.id), 'Prioridade atualizada'),
      },
      {
        label: item.somenteOrientacao === 'S' ? 'Remover Somente Orientação' : 'Somente Orientação',
        icon: <Lightbulb size={13} />,
        onClick: () => executar(() => api.toggleOrientacaoSolicitacao(item.id), 'Orientação atualizada'),
      },
      { label: 'Cancelar Atendimento', icon: <XCircle size={13} />, onClick: () => { setTexto(''); setModalCancelar(item) }, perigo: true },
      ...base,
    ]
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mapa de Solicitações</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            {loading ? 'Carregando...' : `${itens.length} solicitação(ões) — o que cada cliente pediu e em que etapa está`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={carregar} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          {podeAgir && (
            <button className="btn-primary flex items-center gap-2" onClick={() => setLancamento({ aberto: true, item: null })}>
              <Plus size={16} /> Novo Atendimento
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          ['suporte', 'Suporte'],
          ['testes', 'Gerenciamento de Teste'],
          ['finalizadas', 'Solicitações finalizadas'],
        ] as Array<[Aba, string]>).map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setAba(id); setSelecionado(null) }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros da aba */}
      <div className="flex flex-wrap gap-3 items-end">
        {aba === 'suporte' && (
          <div className="w-72">
            <Input
              placeholder="Pesquisar por cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        )}
        {aba === 'finalizadas' && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">De</label>
              <input type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Até</label>
              <input type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <button className="btn-secondary flex items-center gap-2" onClick={abrirNotasAtualizacao}>
              <FileText size={14} /> Notas de atualização
            </button>
          </>
        )}
        {aba === 'suporte' && (
          <select
            className="input"
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas as etapas</option>
            <option value={S.EM_DESENVOLVIMENTO}>Em Desenvolvimento</option>
            <option value={1}>Em Fila</option>
            <option value={S.EM_ATENDIMENTO}>Em Atendimento</option>
            <option value={3}>Aguardando Cliente</option>
            <option value={6}>Aguardando Procedimento</option>
            <option value={S.CORRIGIDO_DEV}>Corrigido pelo Dev</option>
            <option value={S.TESTADO_COM_ERRO}>Testado com Erro</option>
          </select>
        )}
        {/* Resumo por etapa da aba atual */}
        <div className="flex flex-wrap gap-2 ml-auto">
          {Object.entries(contagens).map(([st, qtd]) => (
            <span key={st} className="flex items-center gap-1.5 text-xs">
              <StatusBadge status={Number(st) as StatusAtendimento} />
              <span className="text-slate-500 font-medium">{qtd}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Painel de detalhe — equivalente ao lado esquerdo da tela legada */}
        <div className="xl:col-span-1 order-2 xl:order-1">
          <div className="card sticky top-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              {selecionado ? `Solicitação #${selecionado.id}` : 'Detalhes'}
            </h3>
            {!selecionado ? (
              <p className="text-xs text-slate-500">Clique em um card para ver o pedido do cliente.</p>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{selecionado.clienteNome}</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-slate-500">Técnico</p>
                    <p className="text-slate-700 dark:text-slate-300">{selecionado.tecnicoNome ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Desenvolvedor</p>
                    <p className="text-slate-700 dark:text-slate-300">{selecionado.desenvolvedorNome ?? '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Início do atendimento</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {formatarDataHora(selecionado.dataAtendimento ?? selecionado.dataAbertura)}
                    {selecionado.diasParado > 0 && `, ${selecionado.diasParado} dia(s)`}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Etapa</p>
                  <StatusBadge status={selecionado.status} />
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Reclamação</p>
                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-72 overflow-y-auto leading-relaxed">
                    {selecionado.observacoes?.trim() || '—'}
                  </p>
                </div>
                {selecionado.solucao?.trim() && (
                  <div>
                    <p className="text-slate-500 mb-1">Solução</p>
                    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                      {selecionado.solucao}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Grade de cards */}
        <div className="xl:col-span-3 order-1 xl:order-2" ref={gridRef}>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando solicitações...
            </div>
          ) : itens.length === 0 ? (
            <div className="card text-center py-12 text-sm text-slate-500">Nenhuma solicitação nesta aba.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {itens.map((item) => {
                const acoes = acoesDoCard(item)
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelecionado(item)}
                    className={clsx(
                      'rounded-lg border bg-white dark:bg-slate-800 overflow-hidden cursor-pointer transition-all',
                      selecionado?.id === item.id
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className="p-2.5">
                      <div className="flex items-start justify-between gap-1">
                        <p
                          className="text-[11px] font-bold uppercase leading-tight line-clamp-2 flex-1"
                          title={item.clienteNome}
                        >
                          <span className={item.atrasado ? 'text-red-600 dark:text-red-400' : 'text-blue-800 dark:text-blue-300'}>
                            {item.clienteNome || 'SEM CLIENTE'}
                          </span>
                        </p>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {item.prioritario === 'S' && (
                            <Star size={13} className="text-amber-400 fill-amber-400" aria-label="Prioritário" />
                          )}
                          <div className="relative">
                            <button
                              type="button"
                              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuAberto(menuAberto === item.id ? null : item.id)
                              }}
                            >
                              <MoreVertical size={13} className="text-slate-400" />
                            </button>
                            {menuAberto === item.id && (
                              <div
                                className="absolute right-0 top-6 z-30 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {acoes.map((a) => (
                                  <button
                                    key={a.label}
                                    type="button"
                                    disabled={salvando}
                                    onClick={() => { setMenuAberto(null); a.onClick() }}
                                    className={clsx(
                                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50',
                                      (a as any).perigo ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
                                    )}
                                  >
                                    {a.icon} {a.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <p className={clsx(
                        'text-center text-lg font-bold my-1',
                        item.atrasado ? 'text-red-600 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'
                      )}>
                        {item.id}
                      </p>

                      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
                        {item.clienteCurva && <span className="font-bold">{item.clienteCurva}</span>}
                        {item.somenteOrientacao === 'S' && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">Só orientação</span>
                        )}
                        {item.atrasado && (
                          <span className="text-red-600 dark:text-red-400 font-medium">{item.diasParado}d parado</span>
                        )}
                      </div>
                    </div>

                    <div className={clsx(
                      'px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase',
                      CORES_RODAPE[item.status] ?? 'bg-slate-600 text-white'
                    )}>
                      <span className="truncate">
                        {item.tecnicoNome ?? '—'}
                        {item.desenvolvedorNome ? ` / ${item.desenvolvedorNome}` : ''}
                      </span>
                      <span className="flex-shrink-0 ml-1 opacity-90" title={statusAtendimentoLabel[item.status]}>
                        {item.diasParado}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Notas de atualização */}
      <Modal isOpen={modalNotas} onClose={() => setModalNotas(false)} title="Notas de atualização" size="lg">
        {carregandoNotas ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Gerando...
          </div>
        ) : (
          <div className="space-y-3">
            <textarea readOnly className="input w-full h-72 resize-none font-mono text-xs" value={notasTexto} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModalNotas(false)}>Fechar</button>
              <button
                className="btn-primary flex items-center gap-2"
                disabled={!notasTexto}
                onClick={async () => {
                  await navigator.clipboard.writeText(notasTexto)
                  toast.success('Copiado para a área de transferência')
                }}
              >
                <Copy size={14} /> Copiar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Lançamento — Novo / Alterar / Finalizar */}
      <LancamentoSolicitacao
        aberto={lancamento.aberto}
        solicitacao={lancamento.item}
        usuarios={devs}
        onClose={() => setLancamento({ aberto: false, item: null })}
        onSalvo={carregar}
      />

      {/* Log do atendimento */}
      <Modal isOpen={!!modalLog} onClose={() => setModalLog(null)} title={`Log da solicitação #${modalLog?.id ?? ''}`} size="lg">
        {logLinhas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum registro de log para esta solicitação.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logLinhas.map((l, i) => (
              <div key={i} className="flex gap-3 text-xs border-b border-slate-100 dark:border-slate-700 pb-2">
                <span className="text-slate-500 flex-shrink-0 w-32">{formatarDataHora(l.data)}</span>
                <span className="flex-1 text-slate-700 dark:text-slate-300">{l.obs}</span>
                <span className="text-slate-500 flex-shrink-0">{l.usuario ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Vincular desenvolvedor */}
      <Modal isOpen={!!modalDev} onClose={() => setModalDev(null)} title={`Vincular desenvolvedor — #${modalDev?.id ?? ''}`}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Sem desenvolvedor vinculado a solicitação não pode ir para "Em Desenvolvimento".
          </p>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {devs.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={salvando}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                onClick={async () => {
                  const ok = await executar(
                    () => api.vincularDesenvolvedor(modalDev!.id, d.id),
                    `Desenvolvedor vinculado — #${modalDev!.id}`
                  )
                  if (ok) setModalDev(null)
                }}
              >
                {d.nome || d.nomeUsu}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Justificativa (Testado com Erro / Corrigido pelo Dev) */}
      <Modal
        isOpen={!!modalJustificativa}
        onClose={() => setModalJustificativa(null)}
        title={modalJustificativa?.titulo ?? ''}
      >
        <div className="space-y-3">
          <textarea
            className="input w-full h-32 resize-none"
            placeholder="Descreva..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModalJustificativa(null)}>Cancelar</button>
            <button
              className="btn-primary"
              disabled={!texto.trim() || salvando}
              onClick={async () => {
                const m = modalJustificativa!
                const ok = await executar(
                  () => api.alterarStatusSolicitacao(m.item.id, m.status, texto.trim()),
                  `Etapa atualizada — #${m.item.id}`
                )
                if (ok) setModalJustificativa(null)
              }}
            >
              {salvando ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancelamento */}
      <Modal isOpen={!!modalCancelar} onClose={() => setModalCancelar(null)} title={`Cancelar solicitação #${modalCancelar?.id ?? ''}`}>
        <div className="space-y-3">
          <p className="text-xs text-red-600 dark:text-red-400">
            O cancelamento é registrado no log com seu usuário e não é desfeito por esta tela.
          </p>
          <textarea
            className="input w-full h-28 resize-none"
            placeholder="Motivo do cancelamento"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModalCancelar(null)}>Voltar</button>
            <button
              className="btn-primary !bg-red-600 hover:!bg-red-700"
              disabled={!texto.trim() || salvando}
              onClick={async () => {
                const ok = await executar(
                  () => api.cancelarSolicitacao(modalCancelar!.id, texto.trim()),
                  `Solicitação #${modalCancelar!.id} cancelada`
                )
                if (ok) setModalCancelar(null)
              }}
            >
              {salvando ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
