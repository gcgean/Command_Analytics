import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { EtapaCadastro } from '../../types'

type TelaOption = { id: string; label: string }

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

export function CadastroEtapas() {
  const { can } = usePermissions()
  const canAccess = can('cadastro-etapas')

  const [etapas, setEtapas] = useState<EtapaCadastro[]>([])
  const [telas, setTelas] = useState<TelaOption[]>(DEFAULT_TELAS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nome: '',
    cor: '#3b82f6',
    ordem: '0',
    telas: [] as string[],
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
      const [etapasResp, telasResp] = await Promise.all([
        api.getEtapas(),
        api.getEtapasTelas().catch(() => DEFAULT_TELAS),
      ])
      setEtapas(etapasResp)
      setTelas(Array.isArray(telasResp) && telasResp.length ? telasResp : DEFAULT_TELAS)
    } catch {
      setEtapas([])
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
    setForm({ nome: '', cor: '#3b82f6', ordem: '0', telas: [], ativo: true })
  }

  function toggleTela(telaId: string) {
    setForm((prev) => ({
      ...prev,
      telas: prev.telas.includes(telaId)
        ? prev.telas.filter((t) => t !== telaId)
        : [...prev.telas, telaId],
    }))
  }

  async function saveEtapa() {
    if (!form.nome.trim()) {
      alert('Informe o nome da etapa.')
      return
    }
    if (form.telas.length === 0) {
      alert('Selecione pelo menos uma tela.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        cor: form.cor || '#3b82f6',
        ordem: Number(form.ordem || 0),
        telas: form.telas,
        ativo: form.ativo,
      }
      if (editId) {
        await api.updateEtapa(editId, payload)
      } else {
        await api.createEtapa(payload)
      }
      await loadData()
      resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar etapa.')
    } finally {
      setSaving(false)
    }
  }

  function editEtapa(etapa: EtapaCadastro) {
    setEditId(etapa.id)
    setForm({
      nome: etapa.nome,
      cor: etapa.cor || '#3b82f6',
      ordem: String(etapa.ordem ?? 0),
      telas: etapa.telas ?? [],
      ativo: etapa.ativo,
    })
  }

  async function removeEtapa(id: number) {
    if (!confirm('Excluir esta etapa?')) return
    try {
      await api.deleteEtapa(id)
      await loadData()
      if (editId === id) resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir etapa.')
    }
  }

  async function toggleAtivo(id: number) {
    try {
      await api.toggleEtapa(id)
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao alterar status da etapa.')
    }
  }

  if (!canAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Você não possui permissão para acessar o cadastro de etapas.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Etapas</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure nome, cor e as telas onde cada etapa poderá ser utilizada.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Input
            label="Nome da etapa"
            placeholder="Ex: Em Validação"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Cor</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.cor}
                onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                className="h-10 w-14 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <Input
                value={form.cor}
                onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <Input
            label="Ordem"
            type="number"
            value={form.ordem}
            onChange={(e) => setForm((f) => ({ ...f, ordem: e.target.value }))}
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Telas onde será usada</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {telas.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTela(t.id)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                  form.telas.includes(t.id)
                    ? 'bg-blue-600/15 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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

        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              className="accent-blue-600"
            />
            Etapa ativa
          </label>
          <div className="flex gap-2">
            {editId ? (
              <Button variant="secondary" onClick={resetForm}>Cancelar edição</Button>
            ) : null}
            <Button icon={<Plus className="w-4 h-4" />} onClick={saveEtapa} disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar etapa'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Etapas Cadastradas ({etapas.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : etapas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma etapa cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {etapas.map((e) => (
              <div
                key={e.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: e.cor }} />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{e.nome}</p>
                      <span className={clsx(
                        'text-[11px] px-2 py-0.5 rounded-full',
                        e.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                      )}>
                        {e.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Ordem: {e.ordem}</p>
                    <div className="flex gap-1 flex-wrap mt-2">
                      {e.telas.map((tela) => (
                        <span key={`${e.id}-${tela}`} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                          {telaMap.get(tela) ?? tela}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleAtivo(e.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                      title={e.ativo ? 'Inativar etapa' : 'Ativar etapa'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => editEtapa(e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                      title="Editar etapa"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeEtapa(e.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Excluir etapa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

