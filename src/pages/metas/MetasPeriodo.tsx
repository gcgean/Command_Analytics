import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Plus, Target, Trash2, Pencil, CheckCircle2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import type { MetaDev, Usuario, Projeto } from '../../types'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const formatarData = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '')

type Form = {
  id: number | null
  titulo: string
  detalhe: string
  desenvolvedorId: string
  projetoId: string
  periodoInicio: string
  periodoFim: string
}

/**
 * Metas do período — de qualquer setor, não só do desenvolvimento. A lista é uma checklist com
 * prazo, e o valor está no percentual: no fim do mês dá pra dizer, em um número, se os objetivos
 * de longo prazo andaram ou se o mês inteiro foi apagar incêndio.
 */
export function MetasPeriodo() {
  const { toast } = useToast()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const hoje = new Date()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)

  const [inicio, setInicio] = useState(iso(primeiroDia))
  const [fim, setFim] = useState(iso(ultimoDia))
  const [filtroDev, setFiltroDev] = useState('')
  const [filtroProjeto, setFiltroProjeto] = useState('')
  const [metas, setMetas] = useState<MetaDev[]>([])
  const [resumo, setResumo] = useState<{ total: number; concluidas: number; pendentes: number; percentual: number | null }>({
    total: 0, concluidas: 0, pendentes: 0, percentual: null,
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<Form | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.getMetasDev({
        inicio,
        fim,
        desenvolvedorId: filtroDev ? Number(filtroDev) : null,
        projetoId: filtroProjeto ? Number(filtroProjeto) : null,
      })
      setMetas(r.data)
      setResumo(r.resumo)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar as metas.')
    } finally {
      setCarregando(false)
    }
  }, [inicio, fim, filtroDev, filtroProjeto, toast])

  useEffect(() => { void carregar() }, [carregar])

  // Responsáveis e projetos são as mesmas listas do resto do sistema; projeto é opcional porque
  // meta de outro setor (financeiro, suporte, marketing) não tem projeto nenhum.
  useEffect(() => {
    api.getUsuarios().then(setUsuarios).catch(() => setUsuarios([]))
    api.getProjetos().then(setProjetos).catch(() => setProjetos([]))
  }, [])

  const abrirNova = () =>
    setForm({ id: null, titulo: '', detalhe: '', desenvolvedorId: filtroDev, projetoId: filtroProjeto, periodoInicio: inicio, periodoFim: fim })

  const abrirEdicao = (m: MetaDev) =>
    setForm({
      id: m.id,
      titulo: m.titulo,
      detalhe: m.detalhe ?? '',
      desenvolvedorId: m.desenvolvedorId ? String(m.desenvolvedorId) : '',
      projetoId: m.projetoId ? String(m.projetoId) : '',
      periodoInicio: String(m.periodoInicio).slice(0, 10),
      periodoFim: String(m.periodoFim).slice(0, 10),
    })

  const salvar = async () => {
    if (!form) return
    setSalvando(true)
    try {
      const dados = {
        titulo: form.titulo.trim(),
        detalhe: form.detalhe.trim(),
        desenvolvedorId: form.desenvolvedorId ? Number(form.desenvolvedorId) : null,
        projetoId: form.projetoId ? Number(form.projetoId) : null,
        periodoInicio: form.periodoInicio,
        periodoFim: form.periodoFim,
      }
      if (form.id) await api.atualizarMetaDev(form.id, dados)
      else await api.criarMetaDev(dados)
      toast.success(form.id ? 'Meta atualizada!' : 'Meta criada!')
      setForm(null)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a meta.')
    } finally {
      setSalvando(false)
    }
  }

  const alternar = async (m: MetaDev) => {
    // Otimista: marcar meta é o gesto mais repetido da tela, esperar o servidor a cada clique
    // deixaria a lista travando.
    setMetas(lista => lista.map(x => (x.id === m.id ? { ...x, concluida: !m.concluida } : x)))
    try {
      await api.concluirMetaDev(m.id, !m.concluida)
      void carregar()
    } catch (e: any) {
      setMetas(lista => lista.map(x => (x.id === m.id ? { ...x, concluida: m.concluida } : x)))
      toast.error(e?.message || 'Não foi possível atualizar a meta.')
    }
  }

  const excluir = async (m: MetaDev) => {
    if (!window.confirm(`Excluir a meta "${m.titulo}"?`)) return
    try {
      await api.excluirMetaDev(m.id)
      toast.success('Meta excluída.')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir a meta.')
    }
  }

  const corPercentual = (p: number) => (p >= 80 ? 'text-emerald-500' : p >= 50 ? 'text-amber-500' : 'text-red-500')
  const corBarra = (p: number) => (p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Metas do Período</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Os objetivos que não podem se perder no dia a dia — e quanto deles foi cumprido no período.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">De</label>
          <input type="date" className="input-field" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Até</label>
          <input type="date" className="input-field" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Responsável</label>
          <select className="input-field w-52" value={filtroDev} onChange={(e) => setFiltroDev(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || u.nomeUsu}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Projeto</label>
          <select className="input-field w-52" value={filtroProjeto} onChange={(e) => setFiltroProjeto(e.target.value)}>
            <option value="">Todos</option>
            {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <button className="btn-primary flex items-center gap-2 ml-auto" onClick={abrirNova}>
          <Plus size={16} /> Nova meta
        </button>
      </div>

      {/* Percentual atingido no período — o número que a reunião de fim de mês precisa. */}
      <div className="card flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <Target size={28} className="text-blue-500" />
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Atingido no período</p>
            {resumo.percentual === null ? (
              <p className="text-2xl font-bold text-slate-400">—</p>
            ) : (
              <p className={clsx('text-3xl font-bold', corPercentual(resumo.percentual))}>{resumo.percentual}%</p>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={clsx('h-2.5 rounded-full transition-all', corBarra(resumo.percentual ?? 0))}
              style={{ width: `${resumo.percentual ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {resumo.concluidas} de {resumo.total} meta(s) concluída(s) · {resumo.pendentes} pendente(s)
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : metas.length === 0 ? (
        <div className="card text-center py-10">
          <Target size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">Nenhuma meta definida para este período.</p>
          <p className="text-xs text-slate-400 mt-1">Use "Nova meta" para registrar os objetivos que não podem se perder no dia a dia.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700 !p-0">
          {metas.map(m => {
            const atrasada = !m.concluida && String(m.periodoFim).slice(0, 10) < iso(new Date())
            return (
              <div key={m.id} className="flex items-start gap-3 p-3 group">
                <input
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4 mt-0.5 flex-shrink-0 cursor-pointer"
                  checked={m.concluida}
                  onChange={() => void alternar(m)}
                />
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm', m.concluida ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200')}>
                    {m.titulo}
                  </p>
                  {m.detalhe && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{m.detalhe}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                    <span>{formatarData(m.periodoInicio)} → {formatarData(m.periodoFim)}</span>
                    {m.desenvolvedorNome && <span>👤 {m.desenvolvedorNome}</span>}
                    {m.projetoNome && <span>📁 {m.projetoNome}</span>}
                    {atrasada && <span className="text-red-500 font-medium">prazo vencido</span>}
                    {m.concluida && m.concluidaEm && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} /> {formatarData(m.concluidaEm)}
                        {m.concluidaPorNome ? ` · ${m.concluidaPorNome}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500" title="Editar" onClick={() => abrirEdicao(m)}>
                    <Pencil size={14} />
                  </button>
                  <button className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500" title="Excluir" onClick={() => void excluir(m)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Alterar meta' : 'Nova meta do período'}>
        {form && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Meta <span className="text-red-500">*</span></label>
              <input
                className="input-field"
                placeholder="Ex.: concluir a migração do módulo fiscal"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Detalhe (opcional)</label>
              <textarea
                className="input-field w-full h-20 resize-none"
                placeholder="O que precisa estar pronto para considerar essa meta cumprida"
                value={form.detalhe}
                onChange={(e) => setForm({ ...form, detalhe: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Início</label>
                <input type="date" className="input-field" value={form.periodoInicio} onChange={(e) => setForm({ ...form, periodoInicio: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Fim</label>
                <input type="date" className="input-field" value={form.periodoFim} onChange={(e) => setForm({ ...form, periodoFim: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Responsável</label>
                <select className="input-field" value={form.desenvolvedorId} onChange={(e) => setForm({ ...form, desenvolvedorId: e.target.value })}>
                  <option value="">Todos / equipe</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || u.nomeUsu}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Projeto</label>
                <select className="input-field" value={form.projetoId} onChange={(e) => setForm({ ...form, projetoId: e.target.value })}>
                  <option value="">Nenhum</option>
                  {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn-primary" disabled={!form.titulo.trim() || salvando} onClick={() => void salvar()}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
