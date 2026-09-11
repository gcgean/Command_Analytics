import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  RefreshCw, Loader2, Star, Search, MoreVertical, AlertTriangle,
  Code2, FlaskConical, CheckCircle2, XCircle, History, UserPlus, Lightbulb, Pencil, Plus, FileText, Copy, Info, ScrollText, CheckCheck, Paperclip, Bug,
} from 'lucide-react'
import { api, statusAtendimentoLabel } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../components/ui/Toast'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { LancamentoSolicitacao, type PrefillSolicitacao } from './LancamentoSolicitacao'
import { AuditoriaTimeline } from '../../components/ui/AuditoriaTimeline'
import type { ClienteAnexo, Projeto, Solicitacao, Usuario } from '../../types'

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

// Ordem fixa do resumo de totalizadores — segue a sequência do fluxo (fila → desenvolvimento →
// testes → resultado), não a ordem em que os status aparecem nos dados carregados.
const ORDEM_STATUS_RESUMO = [1, 3, S.EM_ATENDIMENTO, 6, S.AGUARDANDO_ANALISE_DEV, S.EM_DESENVOLVIMENTO, S.AGUARDANDO_TESTES, S.EM_TESTES, S.TESTADO_OK, S.CORRIGIDO_DEV, S.TESTADO_COM_ERRO]

// Rótulo do status 2 só nesta tela — no resto do sistema (Atendimentos geral, dashboards) esse
// status representa "técnico atendendo agora", e mudar o rótulo global misrepresentaria isso lá.
// Aqui, no contexto do backlog de dev, "Aguardando Desenvolvimento" é o que faz sentido.
const ROTULO_STATUS: Record<number, string> = {
  ...statusAtendimentoLabel,
  [S.EM_ATENDIMENTO]: 'Aguardando Desenvolvimento',
}

// Cor sólida e única por status — nada de tons repetidos nem de translúcido apagado, cada etapa
// precisa ser reconhecível de longe. A família de cor ainda dá uma pista do sentido geral
// (âmbares/amarelo/laranja = aguardando algo, azuis/roxo = em progresso, verde = positivo,
// vermelho = problema), mas o tom em si nunca se repete entre status diferentes.
const CORES_ETAPA: Record<number, string> = {
  1: 'bg-slate-500 text-white', // Em Fila
  3: 'bg-cyan-600 text-white', // Aguardando Cliente
  4: 'bg-orange-600 text-white', // Aguardando Análise Dev
  6: 'bg-yellow-500 text-slate-900', // Aguardando Procedimento
  // Paleta customizada pedida pelo usuário (nomes das cores conforme o próprio pediu):
  2: 'bg-[#A7AF52] text-white', // Aguardando Desenvolvimento — verde menta
  13: 'bg-[#292566] text-white', // Em Desenvolvimento — azul mar
  9: 'bg-[#3E97AF] text-white', // Aguardando Testes — azul ciano
  10: 'bg-[#2E4053] text-white', // Em Testes — azul mediterrâneo
  11: 'bg-[#00473E] text-white', // Testado OK — verde floresta
  17: 'bg-[#C1272D] text-white', // Testado com Erro — vermelho telha
  16: 'bg-[#5C7A36] text-white', // Corrigido pelo Dev — verde folha
  7: 'bg-[#00473E] text-white', // Concluído (aba Finalizadas) — verde floresta, igual Testado OK
}

// Mesma família de cor de CORES_ETAPA, só que como texto legível sobre o card branco — usado no
// nome do cliente, número do ticket e nome da etapa, pra tudo isso "acompanhar" a cor do status.
const TEXTO_ETAPA: Record<number, string> = {
  1: 'text-slate-600 dark:text-slate-400',
  3: 'text-cyan-700 dark:text-cyan-400',
  4: 'text-orange-700 dark:text-orange-400',
  6: 'text-yellow-700 dark:text-yellow-500',
  2: 'text-[#7d8340] dark:text-[#c3ca8c]', // verde menta
  13: 'text-[#292566] dark:text-[#8886c4]', // azul mar
  9: 'text-[#2f7488] dark:text-[#7fc3d6]', // azul ciano
  10: 'text-[#2E4053] dark:text-[#96a5b2]', // azul mediterrâneo
  11: 'text-[#00473E] dark:text-[#4fbfae]', // verde floresta
  17: 'text-[#C1272D] dark:text-[#f28c8f]', // vermelho telha
  16: 'text-[#5C7A36] dark:text-[#a3c47c]', // verde folha
  7: 'text-[#00473E] dark:text-[#4fbfae]', // Concluído — igual Testado OK
}

function EtapaBadge({ status, className }: { status: number; className?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
      CORES_ETAPA[status] ?? 'bg-slate-500 text-white',
      className
    )}>
      {ROTULO_STATUS[status] ?? status}
    </span>
  )
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
const CHAVE_FILTRO_PROJETO = 'mapaSolicitacoes:filtroProjetoId'

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

/**
 * Miniaturas dos anexos da solicitação, com ampliação ao clicar. O download exige token, então
 * cada arquivo vira um object URL — revogados ao desmontar pra não vazar memória.
 */
function GaleriaAnexos({ registroId }: { registroId: number }) {
  const [itens, setItens] = useState<ClienteAnexo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [ampliado, setAmpliado] = useState<ClienteAnexo | null>(null)
  const criadas = useRef<string[]>([])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    api
      .listAnexos({ tabela: 'atendimentos', registroId })
      .then((lista) => {
        if (!ativo) return
        setItens(lista)
        setCarregando(false)
        // Baixa só o que dá pra exibir embutido; o resto fica como chip de download.
        for (const anexo of lista) {
          if (!/^(image|video|audio)\//.test(anexo.mimeType) && anexo.mimeType !== 'application/pdf') continue
          api
            .getAnexoBlob(anexo.id, { download: false })
            .then((blob) => {
              if (!ativo) return
              const url = URL.createObjectURL(blob)
              criadas.current.push(url)
              setUrls((u) => ({ ...u, [anexo.id]: url }))
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        if (!ativo) return
        setItens([])
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [registroId])

  useEffect(
    () => () => {
      for (const url of criadas.current) URL.revokeObjectURL(url)
      criadas.current = []
    },
    []
  )

  if (carregando) return <p className="text-slate-500">Carregando anexos...</p>
  if (!itens.length) return null

  const conteudoAmpliado = (anexo: ClienteAnexo) => {
    const url = urls[anexo.id]
    if (!url) return <p className="text-slate-500 text-sm">Carregando arquivo...</p>
    if (anexo.mimeType.startsWith('image/')) {
      return <img src={url} alt={anexo.originalName} className="max-w-full max-h-[75vh] mx-auto rounded-lg" />
    }
    if (anexo.mimeType.startsWith('video/')) {
      return <video src={url} controls className="max-w-full max-h-[75vh] mx-auto rounded-lg" />
    }
    if (anexo.mimeType.startsWith('audio/')) return <audio src={url} controls className="w-full" />
    return <iframe title={anexo.originalName} src={url} className="w-full h-[75vh] rounded-lg border border-slate-200 dark:border-slate-700" />
  }

  return (
    <div>
      <p className="text-slate-500 mb-1.5">Anexos ({itens.length})</p>
      <div className="flex flex-wrap gap-2">
        {itens.map((anexo) => {
          const url = urls[anexo.id]
          const ehImagem = anexo.mimeType.startsWith('image/')
          return (
            <button
              key={anexo.id}
              type="button"
              onClick={() => setAmpliado(anexo)}
              title={anexo.originalName}
              className="w-24 h-24 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900 hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center justify-center gap-1 p-1"
            >
              {ehImagem && url ? (
                <img src={url} alt={anexo.originalName} className="w-full h-full object-cover" />
              ) : (
                <>
                  <Paperclip size={18} className="text-slate-400" />
                  <span className="text-[9px] text-slate-500 line-clamp-2 text-center leading-tight px-0.5">
                    {anexo.originalName}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <Modal
        isOpen={!!ampliado}
        onClose={() => setAmpliado(null)}
        title={ampliado?.originalName || 'Anexo'}
        size="xl"
      >
        {ampliado && conteudoAmpliado(ampliado)}
      </Modal>
    </div>
  )
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
  const location = useLocation()
  const navigate = useNavigate()

  const [aba, setAba] = useState<Aba>('suporte')
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  // Filtros de etapa/técnico/dev aceitam múltipla seleção e persistem entre visitas — evita
  // refiltrar toda vez que volta na tela.
  const [filtroEtapa, setFiltroEtapaState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_ETAPA))
  const [filtroTecnicoId, setFiltroTecnicoIdState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_TECNICO))
  const [filtroDesenvolvedorId, setFiltroDesenvolvedorIdState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_DEV))
  const [filtroProjetoId, setFiltroProjetoIdState] = useState<string[]>(() => lerFiltroSalvo(CHAVE_FILTRO_PROJETO))
  const [filtroPrioritario, setFiltroPrioritario] = useState(false)
  const [modalDetalhes, setModalDetalhes] = useState<Solicitacao | null>(null)
  const [auditoriaItem, setAuditoriaItem] = useState<Solicitacao | null>(null)
  const [menuAberto, setMenuAberto] = useState<number | null>(null)

  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(hojeISO())

  const [devs, setDevs] = useState<Usuario[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [modalLog, setModalLog] = useState<Solicitacao | null>(null)
  const [logLinhas, setLogLinhas] = useState<Array<{ obs: string; data: string; usuario: string | null }>>([])
  const [modalDev, setModalDev] = useState<Solicitacao | null>(null)
  const [modalJustificativa, setModalJustificativa] = useState<{ item: Solicitacao; status: number; titulo: string } | null>(null)
  const [modalCancelar, setModalCancelar] = useState<Solicitacao | null>(null)
  const [modalFinalizar, setModalFinalizar] = useState<Solicitacao | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [lancamento, setLancamento] = useState<{ aberto: boolean; item: Solicitacao | null }>({ aberto: false, item: null })
  const [prefillIA, setPrefillIA] = useState<PrefillSolicitacao | null>(null)
  const [modalNotas, setModalNotas] = useState(false)
  const [notasTexto, setNotasTexto] = useState('')
  const [carregandoNotas, setCarregandoNotas] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    const req =
      aba === 'suporte'
        ? api.getSolicitacoesSuporte({
            ...(busca.trim() ? { busca: busca.trim() } : {}),
            // A etapa NÃO entra aqui de propósito: os totalizadores contam em cima desta lista,
            // e filtrar no servidor zeraria todos os outros, impedindo de clicar de um pro outro.
            // Com o backlog em ~200 registros, filtrar por etapa no cliente sai de graça.
            ...(filtroTecnicoId.length ? { tecnicoId: filtroTecnicoId.map(Number) } : {}),
            ...(filtroDesenvolvedorId.length ? { desenvolvedorId: filtroDesenvolvedorId.map(Number) } : {}),
            ...(filtroProjetoId.length ? { projetoId: filtroProjetoId.map(Number) } : {}),
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
  }, [aba, busca, filtroTecnicoId, filtroDesenvolvedorId, filtroProjetoId, filtroPrioritario, dataInicio, dataFim, toast])

  const setFiltroEtapa = (v: string[]) => { setFiltroEtapaState(v); salvarFiltro(CHAVE_FILTRO_ETAPA, v) }
  const setFiltroTecnico = (v: string[]) => { setFiltroTecnicoIdState(v); salvarFiltro(CHAVE_FILTRO_TECNICO, v) }
  const setFiltroDesenvolvedor = (v: string[]) => { setFiltroDesenvolvedorIdState(v); salvarFiltro(CHAVE_FILTRO_DEV, v) }
  const setFiltroProjeto = (v: string[]) => { setFiltroProjetoIdState(v); salvarFiltro(CHAVE_FILTRO_PROJETO, v) }

  useEffect(() => {
    // Busca é digitada — espera o usuário parar antes de bater no servidor.
    const timer = setTimeout(carregar, busca ? 400 : 0)
    return () => clearTimeout(timer)
  }, [carregar, busca])

  useEffect(() => {
    api.getUsuarios().then((u) => setDevs(Array.isArray(u) ? u : [])).catch(() => setDevs([]))
    api.getProjetos().then(setProjetos).catch(() => setProjetos([]))
  }, [])

  // Chegando do assistente de IA com a solicitação já redigida: abre o formulário real com o
  // texto reescrito, pra pessoa conferir e salvar. Nada é gravado sem essa confirmação.
  useEffect(() => {
    const prefill = (location.state as any)?.criarSolicitacaoPrefill as PrefillSolicitacao | undefined
    if (prefill?.clienteId) {
      setPrefillIA(prefill)
      setLancamento({ aberto: true, item: null })
      navigate(location.pathname + location.search, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Contam sempre a lista inteira (sem a etapa), pra os totalizadores continuarem mostrando o
  // panorama mesmo com uma etapa selecionada.
  const contagens = useMemo(() => {
    const porStatus: Record<number, number> = {}
    for (const i of itens) porStatus[i.status] = (porStatus[i.status] || 0) + 1
    return porStatus
  }, [itens])

  const itensVisiveis = useMemo(
    () =>
      aba === 'suporte' && filtroEtapa.length
        ? itens.filter((i) => filtroEtapa.includes(String(i.status)))
        : itens,
    [itens, filtroEtapa, aba]
  )

  // O menu é alto (~15 itens): abrindo pra baixo ele cobre os cards de baixo. Abre ao lado do
  // card e vira pro outro lado / pra cima quando não couber na janela.
  const [menuPos, setMenuPos] = useState<{ lado: 'esq' | 'dir'; ancorarEmbaixo: boolean }>({
    lado: 'dir',
    ancorarEmbaixo: false,
  })

  const abrirMenu = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    e.stopPropagation()
    if (menuAberto === id) {
      setMenuAberto(null)
      return
    }
    const LARGURA_MENU = 224 // w-56
    const ALTURA_MENU = 470 // altura do menu cheio, com todas as ações
    const r = e.currentTarget.getBoundingClientRect()
    setMenuPos({
      lado: r.right + 8 + LARGURA_MENU <= window.innerWidth ? 'dir' : 'esq',
      ancorarEmbaixo: r.top + ALTURA_MENU > window.innerHeight,
    })
    setMenuAberto(id)
  }

  // 1 clique abre os detalhes, 2 cliques abrem a edição. O clique simples espera um pouco pra
  // não disparar junto com o duplo.
  const cliqueCard = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (cliqueCard.current) window.clearTimeout(cliqueCard.current)
    },
    []
  )

  const aoClicarCard = (item: Solicitacao) => {
    if (cliqueCard.current) window.clearTimeout(cliqueCard.current)
    cliqueCard.current = window.setTimeout(() => {
      cliqueCard.current = null
      setModalDetalhes(item)
    }, 220)
  }

  const aoClicarDuasVezes = (item: Solicitacao) => {
    if (cliqueCard.current) {
      window.clearTimeout(cliqueCard.current)
      cliqueCard.current = null
    }
    // Sem permissão de ação não há o que editar — mostra os detalhes em vez de não fazer nada.
    if (!podeAgir) {
      setModalDetalhes(item)
      return
    }
    setModalDetalhes(null)
    setLancamento({ aberto: true, item })
  }

  const alternarEtapa = (st: number) => {
    const valor = String(st)
    // Clicar na etapa já selecionada sozinha volta pra "todos".
    setFiltroEtapa(filtroEtapa.length === 1 && filtroEtapa[0] === valor ? [] : [valor])
  }

  const acoesDoCard = (item: Solicitacao) => {
    const base = [
      { label: 'Exibir Detalhes', icon: <Info size={13} />, onClick: () => setModalDetalhes(item), sempre: true },
      { label: 'Consultar Log', icon: <History size={13} />, onClick: () => abrirLog(item), sempre: true },
      { label: 'Histórico de Auditoria', icon: <ScrollText size={13} />, onClick: () => setAuditoriaItem(item), sempre: true },
    ]
    if (!podeAgir) return base

    return [
      {
        label: 'Marcar como Finalizado',
        icon: <CheckCheck size={13} />,
        onClick: () => { setTexto(item.solucao ?? ''); setModalFinalizar(item) },
        destaque: true,
      },
      { label: 'Alterar / Finalizar', icon: <Pencil size={13} />, onClick: () => setLancamento({ aberto: true, item }) },
      { label: 'Vincular Dev', icon: <UserPlus size={13} />, onClick: () => setModalDev(item) },
      { label: 'Em Desenvolvimento', icon: <Code2 size={13} />, onClick: () => mudarStatus(item, S.EM_DESENVOLVIMENTO, 'Em Desenvolvimento') },
      { label: 'Aguardando Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_TESTES, 'Aguardando Testes') },
      { label: 'Aguardando Análise Dev', icon: <AlertTriangle size={13} />, onClick: () => mudarStatus(item, S.AGUARDANDO_ANALISE_DEV, 'Aguardando Análise do Dev') },
      { label: 'Em Testes', icon: <FlaskConical size={13} />, onClick: () => mudarStatus(item, S.EM_TESTES, 'Em Testes') },
      { label: 'Testado com Erro', icon: <XCircle size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.TESTADO_COM_ERRO, titulo: 'Motivo do erro' }) } },
      { label: 'Corrigido pelo Dev', icon: <Code2 size={13} />, onClick: () => { setTexto(''); setModalJustificativa({ item, status: S.CORRIGIDO_DEV, titulo: 'Observação da correção' }) } },
      { label: 'Testado OK', icon: <CheckCircle2 size={13} />, onClick: () => mudarStatus(item, S.TESTADO_OK, 'Testado OK') },
      { label: 'Voltar p/ Aguardando Desenvolvimento', icon: <RefreshCw size={13} />, onClick: () => mudarStatus(item, S.EM_ATENDIMENTO, 'Voltou para Em Atendimento') },
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
            {loading ? 'Carregando...' : `${itensVisiveis.length} solicitação(ões) — o que cada cliente pediu e em que etapa está`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={carregar} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          {podeAgir && (
            <button className="btn-primary flex items-center gap-2" onClick={() => setLancamento({ aberto: true, item: null })}>
              <Plus size={16} /> Nova Solicitação
            </button>
          )}
        </div>
      </div>

      {/* Resumo por etapa — sempre todas, na mesma ordem, mesmo com contagem zero. Clicar filtra. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2">
        <button
          type="button"
          onClick={() => setFiltroEtapa([])}
          title="Mostrar todas as etapas"
          className={clsx(
            'relative overflow-hidden rounded-xl border bg-white dark:bg-slate-800 pl-3 pr-2 py-2 text-left transition-all hover:shadow-md',
            filtroEtapa.length === 0
              ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400 shadow-sm'
              : 'border-slate-200 dark:border-slate-700'
          )}
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-blue-600" />
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
            Todos
          </p>
          <p className="text-xl font-bold leading-tight text-blue-600 dark:text-blue-400">{itens.length}</p>
        </button>

        {ORDEM_STATUS_RESUMO.map((st) => {
          const qtd = contagens[st] ?? 0
          const corFundo = (CORES_ETAPA[st] ?? 'bg-slate-500 text-white').split(' ')[0]
          const ativo = filtroEtapa.includes(String(st))
          return (
            <button
              key={st}
              type="button"
              onClick={() => alternarEtapa(st)}
              title={ativo ? `Remover filtro: ${ROTULO_STATUS[st]}` : `Filtrar por ${ROTULO_STATUS[st]}`}
              className={clsx(
                'relative overflow-hidden rounded-xl border bg-white dark:bg-slate-800 pl-3 pr-2 py-2 text-left transition-all hover:shadow-md hover:opacity-100',
                ativo
                  ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400 shadow-sm'
                  : qtd === 0
                    ? 'border-slate-100 dark:border-slate-700/60 opacity-50'
                    : 'border-slate-200 dark:border-slate-700 shadow-sm'
              )}
            >
              <span className={clsx('absolute inset-y-0 left-0 w-1', corFundo)} />
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
                {ROTULO_STATUS[st]}
              </p>
              <p className={clsx('text-xl font-bold leading-tight', TEXTO_ETAPA[st] ?? 'text-slate-700 dark:text-slate-300')}>
                {qtd}
              </p>
            </button>
          )
        })}
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
                  { value: String(S.EM_ATENDIMENTO), label: 'Aguardando Desenvolvimento' },
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
            <div className="w-52">
              <MultiSelectFiltro
                placeholder="Todos os projetos"
                selecionados={filtroProjetoId}
                onChange={setFiltroProjeto}
                options={projetos.map((p) => ({ value: String(p.id), label: p.nome }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 px-1 h-[38px]">
              <input type="checkbox" checked={filtroPrioritario} onChange={(e) => setFiltroPrioritario(e.target.checked)} />
              Só prioritárias
            </label>
          </>
        )}
      </div>

      {/* Grade de cards — largura cheia; detalhes agora vivem no menu de cada card */}
      <div ref={gridRef}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando solicitações...
          </div>
        ) : itensVisiveis.length === 0 ? (
          <div className="card text-center py-12 text-sm text-slate-500">Nenhuma solicitação nesta aba.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {itensVisiveis.map((item) => {
              const acoes = acoesDoCard(item)
              return (
                <div
                  key={item.id}
                  className="group relative"
                >
                  {/* Tooltip com a reclamação — mesma informação do "Exibir Detalhes", só que ao passar o mouse.
                      Escondido enquanto o menu de ações deste card está aberto, pra não sobrepor os itens. */}
                  {menuAberto !== item.id && (
                    <div className="pointer-events-none absolute left-0 bottom-full z-20 mb-1 w-64 max-h-56 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-2.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
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

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => aoClicarCard(item)}
                    onDoubleClick={() => aoClicarDuasVezes(item)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setModalDetalhes(item) }}
                    title="1 clique: detalhes · 2 cliques: editar"
                    className="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden group-hover:border-slate-300 dark:group-hover:border-slate-600 transition-colors"
                  >
                  <div className="p-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <p
                        className="text-[10px] font-bold uppercase leading-tight line-clamp-2 flex-1"
                        title={item.clienteNome}
                      >
                        <span className={item.atrasado ? 'text-red-600 dark:text-red-400' : (TEXTO_ETAPA[item.status] ?? 'text-slate-700 dark:text-slate-300')}>
                          {item.clienteNome || 'SEM CLIENTE'}
                        </span>
                      </p>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {!!item.anexos && (
                          <span
                            className="flex items-center text-slate-400 dark:text-slate-500"
                            title={`${item.anexos} anexo(s)`}
                            aria-label={`${item.anexos} anexo(s)`}
                          >
                            <Paperclip size={11} />
                          </span>
                        )}
                        {item.bugSistema === 'S' && (
                          <span className="flex items-center text-red-500" title="Bug do sistema" aria-label="Bug do sistema">
                            <Bug size={12} />
                          </span>
                        )}
                        {item.prioritario === 'S' && (
                          <AlertTriangle size={12} className="text-red-600 fill-red-100 dark:fill-red-950" aria-label="Prioritário / urgente" />
                        )}
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={(e) => abrirMenu(e, item.id)}
                        >
                          <MoreVertical size={12} className="text-slate-400" />
                        </button>
                      </div>
                    </div>

                    <p className={clsx(
                      'text-center text-sm font-bold my-0.5',
                      item.atrasado ? 'text-red-600 dark:text-red-400' : (TEXTO_ETAPA[item.status] ?? 'text-slate-700 dark:text-slate-300')
                    )}>
                      {item.id}
                    </p>
                    <p className={clsx(
                      'text-center text-[9px] font-medium -mt-0.5 mb-0.5 truncate',
                      item.atrasado ? 'text-red-600 dark:text-red-400' : (TEXTO_ETAPA[item.status] ?? 'text-slate-500 dark:text-slate-400')
                    )}>
                      {ROTULO_STATUS[item.status]}
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
                    {item.projetoNome && (
                      <p className="flex items-center justify-center gap-1 text-[9px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.projetoCor || '#64748b' }} />
                        {item.projetoNome}
                      </p>
                    )}
                  </div>

                  <div className={clsx(
                    'px-1.5 py-0.5 flex items-center justify-between text-[9px] font-bold uppercase',
                    CORES_ETAPA[item.status] ?? 'bg-slate-500 text-white'
                  )}>
                    <span className="truncate">
                      {item.tecnicoNome ?? '—'}
                      {item.desenvolvedorNome ? ` / ${item.desenvolvedorNome}` : ''}
                    </span>
                    <span className="flex-shrink-0 ml-1 opacity-90" title={ROTULO_STATUS[item.status]}>
                      {item.diasParado}
                    </span>
                  </div>
                  </div>

                  {/* Fora do card visual (que tem overflow-hidden pros cantos arredondados) pra não ser clipado */}
                  {menuAberto === item.id && (
                    <div
                      className={clsx(
                        'absolute z-30 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1',
                        menuPos.lado === 'dir' ? 'left-full ml-1' : 'right-full mr-1',
                        menuPos.ancorarEmbaixo ? 'bottom-0' : 'top-0'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {acoes.map((a, i) => (
                        <button
                          key={a.label}
                          type="button"
                          disabled={salvando}
                          onClick={() => { setMenuAberto(null); a.onClick() }}
                          className={clsx(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50',
                            (a as any).perigo
                              ? 'text-red-600 dark:text-red-400'
                              : (a as any).destaque
                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                : 'text-slate-700 dark:text-slate-300',
                            (a as any).destaque && i === 0 && 'border-b border-slate-100 dark:border-slate-700 mb-1 pb-2'
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
      <Modal isOpen={!!modalDetalhes} onClose={() => setModalDetalhes(null)} title={`Solicitação #${modalDetalhes?.id ?? ''}`} size="xl">
        {modalDetalhes && (
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{modalDetalhes.clienteNome}</p>
            </div>
            {modalDetalhes.projetoNome && (
              <div>
                <p className="text-slate-500">Projeto</p>
                <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: modalDetalhes.projetoCor || '#64748b' }} />
                  {modalDetalhes.projetoNome}
                </p>
              </div>
            )}
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
              <EtapaBadge status={modalDetalhes.status} />
            </div>
            <div>
              <p className="text-slate-500 mb-1">Reclamação</p>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                {modalDetalhes.observacoes?.trim() || '—'}
              </p>
            </div>

            <GaleriaAnexos registroId={modalDetalhes.id} />
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
        prefill={prefillIA}
        onClose={() => {
          setLancamento({ aberto: false, item: null })
          setPrefillIA(null)
        }}
        onSalvo={carregar}
      />

      {/* Histórico de auditoria — mesmo componente padrão usado em Agenda/Pipeline */}
      {auditoriaItem && (
        <AuditoriaTimeline
          tabela="atendimentos"
          registroId={auditoriaItem.id}
          titulo={`#${auditoriaItem.id} — ${auditoriaItem.clienteNome}`}
          onClose={() => setAuditoriaItem(null)}
        />
      )}

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

      {/* Marcar como Finalizado — atalho direto do menu do card */}
      <Modal isOpen={!!modalFinalizar} onClose={() => setModalFinalizar(null)} title={`Marcar como Finalizado — #${modalFinalizar?.id ?? ''}`}>
        <div className="space-y-3">
          <textarea
            className="input w-full h-28 resize-none"
            placeholder="Descreva o que foi feito para resolver... (opcional)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Marca a solicitação como concluída e carimba a data de finalização.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModalFinalizar(null)}>Voltar</button>
            <button
              className="btn-primary !bg-emerald-600 hover:!bg-emerald-700"
              disabled={salvando}
              onClick={async () => {
                const ok = await executar(
                  () => api.finalizarSolicitacao(modalFinalizar!.id, texto.trim()),
                  `Solicitação #${modalFinalizar!.id} finalizada`
                )
                if (ok) setModalFinalizar(null)
              }}
            >
              {salvando ? 'Finalizando...' : 'Confirmar finalização'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
