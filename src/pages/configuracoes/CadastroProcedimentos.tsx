import { useEffect, useState } from 'react'
import { Check, Edit3, Plus, Stethoscope, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Input'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { ProcedimentoCadastro } from '../../types'

export function CadastroProcedimentos() {
  const { can } = usePermissions()
  const canAccess = can('cadastro-procedimentos')

  const [procedimentos, setProcedimentos] = useState<ProcedimentoCadastro[]>([])
  const [tecnicos, setTecnicos] = useState<Array<{ id: number; nome: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    duracaoMin: '60',
    ordem: '0',
    ativo: true,
    tecnicoIds: [] as number[],
  })

  async function loadData() {
    setLoading(true)
    try {
      const [data, usuarios] = await Promise.all([
        api.getProcedimentos(),
        api.getUsuarios(),
      ])
      const mappedTecnicos = (Array.isArray(usuarios) ? usuarios : [])
        .map((usuario: any) => ({
          id: Number(usuario?.id ?? usuario?.COD_USU ?? usuario?.codUsu),
          nome: usuario?.nome || usuario?.nomeCompleto || usuario?.nomeUsu || `#${usuario?.id ?? usuario?.COD_USU ?? usuario?.codUsu}`,
          ativo: usuario?.ativo,
        }))
        .filter((usuario: any) => Number.isFinite(usuario.id) && usuario.id > 0)
        .filter((usuario: any) => {
          if (usuario.ativo === undefined || usuario.ativo === null) return true
          return usuario.ativo === true || usuario.ativo === 1 || usuario.ativo === '1' || usuario.ativo === 'S' || usuario.ativo === 's'
        })
        .map((usuario: any) => ({ id: usuario.id, nome: usuario.nome }))
      setProcedimentos(data)
      setTecnicos(mappedTecnicos)
    } catch {
      setProcedimentos([])
      setTecnicos([])
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
      duracaoMin: '60',
      ordem: '0',
      ativo: true,
      tecnicoIds: [],
    })
  }

  function toggleTecnico(tecnicoId: number) {
    setForm((current) => ({
      ...current,
      tecnicoIds: current.tecnicoIds.includes(tecnicoId)
        ? current.tecnicoIds.filter((id) => id !== tecnicoId)
        : [...current.tecnicoIds, tecnicoId],
    }))
  }

  async function saveProcedimento() {
    const nome = form.nome.trim()
    const duracaoMin = Number(form.duracaoMin || 0)
    if (!nome) {
      alert('Informe o nome do procedimento.')
      return
    }
    if (!Number.isFinite(duracaoMin) || duracaoMin < 15) {
      alert('Informe uma duração mínima de 15 minutos.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome,
        descricao: form.descricao.trim(),
        duracaoMin,
        ordem: Number(form.ordem || 0),
        ativo: form.ativo,
        tecnicoIds: form.tecnicoIds,
      }
      if (editId) {
        await api.updateProcedimento(editId, payload)
      } else {
        await api.createProcedimento(payload)
      }
      await loadData()
      resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar procedimento.')
    } finally {
      setSaving(false)
    }
  }

  function editProcedimento(p: ProcedimentoCadastro) {
    setEditId(p.id)
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? '',
      duracaoMin: String(p.duracaoMin ?? 60),
      ordem: String(p.ordem ?? 0),
      ativo: p.ativo,
      tecnicoIds: Array.isArray(p.tecnicoIds) ? p.tecnicoIds : [],
    })
  }

  async function removeProcedimento(id: number) {
    if (!confirm('Excluir este procedimento?')) return
    try {
      await api.deleteProcedimento(id)
      await loadData()
      if (editId === id) resetForm()
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir procedimento.')
    }
  }

  async function toggleAtivo(id: number) {
    try {
      await api.toggleProcedimento(id)
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao alterar status do procedimento.')
    }
  }

  if (!canAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Você não possui permissão para acessar o cadastro de procedimentos.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadastro de Procedimentos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Defina os procedimentos e a duração padrão para validar automaticamente os agendamentos programados.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Input
            label="Nome do procedimento"
            placeholder="Ex: Treinamento fiscal completo"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          />
          <Input
            label="Duração (minutos)"
            type="number"
            min={15}
            step={15}
            value={form.duracaoMin}
            onChange={(e) => setForm((f) => ({ ...f, duracaoMin: e.target.value }))}
          />
          <Input
            label="Ordem"
            type="number"
            value={form.ordem}
            onChange={(e) => setForm((f) => ({ ...f, ordem: e.target.value }))}
          />
        </div>

        <div className="mt-4">
          <Textarea
            label="Descrição (opcional)"
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            rows={3}
            placeholder="Detalhes do procedimento para orientar o agendamento"
            maxLength={2000}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Técnicos vinculados (opcional)</p>
            <p className="text-xs text-slate-500">Se nenhum técnico for marcado, o procedimento continuará disponível para todos.</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            {tecnicos.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {tecnicos.map((tecnico) => (
                  <label key={tecnico.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.tecnicoIds.includes(tecnico.id)}
                      onChange={() => toggleTecnico(tecnico.id)}
                      className="accent-blue-600"
                    />
                    <span className="break-words">{tecnico.nome}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhum técnico disponível para vínculo.</p>
            )}
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
            Procedimento ativo
          </label>
          <div className="flex gap-2">
            {editId ? (
              <Button variant="secondary" onClick={resetForm}>Cancelar edição</Button>
            ) : null}
            <Button icon={<Plus className="w-4 h-4" />} onClick={saveProcedimento} disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar procedimento'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Procedimentos Cadastrados ({procedimentos.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : procedimentos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum procedimento cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {procedimentos.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.nome}</p>
                      <span className={clsx(
                        'text-[11px] px-2 py-0.5 rounded-full',
                        p.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                      )}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Duração: {p.duracaoMin} min • Ordem: {p.ordem}</p>
                    {p.descricao ? (
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{p.descricao}</p>
                    ) : null}
                    {p.tecnicos && p.tecnicos.length > 0 ? (
                      <p className="text-xs text-slate-500 mt-1 break-words">
                        Técnicos vinculados: {p.tecnicos.map((tecnico) => tecnico.nome).join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">Técnicos vinculados: todos os técnicos</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleAtivo(p.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                      title={p.ativo ? 'Inativar procedimento' : 'Ativar procedimento'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => editProcedimento(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                      title="Editar procedimento"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeProcedimento(p.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Excluir procedimento"
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
