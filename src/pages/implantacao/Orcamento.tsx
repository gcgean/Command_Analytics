import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, DollarSign, FileText, Search, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { ImplantacaoCliente, ImplantacaoPainel } from '../../types'

type HistoricoProposta = {
  id: number
  dataGeracao: string
  clienteNome: string
  valorTotal: number
  tipoGeracao: 'pdf' | 'pdf_email'
}

function normalizarBusca(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
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

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '')
  return Number(digits || '0') / 100
}

export function Orcamento() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const buscaRef = useRef<HTMLInputElement | null>(null)

  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [autocompleteAberto, setAutocompleteAberto] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<ImplantacaoCliente | null>(null)
  const [previewAberto, setPreviewAberto] = useState(false)
  const [historico, setHistorico] = useState<HistoricoProposta[]>([])
  const [paginaHistorico, setPaginaHistorico] = useState(1)

  const [form, setForm] = useState({
    valorPlano: 499.90,
    qtdCarros: 1,
    distanciaKm: 0,
    custoKm: 1.5,
    qtdTecnicos: 1,
    qtdHorasTreinamento: 8,
    custoHoraTecnica: 80,
    diasHospedagem: 0,
    custoHospedagem: 150,
    qtdAlimentacao: 0,
    custoAlimentacao: 45,
    valorMigracao: 0,
    desconto: 0,
  })

  useEffect(() => {
    async function carregarClientes() {
      setLoadingClientes(true)
      try {
        const data = await api.getImplantacaoPainel()
        setPainel(data)
      } catch {
        toast.error('Não foi possível carregar clientes para o orçamento.')
      } finally {
        setLoadingClientes(false)
      }
    }

    void carregarClientes()
  }, [toast])

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

  const setNumber = (k: string, v: number) => setForm((f) => ({ ...f, [k]: v }))

  const clientesFiltrados = useMemo(() => {
    const termo = normalizarBusca(buscaCliente)
    if (termo.length < 2) return []
    return (painel?.clientes || []).filter((cliente) => {
      const campos = [cliente.nomeFantasia, cliente.clienteNome, cliente.cnpj]
      return campos.some((campo) => normalizarBusca(campo).includes(termo))
    }).slice(0, 10)
  }, [buscaCliente, painel?.clientes])

  const custoDeslocamento = form.qtdCarros * form.distanciaKm * 2 * form.custoKm
  const custoTreinamento = form.qtdTecnicos * form.qtdHorasTreinamento * form.custoHoraTecnica
  const custoHospedagem = form.diasHospedagem * form.custoHospedagem * form.qtdTecnicos
  const custoAlimentacao = form.qtdAlimentacao * form.custoAlimentacao
  const subtotal = custoDeslocamento + custoTreinamento + custoHospedagem + custoAlimentacao + form.valorMigracao
  const descontoValor = subtotal * (form.desconto / 100)
  const total = subtotal - descontoValor

  const historicoPaginado = useMemo(() => {
    const inicio = (paginaHistorico - 1) * 5
    return historico.slice(inicio, inicio + 5)
  }, [historico, paginaHistorico])

  const totalPaginasHistorico = Math.max(1, Math.ceil(historico.length / 5))

  function selecionarCliente(cliente: ImplantacaoCliente) {
    setClienteSelecionado(cliente)
    setBuscaCliente(getNomeDestaque(cliente))
    setAutocompleteAberto(false)

    const valorPlanoCliente = Number((cliente as any).mensalidade ?? (cliente as any).valorPlano ?? NaN)
    if (Number.isFinite(valorPlanoCliente) && valorPlanoCliente > 0) {
      setNumber('valorPlano', valorPlanoCliente)
    }
  }

  function limparCliente() {
    setClienteSelecionado(null)
    setBuscaCliente('')
    setAutocompleteAberto(false)
  }

  function registrarGeracao(tipo: 'pdf' | 'pdf_email') {
    const novaEntrada: HistoricoProposta = {
      id: Date.now(),
      dataGeracao: new Date().toISOString(),
      clienteNome: clienteSelecionado ? getNomeDestaque(clienteSelecionado) : 'Orçamento sem cliente vinculado',
      valorTotal: total,
      tipoGeracao: tipo,
    }

    setHistorico((prev) => [novaEntrada, ...prev].slice(0, 30))
    setPaginaHistorico(1)
    setPreviewAberto(false)

    if (tipo === 'pdf') {
      toast.info('Preview confirmado. A integração real de PDF ainda não existe nesta API.')
    } else {
      toast.info('Preview confirmado. A integração real de PDF e e-mail ainda não existe nesta API.')
    }
  }

  const NumberField = ({ label, field, step = 1 }: { label: string; field: string; step?: number }) => (
    <div>
      <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={0}
        className="input-field"
        value={(form as Record<string, number>)[field]}
        onChange={(e) => setNumber(field, parseFloat(e.target.value) || 0)}
      />
    </div>
  )

  const MoneyField = ({ label, field }: { label: string; field: string }) => (
    <div>
      <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input-field"
        value={formatCurrency((form as Record<string, number>)[field])}
        onChange={(e) => setNumber(field, parseCurrencyInput(e.target.value))}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="text-blue-400" size={28} />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Implantação &gt; Orçamento</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Orçamento de Implantação</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">Calcule o custo total de implantação para um cliente</p>
          </div>
        </div>
        <button
          type="button"
          title="Atalhos: Ctrl+K busca de cliente | Ctrl+P Pipeline | Ctrl+D Dashboard"
          className="h-8 w-8 rounded-full border border-slate-300 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          ?
        </button>
      </div>

      <Card padding="sm">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cliente (opcional)</label>
          <div className="relative">
            <Input
              ref={buscaRef}
              icon={<Search className="w-3.5 h-3.5" />}
              value={buscaCliente}
              onFocus={() => setAutocompleteAberto(true)}
              onChange={(e) => {
                setBuscaCliente(e.target.value)
                setAutocompleteAberto(true)
              }}
              placeholder="Buscar cliente por fantasia, razão social ou CNPJ"
              className="h-8 text-xs"
            />
            {autocompleteAberto && buscaCliente.trim().length >= 2 && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {loadingClientes ? (
                  <div className="px-3 py-2 text-xs text-slate-500">Carregando clientes...</div>
                ) : clientesFiltrados.length === 0 ? (
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
                      <span className="text-xs text-slate-500">{getNomeSecundario(cliente) || 'Sem razão social'} — {cliente.cnpj || 'Sem CNPJ'}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {clienteSelecionado && (
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {getNomeDestaque(clienteSelecionado)}
              <button type="button" onClick={limparCliente} className="text-blue-700 dark:text-blue-300">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><DollarSign size={16} className="text-blue-400" /> Plano</h3>
            <MoneyField label="Valor do Plano" field="valorPlano" />
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Calculator size={16} className="text-blue-400" /> Deslocamento</h3>
            <div className="grid grid-cols-3 gap-4">
              <NumberField label="Qtd. Carros" field="qtdCarros" />
              <NumberField label="Distância (km)" field="distanciaKm" />
              <MoneyField label="Custo por km" field="custoKm" />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Calculator size={16} className="text-blue-400" /> Treinamento</h3>
            <div className="grid grid-cols-3 gap-4">
              <NumberField label="Qtd. Técnicos" field="qtdTecnicos" />
              <NumberField label="Horas de Treinamento" field="qtdHorasTreinamento" />
              <MoneyField label="Custo/hora técnica" field="custoHoraTecnica" />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Calculator size={16} className="text-blue-400" /> Hospedagem e Alimentação</h3>
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Dias de Hospedagem" field="diasHospedagem" />
              <MoneyField label="Custo/dia hospedagem" field="custoHospedagem" />
              <NumberField label="Qtd. Refeições" field="qtdAlimentacao" />
              <MoneyField label="Custo por refeição" field="custoAlimentacao" />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><FileText size={16} className="text-blue-400" /> Migração e Desconto</h3>
            <div className="grid grid-cols-2 gap-4">
              <MoneyField label="Valor da Migração" field="valorMigracao" />
              <NumberField label="Desconto (%)" field="desconto" step={0.5} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card sticky top-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><FileText size={16} className="text-blue-400" /> Resumo do Orçamento</h3>
            <div className="space-y-3">
              {[
                { label: 'Deslocamento', val: custoDeslocamento },
                { label: 'Treinamento', val: custoTreinamento },
                { label: 'Hospedagem', val: custoHospedagem },
                { label: 'Alimentação', val: custoAlimentacao },
                { label: 'Migração', val: form.valorMigracao },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatCurrency(item.val)}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                <span className="text-slate-800 dark:text-slate-200">{formatCurrency(subtotal)}</span>
              </div>
              {form.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">Desconto ({form.desconto}%)</span>
                  <span className="text-red-400">- {formatCurrency(descontoValor)}</span>
                </div>
              )}
              <div className="border-t border-blue-500 pt-3 flex justify-between">
                <span className="text-blue-300 font-semibold">TOTAL IMPLANTAÇÃO</span>
                <span className="text-blue-400 font-bold text-lg">{formatCurrency(total)}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Mensalidade do Plano</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(form.valorPlano)}/mês</span>
              </div>
            </div>
            <button className="btn-primary w-full mt-5 justify-center" onClick={() => setPreviewAberto(true)}>Gerar Proposta</button>
          </div>
        </div>
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Histórico de Propostas</p>
          <p className="text-xs text-slate-500 mt-1">Últimos 30 orçamentos gerados nesta sessão.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Data de Geração</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Valor Total</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {historicoPaginado.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(item.dataGeracao).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.clienteNome}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatCurrency(item.valorTotal)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => toast.info('Download de PDF depende de integração backend ainda não disponível.')}>Baixar PDF</Button>
                      <Button size="sm" variant="secondary" onClick={() => toast.info('Reenvio por e-mail depende de integração backend ainda não disponível.')}>Reenviar e-mail</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {historico.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={4}>Nenhuma proposta gerada ainda.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {historico.length > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-500">Página {paginaHistorico} de {totalPaginasHistorico}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={paginaHistorico <= 1} onClick={() => setPaginaHistorico((p) => Math.max(1, p - 1))}>Anterior</Button>
              <Button size="sm" variant="secondary" disabled={paginaHistorico >= totalPaginasHistorico} onClick={() => setPaginaHistorico((p) => Math.min(totalPaginasHistorico, p + 1))}>Próxima</Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Modal isOpen={previewAberto} onClose={() => setPreviewAberto(false)} title="Preview da Proposta" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{clienteSelecionado ? getNomeDestaque(clienteSelecionado) : 'Orçamento sem cliente vinculado'}</p>
            {clienteSelecionado && (
              <p className="mt-1 text-xs text-slate-500">{getNomeSecundario(clienteSelecionado) || 'Sem razão social'} • {clienteSelecionado.cnpj || 'Sem CNPJ'}</p>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Deslocamento</span><strong>{formatCurrency(custoDeslocamento)}</strong></div>
            <div className="flex justify-between"><span>Treinamento</span><strong>{formatCurrency(custoTreinamento)}</strong></div>
            <div className="flex justify-between"><span>Hospedagem</span><strong>{formatCurrency(custoHospedagem)}</strong></div>
            <div className="flex justify-between"><span>Alimentação</span><strong>{formatCurrency(custoAlimentacao)}</strong></div>
            <div className="flex justify-between"><span>Migração</span><strong>{formatCurrency(form.valorMigracao)}</strong></div>
            <div className="flex justify-between"><span>Desconto aplicado</span><strong>{form.desconto}% ({formatCurrency(descontoValor)})</strong></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700"><span>Mensalidade do plano</span><strong>{formatCurrency(form.valorPlano)}</strong></div>
            <div className="flex justify-between border-t border-blue-500 pt-2 text-base"><span className="font-semibold text-blue-600">TOTAL</span><strong className="text-blue-600">{formatCurrency(total)}</strong></div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPreviewAberto(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => registrarGeracao('pdf')}>Gerar PDF</Button>
            <Button onClick={() => registrarGeracao('pdf_email')}>Gerar PDF e enviar por e-mail</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
