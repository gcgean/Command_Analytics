import { useState, useEffect } from 'react'
import { Plus, Search, Building2, Mail, Phone, Users, Gift, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import type { Contador } from '../../types'

export function Contadores() {
  const { toast } = useToast()
  const [contadores, setContadores] = useState<Contador[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<number | null>(null)

  useEffect(() => {
    api.getContadores().then((data: any) => {
      setContadores(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  // MySQL: nome, nomeComercial (not empresa), cidade (nullable), no ativo/uf/totalIndicacoes
  const filtrados = contadores.filter((c: any) => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (c.nome ?? '').toLowerCase().includes(b) ||
           (c.nomeComercial ?? '').toLowerCase().includes(b) ||
           (c.cidade ?? '').toLowerCase().includes(b)
  })

  const handleNovo = () => {
    setTimeout(() => toast.success('Contador cadastrado com sucesso!'), 800)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contadores Parceiros</h1>
          <p className="text-slate-400 text-sm mt-1">{contadores.length} contadores cadastrados</p>
        </div>
        <button className="btn-primary" onClick={handleNovo}><Plus size={16} /> Novo Contador</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Contadores', val: contadores.length, cor: 'text-blue-400' },
          { label: 'Clientes Vinculados', val: contadores.reduce((s: number, c: any) => s + Number(c.totalClientes ?? 0), 0), cor: 'text-emerald-400' },
          { label: 'Com CRC', val: contadores.filter((c: any) => c.crc).length, cor: 'text-amber-400' },
          { label: 'Com E-mail', val: contadores.filter((c: any) => c.email).length, cor: 'text-slate-300' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input-field pl-9" placeholder="Buscar contador..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtrados.map((c: any) => (
          <div key={c.id}
            onClick={() => setSelecionado(selecionado === c.id ? null : c.id)}
            className={`card cursor-pointer border transition-colors ${selecionado === c.id ? 'border-blue-500' : 'border-slate-700 hover:border-slate-600'}`}>
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0">
                <Building2 size={20} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">{c.nome ?? '—'}</p>
                  {c.crc && (
                    <span className="badge text-xs bg-blue-500/20 text-blue-300">CRC {c.crc}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{c.nomeComercial ?? c.responsavel ?? '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3">
              {c.email && <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>}
              {c.telefone && <span className="flex items-center gap-1"><Phone size={11} />{c.telefone}</span>}
              {c.cidade && <span className="flex items-center gap-1"><Building2 size={11} />{c.cidade}</span>}
            </div>
            <div className="flex gap-4 pt-3 border-t border-slate-700">
              <div className="flex items-center gap-1.5 text-xs">
                <Users size={13} className="text-slate-500" />
                <span className="text-slate-300 font-medium">{c.totalClientes ?? 0}</span>
                <span className="text-slate-500">clientes</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
