import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Database, Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { MigracaoTabelada, TipoMigracao } from '../../types'

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parseMoeda = (v: string) => Number(v.replace(/\D/g, '') || '0') / 100

const TIPOS: Array<{ valor: TipoMigracao; rotulo: string; cor: string }> = [
  { valor: 'basica', rotulo: 'Básica', cor: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  { valor: 'media', rotulo: 'Média', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  { valor: 'avancada', rotulo: 'Avançada', cor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' },
]

const rotuloTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t
const corTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.cor ?? 'bg-slate-100 text-slate-700'

type Form = { id: number | null; sistema: string; tipo: TipoMigracao; descricao: string; valor: number; ativo: boolean }
const FORM_VAZIO: Form = { id: null, sistema: '', tipo: 'basica', descricao: '', valor: 0, ativo: true }

export function TabelaMigracao() {
  const { toast } = useToast()
  const [itens, setItens] = useState<MigracaoTabelada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [repasse, setRepasse] = useState(30)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, params] = await Promise.all([
        api.getMigracoes(true),
        api.getParametrosPrecificacao().catch(() => null),
      ])
      setItens(lista)
      if (params?.migracaoRepassePerc !== undefined) setRepasse(params.migracaoRepassePerc)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a tabela de migração.')
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => { void carregar() }, [carregar])

  const porSistema = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtrados = termo
      ? itens.filter((i) => `${i.sistema} ${i.descricao ?? ''}`.toLowerCase().includes(termo))
      : itens
    const mapa = new Map<string, MigracaoTabelada[]>()
    for (const i of filtrados) {
      const lista = mapa.get(i.sistema) ?? []
      lista.push(i)
      mapa.set(i.sistema, lista)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [itens, busca])

  async function salvar() {
    if (!form) return
    if (!form.sistema.trim()) { toast.error('Informe o sistema de origem.'); return }
    setSalvando(true)
    try {
      if (form.id) await api.atualizarMigracao(form.id, form)
      else await api.criarMigracao(form)
      toast.success(form.id ? 'Migração atualizada!' : 'Migração cadastrada!')
      setForm(null)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(item: MigracaoTabelada) {
    if (!window.confirm(`Excluir a migração ${rotuloTipo(item.tipo)} de ${item.sistema}?`)) return
    try {
      await api.excluirMigracao(item.id)
      toast.success('Migração excluída.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white"><Database size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tabela de Migração</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Valor cobrado por sistema de origem e nível de migração. O vendedor só seleciona na precificação.
            </p>
          </div>
        </div>
        <Button onClick={() => setForm(FORM_VAZIO)}><Plus className="w-4 h-4" /> Nova migração</Button>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        O custo da migração para a empresa é o <strong>repasse de {repasse}%</strong> ao parceiro que executa — o
        restante é margem. Esse percentual fica em Configurações › Precificação.
      </div>

      <div className="w-full sm:w-80 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input-field pl-9" placeholder="Buscar por sistema..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : porSistema.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <Database className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">Nenhuma migração cadastrada.</p>
            <p className="text-xs text-slate-400 mt-1">
              Cadastre os sistemas de origem que vocês costumam migrar, com o valor de cada nível.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {porSistema.map(([sistema, lista]) => (
            <Card key={sistema} padding="none">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{sistema}</p>
                <Button size="sm" variant="secondary" onClick={() => setForm({ ...FORM_VAZIO, sistema })}>
                  <Plus className="w-3.5 h-3.5" /> Nível
                </Button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {lista.map((item) => (
                  <div key={item.id} className="p-4 flex items-start gap-4 group">
                    <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0', corTipo(item.tipo))}>
                      {rotuloTipo(item.tipo)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {item.descricao || <span className="text-slate-400">Sem descrição do que é migrado neste nível.</span>}
                      </p>
                      {!item.ativo && <span className="text-[11px] text-red-500">inativa — não aparece na precificação</span>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-slate-800 dark:text-slate-200">{brl(item.valor)}</p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">custo {brl(item.valor * repasse / 100)}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                        onClick={() => setForm({ id: item.id, sistema: item.sistema, tipo: item.tipo as TipoMigracao, descricao: item.descricao ?? '', valor: item.valor, ativo: item.ativo })}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500" onClick={() => excluir(item)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Alterar migração' : 'Nova migração'}>
        {form && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Sistema de origem</label>
                <input className="input-field" placeholder="Ex.: Sistema XYZ, planilha Excel"
                  value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Nível</label>
                <select className="input-field" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMigracao })}>
                  {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">O que é migrado neste nível</label>
              <textarea className="input-field w-full h-24 resize-none"
                placeholder="Ex.: cadastro de produtos, clientes e fornecedores. Não inclui histórico de vendas."
                value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <p className="text-[11px] text-slate-400 mt-1">Esse texto ajuda o vendedor a explicar o que o cliente recebe.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Valor cobrado</label>
                <input className="input-field" value={brl(form.valor)} onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, valor: parseMoeda(e.target.value) })} />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Custo da empresa: {brl(form.valor * repasse / 100)} ({repasse}% de repasse)
                </p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
                  <input type="checkbox" className="accent-blue-600" checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Disponível para o vendedor
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
