import { useState, useEffect } from 'react'
import { Users, Clock, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import type { PipelineItem } from '../../types'

const etapas = [
  { id: 1, label: 'Aguard. Instalação', cor: 'border-slate-500' },
  { id: 2, label: 'Em Instalação', cor: 'border-blue-500' },
  { id: 3, label: 'Agendar Treinamento', cor: 'border-indigo-500' },
  { id: 4, label: 'Reagendar Treinamento', cor: 'border-purple-500' },
  { id: 5, label: 'Treinamento Concluído', cor: 'border-violet-500' },
  { id: 6, label: 'Retorno CS', cor: 'border-amber-500' },
  { id: 7, label: 'Concluído', cor: 'border-emerald-500' },
  { id: 8, label: 'Teste Demo', cor: 'border-cyan-500' },
  { id: 9, label: 'Pós-venda', cor: 'border-teal-500' },
  { id: 10, label: 'Desistência', cor: 'border-red-500' },
  { id: 11, label: 'Aguard. Cliente p/ Inst.', cor: 'border-orange-500' },
  { id: 12, label: 'Aguard. Migração', cor: 'border-yellow-500' },
  { id: 13, label: 'Primeiro Treinamento', cor: 'border-lime-500' },
  { id: 14, label: 'Segundo Treinamento', cor: 'border-green-500' },
  { id: 15, label: 'Em Migração', cor: 'border-sky-500' },
  { id: 16, label: 'Conf. de Migração', cor: 'border-rose-500' },
]

export function Pipeline() {
  const [pipeline, setPipeline] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [etapaFiltro, setEtapaFiltro] = useState<number | null>(null)

  useEffect(() => {
    api.getPipeline().then((data: any) => {
      setPipeline(Array.isArray(data) ? data : [])
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

  const clientesPorEtapa = (etapaId: number) => pipeline.filter(c => c.etapa === etapaId)
  const diasDesde = (data: string) => Math.floor((Date.now() - new Date(data).getTime()) / 86400000)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Pipeline de Implantação</h1>
          <p className="text-slate-400 text-sm mt-1">{pipeline.length} clientes em processo · 16 etapas</p>
        </div>
        <div className="flex gap-2">
          {etapaFiltro && (
            <button onClick={() => setEtapaFiltro(null)} className="btn-secondary text-xs">Limpar filtro</button>
          )}
        </div>
      </div>

      {/* Sumário compacto */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Em Processo', val: pipeline.filter(c => c.etapa !== 7 && c.etapa !== 10).length, cor: 'text-blue-400' },
          { label: 'Concluídos', val: pipeline.filter(c => c.etapa === 7).length, cor: 'text-emerald-400' },
          { label: 'Desistências', val: pipeline.filter(c => c.etapa === 10).length, cor: 'text-red-400' },
          { label: 'Em Instalação', val: pipeline.filter(c => c.etapa === 2).length, cor: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="card py-3">
            <p className="text-slate-400 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold ${s.cor}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Kanban Horizontal com scroll */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${etapas.length * 220}px` }}>
          {etapas.map(etapa => {
            const lista = clientesPorEtapa(etapa.id)
            return (
              <div key={etapa.id} className={`flex-shrink-0 w-52 rounded-xl border-t-4 bg-slate-800 border-slate-700 ${etapa.cor}`}>
                <div className="p-3 border-b border-slate-700">
                  <p className="text-xs font-semibold text-slate-300 leading-tight">{etapa.id}. {etapa.label}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Users size={11} className="text-slate-500" />
                    <span className="text-xs text-slate-500">{lista.length}</span>
                  </div>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {lista.map((c: any) => (
                    <div key={c.id} className="bg-slate-900 rounded-lg p-2.5 border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors">
                      <p className="text-xs font-medium text-slate-200 leading-tight mb-1">{c.clienteNome || `#${c.clienteId}`}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{c.etapaDescricao ?? `Etapa ${c.etapa}`}</span>
                        <span className="flex items-center gap-0.5 text-xs text-slate-500">
                          <Clock size={10} />#{c.id}
                        </span>
                      </div>
                    </div>
                  ))}
                  {lista.length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-3">Vazio</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legenda de fluxo */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Fluxo de Progressão</h3>
        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
          {etapas.slice(0, 9).map((e, i) => (
            <span key={e.id} className="flex items-center gap-1">
              <span className="text-slate-200">{e.id}. {e.label}</span>
              {i < 8 && <ChevronRight size={12} className="text-slate-600" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
