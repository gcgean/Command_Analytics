import { useState, useEffect } from 'react'
import { CreditCard, FileText, QrCode, Search, Plus, RefreshCw, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

// forma_pagamento: int no MySQL
// 1=Boleto, 2=PIX, 3=Cartão de Crédito, 4=Cartão de Débito (mapeamento aproximado)
const FORMA_LABEL: Record<number, { label: string; cor: string; Icon: React.ElementType }> = {
  1: { label: 'Boleto',  cor: 'text-amber-400 bg-amber-400/10',   Icon: FileText   },
  2: { label: 'PIX',    cor: 'text-emerald-400 bg-emerald-400/10', Icon: QrCode     },
  3: { label: 'Cartão', cor: 'text-blue-400 bg-blue-400/10',       Icon: CreditCard },
  4: { label: 'Cartão', cor: 'text-blue-400 bg-blue-400/10',       Icon: CreditCard },
}

function getForma(f: number | null) {
  return f != null && FORMA_LABEL[f] ? FORMA_LABEL[f] : { label: `Forma ${f ?? '—'}`, cor: 'text-slate-400 bg-slate-700', Icon: CreditCard }
}

interface AssinaturaItem {
  id: number
  clienteId: number | null
  cliente?: { id: number; nome: string | null } | null
  formaPagamento: number | null
  valor: string | number | null   // Decimal from Prisma comes as string
  vencimento: number | null
  periodicidade: number | null
  dataInicio: string | null
  status: string | null           // varchar description
  dataCriacao: string | null
}

function nomeCliente(a: AssinaturaItem): string {
  return a.cliente?.nome ?? `Cliente #${a.clienteId ?? '?'}`
}

export function AssinaturaCliente() {
  const { toast } = useToast()
  const [assinaturas, setAssinaturas] = useState<AssinaturaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    api.getAssinaturas().then((data: any) => {
      setAssinaturas(Array.isArray(data) ? data : [])
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

  const filtradas = assinaturas.filter(a =>
    !busca || nomeCliente(a).toLowerCase().includes(busca.toLowerCase())
  )

  const total = assinaturas.length
  const mrr = assinaturas.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketMedio = total > 0 ? mrr / total : 0

  const handleNova = () => {
    setTimeout(() => toast.success('Assinatura criada com sucesso!'), 800)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Assinaturas de Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">Gestão de recorrências e cobranças</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleNova}>
          <Plus size={16} /> Nova Assinatura
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Assinaturas', valor: total.toString(), cor: 'text-blue-400' },
          { label: 'MRR Total', valor: `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: 'text-emerald-400' },
          { label: 'Ticket Médio', valor: `R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: 'text-slate-300' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-slate-400 text-xs mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cor}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} /> Sincronizar
        </button>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              {['Cliente', 'Forma Pgto', 'Valor', 'Vencimento', 'Periodicidade', 'Ações'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhuma assinatura encontrada.
                </td>
              </tr>
            ) : (
              filtradas.map(a => {
                const forma = getForma(a.formaPagamento)
                const valor = Number(a.valor ?? 0)
                const periLabel = a.periodicidade === 1 ? 'Mensal' : a.periodicidade === 3 ? 'Trimestral' : a.periodicidade === 12 ? 'Anual' : `${a.periodicidade ?? '—'}x`

                return (
                  <tr key={a.id} className="table-row">
                    <td className="table-cell font-medium text-slate-100">{nomeCliente(a)}</td>
                    <td className="table-cell">
                      <span className={`badge gap-1 ${forma.cor}`}>
                        <forma.Icon size={12} /> {forma.label}
                      </span>
                    </td>
                    <td className="table-cell font-semibold text-slate-100">
                      R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="table-cell text-slate-400">
                      {a.vencimento != null ? `Dia ${a.vencimento}` : '—'}
                    </td>
                    <td className="table-cell text-slate-400">{periLabel}</td>
                    <td className="table-cell">
                      <button
                        className="text-blue-400 hover:text-blue-300 text-xs"
                        onClick={() => toast.info('Edição de assinatura em desenvolvimento.')}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
