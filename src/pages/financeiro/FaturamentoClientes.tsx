import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { DollarSign, Users, TrendingUp, CreditCard, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { Select } from '../../components/ui/Select'
import type { AnaliseFaturamento } from '../../types'

const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function FaturamentoClientes() {
  const [meses, setMeses] = useState('6')
  const [dados, setDados] = useState<AnaliseFaturamento | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getAnaliseFaturamento(Number(meses))
      .then((res) => setDados(res))
      .catch(() => setDados(null))
      .finally(() => setLoading(false))
  }, [meses])

  if (loading && !dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  if (!dados) return (
    <div className="card text-center py-12 text-sm text-slate-500">Não foi possível carregar a análise de faturamento.</div>
  )

  const { geral, porFormaPagamento, porMaquininha, periodo } = dados

  const kpis = [
    { label: 'Faturamento Total no Período', val: formatarMoeda(geral.faturamentoTotal), icon: DollarSign, cor: 'text-blue-400 bg-blue-400/10' },
    { label: 'Clientes com Faturamento', val: geral.clientesComFaturamento.toLocaleString('pt-BR'), icon: Users, cor: 'text-emerald-400 bg-emerald-400/10' },
    { label: 'Faturamento Médio Mensal / Cliente', val: formatarMoeda(geral.faturamentoMedioMensalPorCliente), icon: TrendingUp, cor: 'text-amber-400 bg-amber-400/10' },
    { label: 'Faturamento Médio / Cliente no Período', val: formatarMoeda(geral.faturamentoMedioPorClienteNoPeriodo), icon: CreditCard, cor: 'text-purple-400 bg-purple-400/10' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Faturamento de Clientes</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Faturamento médio geral, por forma de pagamento e por maquininha · {String(periodo.mesInicio).padStart(2, '0')}/{periodo.anoInicio} a {String(periodo.mesFim).padStart(2, '0')}/{periodo.anoFim}
          </p>
        </div>
        <div className="w-48">
          <Select
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
            options={[
              { value: '3', label: 'Últimos 3 meses' },
              { value: '6', label: 'Últimos 6 meses' },
              { value: '12', label: 'Últimos 12 meses' },
              { value: '24', label: 'Últimos 24 meses' },
            ]}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card flex items-center gap-4">
            <div className={`p-3 rounded-xl ${k.cor}`}><k.icon size={22} /></div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
              <p className={`text-xl font-bold ${k.cor.split(' ')[0]}`}>{k.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Evolução mensal */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Evolução do Faturamento Total</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={geral.evolucaoMensal}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(0)}M`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} formatter={(val: number) => [formatarMoeda(val), 'Faturamento']} />
            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por forma de pagamento */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Faturamento Médio por Cliente — Forma de Pagamento</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porFormaPagamento} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="forma" tick={{ fill: '#94a3b8', fontSize: 12 }} width={110} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} formatter={(val: number) => [formatarMoeda(val), 'Médio/cliente']} />
              <Bar dataKey="faturamentoMedioPorCliente" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição do faturamento por maquininha */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Faturamento Total por Maquininha</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={porMaquininha} dataKey="total" nameKey="operadora" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.operadora}>
                {porMaquininha.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} formatter={(val: number) => [formatarMoeda(val), 'Total']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela por forma de pagamento */}
      <div className="card p-0 overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4">Detalhe por Forma de Pagamento</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Forma de Pagamento', 'Faturamento Total', 'Clientes', 'Faturamento Médio / Cliente', 'Transações'].map((h) => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porFormaPagamento.map((f) => (
              <tr key={f.forma} className="table-row">
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{f.forma}</td>
                <td className="table-cell text-emerald-400">{formatarMoeda(f.total)}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">{f.clientes.toLocaleString('pt-BR')}</td>
                <td className="table-cell font-semibold text-blue-400">{formatarMoeda(f.faturamentoMedioPorCliente)}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">{f.quantidade.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabela por maquininha */}
      <div className="card p-0 overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4">Detalhe por Maquininha</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Maquininha / Operadora', 'Faturamento Total', 'Clientes', 'Faturamento Médio / Cliente'].map((h) => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porMaquininha.map((m) => (
              <tr key={m.operadora} className="table-row">
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{m.operadora}</td>
                <td className="table-cell text-emerald-400">{formatarMoeda(m.total)}</td>
                <td className="table-cell text-slate-700 dark:text-slate-300">{m.clientes.toLocaleString('pt-BR')}</td>
                <td className="table-cell font-semibold text-blue-400">{formatarMoeda(m.faturamentoMedioPorCliente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
