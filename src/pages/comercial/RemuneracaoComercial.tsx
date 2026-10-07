import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Loader2, Save, Plus, Trash2, Lock, Unlock, ChevronLeft, ChevronRight,
  Percent, Wallet, TrendingUp, Users, Target,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type {
  ApuracaoComissao, CandidatoComissao, PlanoComissao, VendedorComissao,
} from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const rotuloComp = (c: string) => {
  const [a, m] = c.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}
const mover = (comp: string, passos: number) => {
  const [a, m] = comp.split('-').map(Number)
  const d = new Date(a, m - 1 + passos, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function RemuneracaoComercial() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'apuracao' | 'vendedores' | 'plano'>('apuracao')
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7))
  const [apuracao, setApuracao] = useState<ApuracaoComissao | null>(null)
  const [planos, setPlanos] = useState<PlanoComissao[]>([])
  const [vendedores, setVendedores] = useState<VendedorComissao[]>([])
  const [candidatos, setCandidatos] = useState<CandidatoComissao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [plano, setPlano] = useState<PlanoComissao | null>(null)
  const [novo, setNovo] = useState({ usuarioId: '', planoId: '', dataAdmissao: '', fixoPersonalizado: '', metaIndividual: '' })

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [a, p, v, c] = await Promise.all([
        api.getApuracaoComissao(competencia),
        api.getPlanosComissao(),
        api.getVendedoresComissao(),
        api.getCandidatosComissao().catch(() => []),
      ])
      setApuracao(a)
      setPlanos(p)
      setPlano((atual) => p.find((x) => x.id === atual?.id) ?? p[0] ?? null)
      setVendedores(v)
      setCandidatos(c)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a remuneração.')
    } finally {
      setCarregando(false)
    }
  }, [competencia, toast])

  useEffect(() => { void carregar() }, [carregar])

  async function salvarPlano() {
    if (!plano) return
    setSalvando(true)
    try {
      await api.salvarPlanoComissao(plano.id, plano)
      toast.success('Plano salvo!')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar o plano.')
    } finally {
      setSalvando(false)
    }
  }

  async function adicionarVendedor() {
    if (!novo.usuarioId || !novo.planoId) return toast.error('Escolha o vendedor e o plano.')
    try {
      await api.salvarVendedorComissao({
        usuarioId: Number(novo.usuarioId),
        planoId: Number(novo.planoId),
        dataAdmissao: novo.dataAdmissao || undefined,
        fixoPersonalizado: novo.fixoPersonalizado === '' ? undefined : Number(novo.fixoPersonalizado),
        metaIndividual: novo.metaIndividual === '' ? undefined : Number(novo.metaIndividual),
      })
      setNovo({ usuarioId: '', planoId: '', dataAdmissao: '', fixoPersonalizado: '', metaIndividual: '' })
      toast.success('Vendedor vinculado ao plano!')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível vincular.')
    }
  }

  async function removerVendedor(v: VendedorComissao) {
    if (!confirm(`Remover ${v.nome} do plano de remuneração?`)) return
    try {
      await api.excluirVendedorComissao(v.usuarioId)
      toast.success('Vendedor removido.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível remover.')
    }
  }

  async function alternarFechamento(usuarioId: number, fechado: boolean) {
    try {
      if (fechado) await api.reabrirComissao(competencia, usuarioId)
      else await api.fecharComissao(competencia, usuarioId)
      toast.success(fechado ? 'Apuração reaberta.' : 'Apuração fechada.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível alterar o fechamento.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-600 text-white"><Percent size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Remuneração Comercial</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Fixo por fase + comissão progressiva sobre a implantação, individual por vendedor.
            </p>
          </div>
        </div>
        {aba === 'apuracao' && (
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
            <button onClick={() => setCompetencia(mover(competencia, -1))}
              className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2 min-w-[11rem] text-center">
              {rotuloComp(competencia)}
            </span>
            <button onClick={() => setCompetencia(mover(competencia, 1))}
              className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['apuracao', 'Apuração'], ['vendedores', 'Vendedores'], ['plano', 'Plano e faixas']] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>}

      {/* ── Apuração ── */}
      {!carregando && aba === 'apuracao' && apuracao && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { rotulo: 'Implantação no mês', valor: brl(apuracao.totais.base), icone: TrendingUp, cor: 'text-blue-600 dark:text-blue-400' },
              { rotulo: 'Variável', valor: brl(apuracao.totais.variavel), icone: Percent, cor: 'text-emerald-600 dark:text-emerald-400' },
              { rotulo: 'Fixo', valor: brl(apuracao.totais.fixo), icone: Wallet, cor: 'text-slate-700 dark:text-slate-300' },
              { rotulo: 'Custo total da equipe', valor: brl(apuracao.totais.total), icone: Users, cor: 'text-amber-600 dark:text-amber-400' },
            ].map((k) => (
              <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{k.rotulo}</p>
                    <p className={clsx('text-xl font-bold mt-0.5 truncate', k.cor)}>{k.valor}</p>
                  </div>
                  <k.icone className={clsx('w-4 h-4 shrink-0 mt-1', k.cor)} />
                </div>
              </div>
            ))}
          </div>

          {apuracao.linhas.length === 0 ? (
            <Card><p className="text-sm text-slate-500 py-8 text-center">
              Nenhum vendedor vinculado a um plano. Vincule na aba <strong>Vendedores</strong>.
            </p></Card>
          ) : (
            <div className="space-y-3">
              {apuracao.linhas.map((l) => (
                <Card key={l.usuarioId} padding="none">
                  <div className="p-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[12rem]">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{l.nome}</p>
                        {l.emFaseInicial && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">
                            em treinamento
                          </span>
                        )}
                        {l.fechado && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            fechado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {l.planoNome}
                        {l.mesesDeCasa !== null && ` · ${l.mesesDeCasa} mês(es) de casa`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-5 text-sm">
                      <div>
                        <p className="text-[11px] text-slate-500">Implantação</p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{brl(l.base)}</p>
                        <p className="text-[10px] text-slate-400">{l.processos} processo(s)</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Faixa</p>
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">{l.percentual}%</p>
                        <p className="text-[10px] text-slate-400">
                          {l.faixaDe === null ? 'abaixo da 1ª faixa' : `a partir de ${brl(l.faixaDe)}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Variável</p>
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">{brl(l.variavel)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Fixo</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">{brl(l.fixo)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Total</p>
                        <p className="font-bold text-slate-900 dark:text-slate-100">{brl(l.total)}</p>
                      </div>
                      <button onClick={() => alternarFechamento(l.usuarioId, l.fechado)}
                        title={l.fechado ? 'Reabrir a apuração' : 'Fechar e congelar o valor'}
                        className="self-center p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                        {l.fechado ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    {l.percMeta !== null && (
                      <>
                        <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                          <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Meta {brl(l.meta)}</span>
                          <span>{l.percMeta.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className={clsx('h-full rounded-full',
                            l.percMeta >= 100 ? 'bg-emerald-500' : l.percMeta >= 60 ? 'bg-amber-500' : 'bg-red-400')}
                            style={{ width: `${Math.min(l.percMeta, 100)}%` }} />
                        </div>
                      </>
                    )}
                    {l.proximaFaixa && !l.fechado && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        Faltam <strong className="text-slate-700 dark:text-slate-300">{brl(l.proximaFaixa.falta)}</strong> de
                        {' '}implantação para a faixa de {l.proximaFaixa.percentual}% — o percentual passa a valer sobre
                        {' '}tudo, somando <strong className="text-emerald-600 dark:text-emerald-400">
                          +{brl(l.proximaFaixa.ganhoExtra)}
                        </strong> no variável.
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Base de cálculo: implantação de {planos[0]?.baseCalculo === 'processo' ? 'processos abertos' : 'parcelas com vencimento'}
            {' '}no mês, pelo vendedor do processo de implantação. Fechar congela o valor: mudar o plano depois não altera o que já foi apurado.
          </p>
        </div>
      )}

      {/* ── Vendedores ── */}
      {!carregando && aba === 'vendedores' && (
        <div className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Vincular vendedor a um plano</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select className="input-field" value={novo.usuarioId}
                onChange={(e) => setNovo({ ...novo, usuarioId: e.target.value })}>
                <option value="">Vendedor...</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.processos} processos)</option>
                ))}
              </select>
              <select className="input-field" value={novo.planoId}
                onChange={(e) => setNovo({ ...novo, planoId: e.target.value })}>
                <option value="">Plano...</option>
                {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <input type="date" className="input-field" title="Data de admissão"
                value={novo.dataAdmissao} onChange={(e) => setNovo({ ...novo, dataAdmissao: e.target.value })} />
              <input type="number" step="0.01" className="input-field" placeholder="Fixo próprio (opcional)"
                value={novo.fixoPersonalizado} onChange={(e) => setNovo({ ...novo, fixoPersonalizado: e.target.value })} />
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input-field" placeholder="Meta própria"
                  value={novo.metaIndividual} onChange={(e) => setNovo({ ...novo, metaIndividual: e.target.value })} />
                <Button onClick={adicionarVendedor}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              A admissão define quando acaba o fixo de treinamento. Fixo e meta próprios sobrepõem o plano só para essa pessoa.
            </p>
          </Card>

          <Card padding="none">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="px-4 py-2.5 font-medium">Plano</th>
                  <th className="px-4 py-2.5 font-medium">Admissão</th>
                  <th className="px-4 py-2.5 font-medium text-right">Fixo próprio</th>
                  <th className="px-4 py-2.5 font-medium text-right">Meta própria</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.usuarioId} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">
                      {v.nome}
                      {!v.ativo && <span className="ml-2 text-[10px] text-slate-400">inativo</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{v.planoNome ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {v.dataAdmissao ? v.dataAdmissao.split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {v.fixoPersonalizado == null ? <span className="text-slate-400">do plano</span> : brl(v.fixoPersonalizado)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {v.metaIndividual == null ? <span className="text-slate-400">do plano</span> : brl(v.metaIndividual)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removerVendedor(v)} title="Remover do plano"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {vendedores.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>Nenhum vendedor vinculado.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Plano e faixas ── */}
      {!carregando && aba === 'plano' && plano && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Plano</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome</label>
                <input className="input-field" value={plano.nome}
                  onChange={(e) => setPlano({ ...plano, nome: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Descrição</label>
                <textarea className="input-field" rows={2} value={plano.descricao ?? ''}
                  onChange={(e) => setPlano({ ...plano, descricao: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Fixo em treinamento</label>
                  <input type="number" step="0.01" className="input-field" value={plano.fixoInicial}
                    onChange={(e) => setPlano({ ...plano, fixoInicial: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Fixo efetivo</label>
                  <input type="number" step="0.01" className="input-field" value={plano.fixoEfetivo}
                    onChange={(e) => setPlano({ ...plano, fixoEfetivo: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Meses de treinamento</label>
                  <input type="number" className="input-field" value={plano.mesesFaseInicial}
                    onChange={(e) => setPlano({ ...plano, mesesFaseInicial: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Meta de referência</label>
                  <input type="number" step="0.01" className="input-field" value={plano.metaReferencia}
                    onChange={(e) => setPlano({ ...plano, metaReferencia: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Base de cálculo</label>
                <select className="input-field" value={plano.baseCalculo}
                  onChange={(e) => setPlano({ ...plano, baseCalculo: e.target.value })}>
                  <option value="vencimento">Implantação com vencimento no mês</option>
                  <option value="processo">Implantação dos processos abertos no mês</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  O sistema registra o vencimento da parcela, não a confirmação do pagamento.
                </p>
              </div>
              <Button disabled={salvando} onClick={salvarPlano}>
                {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar plano</>}
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Escada de comissão</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              Atingida a faixa, o percentual vale sobre <strong>todo</strong> o faturamento de implantação do mês.
            </p>
            <div className="space-y-2">
              {plano.faixas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-14">a partir</span>
                  <input type="number" step="0.01" className="input-field flex-1" value={f.valorDe}
                    onChange={(e) => {
                      const faixas = [...plano.faixas]
                      faixas[i] = { ...f, valorDe: Number(e.target.value) }
                      setPlano({ ...plano, faixas })
                    }} />
                  <input type="number" step="0.001" className="input-field w-24" value={f.percentual}
                    onChange={(e) => {
                      const faixas = [...plano.faixas]
                      faixas[i] = { ...f, percentual: Number(e.target.value) }
                      setPlano({ ...plano, faixas })
                    }} />
                  <span className="text-xs text-slate-500">%</span>
                  <span className="text-xs text-slate-400 w-24 text-right">
                    {brl((f.valorDe * f.percentual) / 100)}
                  </span>
                  <button onClick={() => setPlano({ ...plano, faixas: plano.faixas.filter((_, j) => j !== i) })}
                    className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <Button variant="secondary"
                onClick={() => setPlano({ ...plano, faixas: [...plano.faixas, { id: 0, valorDe: 0, percentual: 0 }] })}>
                <Plus className="w-4 h-4" /> Nova faixa
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
