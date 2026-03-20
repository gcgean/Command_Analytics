import { useState, useEffect } from 'react'
import { Plus, Check, Loader2, Package, Tag } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

interface PlanoItem {
  id: number
  descricao: string         // nome do plano
  ativo: boolean
  valor: string | number    // Decimal serializado
  valorAntigo?: string | number | null
  detalhes?: string | null  // descrição livre com funcionalidades
  sistemaId?: number | null
  tipo?: number | null
  percComissao?: string | number | null
}

const TIPO_LABEL: Record<number, string> = {
  0: 'Padrão',
  1: 'Módulo Adicional',
  2: 'Personalizado',
}

export function Planos() {
  const { toast } = useToast()
  const [planos, setPlanos] = useState<PlanoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    api.getPlanos().then((data: any) => {
      setPlanos(Array.isArray(data) ? data : [])
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

  const filtrados = planos.filter(p =>
    !filtro || (p.descricao ?? '').toLowerCase().includes(filtro.toLowerCase())
  )

  const handleNovo = () => toast.info('Formulário de novo plano em desenvolvimento.')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Planos e Módulos</h1>
          <p className="text-slate-400 text-sm mt-1">
            {planos.length} planos cadastrados · {planos.filter(p => p.ativo).length} ativos
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleNovo}>
          <Plus size={16} /> Novo Plano
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-3">
        <input
          className="input-field max-w-xs"
          placeholder="Buscar plano..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
      </div>

      {/* Cards de planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtrados.length === 0 ? (
          <div className="col-span-3 card text-center text-slate-500 py-12">
            Nenhum plano encontrado.
          </div>
        ) : (
          filtrados.map(p => {
            const valor = Number(p.valor ?? 0)
            const valorAntigo = p.valorAntigo != null ? Number(p.valorAntigo) : null
            const tipoLabel = TIPO_LABEL[p.tipo ?? 0] ?? `Tipo ${p.tipo}`
            const detalhesLinhas = p.detalhes
              ? p.detalhes.split('\n').filter(Boolean)
              : []

            return (
              <div
                key={p.id}
                onClick={() => setSelecionado(selecionado === p.id ? null : p.id)}
                className={`card cursor-pointer transition-all border-2 ${
                  selecionado === p.id ? 'border-blue-500' : 'border-slate-700'
                } ${!p.ativo ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge bg-blue-500/20 text-blue-300 text-xs">
                        <Tag size={10} className="inline mr-1" />{tipoLabel}
                      </span>
                      {!p.ativo && (
                        <span className="badge bg-slate-700 text-slate-500 text-xs">Inativo</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-100 text-base">{p.descricao}</h3>
                    {p.sistemaId && (
                      <p className="text-xs text-slate-500 mt-0.5">Sistema ID: {p.sistemaId}</p>
                    )}
                  </div>
                  <Package size={18} className="text-slate-500 flex-shrink-0" />
                </div>

                {/* Preço */}
                <div className="mb-4">
                  <div className="text-3xl font-bold text-blue-400">
                    R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    <span className="text-slate-400 text-sm font-normal">/mês</span>
                  </div>
                  {valorAntigo != null && valorAntigo > 0 && valorAntigo !== valor && (
                    <p className="text-xs text-slate-600 line-through mt-0.5">
                      R$ {valorAntigo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {p.percComissao != null && Number(p.percComissao) > 0 && (
                    <p className="text-xs text-emerald-500 mt-0.5">
                      Comissão: {Number(p.percComissao).toFixed(1)}%
                    </p>
                  )}
                </div>

                {/* Detalhes / funcionalidades */}
                {detalhesLinhas.length > 0 && (
                  <ul className="space-y-1.5">
                    {detalhesLinhas.slice(0, 5).map((linha, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <Check size={14} className="text-emerald-400 flex-shrink-0" />
                        {linha}
                      </li>
                    ))}
                    {detalhesLinhas.length > 5 && (
                      <li className="text-xs text-slate-500">+{detalhesLinhas.length - 5} mais...</li>
                    )}
                  </ul>
                )}

                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-700">
                  <button
                    className="btn-secondary flex-1 justify-center text-xs py-1.5"
                    onClick={e => { e.stopPropagation(); toast.info('Edição de plano em desenvolvimento.') }}
                  >
                    Editar
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
