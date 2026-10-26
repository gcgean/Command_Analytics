import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ChevronDown, Clock, Loader2, UserX, Users } from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import type { PendentesPorTecnico, TecnicoPendencias } from '../../types'

const dataBR = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

/**
 * Quanto cada técnico tem na mão agora. Não é recorte de período: a pergunta do gestor é o
 * acúmulo de hoje — quem está com fila grande e há quanto tempo a mais antiga está parada.
 */
export function PainelPendentesTecnico({ rotuloStatus }: { rotuloStatus: Record<number, string> }) {
  const [dados, setDados] = useState<PendentesPorTecnico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await api.getPendentesPorTecnico())
      setErro('')
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  if (carregando) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
  }
  if (erro) return <div className="py-10 text-center text-sm text-red-500">{erro}</div>
  if (!dados || dados.tecnicos.length === 0) {
    return <div className="py-16 text-center text-slate-500">Nenhuma solicitação pendente.</div>
  }

  const maior = Math.max(...dados.tecnicos.map((t) => t.total), 1)
  const chaveDe = (t: TecnicoPendencias) => String(t.tecnicoId ?? 'sem')

  return (
    <div className="space-y-4 pb-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500">Pendentes no total</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{dados.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500">Técnicos com fila</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
            {dados.tecnicos.filter((t) => t.tecnicoId != null).length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500">Sem técnico</p>
              <p className={clsx('text-2xl font-bold mt-0.5',
                dados.semTecnico > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')}>
                {dados.semTecnico}
              </p>
            </div>
            <UserX className="w-4 h-4 text-amber-500 mt-1" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500">Prioritárias / bugs</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5">
                {dados.tecnicos.reduce((s, t) => s + t.prioritarias, 0)}
              </p>
            </div>
            <AlertTriangle className="w-4 h-4 text-red-500 mt-1" />
          </div>
        </div>
      </div>

      <Card padding="none">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Pendentes por técnico
          </h2>
          <span className="text-xs text-slate-400">clique para ver a lista</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {dados.tecnicos.map((t) => {
            const chave = chaveDe(t)
            const expandido = aberto === chave
            return (
              <div key={chave}>
                <button onClick={() => setAberto(expandido ? null : chave)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <ChevronDown className={clsx('w-4 h-4 text-slate-400 shrink-0 transition-transform',
                    expandido && 'rotate-180')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={clsx('text-sm truncate',
                        t.tecnicoId == null
                          ? 'text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-slate-800 dark:text-slate-100')}>
                        {t.nome}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                        {t.total}
                      </span>
                    </div>
                    {/* A barra é comparativa: o número sozinho não mostra quem está afogado. */}
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div className={clsx('h-full rounded-full',
                        t.tecnicoId == null ? 'bg-amber-500' : 'bg-blue-500')}
                        style={{ width: `${(t.total / maior) * 100}%` }} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                      {t.maisAntigaDias > 0 && (
                        <span className={clsx('inline-flex items-center gap-1',
                          t.maisAntigaDias > 30 && 'text-red-500')}>
                          <Clock className="w-3 h-3" /> mais antiga há {t.maisAntigaDias} dia(s)
                        </span>
                      )}
                      {t.prioritarias > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-500">
                          <AlertTriangle className="w-3 h-3" /> {t.prioritarias} prioritária(s)
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {expandido && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="px-4 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Etapa</th>
                          <th className="px-3 py-2 font-medium">Dev</th>
                          <th className="px-3 py-2 font-medium">Aberta</th>
                          <th className="px-3 py-2 font-medium">Parada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.itens.map((i) => (
                          <tr key={i.id} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-4 py-2 text-slate-500">
                              {i.prioritaria && <AlertTriangle className="w-3 h-3 inline mr-1 text-red-500" />}
                              {i.id}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                              <span className="block truncate max-w-[16rem]">{i.clienteNome ?? '—'}</span>
                              {i.resumo && (
                                <span className="block text-[10px] text-slate-400 truncate max-w-[22rem]">
                                  {i.resumo}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {rotuloStatus[i.status] ?? i.status}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{i.desenvolvedorNome ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dataBR(i.abertaEm)}</td>
                            <td className={clsx('px-3 py-2 whitespace-nowrap',
                              i.diasEmAberto > 30 ? 'text-red-500 font-medium' : 'text-slate-500')}>
                              {i.diasEmAberto} dia(s)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
