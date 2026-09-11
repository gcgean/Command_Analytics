import { useState } from 'react'
import clsx from 'clsx'
import { Loader2, RefreshCw, Lightbulb } from 'lucide-react'
import { api, statusAtendimentoLabel } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import type { DashboardDev } from '../../types'

/**
 * Painel de desempenho do desenvolvimento. Os números vêm de um endpoint próprio e aparecem na
 * hora; a leitura da IA é um segundo passo, sob demanda, porque custa crédito e leva segundos —
 * IA lenta ou fora do ar não pode impedir o gestor de ver os números.
 */
export function PainelDesempenhoDev({ rotuloStatus }: { rotuloStatus: Record<number, string> }) {
  const { toast } = useToast()
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const [dataInicio, setDataInicio] = useState(iso(inicioMes))
  const [dataFim, setDataFim] = useState(iso(hoje))
  const [painel, setPainel] = useState<DashboardDev | null>(null)
  const [gerando, setGerando] = useState(false)
  const [analise, setAnalise] = useState('')
  const [analisando, setAnalisando] = useState(false)
  const [escopoAnalise, setEscopoAnalise] = useState('')

  const gerar = async () => {
    setGerando(true)
    try {
      setPainel(await api.getDashboardDev(dataInicio, dataFim))
      setAnalise('')
      setEscopoAnalise('')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar o dashboard.')
    } finally {
      setGerando(false)
    }
  }

  const analisar = async (desenvolvedorId: number | null, nome: string) => {
    setAnalisando(true)
    setEscopoAnalise(nome || 'Equipe')
    try {
      const r = await api.gerarAnaliseDev(dataInicio, dataFim, desenvolvedorId)
      setAnalise(r.texto)
      toast.success(`Análise gerada sobre ${r.analisadas} solicitação(ões) concluída(s).`)
    } catch (e: any) {
      setAnalise('')
      toast.error(e?.message || 'Não foi possível gerar a análise.')
    } finally {
      setAnalisando(false)
    }
  }

  const kpis = painel
    ? [
        { rotulo: 'Recebidas no período', valor: String(painel.totais.lancadas), cor: 'text-slate-700 dark:text-slate-300' },
        { rotulo: 'Finalizadas no período', valor: String(painel.totais.finalizadas), cor: 'text-emerald-600 dark:text-emerald-400' },
        { rotulo: 'Em teste agora', valor: String(painel.totais.emTeste), cor: 'text-cyan-600 dark:text-cyan-400' },
        { rotulo: 'Taxa de entrega', valor: `${painel.totais.taxaConclusao}%`, cor: 'text-blue-600 dark:text-blue-400' },
        { rotulo: 'Voltou com erro', valor: String(painel.totais.testadoComErro), cor: 'text-amber-600 dark:text-amber-400' },
        { rotulo: 'Abertas há +30 dias', valor: String(painel.totais.atrasadas30), cor: 'text-red-600 dark:text-red-400' },
      ]
    : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">De</label>
          <input type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Até</label>
          <input type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {gerando ? 'Gerando...' : 'Gerar dashboard'}
        </button>
      </div>

      {!painel && !gerando && (
        <div className="text-center py-12 text-slate-500">
          <p className="font-medium">Escolha o período e clique em "Gerar dashboard".</p>
          <p className="text-sm mt-1">
            Considera apenas solicitações com desenvolvedor vinculado. "Em teste" e "voltou com erro"
            são o estado atual da esteira, não recorte do período — a taxa de entrega soma concluídas
            e em teste, para não penalizar quem entregou perto do fim do período.
          </p>
        </div>
      )}

      {painel && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((k) => (
              <div key={k.rotulo} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{k.rotulo}</p>
                <p className={clsx('text-2xl font-bold leading-tight', k.cor)}>{k.valor}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-left">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Desenvolvedor</th>
                  <th className="px-3 py-2 text-right">Recebidas</th>
                  <th className="px-3 py-2 text-right">Finalizadas</th>
                  <th className="px-3 py-2 text-right">Em teste</th>
                  <th className="px-3 py-2 text-right">C/ erro</th>
                  <th className="px-3 py-2 text-right">Taxa</th>
                  <th className="px-3 py-2 text-right">Dias médios</th>
                  <th className="px-3 py-2 text-right">Abertas +30d</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {painel.desenvolvedores.map((d) => (
                  <tr key={d.desenvolvedorId ?? 'sem'} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{d.desenvolvedorNome}</td>
                    <td className="px-3 py-2 text-right">{d.lancadas}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{d.finalizadas}</td>
                    <td className="px-3 py-2 text-right text-cyan-600 dark:text-cyan-400">{d.emTeste}</td>
                    <td className={clsx('px-3 py-2 text-right', d.testadoComErro > 0 && 'text-amber-600 dark:text-amber-400 font-semibold')}>
                      {d.testadoComErro}
                    </td>
                    <td className="px-3 py-2 text-right">{d.taxaConclusao}%</td>
                    <td className="px-3 py-2 text-right">{d.diasMedioConclusao ?? '—'}</td>
                    <td className={clsx('px-3 py-2 text-right', d.atrasadas30 > 0 && 'text-red-600 dark:text-red-400 font-semibold')}>
                      {d.atrasadas30}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        onClick={() => analisar(d.desenvolvedorId, d.desenvolvedorNome)}
                        disabled={analisando}
                      >
                        Analisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <h3 className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-200">Finalizadas por projeto</h3>
              {painel.porProjeto.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma no período.</p>
              ) : (
                [...painel.porProjeto]
                  .sort((a, b) => b.total - a.total)
                  .map((p) => (
                    <div key={p.projeto} className="flex justify-between text-sm py-0.5">
                      <span className="text-slate-600 dark:text-slate-400">{p.projeto}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{p.total}</span>
                    </div>
                  ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <h3 className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-200">
                Por etapa <span className="font-normal text-slate-400">— no período / no geral</span>
              </h3>
              {[...painel.porStatusGeral]
                .sort((a, b) => b.total - a.total)
                .map((g) => {
                  const noPeriodo = painel.porStatusPeriodo.find((x) => x.status === g.status)?.total ?? 0
                  return (
                    <div key={g.status} className="flex justify-between text-sm py-0.5">
                      <span className="text-slate-600 dark:text-slate-400">
                        {rotuloStatus[g.status] ?? (statusAtendimentoLabel as Record<number, string>)[g.status] ?? g.status}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {noPeriodo} <span className="text-slate-400 font-normal">/ {g.total}</span>
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Análise da IA
                {escopoAnalise && <span className="text-slate-400 font-normal"> — {escopoAnalise}</span>}
              </h3>
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() => analisar(null, 'Equipe')}
                disabled={analisando}
              >
                {analisando ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
                {analisando ? 'Analisando...' : 'Analisar equipe'}
              </button>
            </div>
            {analise ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analise}</p>
            ) : (
              <p className="text-xs text-slate-500">
                A IA lê o que foi entregue no período e aponta o rumo do desenvolvimento, acertos, ritmo e
                recomendações. Use "Analisar" na linha de um desenvolvedor para a leitura individual.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
