import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { CreditCard, Loader2, RefreshCcw, Eye, UserX, Users, PhoneCall, Search } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import type { Operadora, MaquininhasRelatorio, TipoMaquininha, StatusMaquininha, ClienteSemMaquininha } from '../../types'

const STATUS_LABEL: Record<StatusMaquininha, string> = {
  NAO_INTEGRADO: 'Não integrado',
  EM_IMPLANTACAO: 'Em implantação',
  INTEGRADO: 'Integrado',
}

const STATUS_CLASSES: Record<string, string> = {
  NAO_INTEGRADO: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  EM_IMPLANTACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  INTEGRADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

type Aba = 'visao-geral' | 'sem-contato'

export function RelatorioMaquininhas() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const isDarkMode = document.documentElement.classList.contains('dark')

  const [aba, setAba] = useState<Aba>('visao-geral')
  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [filtros, setFiltros] = useState<{ operadoraId: string; tipo: string; statusIntegracao: string }>({
    operadoraId: '', tipo: '', statusIntegracao: '',
  })
  const [dados, setDados] = useState<MaquininhasRelatorio | null>(null)
  const [loading, setLoading] = useState(true)

  // Aba "sem contato"
  const [semContato, setSemContato] = useState<ClienteSemMaquininha[]>([])
  const [semContatoTotal, setSemContatoTotal] = useState(0)
  const [semContatoPage, setSemContatoPage] = useState(1)
  const [semContatoBusca, setSemContatoBusca] = useState('')
  const [semContatoLoading, setSemContatoLoading] = useState(false)
  const PAGE_SIZE = 30

  useEffect(() => {
    api.getOperadoras().then(setOperadoras).catch(() => {})
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.getMaquininhasRelatorio({
        operadoraId: filtros.operadoraId ? Number(filtros.operadoraId) : undefined,
        tipo: (filtros.tipo || undefined) as TipoMaquininha | undefined,
        statusIntegracao: (filtros.statusIntegracao || undefined) as StatusMaquininha | undefined,
      })
      setDados(data)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar o relatório.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros])

  async function carregarSemContato(page = semContatoPage) {
    setSemContatoLoading(true)
    try {
      const data = await api.getClientesSemMaquininha({ search: semContatoBusca || undefined, page, pageSize: PAGE_SIZE })
      setSemContato(data.clientes)
      setSemContatoTotal(data.paginacao.total)
      setSemContatoPage(data.paginacao.page)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar a lista.')
    } finally {
      setSemContatoLoading(false)
    }
  }

  useEffect(() => {
    if (aba === 'sem-contato') carregarSemContato(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  function irParaColetadosNaoIntegrados() {
    setAba('visao-geral')
    setFiltros((f) => ({ ...f, statusIntegracao: 'NAO_INTEGRADO' }))
  }

  const totalPaginasSemContato = Math.max(1, Math.ceil(semContatoTotal / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 rounded-lg">
          <CreditCard className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Relatório de Maquininhas</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Maquininhas de cartão por cliente, operadora e status de integração com o sistema.</p>
        </div>
      </div>

      {/* Cobertura: quem já foi contatado / cadastrado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Clientes ativos
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.resumoCobertura.totalAtivos ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5" /> Já cadastrados (contato feito)
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{dados?.resumoCobertura.comCadastro ?? 0}</p>
        </Card>
        <button
          onClick={() => setAba('sem-contato')}
          className={clsx(
            'text-left rounded-xl border p-4 sm:p-6 transition-colors',
            aba === 'sem-contato'
              ? 'border-rose-400 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-500/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-rose-300 dark:hover:border-rose-500/40'
          )}
        >
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide flex items-center gap-1">
            <UserX className="w-3.5 h-3.5" /> Nunca contatados
          </p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{dados?.resumoCobertura.semCadastro ?? 0}</p>
          <p className="text-[11px] text-slate-500 mt-1">Clique para ver a lista</p>
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setAba('visao-geral')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            aba === 'visao-geral' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Visão geral
        </button>
        <button
          onClick={() => setAba('sem-contato')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            aba === 'sem-contato' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Nunca contatados ({dados?.resumoCobertura.semCadastro ?? 0})
        </button>
      </div>

      {aba === 'sem-contato' ? (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Clientes ativos sem nenhuma maquininha cadastrada</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ainda não houve contato para levantar as maquininhas desses clientes.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={semContatoBusca}
                  onChange={(e) => setSemContatoBusca(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && carregarSemContato(1)}
                  placeholder="Buscar cliente ou CNPJ"
                  className="h-9 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-56"
                />
              </div>
              <Button size="sm" variant="secondary" icon={<RefreshCcw className="w-3.5 h-3.5" />} onClick={() => carregarSemContato(1)}>Buscar</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  {['Cliente', 'CNPJ', 'Cidade', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semContatoLoading ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                ) : semContato.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500">Nenhum cliente pendente — todos já têm maquininha cadastrada 🎉</td></tr>
                ) : (
                  semContato.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{c.nomeFantasia || c.razaoSocial || c.nome}</p>
                        {c.razaoSocial && c.nomeFantasia && c.razaoSocial !== c.nomeFantasia && (
                          <p className="text-xs text-slate-500">{c.razaoSocial}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.cnpj || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.cidade ? `${c.cidade}${c.uf ? '/' + c.uf : ''}` : '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/clientes/${c.id}?tab=tecnico`)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-3.5 h-3.5" /> Cadastrar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {semContatoTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              <span>Página {semContatoPage} de {totalPaginasSemContato} • {semContatoTotal} clientes</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={semContatoPage <= 1} onClick={() => carregarSemContato(semContatoPage - 1)}>Anterior</Button>
                <Button size="sm" variant="secondary" disabled={semContatoPage >= totalPaginasSemContato} onClick={() => carregarSemContato(semContatoPage + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* KPIs do recorte filtrado */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Clientes (no filtro)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.clientes ?? 0}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Registros</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.registros ?? 0}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Maquininhas</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.maquininhas ?? 0}</p>
            </Card>
            <button
              onClick={irParaColetadosNaoIntegrados}
              className="text-left rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 sm:p-6 hover:border-amber-400 transition-colors"
            >
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Coletado, não integrado</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                {dados?.porStatus.find((s) => s.status === 'NAO_INTEGRADO')?.maquininhas ?? 0}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Clique para filtrar</p>
            </button>
          </div>

          {/* Filtros */}
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <Select
                label="Operadora"
                options={[{ value: '', label: 'Todas' }, ...operadoras.map((o) => ({ value: String(o.id), label: o.nome }))]}
                value={filtros.operadoraId}
                onChange={(e) => setFiltros((f) => ({ ...f, operadoraId: e.target.value }))}
              />
              <Select
                label="Tipo"
                options={[{ value: '', label: 'Todos' }, { value: 'TEF', label: 'TEF' }, { value: 'SMARTPOS', label: 'SmartPOS' }]}
                value={filtros.tipo}
                onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
              />
              <Select
                label="Status de integração"
                options={[{ value: '', label: 'Todos' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
                value={filtros.statusIntegracao}
                onChange={(e) => setFiltros((f) => ({ ...f, statusIntegracao: e.target.value }))}
              />
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="secondary" icon={<RefreshCcw className="w-4 h-4" />} onClick={carregar}>Atualizar</Button>
            </div>
          </Card>

          {/* Ranking visual: quais maquininhas/operadoras são mais usadas */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Operadoras mais usadas</h3>
              {(dados?.porOperadora ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Sem dados para os filtros selecionados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, (dados?.porOperadora.length ?? 0) * 34)}>
                  <BarChart data={dados?.porOperadora} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis type="category" dataKey="operadora" width={110} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
                      formatter={(v: number) => [v, 'Maquininhas']}
                    />
                    <Bar dataKey="maquininhas" name="Maquininhas" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Por tipo (TEF x SmartPOS)</h3>
              {(dados?.porTipo ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Sem dados para os filtros selecionados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={dados?.porTipo.map((t) => ({ ...t, tipoLabel: t.tipo === 'SMARTPOS' ? 'SmartPOS' : t.tipo }))} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis type="category" dataKey="tipoLabel" width={80} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a' }}
                      formatter={(v: number) => [v, 'Maquininhas']}
                    />
                    <Bar dataKey="maquininhas" name="Maquininhas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 mt-5">Por status</h3>
              <div className="space-y-2">
                {(dados?.porStatus ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">Sem dados.</p>
                ) : dados!.porStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between text-sm">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASSES[s.status])}>
                      {STATUS_LABEL[s.status as StatusMaquininha] ?? s.status}
                    </span>
                    <span className="text-slate-500">{s.maquininhas}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Detalhado */}
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    {['Cliente', 'Operadora', 'Tipo', 'Qtd', 'Status', 'Observação', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                  ) : (dados?.detalhado ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Nenhuma maquininha encontrada para os filtros informados.</td></tr>
                  ) : (
                    dados!.detalhado.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{d.clienteNome}</p>
                          {d.cnpj && <p className="text-xs text-slate-500">{d.cnpj}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.operadoraNome}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.tipo === 'SMARTPOS' ? 'SmartPOS' : d.tipo}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.quantidade}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_CLASSES[d.statusIntegracao])}>
                            {STATUS_LABEL[d.statusIntegracao]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{d.observacao || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/clientes/${d.clienteId}?tab=tecnico`)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ver cliente
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
