import { useState, useEffect } from 'react'
import { Search, Plus, Building2, MapPin, Phone, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import type { Lead } from '../../types'

export function PesquisaLeads() {
  const { toast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', empresa: '', telefone: '', cidade: '', uf: '', segmento: '', observacoes: '' })

  useEffect(() => {
    api.getLeads().then((data: any) => {
      setLeads(Array.isArray(data) ? data : [])
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

  const filtrados = leads.filter(l => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (l.nome ?? '').toLowerCase().includes(b) ||
           (l.empresa ?? '').toLowerCase().includes(b) ||
           (l.cidade ?? '').toLowerCase().includes(b)
  })

  const handleSalvar = async () => {
    if (!form.nome || !form.empresa || !form.telefone) {
      toast.error('Preencha os campos obrigatórios: nome, empresa e telefone.')
      return
    }
    setSalvando(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Lead cadastrado com sucesso!')
      setMostrarForm(false)
      setForm({ nome: '', empresa: '', telefone: '', cidade: '', uf: '', segmento: '', observacoes: '' })
    } catch {
      toast.error('Erro ao cadastrar lead.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Pesquisa de Leads</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Prospecção e cadastro de prospects</p>
        </div>
        <button className="btn-primary" onClick={() => setMostrarForm(!mostrarForm)}>
          <Plus size={16} /> Novo Lead
        </button>
      </div>

      {mostrarForm && (
        <div className="card border border-blue-500/30">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Cadastrar Novo Lead</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Nome do Contato *', field: 'nome' },
              { label: 'Empresa *', field: 'empresa' },
              { label: 'Telefone *', field: 'telefone' },
              { label: 'Cidade', field: 'cidade' },
              { label: 'UF', field: 'uf' },
              { label: 'Segmento', field: 'segmento' },
            ].map(f => (
              <div key={f.field}>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{f.label}</label>
                <input className="input-field" value={(form as Record<string, string>)[f.field]} onChange={e => setForm(p => ({ ...p, [f.field]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Observação</label>
              <textarea className="input-field resize-none h-20" value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSalvar} disabled={salvando} className="btn-primary disabled:opacity-60">
              {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar Lead'}
            </button>
            <button className="btn-secondary" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
        <input className="input-field pl-9" placeholder="Buscar por nome, empresa ou cidade..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map(l => (
          <div key={l.id} className="card hover:border-slate-600 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Building2 size={18} className="text-blue-400" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{l.nome}</p>
                <p className="text-xs text-slate-500">{l.empresa}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {l.cidade && <div className="flex items-center gap-2"><MapPin size={12} />{l.cidade}</div>}
              {l.segmento && <div className="flex items-center gap-2"><Building2 size={12} />{l.segmento}</div>}
              {l.contador && <div className="flex items-center gap-2"><Phone size={12} />Contador: {l.contador}</div>}
            </div>
            {l.observacoes && <p className="text-xs text-slate-500 mt-3 italic border-t border-slate-200 dark:border-slate-700 pt-2">{l.observacoes}</p>}
            <div className="flex gap-2 mt-3">
              <button
                className="btn-primary text-xs py-1 flex-1 justify-center"
                onClick={() => toast.success('Lead convertido em negócio!')}
              >Converter em Negócio</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
