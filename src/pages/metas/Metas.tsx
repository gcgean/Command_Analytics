import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Target, ThumbsUp, ThumbsDown, Minus, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import type { Meta, AvaliacaoNPS } from '../../types'

const npsData = [
  { setor: 'Suporte', promotores: 62, neutros: 20, detratores: 18, nps: 44 },
  { setor: 'Fiscal', promotores: 71, neutros: 15, detratores: 14, nps: 57 },
  { setor: 'Financeiro', promotores: 55, neutros: 25, detratores: 20, nps: 35 },
  { setor: 'Comercial', promotores: 80, neutros: 10, detratores: 10, nps: 70 },
  { setor: 'Treinamento', promotores: 75, neutros: 18, detratores: 7, nps: 68 },
]

const notaCor = (n: number) => n >= 9 ? 'text-emerald-400' : n >= 7 ? 'text-amber-400' : 'text-red-400'
const notaIcone = (n: number) => n >= 9 ? ThumbsUp : n >= 7 ? Minus : ThumbsDown

export function Metas() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [nps, setNps] = useState<AvaliacaoNPS[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getMetas(), api.getNPS()]).then(([metasData, npsApiData]: any[]) => {
      setMetas(Array.isArray(metasData) ? metasData : [])
      setNps(Array.isArray(npsApiData) ? npsApiData : [])
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Metas e NPS</h1>
        <p className="text-slate-400 text-sm mt-1">Acompanhamento de metas da equipe e satisfação dos clientes</p>
      </div>

      {/* Metas */}
      <div>
        <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Target size={18} className="text-blue-400" /> Metas do Período — Março 2026
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {metas.map(m => {
            const perc = Math.min((m.realizado / m.metaValor) * 100, 100)
            const cor = perc >= 100 ? 'bg-emerald-500' : perc >= 70 ? 'bg-amber-500' : 'bg-red-500'
            const textCor = perc >= 100 ? 'text-emerald-400' : perc >= 70 ? 'text-amber-400' : 'text-red-400'
            return (
              <div key={m.id} className="card">
                <p className="text-xs text-slate-400 mb-0.5">{m.departamento}</p>
                <p className="text-sm font-medium text-slate-200 mb-2">{m.descricao}</p>
                <div className="flex items-end justify-between mb-2">
                  <p className={`text-2xl font-bold ${textCor}`}>{m.realizado}</p>
                  <p className="text-xs text-slate-500">/ {m.metaValor} {m.unidade}</p>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 mb-1">
                  <div className={`h-2 rounded-full transition-all ${cor}`} style={{ width: `${perc}%` }} />
                </div>
                <p className={`text-xs font-semibold ${textCor}`}>{perc.toFixed(0)}% — {m.status}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* NPS por departamento */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-200 mb-4">NPS por Departamento</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={npsData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis dataKey="setor" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={90} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
            <Bar dataKey="promotores" name="Promotores (9-10)" fill="#10b981" radius={[0, 4, 4, 0]} stackId="a" />
            <Bar dataKey="neutros" name="Neutros (7-8)" fill="#f59e0b" stackId="a" />
            <Bar dataKey="detratores" name="Detratores (0-6)" fill="#ef4444" radius={[0, 4, 4, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-5 gap-2 mt-4">
          {npsData.map(n => (
            <div key={n.setor} className="text-center">
              <p className="text-xs text-slate-400">{n.setor}</p>
              <p className={`text-lg font-bold ${n.nps >= 50 ? 'text-emerald-400' : n.nps >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{n.nps}</p>
              <p className="text-xs text-slate-500">NPS</p>
            </div>
          ))}
        </div>
      </div>

      {/* Avaliações NPS */}
      <div>
        <h2 className="text-base font-semibold text-slate-200 mb-3">Pesquisas Recentes</h2>
        <div className="space-y-3">
          {nps.map(r => {
            const Icone = notaIcone(r.nota)
            return (
              <div key={r.id} className="card flex items-start gap-4">
                <div className={`p-2 rounded-lg bg-slate-700 flex-shrink-0 ${notaCor(r.nota)}`}><Icone size={18} /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-200">{r.clienteNome}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{r.departamento}</span>
                      <span className={`badge ${r.nota >= 9 ? 'bg-emerald-500/20 text-emerald-400' : r.nota >= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                        Nota {r.nota}
                      </span>
                    </div>
                  </div>
                  {r.comentario && <p className="text-sm text-slate-400 italic">"{r.comentario}"</p>}
                  <p className="text-xs text-slate-600 mt-1">{r.data.split('-').reverse().join('/')}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
