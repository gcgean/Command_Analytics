import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, Package, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { ServicoCadastro, ChecklistCadastro } from '../../types'

export function CadastroServicos() {
  const { can } = usePermissions()
  const canAccess = can('cadastro-servicos') || can('cadastro-servicos-editar')
  const canEdit = can('cadastro-servicos-editar')

  const [servicos, setServicos] = useState<ServicoCadastro[]>([])
  const [checklists, setChecklists] = useState<ChecklistCadastro[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    ordem: '0',
    checklistIds: [] as number[],
    ativo: true,
  })

  const checklistMap = useMemo(() => {
    const map = new Map<number, string>()
    checklists.forEach((c) => map.set(c.id, c.nome))
    return map
  }, [checklists])

  async function loadData() {
    setLoading(true)
    try {
      const [servicosResp, checklistsResp] = await Promise.all([
        api.getServicos(),
        api.getChecklists().catch(() => []),
      ])
      setServicos(servicosResp)
      setChecklists(checklistsResp)
    } catch {
      setServicos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canAccess) {
      void loadData()
    }
  }, [canAccess])

  function resetForm() {
    setEditId(null)
    setForm({
      nome: '',
      descricao: '',
      ordem: '0',
      checklistIds: [],
      ativo: true,
    })
  }

  function toggleChecklist(checklistId: number) {
    setForm((prev) => ({
      ...prev,
      checklistIds: prev.checklistIds.includes(checklistId)
        ? prev.checklistIds.filter((id) => id !== checklistId)
        : [...prev.checklistIds, checklistId],
    }))
  }

  async function saveServico() {
    if (!canEdit) return
    if (!form.nome.trim()) {
      alert('Informe o nome do serviço.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        ordem: Number(form.ordem || 0),
        checklistIds: form.checklistIds,
        ativo: form.ativo,
      }
      if (editId) {
        await api.updateServico(editId, payload)
      } else {
        await api.createServico(payload)
      }
      await loadData()
      resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar serviço.')
    } finally {
      setSaving(false)
    }
  }

  function editServico(servico: ServicoCadastro) {
    if (!canEdit) return
    setEditId(servico.id)
    setForm({
      nome: servico.nome,
      descricao: servico.descricao ?? '',
      ordem: String(servico.ordem ?? 0),
      checklistIds: servico.checklistIds ?? [],
      ativo: servico.ativo,
    })
  }

  async function removeServico(id: number) {
    if (!canEdit) return
    if (!confirm('Excluir este serviço?')) return
    try {
      await api.deleteServico(id)
      await loadData()
      if (editId === id) resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir serviço.')
    }
  }

  async function toggleAtivo(id: number) {
    if (!canEdit) return
    try {
      await api.toggleServico(id)
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao alterar status do serviço.')
    }
  }

  if (!canAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Você não possui permissão para acessar o cadastro de serviços.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Serviços</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure os serviços de implantação e os checklists vinculados a cada um.
        </p>
      </div>

      {!canEdit ? (
        <Card>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Você possui acesso de visualização. Para criar ou editar, habilite a permissão <strong>cadastro-servicos-editar</strong>.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Input
            label="Nome do serviço"
            placeholder="Ex: Módulo Fiscal"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            disabled={!canEdit}
          />
          <Input
            label="Ordem"
            type="number"
            value={form.ordem}
            onChange={(e) => setForm((f) => ({ ...f, ordem: e.target.value }))}
            disabled={!canEdit}
          />
          <label className="flex items-end gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              className="accent-blue-600 mb-2"
              disabled={!canEdit}
            />
            Serviço ativo
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Descrição</label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            rows={3}
            placeholder="Descreva o objetivo deste serviço"
            disabled={!canEdit}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:opacity-60"
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Checklists vinculados</p>
          {checklists.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum checklist cadastrado no momento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {checklists.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => canEdit && toggleChecklist(c.id)}
                  disabled={!canEdit}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    form.checklistIds.includes(c.id)
                      ? 'bg-emerald-600/15 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
                    !canEdit && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                      form.checklistIds.includes(c.id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400'
                    )}
                  >
                    {form.checklistIds.includes(c.id) ? <Check className="w-2.5 h-2.5" /> : null}
                  </span>
                  <span className="truncate">{c.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editId ? (
            <Button variant="secondary" onClick={resetForm} disabled={!canEdit}>Cancelar edição</Button>
          ) : null}
          <Button icon={<Plus className="w-4 h-4" />} onClick={saveServico} disabled={!canEdit || saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar serviço'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Serviços Cadastrados ({servicos.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : servicos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum serviço cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {servicos.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.nome}</p>
                      <span className={clsx(
                        'text-[11px] px-2 py-0.5 rounded-full',
                        s.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                      )}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {s.descricao ? (
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{s.descricao}</p>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-1">Ordem: {s.ordem}</p>
                    <div className="flex gap-1 flex-wrap mt-2">
                      {s.checklistIds.length === 0 ? (
                        <span className="text-xs text-slate-500">Sem checklist vinculado</span>
                      ) : (
                        s.checklistIds.map((checklistId) => (
                          <span key={`${s.id}-${checklistId}`} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                            {checklistMap.get(checklistId) ?? `Checklist #${checklistId}`}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleAtivo(s.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                        title={s.ativo ? 'Inativar serviço' : 'Ativar serviço'}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => editServico(s)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                        title="Editar serviço"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeServico(s.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Excluir serviço"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
