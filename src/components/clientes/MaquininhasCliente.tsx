import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { api } from '../../services/api'
import type { ClienteMaquininha, Operadora, TipoMaquininha, StatusMaquininha } from '../../types'

const TIPO_LABEL: Record<TipoMaquininha, string> = {
  TEF: 'TEF',
  SMARTPOS: 'SmartPOS',
}

const STATUS_OPCOES: { value: StatusMaquininha; label: string }[] = [
  { value: 'NAO_INTEGRADO', label: 'Não integrado' },
  { value: 'EM_IMPLANTACAO', label: 'Em implantação' },
  { value: 'INTEGRADO', label: 'Integrado' },
]

const STATUS_LABEL: Record<StatusMaquininha, string> = {
  NAO_INTEGRADO: 'Não integrado',
  EM_IMPLANTACAO: 'Em implantação',
  INTEGRADO: 'Integrado',
}

const STATUS_CLASSES: Record<StatusMaquininha, string> = {
  NAO_INTEGRADO: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  EM_IMPLANTACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  INTEGRADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

type FormState = {
  operadoraId: string
  tipo: TipoMaquininha
  quantidade: string
  statusIntegracao: StatusMaquininha
  observacao: string
}

const FORM_VAZIO: FormState = {
  operadoraId: '',
  tipo: 'SMARTPOS',
  quantidade: '1',
  statusIntegracao: 'NAO_INTEGRADO',
  observacao: '',
}

export function MaquininhasCliente({ clienteId }: { clienteId: number }) {
  const { toast } = useToast()
  const [itens, setItens] = useState<ClienteMaquininha[]>([])
  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [novoAberto, setNovoAberto] = useState(false)
  const [novoForm, setNovoForm] = useState<FormState>(FORM_VAZIO)

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_VAZIO)

  const operadorasPorId = useMemo(() => new Map(operadoras.map((o) => [o.id, o.nome])), [operadoras])

  async function carregar() {
    setLoading(true)
    try {
      const [lista, ops] = await Promise.all([
        api.getMaquininhasCliente(clienteId),
        api.getOperadoras(),
      ])
      setItens(lista)
      setOperadoras(ops)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar as maquininhas do cliente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function abrirNovo() {
    setNovoForm({ ...FORM_VAZIO, operadoraId: operadoras[0] ? String(operadoras[0].id) : '' })
    setNovoAberto(true)
  }

  async function salvarNovo() {
    if (!novoForm.operadoraId) {
      toast.error('Selecione a operadora.')
      return
    }
    const qtd = Number(novoForm.quantidade)
    if (!Number.isFinite(qtd) || qtd < 1) {
      toast.error('Informe uma quantidade válida.')
      return
    }
    setSalvando(true)
    try {
      await api.createMaquininha({
        clienteId,
        operadoraId: Number(novoForm.operadoraId),
        tipo: novoForm.tipo,
        quantidade: qtd,
        statusIntegracao: novoForm.statusIntegracao,
        observacao: novoForm.observacao.trim() || undefined,
      })
      toast.success('Maquininha cadastrada.')
      setNovoAberto(false)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível cadastrar a maquininha.')
    } finally {
      setSalvando(false)
    }
  }

  function abrirEdicao(item: ClienteMaquininha) {
    setEditandoId(item.id)
    setEditForm({
      operadoraId: String(item.operadoraId),
      tipo: item.tipo,
      quantidade: String(item.quantidade),
      statusIntegracao: item.statusIntegracao,
      observacao: item.observacao || '',
    })
  }

  async function salvarEdicao() {
    if (editandoId === null) return
    const qtd = Number(editForm.quantidade)
    if (!Number.isFinite(qtd) || qtd < 1) {
      toast.error('Informe uma quantidade válida.')
      return
    }
    setSalvando(true)
    try {
      await api.updateMaquininha(editandoId, {
        operadoraId: Number(editForm.operadoraId),
        tipo: editForm.tipo,
        quantidade: qtd,
        statusIntegracao: editForm.statusIntegracao,
        observacao: editForm.observacao.trim() || undefined,
      })
      toast.success('Maquininha atualizada.')
      setEditandoId(null)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar a maquininha.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(item: ClienteMaquininha) {
    if (!window.confirm(`Remover o registro de ${item.operadoraNome} (${TIPO_LABEL[item.tipo]}) deste cliente?`)) return
    setSalvando(true)
    try {
      await api.deleteMaquininha(item.id)
      toast.success('Registro removido.')
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível remover o registro.')
    } finally {
      setSalvando(false)
    }
  }

  const operadoraOptions = operadoras.map((o) => ({ value: String(o.id), label: o.nome }))
  const tipoOptions = [
    { value: 'TEF', label: 'TEF' },
    { value: 'SMARTPOS', label: 'SmartPOS' },
  ]

  return (
    <Card className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <CreditCard className="w-4 h-4 text-emerald-500" /> Maquininhas de cartão
        </h3>
        {!novoAberto && (
          <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={abrirNovo}>
            Adicionar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {novoAberto && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select label="Operadora" options={operadoraOptions} value={novoForm.operadoraId} onChange={(e) => setNovoForm((f) => ({ ...f, operadoraId: e.target.value }))} />
                <Select label="Tipo" options={tipoOptions} value={novoForm.tipo} onChange={(e) => setNovoForm((f) => ({ ...f, tipo: e.target.value as TipoMaquininha }))} />
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={novoForm.quantidade}
                    onChange={(e) => setNovoForm((f) => ({ ...f, quantidade: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                  />
                </div>
                <Select label="Status de integração" options={STATUS_OPCOES} value={novoForm.statusIntegracao} onChange={(e) => setNovoForm((f) => ({ ...f, statusIntegracao: e.target.value as StatusMaquininha }))} />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Observação</label>
                  <textarea
                    value={novoForm.observacao}
                    onChange={(e) => setNovoForm((f) => ({ ...f, observacao: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="secondary" icon={<X className="w-3.5 h-3.5" />} onClick={() => setNovoAberto(false)} disabled={salvando}>
                  Cancelar
                </Button>
                <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => void salvarNovo()} loading={salvando}>
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {itens.length === 0 && !novoAberto ? (
            <p className="text-sm text-slate-500 py-2">Nenhuma maquininha cadastrada para este cliente.</p>
          ) : (
            itens.map((item) => {
              const editando = editandoId === item.id
              if (editando) {
                return (
                  <div key={item.id} className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select label="Operadora" options={operadoraOptions} value={editForm.operadoraId} onChange={(e) => setEditForm((f) => ({ ...f, operadoraId: e.target.value }))} />
                      <Select label="Tipo" options={tipoOptions} value={editForm.tipo} onChange={(e) => setEditForm((f) => ({ ...f, tipo: e.target.value as TipoMaquininha }))} />
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Quantidade</label>
                        <input
                          type="number"
                          min={1}
                          value={editForm.quantidade}
                          onChange={(e) => setEditForm((f) => ({ ...f, quantidade: e.target.value }))}
                          className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                        />
                      </div>
                      <Select label="Status de integração" options={STATUS_OPCOES} value={editForm.statusIntegracao} onChange={(e) => setEditForm((f) => ({ ...f, statusIntegracao: e.target.value as StatusMaquininha }))} />
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Observação</label>
                        <textarea
                          value={editForm.observacao}
                          onChange={(e) => setEditForm((f) => ({ ...f, observacao: e.target.value }))}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button size="sm" variant="secondary" icon={<X className="w-3.5 h-3.5" />} onClick={() => setEditandoId(null)} disabled={salvando}>
                        Cancelar
                      </Button>
                      <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => void salvarEdicao()} loading={salvando}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {operadorasPorId.get(item.operadoraId) || item.operadoraNome}
                      </span>
                      <span className="text-xs text-slate-500">{TIPO_LABEL[item.tipo]}</span>
                      <span className="text-xs text-slate-500">• {item.quantidade} maquininha{item.quantidade !== 1 ? 's' : ''}</span>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASSES[item.statusIntegracao])}>
                        {STATUS_LABEL[item.statusIntegracao]}
                      </span>
                    </div>
                    {item.observacao && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">{item.observacao}</p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => abrirEdicao(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => void remover(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-500/30 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remover
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </Card>
  )
}
