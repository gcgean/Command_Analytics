import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Calculator, Car, GraduationCap, BedDouble, Database, Percent, FileText,
  Search, X, Mail, Printer, Send, Loader2, Building2, CheckCircle2, CalendarClock,
  ChevronLeft, ChevronRight, Check,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { ImplantacaoCliente, ImplantacaoPainel, PropostaOrcamento } from '../../types'

function normalizarBusca(value?: string | null) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const nomeDestaque = (c: ImplantacaoCliente) =>
  String(c.nomeFantasia || '').trim() || String(c.clienteNome || '').trim() || 'Cliente sem nome'

function nomeSecundario(c: ImplantacaoCliente) {
  const fantasia = String(c.nomeFantasia || '').trim()
  const razao = String(c.clienteNome || '').trim()
  if (!fantasia || !razao || fantasia.toLowerCase() === razao.toLowerCase()) return ''
  return razao
}

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Campos de dinheiro digitam em centavos: 15000 vira R$ 150,00. */
const parseMoeda = (value: string) => Number(value.replace(/\D/g, '') || '0') / 100

type Form = {
  valorPlano: number
  qtdCarros: number; distanciaKm: number; custoKm: number; idaEVolta: boolean
  qtdTecnicos: number; qtdHorasTreinamento: number; custoHoraTecnica: number
  diasHospedagem: number; custoHospedagem: number
  refeicoesPorDia: number; diasAlimentacao: number; custoAlimentacao: number
  valorMigracao: number; outrosCustos: number; outrosDescricao: string
  desconto: number; parcelas: number; validadeDias: number; observacoes: string
}

const FORM_INICIAL: Form = {
  valorPlano: 499.9,
  qtdCarros: 1, distanciaKm: 0, custoKm: 1.5, idaEVolta: true,
  qtdTecnicos: 1, qtdHorasTreinamento: 8, custoHoraTecnica: 80,
  diasHospedagem: 0, custoHospedagem: 150,
  refeicoesPorDia: 2, diasAlimentacao: 0, custoAlimentacao: 45,
  valorMigracao: 0, outrosCustos: 0, outrosDescricao: '',
  desconto: 0, parcelas: 1, validadeDias: 15, observacoes: '',
}

// Fora do componente de propósito: definidos dentro, eram recriados a cada tecla e o input perdia
// o foco no meio da digitação.
function CampoNumero({ label, valor, onChange, sufixo, step = 1, dica }: {
  label: string; valor: number; onChange: (v: number) => void; sufixo?: string; step?: number; dica?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <div className="relative">
        <input
          type="number" min={0} step={step} className="input-field pr-12"
          value={valor}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {sufixo && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{sufixo}</span>}
      </div>
      {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
    </div>
  )
}

function CampoMoeda({ label, valor, onChange, dica }: {
  label: string; valor: number; onChange: (v: number) => void; dica?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <input
        type="text" inputMode="numeric" className="input-field"
        value={brl(valor)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseMoeda(e.target.value))}
      />
      {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
    </div>
  )
}

const PASSOS = [
  { id: 0, titulo: 'Cliente e plano', icone: Building2, opcional: false },
  { id: 1, titulo: 'Deslocamento', icone: Car, opcional: true },
  { id: 2, titulo: 'Equipe e estadia', icone: GraduationCap, opcional: true },
  { id: 3, titulo: 'Extras', icone: Database, opcional: true },
  { id: 4, titulo: 'Condições', icone: Percent, opcional: true },
  { id: 5, titulo: 'Proposta', icone: FileText, opcional: false },
] as const

export function Orcamento() {
  const { toast } = useToast()
  const buscaRef = useRef<HTMLInputElement | null>(null)
  const topoRef = useRef<HTMLDivElement | null>(null)

  const [passo, setPasso] = useState(0)
  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [autocompleteAberto, setAutocompleteAberto] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [cliente, setCliente] = useState<ImplantacaoCliente | null>(null)
  const [form, setForm] = useState<Form>(FORM_INICIAL)
  const [emailDestino, setEmailDestino] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<PropostaOrcamento[]>([])

  const set = <K extends keyof Form>(campo: K, valor: Form[K]) => setForm((f) => ({ ...f, [campo]: valor }))

  useEffect(() => {
    setLoadingClientes(true)
    api.getImplantacaoPainel()
      .then(setPainel)
      .catch(() => toast.error('Não foi possível carregar a lista de clientes.'))
      .finally(() => setLoadingClientes(false))
  }, [toast])

  const carregarHistorico = useCallback(() => {
    api.getPropostas().then(setHistorico).catch(() => setHistorico([]))
  }, [])
  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  const irPara = (destino: number) => {
    setPasso(Math.max(0, Math.min(PASSOS.length - 1, destino)))
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const clientesFiltrados = useMemo(() => {
    const termo = normalizarBusca(buscaCliente)
    if (termo.length < 2) return []
    return (painel?.clientes || [])
      .filter((c) => [c.nomeFantasia, c.clienteNome, c.cnpj].some((campo) => normalizarBusca(campo).includes(termo)))
      .slice(0, 10)
  }, [buscaCliente, painel?.clientes])

  // ── Cálculos ────────────────────────────────────────────────────
  const viagens = form.idaEVolta ? 2 : 1
  const custoDeslocamento = form.qtdCarros * form.distanciaKm * viagens * form.custoKm
  const custoTreinamento = form.qtdTecnicos * form.qtdHorasTreinamento * form.custoHoraTecnica
  const custoHospedagem = form.diasHospedagem * form.custoHospedagem * form.qtdTecnicos
  const custoAlimentacao = form.diasAlimentacao * form.refeicoesPorDia * form.qtdTecnicos * form.custoAlimentacao
  const subtotal = custoDeslocamento + custoTreinamento + custoHospedagem + custoAlimentacao + form.valorMigracao + form.outrosCustos
  const descontoValor = subtotal * (form.desconto / 100)
  const total = Math.max(0, subtotal - descontoValor)
  const valorParcela = form.parcelas > 1 ? total / form.parcelas : total
  const primeiroAno = total + form.valorPlano * 12

  const itens = useMemo(() => ([
    {
      descricao: 'Deslocamento',
      detalhe: `${form.qtdCarros} carro(s) × ${form.distanciaKm} km${form.idaEVolta ? ' × 2 (ida e volta)' : ''} × ${brl(form.custoKm)}/km`,
      valor: custoDeslocamento,
    },
    {
      descricao: 'Treinamento',
      detalhe: `${form.qtdTecnicos} técnico(s) × ${form.qtdHorasTreinamento}h × ${brl(form.custoHoraTecnica)}/h`,
      valor: custoTreinamento,
    },
    {
      descricao: 'Hospedagem',
      detalhe: `${form.diasHospedagem} diária(s) × ${form.qtdTecnicos} técnico(s) × ${brl(form.custoHospedagem)}`,
      valor: custoHospedagem,
    },
    {
      descricao: 'Alimentação',
      detalhe: `${form.diasAlimentacao} dia(s) × ${form.refeicoesPorDia} refeição(ões) × ${form.qtdTecnicos} técnico(s) × ${brl(form.custoAlimentacao)}`,
      valor: custoAlimentacao,
    },
    { descricao: 'Migração de dados', valor: form.valorMigracao },
    { descricao: form.outrosDescricao.trim() || 'Outros custos', valor: form.outrosCustos },
  ]), [form, custoDeslocamento, custoTreinamento, custoHospedagem, custoAlimentacao])

  const resumoLinhas = itens.filter((i) => i.valor > 0)

  // Valor fechado em cada passo — mostrado no indicador, pra saber o que já foi preenchido.
  const valorDoPasso = (id: number) => {
    if (id === 1) return custoDeslocamento
    if (id === 2) return custoTreinamento + custoHospedagem + custoAlimentacao
    if (id === 3) return form.valorMigracao + form.outrosCustos
    return 0
  }

  function selecionarCliente(c: ImplantacaoCliente) {
    setCliente(c)
    setBuscaCliente(nomeDestaque(c))
    setAutocompleteAberto(false)
    setEmailDestino(String(c.email || '').trim())
    const plano = Number((c as any).mensalidade ?? (c as any).valorPlano ?? NaN)
    if (Number.isFinite(plano) && plano > 0) set('valorPlano', plano)
  }

  async function gerarProposta(enviarEmail: boolean) {
    if (enviarEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailDestino.trim())) {
      toast.error('Informe um e-mail válido para enviar a proposta.')
      return
    }
    setEnviando(true)
    try {
      const r = await api.salvarProposta({
        clienteId: cliente?.clienteId ?? null,
        clienteNome: cliente ? nomeDestaque(cliente) : '',
        valorPlano: form.valorPlano,
        subtotal, descontoPerc: form.desconto, total,
        parcelas: form.parcelas, validadeDias: form.validadeDias,
        observacoes: form.observacoes,
        itens: resumoLinhas,
        enviarPara: enviarEmail ? emailDestino.trim() : undefined,
      })
      if (enviarEmail && !r.emailEnviado) {
        toast.error(`Proposta salva, mas o e-mail não saiu: ${r.erroEmail || 'verifique a configuração de e-mail.'}`)
      } else if (enviarEmail) {
        toast.success(`Proposta enviada para ${emailDestino.trim()}.`)
      } else {
        toast.success('Proposta salva no histórico.')
      }
      carregarHistorico()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar a proposta.')
    } finally {
      setEnviando(false)
    }
  }

  async function reenviar(p: PropostaOrcamento) {
    const destino = window.prompt('Reenviar esta proposta para qual e-mail?', p.clienteEmail || '')
    if (!destino) return
    try {
      await api.reenviarProposta(p.id, destino.trim())
      toast.success(`Proposta reenviada para ${destino.trim()}.`)
      carregarHistorico()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível reenviar.')
    }
  }

  function limparTudo() {
    setForm(FORM_INICIAL); setCliente(null); setBuscaCliente(''); setEmailDestino(''); setPasso(0)
  }

  return (
    <div className="space-y-5 pb-10" ref={topoRef}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><Calculator size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Orçamento de Implantação</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Monte o custo passo a passo e envie a proposta.</p>
          </div>
        </div>
        <Button variant="secondary" onClick={limparTudo}>Começar de novo</Button>
      </div>

      {/* Indicador de passos — clicável, porque o comercial costuma voltar e ajustar um número. */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {PASSOS.map((p, i) => {
            const Icone = p.icone
            const atual = passo === p.id
            const concluido = passo > p.id
            const valor = valorDoPasso(p.id)
            return (
              <div key={p.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => irPara(p.id)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-xl transition-colors',
                    atual ? 'bg-blue-600 text-white'
                      : concluido ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  )}
                >
                  <span className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    atual ? 'bg-white/20' : concluido ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700'
                  )}>
                    {concluido ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap flex items-center gap-1.5">
                    <Icone size={14} /> {p.titulo}
                    {valor > 0 && (
                      <span className={clsx('text-[11px]', atual ? 'text-blue-100' : 'text-emerald-600 dark:text-emerald-400')}>
                        {brl(valor)}
                      </span>
                    )}
                  </span>
                </button>
                {i < PASSOS.length - 1 && <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 mx-0.5" />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 min-h-[320px]">

            {/* ── Passo 1: cliente e plano ── */}
            {passo === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Para quem é a proposta?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Escolher o cliente preenche o e-mail e a mensalidade automaticamente. Dá para seguir sem escolher.
                  </p>
                </div>
                <div className="relative">
                  <Input
                    ref={buscaRef}
                    icon={<Search className="w-3.5 h-3.5" />}
                    value={buscaCliente}
                    onFocus={() => setAutocompleteAberto(true)}
                    onChange={(e) => { setBuscaCliente(e.target.value); setAutocompleteAberto(true) }}
                    placeholder="Buscar por nome fantasia, razão social ou CNPJ"
                  />
                  {autocompleteAberto && buscaCliente.trim().length >= 2 && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {loadingClientes ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Carregando...</div>
                      ) : clientesFiltrados.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Nenhum cliente encontrado.</div>
                      ) : clientesFiltrados.map((c) => (
                        <button
                          key={c.clienteId}
                          type="button"
                          className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selecionarCliente(c)}
                        >
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nomeDestaque(c)}</span>
                          <span className="text-xs text-slate-500">{nomeSecundario(c) || 'Sem razão social'} — {c.cnpj || 'Sem CNPJ'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {cliente && (
                  <div className="rounded-xl border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{nomeDestaque(cliente)}</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {cliente.cnpj || 'Sem CNPJ'}
                        {cliente.cidade ? ` · ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : ''}
                        {cliente.email ? ` · ${cliente.email}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setCliente(null); setBuscaCliente(''); setEmailDestino('') }}
                      className="text-blue-700 dark:text-blue-300"><X className="h-4 w-4" /></button>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <CampoMoeda label="Mensalidade do plano" valor={form.valorPlano} onChange={(v) => set('valorPlano', v)}
                    dica="Não entra no custo de implantação." />
                  <div className="flex items-end">
                    <div className="w-full rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Receita no primeiro ano</p>
                      <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{brl(primeiroAno)}</p>
                      <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">12 mensalidades + implantação</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Passo 2: deslocamento ── */}
            {passo === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Quanto custa chegar até o cliente?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Se a implantação for remota, deixe a distância em zero e siga.</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CampoNumero label="Qtd. de carros" valor={form.qtdCarros} onChange={(v) => set('qtdCarros', v)} />
                  <CampoNumero label="Distância" valor={form.distanciaKm} onChange={(v) => set('distanciaKm', v)} sufixo="km" />
                  <CampoMoeda label="Custo por km" valor={form.custoKm} onChange={(v) => set('custoKm', v)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="accent-blue-600" checked={form.idaEVolta} onChange={(e) => set('idaEVolta', e.target.checked)} />
                  Contar ida e volta (dobra a distância)
                </label>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 text-sm">
                  <span className="text-slate-500">
                    {form.qtdCarros} × {form.distanciaKm} km{form.idaEVolta ? ' × 2' : ''} × {brl(form.custoKm)} =
                  </span>{' '}
                  <strong className="text-slate-800 dark:text-slate-200">{brl(custoDeslocamento)}</strong>
                </div>
              </div>
            )}

            {/* ── Passo 3: equipe e estadia ── */}
            {passo === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Quem vai e por quanto tempo?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    A quantidade de técnicos vale para o treinamento, a hospedagem e a alimentação.
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CampoNumero label="Qtd. de técnicos" valor={form.qtdTecnicos} onChange={(v) => set('qtdTecnicos', v)} />
                  <CampoNumero label="Horas de treinamento" valor={form.qtdHorasTreinamento} onChange={(v) => set('qtdHorasTreinamento', v)} sufixo="h" />
                  <CampoMoeda label="Custo por hora técnica" valor={form.custoHoraTecnica} onChange={(v) => set('custoHoraTecnica', v)} />
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <BedDouble size={15} className="text-blue-500" /> Estadia (só se a equipe dormir fora)
                  </p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <CampoNumero label="Diárias de hospedagem" valor={form.diasHospedagem} onChange={(v) => set('diasHospedagem', v)} />
                    <CampoMoeda label="Custo por diária" valor={form.custoHospedagem} onChange={(v) => set('custoHospedagem', v)} />
                    <div />
                    <CampoNumero label="Dias com alimentação" valor={form.diasAlimentacao} onChange={(v) => set('diasAlimentacao', v)} />
                    <CampoNumero label="Refeições por dia" valor={form.refeicoesPorDia} onChange={(v) => set('refeicoesPorDia', v)} dica="Por técnico." />
                    <CampoMoeda label="Custo por refeição" valor={form.custoAlimentacao} onChange={(v) => set('custoAlimentacao', v)} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { rotulo: 'Treinamento', valor: custoTreinamento },
                    { rotulo: 'Hospedagem', valor: custoHospedagem },
                    { rotulo: 'Alimentação', valor: custoAlimentacao },
                  ].map((x) => (
                    <div key={x.rotulo} className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                      <p className="text-[11px] text-slate-500">{x.rotulo}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{brl(x.valor)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Passo 4: extras ── */}
            {passo === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Tem algo além do padrão?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Migração de dados, equipamento, licença extra. Pode pular se não houver.</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CampoMoeda label="Migração de dados" valor={form.valorMigracao} onChange={(v) => set('valorMigracao', v)} />
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Descrição (outros)</label>
                    <input className="input-field" placeholder="Ex.: impressora, licença extra"
                      value={form.outrosDescricao} onChange={(e) => set('outrosDescricao', e.target.value)} />
                  </div>
                  <CampoMoeda label="Outros custos" valor={form.outrosCustos} onChange={(v) => set('outrosCustos', v)} />
                </div>
              </div>
            )}

            {/* ── Passo 5: condições ── */}
            {passo === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Como o cliente vai pagar?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">O desconto incide sobre a implantação, não sobre a mensalidade.</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CampoNumero label="Desconto" valor={form.desconto} onChange={(v) => set('desconto', Math.min(100, v))} sufixo="%" step={0.5}
                    dica={form.desconto > 0 ? `- ${brl(descontoValor)}` : undefined} />
                  <CampoNumero label="Parcelas da implantação" valor={form.parcelas} onChange={(v) => set('parcelas', Math.max(1, Math.round(v)))} sufixo="x"
                    dica={form.parcelas > 1 ? `${form.parcelas}× de ${brl(valorParcela)}` : 'À vista'} />
                  <CampoNumero label="Validade da proposta" valor={form.validadeDias} onChange={(v) => set('validadeDias', v)} sufixo="dias" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Observações (vão na proposta)</label>
                  <textarea className="input-field w-full h-24 resize-none"
                    placeholder="Ex.: valores de deslocamento válidos para a região de Limoeiro do Norte."
                    value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
                </div>
              </div>
            )}

            {/* ── Passo 6: proposta ── */}
            {passo === 5 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Confira e envie</h2>
                  <p className="text-xs text-slate-500 mt-0.5">É exatamente isto que o cliente vai receber.</p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {cliente ? nomeDestaque(cliente) : 'Proposta sem cliente vinculado'}
                      </p>
                      {cliente && (
                        <p className="text-xs text-slate-500">{nomeSecundario(cliente) || 'Sem razão social'} · {cliente.cnpj || 'Sem CNPJ'}</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 whitespace-nowrap">{new Date().toLocaleDateString('pt-BR')}</p>
                  </div>

                  <div className="space-y-2 text-sm">
                    {resumoLinhas.length === 0 && <p className="text-slate-500">Nenhum custo de implantação lançado.</p>}
                    {resumoLinhas.map((i) => (
                      <div key={i.descricao} className="flex justify-between gap-3">
                        <div>
                          <span className="text-slate-700 dark:text-slate-300">{i.descricao}</span>
                          {i.detalhe && <p className="text-[11px] text-slate-400">{i.detalhe}</p>}
                        </div>
                        <strong className="whitespace-nowrap">{brl(i.valor)}</strong>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                      <span>Subtotal</span><strong>{brl(subtotal)}</strong>
                    </div>
                    {form.desconto > 0 && (
                      <div className="flex justify-between text-red-500">
                        <span>Desconto ({form.desconto}%)</span><strong>- {brl(descontoValor)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between border-t-2 border-blue-500 pt-2 text-base">
                      <span className="font-semibold">TOTAL DA IMPLANTAÇÃO</span>
                      <strong className="text-blue-600">{brl(total)}</strong>
                    </div>
                    {form.parcelas > 1 && <p className="text-right text-xs text-slate-500">ou {form.parcelas}× de {brl(valorParcela)}</p>}
                    <div className="flex justify-between bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-2.5">
                      <span className="text-emerald-700 dark:text-emerald-400">Mensalidade do plano</span>
                      <strong className="text-emerald-700 dark:text-emerald-400">{brl(form.valorPlano)}/mês</strong>
                    </div>
                  </div>

                  {form.observacoes.trim() && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap border-t border-slate-200 dark:border-slate-700 pt-3">
                      {form.observacoes}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">Proposta válida por {form.validadeDias} dias.</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">E-mail do cliente</label>
                  <input className="input-field" type="email" placeholder="cliente@empresa.com.br"
                    value={emailDestino} onChange={(e) => setEmailDestino(e.target.value)} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={enviando} onClick={() => gerarProposta(true)}>
                    {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Mail className="w-4 h-4" /> Salvar e enviar por e-mail</>}
                  </Button>
                  <Button variant="secondary" disabled={enviando} onClick={() => gerarProposta(false)}>Só salvar</Button>
                  <Button variant="secondary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimir / PDF</Button>
                </div>
              </div>
            )}
          </div>

          {/* Navegação */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={passo === 0} onClick={() => irPara(passo - 1)}>
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
            <p className="text-xs text-slate-400">Passo {passo + 1} de {PASSOS.length}</p>
            {passo < PASSOS.length - 1 ? (
              <Button onClick={() => irPara(passo + 1)}>
                {PASSOS[passo].opcional && valorDoPasso(passo) === 0 ? 'Pular' : 'Continuar'} <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => irPara(0)}>Revisar do início</Button>
            )}
          </div>
        </div>

        {/* Resumo sempre visível */}
        <div className="lg:sticky lg:top-6">
          <div className="bg-white dark:bg-slate-800 border-2 border-blue-500/30 rounded-2xl overflow-hidden">
            <div className="bg-blue-600 text-white px-5 py-3 flex items-center gap-2">
              <FileText size={16} /> <span className="text-sm font-semibold">Resumo da proposta</span>
            </div>
            <div className="p-5 space-y-3">
              {resumoLinhas.length === 0 && (
                <p className="text-sm text-slate-500">Os custos aparecem aqui conforme você preenche os passos.</p>
              )}
              {resumoLinhas.map((i) => (
                <div key={i.descricao} className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{i.descricao}</span>
                  <span className="text-slate-800 dark:text-slate-200 whitespace-nowrap">{brl(i.valor)}</span>
                </div>
              ))}
              {resumoLinhas.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                  <span className="text-slate-800 dark:text-slate-200">{brl(subtotal)}</span>
                </div>
              )}
              {form.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-500">Desconto ({form.desconto}%)</span>
                  <span className="text-red-500">- {brl(descontoValor)}</span>
                </div>
              )}
              <div className="border-t-2 border-blue-500 pt-3 flex items-end justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{brl(total)}</span>
              </div>
              {form.parcelas > 1 && <p className="text-xs text-slate-500 text-right">ou {form.parcelas}× de {brl(valorParcela)}</p>}

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3 flex justify-between items-center">
                <span className="text-sm text-emerald-700 dark:text-emerald-400">Mensalidade</span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{brl(form.valorPlano)}/mês</span>
              </div>

              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> Válida por {form.validadeDias} dias
              </p>

              {passo < PASSOS.length - 1 && (
                <button className="btn-primary w-full justify-center mt-1" onClick={() => irPara(PASSOS.length - 1)}>
                  <Send size={15} /> Ir para a proposta
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Propostas geradas</p>
          <p className="text-xs text-slate-500 mt-1">Ficam gravadas no servidor — não se perdem ao fechar a tela.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Implantação</th>
                <th className="px-4 py-3 text-right">Mensalidade</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {historico.map((p) => (
                <tr key={p.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(p.criadoEm).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{p.clienteNome || 'Sem cliente vinculado'}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{brl(p.total)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(p.valorPlano)}</td>
                  <td className="px-4 py-3">
                    {p.emailEnviado
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> enviado</span>
                      : <span className="text-xs text-slate-400">não enviado</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => reenviar(p)}><Mail className="w-3.5 h-3.5" /> Enviar</Button>
                  </td>
                </tr>
              ))}
              {historico.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>Nenhuma proposta gerada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
