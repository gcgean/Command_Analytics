import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  RefreshCw, Loader2, Star, Search, MoreVertical, AlertTriangle,
  Code2, FlaskConical, CheckCircle2, XCircle, History, UserPlus, Lightbulb, Pencil, Plus, FileText, Copy, Info,
} from 'lucide-react'
import { api, statusAtendimentoLabel } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../components/ui/Toast'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { LancamentoSolicitacao } from './LancamentoSolicitacao'
import type { Solicitacao, StatusAtendimento, Usuario } from '../../types'

type Aba = 'suporte' | 'finalizadas'

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

const CHAVE_FILTRO_ETAPA = 'mapaSolicitacoes:filtroEtapa'
const CHAVE_FILTRO_TECNICO = 'mapaSolicitacoes:filtroTecnicoId'
const CHAVE_FILTRO_DEV = 'mapaSolicitacoes:filtroDesenvolvedorId'

function lerFiltroSalvo(chave: string): string[] {
  try {
    const raw = localStorage.getItem(chave)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function salvarFiltro(chave: string, valores: string[]): void {
  try {
    valores.length ? localStorage.setItem(chave, JSON.stringify(valores)) : localStorage.removeItem(chave)
  } catch {
    /* ignora — filtro só deixa de persistir, tela continua funcionando */
  }
}

/** Dropdown com checkboxes — mesmo visual do Select do projeto, mas permite marcar mais de uma opção. */
function MultiSelectFiltro({
  placeholder, options, selecionados, onChange,
}: {
  placeholder: string
  options: Array<{ value: string; label: string }>
  selecionados: string[]
  onChange: (valores: string[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('click', fechar)
    return () => document.removeEventListener('click', fechar)
  }, [aberto])

  const toggle = (value: string) => {
    onChange(selecionados.includes(value) ? selecionados.filter((v) => v !== value) : [...selecionados, value])
  }

  const resumo =
    selecionados.length === 0
      ? placeholder
      : selecionados.length === 1
        ? (options.find((o) => o.value === selecionados[0])?.label ?? placeholder)
        : `${selecionados.length} selecionadas`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm w-full text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <span className={clsx('truncate', selecionados.length === 0 && 'text-slate-500')}>{resumo}</span>
        <span className="text-slate-400 flex-shrink-0">▾</span>
      </button>
      {aberto && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
          {selecionados.length > 0 && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </button>
          )}
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(opt.value)} onChange={() => toggle(opt.value)} />
              <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function MapaSolicitacoes() {
  const { can } = usePermissions()
  const podeAgir = can('solicitacoes-acoes')
  const { toast } = useToast()

  const [aba, setAba] = useState<Aba>('suporte')
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  // Filtros de etapa/técnico/dev aceitam múltipla seleção e persistem entre visitas — evita
  // refiltrar toda vez que volta na tela.
  const [filtroEtapa, setFiltroEtapaState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_ETAPA))
  const [filtroTecnicoId, setFiltroTecnicoIdState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_TECNICO))
  const [filtroDesenvolvedorId, setFiltroDesenvolvedorIdState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_DEV))
  const [filtroPrioritario, setFiltroPrioritario] = useState(false)
  const [modalDetalhes, setModalDetalhes] = useState<Solicitacao | null>(null)
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
            ...(filtroEtapa.length ? { status: filtroEtapa.map(Number) } : {}),
            ...(filtroTecnicoId.length ? { tecnicoId: filtroTecnicoId.map(Number) } : {}),
            ...(filtroDesenvolvedorId.length ? { desenvolvedorId: filtroDesenvolvedorId.map(Number) } : {}),
            ...(filtroPrioritario ? { prioritario: true } : {}),
          })
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
  }, [aba, busca, filtroEtapa, filtroTecnicoId, filtroDesenvolvedorId, filtroPrioritario, dataInicio, dataFim, toast])

  const setFiltroEtapa = (v: string[]) => { setFiltroEtapaState(v); salvarFiltro(CHAVE_FILTRO_ETAPA, v) }
  const setFiltroTecnico = (v: string[]) => { setFiltroTecnicoIdState(v); salvarFiltro(CHAVE_FILTRO_TECNICO, v) }
  const setFiltroDesenvolvedor = (v: string[]) => { setFiltroDesenvolvedorIdState(v); salvarFiltro(CHAVE_FILTRO_DEV, v) }

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
      { label: 'Exibir Detalhes', icon: <Info size={13} />, onClick: () => setModalDetalhes(item), sempre: true },
      { label: 'Consultar Log', icon: <History size={13} />, onClick: () => abrirLog(item), sempre: true },
    ]
    if (!podeAgir) return base

    return [
      { label: 'Alterar / Finalizar', icon: <Pencil size={13} />, onClick: () => setLancamento({ aberto: true, item }) },
      { label: 'Vincular Dev', icon: <UserPlus size={13} />, onClick: () => setModalDev(item) },
      { label: 'Em Desenvolvimento', icon: <Code2 size={13} />, onClick: () => mudarStatus(item, S.EM_DESENVOLVIMENTO, 'Em Desenvolvimento') },
      { label: 'Aguardando Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_TESTES, 'Aguardando Testes') },
      { label: 'Aguardando Análise Dev', icon: <AlertTriangle size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_ANALISE_DEV, 'Aguardando Análise do Dev') },
      { label: 'Em Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.EM_TESTES, 'Em Testes') },
      { label: 'Testado com Erro', icon: <XCircle size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.TESTADO_COM_ERRO, titulo: 'Motivo do erro' }) } },
      { label: 'Corrigido pelo Dev', icon: <Code2 size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.CORRIGIDO_DEV, titulo: 'Observação da correção' }) } },
      { label: 'Testado OK', icon: <CheckCircle2 size={13} />, onClick: () => mudarStatus(item, S.TESTADO_OK, 'Testado OK') },
      { label: 'Voltar p/ Em Atendimento', icon: <RefreshCw size={13} />, onClick: () => mudarStatus(item, S.EM_ATENDIMENTO, 'Voltou para Em Atendimento') },
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
          ['suporte', 'Backlog de Desenvolvimento'],
          ['finalizadas', 'Solicitações finalizadas'],
        ] as Array<[Aba, string]>).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
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
          <>
            <div className="w-52">
              <MultiSelectFiltro
                placeholder="Todas as etapas"
                selecionados={filtroEtapa}
                onChange={setFiltroEtapa}
                options={[
                  { value: String(S.EM_DESENVOLVIMENTO), label: 'Em Desenvolvimento' },
                  { value: '1', label: 'Em Fila' },
                  { value: String(S.EM_ATENDIMENTO), label: 'Em Atendimento' },
                  { value: '3', label: 'Aguardando Cliente' },
                  { value: '6', label: 'Aguardando Procedimento' },
                  { value: String(S.AGUARDANDO_TESTES), label: 'Aguardando Testes' },
                  { value: String(S.EM_TESTES), label: 'Em Testes' },
                  { value: String(S.TESTADO_OK), label: 'Testado OK' },
                  { value: String(S.CORRIGIDO_DEV), label: 'Corrigido pelo Dev' },
                  { value: String(S.TESTADO_COM_ERRO), label: 'Testado com Erro' },
                ]}
              />
            </div>
            <div className="w-52">
              <MultiSelectFiltro
                placeholder="Todos os técnicos"
                selecionados={filtroTecnicoId}
                onChange={setFiltroTecnico}
                options={devs.map((d) => ({ value: String(d.id), label: d.nome || d.nomeUsu || '' }))}
              />
            </div>
            <div className="w-52">
              <MultiSelectFiltro
                placeholder="Todos os desenvolvedores"
                selecionados={filtroDesenvolvedorId}
                onChange={setFiltroDesenvolvedor}
                options={devs.map((d) => ({ value: String(d.id), label: d.nome || d.nomeUsu || '' }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 px-1 h-[38px]">
              <input type="checkbox" checked={filtroPrioritario} onChange={(e) => setFiltroPrioritario(e.target.checked)} />
              Só prioritárias
            </label>
          </>
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

      {/* Grade de cards — largura cheia; detalhes agora vivem no menu de cada card */}
      <div ref={gridRef}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando solicitações...
          </div>
        ) : itens.length === 0 ? (
          <div className="card text-center py-12 text-sm text-slate-500">Nenhuma solicitação nesta aba.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {itens.map((item) => {
              const acoes = acoesDoCard(item)
              return (
                <div
                  key={item.id}
                  className="group relative"
                >
                  {/* Tooltip com a reclamação — mesma informação do "Exibir Detalhes", só que ao passar o mouse.
                      Escondido enquanto o menu de ações deste card está aberto, pra não sobrepor os itens. */}
                  {menuAberto !== item.id && (
                    <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-64 max-h-56 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
                      <p className="text-[10px] text-slate-500 mb-1">
                        Início: {formatarDataHora(item.dataAtendimento ?? item.dataAbertura)}
                        {item.diasParado > 0 && ` · ${item.diasParado} dia(s)`}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Reclamação</p>
                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-6">
                        {item.observacoes?.trim() || '—'}
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden group-hover:border-slate-300 dark:group-hover:border-slate-600 transition-colors">
                  <div className="p-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <p
                        className="text-[10px] font-bold uppercase leading-tight line-clamp-2 flex-1"
                        title={item.clienteNome}
                      >
                        <span className={item.atrasado ? 'text-red-600 dark:text-red-400' : 'text-blue-800 dark:text-blue-300'}>
                          {item.clienteNome || 'SEM CLIENTE'}
                        </span>
                      </p>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {item.prioritario === 'S' && (
                          <AlertTriangle size={12} className="text-red-600 fill-red-100 dark:fill-red-950" aria-label="Prioritário / urgente" />
                        )}
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={(e) => { e.stopPropagation(); setMenuAberto(menuAberto === item.id ? null : item.id) }}
                        >
                          <MoreVertical size={12} className="text-slate-400" />
                        </button>
                      </div>
                    </div>

                    <p className={clsx(
                      'text-center text-sm font-bold my-0.5',
                      item.atrasado ? 'text-red-600 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'
                    )}>
                      {item.id}
                    </p>
                    <p className="text-center text-[9px] font-medium text-slate-500 dark:text-slate-400 -mt-0.5 mb-0.5 truncate">
                      {statusAtendimentoLabel[item.status]}
                    </p>

                    <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-500">
                      {item.clienteCurva && <span className="font-bold">{item.clienteCurva}</span>}
                      {item.somenteOrientacao === 'S' && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">orientação</span>
                      )}
                      {item.atrasado && (
                        <span className="text-red-600 dark:text-red-400 font-medium">{item.diasParado}d</span>
                      )}
                    </div>
                  </div>

                  <div className={clsx(
                    'px-1.5 py-0.5 flex items-center justify-between text-[9px] font-bold uppercase',
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

                  {/* Fora do card visual (que tem overflow-hidden pros cantos arredondados) pra não ser clipado */}
                  {menuAberto === item.id && (
                    <div
                      className="absolute right-1 top-6 z-30 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
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
              )
            })}
          </div>
        )}
      </div>

      {/* Exibir Detalhes */}
      <Modal isOpen={!!modalDetalhes} onClose={() => setModalDetalhes(null)} title={`Solicitação #${modalDetalhes?.id ?? ''}`}>
        {modalDetalhes && (
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{modalDetalhes.clienteNome}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-slate-500">Técnico</p>
                <p className="text-slate-700 dark:text-slate-300">{modalDetalhes.tecnicoNome ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Desenvolvedor</p>
                <p className="text-slate-700 dark:text-slate-300">{modalDetalhes.desenvolvedorNome ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-slate-500">Início do atendimento</p>
              <p className="text-slate-700 dark:text-slate-300">
                {formatarDataHora(modalDetalhes.dataAtendimento ?? modalDetalhes.dataAbertura)}
                {modalDetalhes.diasParado > 0 && `, ${modalDetalhes.diasParado} dia(s)`}
              </p>
            </div>
            <div>
              <p className="text-slate-500 mb-1">Etapa</p>
              <StatusBadge status={modalDetalhes.status} />
            </div>
            <div>
              <p className="text-slate-500 mb-1">Reclamação</p>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-72 overflow-y-auto leading-relaxed">
                {modalDetalhes.observacoes?.trim() || '—'}
              </p>
            </div>
            {modalDetalhes.solucao?.trim() && (
              <div>
                <p className="text-slate-500 mb-1">Solução</p>
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                  {modalDetalhes.solucao}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

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
