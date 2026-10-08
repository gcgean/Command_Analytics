import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Briefcase, Loader2, RefreshCw, Search, Save, Trophy, XCircle, Clock, Users, Radio,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { CanalCrm, ConfigCrm, NegocioCrm, VendedorCrm } from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v?: string | null) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : String(v)
}
const formatarDoc = (d?: string | null) => {
  const n = String(d ?? '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d ?? '—'
}

const SELO_STATUS: Record<string, { rotulo: string; classe: string; icone: typeof Trophy }> = {
  won: { rotulo: 'Ganho', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', icone: Trophy },
  lost: { rotulo: 'Perdido', classe: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400', icone: XCircle },
  in_progress: { rotulo: 'Em andamento', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400', icone: Clock },
}

export function CrmIntegracao() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'negocios' | 'vendedores' | 'canais' | 'config'>('negocios')
  const [config, setConfig] = useState<ConfigCrm | null>(null)
  const [negocios, setNegocios] = useState<NegocioCrm[]>([])
  const [vendedores, setVendedores] = useState<VendedorCrm[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')
  const [canais, setCanais] = useState<CanalCrm[]>([])
  const [form, setForm] = useState({ baseUrl: 'https://app.crm.cilos.com.br', email: '', senha: '', ativo: true })

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [cfg, neg, vend, cans] = await Promise.all([
        api.getConfigCrm(),
        api.getNegociosCrm({
          status: filtroStatus || undefined,
          vendedor: filtroVendedor || undefined,
          canal: filtroCanal || undefined,
          busca: busca.trim() || undefined,
        }).catch(() => []),
        api.getVendedoresCrm().catch(() => []),
        api.getCanaisCrm().catch(() => []),
      ])
      setConfig(cfg)
      setForm((f) => ({ ...f, baseUrl: cfg.baseUrl || f.baseUrl, email: cfg.email || '', ativo: cfg.ativo }))
      setNegocios(neg)
      setVendedores(vend)
      setCanais(cans)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os dados do CRM.')
    } finally {
      setCarregando(false)
    }
  }, [toast, filtroStatus, filtroVendedor, filtroCanal, busca])

  useEffect(() => { void carregar() }, [carregar])

  async function sincronizar(completa: boolean) {
    setSincronizando(true)
    try {
      const r = await api.sincronizarCrm(completa)
      if (r.erro) toast.error(r.erro)
      else toast.success(`${r.clientes} cliente(s), ${r.negocios} negócio(s) e ${r.itens} item(ns) sincronizados.`)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao sincronizar com o CRM.')
    } finally {
      setSincronizando(false)
    }
  }

  async function salvarConfig() {
    setSalvando(true)
    try {
      await api.salvarConfigCrm({ ...form, senha: form.senha.trim() || undefined })
      setForm((f) => ({ ...f, senha: '' }))
      toast.success('Configuração do CRM salva!')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const totalGanho = useMemo(() => vendedores.reduce((s, v) => s + v.valorGanho, 0), [vendedores])

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><Briefcase size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">CRM Cilos</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Negócios e vendedores sincronizados do CRM. É daqui que o sistema descobre de quem é cada cliente.
            </p>
          </div>
        </div>
        <Button variant="secondary" disabled={sincronizando} onClick={() => sincronizar(false)}>
          {sincronizando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...</>
            : <><RefreshCw className="w-4 h-4" /> Sincronizar agora</>}
        </Button>
      </div>

      {config && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { rotulo: 'Clientes no CRM', valor: String(config.totais.clientes) },
            { rotulo: 'Negócios', valor: String(config.totais.negocios) },
            { rotulo: 'Ganhos', valor: String(config.totais.ganhos) },
            { rotulo: 'Vendedores', valor: String(config.totais.vendedores) },
          ].map((k) => (
            <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500">{k.rotulo}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-200">{k.valor}</p>
            </div>
          ))}
        </div>
      )}

      {config?.ultimoErro && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
          Último erro: {config.ultimoErro}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['negocios', 'Negócios'], ['vendedores', 'Vendedores'], ['canais', 'Canais'], ['config', 'Configuração']] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}

      {!carregando && aba === 'negocios' && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="w-full sm:w-96 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input-field pl-9" placeholder="Buscar por cliente, título ou CNPJ..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className="input-field w-full sm:w-48" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="won">Ganhos</option>
              <option value="lost">Perdidos</option>
              <option value="in_progress">Em andamento</option>
            </select>
            <select className="input-field w-full sm:w-56" value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.vendedor} value={v.vendedor}>{v.vendedor} ({v.negocios})</option>
              ))}
            </select>
            <select className="input-field w-full sm:w-56" value={filtroCanal}
              onChange={(e) => setFiltroCanal(e.target.value)}>
              <option value="">Todos os canais</option>
              {canais.map((c) => (
                <option key={c.canal} value={c.canal === 'Sem canal' ? '__sem__' : c.canal}>
                  {c.canal} ({c.negocios})
                </option>
              ))}
            </select>
            {(filtroStatus || filtroVendedor || filtroCanal || busca) && (
              <button onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroVendedor(''); setFiltroCanal('') }}
                className="text-xs px-3 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                Limpar filtros
              </button>
            )}
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr className="text-left text-slate-600 dark:text-slate-400">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Negócio</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {negocios.map((n) => {
                    const selo = SELO_STATUS[n.status ?? ''] ?? null
                    const Icone = selo?.icone
                    return (
                      <tr key={n.id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-3">
                          <p className="text-slate-800 dark:text-slate-200">{n.leadNome || '—'}</p>
                          <p className="text-xs text-slate-500">{formatarDoc(n.documento)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {n.titulo}
                          {n.etapa && <span className="block text-[11px] text-slate-400">{n.etapa}</span>}
                        </td>
                        <td className="px-4 py-3">
                          {n.vendedorNome ? (
                            <button onClick={() => setFiltroVendedor(n.vendedorNome!)}
                              title={`Ver só os negócios de ${n.vendedorNome}`}
                              className="text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left">
                              {n.vendedorNome}
                            </button>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {n.canal ? (
                            <button onClick={() => setFiltroCanal(n.canal!)}
                              title={`Ver só os negócios do canal ${n.canal}`}
                              className="text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left">
                              {n.canal}
                            </button>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {selo && Icone ? (
                            <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium', selo.classe)}>
                              <Icone className="w-3 h-3" /> {selo.rotulo}
                            </span>
                          ) : <span className="text-xs text-slate-400">{n.status}</span>}
                          {n.motivoPerda && <span className="block text-[11px] text-slate-400 mt-0.5">{n.motivoPerda}</span>}
                          {n.motivoGanho && <span className="block text-[11px] text-slate-400 mt-0.5">{n.motivoGanho}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dataBR(n.finalizadoEm ?? n.data)}</td>
                        <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200">{brl(n.valor)}</td>
                      </tr>
                    )
                  })}
                  {negocios.length === 0 && (
                    <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                      Nenhum negócio sincronizado. Configure o acesso na aba Configuração.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {!carregando && aba === 'vendedores' && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4" /> Desempenho por vendedor
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Total ganho: {brl(totalGanho)}</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-center">Negócios</th>
                <th className="px-4 py-3 text-center">Ganhos</th>
                <th className="px-4 py-3 text-center">Perdidos</th>
                <th className="px-4 py-3 text-center">Aproveitamento</th>
                <th className="px-4 py-3 text-right">Valor ganho</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v) => {
                const fechados = v.ganhos + v.perdidos
                const taxa = fechados ? (v.ganhos / fechados) * 100 : null
                return (
                  <tr key={v.vendedor}
                    onClick={() => { setFiltroVendedor(v.vendedor); setAba('negocios') }}
                    title={`Ver os negócios de ${v.vendedor}`}
                    className="border-t border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{v.vendedor}</td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">{v.negocios}</td>
                    <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400">{v.ganhos}</td>
                    <td className="px-4 py-3 text-center text-red-500">{v.perdidos}</td>
                    <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                      {taxa === null ? '—' : `${taxa.toFixed(0)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{brl(v.valorGanho)}</td>
                  </tr>
                )
              })}
              {vendedores.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>Sem dados sincronizados.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!carregando && aba === 'canais' && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Radio className="w-4 h-4" /> Faturamento por canal de aquisição
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Soma dos negócios ganhos de cada canal. Clique na linha para ver os negócios dele.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-3 py-3 text-center">Negócios</th>
                  <th className="px-3 py-3 text-center">Ganhos</th>
                  <th className="px-3 py-3 text-center">Perdidos</th>
                  <th className="px-3 py-3 text-center">Conversão</th>
                  <th className="px-4 py-3 text-right">Ticket médio</th>
                  <th className="px-4 py-3 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {canais.map((c) => (
                  <tr key={c.canal}
                    onClick={() => { setFiltroCanal(c.canal === 'Sem canal' ? '__sem__' : c.canal); setAba('negocios') }}
                    className="border-t border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{c.canal}</td>
                    <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{c.negocios}</td>
                    <td className="px-3 py-3 text-center text-emerald-600 dark:text-emerald-400">{c.ganhos}</td>
                    <td className="px-3 py-3 text-center text-red-500">{c.perdidos || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      {c.conversao === null ? <span className="text-slate-400">—</span> : (
                        <span className={clsx(c.conversao >= 60 ? 'text-emerald-600 dark:text-emerald-400'
                          : c.conversao >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500')}>
                          {c.conversao.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                      {c.ganhos ? brl(c.ticketMedio) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{brl(c.faturamento)}</span>
                      <span className="block text-[11px] text-slate-400">{c.participacao.toFixed(1)}% do total</span>
                    </td>
                  </tr>
                ))}
                {canais.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>Sem dados sincronizados.</td></tr>
                )}
              </tbody>
              {canais.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-medium">
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Total</td>
                    <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">
                      {canais.reduce((s, c) => s + c.negocios, 0)}
                    </td>
                    <td className="px-3 py-3 text-center text-emerald-600 dark:text-emerald-400">
                      {canais.reduce((s, c) => s + c.ganhos, 0)}
                    </td>
                    <td className="px-3 py-3 text-center text-red-500">
                      {canais.reduce((s, c) => s + c.perdidos, 0)}
                    </td>
                    <td /><td />
                    <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200">
                      {brl(canais.reduce((s, c) => s + c.faturamento, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {!carregando && aba === 'config' && (
        <div className="max-w-2xl space-y-4">
          <Card>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Acesso ao CRM</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Use um <strong>usuário exclusivo da integração</strong>. O CRM mantém uma sessão por usuário: se
                  alguém entrar no CRM com a mesma conta, a sincronização para até o próximo ciclo.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">URL do CRM</label>
                <input className="input-field font-mono text-xs" value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">E-mail do usuário</label>
                  <input className="input-field" type="email" placeholder="integracao@suaempresa.com.br"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Senha</label>
                  <input className="input-field" type="password" autoComplete="new-password"
                    placeholder={config?.temSenha ? '•••••••• (já configurada)' : 'senha do usuário'}
                    value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                  <p className="text-[11px] text-slate-400 mt-1">Em branco mantém a atual.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" className="accent-blue-600" checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Sincronizar automaticamente (de hora em hora)
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                  <p className="text-[11px]">Empresa (companyId)</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{config?.companyId ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
                  <p className="text-[11px]">Última sincronização</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {config?.ultimaSync ? new Date(config.ultimaSync).toLocaleString('pt-BR') : 'nunca'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={salvando} onClick={salvarConfig}>
                  {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar</>}
                </Button>
                <Button variant="secondary" disabled={sincronizando} onClick={() => sincronizar(true)}>
                  <RefreshCw className="w-4 h-4" /> Carga completa (histórico inteiro)
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">
                A carga completa puxa todo o histórico e é mais pesada — use na primeira vez. Depois, a rotina
                sincroniza só os últimos 60 dias a cada hora.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
