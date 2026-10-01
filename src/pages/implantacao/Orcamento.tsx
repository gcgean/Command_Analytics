import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calculator, Car, GraduationCap, BedDouble, Database, Percent, FileText,
  Search, X, Mail, Printer, Send, Loader2, Building2, CheckCircle2, CalendarClock,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
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
function parseMoeda(value: string) {
  return Number(value.replace(/\D/g, '') || '0') / 100
}

type Form = {
  valorPlano: number
  qtdCarros: number
  distanciaKm: number
  custoKm: number
  idaEVolta: boolean
  qtdTecnicos: number
  qtdHorasTreinamento: number
  custoHoraTecnica: number
  diasHospedagem: number
  custoHospedagem: number
  refeicoesPorDia: number
  diasAlimentacao: number
  custoAlimentacao: number
  valorMigracao: number
  outrosCustos: number
  outrosDescricao: string
  desconto: number
  parcelas: number
  validadeDias: number
  observacoes: string
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
          type="number" min={0} step={step} className="input-field pr-10"
          value={valor}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {sufixo && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{sufixo}</span>}
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
        onChange={(e) => onChange(parseMoeda(e.target.value))}
      />
      {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
    </div>
  )
}

function Secao({ icone, titulo, descricao, total, children }: {
  icone: React.ReactNode; titulo: string; descricao?: string; total?: number; children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">{icone}</div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{titulo}</h3>
            {descricao && <p className="text-xs text-slate-500 mt-0.5">{descricao}</p>}
          </div>
        </div>
        {total !== undefined && (
          <span className={`text-sm font-bold whitespace-nowrap ${total > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
            {brl(total)}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export function Orcamento() {
  const { toast } = useToast()
  const buscaRef = useRef<HTMLInputElement | null>(null)

  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [autocompleteAberto, setAutocompleteAberto] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [cliente, setCliente] = useState<ImplantacaoCliente | null>(null)
  const [form, setForm] = useState<Form>(FORM_INICIAL)

  const [previewAberto, setPreviewAberto] = useState(false)
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
        itens: itens.filter((i) => i.valor > 0),
        enviarPara: enviarEmail ? emailDestino.trim() : undefined,
      })
      if (enviarEmail && !r.emailEnviado) {
        toast.error(`Proposta salva, mas o e-mail não saiu: ${r.erroEmail || 'verifique a configuração de e-mail.'}`)
      } else if (enviarEmail) {
        toast.success(`Proposta enviada para ${emailDestino.trim()}.`)
      } else {
        toast.success('Proposta salva no histórico.')
      }
      setPreviewAberto(false)
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

  const resumoLinhas = itens.filter((i) => i.valor > 0)

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><Calculator size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Orçamento de Implantação</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Calcule os custos e envie a proposta para o cliente.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => { setForm(FORM_INICIAL); setCliente(null); setBuscaCliente(''); setEmailDestino('') }}>
          Limpar
        </Button>
      </div>

      {/* Cliente */}
      <Card padding="sm">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Cliente (opcional)
          </label>
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
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {nomeDestaque(cliente)}
                <button type="button" onClick={() => { setCliente(null); setBuscaCliente(''); setEmailDestino('') }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
              {cliente.cidade && <span className="text-xs text-slate-500">{cliente.cidade}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
              {cliente.email && <span className="text-xs text-slate-500">{cliente.email}</span>}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Secao icone={<Database size={18} />} titulo="Plano contratado" descricao="Mensalidade que o cliente vai pagar — não entra no custo de implantação.">
            <div className="grid sm:grid-cols-2 gap-4">
              <CampoMoeda label="Mensalidade do plano" valor={form.valorPlano} onChange={(v) => set('valorPlano', v)} />
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Receita no primeiro ano (12 meses + implantação)</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{brl(primeiroAno)}</p>
                </div>
              </div>
            </div>
          </Secao>

          <Secao icone={<Car size={18} />} titulo="Deslocamento" total={custoDeslocamento}
            descricao={`${form.qtdCarros} carro(s) × ${form.distanciaKm} km${form.idaEVolta ? ' × 2 (ida e volta)' : ' (só ida)'} × ${brl(form.custoKm)}`}>
            <div className="grid sm:grid-cols-3 gap-4">
              <CampoNumero label="Qtd. de carros" valor={form.qtdCarros} onChange={(v) => set('qtdCarros', v)} />
              <CampoNumero label="Distância" valor={form.distanciaKm} onChange={(v) => set('distanciaKm', v)} sufixo="km" />
              <CampoMoeda label="Custo por km" valor={form.custoKm} onChange={(v) => set('custoKm', v)} />
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="accent-blue-600" checked={form.idaEVolta} onChange={(e) => set('idaEVolta', e.target.checked)} />
              Contar ida e volta (dobra a distância)
            </label>
          </Secao>

          <Secao icone={<GraduationCap size={18} />} titulo="Equipe e treinamento" total={custoTreinamento}
            descricao="A quantidade de técnicos também é usada na hospedagem e na alimentação.">
            <div className="grid sm:grid-cols-3 gap-4">
              <CampoNumero label="Qtd. de técnicos" valor={form.qtdTecnicos} onChange={(v) => set('qtdTecnicos', v)} />
              <CampoNumero label="Horas de treinamento" valor={form.qtdHorasTreinamento} onChange={(v) => set('qtdHorasTreinamento', v)} sufixo="h" />
              <CampoMoeda label="Custo por hora técnica" valor={form.custoHoraTecnica} onChange={(v) => set('custoHoraTecnica', v)} />
            </div>
          </Secao>

          <Secao icone={<BedDouble size={18} />} titulo="Hospedagem e alimentação" total={custoHospedagem + custoAlimentacao}
            descricao={`Hospedagem ${brl(custoHospedagem)} · Alimentação ${brl(custoAlimentacao)}`}>
            <div className="grid sm:grid-cols-2 gap-4">
              <CampoNumero label="Diárias de hospedagem" valor={form.diasHospedagem} onChange={(v) => set('diasHospedagem', v)}
                dica="Multiplicado pela quantidade de técnicos." />
              <CampoMoeda label="Custo por diária" valor={form.custoHospedagem} onChange={(v) => set('custoHospedagem', v)} />
              <CampoNumero label="Dias com alimentação" valor={form.diasAlimentacao} onChange={(v) => set('diasAlimentacao', v)} />
              <CampoNumero label="Refeições por dia" valor={form.refeicoesPorDia} onChange={(v) => set('refeicoesPorDia', v)}
                dica="Por técnico, por dia." />
              <CampoMoeda label="Custo por refeição" valor={form.custoAlimentacao} onChange={(v) => set('custoAlimentacao', v)} />
            </div>
          </Secao>

          <Secao icone={<Database size={18} />} titulo="Migração e outros custos" total={form.valorMigracao + form.outrosCustos}>
            <div className="grid sm:grid-cols-3 gap-4">
              <CampoMoeda label="Migração de dados" valor={form.valorMigracao} onChange={(v) => set('valorMigracao', v)} />
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Descrição (outros)</label>
                <input className="input-field" placeholder="Ex.: equipamento, licença extra"
                  value={form.outrosDescricao} onChange={(e) => set('outrosDescricao', e.target.value)} />
              </div>
              <CampoMoeda label="Outros custos" valor={form.outrosCustos} onChange={(v) => set('outrosCustos', v)} />
            </div>
          </Secao>

          <Secao icone={<Percent size={18} />} titulo="Condições comerciais"
            descricao="O desconto incide sobre a implantação, não sobre a mensalidade.">
            <div className="grid sm:grid-cols-3 gap-4">
              <CampoNumero label="Desconto" valor={form.desconto} onChange={(v) => set('desconto', Math.min(100, v))} sufixo="%" step={0.5}
                dica={form.desconto > 0 ? `- ${brl(descontoValor)}` : undefined} />
              <CampoNumero label="Parcelas da implantação" valor={form.parcelas} onChange={(v) => set('parcelas', Math.max(1, Math.round(v)))} sufixo="x"
                dica={form.parcelas > 1 ? `${form.parcelas}× de ${brl(valorParcela)}` : 'À vista'} />
              <CampoNumero label="Validade da proposta" valor={form.validadeDias} onChange={(v) => set('validadeDias', v)} sufixo="dias" />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Observações (vão na proposta)</label>
              <textarea className="input-field w-full h-20 resize-none"
                placeholder="Ex.: valores de deslocamento válidos para a região de Limoeiro do Norte."
                value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
            </div>
          </Secao>
        </div>

        {/* Resumo */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="bg-white dark:bg-slate-800 border-2 border-blue-500/30 rounded-2xl overflow-hidden">
            <div className="bg-blue-600 text-white px-5 py-3 flex items-center gap-2">
              <FileText size={16} /> <span className="text-sm font-semibold">Resumo da proposta</span>
            </div>
            <div className="p-5 space-y-3">
              {resumoLinhas.length === 0 && (
                <p className="text-sm text-slate-500">Preencha os custos ao lado para montar a proposta.</p>
              )}
              {resumoLinhas.map((i) => (
                <div key={i.descricao} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-slate-700 dark:text-slate-300">{i.descricao}</p>
                    {i.detalhe && <p className="text-[11px] text-slate-400 truncate">{i.detalhe}</p>}
                  </div>
                  <span className="text-slate-800 dark:text-slate-200 whitespace-nowrap">{brl(i.valor)}</span>
                </div>
              ))}

              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                <span className="text-slate-800 dark:text-slate-200">{brl(subtotal)}</span>
              </div>
              {form.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-500">Desconto ({form.desconto}%)</span>
                  <span className="text-red-500">- {brl(descontoValor)}</span>
                </div>
              )}
              <div className="border-t-2 border-blue-500 pt-3 flex items-end justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total da implantação</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{brl(total)}</span>
              </div>
              {form.parcelas > 1 && (
                <p className="text-xs text-slate-500 text-right">ou {form.parcelas}× de {brl(valorParcela)}</p>
              )}

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3 flex justify-between items-center">
                <span className="text-sm text-emerald-700 dark:text-emerald-400">Mensalidade</span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{brl(form.valorPlano)}/mês</span>
              </div>

              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> Proposta válida por {form.validadeDias} dias
              </p>

              <button className="btn-primary w-full justify-center mt-2" onClick={() => setPreviewAberto(true)}>
                <Send size={15} /> Gerar proposta
              </button>
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
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(p.criadoEm).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{p.clienteNome || 'Sem cliente vinculado'}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{brl(p.total)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(p.valorPlano)}</td>
                  <td className="px-4 py-3">
                    {p.emailEnviado ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> enviado
                      </span>
                    ) : <span className="text-xs text-slate-400">não enviado</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => reenviar(p)}>
                      <Mail className="w-3.5 h-3.5" /> Enviar
                    </Button>
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

      {/* Preview / envio */}
      <Modal isOpen={previewAberto} onClose={() => setPreviewAberto(false)} title="Proposta comercial" size="lg">
        <div className="space-y-4">
          <div id="proposta-impressao" className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {cliente ? nomeDestaque(cliente) : 'Proposta sem cliente vinculado'}
                </p>
                {cliente && (
                  <p className="text-xs text-slate-500">
                    {nomeSecundario(cliente) || 'Sem razão social'} · {cliente.cnpj || 'Sem CNPJ'}
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-500 whitespace-nowrap">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>

            <div className="space-y-2 text-sm">
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
              {form.parcelas > 1 && (
                <p className="text-right text-xs text-slate-500">ou {form.parcelas}× de {brl(valorParcela)}</p>
              )}
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
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
              Enviar para (e-mail do cliente)
            </label>
            <input className="input-field" type="email" placeholder="cliente@empresa.com.br"
              value={emailDestino} onChange={(e) => setEmailDestino(e.target.value)} />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setPreviewAberto(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
            <Button variant="secondary" disabled={enviando} onClick={() => gerarProposta(false)}>
              Só salvar
            </Button>
            <Button disabled={enviando} onClick={() => gerarProposta(true)}>
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Mail className="w-4 h-4" /> Salvar e enviar</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
