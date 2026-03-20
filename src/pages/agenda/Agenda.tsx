import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Clock, User, Search, Calendar, Pencil, CheckSquare, Trash2, History } from 'lucide-react'
import { AuditoriaTimeline } from '../../components/ui/AuditoriaTimeline'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { Input } from '../../components/ui/Input'
import { api } from '../../services/api'
import type { AgendaItem } from '../../types'
import clsx from 'clsx'

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TIPOS = ['Instalação', 'Treinamento', 'Visita', 'Retorno', 'Outros']

const tipoColors: Record<string, string> = {
  Instalação: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Treinamento: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Visita: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Retorno: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}
const defaultTipoColor = 'bg-slate-500/20 text-slate-400 border-slate-500/30'

const statusColors: Record<string, string> = {
  'Aguardando':    'bg-amber-500/20 text-amber-400',
  'Efetuado':      'bg-emerald-500/20 text-emerald-400',
  'Não efetuado':  'bg-red-500/20 text-red-400',
  'Reagendado':    'bg-purple-500/20 text-purple-400',
}

function getStatusLabel(status: number | null | undefined): string {
  if (status === 0) return 'Aguardando'
  if (status === 1) return 'Aguardando'
  if (status === 2) return 'Efetuado'
  if (status === 3) return 'Não efetuado'
  if (status === 4) return 'Reagendado'
  return 'Aguardando'
}

function formatTime(t: any): string {
  if (!t) return ''
  // If it's already a string "HH:MM:SS" or "HH:MM"
  if (typeof t === 'string' && t.includes(':')) return t.substring(0, 5)
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getAgendaDateKey(a: AgendaItem): string {
  if (!a.data) return ''
  return String(a.data).substring(0, 10)
}

export function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })

  // All events for the current month (dots on calendar)
  const [agendaMes, setAgendaMes] = useState<AgendaItem[]>([])

  // Search results
  const [results, setResults] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // Filters
  const [filters, setFilters] = useState({
    dataInicio: todayStr(),
    dataFim: todayStr(),
    tecnicoId: '',
    tipo: '',
  })

  // Supporting data
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([])

  // New appointment modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    clienteId: '',
    tecnicoId: '',
    tipo: 'Instalação',
    data: todayStr(),
    horario: '09:00',
    observacoes: '',
  })

  // Edit appointment modal
  const [editItem, setEditItem] = useState<AgendaItem | null>(null)
  const [editForm, setEditForm] = useState({
    clienteId: '',
    tecnicoId: '',
    tipo: '',
    data: '',
    horario: '',
    observacoes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // New appointment saving state
  const [saving, setSaving] = useState(false)

  // Audit modal
  const [auditoriaItem, setAuditoriaItem] = useState<{ tabela: string; registroId: number; label: string } | null>(null)

  // Status change modal
  const [statusItem, setStatusItem] = useState<AgendaItem | null>(null)
  const [newStatus, setNewStatus] = useState(0)
  const [savingStatus, setSavingStatus] = useState(false)

  // Load supporting data on mount
  useEffect(() => {
    api.getUsuarios().then((u: any) =>
      setTecnicos(u.map((x: any) => ({ id: x.id, nome: x.nome || x.nomeUsu || `#${x.id}` })))
    ).catch(() => {})
  }, [])

  // Load month events whenever month changes
  useEffect(() => {
    loadMonthData()
  }, [currentMonth])

  // Initial search for today
  useEffect(() => {
    buscar()
  }, [])

  function loadMonthData() {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const ini = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const fim = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    api.getAgenda({ dataInicio: ini, dataFim: fim })
      .then(d => setAgendaMes(d as AgendaItem[]))
      .catch(() => {})
  }

  function buscar(overrides?: typeof filters) {
    const f = overrides ?? filters
    setLoading(true)
    setSearched(true)
    const params: Record<string, string> = {}
    if (f.dataInicio) params.dataInicio = f.dataInicio
    if (f.dataFim) params.dataFim = f.dataFim
    if (f.tecnicoId) params.tecnicoId = f.tecnicoId
    if (f.tipo) params.tipo = f.tipo
    api.getAgenda(params)
      .then(d => setResults(d as AgendaItem[]))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }

  function handleDayClick(dateKey: string) {
    const newFilters = { ...filters, dataInicio: dateKey, dataFim: dateKey }
    setFilters(newFilters)
    buscar(newFilters)
  }

  async function saveAgendamento() {
    setSaving(true)
    try {
      await api.createAgendaItem({
        clienteId: form.clienteId ? Number(form.clienteId) : undefined,
        tecnicoId: form.tecnicoId ? Number(form.tecnicoId) : undefined,
        tipo: form.tipo || undefined,
        data: form.data || undefined,
        horario: form.horario || undefined,
        observacoes: form.observacoes || undefined,
      } as any)
      setShowModal(false)
      setForm({ clienteId: '', tecnicoId: '', tipo: 'Instalação', data: todayStr(), horario: '09:00', observacoes: '' })
      buscar()
      loadMonthData()
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar agendamento.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(item: AgendaItem) {
    setEditItem(item)
    setEditForm({
      clienteId: String(item.clienteId ?? ''),
      tecnicoId: String(item.tecnicoId ?? ''),
      tipo: item.tipo ?? '',
      data: String(item.data ?? '').substring(0, 10),
      horario: formatTime(item.horarioIni),
      observacoes: (item as any).observacoes ?? '',
    })
  }

  async function saveEdit() {
    if (!editItem) return
    setSavingEdit(true)
    try {
      const isProg = (editItem as any).origem === 'programado'
      if (isProg) {
        await api.updateAgendamentoProg(editItem.id, {
          tecnicoId: editForm.tecnicoId ? Number(editForm.tecnicoId) : undefined,
          clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
          data: editForm.data || undefined,
          horaInicio: editForm.horario || undefined,
          descricao: editForm.observacoes || null,
        })
      } else {
        await api.updateAgendaItem(editItem.id, {
          clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
          tecnicoId: editForm.tecnicoId ? Number(editForm.tecnicoId) : null,
          tipo: editForm.tipo || null,
          data: editForm.data || null,
          horario: editForm.horario || null,
          observacoes: editForm.observacoes || null,
        } as any)
      }
      setEditItem(null)
      buscar()
    } catch { } finally {
      setSavingEdit(false)
    }
  }

  function openStatusChange(item: AgendaItem) {
    setStatusItem(item)
    setNewStatus(item.status ?? 0)
  }

  async function saveStatus() {
    if (!statusItem) return
    setSavingStatus(true)
    try {
      if ((statusItem as any).origem === 'programado') {
        await api.updateAgendamentoProgStatus(statusItem.id, newStatus)
      } else {
        await api.updateAgendaStatus(statusItem.id, newStatus)
      }
      setStatusItem(null)
      buscar()
    } catch { } finally {
      setSavingStatus(false)
    }
  }

  // Calendar helpers
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const formatDateKey = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const agendaByDate = agendaMes.reduce<Record<string, number>>((acc, a) => {
    const key = getAgendaDateKey(a)
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const today = todayStr()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Clique em um dia para filtrar ou use os filtros abaixo</p>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
          Novo Agendamento
        </Button>
      </div>

      {/* Compact Calendar */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-slate-100">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Week header */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_DAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-600 py-1">{d}</div>
          ))}
        </div>

        {/* Days — compact fixed height */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const dateKey = formatDateKey(day)
            const count = agendaByDate[dateKey] || 0
            const isSelected = filters.dataInicio === dateKey && filters.dataFim === dateKey
            const isToday = dateKey === today

            return (
              <button
                key={day}
                onClick={() => handleDayClick(dateKey)}
                className={clsx(
                  'h-9 w-full rounded-lg text-xs font-medium transition-all flex flex-col items-center justify-center gap-0.5',
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isToday
                    ? 'bg-slate-700 text-white border border-blue-500'
                    : 'text-slate-300 hover:bg-slate-700/60'
                )}
              >
                <span>{day}</span>
                {count > 0 && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: Math.min(count, 3) }, (_, idx) => (
                      <div key={idx} className={clsx('w-1 h-1 rounded-full', isSelected ? 'bg-white' : 'bg-blue-400')} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Filters + Results */}
      <Card>
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[130px]">
            <Input
              label="Data início"
              type="date"
              value={filters.dataInicio}
              onChange={e => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <Input
              label="Data fim"
              type="date"
              value={filters.dataFim}
              onChange={e => setFilters(f => ({ ...f, dataFim: e.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              label="Técnico"
              options={[{ value: '', label: 'Todos' }, ...tecnicos.map(t => ({ value: String(t.id), label: t.nome }))]}
              value={filters.tecnicoId}
              onChange={e => setFilters(f => ({ ...f, tecnicoId: e.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <Select
              label="Tipo"
              options={[{ value: '', label: 'Todos' }, ...TIPOS.map(t => ({ value: t, label: t }))]}
              value={filters.tipo}
              onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}
            />
          </div>
          <Button icon={<Search className="w-4 h-4" />} onClick={() => buscar()}>
            Buscar
          </Button>
        </div>

        {/* Counter */}
        {searched && !loading && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">
              <span className="font-semibold text-slate-200">{results.length}</span>
              {' '}agendamento{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-slate-400 text-sm">Buscando agendamentos...</div>
        )}

        {/* Empty state */}
        {!loading && searched && results.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum agendamento encontrado para os filtros selecionados.</p>
          </div>
        )}

        {/* Results list */}
        {!loading && results.length > 0 && (
          <div className="overflow-x-auto -mx-1">
          <div className="min-w-[680px] space-y-1 px-1">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-2">Horário</div>
              <div className="col-span-1">Data</div>
              <div className="col-span-2">Cliente / Descrição</div>
              <div className="col-span-2">Técnico</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2"></div>
            </div>

            {results.map(item => {
              const statusLabel = getStatusLabel(item.status)
              const tipoKey = item.tipo ?? ''
              const tipoClass = tipoColors[tipoKey] ?? defaultTipoColor
              const ini = formatTime(item.horarioIni)
              const fim = formatTime((item as any).horarioFim)
              const timeStr = ini ? (fim ? `${ini} – ${fim}` : ini) : '—'
              const rawDate = String(item.data ?? '').substring(0, 10)
              const dateStr = rawDate
                ? new Date(rawDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                : '—'
              const descricao = (item as any).observacoes as string | null | undefined

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-colors items-center border border-transparent hover:border-slate-700"
                >
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-sm font-mono text-slate-300 text-xs">{timeStr}</span>
                  </div>
                  <div className="col-span-1 text-xs text-slate-400">{dateStr}</div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{item.clienteNome || '—'}</p>
                    {descricao && <p className="text-xs text-slate-500 truncate mt-0.5">{descricao}</p>}
                    {(item as any).criadoPorNome && (
                      <p className="text-xs text-slate-600 mt-0.5 truncate">
                        por {(item as any).criadoPorNome}
                        {(item as any).dataCriacao ? ` · ${new Date((item as any).dataCriacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
                    <span className="text-xs text-slate-400 truncate">{item.tecnicoNome || '—'}</span>
                  </div>
                  <div className="col-span-1">
                    {(item as any).origem === 'programado' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-500/20 text-indigo-400 border-indigo-500/30">
                        Programado
                      </span>
                    ) : (
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full border', tipoClass)}>
                        {tipoKey || '—'}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full', statusColors[statusLabel] ?? '')}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="col-span-2 flex gap-1 justify-end">
                    <button
                      onClick={() => setAuditoriaItem({
                        tabela: (item as any).origem === 'programado' ? 'agendamento_programado' : 'agenda',
                        registroId: item.id,
                        label: item.clienteNome || `#${item.id}`,
                      })}
                      title="Histórico de auditoria"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openStatusChange(item)}
                      title="Alterar Status"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      title="Alterar Agendamento"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Excluir este agendamento?')) return
                        if ((item as any).origem === 'programado') {
                          await api.cancelAgendamentoProg(item.id).catch(() => {})
                        } else {
                          await api.deleteAgendaItem(item.id).catch(() => {})
                        }
                        buscar()
                        loadMonthData()
                      }}
                      title="Excluir"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        )}

        {!searched && (
          <div className="text-center py-8 text-slate-600 text-sm">
            Selecione um dia no calendário ou use os filtros acima para buscar agendamentos.
          </div>
        )}
      </Card>

      {/* New Appointment Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Novo Agendamento" size="md">
        <div className="space-y-4">
          <ClienteSearch
            label="Cliente"
            value={form.clienteId}
            onChange={id => setForm(f => ({ ...f, clienteId: id }))}
          />
          <Select
            label="Técnico"
            options={tecnicos.map(u => ({ value: String(u.id), label: u.nome }))}
            placeholder="Selecione o técnico"
            value={form.tecnicoId}
            onChange={e => setForm(f => ({ ...f, tecnicoId: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo"
              options={TIPOS.map(t => ({ value: t, label: t }))}
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
            />
            <Input
              label="Horário"
              type="time"
              value={form.horario}
              onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
            />
          </div>
          <Input
            label="Data"
            type="date"
            value={form.data}
            onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
          />
          <Input
            label="Observações"
            placeholder="Observações do agendamento..."
            value={form.observacoes}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={saveAgendamento} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Agendamento'}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Edit Appointment Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Alterar Agendamento" size="md">
        <div className="space-y-4">
          <ClienteSearch
            label="Cliente"
            value={editForm.clienteId}
            onChange={id => setEditForm(f => ({ ...f, clienteId: id }))}
          />
          <Select
            label="Técnico"
            options={tecnicos.map(u => ({ value: String(u.id), label: u.nome }))}
            placeholder="Selecione o técnico"
            value={editForm.tecnicoId}
            onChange={e => setEditForm(f => ({ ...f, tecnicoId: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo"
              options={TIPOS.map(t => ({ value: t, label: t }))}
              value={editForm.tipo}
              onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
            />
            <Input
              label="Horário"
              type="time"
              value={editForm.horario}
              onChange={e => setEditForm(f => ({ ...f, horario: e.target.value }))}
            />
          </div>
          <Input
            label="Data"
            type="date"
            value={editForm.data}
            onChange={e => setEditForm(f => ({ ...f, data: e.target.value }))}
          />
          <Input
            label="Observações"
            placeholder="Observações do agendamento..."
            value={editForm.observacoes}
            onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Audit Timeline */}
      {auditoriaItem && (
        <AuditoriaTimeline
          tabela={auditoriaItem.tabela}
          registroId={auditoriaItem.registroId}
          titulo={auditoriaItem.label}
          onClose={() => setAuditoriaItem(null)}
        />
      )}

      {/* Status Change Modal */}
      <Modal isOpen={!!statusItem} onClose={() => setStatusItem(null)} title="Alterar Status" size="sm">
        <div className="space-y-4">
          {statusItem && (
            <p className="text-sm text-slate-400">
              {statusItem.clienteNome || '—'} · {formatTime(statusItem.horarioIni)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 0, label: 'Aguardando', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
              { value: 2, label: 'Efetuado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
              { value: 3, label: 'Não efetuado', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
              { value: 4, label: 'Reagendado', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setNewStatus(opt.value)}
                className={clsx(
                  'px-3 py-2.5 rounded-lg text-sm font-medium border transition-all',
                  newStatus === opt.value
                    ? opt.color + ' ring-2 ring-offset-2 ring-offset-slate-900 ring-current'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setStatusItem(null)}>Cancelar</Button>
            <Button onClick={saveStatus} disabled={savingStatus}>
              {savingStatus ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
