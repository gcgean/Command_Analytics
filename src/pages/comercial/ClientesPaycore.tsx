import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  CreditCard, Loader2, RefreshCw, Search, AlertTriangle, Link2, Server,
  Plus, Pencil, Trash2, CheckCircle2, Package, Plug,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { ClientePaycore, ServidorPaycore, FaturamentoPaycore } from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatarDoc = (d?: string | null) => {
  const n = String(d ?? '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d ?? '—'
}

type FormServidor = { id: number | null; nome: string; baseUrl: string; apiKey: string; ativo: boolean }
const FORM_VAZIO: FormServidor = { id: null, nome: '', baseUrl: '', apiKey: '', ativo: true }

export function ClientesPaycore() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'clientes' | 'faturamento' | 'servidores'>('clientes')
  const [clientes, setClientes] = useState<ClientePaycore[]>([])
  const [servidores, setServidores] = useState<ServidorPaycore[]>([])
  const [faturamento, setFaturamento] = useState<FaturamentoPaycore | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroServidor, setFiltroServidor] = useState<number | ''>('')
  const [form, setForm] = useState<FormServidor | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Resultado do teste de conexão: mostra o que a API devolveu, campo por campo.
  const [teste, setTeste] = useState<{ servidor: string; ok: boolean; testes: Array<{ rota: string; status: number | string; total: number | null; campos: string[]; amostra: Record<string, unknown> | null; erro?: string }> } | null>(null)
  const [testando, setTestando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [cli, srv, fat] = await Promise.all([
        api.getClientesPaycore(filtroServidor ? { servidorId: Number(filtroServidor) } : undefined),
        api.getServidoresPaycore(),
        api.getFaturamentoPaycore().catch(() => null),
      ])
      setClientes(cli)
      setServidores(srv)
      setFaturamento(fat)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os dados do PayCore.')
    } finally {
      setCarregando(false)
    }
  }, [toast, filtroServidor])

  useEffect(() => { void carregar() }, [carregar])

  async function sincronizar(servidorId?: number) {
    setSincronizando(true)
    try {
      const r = await api.sincronizarPaycore(servidorId)
      for (const x of r.resultados) {
        if (x.erro) toast.error(`${x.servidor}: ${x.erro}`)
        else toast.success(`${x.servidor}: ${x.clientes} cliente(s), ${x.assinaturas} assinatura(s), ${x.pagamentos} pagamento(s).`)
      }
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao sincronizar.')
    } finally {
      setSincronizando(false)
    }
  }

  async function testarConexao(s: ServidorPaycore) {
    setTestando(s.id)
    setTeste(null)
    try {
      setTeste(await api.testarServidorPaycore(s.id))
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar a conexão.')
    } finally {
      setTestando(null)
    }
  }

  async function salvarServidor() {
    if (!form) return
    setSalvando(true)
    try {
      if (form.id) await api.atualizarServidorPaycore(form.id, form)
      else await api.criarServidorPaycore(form)
      toast.success(form.id ? 'Servidor atualizado!' : 'Servidor cadastrado!')
      setForm(null)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar o servidor.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluirServidor(s: ServidorPaycore) {
    if (!window.confirm(`Remover o servidor "${s.nome}"? Os dados já sincronizados continuam gravados.`)) return
    try {
      await api.excluirServidorPaycore(s.id)
      toast.success('Servidor removido.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível remover.')
    }
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter((c) =>
      `${c.razaoSocial ?? ''} ${c.nomeFantasia ?? ''} ${c.documento ?? ''} ${c.vendedorNome ?? ''} ${c.produtos ?? ''}`
        .toLowerCase().includes(termo))
  }, [clientes, busca])

  const totais = useMemo(() => ({
    clientes: clientes.length,
    faturado: clientes.reduce((s, c) => s + c.faturado, 0),
    semVendedor: clientes.filter((c) => !c.vendedorNome).length,
    semVinculo: clientes.filter((c) => !c.codCli).length,
  }), [clientes])

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><CreditCard size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Clientes PayCore</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Quem assina nas plataformas de cobrança. Sincroniza de hora em hora; base separada da nossa.
            </p>
          </div>
        </div>
        <Button variant="secondary" disabled={sincronizando} onClick={() => sincronizar()}>
          {sincronizando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...</>
            : <><RefreshCw className="w-4 h-4" /> Sincronizar agora</>}
        </Button>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          ['clientes', 'Clientes'],
          ['faturamento', 'Faturamento por produto'],
          ['servidores', `Servidores (${servidores.length})`],
        ] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}

      {/* ── Clientes ── */}
      {!carregando && aba === 'clientes' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { rotulo: 'Clientes', valor: String(totais.clientes), cor: 'text-slate-800 dark:text-slate-200' },
              { rotulo: 'Faturamento recebido', valor: brl(totais.faturado), cor: 'text-emerald-600 dark:text-emerald-400' },
              { rotulo: 'Sem vendedor identificado', valor: String(totais.semVendedor), cor: totais.semVendedor ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' },
              { rotulo: 'Sem cliente na nossa base', valor: String(totais.semVinculo), cor: totais.semVinculo ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' },
            ].map((k) => (
              <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-500">{k.rotulo}</p>
                <p className={clsx('text-xl font-bold', k.cor)}>{k.valor}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-full sm:w-96 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input-field pl-9" placeholder="Buscar por nome, CNPJ, vendedor ou produto..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className="input-field w-full sm:w-56" value={filtroServidor}
              onChange={(e) => setFiltroServidor(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todos os servidores</option>
              {servidores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>

          {clientes.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <CreditCard className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">Nenhum cliente sincronizado ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Cadastre os servidores na aba ao lado e clique em Sincronizar agora.</p>
              </div>
            </Card>
          ) : (
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr className="text-left text-slate-600 dark:text-slate-400">
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Servidor</th>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Nossa base</th>
                      <th className="px-4 py-3 text-right">Faturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c) => (
                      <tr key={`${c.servidorId}-${c.customerId}`} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-3">
                          <p className="text-slate-800 dark:text-slate-200">{c.nomeFantasia || c.razaoSocial || 'Sem nome'}</p>
                          <p className="text-xs text-slate-500">{formatarDoc(c.documento)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            <Server className="w-3 h-3" /> {c.servidorNome ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {c.produtos
                            ? <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5 text-slate-400" /> {c.produtos}</span>
                            : <span className="text-xs text-slate-400">sem assinatura</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.vendedorNome ? (
                            <>
                              <span className="text-slate-700 dark:text-slate-300">{c.vendedorNome}</span>
                              <span className="block text-[11px] text-slate-400">
                                {c.vendedorOrigem === 'precificacao' ? 'da precificação' : 'do CRM'}
                                {!c.vendedorId && ' · usuário não vinculado'}
                              </span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" /> não identificado
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.codCli
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Link2 className="w-3.5 h-3.5" /> cliente {c.codCli}</span>
                            : <span className="text-xs text-slate-400">sem vínculo</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(c.faturado)}</td>
                      </tr>
                    ))}
                    {filtrados.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>Nenhum cliente encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Faturamento ── */}
      {!carregando && aba === 'faturamento' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card padding="none">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Por produto e servidor</p>
              <p className="text-xs text-slate-500 mt-0.5">Total recebido: {brl(faturamento?.total ?? 0)}</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-3">Servidor</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Bruto</th>
                  <th className="px-4 py-3 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {(faturamento?.porProduto ?? []).map((l, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{l.servidor ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{l.produto}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(l.bruto)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{l.liquido ? brl(l.liquido) : '—'}</td>
                  </tr>
                ))}
                {(faturamento?.porProduto ?? []).length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={4}>Sem pagamentos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card padding="none">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Por vendedor</p>
              <p className="text-xs text-slate-500 mt-0.5">Vendedor identificado pelo documento, na precificação ou no CRM.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3 text-center">Pagamentos</th>
                  <th className="px-4 py-3 text-right">Bruto</th>
                </tr>
              </thead>
              <tbody>
                {(faturamento?.porVendedor ?? []).map((l, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                    <td className={clsx('px-4 py-3', l.vendedor === 'Não identificado' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200')}>
                      {l.vendedor}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">{l.pagamentos}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(l.bruto)}</td>
                  </tr>
                ))}
                {(faturamento?.porVendedor ?? []).length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={3}>Sem pagamentos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Servidores ── */}
      {!carregando && aba === 'servidores' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Cada instalação do PayCore é um servidor: Command System e Cilos têm bases e chaves diferentes.
            </p>
            <Button onClick={() => setForm(FORM_VAZIO)}><Plus className="w-4 h-4" /> Novo servidor</Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {servidores.map((s) => (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Server className="w-4 h-4 text-blue-500" /> {s.nome}
                      {!s.ativo && <span className="text-[11px] text-red-500">inativo</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{s.baseUrl}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                      onClick={() => setForm({ id: s.id, nome: s.nome, baseUrl: s.baseUrl, apiKey: '', ativo: s.ativo })}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"
                      onClick={() => excluirServidor(s)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">Clientes</p>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-200">{s.clientes}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">Produtos</p>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-200">{s.aplicacoes}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <p className="text-xs text-slate-500">
                    {s.temChave
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> chave configurada</span>
                      : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" /> sem chave — não sincroniza</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Última sincronização: {s.ultimaSync ? new Date(s.ultimaSync).toLocaleString('pt-BR') : 'nunca'}
                  </p>
                  {s.ultimoErro && <p className="text-xs text-red-500">Último erro: {s.ultimoErro}</p>}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="secondary" disabled={testando === s.id || !s.temChave}
                    onClick={() => testarConexao(s)}>
                    {testando === s.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testando...</>
                      : <><Plug className="w-3.5 h-3.5" /> Testar conexão</>}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={sincronizando || !s.temChave}
                    onClick={() => sincronizar(s.id)}>
                    <RefreshCw className="w-3.5 h-3.5" /> Sincronizar este
                  </Button>
                </div>
              </Card>
            ))}
            {servidores.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <Server className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">Nenhum servidor cadastrado.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={!!teste} onClose={() => setTeste(null)} title={`Teste de conexão — ${teste?.servidor ?? ''}`} size="lg">
        {teste && (
          <div className="space-y-3">
            <div className={clsx('rounded-lg p-3 text-sm',
              teste.ok ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400')}>
              {teste.ok ? 'Todas as rotas responderam. A sincronização pode rodar.' : 'Alguma rota falhou — veja abaixo.'}
            </div>
            {teste.testes.map((t) => (
              <div key={t.rota} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-700 dark:text-slate-300">{t.rota}</code>
                  <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full',
                    t.status === 200 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400')}>
                    {t.status}
                  </span>
                </div>
                {t.erro && <p className="text-xs text-red-500 mt-1">{t.erro}</p>}
                {t.total !== null && <p className="text-xs text-slate-500 mt-1">{t.total} registro(s) disponíveis</p>}
                {t.amostra && (
                  <pre className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 overflow-x-auto bg-slate-50 dark:bg-slate-900/40 p-2 rounded">
{JSON.stringify(t.amostra, null, 1)}
                  </pre>
                )}
                {t.campos.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">Campos: {t.campos.join(', ')}</p>
                )}
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Se algum campo esperado não aparecer na lista, me mande esta tela — o mapeamento se ajusta.
            </p>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Alterar servidor' : 'Novo servidor PayCore'}>
        {form && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Nome</label>
              <input className="input-field" placeholder="Ex.: Command System"
                value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">URL da API</label>
              <input className="input-field font-mono text-xs" placeholder="https://api-paycore.commandsystem.com.br"
                value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
              <p className="text-[11px] text-slate-400 mt-1">Sem o /api/v1 no fim — o sistema completa.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Chave de API</label>
              <input className="input-field" type="password" autoComplete="new-password"
                placeholder={form.id ? '•••••••• (deixe em branco para manter)' : 'pk_live_...'}
                value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
              <p className="text-[11px] text-slate-400 mt-1">A chave nunca é exibida de volta nesta tela.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="accent-blue-600" checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Sincronizar automaticamente (de hora em hora)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button disabled={salvando} onClick={salvarServidor}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
