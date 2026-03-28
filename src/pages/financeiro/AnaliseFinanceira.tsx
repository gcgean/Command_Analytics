import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Percent, Loader2 } from 'lucide-react'
import { api } from '../../services/api'

interface AnaliseFinanceiraItem {
  clienteId: number
  clienteNome: string
  mensalidade: number
  custoSuporte: number
  custoDev: number
  custoFixo: number
  margemValor: number
  margemPercent: number
}

export function AnaliseFinanceira() {
  const [dados, setDados] = useState<AnaliseFinanceiraItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAnaliseFinanceira().then((data: any) => {
      const lista = Array.isArray(data) ? data : []
      setDados(lista.map((d: any) => ({
        clienteId: d.clienteId,
        clienteNome: d.clienteNome ?? `Cliente #${d.clienteId}`,
        mensalidade: Number(d.mensalidade ?? 0),
        custoSuporte: Number(d.custoSuporte ?? 0),
        custoDev: Number(d.custoDev ?? 0),
        custoFixo: Number(d.custoFixo ?? 0),
        margemValor: Number(d.margemValor ?? 0),
        margemPercent: Number(d.margemPercent ?? 0),
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const chartData = dados.map(d => ({
    name: (d.clienteNome ?? '').split(' ')[0],
    Receita: d.mensalidade,
    Custo: d.custoSuporte + d.custoDev + d.custoFixo,
    Margem: d.margemValor,
  }))

  const mrr = dados.reduce((s, d) => s + d.mensalidade, 0)
  const custoTotal = dados.reduce((s, d) => s + d.custoSuporte + d.custoDev + d.custoFixo, 0)
  const margemMedia = dados.length > 0 ? dados.reduce((s, d) => s + d.margemPercent, 0) / dados.length : 0
  const lucrativos = dados.filter(d => d.margemValor > 0).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Análise Financeira</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Rentabilidade e margem por cliente</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'MRR Total', val: `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, cor: 'text-blue-400 bg-blue-400/10' },
          { label: 'Custo Total', val: `R$ ${custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: TrendingDown, cor: 'text-red-400 bg-red-400/10' },
          { label: 'Margem Média', val: `${margemMedia.toFixed(1)}%`, icon: Percent, cor: margemMedia > 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10' },
          { label: 'Clientes Lucrativos', val: `${lucrativos}/${dados.length}`, icon: TrendingUp, cor: 'text-amber-400 bg-amber-400/10' },
        ].map(k => (
          <div key={k.label} className="card flex items-center gap-4">
            <div className={`p-3 rounded-xl ${k.cor}`}><k.icon size={22} /></div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
              <p className={`text-xl font-bold ${k.cor.split(' ')[0]}`}>{k.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Receita × Custo por Cliente</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `R$${v}`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} formatter={(val: number) => [`R$ ${val.toFixed(2)}`, '']} />
            <Bar dataKey="Receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Custo" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Cliente', 'Mensalidade', 'Custo Suporte', 'Custo Dev', 'Custo Fixo', 'Margem (R$)', 'Margem (%)'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.clienteId} className="table-row">
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{d.clienteNome}</td>
                <td className="table-cell text-emerald-400">R$ {d.mensalidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">R$ {d.custoSuporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">R$ {d.custoDev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">R$ {d.custoFixo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className={`table-cell font-semibold ${d.margemValor >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  R$ {d.margemValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="table-cell">
                  <span className={`badge ${d.margemPercent >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {d.margemPercent.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
