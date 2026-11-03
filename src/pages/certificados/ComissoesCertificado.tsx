import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Building2, Copy, Loader2, Pencil, Plus, Search, Trash2, Users, Wallet,
} from 'lucide-react'
import { api } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { useToast } from '../../components/ui/Toast'
import type {
  AgenteCertificado, ContadorComissaoCertificado, IndicacaoCertificado,
} from '../../types'

const brl = (v: number) =>
  `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataBR = (v?: string | null) => {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(v).toLocaleDateString('pt-BR')
}
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`
const hoje = () => new Date().toISOString().slice(0, 10)

type SubAba = 'gerenciador' | 'contadores' | 'agente'

type Rascunho = {
  id?: number
  clienteId: string
  clienteNome: string
  dataIndicacao: string
  valor: string
  percentual: string
  contadorId: string
  certificadoraId: string
  validadeCertificado: string
}

/**
 * Comissões de certificado digital — equivale ao "Gerenciador de comissões" do sistema
 * legado, nas mesmas tabelas. O percentual não é fixo: o histórico tem 10%, 25%, 40% e 50%,
 * então quem lança escolhe, e a tela mostra o valor resultante antes de gravar.
 */
export function ComissoesCertificado() {
  const { toast } = useToast()
  const [sub, setSub] = useState<SubAba>('gerenciador')
  const [inicio, setInicio] = useState(primeiroDoMes())
  const [fim, setFim] = useState(hoje())
  const [carregando, setCarregando] = useState(true)

  const [itens, setItens] = useState<IndicacaoCertificado[]>([])
  const [totais, setTotais] = useState({ valorOperacao: 0, valorComissao: 0, total: 0 })
  const [contadores, setContadores] = useState<ContadorComissaoCertificado[]>([])
  const [agentes, setAgentes] = useState<AgenteCertificado[]>([])

  const [busca, setBusca] = useState('')
  const [certificadoraId, setCertificadoraId] = useState('')
  const [certificadoras, setCertificadoras] = useState<Array<{ id: number; nome: string }>>([])
  const [listaContadores, setListaContadores] = useState<Array<{ id: number; nome: string }>>([])
  const [form, setForm] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)

  const consultar = useCallback(async () => {
    setCarregando(true)
    try {
      const [ind, porContador, ag] = await Promise.all([
        api.getIndicacoesCertificado({
          inicio, fim,
          busca: busca.trim() || undefined,
          certificadoraId: Number(certificadoraId) || undefined,
        }),
        api.getContadoresComissaoCertificado({ inicio, fim }),
        api.getAgentesCertificado({ inicio, fim }),
      ])
      setItens(ind.itens)
      setTotais({ valorOperacao: ind.valorOperacao, valorComissao: ind.valorComissao, total: ind.total })
      setContadores(porContador.itens)
      setAgentes(ag.itens)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível consultar o período.')
    } finally {
      setCarregando(false)
    }
  }, [inicio, fim, busca, certificadoraId, toast])

  useEffect(() => { void consultar() }, [])
  useEffect(() => {
    api.getCertificadoras().then(setCertificadoras).catch(() => {})
    api.getContadoresSelecao().then(setListaContadores).catch(() => {})
  }, [])

  function novo() {
    setForm({
      clienteId: '', clienteNome: '', dataIndicacao: hoje(), valor: '', percentual: '',
      contadorId: '', certificadoraId: certificadoras[0] ? String(certificadoras[0].id) : '',
      validadeCertificado: '',
    })
  }

  function editar(i: IndicacaoCertificado) {
    setForm({
      id: i.id,
      clienteId: String(i.clienteId ?? ''),
      clienteNome: i.clienteFantasia || i.cliente,
      dataIndicacao: String(i.dataIndicacao ?? '').slice(0, 10),
      valor: String(i.valor),
      percentual: String(i.percentual),
      contadorId: i.contadorId ? String(i.contadorId) : '',
      certificadoraId: i.certificadoraId ? String(i.certificadoraId) : '',
      validadeCertificado: String(i.validadeCertificado ?? '').slice(0, 10),
    })
  }

  async function salvar() {
    if (!form) return
    if (!form.id && !form.clienteId) { toast.error('Escolha o cliente.'); return }
    if (!form.dataIndicacao) { toast.error('Informe a data da indicação.'); return }
    if (!(Number(form.valor) > 0)) { toast.error('Informe o valor da operação.'); return }
    setSalvando(true)
    try {
      const dados = {
        dataIndicacao: form.dataIndicacao,
        valor: Number(form.valor),
        percentual: Number(form.percentual) || 0,
        contadorId: Number(form.contadorId) || 0,
        certificadoraId: Number(form.certificadoraId) || 0,
        validadeCertificado: form.validadeCertificado || undefined,
      }
      if (form.id) {
        await api.atualizarIndicacaoCertificado(form.id, dados)
        toast.success('Lançamento atualizado.')
      } else {
        const r = await api.criarIndicacaoCertificado({ ...dados, clienteId: Number(form.clienteId) })
        toast.success(`Lançamento criado. Comissão: ${brl(r.comissao)}`)
      }
      setForm(null)
      await consultar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(i: IndicacaoCertificado) {
    if (!confirm(
      `Excluir o lançamento #${i.id}?\n\nCliente: ${i.cliente}\nValor: ${brl(i.valor)}`
      + `\nComissão: ${brl(i.comissao)}`)) return
    try {
      await api.excluirIndicacaoCertificado(i.id)
      toast.success('Lançamento excluído.')
      await consultar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir.')
    }
  }

  const copiar = (texto: string | null) => {
    if (!texto) return
    void navigator.clipboard.writeText(texto).then(() => toast.success('Chave PIX copiada.'))
  }

  const comissaoPrevista = form
    ? (Number(form.valor) * (Number(form.percentual) || 0)) / 100
    : 0

  return (
    <div className="space-y-4">
      {/* Período e filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">De</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="input-field w-auto" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Até</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
            className="input-field w-auto" />
        </div>
        <select value={certificadoraId} onChange={(e) => setCertificadoraId(e.target.value)}
          className="input-field w-auto">
          <option value="">Todas as certificadoras</option>
          {certificadoras.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
        </select>
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente ou escritório..." className="input-field w-full pl-9" />
        </div>
        <Button size="sm" loading={carregando} onClick={() => void consultar()}>
          <Search className="w-3.5 h-3.5" /> Visualizar
        </Button>
        <Button size="sm" variant="secondary" onClick={novo}>
          <Plus className="w-3.5 h-3.5" /> Lançar indicação
        </Button>
      </div>

      {/* Totais do período — o rodapé do relatório antigo. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { rotulo: 'Lançamentos', valor: String(totais.total), cor: 'text-slate-900 dark:text-slate-100' },
          { rotulo: 'Valor operação', valor: brl(totais.valorOperacao), cor: 'text-slate-900 dark:text-slate-100' },
          { rotulo: 'Valor comissão', valor: brl(totais.valorComissao), cor: 'text-emerald-600 dark:text-emerald-400' },
        ].map((k) => (
          <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500">{k.rotulo}</p>
            <p className={clsx('text-2xl font-bold mt-0.5', k.cor)}>{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {([
          ['gerenciador', 'Gerenciador', Wallet],
          ['contadores', 'Qtd por contador', Building2],
          ['agente', 'Comissão agente', Users],
        ] as const).map(([id, rotulo, Icone]) => (
          <button key={id} onClick={() => setSub(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5',
              sub === id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200')}>
            <Icone className="w-3.5 h-3.5" /> {rotulo}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : sub === 'gerenciador' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Indicação</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Contabilidade</th>
                <th className="px-3 py-2.5 font-medium text-right">Operação</th>
                <th className="px-3 py-2.5 font-medium text-right">Comissão</th>
                <th className="px-3 py-2.5 font-medium text-right">%</th>
                <th className="px-3 py-2.5 font-medium">Certificadora</th>
                <th className="px-3 py-2.5 font-medium">Usuário</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {itens.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                  Nenhum lançamento no período.
                </td></tr>
              ) : itens.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-2.5 text-slate-500">{i.id}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {dataBR(i.dataIndicacao)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-slate-800 dark:text-slate-100 truncate max-w-[16rem]">
                      {i.clienteFantasia || i.cliente}
                    </span>
                    {i.clienteFantasia && i.cliente !== i.clienteFantasia && (
                      <span className="block text-[11px] text-slate-400 truncate max-w-[16rem]">{i.cliente}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.escritorio || i.contador ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-slate-700 dark:text-slate-200 truncate max-w-[12rem]">
                          {i.escritorio || i.contador}
                        </span>
                        {i.chavePix && (
                          <button onClick={() => copiar(i.chavePix)} title={`PIX: ${i.chavePix}`}
                            className="text-slate-400 hover:text-blue-500">
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {brl(i.valor)}
                  </td>
                  <td className={clsx('px-3 py-2.5 text-right whitespace-nowrap font-medium',
                    i.comissao > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                    {brl(i.comissao)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {i.percentual > 0 ? `${i.percentual}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[12rem]">
                    {i.certificadora || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{i.usuario || '—'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => editar(i)} title="Alterar"
                      className="text-slate-400 hover:text-blue-500 mr-2">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => void excluir(i)} title="Excluir lançamento"
                      className="text-slate-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sub === 'contadores' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-3 py-2.5 font-medium">Escritório</th>
                <th className="px-3 py-2.5 font-medium">Responsável</th>
                <th className="px-3 py-2.5 font-medium">Cidade</th>
                <th className="px-3 py-2.5 font-medium text-right">Indicações</th>
                <th className="px-3 py-2.5 font-medium text-right">Operação</th>
                <th className="px-3 py-2.5 font-medium text-right">Comissão</th>
                <th className="px-3 py-2.5 font-medium text-right">%</th>
                <th className="px-3 py-2.5 font-medium">PIX</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {contadores.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma indicação de contador no período.
                </td></tr>
              ) : contadores.map((c) => (
                <tr key={c.contadorId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-2.5 text-slate-800 dark:text-slate-100">
                    {c.escritorio || c.comercial || `Contador #${c.contadorId}`}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{c.responsavel || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{c.cidade || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800 dark:text-slate-100">
                    {c.indicacoes}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{brl(c.valor)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {brl(c.comissao)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{c.percentual}%</td>
                  <td className="px-3 py-2.5">
                    {c.chavePix ? (
                      <button onClick={() => copiar(c.chavePix)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        <Copy className="w-3 h-3" /> copiar
                      </button>
                    ) : <span className="text-slate-400 text-xs">sem chave</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            O percentual sobe com o volume da <strong>equipe</strong> na certificadora: 0% até 10
            certificados, 1% de 11 a 20, 2% de 21 a 30, 3% de 31 a 40, 4% de 41 a 50 e 5% acima de 51.
            Cada pessoa participa pela fatia que emitiu, com teto de 60% — o excedente é
            redistribuído entre todos.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-3 py-2.5 font-medium">Usuário</th>
                  <th className="px-3 py-2.5 font-medium">Certificadora</th>
                  <th className="px-3 py-2.5 font-medium text-right">Emitidos</th>
                  <th className="px-3 py-2.5 font-medium text-right">Equipe</th>
                  <th className="px-3 py-2.5 font-medium text-right">Faixa</th>
                  <th className="px-3 py-2.5 font-medium text-right">Fatia</th>
                  <th className="px-3 py-2.5 font-medium text-right">Base</th>
                  <th className="px-3 py-2.5 font-medium text-right">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {agentes.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Nenhum certificado com certificadora informada no período.
                  </td></tr>
                ) : agentes.map((a) => (
                  <tr key={`${a.certificadoraId}-${a.usuarioId}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-100">{a.usuario}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{a.certificadora || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{a.qtdIndividual}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{a.qtdEquipe}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{a.percentualAplicado}%</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {a.participacaoFinal}%
                      {a.participacaoInicial !== a.participacaoFinal && (
                        <span className="block text-[10px] text-slate-400">
                          antes do rateio: {a.participacaoInicial}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{brl(a.baseCalculo)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {brl(a.comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lançar / alterar indicação */}
      {form && (
        <Modal isOpen onClose={() => !salvando && setForm(null)}
          title={form.id ? `Alterar lançamento #${form.id}` : 'Lançar indicação de certificado'} size="md">
          <div className="space-y-4">
            {form.id ? (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{form.clienteNome}</span>
              </div>
            ) : (
              <ClienteSearch label="Cliente do certificado" required value={form.clienteId}
                onChange={(id, cliente) => setForm({
                  ...form, clienteId: id, clienteNome: cliente?.nome || cliente?.nomeRazao || '',
                })} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Data da indicação <span className="text-red-500">*</span>
                </label>
                <input type="date" className="input-field w-full" value={form.dataIndicacao}
                  onChange={(e) => setForm({ ...form, dataIndicacao: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Validade do certificado</label>
                <input type="date" className="input-field w-full" value={form.validadeCertificado}
                  onChange={(e) => setForm({ ...form, validadeCertificado: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Contabilidade que indicou</label>
                <select className="input-field w-full" value={form.contadorId}
                  onChange={(e) => setForm({ ...form, contadorId: e.target.value })}>
                  <option value="">Sem indicação</option>
                  {listaContadores.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Certificadora</label>
                <select className="input-field w-full" value={form.certificadoraId}
                  onChange={(e) => setForm({ ...form, certificadoraId: e.target.value })}>
                  <option value="">Não informada</option>
                  {certificadoras.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Valor da operação <span className="text-red-500">*</span>
                </label>
                <input type="number" step="0.01" min="0" className="input-field w-full" value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">% de comissão</label>
                <input type="number" step="1" min="0" max="100" className="input-field w-full"
                  value={form.percentual}
                  onChange={(e) => setForm({ ...form, percentual: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Comissão</label>
                <p className="h-10 flex items-center font-bold text-emerald-600 dark:text-emerald-400">
                  {brl(comissaoPrevista)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Sem contabilidade indicando, deixe o percentual em zero — foi assim na maior parte
              dos lançamentos do histórico.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
              <Button onClick={() => void salvar()} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                {form.id ? 'Salvar' : 'Lançar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
