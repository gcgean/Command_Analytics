import { useState, useEffect } from 'react'
import { Settings, Plus, Clock, User, Calendar, X, CheckCircle, Trash2, Ban, Pencil, CheckSquare } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { api } from '../../services/api'
import clsx from 'clsx'

const DIAS_SEMANA = [
  { val: 0, label: 'Dom' },
  { val: 1, label: 'Seg' },
  { val: 2, label: 'Ter' },
  { val: 3, label: 'Qua' },
  { val: 4, label: 'Qui' },
  { val: 5, label: 'Sex' },
  { val: 6, label: 'Sáb' },
]

// Status para agendamentos programados
const STATUS_OPTS = [
  { value: 1, label: 'Aguardando',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 2, label: 'Efetuado',     color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 3, label: 'Não efetuado', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 4, label: 'Reagendado',   color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
] as const

const STATUS_COLOR: Record<number, string> = {
  1: 'bg-amber-500/20 text-amber-400',
  2: 'bg-emerald-500/20 text-emerald-400',
  3: 'bg-red-500/20 text-red-400',
  4: 'bg-purple-500/20 text-purple-400',
}
const STATUS_LABEL: Record<number, string> = {
  1: 'Aguardando', 2: 'Efetuado', 3: 'Não efetuado', 4: 'Reagendado',
}

// Use local date (not UTC) to avoid timezone-day-off bugs
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(val: any) {
  if (!val) return ''
  const s = val instanceof Date
    ? `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}-${String(val.getUTCDate()).padStart(2, '0')}`
    : String(val).substring(0, 10)
  if (!s || s.length < 10) return ''
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

function addMinutes(hhmm: string, mins: number): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface DispItem {
  id: number
  tecnicoId: number
  tecnicoNome: string
  diasSemana: string
  horaInicio: string
  horaFim: string
  intervaloMin: number
  ativo: number
  dataInicio?: string | null
  dataFim?: string | null
  intervaloIni?: string | null
  intervaloFim?: string | null
}

interface SlotResult {
  tecnicoId: number
  tecnicoNome: string
  slotsDisponiveis: string[]
  slotsOcupados: string[]
}

interface AgProg {
  id: number
  tecnicoId: number
  tecnicoNome: string
  clienteId: number | null
  clienteNome: string | null
  data: any
  horaInicio: string
  duracao: number
  descricao: string | null
  status: number
}

interface Tecnico { id: number; nome: string }

interface Bloqueio {
  id: number
  tecnicoId: number | null
  tecnicoNome: string | null
  dataIni: string
  horaIni: string
  dataFim: string
  horaFim: string
  motivo: string | null
}

export function AgendamentoProgramado() {
  const [activeTab, setActiveTab] = useState<'slots' | 'lista'>('slots')

  const [disponibilidades, setDisponibilidades] = useState<DispItem[]>([])
  const [allTecnicos, setAllTecnicos] = useState<Tecnico[]>([])
  const [agendamentos, setAgendamentos] = useState<AgProg[]>([])
  const [slotResults, setSlotResults] = useState<SlotResult[]>([])

  const [selectedTecnico, setSelectedTecnico] = useState('')
  const [selectedDate, setSelectedDate] = useState(today())
  const [listaStatus, setListaStatus] = useState('1')

  const [loadingSlots, setLoadingSlots] = useState(false)
  const [loadingLista, setLoadingLista] = useState(false)

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [editingTecnico, setEditingTecnico] = useState<number | null>(null)
  const [configForm, setConfigForm] = useState({
    tecnicoId: '',
    diasSemana: [1, 2, 3, 4, 5] as number[],
    horaInicio: '08:00',
    horaFim: '18:00',
    intervaloMin: '60',
    dataInicio: '',
    dataFim: '',
    usarIntervalo: false,
    intervaloIni: '12:00',
    intervaloFim: '13:00',
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // Bloqueio modal
  const [showBloqueioModal, setShowBloqueioModal] = useState(false)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [bloqueioForm, setBloqueioForm] = useState({
    tecnicoId: '',
    dataIni: today(),
    horaIni: '08:00',
    dataFim: today(),
    horaFim: '18:00',
    motivo: '',
  })
  const [savingBloqueio, setSavingBloqueio] = useState(false)

  // Booking modal
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookSlot, setBookSlot] = useState<{ tecnicoId: number; tecnicoNome: string; hora: string } | null>(null)
  const [bookForm, setBookForm] = useState({ clienteId: '', descricao: '', duracao: '60' })
  const [submitting, setSubmitting] = useState(false)
  const [bookError, setBookError] = useState('')

  // Edit agendamento modal
  const [editItem, setEditItem] = useState<AgProg | null>(null)
  const [editForm, setEditForm] = useState({
    tecnicoId: '',
    clienteId: '',
    data: '',
    horaInicio: '',
    duracao: '60',
    descricao: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // Status change modal
  const [statusItem, setStatusItem] = useState<AgProg | null>(null)
  const [newStatus, setNewStatus] = useState(1)
  const [savingStatus, setSavingStatus] = useState(false)

  // ── Load initial data ──────────────────────────────────────────
  useEffect(() => {
    api.getDisponibilidades().then((d: any) => setDisponibilidades(d)).catch(() => {})
    api.getBloqueios().then((b: any) => setBloqueios(b)).catch(() => {})
    api.getUsuarios().then((u: any) => {
      setAllTecnicos(u.map((x: any) => ({ id: x.id, nome: x.nome || x.nomeUsu || `#${x.id}` })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab === 'lista') fetchAgendamentos()
  }, [activeTab, listaStatus])

  // ── Fetch slots ────────────────────────────────────────────────
  function fetchSlots() {
    setLoadingSlots(true)
    setSlotResults([])
    const params: Record<string, string> = { data: selectedDate }
    if (selectedTecnico) params.tecnicoId = selectedTecnico
    api.getSlots(params)
      .then((r: any) => setSlotResults(r))
      .catch(() => {})
      .finally(() => setLoadingSlots(false))
  }

  // ── Fetch agendamentos ─────────────────────────────────────────
  function fetchAgendamentos() {
    setLoadingLista(true)
    const params: Record<string, string> = {}
    if (listaStatus) params.status = listaStatus
    if (selectedTecnico) params.tecnicoId = selectedTecnico
    api.getAgendamentosProg(params)
      .then((r: any) => setAgendamentos(r))
      .catch(() => {})
      .finally(() => setLoadingLista(false))
  }

  // ── Config modal ───────────────────────────────────────────────
  function openEditConfig(d: DispItem) {
    setEditingTecnico(d.tecnicoId)
    setConfigForm({
      tecnicoId: String(d.tecnicoId),
      diasSemana: d.diasSemana.split(',').map(Number),
      horaInicio: d.horaInicio,
      horaFim: d.horaFim,
      intervaloMin: String(d.intervaloMin),
      dataInicio: d.dataInicio ? String(d.dataInicio).substring(0, 10) : '',
      dataFim: d.dataFim ? String(d.dataFim).substring(0, 10) : '',
      usarIntervalo: !!(d.intervaloIni && d.intervaloFim),
      intervaloIni: d.intervaloIni ? String(d.intervaloIni).substring(0, 5) : '12:00',
      intervaloFim: d.intervaloFim ? String(d.intervaloFim).substring(0, 5) : '13:00',
    })
    setShowConfigModal(true)
  }

  function toggleDia(val: number) {
    setConfigForm(f => ({
      ...f,
      diasSemana: f.diasSemana.includes(val)
        ? f.diasSemana.filter(d => d !== val)
        : [...f.diasSemana, val].sort(),
    }))
  }

  async function saveConfig() {
    if (!configForm.tecnicoId || !configForm.diasSemana.length) return
    setSavingConfig(true)
    try {
      await api.saveDisponibilidade({
        tecnicoId: Number(configForm.tecnicoId),
        diasSemana: configForm.diasSemana.join(','),
        horaInicio: configForm.horaInicio,
        horaFim: configForm.horaFim,
        intervaloMin: Number(configForm.intervaloMin),
        dataInicio: configForm.dataInicio || null,
        dataFim: configForm.dataFim || null,
        intervaloIni: configForm.usarIntervalo ? configForm.intervaloIni : null,
        intervaloFim: configForm.usarIntervalo ? configForm.intervaloFim : null,
      })
      const updated: any = await api.getDisponibilidades()
      setDisponibilidades(updated)
      setShowConfigModal(false)
    } catch { } finally {
      setSavingConfig(false)
    }
  }

  async function deleteConfig(tecnicoId: number) {
    if (!confirm('Remover disponibilidade deste técnico?')) return
    await api.deleteDisponibilidade(tecnicoId).catch(() => {})
    setDisponibilidades(d => d.filter(x => x.tecnicoId !== tecnicoId))
  }

  // ── Booking ────────────────────────────────────────────────────
  function openBook(tecnicoId: number, tecnicoNome: string, hora: string) {
    setBookSlot({ tecnicoId, tecnicoNome, hora })
    setBookForm({ clienteId: '', descricao: '', duracao: '60' })
    setBookError('')
    setShowBookModal(true)
  }

  async function saveBook() {
    if (!bookSlot || !bookForm.clienteId) { setBookError('Selecione um cliente.'); return }
    setSubmitting(true)
    setBookError('')
    try {
      await api.createAgendamentoProg({
        tecnicoId: bookSlot.tecnicoId,
        clienteId: Number(bookForm.clienteId),
        data: selectedDate,
        horaInicio: bookSlot.hora,
        duracao: Number(bookForm.duracao),
        descricao: bookForm.descricao || undefined,
      })
      setShowBookModal(false)
      fetchSlots()
      if (activeTab === 'lista') fetchAgendamentos()
    } catch (e: any) {
      setBookError(e.message || 'Erro ao salvar agendamento.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Edit agendamento ───────────────────────────────────────────
  function openEdit(ag: AgProg) {
    setEditItem(ag)
    const rawData = ag.data instanceof Date
      ? `${ag.data.getUTCFullYear()}-${String(ag.data.getUTCMonth()+1).padStart(2,'0')}-${String(ag.data.getUTCDate()).padStart(2,'0')}`
      : String(ag.data ?? '').substring(0, 10)
    setEditForm({
      tecnicoId: String(ag.tecnicoId),
      clienteId: ag.clienteId ? String(ag.clienteId) : '',
      data: rawData,
      horaInicio: ag.horaInicio,
      duracao: String(ag.duracao),
      descricao: ag.descricao ?? '',
    })
  }

  async function saveEdit() {
    if (!editItem) return
    setSavingEdit(true)
    try {
      await api.updateAgendamentoProg(editItem.id, {
        tecnicoId: Number(editForm.tecnicoId),
        clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
        data: editForm.data,
        horaInicio: editForm.horaInicio,
        duracao: Number(editForm.duracao),
        descricao: editForm.descricao || null,
      })
      setEditItem(null)
      fetchAgendamentos()
    } catch { } finally {
      setSavingEdit(false)
    }
  }

  // ── Status change ──────────────────────────────────────────────
  function openStatusChange(ag: AgProg) {
    setStatusItem(ag)
    setNewStatus(ag.status)
  }

  async function saveStatus() {
    if (!statusItem) return
    setSavingStatus(true)
    try {
      await api.updateAgendamentoProgStatus(statusItem.id, newStatus)
      setStatusItem(null)
      fetchAgendamentos()
    } catch { } finally {
      setSavingStatus(false)
    }
  }

  // ── Bloqueio ───────────────────────────────────────────────────
  async function saveBloqueio() {
    setSavingBloqueio(true)
    try {
      await api.createBloqueio({
        tecnicoId: bloqueioForm.tecnicoId ? Number(bloqueioForm.tecnicoId) : null,
        dataIni: bloqueioForm.dataIni,
        horaIni: bloqueioForm.horaIni,
        dataFim: bloqueioForm.dataFim,
        horaFim: bloqueioForm.horaFim,
        motivo: bloqueioForm.motivo || undefined,
      })
      const updated: any = await api.getBloqueios()
      setBloqueios(updated)
      setBloqueioForm({ tecnicoId: '', dataIni: today(), horaIni: '08:00', dataFim: today(), horaFim: '18:00', motivo: '' })
      setShowBloqueioModal(false)
      // Refresh slots after blocking period
      if (slotResults.length > 0) fetchSlots()
    } catch { } finally {
      setSavingBloqueio(false)
    }
  }

  async function removeBloqueio(id: number) {
    if (!confirm('Remover este bloqueio?')) return
    await api.deleteBloqueio(id).catch(() => {})
    setBloqueios(b => b.filter(x => x.id !== id))
    if (slotResults.length > 0) fetchSlots()
  }

  const configuredTecnicoIds = new Set(disponibilidades.map(d => d.tecnicoId))
  const availableTecnicos = allTecnicos.filter(t => !configuredTecnicoIds.has(t.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Gerencie disponibilidades e agende horários com os técnicos</p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Ban className="w-4 h-4" />} onClick={() => setShowBloqueioModal(true)}>
            Bloqueios
          </Button>
          <Button variant="secondary" icon={<Settings className="w-4 h-4" />} onClick={() => setShowConfigModal(true)}>
            Disponibilidades
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {(['slots', 'lista'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {tab === 'slots' ? 'Horários Disponíveis' : 'Lista de Agendamentos'}
          </button>
        ))}
      </div>

      {/* ── Tab: Horários Disponíveis ── */}
      {activeTab === 'slots' && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[180px]">
                <Select
                  label="Técnico"
                  options={[
                    { value: '', label: 'Todos os técnicos com agenda' },
                    ...disponibilidades.map(d => ({ value: String(d.tecnicoId), label: d.tecnicoNome }))
                  ]}
                  value={selectedTecnico}
                  onChange={e => setSelectedTecnico(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Input label="Data" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <Button onClick={fetchSlots} icon={<Calendar className="w-4 h-4" />}>Buscar Horários</Button>
            </div>
          </Card>

          {loadingSlots && <div className="text-center py-10 text-slate-400 text-sm">Buscando horários...</div>}

          {!loadingSlots && slotResults.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecione um técnico e data e clique em Buscar Horários.</p>
              {disponibilidades.length === 0 && (
                <p className="text-xs mt-2 text-amber-400">Nenhuma disponibilidade configurada ainda.</p>
              )}
            </div>
          )}

          {!loadingSlots && slotResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {slotResults.map(tech => (
                <Card key={tech.tecnicoId}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{tech.tecnicoNome}</p>
                      <p className="text-xs text-slate-500">{fmtDate(selectedDate)}</p>
                    </div>
                  </div>

                  {tech.slotsDisponiveis.length === 0 && tech.slotsOcupados.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">Sem agenda neste dia da semana.</p>
                  )}
                  {tech.slotsDisponiveis.length === 0 && tech.slotsOcupados.length > 0 && (
                    <p className="text-xs text-amber-400 text-center py-2">Todos os horários estão ocupados.</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {tech.slotsDisponiveis.map(hora => (
                      <button
                        key={hora}
                        onClick={() => openBook(tech.tecnicoId, tech.tecnicoNome, hora)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                      >
                        {hora}
                      </button>
                    ))}
                    {tech.slotsOcupados.map(hora => (
                      <span key={hora} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-500 text-sm font-medium cursor-not-allowed line-through" title="Horário ocupado">
                        {hora}
                      </span>
                    ))}
                  </div>

                  {tech.slotsDisponiveis.length > 0 && (
                    <p className="text-xs text-slate-500 mt-3">
                      {tech.slotsDisponiveis.length} horário{tech.slotsDisponiveis.length > 1 ? 's' : ''} disponível{tech.slotsDisponiveis.length > 1 ? 'is' : ''}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Lista de Agendamentos ── */}
      {activeTab === 'lista' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-48">
              <Select
                label="Status"
                options={[
                  { value: '', label: 'Todos' },
                  { value: '1', label: 'Aguardando' },
                  { value: '2', label: 'Efetuado' },
                  { value: '3', label: 'Não efetuado' },
                  { value: '4', label: 'Reagendado' },
                ]}
                value={listaStatus}
                onChange={e => setListaStatus(e.target.value)}
              />
            </div>
            <div className="w-48">
              <Select
                label="Técnico"
                options={[
                  { value: '', label: 'Todos' },
                  ...disponibilidades.map(d => ({ value: String(d.tecnicoId), label: d.tecnicoNome }))
                ]}
                value={selectedTecnico}
                onChange={e => setSelectedTecnico(e.target.value)}
              />
            </div>
            <Button onClick={fetchAgendamentos} variant="secondary">Atualizar</Button>
          </div>

          {loadingLista ? (
            <div className="text-center py-10 text-slate-400 text-sm">Carregando...</div>
          ) : agendamentos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agendamentos.map(ag => (
                <Card key={ag.id} className="py-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Técnico</p>
                        <p className="text-sm font-medium text-slate-200">{ag.tecnicoNome}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Cliente</p>
                        <p className="text-sm font-medium text-slate-200">{ag.clienteNome || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Data / Hora</p>
                        <p className="text-sm font-medium text-slate-200">
                          {fmtDate(ag.data)} · {ag.horaInicio} – {addMinutes(ag.horaInicio, ag.duracao)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Duração</p>
                        <p className="text-sm font-medium text-slate-200">{ag.duracao} min</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={clsx('text-xs px-2 py-1 rounded-full', STATUS_COLOR[ag.status] ?? 'bg-slate-500/20 text-slate-400')}>
                        {STATUS_LABEL[ag.status] ?? '—'}
                      </span>
                      {/* Alterar Status */}
                      <button
                        onClick={() => openStatusChange(ag)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title="Alterar Status"
                      >
                        <CheckSquare className="w-4 h-4" />
                      </button>
                      {/* Editar */}
                      <button
                        onClick={() => openEdit(ag)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Alterar Agendamento"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {/* Cancelar */}
                      <button
                        onClick={async () => {
                          if (!confirm('Cancelar este agendamento?')) return
                          await api.cancelAgendamentoProg(ag.id).catch(() => {})
                          fetchAgendamentos()
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {ag.descricao && <p className="text-xs text-slate-500 mt-2">{ag.descricao}</p>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Bloqueios ── */}
      <Modal isOpen={showBloqueioModal} onClose={() => setShowBloqueioModal(false)} title="Bloqueios de Agendamento" size="lg">
        <div className="space-y-6">
          <p className="text-xs text-slate-400">Bloqueios impedem novos agendamentos programados nos horários definidos. Não afetam agendamentos já existentes.</p>

          {bloqueios.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Bloqueios Ativos</p>
              <div className="space-y-2">
                {bloqueios.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {b.tecnicoNome ?? 'Todos os técnicos'}
                        <span className="ml-2 text-xs text-slate-400">
                          {fmtDate(b.dataIni)} {b.horaIni} → {fmtDate(b.dataFim)} {b.horaFim}
                        </span>
                      </p>
                      {b.motivo && <p className="text-xs text-slate-500 mt-0.5">{b.motivo}</p>}
                    </div>
                    <button onClick={() => removeBloqueio(b.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Novo Bloqueio</p>
            <div className="space-y-4">
              <Select
                label="Técnico (em branco = bloqueia todos)"
                options={[
                  { value: '', label: 'Todos os técnicos' },
                  ...allTecnicos.map(t => ({ value: String(t.id), label: t.nome }))
                ]}
                value={bloqueioForm.tecnicoId}
                onChange={e => setBloqueioForm(f => ({ ...f, tecnicoId: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Data início" type="date" value={bloqueioForm.dataIni} onChange={e => setBloqueioForm(f => ({ ...f, dataIni: e.target.value }))} />
                <Input label="Hora início" type="time" value={bloqueioForm.horaIni} onChange={e => setBloqueioForm(f => ({ ...f, horaIni: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Data fim" type="date" value={bloqueioForm.dataFim} onChange={e => setBloqueioForm(f => ({ ...f, dataFim: e.target.value }))} />
                <Input label="Hora fim" type="time" value={bloqueioForm.horaFim} onChange={e => setBloqueioForm(f => ({ ...f, horaFim: e.target.value }))} />
              </div>
              <Input
                label="Motivo (opcional)"
                placeholder="Ex: Feriado, Reunião interna..."
                value={bloqueioForm.motivo}
                onChange={e => setBloqueioForm(f => ({ ...f, motivo: e.target.value }))}
              />
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setShowBloqueioModal(false)}>Fechar</Button>
                <Button onClick={saveBloqueio} disabled={savingBloqueio || !bloqueioForm.dataIni || !bloqueioForm.dataFim}>
                  {savingBloqueio ? 'Salvando...' : 'Criar Bloqueio'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Gerenciar Disponibilidades ── */}
      <Modal isOpen={showConfigModal} onClose={() => setShowConfigModal(false)} title="Disponibilidades dos Técnicos" size="lg">
        <div className="space-y-6">
          {disponibilidades.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Técnicos Configurados</p>
              <div className="space-y-2">
                {disponibilidades.map(d => (
                  <div key={d.tecnicoId} className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{d.tecnicoNome}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {d.diasSemana.split(',').map(n => DIAS_SEMANA.find(x => x.val === Number(n))?.label).join(', ')}
                        {' · '}{d.horaInicio} – {d.horaFim}{' · '}a cada {d.intervaloMin} min
                        {d.intervaloIni && d.intervaloFim && ` · almoço ${d.intervaloIni}–${d.intervaloFim}`}
                      </p>
                      {(d.dataInicio || d.dataFim) && (
                        <p className="text-xs text-amber-500/80 mt-0.5">
                          Válido: {d.dataInicio ? String(d.dataInicio).substring(0, 10) : '...'} → {d.dataFim ? String(d.dataFim).substring(0, 10) : 'sem limite'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditConfig(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors text-xs">
                        Editar
                      </button>
                      <button onClick={() => deleteConfig(d.tecnicoId)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {editingTecnico ? 'Editar Disponibilidade' : 'Adicionar Técnico'}
            </p>
            <div className="space-y-4">
              <Select
                label="Técnico"
                options={
                  editingTecnico
                    ? disponibilidades.filter(d => d.tecnicoId === editingTecnico).map(d => ({ value: String(d.tecnicoId), label: d.tecnicoNome }))
                    : availableTecnicos.map(t => ({ value: String(t.id), label: t.nome }))
                }
                placeholder="Selecione o técnico"
                value={configForm.tecnicoId}
                onChange={e => setConfigForm(f => ({ ...f, tecnicoId: e.target.value }))}
              />

              <div>
                <p className="text-sm font-medium text-slate-300 mb-2">Dias da semana</p>
                <div className="flex gap-2 flex-wrap">
                  {DIAS_SEMANA.map(dia => (
                    <button
                      key={dia.val}
                      onClick={() => toggleDia(dia.val)}
                      className={clsx(
                        'w-10 h-10 rounded-lg text-xs font-semibold transition-colors border',
                        configForm.diasSemana.includes(dia.val)
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                      )}
                    >
                      {dia.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Input label="Hora início" type="time" value={configForm.horaInicio} onChange={e => setConfigForm(f => ({ ...f, horaInicio: e.target.value }))} />
                <Input label="Hora fim" type="time" value={configForm.horaFim} onChange={e => setConfigForm(f => ({ ...f, horaFim: e.target.value }))} />
                <Select
                  label="Intervalo de slot"
                  options={[
                    { value: '30', label: '30 min' },
                    { value: '60', label: '60 min' },
                    { value: '90', label: '90 min' },
                    { value: '120', label: '2 horas' },
                  ]}
                  value={configForm.intervaloMin}
                  onChange={e => setConfigForm(f => ({ ...f, intervaloMin: e.target.value }))}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-300 mb-2">
                  Período de validade <span className="text-slate-500 text-xs font-normal">(opcional — deixe em branco para sempre)</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Data início" type="date" value={configForm.dataInicio} onChange={e => setConfigForm(f => ({ ...f, dataInicio: e.target.value }))} />
                  <Input label="Data fim" type="date" value={configForm.dataFim} onChange={e => setConfigForm(f => ({ ...f, dataFim: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={configForm.usarIntervalo}
                    onChange={e => setConfigForm(f => ({ ...f, usarIntervalo: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-300">Bloquear intervalo de almoço</span>
                </label>
                {configForm.usarIntervalo && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <Input label="Início do almoço" type="time" value={configForm.intervaloIni} onChange={e => setConfigForm(f => ({ ...f, intervaloIni: e.target.value }))} />
                    <Input label="Fim do almoço" type="time" value={configForm.intervaloFim} onChange={e => setConfigForm(f => ({ ...f, intervaloFim: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => { setShowConfigModal(false); setEditingTecnico(null) }}>Fechar</Button>
                <Button onClick={saveConfig} disabled={!configForm.tecnicoId || !configForm.diasSemana.length}>
                  {savingConfig ? 'Salvando...' : 'Salvar Disponibilidade'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Novo Agendamento (booking slot) ── */}
      <Modal
        isOpen={showBookModal}
        onClose={() => setShowBookModal(false)}
        title={bookSlot ? `Agendar — ${bookSlot.tecnicoNome} às ${bookSlot.hora}` : 'Novo Agendamento'}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <p className="text-sm font-medium text-slate-200">
              {bookSlot?.tecnicoNome} — {bookSlot?.hora} em {fmtDate(selectedDate)}
            </p>
          </div>

          <ClienteSearch
            label="Cliente *"
            value={bookForm.clienteId}
            onChange={id => setBookForm(f => ({ ...f, clienteId: id }))}
            required
          />

          <Select
            label="Duração"
            options={[
              { value: '30', label: '30 minutos' },
              { value: '60', label: '1 hora' },
              { value: '90', label: '1h 30min' },
              { value: '120', label: '2 horas' },
            ]}
            value={bookForm.duracao}
            onChange={e => setBookForm(f => ({ ...f, duracao: e.target.value }))}
          />

          <Input
            label="Descrição (opcional)"
            placeholder="Descreva o objetivo do agendamento..."
            value={bookForm.descricao}
            onChange={e => setBookForm(f => ({ ...f, descricao: e.target.value }))}
          />

          {bookError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {bookError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowBookModal(false)}>Cancelar</Button>
            <Button onClick={saveBook} disabled={submitting || !bookForm.clienteId}>
              {submitting ? 'Salvando...' : 'Confirmar Agendamento'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Alterar Agendamento ── */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Alterar Agendamento" size="md">
        <div className="space-y-4">
          <Select
            label="Técnico"
            options={allTecnicos.map(t => ({ value: String(t.id), label: t.nome }))}
            placeholder="Selecione o técnico"
            value={editForm.tecnicoId}
            onChange={e => setEditForm(f => ({ ...f, tecnicoId: e.target.value }))}
          />
          <ClienteSearch
            label="Cliente"
            value={editForm.clienteId}
            onChange={id => setEditForm(f => ({ ...f, clienteId: id }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data" type="date" value={editForm.data} onChange={e => setEditForm(f => ({ ...f, data: e.target.value }))} />
            <Input label="Hora início" type="time" value={editForm.horaInicio} onChange={e => setEditForm(f => ({ ...f, horaInicio: e.target.value }))} />
          </div>
          <Select
            label="Duração"
            options={[
              { value: '30', label: '30 minutos' },
              { value: '60', label: '1 hora' },
              { value: '90', label: '1h 30min' },
              { value: '120', label: '2 horas' },
            ]}
            value={editForm.duracao}
            onChange={e => setEditForm(f => ({ ...f, duracao: e.target.value }))}
          />
          <Input
            label="Descrição"
            placeholder="Descrição..."
            value={editForm.descricao}
            onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Alterar Status ── */}
      <Modal isOpen={!!statusItem} onClose={() => setStatusItem(null)} title="Alterar Status" size="sm">
        <div className="space-y-4">
          {statusItem && (
            <p className="text-sm text-slate-400">
              {statusItem.clienteNome || statusItem.tecnicoNome} · {statusItem.horaInicio} em {fmtDate(statusItem.data)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTS.map(opt => (
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
