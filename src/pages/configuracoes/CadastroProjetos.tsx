import { useEffect, useState } from 'react'
import { Check, Edit3, Monitor, Plus, Smartphone, Trash2, X, Globe } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { Projeto, SistemaVersaoProjeto, TipoProjeto } from '../../types'

const TIPOS: Array<{ value: TipoProjeto; label: string; icon: React.ReactNode }> = [
  { value: 'WEB', label: 'Web', icon: <Globe className="w-3.5 h-3.5" /> },
  { value: 'DESKTOP', label: 'Desktop', icon: <Monitor className="w-3.5 h-3.5" /> },
  { value: 'MOBILE', label: 'Mobile', icon: <Smartphone className="w-3.5 h-3.5" /> },
]

const TIPO_LABEL: Record<TipoProjeto, string> = { WEB: 'Web', DESKTOP: 'Desktop', MOBILE: 'Mobile' }

// Define com qual versão instalada no cliente as solicitações desse projeto serão comparadas na
// aba "Clientes a atualizar". Sem isso, o projeto não entra naquela verificação.
const SISTEMAS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Não acompanha versão' },
  { value: 'RETAGUARDA', label: 'Retaguarda (Command Server)' },
  { value: 'PDV', label: 'PDV (CSPDV)' },
  { value: 'CONNECTION', label: 'Connection' },
]

export function CadastroProjetos() {
  const { can } = usePermissions()
  const canAccess = can('cadastro-projetos')

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ nome: '', cor: '#3b82f6', tipo: 'WEB' as TipoProjeto, sistemaVersao: '' as '' | SistemaVersaoProjeto, ativo: true })

  async function loadData() {
    setLoading(true)
    try {
      setProjetos(await api.getProjetos())
    } catch {
      setProjetos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canAccess) void loadData()
  }, [canAccess])

  function resetForm() {
    setEditId(null)
    setForm({ nome: '', cor: '#3b82f6', tipo: 'WEB', sistemaVersao: '', ativo: true })
  }

  async function salvar() {
    if (!form.nome.trim()) {
      alert('Informe o nome do projeto.')
      return
    }
    setSaving(true)
    try {
      const payload = { nome: form.nome.trim(), cor: form.cor || undefined, tipo: form.tipo, sistemaVersao: form.sistemaVersao || null, ativo: form.ativo }
      if (editId) {
        await api.updateProjeto(editId, payload)
      } else {
        await api.createProjeto(payload)
      }
      await loadData()
      resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar projeto.')
    } finally {
      setSaving(false)
    }
  }

  function editar(p: Projeto) {
    setEditId(p.id)
    setForm({ nome: p.nome, cor: p.cor || '#3b82f6', tipo: p.tipo, sistemaVersao: p.sistemaVersao ?? '', ativo: p.ativo })
  }

  async function remover(p: Projeto) {
    if (!confirm(`Excluir o projeto "${p.nome}"?`)) return
    try {
      await api.deleteProjeto(p.id)
      await loadData()
      if (editId === p.id) resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir projeto.')
    }
  }

  async function toggleAtivo(p: Projeto) {
    try {
      await api.toggleProjeto(p.id)
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao alterar status do projeto.')
    }
  }

  if (!canAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Você não possui permissão para acessar o cadastro de projetos.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Projetos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Os projetos aparecem no lançamento de solicitações e no filtro do Mapa de Solicitações.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Input
            label="Nome do projeto"
            placeholder="Ex: Command Analytics"
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
              <Input value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} placeholder="#3b82f6" />
            </div>
          </div>
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoProjeto }))}
            options={TIPOS.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Select
            label="Versão acompanhada"
            value={form.sistemaVersao}
            onChange={(e) => setForm((f) => ({ ...f, sistemaVersao: e.target.value as '' | SistemaVersaoProjeto }))}
            options={SISTEMAS}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mt-7">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              className="accent-blue-600"
            />
            Projeto ativo
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editId ? <Button variant="secondary" onClick={resetForm}>Cancelar edição</Button> : null}
          <Button icon={<Plus className="w-4 h-4" />} onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar projeto'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Projetos Cadastrados ({projetos.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : projetos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum projeto cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {projetos.map((p) => {
              const tipoInfo = TIPOS.find((t) => t.value === p.tipo)
              return (
                <div key={p.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.cor || '#64748b' }} />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.nome}</p>
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                      {tipoInfo?.icon} {TIPO_LABEL[p.tipo]}
                    </span>
                    <span className={clsx(
                      'text-[11px] px-2 py-0.5 rounded-full',
                      p.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                    )}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleAtivo(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                      title={p.ativo ? 'Inativar projeto' : 'Ativar projeto'}
                    >
                      {p.ativo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => editar(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                      title="Editar projeto"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remover(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Excluir projeto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
