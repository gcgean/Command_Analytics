import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Loader2, ChevronLeft, ChevronRight, Target, Wallet, TrendingUp, Trophy, Lock,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { useThemeStore } from '../../store/themeStore'
import type { MeuDesempenhoComissao } from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v?: string | null) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : '—'
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotulo = (c: string) => {
  const [a, m] = c.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}
const curto = (c: string) => {
  const [a, m] = c.split('-')
  return `${CURTO[Number(m) - 1]}/${a.slice(2)}`
}
const mover = (comp: string, passos: number) => {
  const [a, m] = comp.split('-').map(Number)
  const d = new Date(a, m - 1 + passos, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function MeuDesempenho() {
  const { toast } = useToast()
  const isDark = useThemeStore((s) => s.theme) === 'dark'
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7))
  const [dados, setDados] = useState<MeuDesempenhoComissao | null>(null)
  // Vazio = eu mesmo. Só o gestor consegue mudar.
  const [verUsuario, setVerUsuario] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await api.getMeuDesempenho(competencia, verUsuario ?? undefined))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar seu desempenho.')
    } finally {
      setCarregando(false)
    }
  }, [competencia, verUsuario, toast])

  useEffect(() => { void carregar() }, [carregar])

  const v = dados?.vendedor ?? null

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-600 text-white"><Trophy size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meu Desempenho</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {dados?.gestor && dados.vendedor && verUsuario && verUsuario !== dados.usuarioId
                ? `Progresso de ${dados.vendedor.nome} na meta e quanto recebe no mês.`
                : 'Seu progresso na meta e quanto você recebe no mês.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {dados?.gestor && dados.equipe.length > 0 && (
          <select className="input-field w-56" value={verUsuario ?? dados.usuarioId}
            onChange={(e) => setVerUsuario(Number(e.target.value))}>
            {/* O gestor nem sempre está na equipe: a própria opção precisa existir. */}
            {!dados.equipe.some((p) => p.usuarioId === dados.usuarioId) && (
              <option value={dados.usuarioId}>Meu desempenho</option>
            )}
            {dados.equipe.map((p) => (
              <option key={p.usuarioId} value={p.usuarioId}>{p.nome}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
          <button onClick={() => setCompetencia(mover(competencia, -1))}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2 min-w-[11rem] text-center">
            {rotulo(competencia)}
          </span>
          <button onClick={() => setCompetencia(mover(competencia, 1))}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ChevronRight className="w-4 h-4" /></button>
        </div>
        </div>
      </div>

      {dados?.gestor && verUsuario !== null && verUsuario !== dados.usuarioId && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-300">
          Você está vendo o desempenho de outra pessoa.
          <button onClick={() => setVerUsuario(null)} className="ml-2 underline">voltar ao meu</button>
        </div>
      )}

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>}

      {!carregando && dados?.semPlano && (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300 py-6 text-center">
            {dados?.gestor
              ? 'Esta pessoa ainda não está vinculada a um plano de remuneração. Cadastre o vínculo em Remuneração Comercial › Vendedores.'
              : 'Você ainda não está vinculado a um plano de remuneração. Fale com a gestão comercial para que seu plano, data de admissão e meta sejam cadastrados.'}
          </p>
        </Card>
      )}

      {!carregando && dados && v && (
        <>
          {/* Quanto vou receber */}
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-100">Previsão de ganho no mês</p>
                <p className="text-4xl font-black mt-1">{brl(v.total)}</p>
                <p className="text-sm text-emerald-100 mt-1">
                  {brl(v.fixo)} de fixo + {brl(v.variavel)} de comissão
                  {v.emFaseInicial && ' · fixo de treinamento'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-100">Faixa atingida</p>
                <p className="text-3xl font-black">{v.percentual}%</p>
                <p className="text-xs text-emerald-100">
                  {v.faixaDe === null ? 'abaixo da 1ª faixa' : `a partir de ${brl(v.faixaDe)}`}
                </p>
              </div>
            </div>
            {v.fechado && (
              <p className="mt-3 text-xs text-emerald-100 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Mês fechado — este é o valor apurado.
              </p>
            )}
          </div>

          {/* Progresso na meta */}
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Target className="w-4 h-4" /> Minha meta do mês
              </h2>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                <strong>{brl(v.base)}</strong> de {brl(v.meta)}
                {v.percMeta !== null && <span className="text-slate-400 ml-2">{v.percMeta.toFixed(0)}%</span>}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all',
                (v.percMeta ?? 0) >= 100 ? 'bg-emerald-500' : (v.percMeta ?? 0) >= 60 ? 'bg-amber-500' : 'bg-red-400')}
                style={{ width: `${Math.min(v.percMeta ?? 0, 100)}%` }} />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs">
              {([
                ['Implantação', v.composicao.implantacao],
                ['Migração', v.composicao.migracao],
                ['Mensalidade nova', v.composicao.mensalidadeNova],
                ['Upgrades', v.composicao.upgrades],
                ['PayCore', v.composicao.paycore],
              ] as const).filter(([, n]) => n > 0).map(([r, n]) => (
                <span key={r} className="text-slate-500">
                  {r}: <strong className="text-slate-700 dark:text-slate-300">{brl(n)}</strong>
                </span>
              ))}
              {v.base === 0 && <span className="text-slate-500">Nenhuma venda registrada neste mês ainda.</span>}
            </div>

            {v.proximaFaixa && !v.fechado && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Faltam <strong>{brl(v.proximaFaixa.falta)}</strong> para a faixa de
                  {' '}<strong>{v.proximaFaixa.percentual}%</strong>. Como o percentual passa a valer sobre
                  {' '}tudo que você vendeu no mês, sua comissão sobe{' '}
                  <strong>+{brl(v.proximaFaixa.ganhoExtra)}</strong> — e o total do mês vai para{' '}
                  <strong>{brl(v.fixo + v.variavel + v.proximaFaixa.ganhoExtra)}</strong>.
                </p>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Histórico */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Meus últimos 6 meses
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">O que você produziu e o que recebeu em cada mês.</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dados.historico.map((h) => ({
                  mes: curto(h.competencia), Produzido: h.base, Comissão: h.variavel,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                    tickFormatter={(x) => Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} width={60} />
                  <Tooltip formatter={(x) => brl(Number(x))} contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    border: '1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
                    borderRadius: 8, fontSize: 12,
                  }} />
                  <Bar dataKey="Produzido" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Comissão" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Escada */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Minha escada de comissão
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">
                A faixa que você atinge vale sobre <strong>tudo</strong> que vendeu no mês.
              </p>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                {dados.escada.map((f) => {
                  const atual = v.faixaDe === f.valorDe
                  const alcancada = v.base >= f.valorDe
                  return (
                    <div key={f.valorDe}
                      className={clsx('flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs',
                        atual ? 'bg-emerald-100 dark:bg-emerald-500/20 ring-1 ring-emerald-500'
                          : alcancada ? 'bg-slate-50 dark:bg-slate-900/40' : '')}>
                      <span className={clsx(alcancada ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400')}>
                        a partir de {brl(f.valorDe)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={clsx('font-semibold',
                          atual ? 'text-emerald-700 dark:text-emerald-300'
                            : alcancada ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400')}>
                          {f.percentual}%
                        </span>
                        <span className={clsx('w-24 text-right',
                          alcancada ? 'text-slate-500' : 'text-slate-400')}>
                          {brl((f.valorDe * f.percentual) / 100)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {dados.ranking && dados.ranking.total > 1 && (
            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
                Você está em <strong className="text-slate-900 dark:text-slate-100">
                  {dados.ranking.posicao}º de {dados.ranking.total}
                </strong> no time comercial neste mês.
              </p>
            </Card>
          )}

          {/* ── O que entrou na base, item a item ───────────────────── */}
          {(dados.detalhe.implantacoes.length > 0 || dados.detalhe.clientesNovos.length > 0
            || dados.detalhe.upgrades.length > 0 || dados.detalhe.assinaturas.length > 0) && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                O que entrou na sua meta neste mês
              </h2>

              {dados.detalhe.implantacoes.length > 0 && (
                <Card padding="none">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Implantações ({dados.detalhe.implantacoes.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                      {brl(v.composicao.implantacao + v.composicao.migracao)} na base
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr className="text-left text-slate-600 dark:text-slate-400">
                          <th className="px-4 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Sistema / plano</th>
                          <th className="px-3 py-2 font-medium text-right">Implantação</th>
                          <th className="px-3 py-2 font-medium text-right">Migração</th>
                          <th className="px-3 py-2 font-medium text-right">Mensalidade</th>
                          <th className="px-4 py-2 font-medium text-center">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.detalhe.implantacoes.map((i) => (
                          <tr key={i.processo} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-4 py-2 text-slate-800 dark:text-slate-200">
                              {i.cliente}
                              <span className="block text-[10px] text-slate-400">
                                #{i.processo}{i.cidade ? ` · ${i.cidade}` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{i.plano ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                              {brl(i.implantacao)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {i.migracao ? brl(i.migracao) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {i.mensalidade ? brl(i.mensalidade) : '—'}
                              <span className="block text-[10px] text-slate-400">não entra aqui</span>
                            </td>
                            <td className="px-4 py-2 text-center text-slate-500 text-xs whitespace-nowrap">{dataBR(i.data)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-700">
                    A mensalidade do processo não entra por aqui: ela conta quando o cliente é
                    registrado como novo, para não ser somada duas vezes.
                  </p>
                </Card>
              )}

              {dados.detalhe.clientesNovos.length > 0 && (
                <Card padding="none">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Clientes novos ({dados.detalhe.clientesNovos.length})
                    </h3>
                    <span className="text-xs text-slate-500">{brl(v.composicao.mensalidadeNova)} na base</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr className="text-left text-slate-600 dark:text-slate-400">
                          <th className="px-4 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Segmento</th>
                          <th className="px-3 py-2 font-medium text-right">Mensalidade</th>
                          <th className="px-4 py-2 font-medium text-center">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.detalhe.clientesNovos.map((c) => (
                          <tr key={c.codigo} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-4 py-2 text-slate-800 dark:text-slate-200">
                              {c.cliente}
                              <span className="block text-[10px] text-slate-400">
                                #{c.codigo}{c.cidade ? ` · ${c.cidade}` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">{c.segmento ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">{brl(c.valor)}</td>
                            <td className="px-4 py-2 text-center text-slate-500 text-xs whitespace-nowrap">{dataBR(c.data)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {dados.detalhe.upgrades.length > 0 && (
                <Card padding="none">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Upgrades e módulos ({dados.detalhe.upgrades.length})
                    </h3>
                    <span className="text-xs text-slate-500">{brl(v.composicao.upgrades)} na base</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr className="text-left text-slate-600 dark:text-slate-400">
                          <th className="px-4 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Produto / módulo</th>
                          <th className="px-3 py-2 font-medium text-right">Valor</th>
                          <th className="px-4 py-2 font-medium text-center">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.detalhe.upgrades.map((u, i) => (
                          <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{u.cliente}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{u.descricao}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">{brl(u.valor)}</td>
                            <td className="px-4 py-2 text-center text-slate-500 text-xs whitespace-nowrap">{dataBR(u.data)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {dados.detalhe.assinaturas.length > 0 && (
                <Card padding="none">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Assinaturas no PayCore ({dados.detalhe.assinaturas.length})
                    </h3>
                    <span className="text-xs text-slate-500">{brl(v.composicao.paycore)} na base</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr className="text-left text-slate-600 dark:text-slate-400">
                          <th className="px-4 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 font-medium">Plano</th>
                          <th className="px-3 py-2 font-medium text-right">Mensal</th>
                          <th className="px-4 py-2 font-medium text-center">Início</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.detalhe.assinaturas.map((a, i) => (
                          <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-4 py-2 text-slate-800 dark:text-slate-200">
                              {a.cliente}
                              {a.servidor && <span className="block text-[10px] text-slate-400">{a.servidor}</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{a.produto ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">
                              {a.plano ?? '—'}
                              {a.periodicidade && <span className="block text-[10px] text-slate-400">{a.periodicidade}</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">{brl(a.valor)}</td>
                            <td className="px-4 py-2 text-center text-slate-500 text-xs whitespace-nowrap">{dataBR(a.data)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    Soma de tudo acima — é esta a base da sua comissão
                  </span>
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{brl(v.base)}</span>
                </div>
              </Card>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Entram na sua meta: implantação e migração dos processos em que você é o vendedor, a
            mensalidade dos clientes novos atribuídos a você, seus upgrades e as assinaturas do
            PayCore no seu nome. Valores do mês em aberto podem mudar até o fechamento.
          </p>
        </>
      )}
    </div>
  )
}
