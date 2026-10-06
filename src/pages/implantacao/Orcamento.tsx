import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Calculator, Car, GraduationCap, Database, Percent, FileText, BedDouble,
  Search, X, Printer, Loader2, Building2, UserPlus, TrendingUp, AlertTriangle,
  ChevronLeft, ChevronRight, Check, Save, Wallet, Pencil, FilePlus2,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { ImplantacaoCliente, ImplantacaoPainel, PropostaOrcamento, MigracaoTabelada, ParametrosPrecificacao } from '../../types'

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
const pct = (v: number) => `${Number(v || 0).toFixed(1).replace('.', ',')}%`
const parseMoeda = (value: string) => Number(value.replace(/\D/g, '') || '0') / 100

type Form = {
  // custos de implantação (uma vez)
  qtdCarros: number; distanciaKm: number; custoKm: number; idaEVolta: boolean
  qtdTecnicos: number; horasTreinamento: number; custoHoraTecnica: number
  diasHospedagem: number; custoHospedagem: number
  refeicoesPorDia: number; diasAlimentacao: number; custoAlimentacao: number
  migracaoId: number | null; valorMigracao: number
  outrosCustos: number; outrosDescricao: string
  // precificação
  margemAlvo: number; impostosPerc: number; comissaoPerc: number
  precoImplantacao: number; mensalidade: number
  parcelas: number; observacoes: string
}

const FORM_INICIAL: Form = {
  qtdCarros: 1, distanciaKm: 0, custoKm: 1.5, idaEVolta: true,
  qtdTecnicos: 1, horasTreinamento: 8, custoHoraTecnica: 80,
  diasHospedagem: 0, custoHospedagem: 150,
  refeicoesPorDia: 2, diasAlimentacao: 0, custoAlimentacao: 45,
  migracaoId: null, valorMigracao: 0,
  outrosCustos: 0, outrosDescricao: '',
  margemAlvo: 30, impostosPerc: 6, comissaoPerc: 5,
  precoImplantacao: 0, mensalidade: 0,
  parcelas: 1, observacoes: '',
}

function CampoNumero({ label, valor, onChange, sufixo, step = 1, dica }: {
  label: string; valor: number; onChange: (v: number) => void; sufixo?: string; step?: number; dica?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <div className="relative">
        <input type="number" min={0} step={step} className="input-field pr-12" value={valor}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
        {sufixo && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{sufixo}</span>}
      </div>
      {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
    </div>
  )
}

function CampoMoeda({ label, valor, onChange, dica, destaque }: {
  label: string; valor: number; onChange: (v: number) => void; dica?: string; destaque?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <input type="text" inputMode="numeric"
        className={clsx('input-field', destaque && 'font-bold text-base border-blue-400 dark:border-blue-500')}
        value={brl(valor)} onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseMoeda(e.target.value))} />
      {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
    </div>
  )
}

function LinhaCusto({ rotulo, detalhe, valor }: { rotulo: string; detalhe?: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <div className="min-w-0">
        <span className="text-slate-700 dark:text-slate-300">{rotulo}</span>
        {detalhe && <p className="text-[11px] text-slate-400">{detalhe}</p>}
      </div>
      <span className="text-slate-800 dark:text-slate-200 whitespace-nowrap">{brl(valor)}</span>
    </div>
  )
}

const PASSOS = [
  { id: 0, titulo: 'Cliente', icone: Building2 },
  { id: 1, titulo: 'Custos da implantação', icone: Car },
  { id: 2, titulo: 'Precificação', icone: Percent },
  { id: 3, titulo: 'Resultado', icone: TrendingUp },
] as const

export function Orcamento() {
  const { toast } = useToast()
  const topoRef = useRef<HTMLDivElement | null>(null)

  const [passo, setPasso] = useState(0)
  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [autocompleteAberto, setAutocompleteAberto] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [cliente, setCliente] = useState<ImplantacaoCliente | null>(null)
  const [clienteAvulso, setClienteAvulso] = useState('')
  const [form, setForm] = useState<Form>(FORM_INICIAL)
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState<PropostaOrcamento[]>([])
  // Precificação aberta para edição — null é uma nova.
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [migracoes, setMigracoes] = useState<MigracaoTabelada[]>([])
  const [repasseMigracao, setRepasseMigracao] = useState(30)

  const set = <K extends keyof Form>(campo: K, valor: Form[K]) => setForm((f) => ({ ...f, [campo]: valor }))

  useEffect(() => {
    setLoadingClientes(true)
    api.getImplantacaoPainel().then(setPainel)
      .catch(() => toast.error('Não foi possível carregar a lista de clientes.'))
      .finally(() => setLoadingClientes(false))
  }, [toast])

  const carregarHistorico = useCallback(() => {
    api.getPropostas().then(setHistorico).catch(() => setHistorico([]))
  }, [])
  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  // Custos padrão vêm de Configurações > Precificação: o vendedor não precisa saber de cor.
  useEffect(() => {
    api.getParametrosPrecificacao()
      .then((p: ParametrosPrecificacao) => {
        setRepasseMigracao(p.migracaoRepassePerc ?? 30)
        setForm((f) => ({
          ...f,
          custoKm: p.custoKm, custoHoraTecnica: p.custoHoraTecnica,
          custoHospedagem: p.custoHospedagem, custoAlimentacao: p.custoAlimentacao,
          refeicoesPorDia: p.refeicoesDia, horasTreinamento: p.horasTreinamento,
          margemAlvo: p.margemAlvo, impostosPerc: p.impostosPerc, comissaoPerc: p.comissaoPerc,
        }))
      })
      .catch(() => {})
    api.getMigracoes().then(setMigracoes).catch(() => setMigracoes([]))
  }, [])

  const irPara = (destino: number) => {
    setPasso(Math.max(0, Math.min(PASSOS.length - 1, destino)))
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const clientesFiltrados = useMemo(() => {
    const termos = normalizarBusca(buscaCliente).split(/\s+/).filter((t) => t.length >= 2)
    if (!termos.length) return []
    // O painel traz uma linha por processo, então o mesmo cliente vinha repetido na busca.
    const porCliente = new Map<number, ImplantacaoCliente>()
    for (const c of painel?.clientes || []) if (!porCliente.has(c.clienteId)) porCliente.set(c.clienteId, c)
    return [...porCliente.values()].filter((c) => {
      const texto = normalizarBusca(`${c.nomeFantasia || ''} ${c.clienteNome || ''} ${c.cnpj || ''}`)
      return termos.every((t) => texto.includes(t))
    }).slice(0, 10)
  }, [buscaCliente, painel?.clientes])

  // ── Custo de implantação (gasto único) ──────────────────────────
  const viagens = form.idaEVolta ? 2 : 1
  const cDeslocamento = form.qtdCarros * form.distanciaKm * viagens * form.custoKm
  const cTreinamento = form.qtdTecnicos * form.horasTreinamento * form.custoHoraTecnica
  const cHospedagem = form.diasHospedagem * form.custoHospedagem * form.qtdTecnicos
  const cAlimentacao = form.diasAlimentacao * form.refeicoesPorDia * form.qtdTecnicos * form.custoAlimentacao
  // O que a migração custa para a empresa é o repasse ao parceiro que executa; o resto é margem.
  const cMigracao = form.valorMigracao * (repasseMigracao / 100)
  const custoSemMigracao = cDeslocamento + cTreinamento + cHospedagem + cAlimentacao + form.outrosCustos
  const custoImplantacao = custoSemMigracao + cMigracao
  const migracaoSelecionada = migracoes.find((m) => m.id === form.migracaoId) ?? null

  // ── Precificação ────────────────────────────────────────────────
  // Imposto e comissão incidem sobre o que é cobrado, não sobre o custo. Por isso o preço sai de
  // uma divisão (markup sobre a venda) e não de custo × (1 + margem) — essa conta, comum e errada,
  // entrega margem menor do que a pretendida.
  const cargaPerc = Math.min(99, form.impostosPerc + form.comissaoPerc + form.margemAlvo)
  const divisor = 1 - cargaPerc / 100
  // A migração já tem preço de tabela, então entra inteira no preço; o restante é que recebe margem.
  const sugestaoImplantacao = (divisor > 0 ? custoSemMigracao / divisor : 0) + form.valorMigracao

  // Preço em que a empresa não ganha nem perde (cobre custo + imposto + comissão).
  const divisorMinimo = 1 - (form.impostosPerc + form.comissaoPerc) / 100
  const minimoImplantacao = divisorMinimo > 0 ? custoImplantacao / divisorMinimo : custoImplantacao
  const custoMigracaoLabel = `${repasseMigracao}% de ${brl(form.valorMigracao)}`

  const precoImplantacao = form.precoImplantacao
  const mensalidade = form.mensalidade

  const deducoesImpl = precoImplantacao * (form.impostosPerc + form.comissaoPerc) / 100
  const lucroImplantacao = precoImplantacao - custoImplantacao - deducoesImpl
  const margemImplantacao = precoImplantacao > 0 ? (lucroImplantacao / precoImplantacao) * 100 : 0

  // A mensalidade é preço de tabela, então entra como receita — a tela não tenta adivinhar o custo
  // mensal de atender esse cliente.
  const receitaPrimeiroAno = precoImplantacao + mensalidade * 12
  // Implantação vendida abaixo do custo: em quantos meses de mensalidade a diferença volta.
  const paybackMeses = lucroImplantacao < 0 && mensalidade > 0 ? Math.abs(lucroImplantacao) / mensalidade : null
  const descontoMaxImpl = precoImplantacao > minimoImplantacao && precoImplantacao > 0
    ? ((precoImplantacao - minimoImplantacao) / precoImplantacao) * 100 : 0

  const prejuizoImpl = precoImplantacao > 0 && lucroImplantacao < 0
  const semPreco = precoImplantacao <= 0 && mensalidade <= 0

  const itensCusto = useMemo(() => ([
    { descricao: 'Deslocamento', detalhe: `${form.qtdCarros} carro(s) × ${form.distanciaKm} km${form.idaEVolta ? ' × 2' : ''} × ${brl(form.custoKm)}`, valor: cDeslocamento },
    { descricao: 'Treinamento', detalhe: `${form.qtdTecnicos} técnico(s) × ${form.horasTreinamento}h × ${brl(form.custoHoraTecnica)}`, valor: cTreinamento },
    { descricao: 'Hospedagem', detalhe: `${form.diasHospedagem} diária(s) × ${form.qtdTecnicos} técnico(s)`, valor: cHospedagem },
    { descricao: 'Alimentação', detalhe: `${form.diasAlimentacao} dia(s) × ${form.refeicoesPorDia} refeição(ões) × ${form.qtdTecnicos}`, valor: cAlimentacao },
    {
      descricao: 'Migração (repasse)',
      detalhe: migracaoSelecionada
        ? `${migracaoSelecionada.sistema} · ${migracaoSelecionada.tipo} — ${custoMigracaoLabel}`
        : custoMigracaoLabel,
      valor: cMigracao,
    },
    { descricao: form.outrosDescricao.trim() || 'Outros custos', valor: form.outrosCustos },
  ]), [form, cDeslocamento, cTreinamento, cHospedagem, cAlimentacao, cMigracao, migracaoSelecionada, custoMigracaoLabel])

  const custosLancados = itensCusto.filter((i) => i.valor > 0)

  function selecionarCliente(c: ImplantacaoCliente) {
    setCliente(c); setClienteAvulso(''); setBuscaCliente(nomeDestaque(c)); setAutocompleteAberto(false)
  }
  function usarNomeDigitado() {
    const nome = buscaCliente.trim()
    if (!nome) return
    setCliente(null); setClienteAvulso(nome); setAutocompleteAberto(false)
  }
  function limparCliente() {
    setCliente(null); setClienteAvulso(''); setBuscaCliente('')
  }
  const nomeCliente = cliente ? nomeDestaque(cliente) : clienteAvulso

  function abrirPrecificacao(p: PropostaOrcamento) {
    if (p.dados?.form) {
      setForm({ ...FORM_INICIAL, ...p.dados.form })
      setClienteAvulso(String(p.dados.clienteAvulso ?? ''))
      setBuscaCliente(String(p.dados.clienteNome ?? p.clienteNome ?? ''))
      const achado = (painel?.clientes || []).find((c) => c.clienteId === p.dados?.clienteId) ?? null
      setCliente(achado)
    } else {
      // Precificação salva antes de existir o formulário completo: traz o que dá.
      setForm((f) => ({ ...f, precoImplantacao: p.precoImplantacao ?? p.total, mensalidade: p.valorPlano }))
      setClienteAvulso(p.clienteNome ?? '')
      setBuscaCliente(p.clienteNome ?? '')
      setCliente(null)
      toast.info('Essa precificação é antiga e não guardou todos os campos — confira os custos.')
    }
    setEditandoId(p.id)
    irPara(0)
  }

  function novaPrecificacao() {
    setForm(FORM_INICIAL); limparCliente(); setEditandoId(null); setPasso(0)
  }

  function aplicarSugestoes() {
    set('precoImplantacao', Math.ceil(sugestaoImplantacao))
  }

  async function salvar() {
    setSalvando(true)
    try {
      const corpo = {
        clienteId: cliente?.clienteId ?? null,
        clienteNome: nomeCliente,
        valorPlano: mensalidade,
        subtotal: custoImplantacao,
        descontoPerc: 0,
        total: precoImplantacao,
        parcelas: form.parcelas,
        validadeDias: 15,
        observacoes: form.observacoes,
        itens: custosLancados,
        custoImplantacao, custoMensal: 0,
        precoImplantacao,
        lucroImplantacao, lucroMensal: 0,
        margemPerc: margemImplantacao,
        impostosPerc: form.impostosPerc,
        comissaoPerc: form.comissaoPerc,
        paybackMeses,
        // O formulário inteiro vai junto: é o que permite reabrir e continuar de onde parou.
        dados: { form, clienteAvulso, clienteId: cliente?.clienteId ?? null, clienteNome: nomeCliente },
      }

      if (editandoId) {
        await api.atualizarProposta(editandoId, corpo)
        toast.success(`Precificação #${editandoId} atualizada.`)
      } else {
        await api.salvarProposta(corpo)
        toast.success('Precificação salva no histórico.')
      }
      carregarHistorico()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const valorDoPasso = (id: number) => (id === 1 ? custoImplantacao : 0)

  /**
   * Enter anda pelos campos como o Tab — quem preenche orçamento vem do teclado numérico e não
   * quer trocar de mão a cada campo. No último campo do passo, Enter avança para o próximo passo.
   * Textarea fica de fora: ali Enter é quebra de linha.
   */
  function enterComoTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    const alvo = e.target as HTMLElement
    if (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'BUTTON') return
    if (alvo.getAttribute('data-enter-proprio') === 'true') return

    e.preventDefault()
    const campos = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('input:not([type="checkbox"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'),
    ).filter((el) => el.offsetParent !== null)

    const proximo = campos[campos.indexOf(alvo) + 1]
    if (proximo) {
      proximo.focus()
      if (proximo instanceof HTMLInputElement) proximo.select()
      return
    }
    // Acabaram os campos do passo: segue para o próximo.
    if (passo < PASSOS.length - 1) irPara(passo + 1)
  }

  return (
    <div className="space-y-5 pb-10" ref={topoRef}>
      {/* Documento de impressão — fica fora da tela e só aparece no papel (regras em index.css). */}
      <div className="so-impressao area-impressao">
        <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#000' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Precificação de Implantação</h1>
          <p style={{ fontSize: 11, color: '#475569', marginBottom: 14 }}>
            {nomeCliente || 'Sem cliente informado'} · emitido em {new Date().toLocaleString('pt-BR')}
          </p>

          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Custos apurados</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <tbody>
              {custosLancados.map((i) => (
                <tr key={i.descricao}>
                  <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
                    {i.descricao}
                    {i.detalhe && <div style={{ fontSize: 10, color: '#64748b' }}>{i.detalhe}</div>}
                  </td>
                  <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {brl(i.valor)}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '7px 0', fontWeight: 700 }}>Custo total da implantação</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700 }}>{brl(custoImplantacao)}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Preço e resultado</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>Preço da implantação</td>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                  {brl(precoImplantacao)}{form.parcelas > 1 ? ` (${form.parcelas}× de ${brl(precoImplantacao / form.parcelas)})` : ''}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>Mensalidade (tabela)</td>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{brl(mensalidade)}/mês</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0' }}>
                  Impostos e comissão ({pct(form.impostosPerc + form.comissaoPerc)})
                </td>
                <td style={{ padding: '5px 0', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>- {brl(deducoesImpl)}</td>
              </tr>
              <tr>
                <td style={{ padding: '7px 0', fontWeight: 700 }}>Lucro na implantação</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700 }}>
                  {brl(lucroImplantacao)} ({pct(margemImplantacao)})
                </td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0' }}>Receita no primeiro ano</td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>{brl(receitaPrimeiroAno)}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0' }}>Desconto máximo sem prejuízo</td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>{pct(descontoMaxImpl)} (mínimo {brl(minimoImplantacao)})</td>
              </tr>
            </tbody>
          </table>

          {form.observacoes.trim() && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Observações internas</p>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>{form.observacoes}</p>
            </>
          )}

          <p style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
            Documento interno de precificação — contém custo e margem. Não enviar ao cliente.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><Calculator size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Precificação de Implantação</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Levante o custo real e descubra o preço mínimo e o preço com lucro antes de negociar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editandoId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <Pencil className="w-3.5 h-3.5" /> Editando a precificação #{editandoId}
            </span>
          )}
          <Button variant="secondary" onClick={novaPrecificacao}>
            {editandoId ? <><FilePlus2 className="w-4 h-4" /> Nova precificação</> : 'Começar de novo'}
          </Button>
        </div>
      </div>

      {/* Passos */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {PASSOS.map((p, i) => {
            const Icone = p.icone
            const atual = passo === p.id
            const concluido = passo > p.id
            const valor = valorDoPasso(p.id)
            return (
              <div key={p.id} className="flex items-center">
                <button type="button" onClick={() => irPara(p.id)}
                  className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl transition-colors',
                    atual ? 'bg-blue-600 text-white'
                      : concluido ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700')}>
                  <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    atual ? 'bg-white/20' : concluido ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700')}>
                    {concluido ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap flex items-center gap-1.5">
                    <Icone size={14} /> {p.titulo}
                    {valor > 0 && (
                      <span className={clsx('text-[11px]', atual ? 'text-blue-100' : 'text-amber-600 dark:text-amber-400')}>
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
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 min-h-[340px]"
            onKeyDown={enterComoTab}
          >

            {/* ── 1. Cliente ── */}
            {passo === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Para qual cliente é a negociação?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Só para identificar a precificação no histórico. Pode ser um cliente do cadastro ou um nome novo.
                  </p>
                </div>
                <div className="relative">
                  <Input
                    icon={<Search className="w-3.5 h-3.5" />}
                    value={buscaCliente}
                    onFocus={() => setAutocompleteAberto(true)}
                    onChange={(e) => { setBuscaCliente(e.target.value); setAutocompleteAberto(true) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); usarNomeDigitado() } }}
                    placeholder="Digite o nome do cliente — cadastrado ou não"
                    data-enter-proprio="true"
                  />
                  {autocompleteAberto && buscaCliente.trim().length >= 2 && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {loadingClientes ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Carregando...</div>
                      ) : (
                        <>
                          {clientesFiltrados.map((c) => (
                            <button key={c.clienteId} type="button"
                              className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                              onMouseDown={(e) => e.preventDefault()} onClick={() => selecionarCliente(c)}>
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nomeDestaque(c)}</span>
                              <span className="text-xs text-slate-500">{nomeSecundario(c) || 'Sem razão social'} — {c.cnpj || 'Sem CNPJ'}</span>
                            </button>
                          ))}
                          <button type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-500/10"
                            onMouseDown={(e) => e.preventDefault()} onClick={usarNomeDigitado}>
                            <UserPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm text-slate-700 dark:text-slate-200">
                              Usar <strong>"{buscaCliente.trim()}"</strong> como cliente novo
                              {clientesFiltrados.length === 0 && (
                                <span className="block text-xs text-slate-500">Nenhum cadastro encontrado com esse nome.</span>
                              )}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {cliente && (
                  <div className="rounded-xl border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{nomeDestaque(cliente)}</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {cliente.cnpj || 'Sem CNPJ'}{cliente.cidade ? ` · ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={limparCliente} className="text-blue-700 dark:text-blue-300"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {clienteAvulso && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{clienteAvulso}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">Ainda não cadastrado — fica salvo só pelo nome.</p>
                    </div>
                    <button type="button" onClick={limparCliente} className="text-amber-700 dark:text-amber-300"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            )}

            {/* ── 2. Custos de implantação ── */}
            {passo === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">O que a implantação vai custar para a empresa?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gasto que acontece uma vez. Lance o custo real, não o que vai ser cobrado — o preço vem no passo 4.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Car size={15} className="text-blue-500" /> Deslocamento</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <CampoNumero label="Qtd. de carros" valor={form.qtdCarros} onChange={(v) => set('qtdCarros', v)} />
                    <CampoNumero label="Distância" valor={form.distanciaKm} onChange={(v) => set('distanciaKm', v)} sufixo="km" />
                    <CampoMoeda label="Custo por km" valor={form.custoKm} onChange={(v) => set('custoKm', v)} />
                  </div>
                  <label className="flex items-center gap-2 mt-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="accent-blue-600" checked={form.idaEVolta} onChange={(e) => set('idaEVolta', e.target.checked)} />
                    Ida e volta
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><GraduationCap size={15} className="text-blue-500" /> Equipe e treinamento</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <CampoNumero label="Qtd. de técnicos" valor={form.qtdTecnicos} onChange={(v) => set('qtdTecnicos', v)} />
                    <CampoNumero label="Horas de treinamento" valor={form.horasTreinamento} onChange={(v) => set('horasTreinamento', v)} sufixo="h" />
                    <CampoMoeda label="Custo da hora técnica" valor={form.custoHoraTecnica} onChange={(v) => set('custoHoraTecnica', v)}
                      dica="Salário + encargos ÷ horas trabalhadas." />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><BedDouble size={15} className="text-blue-500" /> Estadia</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <CampoNumero label="Diárias" valor={form.diasHospedagem} onChange={(v) => set('diasHospedagem', v)} />
                    <CampoMoeda label="Custo por diária" valor={form.custoHospedagem} onChange={(v) => set('custoHospedagem', v)} />
                    <div />
                    <CampoNumero label="Dias com alimentação" valor={form.diasAlimentacao} onChange={(v) => set('diasAlimentacao', v)} />
                    <CampoNumero label="Refeições por dia" valor={form.refeicoesPorDia} onChange={(v) => set('refeicoesPorDia', v)} dica="Por técnico." />
                    <CampoMoeda label="Custo por refeição" valor={form.custoAlimentacao} onChange={(v) => set('custoAlimentacao', v)} />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Database size={15} className="text-blue-500" /> Migração e extras</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Migração tabelada</label>
                      <select
                        className="input-field"
                        value={form.migracaoId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null
                          const escolhida = migracoes.find((m) => m.id === id)
                          set('migracaoId', id)
                          // Preenche o valor da tabela; o vendedor pode ajustar logo ao lado.
                          if (escolhida) set('valorMigracao', escolhida.valor)
                          if (!id) set('valorMigracao', 0)
                        }}
                      >
                        <option value="">Sem migração</option>
                        {migracoes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.sistema} — {m.tipo === 'basica' ? 'Básica' : m.tipo === 'media' ? 'Média' : 'Avançada'} ({brl(m.valor)})
                          </option>
                        ))}
                      </select>
                      {migracoes.length === 0 && (
                        <p className="text-[11px] text-amber-500 mt-1">
                          Nenhuma migração cadastrada — veja Comercial › Tabela de Migração.
                        </p>
                      )}
                    </div>
                    <CampoMoeda label="Valor cobrado da migração" valor={form.valorMigracao} onChange={(v) => set('valorMigracao', v)}
                      dica={form.valorMigracao > 0 ? `custo ${brl(cMigracao)} (${repasseMigracao}% de repasse)` : undefined} />
                    {migracaoSelecionada?.descricao && (
                      <div className="sm:col-span-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">O que esse nível inclui</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{migracaoSelecionada.descricao}</p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Descrição (outros)</label>
                      <input className="input-field" placeholder="Ex.: impressora, licença extra, hora extra"
                        value={form.outrosDescricao} onChange={(e) => set('outrosDescricao', e.target.value)} />
                    </div>
                    <CampoMoeda label="Outros custos" valor={form.outrosCustos} onChange={(v) => set('outrosCustos', v)} />
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 flex justify-between">
                  <span className="text-sm text-amber-800 dark:text-amber-300">Custo total da implantação</span>
                  <strong className="text-amber-800 dark:text-amber-300">{brl(custoImplantacao)}</strong>
                </div>
              </div>
            )}

            {/* ── 3. Precificação ── */}
            {passo === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Qual preço cobrar?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Imposto e comissão saem do valor cobrado, não do custo — por isso o preço sugerido não é custo + margem.
                  </p>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <CampoNumero label="Margem desejada" valor={form.margemAlvo} onChange={(v) => set('margemAlvo', Math.min(90, v))} sufixo="%" step={1} />
                  <CampoNumero label="Impostos" valor={form.impostosPerc} onChange={(v) => set('impostosPerc', Math.min(50, v))} sufixo="%" step={0.5}
                    dica="Simples/ISS sobre o faturamento." />
                  <CampoNumero label="Comissão do vendedor" valor={form.comissaoPerc} onChange={(v) => set('comissaoPerc', Math.min(50, v))} sufixo="%" step={0.5} />
                </div>

                <div className="rounded-xl border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Preço sugerido</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Cobre custo + {pct(form.impostosPerc)} de imposto + {pct(form.comissaoPerc)} de comissão e deixa {pct(form.margemAlvo)} de margem.
                      </p>
                    </div>
                    <Button size="sm" onClick={aplicarSugestoes}>Usar sugestão</Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white dark:bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Preço da implantação</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{brl(sugestaoImplantacao)}</p>
                    </div>
                    <div className="rounded-lg bg-white dark:bg-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Mínimo sem lucro</p>
                      <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{brl(minimoImplantacao)}</p>
                      <p className="text-[11px] text-slate-500">cobre custo, imposto e comissão</p>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <CampoMoeda label="Preço da implantação" valor={form.precoImplantacao} onChange={(v) => set('precoImplantacao', v)} destaque
                    dica={precoImplantacao > 0 ? `margem ${pct(margemImplantacao)}` : 'o que será cobrado do cliente'} />
                  <CampoMoeda label="Mensalidade (preço de tabela)" valor={form.mensalidade} onChange={(v) => set('mensalidade', v)} destaque
                    dica="Valor do plano contratado — entra como receita recorrente." />
                  <CampoNumero label="Parcelas da implantação" valor={form.parcelas} onChange={(v) => set('parcelas', Math.max(1, Math.round(v)))} sufixo="x"
                    dica={form.parcelas > 1 ? `${form.parcelas}× de ${brl(precoImplantacao / form.parcelas)}` : 'à vista'} />
                </div>

                {prejuizoImpl && (
                  <div className="flex gap-2 items-start rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300">
                      A implantação está abaixo do mínimo de {brl(minimoImplantacao)} — prejuízo de {brl(Math.abs(lucroImplantacao))}.
                      {mensalidade > 0 && paybackMeses !== null && <> A mensalidade cobre essa diferença em {paybackMeses.toFixed(1)} meses.</>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. Resultado ── */}
            {passo === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Esse negócio dá lucro?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Resultado já descontando custo, imposto e comissão.</p>
                </div>

                {semPreco ? (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                    Defina o preço da implantação e a mensalidade no passo anterior para ver o resultado.
                  </div>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className={clsx('rounded-xl border p-4',
                        lucroImplantacao >= 0 ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10'
                          : 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10')}>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Lucro na implantação</p>
                        <p className={clsx('text-2xl font-bold', lucroImplantacao >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                          {brl(lucroImplantacao)}
                        </p>
                        <p className="text-[11px] text-slate-500">margem {pct(margemImplantacao)} · custo {brl(custoImplantacao)}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                        <p className="text-xs text-slate-600 dark:text-slate-400">Mensalidade</p>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{brl(mensalidade)}</p>
                        <p className="text-[11px] text-slate-500">receita recorrente, preço de tabela</p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                        <p className="text-[11px] text-slate-500">Receita no 1º ano</p>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-200">{brl(receitaPrimeiroAno)}</p>
                        <p className="text-[11px] text-slate-400">implantação + 12 mensalidades</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                        <p className="text-[11px] text-slate-500">Retorno do prejuízo inicial</p>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                          {paybackMeses === null ? '—' : `${paybackMeses.toFixed(1)} meses`}
                        </p>
                        <p className="text-[11px] text-slate-400">em mensalidades</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                        <p className="text-[11px] text-slate-500">Desconto máximo na implantação</p>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-200">{pct(descontoMaxImpl)}</p>
                        <p className="text-[11px] text-slate-400">sem ficar no prejuízo</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Observações internas</label>
                      <textarea className="input-field w-full h-20 resize-none"
                        placeholder="Ex.: cliente aceita pagar a migração à parte; concorrente ofereceu R$ 300."
                        value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button disabled={salvando} onClick={salvar}>
                        {salvando
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                          : <><Save className="w-4 h-4" /> {editandoId ? `Salvar alterações (#${editandoId})` : 'Salvar precificação'}</>}
                      </Button>
                      <Button variant="secondary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimir</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={passo === 0} onClick={() => irPara(passo - 1)}>
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
            <p className="text-xs text-slate-400">Passo {passo + 1} de {PASSOS.length}</p>
            {passo < PASSOS.length - 1 ? (
              <Button onClick={() => irPara(passo + 1)}>Continuar <ChevronRight className="w-4 h-4" /></Button>
            ) : (
              <Button variant="secondary" onClick={() => irPara(0)}>Revisar do início</Button>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="bg-white dark:bg-slate-800 border-2 border-blue-500/30 rounded-2xl overflow-hidden">
            <div className="bg-blue-600 text-white px-5 py-3 flex items-center gap-2">
              <Wallet size={16} /> <span className="text-sm font-semibold">Custo × Preço</span>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Custo apurado</p>
              {custosLancados.length === 0 && <p className="text-sm text-slate-500">Nenhum custo lançado ainda.</p>}
              {custosLancados.map((i) => <LinhaCusto key={i.descricao} rotulo={i.descricao} valor={i.valor} />)}
              <div className="flex justify-between text-sm border-t border-slate-200 dark:border-slate-700 pt-2">
                <span className="text-slate-600 dark:text-slate-400">Implantação</span>
                <strong className="text-amber-600 dark:text-amber-400">{brl(custoImplantacao)}</strong>
              </div>

              <div className="border-t-2 border-blue-500 pt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preço definido</p>
                <div className="flex justify-between items-end">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Implantação</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{brl(precoImplantacao)}</span>
                </div>
                {form.parcelas > 1 && precoImplantacao > 0 && (
                  <p className="text-[11px] text-slate-400 text-right">{form.parcelas}× de {brl(precoImplantacao / form.parcelas)}</p>
                )}
                <div className="flex justify-between items-end">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Mensalidade</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{brl(mensalidade)}</span>
                </div>
              </div>

              {!semPreco && (
                <div className={clsx('rounded-lg p-3 space-y-1',
                  lucroImplantacao >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10')}>
                  <div className="flex justify-between text-sm">
                    <span className={lucroImplantacao >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      Lucro na implantação
                    </span>
                    <strong className={lucroImplantacao >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {brl(lucroImplantacao)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Margem</span>
                    <strong className={lucroImplantacao >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {pct(margemImplantacao)}
                    </strong>
                  </div>
                </div>
              )}

              {passo < PASSOS.length - 1 && (
                <button className="btn-primary w-full justify-center" onClick={() => irPara(PASSOS.length - 1)}>
                  <TrendingUp size={15} /> Ver resultado
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Precificações salvas</p>
          <p className="text-xs text-slate-500 mt-1">
            Ficam gravadas no servidor com o custo e a margem do momento — dá para conferir depois se o preço fechado deu lucro.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-right">Mensalidade</th>
                <th className="px-4 py-3 text-right">Margem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {historico.map((p) => (
                <tr key={p.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(p.criadoEm).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{p.clienteNome || 'Sem cliente'}</td>
                  <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">{brl(p.custoImplantacao ?? p.subtotal)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{brl(p.precoImplantacao ?? p.total)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(p.valorPlano)}</td>
                  <td className={clsx('px-4 py-3 text-right font-medium',
                    (p.margemPerc ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                    {p.margemPerc === undefined ? '—' : pct(p.margemPerc)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => abrirPrecificacao(p)}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
              {historico.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>Nenhuma precificação salva ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
