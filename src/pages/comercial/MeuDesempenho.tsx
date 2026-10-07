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
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await api.getMeuDesempenho(competencia))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar seu desempenho.')
    } finally {
      setCarregando(false)
    }
  }, [competencia, toast])

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
              Seu progresso na meta e quanto você recebe no mês.
            </p>
          </div>
        </div>
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

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>}

      {!carregando && dados?.semPlano && (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300 py-6 text-center">
            Você ainda não está vinculado a um plano de remuneração. Fale com a gestão comercial
            para que seu plano, data de admissão e meta sejam cadastrados.
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
