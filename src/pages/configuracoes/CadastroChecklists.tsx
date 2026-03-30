import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, ListChecks, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { ChecklistCadastro } from '../../types'

type TelaOption = { id: string; label: string }
type EtapaOption = { id: string; label: string }

const DEFAULT_TELAS: TelaOption[] = [
  { id: 'atendimentos', label: 'Atendimentos' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'agenda-agendamentos', label: 'Agenda Programada' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'crm', label: 'CRM / Negócios' },
  { id: 'implantacao', label: 'Implantação' },
  { id: 'desenvolvimento', label: 'Tarefas Dev' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comissoes', label: 'Comissões' },
  { id: 'boletim-comercial', label: 'Boletim Comercial' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'campanhas', label: 'Campanhas' },
  { id: 'banco-horas', label: 'Banco de Horas' },
]

export function CadastroChecklists() {
  const { can } = usePermissions()
  const canAccess = can('cadastro-checklists') || can('cadastro-checklists-editar')
  const canEdit = can('cadastro-checklists-editar')

  const [checklists, setChecklists] = useState<ChecklistCadastro[]>([])
  const [telas, setTelas] = useState<TelaOption[]>(DEFAULT_TELAS)
  const [etapas, setEtapas] = useState<EtapaOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [newItem, setNewItem] = useState('')
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    ordem: '0',
    telas: [] as string[],
    etapas: [] as string[],
    itens: [] as string[],
    ativo: true,
  })

  const telaMap = useMemo(() => {
    const map = new Map<string, string>()
    telas.forEach((t) => map.set(t.id, t.label))
    return map
  }, [telas])

  async function loadData() {
    setLoading(true)
    try {
      const [checklistsResp, telasResp, etapasResp] = await Promise.all([
        api.getChecklists(),
        api.getChecklistsTelas().catch(() => DEFAULT_TELAS),
        api.getEtapas({ tela: 'implantacao', ativo: '1' }).catch(() => []),
      ])
      setChecklists(checklistsResp)
      setTelas(Array.isArray(telasResp) && telasResp.length ? telasResp : DEFAULT_TELAS)
      setEtapas(
        Array.isArray(etapasResp)
          ? etapasResp.map((e: any) => ({ id: String(e.ordem ?? e.id), label: e.nome || `Etapa ${e.ordem ?? e.id}` }))
          : []
      )
    } catch {
      setChecklists([])
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
    setNewItem('')
    setForm({
      nome: '',
      descricao: '',
      ordem: '0',
      telas: [],
      etapas: [],
      itens: [],
      ativo: true,
    })
  }

  function toggleTela(telaId: string) {
    setForm((prev) => ({
      ...prev,
      telas: prev.telas.includes(telaId)
        ? prev.telas.filter((t) => t !== telaId)
        : [...prev.telas, telaId],
    }))
  }

  function toggleEtapa(etapaId: string) {
    setForm((prev) => ({
      ...prev,
      etapas: prev.etapas.includes(etapaId)
        ? prev.etapas.filter((e) => e !== etapaId)
        : [...prev.etapas, etapaId],
    }))
  }

  function addItem() {
    const item = newItem.trim()
    if (!item) return
    if (form.itens.some((i) => i.toLowerCase() === item.toLowerCase())) {
      setNewItem('')
      return
    }
    setForm((prev) => ({ ...prev, itens: [...prev.itens, item] }))
    setNewItem('')
  }

  function removeItem(index: number) {
    setForm((prev) => ({ ...prev, itens: prev.itens.filter((_, i) => i !== index) }))
  }

  async function saveChecklist() {
    if (!canEdit) return
    if (!form.nome.trim()) {
      alert('Informe o nome do checklist.')
      return
    }
    if (form.telas.length === 0) {
      alert('Selecione pelo menos uma tela.')
      return
    }
    if (form.itens.length === 0) {
      alert('Inclua pelo menos um item no checklist.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        ordem: Number(form.ordem || 0),
        telas: form.telas,
        etapas: form.etapas,
        itens: form.itens,
        ativo: form.ativo,
      }
      if (editId) {
        await api.updateChecklist(editId, payload)
      } else {
        await api.createChecklist(payload)
      }
      await loadData()
      resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar checklist.')
    } finally {
      setSaving(false)
    }
  }

  function editChecklist(checklist: ChecklistCadastro) {
    if (!canEdit) return
    setEditId(checklist.id)
    setNewItem('')
    setForm({
      nome: checklist.nome,
      descricao: checklist.descricao ?? '',
      ordem: String(checklist.ordem ?? 0),
      telas: checklist.telas ?? [],
      etapas: checklist.etapas ?? [],
      itens: checklist.itens ?? [],
      ativo: checklist.ativo,
    })
  }

  async function removeChecklist(id: number) {
    if (!canEdit) return
    if (!confirm('Excluir este checklist?')) return
    try {
      await api.deleteChecklist(id)
      await loadData()
      if (editId === id) resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir checklist.')
    }
  }

  async function toggleAtivo(id: number) {
    if (!canEdit) return
    try {
      await api.toggleChecklist(id)
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao alterar status do checklist.')
    }
  }

  if (!canAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Você não possui permissão para acessar o cadastro de checklist.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Checklist</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure os checklists, seus itens e as telas onde eles serão utilizados.
        </p>
      </div>

      {!canEdit ? (
        <Card>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Você possui acesso de visualização. Para criar ou editar, habilite a permissão <strong>cadastro-checklists-editar</strong>.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Input
            label="Nome do checklist"
            placeholder="Ex: Checklist de Implantação"
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
            Checklist ativo
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Descrição</label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            rows={3}
            placeholder="Descreva o objetivo deste checklist"
            disabled={!canEdit}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:opacity-60"
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Telas onde será usado</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {telas.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => canEdit && toggleTela(t.id)}
                disabled={!canEdit}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                  form.telas.includes(t.id)
                    ? 'bg-blue-600/15 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
                  !canEdit && 'opacity-60 cursor-not-allowed'
                )}
              >
                <span
                  className={clsx(
                    'w-4 h-4 rounded border flex items-center justify-center',
                    form.telas.includes(t.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                  )}
                >
                  {form.telas.includes(t.id) ? <Check className="w-2.5 h-2.5" /> : null}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Etapas vinculadas (implantação)</p>
          {etapas.length === 0 ? (
            <p className="text-xs text-slate-500">Sem etapas de implantação ativas no momento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {etapas.map((etapa) => (
                <button
                  key={etapa.id}
                  type="button"
                  onClick={() => canEdit && toggleEtapa(etapa.id)}
                  disabled={!canEdit}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    form.etapas.includes(etapa.id)
                      ? 'bg-emerald-600/15 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
                    !canEdit && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded border flex items-center justify-center',
                      form.etapas.includes(etapa.id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400'
                    )}
                  >
                    {form.etapas.includes(etapa.id) ? <Check className="w-2.5 h-2.5" /> : null}
                  </span>
                  {etapa.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Itens do checklist</p>
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar novo item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
              disabled={!canEdit}
            />
            <Button onClick={addItem} disabled={!canEdit || !newItem.trim()} icon={<Plus className="w-4 h-4" />}>
              Adicionar
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {form.itens.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum item adicionado.</p>
            ) : (
              form.itens.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <p className="text-sm text-slate-700 dark:text-slate-200">{item}</p>
                  {canEdit ? (
                    <button
                      onClick={() => removeItem(index)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Remover item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editId ? (
            <Button variant="secondary" onClick={resetForm} disabled={!canEdit}>Cancelar edição</Button>
          ) : null}
          <Button icon={<Plus className="w-4 h-4" />} onClick={saveChecklist} disabled={!canEdit || saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar checklist'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Checklists Cadastrados ({checklists.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : checklists.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum checklist cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {checklists.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.nome}</p>
                      <span className={clsx(
                        'text-[11px] px-2 py-0.5 rounded-full',
                        c.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                      )}>
                        {c.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {c.descricao ? (
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{c.descricao}</p>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-1">Ordem: {c.ordem} • Itens: {c.itens.length}</p>
                    <div className="flex gap-1 flex-wrap mt-2">
                      {c.telas.map((tela) => (
                        <span key={`${c.id}-${tela}`} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                          {telaMap.get(tela) ?? tela}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1">
                      {c.itens.map((item, index) => (
                        <p key={`${c.id}-item-${index}`} className="text-xs text-slate-600 dark:text-slate-300">
                          • {item}
                        </p>
                      ))}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleAtivo(c.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                        title={c.ativo ? 'Inativar checklist' : 'Ativar checklist'}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => editChecklist(c)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                        title="Editar checklist"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeChecklist(c.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Excluir checklist"
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
