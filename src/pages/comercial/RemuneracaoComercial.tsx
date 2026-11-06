import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Loader2, Save, Plus, Trash2, Lock, Unlock, ChevronLeft, ChevronRight,
  Percent, Wallet, TrendingUp, Users, Target, Search, Pencil, X,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { TIPOS_AVULSA, tipoInfo } from '../../components/comercial/avulsas'
import type {
  ApuracaoComissao, CandidatoComissao, ComissaoAvulsa, TipoAvulsa, PlanoComissao, RateioVenda,
  RegraCanalComissao,
  VendedorComissao,
} from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ESCOPO_ROTULO: Record<string, string> = { todos: 'todos os produtos', command: 'só produtos Command', cilos: 'só produtos Cilos' }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
/** Último dia da competência AAAA-MM, para fechar o período da consulta. */
const fimDaCompetencia = (c: string) => {
  const [a, m] = c.split('-').map(Number)
  return `${c}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
}
const rotuloComp = (c: string) => {
  const [a, m] = c.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}
const mover = (comp: string, passos: number) => {
  const [a, m] = comp.split('-').map(Number)
  const d = new Date(a, m - 1 + passos, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Data sugerida para um prêmio: hoje, quando a competência é o mês corrente; o primeiro dia
 * dela quando é um mês passado. Lançar "hoje" num mês retroativo registraria uma data que
 * não aconteceu.
 */
const dataPadrao = (comp: string) => {
  const h = new Date()
  const atual = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
  return comp === atual ? `${atual}-${String(h.getDate()).padStart(2, '0')}` : `${comp}-01`
}

const dataBr = (d: string | null) => {
  if (!d) return null
  const [a2, m, dia] = d.split('-')
  return `${dia}/${m}/${a2}`
}

export function RemuneracaoComercial() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'apuracao' | 'premios' | 'vendedores' | 'rateio' | 'canais' | 'plano'>('apuracao')
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7))
  const [apuracao, setApuracao] = useState<ApuracaoComissao | null>(null)
  const [planos, setPlanos] = useState<PlanoComissao[]>([])
  const [vendedores, setVendedores] = useState<VendedorComissao[]>([])
  const [regrasCanal, setRegrasCanal] = useState<RegraCanalComissao[]>([])
  const [avulsas, setAvulsas] = useState<ComissaoAvulsa[]>([])
  const [vendas, setVendas] = useState<RateioVenda[]>([])
  const [buscaVenda, setBuscaVenda] = useState('')
  const [carregandoVendas, setCarregandoVendas] = useState(false)
  const [editandoRateio, setEditandoRateio] = useState<
    { venda: RateioVenda; linhas: Array<{ usuarioId: string; percentual: string }> } | null>(null)
  const [novoPremio, setNovoPremio] = useState<{
    usuarioId: string; data: string; tipo: TipoAvulsa
    descricao: string; observacao: string; valor: string
  }>({ usuarioId: '', data: '', tipo: 'premio', descricao: '', observacao: '', valor: '' })
  /** Lançamento aberto para edição. O motivo mais comum é a competência errada:
   *  prêmio conquistado num mês e pago no seguinte. */
  const [editandoPremio, setEditandoPremio] = useState<{
    id: number; usuarioId: string; competencia: string; data: string; tipo: TipoAvulsa
    descricao: string; observacao: string; valor: string
  } | null>(null)
  const [opcoesCanais, setOpcoesCanais] = useState<Array<{ canal: string; faturamento: number }>>([])
  const [novoCanal, setNovoCanal] = useState({ usuarioId: '', canal: '', blocoValor: '1000', valorPorBloco: '' })
  const [candidatos, setCandidatos] = useState<CandidatoComissao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [plano, setPlano] = useState<PlanoComissao | null>(null)
  const [novo, setNovo] = useState({ usuarioId: '', planoId: '', dataAdmissao: '',
    fixoPersonalizado: '', metaIndividual: '', bonusMeta: '', bonusTreinamento: false })

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

  async function criarPlano() {
    const nome = prompt('Nome do novo plano:')
    if (!nome?.trim()) return
    try {
      await api.criarPlanoComissao({ nome: nome.trim(), tipo: 'proporcional', valorBonus: 500, escopoProduto: 'command' })
      toast.success('Plano criado! Ajuste a meta, o bônus e o escopo abaixo.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível criar o plano.')
    }
  }

  const carregarCanais = useCallback(async () => {
    try {
      const [regras, opcoes] = await Promise.all([
        api.getApuracaoCanais({ inicio: `${competencia}-01`, fim: fimDaCompetencia(competencia) }),
        api.getOpcoesCanais(),
      ])
      setRegrasCanal(regras.itens)
      setOpcoesCanais(opcoes.filter((o) => o.faturamento > 0))
    } catch { /* a aba mostra vazia; o erro já aparece nas outras cargas */ }
  }, [competencia])

  useEffect(() => { if (aba === 'canais') void carregarCanais() }, [aba, carregarCanais])

  const carregarAvulsas = useCallback(async () => {
    try { setAvulsas(await api.getComissoesAvulsas(competencia)) } catch { /* lista vazia */ }
  }, [competencia])

  useEffect(() => { void carregarAvulsas() }, [carregarAvulsas])

  const carregarVendas = useCallback(async () => {
    setCarregandoVendas(true)
    try { setVendas(await api.getRateiosVenda(buscaVenda.trim() || undefined)) }
    catch (e: any) { toast.error(e?.message || 'Não foi possível carregar as vendas.') }
    finally { setCarregandoVendas(false) }
  }, [buscaVenda, toast])

  useEffect(() => { if (aba === 'rateio') void carregarVendas() }, [aba])

  function abrirRateio(v: RateioVenda) {
    setEditandoRateio({
      venda: v,
      // Já dividida, abre como está; nova, começa meio a meio com o vendedor atual.
      linhas: v.participantes.length > 0
        ? v.participantes.map((p) => ({ usuarioId: String(p.usuarioId), percentual: String(p.percentual) }))
        : [{ usuarioId: '', percentual: '50' }, { usuarioId: '', percentual: '50' }],
    })
  }

  async function salvarRateio() {
    if (!editandoRateio) return
    const participantes = editandoRateio.linhas
      .filter((l) => l.usuarioId && Number(l.percentual) > 0)
      .map((l) => ({ usuarioId: Number(l.usuarioId), percentual: Number(l.percentual) }))
    if (participantes.some((p, i) => participantes.findIndex((o) => o.usuarioId === p.usuarioId) !== i)) {
      toast.error('A mesma pessoa aparece duas vezes na divisão.')
      return
    }
    try {
      await api.salvarRateioVenda(editandoRateio.venda.idProcesso, participantes)
      toast.success(participantes.length ? 'Divisão salva.' : 'Divisão removida: a venda volta para o vendedor original.')
      setEditandoRateio(null)
      await Promise.all([carregarVendas(), carregar()])
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a divisão.')
    }
  }

  async function adicionarPremio() {
    if (!novoPremio.usuarioId || !novoPremio.descricao.trim() || !(Number(novoPremio.valor) > 0)) {
      toast.error('Escolha a pessoa, descreva o prêmio e informe o valor.')
      return
    }
    // A competência sai da DATA do lançamento, não do mês aberto na tela. Lançar em
    // novembro um prêmio datado de outubro já jogou onze registros no mês errado: o mês
    // que a pessoa está olhando não diz nada sobre quando o prêmio foi conquistado. Para
    // pagar num mês diferente do da conquista, o campo existe na edição da linha.
    const dataEscolhida = novoPremio.data || dataPadrao(competencia)
    const compDoLancamento = dataEscolhida.slice(0, 7)
    try {
      await api.criarComissaoAvulsa({
        usuarioId: Number(novoPremio.usuarioId),
        competencia: compDoLancamento,
        data: dataEscolhida,
        tipo: novoPremio.tipo,
        descricao: novoPremio.descricao.trim(),
        observacao: novoPremio.observacao.trim(),
        valor: Number(novoPremio.valor),
      })
      toast.success(compDoLancamento === competencia
        ? 'Lançamento registrado.'
        : `Lançamento registrado em ${rotuloComp(compDoLancamento)}, pela data informada.`)
      // O tipo fica: quem lança treinamento costuma lançar vários seguidos.
      setNovoPremio({
        usuarioId: '', data: '', tipo: novoPremio.tipo,
        descricao: '', observacao: '', valor: '',
      })
      await Promise.all([carregarAvulsas(), carregar()])
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível lançar.')
    }
  }

  function abrirEdicaoPremio(a: ComissaoAvulsa) {
    setEditandoPremio({
      id: a.id,
      usuarioId: String(a.usuarioId),
      competencia: a.competencia,
      data: a.data ?? '',
      tipo: a.tipo,
      descricao: a.descricao,
      observacao: a.observacao ?? '',
      valor: String(a.valor),
    })
  }

  async function salvarPremioEditado() {
    if (!editandoPremio) return
    const e = editandoPremio
    if (!e.usuarioId || !e.descricao.trim() || !(Number(e.valor) > 0)) {
      toast.error('Escolha a pessoa, descreva o prêmio e informe o valor.')
      return
    }
    if (!/^\d{4}-\d{2}$/.test(e.competencia)) {
      toast.error('Informe o mês de pagamento.')
      return
    }
    try {
      await api.atualizarComissaoAvulsa(e.id, {
        usuarioId: Number(e.usuarioId),
        competencia: e.competencia,
        data: e.data || `${e.competencia}-01`,
        tipo: e.tipo,
        descricao: e.descricao.trim(),
        observacao: e.observacao.trim(),
        valor: Number(e.valor),
      })
      // Mudar a competência tira o lançamento desta lista — por isso o aviso diz para onde foi.
      toast.success(e.competencia === competencia
        ? 'Lançamento atualizado.'
        : `Lançamento movido para ${rotuloComp(e.competencia)}.`)
      setEditandoPremio(null)
      await Promise.all([carregarAvulsas(), carregar()])
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar.')
    }
  }

  async function removerPremio(a: ComissaoAvulsa) {
    if (!confirm(`Remover "${a.descricao}" de ${a.usuario} (${brl(a.valor)})?`)) return
    try {
      await api.excluirComissaoAvulsa(a.id)
      await Promise.all([carregarAvulsas(), carregar()])
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível remover.')
    }
  }

  async function adicionarRegraCanal() {
    if (!novoCanal.usuarioId || !novoCanal.canal) {
      toast.error('Escolha a pessoa e o canal.')
      return
    }
    try {
      await api.salvarRegraCanal({
        usuarioId: Number(novoCanal.usuarioId),
        canal: novoCanal.canal,
        blocoValor: Number(novoCanal.blocoValor) || 0,
        valorPorBloco: Number(novoCanal.valorPorBloco) || 0,
      })
      toast.success('Regra salva.')
      setNovoCanal({ usuarioId: '', canal: '', blocoValor: '1000', valorPorBloco: '' })
      await carregarCanais()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a regra.')
    }
  }

  async function removerRegraCanal(r: RegraCanalComissao) {
    if (!confirm(`Remover a regra de ${r.usuario} no canal ${r.canal}?`)) return
    try {
      await api.excluirRegraCanal(r.id)
      await carregarCanais()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível remover.')
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
        bonusMeta: novo.bonusMeta === '' ? undefined : Number(novo.bonusMeta),
        bonusTreinamento: novo.bonusTreinamento,
      })
      setNovo({ usuarioId: '', planoId: '', dataAdmissao: '', fixoPersonalizado: '',
        metaIndividual: '', bonusMeta: '', bonusTreinamento: false })
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
        {([['apuracao', 'Apuração'], ['premios', 'Prêmios avulsos'], ['vendedores', 'Vendedores'],
          ['rateio', 'Divisão de vendas'], ['canais', 'Canais de aquisição'],
          ['plano', 'Plano e faixas']] as const).map(([id, rotulo]) => (
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
      {/* ── Prêmios avulsos: aba própria, no mês selecionado no topo ── */}
      {!carregando && aba === 'premios' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Prêmios e comissões avulsas de {rotuloComp(competencia)}
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Para o que não tem regra no sistema. <strong>Prêmio</strong> é pago direto, somado ao
            total da pessoa no mês informado. <strong>Treinamento</strong> e{' '}
            <strong>pagamento do cliente</strong> entram na base de comissão: não são pagos à
            parte, sobem a produção e rendem pelo percentual da faixa. Competência já fechada
            não aceita lançamento.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <select className="input-field" value={novoPremio.tipo} title="Tipo do lançamento"
              onChange={(e) => setNovoPremio({ ...novoPremio, tipo: e.target.value as TipoAvulsa })}>
              {TIPOS_AVULSA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
            <select className="input-field" value={novoPremio.usuarioId}
              onChange={(e) => setNovoPremio({ ...novoPremio, usuarioId: e.target.value })}>
              <option value="">Quem recebe...</option>
              {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input type="date" className="input-field" title="Data da premiação"
              value={novoPremio.data || dataPadrao(competencia)}
              onChange={(e) => setNovoPremio({ ...novoPremio, data: e.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Motivo (ex.: melhor nota do suporte)"
              value={novoPremio.descricao}
              onChange={(e) => setNovoPremio({ ...novoPremio, descricao: e.target.value })} />
            <div className="flex gap-2">
              <input type="number" step="0.01" className="input-field" placeholder="Valor R$"
                value={novoPremio.valor}
                onChange={(e) => setNovoPremio({ ...novoPremio, valor: e.target.value })} />
              <Button onClick={adicionarPremio}><Plus className="w-4 h-4" /></Button>
            </div>
            <input className="input-field md:col-span-2 xl:col-span-6" maxLength={500}
              placeholder="Observação (opcional) — o contexto que explica o lançamento depois"
              value={novoPremio.observacao}
              onChange={(e) => setNovoPremio({ ...novoPremio, observacao: e.target.value })} />
            {(novoPremio.data || dataPadrao(competencia)).slice(0, 7) !== competencia && (
              <p className="md:col-span-2 xl:col-span-6 text-[11px] text-amber-600 dark:text-amber-400">
                Pela data informada, este lançamento entra em{' '}
                {rotuloComp((novoPremio.data || dataPadrao(competencia)).slice(0, 7))} — não
                aparecerá nesta lista. Para pagar noutro mês, lance e ajuste o mês de pagamento
                na edição da linha.
              </p>
            )}
          </div>

          {avulsas.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
              {avulsas.map((a) => (editandoPremio?.id === a.id ? (
                /* Edição no lugar da linha: o conserto mais comum é a competência, e trocar
                   de tela para isso fazia perder de vista o resto da lista. */
                <div key={a.id} className="px-3 py-3 bg-slate-50 dark:bg-slate-800/60">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <select className="input-field" value={editandoPremio.tipo} title="Tipo do lançamento"
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, tipo: e.target.value as TipoAvulsa })}>
                      {TIPOS_AVULSA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                    </select>
                    <select className="input-field" value={editandoPremio.usuarioId}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, usuarioId: e.target.value })}>
                      <option value="">Quem recebe...</option>
                      {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <input type="date" className="input-field" title="Data da premiação"
                      value={editandoPremio.data}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, data: e.target.value })} />
                    <input type="month" className="input-field" title="Mês em que o valor é pago"
                      value={editandoPremio.competencia}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, competencia: e.target.value })} />
                    <input className="input-field" placeholder="Motivo"
                      value={editandoPremio.descricao}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, descricao: e.target.value })} />
                    <input type="number" step="0.01" className="input-field" placeholder="Valor R$"
                      value={editandoPremio.valor}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, valor: e.target.value })} />
                    <input className="input-field md:col-span-2 xl:col-span-6" maxLength={500}
                      placeholder="Observação (opcional)"
                      value={editandoPremio.observacao}
                      onChange={(e) => setEditandoPremio({ ...editandoPremio, observacao: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button onClick={salvarPremioEditado}><Save className="w-4 h-4" /> Salvar</Button>
                    <Button variant="secondary" onClick={() => setEditandoPremio(null)}>
                      <X className="w-4 h-4" /> Cancelar
                    </Button>
                    {editandoPremio.competencia !== competencia && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        Sai desta lista: passa a ser pago em {rotuloComp(editandoPremio.competencia)}.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={clsx('badge shrink-0', tipoInfo(a.tipo).classe)}>
                        {tipoInfo(a.tipo).rotulo}
                      </span>
                      <span className="text-slate-800 dark:text-slate-100 truncate">
                        {a.usuario} — {a.descricao}
                      </span>
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {dataBr(a.data) ? `premiado em ${dataBr(a.data)}` : 'sem data informada'}
                      {a.criadoPor ? ` · lançado por ${a.criadoPor}` : ''}
                    </span>
                    {a.observacao && (
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 italic">
                        {a.observacao}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{brl(a.valor)}</span>
                    <button onClick={() => abrirEdicaoPremio(a)} title="Editar"
                      className="text-slate-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => removerPremio(a)} title="Remover"
                      className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </span>
                </div>
              )))}
            </div>
          )}
        </Card>
      )}

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
                        <p className="text-[11px] text-slate-500">
                          {l.baseEmpresa ? 'Resultado da empresa' : 'Base do mês'}
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{brl(l.base)}</p>
                        <p className="text-[10px] text-slate-400">
                          {l.baseEmpresa
                            ? ESCOPO_ROTULO[l.escopoProduto] ?? l.escopoProduto
                            : `${l.processos} processo(s)`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">{l.baseEmpresa ? 'Meta atingida' : 'Faixa'}</p>
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {l.baseEmpresa ? `${(l.percMeta ?? 0).toFixed(0)}%` : `${l.percentual}%`}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {l.baseEmpresa
                            ? 'do bônus do plano'
                            : l.faixaDe === null ? 'abaixo da 1ª faixa' : `a partir de ${brl(l.faixaDe)}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">{l.baseEmpresa ? 'Bônus' : 'Variável'}</p>
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
                    {l.base > 0 && !l.baseEmpresa && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px]">
                        {([
                          ['Implantação', l.composicao.implantacao],
                          ['Migração', l.composicao.migracao],
                          ['Mensalidade da venda', l.composicao.mensalidadeVenda],
                          ['Mensalidade nova', l.composicao.mensalidadeNova],
                          ['Upgrades', l.composicao.upgrades],
                          ['PayCore', l.composicao.paycore],
                          ['Avulsos', l.composicao.avulsos],
                        ] as const).filter(([, v]) => v > 0).map(([rotulo, v]) => (
                          <span key={rotulo} className="text-slate-500">
                            {rotulo}: <strong className="text-slate-700 dark:text-slate-300">{brl(v)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
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
            Base de cálculo: implantação e migração de {planos[0]?.baseCalculo === 'processo' ? 'processos abertos' : 'parcelas com vencimento'}
            {' '}no mês, mais a mensalidade dos clientes novos, os upgrades e as assinaturas do PayCore
            {' '}atribuídas ao vendedor. É diferente do Boletim Comercial, que mede só receita recorrente
            {' '}nova e não inclui implantação. Fechar congela o valor: mudar o plano depois não altera o que já foi apurado.
          </p>
        </div>
      )}

      {/* ── Divisão de vendas ── */}
      {!carregando && aba === 'rateio' && (
        <div className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Dividir uma venda entre vendedores
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Para quando um abre a venda e outro fecha. Com a divisão salva, cada um leva a sua
              fatia na base da meta — e o vendedor do processo deixa de levar tudo. Some os
              percentuais até 100%. Para desfazer, apague as linhas e salve.
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[16rem]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={buscaVenda} onChange={(e) => setBuscaVenda(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void carregarVendas() }}
                  placeholder="Cliente ou número do processo..."
                  className="input-field w-full pl-9" />
              </div>
              <Button variant="secondary" loading={carregandoVendas} onClick={() => void carregarVendas()}>
                Buscar
              </Button>
            </div>
          </Card>

          <Card padding="none">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Venda</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Data</th>
                  <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                  <th className="px-4 py-2.5 font-medium">Quem leva</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {carregandoVendas ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500 inline" />
                  </td></tr>
                ) : vendas.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma venda encontrada.
                  </td></tr>
                ) : vendas.map((v) => (
                  <tr key={v.idProcesso} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-2.5 text-slate-500">#{v.idProcesso}</td>
                    <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{v.cliente ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {v.data ? v.data.split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{brl(v.valorTotal)}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {v.participantes.length === 0
                        ? <span className="text-slate-400">{v.vendedorOriginal ?? 'sem vendedor'} (inteira)</span>
                        : v.participantes.map((pp) => `${pp.usuario} ${pp.percentual}%`).join(' · ')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => abrirRateio(v)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        {v.participantes.length ? 'alterar' : 'dividir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {editandoRateio && (
        <Modal isOpen onClose={() => setEditandoRateio(null)}
          title={`Dividir a venda #${editandoRateio.venda.idProcesso}`} size="md">
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {editandoRateio.venda.cliente ?? 'Cliente sem nome'}
              </p>
              <p className="text-xs text-slate-500">
                {brl(editandoRateio.venda.valorTotal)} · vendedor no processo:{' '}
                {editandoRateio.venda.vendedorOriginal ?? '—'}
              </p>
            </div>

            {editandoRateio.linhas.map((l, i) => (
              // Grid em vez de flex: .input-field traz w-full e vence as larguras utilitárias,
              // entao o campo de percentual tomava a linha toda e o select sumia.
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2 items-center">
                <select className="input-field" value={l.usuarioId}
                  onChange={(e) => setEditandoRateio({
                    ...editandoRateio,
                    linhas: editandoRateio.linhas.map((x, j) => j === i ? { ...x, usuarioId: e.target.value } : x),
                  })}>
                  <option value="">Vendedor...</option>
                  {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="number" step="0.01" min="0" max="100" className="input-field"
                  placeholder="%" value={l.percentual}
                  onChange={(e) => setEditandoRateio({
                    ...editandoRateio,
                    linhas: editandoRateio.linhas.map((x, j) => j === i ? { ...x, percentual: e.target.value } : x),
                  })} />
                <button onClick={() => setEditandoRateio({
                  ...editandoRateio,
                  linhas: editandoRateio.linhas.filter((_, j) => j !== i),
                })} className="text-slate-400 hover:text-red-500 px-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <button onClick={() => setEditandoRateio({
                ...editandoRateio,
                linhas: [...editandoRateio.linhas, { usuarioId: '', percentual: '' }],
              })} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                + adicionar vendedor
              </button>
              {(() => {
                const soma = editandoRateio.linhas.reduce((t, l) => t + (Number(l.percentual) || 0), 0)
                const vazio = editandoRateio.linhas.every((l) => !l.usuarioId)
                return (
                  <span className={clsx('text-xs font-medium',
                    vazio ? 'text-slate-400'
                      : Math.abs(soma - 100) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                    {vazio ? 'sem divisão — volta para o vendedor original' : `soma: ${soma.toFixed(2)}%`}
                  </span>
                )
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditandoRateio(null)}>Cancelar</Button>
              <Button onClick={() => void salvarRateio()}>Salvar divisão</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Canais de aquisição ── */}
      {!carregando && aba === 'canais' && (
        <div className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Comissão por canal de aquisição
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              A cada bloco fechado no canal, um valor. Exemplo: R$ 50 a cada R$ 1.000 ganhos no
              tráfego pago. Vale o que o canal inteiro fechou no mês, não o que a pessoa vendeu —
              é remuneração de quem traz o lead, não de quem fecha.
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select className="input-field" value={novoCanal.usuarioId}
                onChange={(e) => setNovoCanal({ ...novoCanal, usuarioId: e.target.value })}>
                <option value="">Pessoa...</option>
                {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select className="input-field" value={novoCanal.canal}
                onChange={(e) => setNovoCanal({ ...novoCanal, canal: e.target.value })}>
                <option value="">Canal...</option>
                {opcoesCanais.map((o) => (
                  <option key={o.canal} value={o.canal}>{o.canal} ({brl(o.faturamento)})</option>
                ))}
              </select>
              <input type="number" step="0.01" className="input-field" placeholder="A cada R$"
                value={novoCanal.blocoValor}
                onChange={(e) => setNovoCanal({ ...novoCanal, blocoValor: e.target.value })} />
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input-field" placeholder="Paga R$"
                  value={novoCanal.valorPorBloco}
                  onChange={(e) => setNovoCanal({ ...novoCanal, valorPorBloco: e.target.value })} />
                <Button onClick={adicionarRegraCanal}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>

          <Card padding="none">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Pessoa</th>
                  <th className="px-4 py-2.5 font-medium">Canal</th>
                  <th className="px-4 py-2.5 font-medium">Regra</th>
                  <th className="px-4 py-2.5 font-medium text-right">Fechado no mês</th>
                  <th className="px-4 py-2.5 font-medium text-right">Blocos</th>
                  <th className="px-4 py-2.5 font-medium text-right">Comissão</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {regrasCanal.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{r.usuario ?? `#${r.usuarioId}`}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.canal}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {brl(r.valorPorBloco)} a cada {brl(r.blocoValor)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200">
                      {brl(r.faturamento ?? 0)}
                      <span className="block text-[11px] text-slate-400">{r.negocios ?? 0} negócio(s)</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">{r.blocos ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {brl(r.valor ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removerRegraCanal(r)} title="Remover regra"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {regrasCanal.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    Nenhuma regra de canal cadastrada.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Vendedores ── */}
      {!carregando && aba === 'vendedores' && (
        <div className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Vincular vendedor a um plano</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
              <select className="input-field" value={novo.usuarioId}
                onChange={(e) => setNovo({ ...novo, usuarioId: e.target.value })}>
                <option value="">Vendedor...</option>
                {/* A contagem só aparece para quem já vendeu: "(0 processos)" em 23 linhas
                    seria ruído, e agora a lista traz todo usuário ativo. */}
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}{c.processos > 0 ? ` (${c.processos} processos)` : ''}
                  </option>
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
              <input type="number" step="0.01" className="input-field" placeholder="Meta própria"
                value={novo.metaIndividual} onChange={(e) => setNovo({ ...novo, metaIndividual: e.target.value })} />
              {/* Bônus por meta batida: valor por pessoa, porque um líder ganha 500 e outro 700. */}
              <input type="number" step="0.01" className="input-field" placeholder="Bônus por meta (R$)"
                title="Valor cheio do bônus quando a meta geral fecha em 100%"
                value={novo.bonusMeta} onChange={(e) => setNovo({ ...novo, bonusMeta: e.target.value })} />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  <input type="checkbox" checked={novo.bonusTreinamento}
                    onChange={(e) => setNovo({ ...novo, bonusTreinamento: e.target.checked })} />
                  bônus treino
                </label>
                <Button onClick={adicionarVendedor}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              A admissão define quando acaba o fixo de treinamento. Fixo e meta próprios sobrepõem o plano só para essa pessoa.
              O <strong>bônus por meta</strong> é o valor cheio a 100%: a pessoa recebe o mesmo percentual que a meta geral
              atingir — 98% da meta pagam 98% do valor, 105% pagam 105%, sem teto. Deixe em branco para quem não recebe por meta.
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
                  <th className="px-4 py-2.5 font-medium text-right">Bônus por meta</th>
                  <th className="px-4 py-2.5 font-medium text-center">Bônus treino</th>
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
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {v.bonusMeta == null ? <span className="text-slate-400">não recebe</span> : brl(v.bonusMeta)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {v.bonusTreinamento
                        ? <span className="text-emerald-500 text-xs">sim</span>
                        : <span className="text-slate-400 text-xs">não</span>}
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
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={8}>Nenhum vendedor vinculado.</td></tr>
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Plano</h3>
              <div className="flex gap-2">
                <select className="input-field w-52" value={plano.id}
                  onChange={(e) => setPlano(planos.find((x) => x.id === Number(e.target.value)) ?? plano)}>
                  {planos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <Button variant="secondary" onClick={criarPlano}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
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
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Como a comissão é calculada</label>
                  <select className="input-field" value={plano.tipo}
                    onChange={(e) => setPlano({ ...plano, tipo: e.target.value })}>
                    <option value="escada">Escada — percentual sobre o que a própria pessoa vendeu</option>
                    <option value="proporcional">Proporcional — bônus × % da meta que a empresa bateu</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Quais produtos contam na base</label>
                  <select className="input-field" value={plano.escopoProduto}
                    onChange={(e) => setPlano({ ...plano, escopoProduto: e.target.value })}>
                    <option value="todos">Todos os produtos</option>
                    <option value="command">Só produtos Command</option>
                    <option value="cilos">Só produtos Cilos</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Os produtos Cilos são os do servidor PaycoreCilos. Implantação, mensalidade e
                    upgrades da base própria são sempre Command.
                  </p>
                </div>
                {plano.tipo === 'proporcional' && (
                  <div className="sm:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Valor do bônus (100% da meta)</label>
                    <input type="number" step="0.01" className="input-field" value={plano.valorBonus}
                      onChange={(e) => setPlano({ ...plano, valorBonus: Number(e.target.value) })} />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Bateu 80% da meta, paga 80% disso; bateu 110%, paga 110%. Não há teto.
                    </p>
                  </div>
                )}
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

          {plano.tipo === 'proporcional' ? (
            <Card>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Como fica o bônus</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Simulação sobre a meta de {brl(plano.metaReferencia)} e o bônus de {brl(plano.valorBonus)}.
              </p>
              <div className="space-y-1.5">
                {[50, 70, 80, 90, 100, 110, 130, 150].map((pc) => (
                  <div key={pc} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs odd:bg-slate-50 dark:odd:bg-slate-900/40">
                    <span className="text-slate-600 dark:text-slate-300">
                      {pc}% da meta — {brl((plano.metaReferencia * pc) / 100)}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {brl((plano.valorBonus * pc) / 100)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                Este plano não usa escada: o bônus acompanha o resultado da empresa, não o individual.
              </p>
            </Card>
          ) : (
          <Card>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Escada de comissão</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              Atingida a faixa, o percentual vale sobre <strong>toda</strong> a base do mês. Você digita
              o piso de cada faixa e o percentual; o "até" vem do degrau seguinte.
            </p>
            <div className="space-y-2">
              {[...plano.faixas].map((f, i) => {
                // O "até" não é digitado: é o degrau seguinte menos um centavo.
                const proximo = plano.faixas
                  .filter((x) => x.valorDe > f.valorDe)
                  .sort((a2, b2) => a2.valorDe - b2.valorDe)[0]
                return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-8">de</span>
                  <input type="number" step="0.01" className="input-field flex-1" value={f.valorDe}
                    onChange={(e) => {
                      const faixas = [...plano.faixas]
                      faixas[i] = { ...f, valorDe: Number(e.target.value) }
                      setPlano({ ...plano, faixas })
                    }} />
                  <span className="text-xs text-slate-500 w-8 text-center">até</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300 w-28 text-right tabular-nums">
                    {proximo ? brl(proximo.valorDe - 0.01) : 'em diante'}
                  </span>
                  <input type="number" step="0.001" className="input-field w-20" value={f.percentual}
                    onChange={(e) => {
                      const faixas = [...plano.faixas]
                      faixas[i] = { ...f, percentual: Number(e.target.value) }
                      setPlano({ ...plano, faixas })
                    }} />
                  <span className="text-xs text-slate-500">%</span>
                  <button onClick={() => setPlano({ ...plano, faixas: plano.faixas.filter((_, j) => j !== i) })}
                    className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                )
              })}
              <Button variant="secondary"
                onClick={() => setPlano({ ...plano, faixas: [...plano.faixas, { id: 0, valorDe: 0, percentual: 0 }] })}>
                <Plus className="w-4 h-4" /> Nova faixa
              </Button>
            </div>
          </Card>
          )}
        </div>
      )}
    </div>
  )
}
