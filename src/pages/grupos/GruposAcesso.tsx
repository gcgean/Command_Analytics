import { useState, useEffect } from 'react'
import { ShieldCheck, Plus, Trash2, Users, ChevronDown, ChevronRight, Crown, Pencil, X, Check } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../services/api'
import clsx from 'clsx'

interface Grupo {
  id: number
  nome: string
  descricao: string | null
  superGrupo: number | boolean
  ativo: number | boolean
  totalUsuarios: number
  totalPermissoes: number
}

interface GrupoDetalhe {
  id: number
  nome: string
  descricao: string | null
  superGrupo: number | boolean
  permissoes: string[]
  usuarios: { id: number; nome: string; usuario: string }[]
}

interface Recurso {
  id: string
  label: string
  grupo: string
}

interface Tecnico { id: number; nome: string; nomeUsu?: string }

// Group resources by category
function groupRecursos(recursos: Recurso[]) {
  const map: Record<string, Recurso[]> = {}
  recursos.forEach(r => {
    if (!map[r.grupo]) map[r.grupo] = []
    map[r.grupo].push(r)
  })
  return Object.entries(map)
}

export function GruposAcesso() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [allUsers, setAllUsers] = useState<Tecnico[]>([])
  const [loading, setLoading] = useState(true)

  // Selected group for detail view
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoDetalhe | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // New group modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ nome: '', descricao: '', superGrupo: false })
  const [savingNew, setSavingNew] = useState(false)

  // Edit group modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ id: 0, nome: '', descricao: '', superGrupo: false })
  const [savingEdit, setSavingEdit] = useState(false)

  // Permissions panel state
  const [savingPerms, setSavingPerms] = useState(false)
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  // Add user
  const [addUserId, setAddUserId] = useState('')
  const [savingUser, setSavingUser] = useState(false)

  useEffect(() => {
    loadGrupos()
    api.getGruposRecursos().then((r: any) => setRecursos(r)).catch(() => {})
    api.getUsuarios().then((u: any) =>
      setAllUsers(u.map((x: any) => ({ id: x.id, nome: x.nome || x.nomeUsu || `#${x.id}`, nomeUsu: x.nomeUsu })))
    ).catch(() => {})
  }, [])

  async function loadGrupos() {
    setLoading(true)
    api.getGrupos().then((g: any) => setGrupos(g)).catch(() => {}).finally(() => setLoading(false))
  }

  async function openGrupo(id: number) {
    setLoadingDetail(true)
    setSelectedGrupo(null)
    const detail: any = await api.getGrupoById(id).catch(() => null)
    if (detail) {
      setSelectedGrupo(detail)
      setSelectedPerms(new Set(detail.permissoes))
      // expand all categories by default
      const cats = new Set(recursos.map(r => r.grupo))
      setExpandedCats(cats)
    }
    setLoadingDetail(false)
  }

  async function createGrupo() {
    if (!newForm.nome) return
    setSavingNew(true)
    try {
      await api.createGrupo({ nome: newForm.nome, descricao: newForm.descricao || undefined, superGrupo: newForm.superGrupo })
      setShowNewModal(false)
      setNewForm({ nome: '', descricao: '', superGrupo: false })
      await loadGrupos()
    } catch { } finally { setSavingNew(false) }
  }

  function openEdit(g: Grupo) {
    setEditForm({ id: g.id, nome: g.nome, descricao: g.descricao ?? '', superGrupo: !!g.superGrupo })
    setShowEditModal(true)
  }

  async function saveEdit() {
    setSavingEdit(true)
    try {
      await api.updateGrupo(editForm.id, { nome: editForm.nome, descricao: editForm.descricao || undefined, superGrupo: editForm.superGrupo })
      setShowEditModal(false)
      await loadGrupos()
      if (selectedGrupo?.id === editForm.id) openGrupo(editForm.id)
    } catch { } finally { setSavingEdit(false) }
  }

  async function deleteGrupo(id: number, nome: string) {
    if (!confirm(`Excluir grupo "${nome}"? Todos os vínculos serão removidos.`)) return
    await api.deleteGrupo(id).catch(() => {})
    if (selectedGrupo?.id === id) setSelectedGrupo(null)
    await loadGrupos()
  }

  function togglePerm(recurso: string) {
    setSelectedPerms(prev => {
      const next = new Set(prev)
      if (next.has(recurso)) next.delete(recurso)
      else next.add(recurso)
      return next
    })
  }

  function toggleCategory(cat: string, catRecursos: Recurso[]) {
    const allSelected = catRecursos.every(r => selectedPerms.has(r.id))
    setSelectedPerms(prev => {
      const next = new Set(prev)
      catRecursos.forEach(r => allSelected ? next.delete(r.id) : next.add(r.id))
      return next
    })
  }

  async function savePermissoes() {
    if (!selectedGrupo) return
    setSavingPerms(true)
    try {
      await api.setGrupoPermissoes(selectedGrupo.id, Array.from(selectedPerms))
      await openGrupo(selectedGrupo.id)
      await loadGrupos()
    } catch { } finally { setSavingPerms(false) }
  }

  async function addUser() {
    if (!selectedGrupo || !addUserId) return
    setSavingUser(true)
    try {
      await api.addUserToGrupo(selectedGrupo.id, Number(addUserId))
      setAddUserId('')
      await openGrupo(selectedGrupo.id)
      await loadGrupos()
    } catch { } finally { setSavingUser(false) }
  }

  async function removeUser(usuarioId: number) {
    if (!selectedGrupo) return
    if (!confirm('Remover usuário do grupo?')) return
    await api.removeUserFromGrupo(selectedGrupo.id, usuarioId).catch(() => {})
    await openGrupo(selectedGrupo.id)
    await loadGrupos()
  }

  const isSuperGrupo = !!selectedGrupo?.superGrupo
  const groupedRecursos = groupRecursos(recursos)
  const usersNotInGroup = allUsers.filter(u => !selectedGrupo?.usuarios.some(gu => gu.id === u.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Defina grupos com permissões de acesso e vincule usuários</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
          Novo Grupo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Lista de grupos ── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Grupos ({grupos.length})</h3>

          {loading && <p className="text-sm text-slate-500">Carregando...</p>}

          {!loading && grupos.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum grupo cadastrado.</p>
            </div>
          )}

          {grupos.map(g => (
            <div
              key={g.id}
              onClick={() => openGrupo(g.id)}
              className={clsx(
                'p-4 rounded-xl border cursor-pointer transition-all',
                selectedGrupo?.id === g.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-white dark:bg-slate-800'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {g.superGrupo ? (
                    <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  )}
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{g.nome}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(g) }}
                    className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteGrupo(g.id, g.nome) }}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {g.descricao && <p className="text-xs text-slate-500 mt-1 truncate">{g.descricao}</p>}
              <div className="flex gap-3 mt-2">
                {g.superGrupo ? (
                  <span className="text-xs text-amber-400 font-medium">Super Grupo — Acesso Total</span>
                ) : (
                  <>
                    <span className="text-xs text-slate-500">{Number(g.totalPermissoes)} recurso{Number(g.totalPermissoes) !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-slate-500">{Number(g.totalUsuarios)} usuário{Number(g.totalUsuarios) !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Detalhes do grupo selecionado ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedGrupo && !loadingDetail && (
            <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
              Selecione um grupo para editar
            </div>
          )}

          {loadingDetail && (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Carregando...
            </div>
          )}

          {selectedGrupo && !loadingDetail && (
            <>
              {/* Header do grupo */}
              <Card>
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    isSuperGrupo ? 'bg-amber-500/20' : 'bg-blue-500/20'
                  )}>
                    {isSuperGrupo
                      ? <Crown className="w-5 h-5 text-amber-400" />
                      : <ShieldCheck className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedGrupo.nome}</p>
                    {selectedGrupo.descricao && <p className="text-xs text-slate-500 mt-0.5">{selectedGrupo.descricao}</p>}
                  </div>
                  {isSuperGrupo && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                      Super Grupo
                    </span>
                  )}
                </div>
              </Card>

              {/* Usuários do grupo */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    Usuários ({selectedGrupo.usuarios.length})
                  </h4>
                </div>

                {selectedGrupo.usuarios.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedGrupo.usuarios.map(u => (
                      <div key={u.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200">
                        <span>{u.nome}</span>
                        <button
                          onClick={() => removeUser(u.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      options={[
                        { value: '', label: 'Adicionar usuário...' },
                        ...usersNotInGroup.map(u => ({ value: String(u.id), label: u.nome }))
                      ]}
                      value={addUserId}
                      onChange={e => setAddUserId(e.target.value)}
                    />
                  </div>
                  <Button onClick={addUser} disabled={!addUserId || savingUser} icon={<Plus className="w-4 h-4" />}>
                    Adicionar
                  </Button>
                </div>
              </Card>

              {/* Permissões */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Permissões de Acesso
                    {isSuperGrupo && (
                      <span className="ml-2 text-xs text-amber-400 font-normal">Super grupo tem acesso a tudo automaticamente</span>
                    )}
                  </h4>
                  {!isSuperGrupo && (
                    <Button onClick={savePermissoes} disabled={savingPerms} icon={<Check className="w-4 h-4" />}>
                      {savingPerms ? 'Salvando...' : 'Salvar Permissões'}
                    </Button>
                  )}
                </div>

                {isSuperGrupo ? (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                    Membros do Super Grupo têm acesso irrestrito a todos os módulos e funcionalidades do sistema.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedRecursos.map(([cat, catRecursos]) => {
                      const allSel = catRecursos.every(r => selectedPerms.has(r.id))
                      const someSel = catRecursos.some(r => selectedPerms.has(r.id))
                      const isOpen = expandedCats.has(cat)
                      return (
                        <div key={cat} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedCats(prev => {
                              const n = new Set(prev)
                              isOpen ? n.delete(cat) : n.add(cat)
                              return n
                            })}
                            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-700/60 transition-colors"
                          >
                            <button
                              onClick={e => { e.stopPropagation(); toggleCategory(cat, catRecursos) }}
                              className={clsx(
                                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                                allSel ? 'bg-blue-600 border-blue-600' : someSel ? 'bg-blue-600/40 border-blue-500' : 'border-slate-600'
                              )}
                            >
                              {(allSel || someSel) && <Check className="w-2.5 h-2.5 text-white" />}
                            </button>
                            <span className="flex-1 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{cat}</span>
                            <span className="text-xs text-slate-500">{catRecursos.filter(r => selectedPerms.has(r.id)).length}/{catRecursos.length}</span>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                          </button>

                          {isOpen && (
                            <div className="divide-y divide-slate-700/50">
                              {catRecursos.map(r => (
                                <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                                  <div
                                    onClick={() => togglePerm(r.id)}
                                    className={clsx(
                                      'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer',
                                      selectedPerms.has(r.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-600 hover:border-slate-400'
                                    )}
                                  >
                                    {selectedPerms.has(r.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                  <span className="text-sm text-slate-700 dark:text-slate-300">{r.label}</span>
                                  <span className="ml-auto text-xs text-slate-600 font-mono">{r.id}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ── Modal: Novo Grupo ── */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Novo Grupo de Acesso" size="sm">
        <div className="space-y-4">
          <Input
            label="Nome do grupo *"
            placeholder="Ex: Suporte, Financeiro, Gerência..."
            value={newForm.nome}
            onChange={e => setNewForm(f => ({ ...f, nome: e.target.value }))}
          />
          <Input
            label="Descrição (opcional)"
            placeholder="Descreva o propósito do grupo..."
            value={newForm.descricao}
            onChange={e => setNewForm(f => ({ ...f, descricao: e.target.value }))}
          />
          <label className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer">
            <input
              type="checkbox"
              checked={newForm.superGrupo}
              onChange={e => setNewForm(f => ({ ...f, superGrupo: e.target.checked }))}
              className="w-4 h-4 accent-amber-500"
            />
            <div>
              <p className="text-sm font-medium text-amber-300 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" /> Super Grupo
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Usuários deste grupo terão acesso total ao sistema</p>
            </div>
          </label>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>Cancelar</Button>
            <Button onClick={createGrupo} disabled={savingNew || !newForm.nome}>
              {savingNew ? 'Criando...' : 'Criar Grupo'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Editar Grupo ── */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Grupo" size="sm">
        <div className="space-y-4">
          <Input
            label="Nome do grupo *"
            value={editForm.nome}
            onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
          />
          <Input
            label="Descrição"
            value={editForm.descricao}
            onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
          />
          <label className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer">
            <input
              type="checkbox"
              checked={editForm.superGrupo}
              onChange={e => setEditForm(f => ({ ...f, superGrupo: e.target.checked }))}
              className="w-4 h-4 accent-amber-500"
            />
            <div>
              <p className="text-sm font-medium text-amber-300 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" /> Super Grupo
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Acesso total ao sistema</p>
            </div>
          </label>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editForm.nome}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
