import { useState, useEffect } from 'react'
import { Plus, User, Calendar, Loader2, Hash } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

// Status MySQL (int) → label do funil
const STATUS_LABEL: Record<number, string> = {
  0: 'Novo',
  1: 'Prospecção',
  2: 'Qualificação',
  3: 'Proposta',
  4: 'Negociação',
  5: 'Fechado Ganho',
  6: 'Fechado Perdido',
}

const STATUS_COR: Record<string, string> = {
  'Novo':            'border-slate-400',
  'Prospecção':      'border-slate-400',
  'Qualificação':    'border-blue-400',
  'Proposta':        'border-indigo-400',
  'Negociação':      'border-amber-400',
  'Fechado Ganho':   'border-emerald-400',
  'Fechado Perdido': 'border-red-400',
}

interface NegocioItem {
  id: number
  nome: string | null
  empresa: string | null
  responsavelId: number | null
  responsavelNome: string
  status: number | null
  etapaId: number | null
  etapa: string | null
  funilId: number | null
  funil: string | null
  descricao: string | null
  dataCriacao: string | null
  dataFechamento: string | null
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

function getEtapaLabel(n: NegocioItem): string {
  // Prefer the etapa varchar from MySQL if present
  if (n.etapa && n.etapa.trim()) return n.etapa.trim()
  // Fallback to status number mapping
  return STATUS_LABEL[n.status ?? 0] ?? `Status ${n.status}`
}

export function Negocios() {
  const { toast } = useToast()
  const [negocios, setNegocios] = useState<NegocioItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getNegocios().then((data: any) => {
      setNegocios(Array.isArray(data) ? data : [])
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

  // Agrupa por etapa
  const etapasSet = Array.from(new Set(negocios.map(n => getEtapaLabel(n))))
  const etapas = etapasSet.length > 0 ? etapasSet : ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Fechado Ganho', 'Fechado Perdido']

  const porEtapa = (label: string) => negocios.filter(n => getEtapaLabel(n) === label)

  const fechados = negocios.filter(n => getEtapaLabel(n) === 'Fechado Ganho')
  const perdidos = negocios.filter(n => getEtapaLabel(n) === 'Fechado Perdido')
  const emAberto = negocios.filter(n => {
    const e = getEtapaLabel(n)
    return e !== 'Fechado Ganho' && e !== 'Fechado Perdido'
  })

  const handleNovo = () => {
    setTimeout(() => toast.success('Negócio criado com sucesso!'), 800)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Negócios / CRM</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Pipeline de vendas · {negocios.length} negócios cadastrados
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleNovo}>
          <Plus size={16} /> Novo Negócio
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Em Aberto',  val: emAberto.length,  cor: 'text-blue-400' },
          { label: 'Ganhos',     val: fechados.length,   cor: 'text-emerald-400' },
          { label: 'Perdidos',   val: perdidos.length,   cor: 'text-red-400' },
          { label: 'Total',      val: negocios.length,   cor: 'text-amber-400' },
        ].map(k => (
          <div key={k.label} className="card">
            <p className="text-slate-600 dark:text-slate-400 text-xs">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${etapas.length * 260}px` }}>
          {etapas.map(etapaLabel => {
            const lista = porEtapa(etapaLabel)
            const cor = STATUS_COR[etapaLabel] ?? 'border-slate-400'
            return (
              <div key={etapaLabel} className={`flex-shrink-0 w-60 rounded-xl border-t-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${cor}`}>
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{etapaLabel}</p>
                  <span className="text-xs text-slate-500">{lista.length} negócios</span>
                </div>
                <div className="p-2 space-y-2 min-h-[120px]">
                  {lista.map(n => (
                    <div
                      key={n.id}
                      className="bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-slate-500 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2 leading-tight">
                        {n.nome ?? `Negócio #${n.id}`}
                      </p>
                      {n.empresa && (
                        <div className="flex items-center gap-1 mb-1">
                          <User size={10} className="text-slate-500" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">{n.empresa}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-0.5 text-xs text-slate-500">
                          <Hash size={10} />{n.id}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs text-slate-500">
                          <Calendar size={10} />{formatData(n.dataCriacao)}
                        </span>
                      </div>
                      {n.responsavelNome && (
                        <div className="mt-2 text-xs text-slate-500">{n.responsavelNome}</div>
                      )}
                    </div>
                  ))}
                  {lista.length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-4">Nenhum negócio</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
