import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Building2, CheckCircle2, Clock, Loader2, Pencil, Plus, Search, Send, Trash2, Wallet,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { useToast } from '../../components/ui/Toast'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { Cancelamento } from '../../types'

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  aberto: { rotulo: 'A enviar', classe: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  aguardando_financeiro: { rotulo: 'Aguardando financeiro', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  concluido: { rotulo: 'Cancelado', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
}

const dataBR = (v?: string | null) => {
  if (!v) return '—'
  // Data pura (YYYY-MM-DD) não passa pelo fuso: new Date() a jogaria um dia para trás.
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(v).toLocaleDateString('pt-BR')
}
const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '—')
const hoje = () => new Date().toISOString().slice(0, 10)
const formatarDoc = (d?: string | null) => {
  const n = String(d ?? '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d || '—'
}

type Rascunho = {
  id?: number
  clienteId: string
  clienteNome: string
  dataSolicitacao: string
  operadora: string
  observacao: string
}

/**
 * Pedidos de cancelamento de integração. O pedido passa por duas mãos — quem atende
 * encaminha à operadora, o financeiro confirma a baixa — e a lista mostra em qual delas
 * cada um está parado.
 */
export function Cancelamentos() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const ehFinanceiro = can('cancelamento-financeiro')

  const [itens, setItens] = useState<Cancelamento[]>([])
  const [resumo, setResumo] = useState({ total: 0, abertos: 0, aguardandoFinanceiro: 0, concluidos: 0 })
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('pendente')
  const [operadoras, setOperadoras] = useState<string[]>([])
  const [form, setForm] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [marcando, setMarcando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.getCancelamentos({ situacao: situacao || undefined, busca: busca.trim() || undefined })
      setItens(r.itens)
      setResumo({ total: r.total, abertos: r.abertos, aguardandoFinanceiro: r.aguardandoFinanceiro, concluidos: r.concluidos })
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os cancelamentos.')
    } finally {
      setCarregando(false)
    }
  }, [situacao, busca, toast])

  useEffect(() => {
    const t = window.setTimeout(() => { void carregar() }, 300)
    return () => window.clearTimeout(t)
  }, [carregar])

  useEffect(() => { api.getOperadorasCancelamento().then(setOperadoras).catch(() => {}) }, [])

  function novo() {
    setForm({ clienteId: '', clienteNome: '', dataSolicitacao: hoje(), operadora: '', observacao: '' })
  }

  function editar(c: Cancelamento) {
    setForm({
      id: c.id,
      clienteId: String(c.clienteId ?? ''),
      clienteNome: c.clienteNome,
      dataSolicitacao: String(c.dataSolicitacao ?? '').slice(0, 10),
      operadora: c.operadora ?? '',
      observacao: c.observacao ?? '',
    })
  }

  async function salvar() {
    if (!form) return
    if (!form.id && !form.clienteId) { toast.error('Escolha o cliente.'); return }
    if (!form.dataSolicitacao) { toast.error('Informe a data da solicitação.'); return }
    setSalvando(true)
    try {
      if (form.id) {
        await api.atualizarCancelamento(form.id, {
          dataSolicitacao: form.dataSolicitacao,
          operadora: form.operadora.trim() || null,
          observacao: form.observacao.trim() || null,
        })
        toast.success('Pedido atualizado.')
      } else {
        await api.criarCancelamento({
          clienteId: Number(form.clienteId),
          dataSolicitacao: form.dataSolicitacao,
          operadora: form.operadora.trim() || undefined,
          observacao: form.observacao.trim() || undefined,
        })
        toast.success('Pedido de cancelamento registrado.')
      }
      setForm(null)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarOperadora(c: Cancelamento) {
    setMarcando(c.id)
    try {
      await api.marcarEnvioOperadora(c.id, !c.enviadoOperadora)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível marcar.')
    } finally {
      setMarcando(null)
    }
  }

  async function alternarFinanceiro(c: Cancelamento) {
    if (!c.canceladoFinanceiro && !confirm(
      `Confirmar que o cancelamento de ${c.clienteNome} foi baixado pelo financeiro?`)) return
    setMarcando(c.id)
    try {
      await api.marcarCancelamentoFinanceiro(c.id, !c.canceladoFinanceiro)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível marcar.')
    } finally {
      setMarcando(null)
    }
  }

  async function excluir(c: Cancelamento) {
    if (!confirm(`Excluir o pedido de cancelamento de ${c.clienteNome}?`)) return
    try {
      await api.excluirCancelamento(c.id)
      toast.success('Pedido excluído.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir.')
    }
  }

  const cartoes = [
    { rotulo: 'A enviar à operadora', valor: resumo.abertos, cor: 'text-amber-600 dark:text-amber-400', icone: Send },
    { rotulo: 'Aguardando financeiro', valor: resumo.aguardandoFinanceiro, cor: 'text-blue-600 dark:text-blue-400', icone: Wallet },
    { rotulo: 'Cancelados', valor: resumo.concluidos, cor: 'text-emerald-600 dark:text-emerald-400', icone: CheckCircle2 },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cartoes.map((k) => (
          <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">{k.rotulo}</p>
                <p className={clsx('text-2xl font-bold mt-0.5', k.valor > 0 ? k.cor : 'text-slate-400')}>{k.valor}</p>
              </div>
              <k.icone className={clsx('w-4 h-4 mt-1', k.cor)} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, CNPJ ou observação..."
            className="input-field w-full pl-9" />
        </div>
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="input-field">
          <option value="pendente">Em aberto</option>
          <option value="aberto">A enviar à operadora</option>
          <option value="aguardando_financeiro">Aguardando financeiro</option>
          <option value="concluido">Cancelados</option>
          <option value="">Todos</option>
        </select>
        <Button onClick={novo}><Plus className="w-4 h-4" /> Novo cancelamento</Button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : itens.length === 0 ? (
        <Card><p className="text-sm text-slate-500 py-6 text-center">Nenhum pedido de cancelamento nesse filtro.</p></Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Solicitado em</th>
                  <th className="px-3 py-2.5 font-medium">Operadora</th>
                  <th className="px-3 py-2.5 font-medium">Observação</th>
                  <th className="px-3 py-2.5 font-medium">Situação</th>
                  <th className="px-3 py-2.5 font-medium text-center">Enviado à operadora</th>
                  <th className="px-3 py-2.5 font-medium text-center">Baixa financeiro</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {itens.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-800 dark:text-slate-100 truncate max-w-[16rem]">
                        {c.clienteNome}
                      </span>
                      <span className="block text-[11px] text-slate-500">{formatarDoc(c.cnpj)}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {dataBR(c.dataSolicitacao)}
                      {c.criadoPor && <span className="block text-[11px] text-slate-400">por {c.criadoPor}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{c.operadora || '—'}</td>
                    <td className="px-3 py-3 text-slate-500 max-w-[18rem]">
                      <span className="block truncate" title={c.observacao ?? ''}>{c.observacao || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx('text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap', SITUACAO[c.situacao]?.classe)}>
                        {SITUACAO[c.situacao]?.rotulo ?? c.situacao}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer">
                        <input type="checkbox" checked={c.enviadoOperadora}
                          disabled={marcando === c.id}
                          onChange={() => void alternarOperadora(c)} />
                        {c.enviadoOperadora && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {dataHora(c.enviadoOperadoraEm)}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {/* Só o financeiro marca a baixa: é a confirmação de que a cobrança parou. */}
                      <label className={clsx('inline-flex flex-col items-center gap-0.5',
                        ehFinanceiro ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')}
                        title={ehFinanceiro ? '' : 'Só o financeiro pode confirmar'}>
                        <input type="checkbox" checked={c.canceladoFinanceiro}
                          disabled={!ehFinanceiro || marcando === c.id}
                          onChange={() => void alternarFinanceiro(c)} />
                        {c.canceladoFinanceiro && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {dataHora(c.canceladoFinanceiroEm)}
                            {c.canceladoFinanceiroPor ? ` · ${c.canceladoFinanceiroPor}` : ''}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button onClick={() => editar(c)} title="Editar"
                        className="text-slate-400 hover:text-blue-500 mr-2">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => void excluir(c)} title="Excluir"
                        className="text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form && (
        <Modal isOpen onClose={() => !salvando && setForm(null)}
          title={form.id ? 'Editar pedido de cancelamento' : 'Novo pedido de cancelamento'} size="md">
          <div className="space-y-4">
            {form.id ? (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{form.clienteNome}</span>
              </div>
            ) : (
              <ClienteSearch label="Cliente que pediu o cancelamento" required
                value={form.clienteId}
                onChange={(id, cliente) => setForm({
                  ...form, clienteId: id,
                  clienteNome: cliente?.nome || cliente?.nomeRazao || '',
                })} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Data da solicitação <span className="text-red-500">*</span>
                </label>
                <input type="date" className="input-field w-full" value={form.dataSolicitacao}
                  onChange={(e) => setForm({ ...form, dataSolicitacao: e.target.value })} />
                <p className="text-[11px] text-slate-400 mt-1">Quando o cliente pediu, não quando foi registrado.</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Operadora</label>
                <input list="operadoras-cancelamento" className="input-field w-full" value={form.operadora}
                  onChange={(e) => setForm({ ...form, operadora: e.target.value })}
                  placeholder="Opcional" />
                <datalist id="operadoras-cancelamento">
                  {operadoras.map((o) => <option key={o} value={o} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Observação</label>
              <textarea className="input-field w-full min-h-[6rem]" value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                placeholder="Motivo do cancelamento, combinados com o cliente, número do protocolo na operadora..." />
            </div>

            {!form.id && (
              <p className="text-xs text-slate-500 flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                O envio à operadora e a baixa do financeiro são marcados na lista, conforme acontecem.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
              <Button onClick={() => void salvar()} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                {form.id ? 'Salvar' : 'Registrar pedido'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
