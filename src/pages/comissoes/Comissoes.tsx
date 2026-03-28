import { useState, useEffect } from 'react'
import { Trophy, Star, Loader2 } from 'lucide-react'
import { api } from '../../services/api'

// MySQL comissoes_funcionario: { id, vendedorId, clienteId, descricao, valor(Float?), valorOperacao(Float?), dataVenda(DateTime?) }
// Backend adds: vendedorNome, clienteNome
interface ComissaoItem {
  id: number
  vendedorId: number | null
  vendedorNome: string
  clienteId: number | null
  clienteNome: string
  descricao: string | null
  valor: number | null
  valorOperacao: number | null
  dataVenda: string | null
}

function formatDataVenda(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

const abas = ['Listagem', 'Ranking', 'Notas de Treinamento']

const notas = [
  { cliente: 'Supermercado B.P.', tecnico: 'Carlos Silva', nota: 9.5, data: '2026-03-15', obs: 'Treinamento muito bom, conteúdo bem explicado' },
  { cliente: 'Loja Moda & Estilo', tecnico: 'Ana Rodrigues', nota: 10, data: '2026-03-12', obs: 'Excelente atendimento' },
  { cliente: 'Atacado Norte', tecnico: 'Pedro Alves', nota: 7, data: '2026-03-08', obs: 'Treinamento ok, mas poderia ser mais rápido' },
]

export function Comissoes() {
  const [comissoes, setComissoes] = useState<ComissaoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState(0)

  useEffect(() => {
    api.getComissoes().then((data: any) => {
      setComissoes(Array.isArray(data) ? data : [])
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

  // Ranking por vendedor
  const ranking = Object.values(
    comissoes.reduce<Record<string, { nome: string; total: number; vendas: number }>>((acc, c) => {
      const nome = c.vendedorNome || 'Desconhecido'
      if (!acc[nome]) acc[nome] = { nome, total: 0, vendas: 0 }
      acc[nome].total += Number(c.valor ?? 0)
      acc[nome].vendas += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Comissões</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Gestão e ranking de comissões da equipe</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {abas.map((a, i) => (
          <button key={a} onClick={() => setAba(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === i ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
            {a}
          </button>
        ))}
      </div>

      {aba === 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Vendedor', 'Cliente', 'Descrição', 'Data Venda', 'Valor Operação', 'Comissão'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comissoes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">Nenhuma comissão encontrada.</td></tr>
              ) : comissoes.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{c.vendedorNome || '—'}</td>
                  <td className="table-cell text-slate-600 dark:text-slate-400">{c.clienteNome || '—'}</td>
                  <td className="table-cell"><span className="badge bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs">{c.descricao || '—'}</span></td>
                  <td className="table-cell text-slate-600 dark:text-slate-400">{formatDataVenda(c.dataVenda)}</td>
                  <td className="table-cell text-slate-700 dark:text-slate-300">
                    {c.valorOperacao != null ? `R$ ${Number(c.valorOperacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="table-cell font-semibold text-emerald-400">
                    R$ {Number(c.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === 1 && (
        <div className="space-y-4 max-w-md">
          <h3 className="text-sm font-semibold text-slate-200">Ranking do Mês — Março 2026</h3>
          {ranking.map((r, i) => (
            <div key={r.nome} className="card flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-500 text-white' : 'bg-amber-900 text-amber-300'}`}>
                {i === 0 ? <Trophy size={18} /> : `${i + 1}º`}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-100">{r.nome}</p>
                <p className="text-xs text-slate-400">{r.vendas} vendas</p>
              </div>
              <div className="text-right">
                <p className="text-emerald-400 font-bold">R$ {r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                {i === 0 && <Star size={14} className="text-amber-400 fill-amber-400 ml-auto" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 2 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Cliente', 'Técnico', 'Nota', 'Data', 'Observação'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notas.map((n, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell font-medium text-slate-100">{n.cliente}</td>
                  <td className="table-cell text-slate-400">{n.tecnico}</td>
                  <td className="table-cell">
                    <span className={`badge ${n.nota >= 9 ? 'bg-emerald-500/20 text-emerald-400' : n.nota >= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                      {n.nota}
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">{n.data.split('-').reverse().join('/')}</td>
                  <td className="table-cell text-slate-400 italic">{n.obs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
