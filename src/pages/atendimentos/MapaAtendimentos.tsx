import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Headphones } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { api, departamentoColors } from '../../services/api'
import type { Atendimento, StatusAtendimento } from '../../types'
import { StatusBadge } from '../../components/ui/StatusBadge'
import clsx from 'clsx'

const DEPT_LABEL: Record<number, string> = {
  1: 'Suporte', 2: 'Financeiro', 3: 'Comercial', 4: 'Implantação',
  5: 'Desenvolvimento', 6: 'Fiscal', 7: 'Certificado', 8: 'CS', 9: 'Técnico', 10: 'Treinamento',
}

export function MapaAtendimentos() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // getAtendimentos returns paginated {total, page, pages, limit, data:[]}
    api.getAtendimentos({ limit: '500' }).then((resp: any) => {
      const lista = resp?.data ?? (Array.isArray(resp) ? resp : [])
      setAtendimentos(lista)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Aggregate by technician
  const byTecnico = (atendimentos as any[]).reduce<Record<string, { nome: string; count: number; abertos: number; concluidos: number }>>((acc, a) => {
    const nome = a.tecnicoNome || 'Sem técnico'
    if (!acc[nome]) {
      acc[nome] = { nome, count: 0, abertos: 0, concluidos: 0 }
    }
    acc[nome].count++
    if (a.status === 7) acc[nome].concluidos++
    else acc[nome].abertos++
    return acc
  }, {})

  // Aggregate by department label
  const byDept = (atendimentos as any[]).reduce<Record<string, number>>((acc, a) => {
    const deptLabel = DEPT_LABEL[a.departamento] ?? `Depto ${a.departamento ?? '?'}`
    acc[deptLabel] = (acc[deptLabel] || 0) + 1
    return acc
  }, {})

  const deptChartData = Object.entries(byDept).map(([dept, count]) => ({ dept, count }))
  const tecnicoList = Object.values(byTecnico)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-600 dark:text-slate-400">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        Carregando mapa...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Chart por Departamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Atendimentos por Departamento</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptChartData} margin={{ left: -20, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dept" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#f1f5f9' }}
              />
              <Bar dataKey="count" name="Atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Status Overview */}
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Distribuição por Status</h3>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 7, 13].map(s => {
              const count = atendimentos.filter(a => a.status === s).length
              const pct = atendimentos.length > 0 ? (count / atendimentos.length) * 100 : 0
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-32 flex-shrink-0">
                    <StatusBadge status={s as StatusAtendimento} />
                  </div>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Cards por Técnico */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Atendimentos por Técnico
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {tecnicoList.map(t => (
            <Card key={t.nome} padding="sm" className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">{(t.nome || '?').split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2)}</span>
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.nome}</p>
              </div>
              <div className="flex justify-between">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{t.count}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-400">{t.abertos}</p>
                  <p className="text-xs text-slate-500">Abertos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-emerald-400">{t.concluidos}</p>
                  <p className="text-xs text-slate-500">Concluídos</p>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: t.count > 0 ? `${(t.concluidos / t.count) * 100}%` : '0%' }}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Departamento cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Headphones className="w-4 h-4" />
          Distribuição por Departamento
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(byDept).map(([dept, count]) => (
            <Card key={dept} padding="sm" className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{count}</p>
              <span className={clsx('mt-1 text-xs font-medium px-2 py-0.5 rounded-full inline-block', departamentoColors[dept])}>
                {dept}
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
