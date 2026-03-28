import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, CheckSquare, Clock, X, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import clsx from 'clsx'

// ─── Field label mapping ────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  clienteId:   'Cliente (ID)',
  tecnicoId:   'Técnico (ID)',
  tipo:        'Tipo',
  status:      'Status',
  data:        'Data',
  horarioIni:  'Horário inicial',
  horaInicio:  'Horário inicial',
  observacoes: 'Observações',
  descricao:   'Descrição',
  duracao:     'Duração (min)',
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Aguardando', 1: 'Aguardando', 2: 'Efetuado', 3: 'Não efetuado / Cancelado', 4: 'Reagendado',
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—'
  if (key === 'status' && typeof value === 'number') return STATUS_LABELS[value] ?? String(value)
  return String(value)
}

// ─── Action config ──────────────────────────────────────────────────────────
const ACAO_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; dot: string }> = {
  CRIACAO:   { label: 'Criação',        icon: <Plus className="w-3.5 h-3.5" />,        color: 'text-emerald-400', dot: 'bg-emerald-500' },
  ALTERACAO: { label: 'Alteração',      icon: <Pencil className="w-3.5 h-3.5" />,      color: 'text-blue-400',    dot: 'bg-blue-500'    },
  STATUS:    { label: 'Status alterado',icon: <CheckSquare className="w-3.5 h-3.5" />, color: 'text-amber-400',   dot: 'bg-amber-500'   },
  EXCLUSAO:  { label: 'Exclusão',       icon: <Trash2 className="w-3.5 h-3.5" />,      color: 'text-red-400',     dot: 'bg-red-500'     },
}

interface AuditoriaItem {
  id: number
  acao: string
  usuarioNome: string | null
  dadosAntes: Record<string, any> | null
  dadosDepois: Record<string, any> | null
  camposAlterados: string[] | null
  criadoEm: string
}

interface Props {
  tabela: string
  registroId: number
  titulo?: string
  onClose: () => void
}

export function AuditoriaTimeline({ tabela, registroId, titulo, onClose }: Props) {
  const [items, setItems] = useState<AuditoriaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAuditoria(tabela, registroId)
      .then((data: any) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [tabela, registroId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Histórico de auditoria{titulo ? ` · ${titulo}` : ''}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando histórico...</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-10 text-slate-600 text-sm">
              Nenhum registro de auditoria encontrado.
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

              <div className="space-y-5">
                {items.map((item, idx) => {
                  const cfg = ACAO_CONFIG[item.acao] ?? ACAO_CONFIG['ALTERACAO']
                  const dt = new Date(item.criadoEm)
                  const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={item.id} className="flex gap-4 relative">
                      {/* Dot */}
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-0.5', cfg.dot)}>
                        <span className={clsx('text-white', cfg.color.replace('text-', 'text-'))}>
                          {cfg.icon}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className={clsx('text-xs font-semibold uppercase tracking-wide', cfg.color)}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-500 whitespace-nowrap">
                            {dateStr} {timeStr}
                          </span>
                        </div>

                        {item.usuarioNome && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">por {item.usuarioNome}</p>
                        )}

                        {/* Field diffs for ALTERACAO / STATUS */}
                        {(item.acao === 'ALTERACAO' || item.acao === 'STATUS') && item.camposAlterados?.length && (
                          <div className="mt-2 space-y-1.5">
                            {item.camposAlterados.map(campo => (
                              <div key={campo} className="text-xs">
                                <span className="text-slate-600 dark:text-slate-500 font-medium">
                                  {FIELD_LABELS[campo] ?? campo}:
                                </span>
                                <span className="text-red-400 line-through ml-1.5">
                                  {formatValue(campo, item.dadosAntes?.[campo])}
                                </span>
                                <span className="text-slate-600 dark:text-slate-500 mx-1">→</span>
                                <span className="text-emerald-400">
                                  {formatValue(campo, item.dadosDepois?.[campo])}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Fields for CRIACAO */}
                        {item.acao === 'CRIACAO' && item.dadosDepois && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(item.dadosDepois)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .map(([k, v]) => (
                                <div key={k} className="text-xs">
                                  <span className="text-slate-600 dark:text-slate-500">{FIELD_LABELS[k] ?? k}:</span>
                                  <span className="text-slate-700 dark:text-slate-300 ml-1.5">{formatValue(k, v)}</span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Fields for EXCLUSAO */}
                        {item.acao === 'EXCLUSAO' && item.dadosAntes && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(item.dadosAntes)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .map(([k, v]) => (
                                <div key={k} className="text-xs">
                                  <span className="text-slate-600 dark:text-slate-500">{FIELD_LABELS[k] ?? k}:</span>
                                  <span className="text-red-400 line-through ml-1.5">{formatValue(k, v)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
