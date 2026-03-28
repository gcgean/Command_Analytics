import { useState, useEffect } from 'react'
import { Plus, Tag, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

interface NotaItem {
  id: number
  descricao: string
  segmentoId?: number | null
}

interface VersaoItem {
  id: number
  sistemaId: number | null
  softwareName: string | null
  versao: string
  obrigatoria: string | null  // char(1) 'S'/'N'
  beta: number | null          // int 0/1
  data: string | null          // DateTime ISO
  notas: NotaItem[]
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

export function Versoes() {
  const { toast } = useToast()
  const [versoes, setVersoes] = useState<VersaoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sistemaFiltro, setSistemaFiltro] = useState('Todos')

  useEffect(() => {
    api.getVersoes().then((data: any) => {
      setVersoes(Array.isArray(data) ? data : [])
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

  const sistemas = Array.from(new Set(versoes.map(v => v.softwareName ?? 'Sem sistema').filter(Boolean)))
  const filtradas = versoes.filter(v =>
    sistemaFiltro === 'Todos' || (v.softwareName ?? 'Sem sistema') === sistemaFiltro
  )

  const handleLancar = () => {
    setTimeout(() => toast.success('Versão lançada com sucesso!'), 800)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Versões e Licenças</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Controle de versões dos sistemas</p>
        </div>
        <button className="btn-primary" onClick={handleLancar}><Plus size={16} /> Lançar Versão</button>
      </div>

      {/* Filtro por sistema */}
      <div className="flex gap-2 flex-wrap">
        {['Todos', ...sistemas].map((s, i) => (
          <button
            key={`${s}-${i}`}
            onClick={() => setSistemaFiltro(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sistemaFiltro === s
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Lista de versões */}
      <div className="space-y-4">
        {filtradas.length === 0 ? (
          <div className="card text-center text-slate-500 py-12">Nenhuma versão encontrada.</div>
        ) : (
          filtradas.map(v => (
            <div key={v.id} className="card border border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                    <Tag size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-slate-900 dark:text-slate-100">{v.versao}</p>
                      {v.obrigatoria === 'S' && (
                        <span className="badge bg-red-500/20 text-red-400 border border-red-500/30 text-xs flex items-center gap-1">
                          <AlertCircle size={10} /> Obrigatória
                        </span>
                      )}
                      {Boolean(v.beta) && (
                        <span className="badge bg-amber-500/20 text-amber-400 text-xs">BETA</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {v.softwareName ?? 'Sistema'} · {formatData(v.data)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notas de versão */}
              {v.notas && v.notas.length > 0 ? (
                <div className="space-y-1 mt-2">
                  {v.notas.map(n => (
                    <div key={n.id} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{n.descricao}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600 italic">Sem notas de atualização.</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
