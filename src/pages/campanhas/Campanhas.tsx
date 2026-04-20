import { useState, useEffect } from 'react'
import { Plus, Eye, Megaphone, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { DateInput } from '../../components/ui/DateInput'
import type { Campanha } from '../../types'

export function Campanhas() {
  const { toast } = useToast()
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', dataInicio: '', dataFim: '', tipo: 'Banner', segmento: '' })

  useEffect(() => {
    api.getCampanhas().then((data: any) => {
      setCampanhas(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const handleSalvar = async () => {
    if (!form.titulo || !form.descricao || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setSalvando(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Campanha criada com sucesso!')
      setMostrarForm(false)
      setForm({ titulo: '', descricao: '', dataInicio: '', dataFim: '', tipo: 'Banner', segmento: '' })
    } catch {
      toast.error('Erro ao criar campanha.')
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtiva = (id: number) => {
    setCampanhas(prev => prev.map(c => c.id === id ? { ...c, ativa: !c.ativa } : c))
    const campanha = campanhas.find(c => c.id === id)
    if (campanha) toast.info(campanha.ativa ? 'Campanha desativada.' : 'Campanha ativada.')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Campanhas de Marketing</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Banners e comunicados exibidos no portal do cliente</p>
        </div>
        <button className="btn-primary" onClick={() => setMostrarForm(!mostrarForm)}>
          <Plus size={16} /> Nova Campanha
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Campanhas Ativas', val: campanhas.filter(c => c.ativa).length, cor: 'text-emerald-400' },
          { label: 'Total Visualizações', val: campanhas.reduce((s, c) => s + c.visualizacoes, 0), cor: 'text-blue-400' },
          { label: 'Campanhas Encerradas', val: campanhas.filter(c => !c.ativa).length, cor: 'text-slate-600 dark:text-slate-400' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-600 dark:text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Formulário nova campanha */}
      {mostrarForm && (
        <div className="card border border-blue-500/30">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Nova Campanha</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Título *</label>
              <input className="input-field" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Descrição *</label>
              <textarea className="input-field resize-none h-20" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Início *</label>
              <DateInput mode="iso" value={form.dataInicio} onChange={(value) => setForm(p => ({ ...p, dataInicio: value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Fim *</label>
              <DateInput mode="iso" value={form.dataFim} onChange={(value) => setForm(p => ({ ...p, dataFim: value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Tipo</label>
              <select className="input-field" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                <option>Banner</option>
                <option>E-mail</option>
                <option>WhatsApp</option>
                <option>Notificação</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSalvar} disabled={salvando} className="btn-primary disabled:opacity-60">
              {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar Campanha'}
            </button>
            <button className="btn-secondary" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-4">
        {campanhas.map(c => (
          <div key={c.id} className={`card border ${c.ativa ? 'border-slate-200 dark:border-slate-700' : 'border-slate-800 opacity-60'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg flex-shrink-0 ${c.ativa ? 'bg-blue-500/10' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  <Megaphone size={18} className={c.ativa ? 'text-blue-400' : 'text-slate-500'} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.titulo}</p>
                    <span className={`badge text-xs ${c.ativa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                      {c.ativa ? 'Ativa' : 'Encerrada'}
                    </span>
                    <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs">{c.tipo}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{c.descricao}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{c.dataInicio.split('-').reverse().join('/')} → {c.dataFim.split('-').reverse().join('/')}</span>
                    <span className="flex items-center gap-1"><Eye size={11} /> {c.visualizacoes} visualizações</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button className="btn-secondary text-xs py-1" onClick={() => toggleAtiva(c.id)}>
                  {c.ativa ? <ToggleRight size={14} className="text-emerald-400" /> : <ToggleLeft size={14} />}
                  {c.ativa ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
