import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle, GraduationCap, Link2, Loader2, Search, Star, Trash2, Trophy, UserPlus,
} from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { usePermissions } from '../../contexts/PermissionsContext'
import type {
  LancamentoComissao, PendenteComissao, RankingComissao, RankingTreinamento,
} from '../../types'

const brl = (v: number) =>
  `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataBR = (iso: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`
const hoje = () => new Date().toISOString().slice(0, 10)

type Aba = 'listagem' | 'vincular' | 'ranking' | 'treinamentos'

export function Comissoes() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const podeLancar = can('comissoes-lancar')

  const [aba, setAba] = useState<Aba>('listagem')
  const [inicio, setInicio] = useState(primeiroDoMes())
  const [fim, setFim] = useState(hoje())
  const [carregando, setCarregando] = useState(true)

  const [lancamentos, setLancamentos] = useState<LancamentoComissao[]>([])
  const [totalComissao, setTotalComissao] = useState(0)
  const [totalOperacao, setTotalOperacao] = useState(0)
  const [pendentes, setPendentes] = useState<PendenteComissao[]>([])
  const [resumoPendentes, setResumoPendentes] = useState({ total: 0, comissionaveis: 0, valorBaseTotal: 0 })
  const [ranking, setRanking] = useState<RankingComissao[]>([])
  const [treinamentos, setTreinamentos] = useState<RankingTreinamento[]>([])
  const [colaboradores, setColaboradores] = useState<Array<{ id: number; nome: string }>>([])

  const [buscaLancamento, setBuscaLancamento] = useState('')
  const [buscaPendente, setBuscaPendente] = useState('')
  const [vincular, setVincular] = useState<PendenteComissao | null>(null)
  const [colaboradorEscolhido, setColaboradorEscolhido] = useState('')
  const [percentual, setPercentual] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Uma consulta só para as quatro abas: o período é o mesmo, e ir ao banco a cada troca de
  // aba faria o usuário esperar de novo pelo que já estava carregado.
  const consultar = useCallback(async () => {
    setCarregando(true)
    try {
      const [lanc, pend, rank, trein] = await Promise.all([
        api.getLancamentosComissao({ inicio, fim }),
        api.getPendentesComissao({ inicio, fim }),
        api.getRankingComissao({ inicio, fim }),
        api.getRankingTreinamentos({ inicio, fim }),
      ])
      setLancamentos(lanc.itens)
      setTotalComissao(lanc.total)
      setTotalOperacao(lanc.totalOperacao)
      setPendentes(pend.itens)
      setResumoPendentes({ total: pend.total, comissionaveis: pend.comissionaveis, valorBaseTotal: pend.valorBaseTotal })
      setRanking(rank.itens)
      setTreinamentos(trein.itens)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível consultar o período.')
    } finally {
      setCarregando(false)
    }
  }, [inicio, fim, toast])

  useEffect(() => { void consultar() }, [])
  useEffect(() => {
    if (!podeLancar) return
    api.getColaboradoresComissao().then(setColaboradores).catch(() => {})
  }, [podeLancar])

  const lancamentosFiltrados = useMemo(() => {
    const t = buscaLancamento.trim().toLowerCase()
    if (!t) return lancamentos
    return lancamentos.filter((l) =>
      `${l.colaboradorNome} ${l.clienteNome} ${l.descricao ?? ''}`.toLowerCase().includes(t))
  }, [lancamentos, buscaLancamento])

  const pendentesFiltrados = useMemo(() => {
    const t = buscaPendente.trim().toLowerCase()
    if (!t) return pendentes
    return pendentes.filter((p) =>
      `${p.clienteNome} ${p.razaoSocial ?? ''} ${p.planoAtual ?? ''} ${p.acao}`.toLowerCase().includes(t))
  }, [pendentes, buscaPendente])

  function abrirVinculo(p: PendenteComissao) {
    setVincular(p)
    setColaboradorEscolhido('')
    setPercentual(String(p.percentual))
  }

  async function confirmarVinculo() {
    if (!vincular || !colaboradorEscolhido) return
    setSalvando(true)
    try {
      const r = await api.lancarComissao({
        logId: vincular.id,
        colaboradorId: Number(colaboradorEscolhido),
        percentual: Number(percentual) || undefined,
      })
      toast.success(`Comissão de ${brl(r.valor)} lançada.`)
      setVincular(null)
      await consultar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível lançar a comissão.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(l: LancamentoComissao) {
    const ok = confirm(
      `Excluir o lançamento selecionado?\n\nID: ${l.id}\nCliente: ${l.clienteNome}\n`
      + `Descrição: ${l.descricao ?? '—'}\nValor: ${brl(l.valor)}\n\n`
      + 'A venda volta para a lista de pendentes.')
    if (!ok) return
    try {
      await api.excluirLancamentoComissao(l.id)
      toast.success('Lançamento excluído. A venda voltou para pendentes.')
      await consultar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir.')
    }
  }

  const abas: Array<{ id: Aba; rotulo: string; contador?: number }> = [
    { id: 'listagem', rotulo: 'Listagem', contador: lancamentos.length },
    ...(podeLancar ? [{ id: 'vincular' as Aba, rotulo: 'Vincular', contador: resumoPendentes.comissionaveis }] : []),
    { id: 'ranking', rotulo: 'Ranking de vendas' },
    { id: 'treinamentos', rotulo: 'Ranking dos treinamentos' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Comissões</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Lançamentos, vínculo das vendas e ranking da equipe
        </p>
      </div>

      {/* Período: o filtro vale para as quatro abas, como no sistema antigo. */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">De</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-2" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Até</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-2" />
        </div>
        <Button size="sm" icon={<Search className="w-3.5 h-3.5" />} loading={carregando}
          onClick={() => void consultar()}>
          Consultar
        </Button>
        <div className="ml-auto flex flex-wrap gap-5 text-right">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Comissões no período</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{brl(totalComissao)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Valor das operações</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{brl(totalOperacao)}</p>
          </div>
          {podeLancar && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">A comissionar</p>
              <p className={clsx('text-lg font-bold',
                resumoPendentes.comissionaveis > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')}>
                {resumoPendentes.comissionaveis}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              aba === a.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200')}>
            {a.rotulo}
            {a.contador != null && a.contador > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">
                {a.contador}
              </span>
            )}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {aba === 'listagem' && (
            <div className="space-y-3">
              <input value={buscaLancamento} onChange={(e) => setBuscaLancamento(e.target.value)}
                placeholder="Filtrar por colaborador, cliente ou descrição..."
                className="h-9 w-full max-w-md rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3" />
              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      {['Colaborador', 'Cliente', 'Descrição', 'Data venda', 'Valor operação', 'Comissão', ''].map((h) => (
                        <th key={h} className="table-header text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosFiltrados.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                        Nenhum lançamento no período.
                      </td></tr>
                    ) : lancamentosFiltrados.map((c) => (
                      <tr key={c.id} className="table-row">
                        <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{c.colaboradorNome || '—'}</td>
                        <td className="table-cell text-slate-600 dark:text-slate-400">{c.clienteNome || '—'}</td>
                        <td className="table-cell">
                          <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs">
                            {c.descricao || '—'}
                          </span>
                        </td>
                        <td className="table-cell text-slate-600 dark:text-slate-400">{dataBR(c.dataVenda)}</td>
                        <td className="table-cell text-slate-700 dark:text-slate-300">{brl(c.valorOperacao)}</td>
                        <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{brl(c.valor)}</td>
                        <td className="table-cell text-right">
                          {podeLancar && (
                            <button onClick={() => void excluir(c)} title="Excluir lançamento"
                              className="text-slate-400 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aba === 'vincular' && podeLancar && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input value={buscaPendente} onChange={(e) => setBuscaPendente(e.target.value)}
                  placeholder="Filtrar por cliente, plano ou ação..."
                  className="h-9 w-full max-w-md rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3" />
                <p className="text-xs text-slate-500">
                  {resumoPendentes.comissionaveis} comissionável(is) · base {brl(resumoPendentes.valorBaseTotal)}
                  {resumoPendentes.total > resumoPendentes.comissionaveis && (
                    <> · {resumoPendentes.total - resumoPendentes.comissionaveis} sem valor base</>
                  )}
                </p>
              </div>
              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      {['Cliente', 'Ação', 'Plano atual', 'Assinatura', 'Base', '%', 'Comissão', 'Data', ''].map((h) => (
                        <th key={h} className="table-header text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendentesFiltrados.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                        Nenhuma venda aguardando vínculo no período.
                      </td></tr>
                    ) : pendentesFiltrados.map((p) => (
                      <tr key={p.id} className="table-row">
                        <td className="table-cell">
                          <span className="block font-medium text-slate-900 dark:text-slate-100 truncate max-w-[14rem]">
                            {p.clienteNome}
                          </span>
                          <span className="block text-[11px] text-slate-500">#{p.clienteId}</span>
                        </td>
                        <td className="table-cell text-slate-600 dark:text-slate-400">{p.acao}</td>
                        <td className="table-cell text-slate-600 dark:text-slate-400 truncate max-w-[14rem]">
                          {p.planoAtual || '—'}
                        </td>
                        <td className="table-cell text-slate-500 whitespace-nowrap text-xs">
                          {brl(p.assinaturaAnterior)} → {brl(p.assinaturaAtual)}
                        </td>
                        <td className={clsx('table-cell font-medium',
                          p.comissionavel ? 'text-slate-800 dark:text-slate-100' : 'text-red-500')}>
                          {brl(p.valorBase)}
                        </td>
                        <td className="table-cell text-slate-500">{p.percentual}%</td>
                        <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">
                          {p.comissionavel ? brl(p.valorComissao) : '—'}
                        </td>
                        <td className="table-cell text-slate-500 whitespace-nowrap">{dataBR(p.dataHora)}</td>
                        <td className="table-cell text-right">
                          {p.comissionavel ? (
                            <button onClick={() => abrirVinculo(p)} title="Vincular ao colaborador"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                              <Link2 className="w-3.5 h-3.5" /> vincular
                            </button>
                          ) : (
                            <span title="Valor base menor ou igual a zero"
                              className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <AlertTriangle className="w-3.5 h-3.5" /> sem base
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aba === 'ranking' && (
            <div className="space-y-3 max-w-xl">
              {ranking.length === 0 ? (
                <p className="card text-sm text-slate-500">Nenhuma comissão lançada no período.</p>
              ) : ranking.map((r) => (
                <div key={r.colaboradorId} className="card flex items-center gap-4">
                  <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                    r.posicao === 1 ? 'bg-amber-500 text-white'
                      : r.posicao === 2 ? 'bg-slate-400 text-white'
                        : r.posicao === 3 ? 'bg-amber-800 text-amber-100'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                    {r.posicao === 1 ? <Trophy size={18} /> : `${r.posicao}º`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{r.colaboradorNome}</p>
                    <p className="text-xs text-slate-500">
                      {r.vendas} venda(s) · operações {brl(r.totalOperacao)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold">{brl(r.total)}</p>
                    {r.posicao === 1 && <Star size={14} className="text-amber-400 fill-amber-400 ml-auto" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {aba === 'treinamentos' && (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Colaborador', 'Nota média', 'Treinamentos avaliados'].map((h) => (
                      <th key={h} className="table-header text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {treinamentos.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500">
                      Nenhum treinamento avaliado no período.
                    </td></tr>
                  ) : treinamentos.map((t, i) => (
                    <tr key={`${t.colaboradorId ?? 'sem'}-${i}`} className="table-row">
                      <td className="table-cell font-medium text-slate-900 dark:text-slate-100">
                        <span className="inline-flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-slate-400" /> {t.colaborador}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={clsx('badge',
                          t.mediaNota >= 9 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : t.mediaNota >= 7 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                              : 'bg-red-500/20 text-red-500')}>
                          {t.mediaNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="table-cell text-slate-600 dark:text-slate-400">{t.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Vincular ao colaborador */}
      {vincular && (
        <Modal isOpen onClose={() => !salvando && setVincular(null)} title="Vincular ao colaborador" size="md">
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-sm space-y-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">{vincular.clienteNome}</p>
              <p className="text-xs text-slate-500">
                {vincular.acao} · {vincular.planoAtual || 'sem plano'} · {dataBR(vincular.dataHora)}
              </p>
              <p className="text-xs text-slate-500">
                Assinatura {brl(vincular.assinaturaAnterior)} → {brl(vincular.assinaturaAtual)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Colaborador <span className="text-red-500">*</span>
              </label>
              <select value={colaboradorEscolhido} onChange={(e) => setColaboradorEscolhido(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
                <option value="">Selecione...</option>
                {colaboradores.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Percentual
                </label>
                <input type="number" min={1} max={100} step={1} value={percentual}
                  onChange={(e) => setPercentual(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3" />
                <p className="text-[11px] text-slate-400 mt-1">
                  {vincular.percentual}% é o padrão para este plano.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Comissão
                </label>
                <p className="h-10 flex items-center text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {brl((vincular.valorBase * (Number(percentual) || 0)) / 100)}
                </p>
                <p className="text-[11px] text-slate-400">sobre a base de {brl(vincular.valorBase)}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setVincular(null)} disabled={salvando}>Cancelar</Button>
              <Button icon={<UserPlus className="w-4 h-4" />} loading={salvando}
                disabled={!colaboradorEscolhido} onClick={() => void confirmarVinculo()}>
                Salvar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
