import { useState, useEffect } from 'react'
import { Settings, Plus, Clock, User, Calendar, X, CheckCircle, Trash2, Ban, Pencil, CheckSquare } from 'lucide-react'

import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Input, Textarea } from '../../components/ui/Input'
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

// Use local date (not UTC) to avoid timezone bugs
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(val: any) {
  if (!val) return ''
  
  // Se já estiver no formato BR, apenas retorna
  if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val

  const s = val instanceof Date
    ? `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}-${String(val.getUTCDate()).padStart(2, '0')}`
    : String(val).substring(0, 10)
  
  if (!s || s.length < 10 || s === 'null' || s === 'undefined') return ''
  
  // Se for ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }

  try {
    return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return s
  }
}

function formatTime(t: any): string {
  if (!t) return ''
  
  if (typeof t === 'string') {
    if (t.startsWith('1970-') && (!t.includes('T') || t.includes('T00:00:00'))) return ''
    if (t.includes('T')) {
      const match = t.match(/T(\d{2}:\d{2})/)
      if (match) return match[1]
    }
    if (t.includes(':')) return t.substring(0, 5)
  }
  
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function addMinutes(hhmm: string, mins: number): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function formatDurationLabel(duracaoMin: number): string {
  if (!Number.isFinite(duracaoMin) || duracaoMin <= 0) return '-'
  if (duracaoMin < 60) return `${duracaoMin} min`
  const horas = Math.floor(duracaoMin / 60)
  const resto = duracaoMin % 60
  if (!resto) return `${horas}h`
  return `${horas}h ${resto}min`
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
  data: string
  slotsDisponiveis: string[]
  slotsOcupados: string[]
}

interface AgProg {
  id: number
  tecnicoId: number
  tecnicoNome: string
  clienteId: number | null
  clienteNome: string | null
  procedimentoId?: number | null
  procedimentoNome?: string | null
  data: any
  horaInicio: string
  duracao: number
  descricao: string | null
  status: number
}

interface Tecnico { id: number; nome: string }
interface ProcedimentoOption { id: number; nome: string; duracaoMin: number; ativo: boolean }

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

// Helpers for dd/mm/yyyy
function toBRDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fromBRDate(br: string) {
  if (!br) return ''
  const [d, m, y] = br.split('/')
  if (!d || !m || !y) return ''
  return `${y}-${m}-${d}`
}
function maskDate(val: string) {
  const v = val.replace(/\D/g, '').slice(0, 8)
  if (v.length <= 2) return v
  if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`
  return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`
}

export function AgendamentoProgramado() {
  const [activeTab, setActiveTab] = useState<'slots' | 'lista'>('slots')

  const [disponibilidades, setDisponibilidades] = useState<DispItem[]>([])
  const [allTecnicos, setAllTecnicos] = useState<Tecnico[]>([])
  const [procedimentos, setProcedimentos] = useState<ProcedimentoOption[]>([])
  const [agendamentos, setAgendamentos] = useState<AgProg[]>([])
  const [slotResults, setSlotResults] = useState<SlotResult[]>([])

  const [selectedTecnico, setSelectedTecnico] = useState('')
  const [selectedProcedimento, setSelectedProcedimento] = useState('')
  const [selectedDate, setSelectedDate] = useState(toBRDate(today()))
  const [selectedDateEnd, setSelectedDateEnd] = useState(toBRDate(today()))
  const [listaStatus, setListaStatus] = useState('1')
  const [listaDataInicio, setListaDataInicio] = useState(toBRDate(today()))
  const [listaDataFim, setListaDataFim] = useState(toBRDate(today()))

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
    dataIni: toBRDate(today()),
    horaIni: '08:00',
    dataFim: toBRDate(today()),
    horaFim: '18:00',
    motivo: '',
  })
  const [savingBloqueio, setSavingBloqueio] = useState(false)

  // Booking modal — suporta múltiplos slots do mesmo técnico
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookTecnico, setBookTecnico] = useState<{ tecnicoId: number; tecnicoNome: string; data: string } | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [bookForm, setBookForm] = useState({ clienteId: '', procedimentoId: '', descricao: '', duracao: '60' })
  const [submitting, setSubmitting] = useState(false)
  const [bookError, setBookError] = useState('')



  // Edit agendamento modal
  const [editItem, setEditItem] = useState<AgProg | null>(null)
  const [editForm, setEditForm] = useState({
    tecnicoId: '',
    clienteId: '',
    procedimentoId: '',
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
    api.getProcedimentos({ ativo: '1' }).then((p: any) => setProcedimentos(Array.isArray(p) ? p : [])).catch(() => {})
    api.getUsuarios().then((u: any) => {
      setAllTecnicos(u.map((x: any) => ({ id: x.id, nome: x.nome || x.nomeUsu || `#${x.id}` })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab === 'lista') fetchAgendamentos()
  }, [activeTab, listaStatus, listaDataInicio, listaDataFim, selectedTecnico])

  useEffect(() => {
    if (activeTab !== 'slots') return
    if (!selectedProcedimento) return
    const dIni = fromBRDate(selectedDate)
    const dFim = fromBRDate(selectedDateEnd)
    if (!dIni || !dFim) return
    fetchSlots()
  }, [selectedProcedimento]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bookForm.procedimentoId) {
      const p = findProcedimentoById(bookForm.procedimentoId)
      if (p) {
        setBookForm((prev) => ({ ...prev, duracao: String(p.duracaoMin) }))
      }
    }
  }, [procedimentos]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editForm.procedimentoId) {
      const p = findProcedimentoById(editForm.procedimentoId)
      if (p) {
        setEditForm((prev) => ({ ...prev, duracao: String(p.duracaoMin) }))
      }
    }
  }, [procedimentos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch slots ────────────────────────────────────────────────
  function fetchSlots() {
    const dIni = fromBRDate(selectedDate)
    const dFim = fromBRDate(selectedDateEnd)
    if (!dIni || !dFim) return
    if (!selectedProcedimento) return

    setLoadingSlots(true)
    setSlotResults([])
    const params: Record<string, string> = { 
      dataInicio: dIni,
      dataFim: dFim,
      procedimentoId: selectedProcedimento,
    }
    if (selectedTecnico) params.tecnicoId = selectedTecnico
    api.getSlots(params)
      .then((r: any) => setSlotResults(r))
      .catch(() => {})
      .finally(() => setLoadingSlots(false))
  }

  // ── Fetch agendamentos ─────────────────────────────────────────
  function fetchAgendamentos() {
    const dIni = fromBRDate(listaDataInicio)
    const dFim = fromBRDate(listaDataFim)
    if (!dIni || !dFim) return

    setLoadingLista(true)
    const params: Record<string, string> = {}
    if (listaStatus) params.status = listaStatus
    if (selectedTecnico) params.tecnicoId = selectedTecnico
    if (dIni) params.dataInicio = dIni
    if (dFim) params.dataFim = dFim

    api.getAgendamentosProg(params)
      .then((r: any) => setAgendamentos(r))
      .catch(() => {})
      .finally(() => setLoadingLista(false))
  }

  function findProcedimentoById(idRaw: string | number | null | undefined) {
    const id = Number(idRaw ?? 0)
    if (!Number.isFinite(id) || id <= 0) return null
    return procedimentos.find((p) => p.id === id) ?? null
  }

  function onChangeProcedimentoBook(procedimentoId: string) {
    const procedimento = findProcedimentoById(procedimentoId)
    setBookForm((prev) => ({
      ...prev,
      procedimentoId,
      duracao: String(procedimento?.duracaoMin ?? (prev.duracao || '60')),
    }))
  }

  function onChangeProcedimentoEdit(procedimentoId: string) {
    const procedimento = findProcedimentoById(procedimentoId)
    setEditForm((prev) => ({
      ...prev,
      procedimentoId,
      duracao: String(procedimento?.duracaoMin ?? (prev.duracao || '60')),
    }))
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
      dataInicio: d.dataInicio ? toBRDate(String(d.dataInicio).substring(0, 10)) : '',
      dataFim: d.dataFim ? toBRDate(String(d.dataFim).substring(0, 10)) : '',
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
        dataInicio: fromBRDate(configForm.dataInicio) || null,
        dataFim: fromBRDate(configForm.dataFim) || null,
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
  function openBook(tecnicoId: number, tecnicoNome: string, data: string, hora: string) {
    setBookTecnico({ tecnicoId, tecnicoNome, data })
    setSelectedSlots([hora])
    setBookForm({ clienteId: '', procedimentoId: '', descricao: '', duracao: '60' })
    setBookError('')
    setShowBookModal(true)
  }

  function toggleSlotSelection(tech: SlotResult, hora: string) {
    // If no tecnico or different date selected yet, start fresh
    if (!bookTecnico || bookTecnico.tecnicoId !== tech.tecnicoId || bookTecnico.data !== tech.data) {
      setBookTecnico({ tecnicoId: tech.tecnicoId, tecnicoNome: tech.tecnicoNome, data: tech.data })
      setSelectedSlots([hora])
      setBookForm({ clienteId: '', procedimentoId: '', descricao: '', duracao: '60' })
      setBookError('')
      return
    }
    setSelectedSlots(prev =>
      prev.includes(hora) ? prev.filter(h => h !== hora) : [...prev, hora].sort()
    )
  }

  function openBookModal() {
    if (!bookTecnico || selectedSlots.length === 0) return
    setBookError('')
    setShowBookModal(true)
  }

  async function saveBook() {
    if (!bookTecnico || selectedSlots.length === 0 || !bookForm.clienteId) { setBookError('Selecione um cliente.'); return }
    if (!bookForm.procedimentoId) { setBookError('Selecione o procedimento.'); return }
    const procedimento = findProcedimentoById(bookForm.procedimentoId)
    if (!procedimento) { setBookError('Procedimento inválido.'); return }
    setSubmitting(true)
    setBookError('')
    try {
      for (const hora of selectedSlots) {
        await api.validarDuracaoAgendamentoProg({
          tecnicoId: bookTecnico.tecnicoId,
          data: bookTecnico.data,
          horaInicio: hora,
          duracao: Number(procedimento.duracaoMin),
        })
      }
      for (const hora of selectedSlots) {
        await api.createAgendamentoProg({
          tecnicoId: bookTecnico.tecnicoId,
          clienteId: Number(bookForm.clienteId),
          procedimentoId: Number(bookForm.procedimentoId),
          data: bookTecnico.data,
          horaInicio: hora,
          duracao: Number(procedimento.duracaoMin),
          descricao: bookForm.descricao || undefined,
        })
      }
      setShowBookModal(false)
      setSelectedSlots([])
      setBookTecnico(null)
      fetchSlots()
      fetchAgendamentos()
      setActiveTab('lista')
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
      procedimentoId: ag.procedimentoId ? String(ag.procedimentoId) : '',
      data: toBRDate(rawData),
      horaInicio: formatTime(ag.horaInicio),
      duracao: String(ag.duracao),
      descricao: ag.descricao ?? '',
    })
  }

  async function saveEdit() {
    if (!editItem) return
    const dVal = fromBRDate(editForm.data)
    if (!dVal) return
    if (!editForm.procedimentoId) {
      alert('Selecione o procedimento.')
      return
    }

    setSavingEdit(true)
    try {
      await api.updateAgendamentoProg(editItem.id, {
        tecnicoId: Number(editForm.tecnicoId),
        clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
        procedimentoId: editForm.procedimentoId ? Number(editForm.procedimentoId) : null,
        data: dVal,
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
    const dIni = fromBRDate(bloqueioForm.dataIni)
    const dFim = fromBRDate(bloqueioForm.dataFim)
    if (!dIni || !dFim) return

    setSavingBloqueio(true)
    try {
      await api.createBloqueio({
        tecnicoId: bloqueioForm.tecnicoId ? Number(bloqueioForm.tecnicoId) : null,
        dataIni: dIni,
        horaIni: bloqueioForm.horaIni,
        dataFim: dFim,
        horaFim: bloqueioForm.horaFim,
        motivo: bloqueioForm.motivo || undefined,
      })
      const updated: any = await api.getBloqueios()
      setBloqueios(updated)
      setBloqueioForm({ tecnicoId: '', dataIni: toBRDate(today()), horaIni: '08:00', dataFim: toBRDate(today()), horaFim: '18:00', motivo: '' })
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
        <p className="text-sm text-slate-600 dark:text-slate-400">Gerencie disponibilidades e agende horários com os técnicos</p>
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
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['slots', 'lista'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
              <div className="flex-1 min-w-[220px]">
                <Select
                  label="Procedimento *"
                  options={[
                    { value: '', label: 'Selecione o procedimento' },
                    ...procedimentos.map((p) => ({ value: String(p.id), label: `${p.nome} · ${formatDurationLabel(p.duracaoMin)}` })),
                  ]}
                  value={selectedProcedimento}
                  onChange={e => {
                    setSelectedProcedimento(e.target.value)
                    setSelectedSlots([])
                    setBookTecnico(null)
                    setSlotResults([])
                  }}
                />
              </div>
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
                <Input
                  label="Data Início"
                  placeholder="dd/mm/aaaa"
                  value={selectedDate}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => setSelectedDate(e.target.value)}
                  onBlur={e => setSelectedDate(maskDate(e.target.value))}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Input
                  label="Data Fim"
                  placeholder="dd/mm/aaaa"
                  value={selectedDateEnd}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => setSelectedDateEnd(e.target.value)}
                  onBlur={e => setSelectedDateEnd(maskDate(e.target.value))}
                />
              </div>
              <Button
                onClick={fetchSlots}
                icon={<Calendar className="w-4 h-4" />}
                disabled={!selectedProcedimento}
                title={!selectedProcedimento ? 'Selecione o procedimento para buscar horários.' : undefined}
              >
                Buscar Horários
              </Button>
            </div>
          </Card>

          {loadingSlots && <div className="text-center py-10 text-slate-400 text-sm">Buscando horários...</div>}

          {!loadingSlots && slotResults.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {selectedProcedimento
                  ? 'Selecione técnico/data e clique em Buscar Horários.'
                  : 'Selecione primeiro o procedimento para calcular horários disponíveis.'}
              </p>
              {disponibilidades.length === 0 && (
                <p className="text-xs mt-2 text-amber-400">Nenhuma disponibilidade configurada ainda.</p>
              )}
            </div>
          )}

          {!loadingSlots && slotResults.length > 0 && (
            <>
              {/* Barra de seleção múltipla */}
              {bookTecnico && selectedSlots.length > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-600/10 border border-blue-500/30">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 flex-wrap">
                      {selectedSlots.map(h => (
                        <span key={h} className="px-2 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-medium">{h}</span>
                      ))}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {selectedSlots.length} horário{selectedSlots.length > 1 ? 's' : ''} selecionado{selectedSlots.length > 1 ? 's' : ''} — {bookTecnico.tecnicoNome}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setSelectedSlots([]); setBookTecnico(null) }}>Limpar</Button>
                    <Button onClick={openBookModal} icon={<Plus className="w-4 h-4" />}>Agendar</Button>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {Object.entries(slotResults.reduce<Record<string, SlotResult[]>>((acc, r) => {
                  (acc[r.data] = acc[r.data] || []).push(r)
                  return acc
                }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([date, results]) => (
                  <div key={date} className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {fmtDate(date)}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {results.map(tech => {
                        const isActiveTecnico = bookTecnico?.tecnicoId === tech.tecnicoId
                        return (
                          <Card key={tech.tecnicoId + '-' + tech.data}>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tech.tecnicoNome}</p>
                                <p className="text-xs text-slate-500">{fmtDate(tech.data)}</p>
                              </div>
                              {isActiveTecnico && selectedSlots.length > 0 && (
                                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30">
                                  {selectedSlots.length} selecionado{selectedSlots.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>

                            {tech.slotsDisponiveis.length === 0 && tech.slotsOcupados.length === 0 && (
                              <p className="text-xs text-slate-500 text-center py-4">Sem agenda neste dia da semana.</p>
                            )}
                            {tech.slotsDisponiveis.length === 0 && tech.slotsOcupados.length > 0 && (
                              <p className="text-xs text-amber-400 text-center py-2">Todos os horários estão ocupados.</p>
                            )}

                            <div className="flex flex-wrap gap-2">
                              {tech.slotsDisponiveis.map(hora => {
                                const isSelected = isActiveTecnico && selectedSlots.includes(hora)
                                return (
                                  <button
                                    key={hora}
                                    onClick={() => toggleSlotSelection(tech, hora)}
                                    className={clsx(
                                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                                      isSelected
                                        ? 'bg-blue-500 text-white ring-2 ring-blue-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                    )}
                                  >
                                    {hora}
                                  </button>
                                )
                              })}
                              {tech.slotsOcupados.map(hora => (
                                <span key={hora} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 text-sm font-medium cursor-not-allowed line-through" title="Horário ocupado">
                                  {hora}
                                </span>
                              ))}
                            </div>

                            {tech.slotsDisponiveis.length > 0 && (
                              <p className="text-xs text-slate-500 mt-3">
                                Clique nos horários para selecionar · {tech.slotsDisponiveis.length} disponível{tech.slotsDisponiveis.length > 1 ? 'is' : ''}
                              </p>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Lista de Agendamentos ── */}
      {activeTab === 'lista' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-48">
              <Input
                label="Data Início"
                placeholder="dd/mm/aaaa"
                value={listaDataInicio}
                inputMode="numeric"
                maxLength={10}
                onChange={e => setListaDataInicio(e.target.value)}
                onBlur={e => setListaDataInicio(maskDate(e.target.value))}
              />
            </div>
            <div className="w-48">
              <Input
                label="Data Fim"
                placeholder="dd/mm/aaaa"
                value={listaDataFim}
                inputMode="numeric"
                maxLength={10}
                onChange={e => setListaDataFim(e.target.value)}
                onBlur={e => setListaDataFim(maskDate(e.target.value))}
              />
            </div>
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
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{ag.tecnicoNome}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Cliente</p>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{ag.clienteNome || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Data / Hora</p>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {String(ag.data).startsWith('1970') ? '—' : fmtDate(ag.data)} · {formatTime(ag.horaInicio)} – {addMinutes(formatTime(ag.horaInicio), ag.duracao)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Procedimento</p>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{ag.procedimentoNome || 'Não definido'}</p>
                        <p className="text-xs text-slate-500">{formatDurationLabel(ag.duracao)}</p>
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
          <p className="text-xs text-slate-600 dark:text-slate-400">Bloqueios impedem novos agendamentos programados nos horários definidos. Não afetam agendamentos já existentes.</p>

          {bloqueios.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">Bloqueios Ativos</p>
              <div className="space-y-2">
                {bloqueios.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {b.tecnicoNome ?? 'Todos os técnicos'}
                        <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
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
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">Novo Bloqueio</p>
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
                <Input
                  label="Data início"
                  placeholder="dd/mm/aaaa"
                  value={bloqueioForm.dataIni}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => setBloqueioForm(f => ({ ...f, dataIni: e.target.value }))}
                  onBlur={e => setBloqueioForm(f => ({ ...f, dataIni: maskDate(e.target.value) }))}
                />
                <Input label="Hora início" type="time" value={bloqueioForm.horaIni} onChange={e => setBloqueioForm(f => ({ ...f, horaIni: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Data fim"
                  placeholder="dd/mm/aaaa"
                  value={bloqueioForm.dataFim}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => setBloqueioForm(f => ({ ...f, dataFim: e.target.value }))}
                  onBlur={e => setBloqueioForm(f => ({ ...f, dataFim: maskDate(e.target.value) }))}
                />
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
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">Técnicos Configurados</p>
              <div className="space-y-2">
                {disponibilidades.map(d => (
                  <div key={d.tecnicoId} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{d.tecnicoNome}</p>
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
                      <button onClick={() => openEditConfig(d)} className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors text-xs">
                        Editar
                      </button>
                      <button onClick={() => deleteConfig(d.tecnicoId)} className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">
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
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Dias da semana</p>
                <div className="flex gap-2 flex-wrap">
                  {DIAS_SEMANA.map(dia => (
                    <button
                      key={dia.val}
                      onClick={() => toggleDia(dia.val)}
                      className={clsx(
                        'w-10 h-10 rounded-lg text-xs font-semibold transition-colors border',
                        configForm.diasSemana.includes(dia.val)
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
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
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Período de validade <span className="text-slate-500 text-xs font-normal">(opcional — deixe em branco para sempre)</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Data início"
                    placeholder="dd/mm/aaaa"
                    value={configForm.dataInicio}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={e => setConfigForm(f => ({ ...f, dataInicio: e.target.value }))}
                    onBlur={e => setConfigForm(f => ({ ...f, dataInicio: maskDate(e.target.value) }))}
                  />
                  <Input
                    label="Data fim"
                    placeholder="dd/mm/aaaa"
                    value={configForm.dataFim}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={e => setConfigForm(f => ({ ...f, dataFim: e.target.value }))}
                    onBlur={e => setConfigForm(f => ({ ...f, dataFim: maskDate(e.target.value) }))}
                  />
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
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Bloquear intervalo de almoço</span>
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
        title={bookTecnico ? `Agendar — ${bookTecnico.tecnicoNome}` : 'Novo Agendamento'}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{bookTecnico?.tecnicoNome} · {fmtDate(selectedDate)}</p>
              <div className="flex gap-1 flex-wrap mt-1.5">
                {selectedSlots.map(h => (
                  <span key={h} className="px-2 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-medium">{h}</span>
                ))}
              </div>
            </div>
          </div>

          <ClienteSearch
            label="Cliente *"
            value={bookForm.clienteId}
            onChange={id => setBookForm(f => ({ ...f, clienteId: id }))}
            required
          />

          <Select
            label="Procedimento *"
            options={procedimentos.map((p) => ({ value: String(p.id), label: `${p.nome} · ${formatDurationLabel(p.duracaoMin)}` }))}
            placeholder={procedimentos.length ? 'Selecione o procedimento' : 'Nenhum procedimento ativo'}
            value={bookForm.procedimentoId}
            onChange={e => onChangeProcedimentoBook(e.target.value)}
          />
          <Input label="Duração calculada" value={formatDurationLabel(Number(bookForm.duracao || 0))} readOnly />

          <Textarea
            label="Descrição (opcional)"
            placeholder="Descreva o objetivo do agendamento..."
            value={bookForm.descricao}
            onChange={e => setBookForm(f => ({ ...f, descricao: e.target.value }))}
            maxLength={2000}
            rows={4}
          />

          {bookError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {bookError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowBookModal(false)}>Cancelar</Button>
            <Button onClick={saveBook} disabled={submitting || !bookForm.clienteId || !bookForm.procedimentoId}>
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
          <Select
            label="Procedimento *"
            options={procedimentos.map((p) => ({ value: String(p.id), label: `${p.nome} · ${formatDurationLabel(p.duracaoMin)}` }))}
            placeholder={procedimentos.length ? 'Selecione o procedimento' : 'Nenhum procedimento ativo'}
            value={editForm.procedimentoId}
            onChange={e => onChangeProcedimentoEdit(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data"
              placeholder="dd/mm/aaaa"
              value={editForm.data}
              inputMode="numeric"
              maxLength={10}
              onChange={e => setEditForm(f => ({ ...f, data: e.target.value }))}
              onBlur={e => setEditForm(f => ({ ...f, data: maskDate(e.target.value) }))}
            />
            <Input label="Hora início" type="time" value={editForm.horaInicio} onChange={e => setEditForm(f => ({ ...f, horaInicio: e.target.value }))} />
          </div>
          <Input label="Duração calculada" value={formatDurationLabel(Number(editForm.duracao || 0))} readOnly />
          <Textarea
            label="Descrição"
            placeholder="Descrição..."
            value={editForm.descricao}
            onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
            maxLength={2000}
            rows={4}
          />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editForm.procedimentoId}>
              {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Alterar Status ── */}
      <Modal isOpen={!!statusItem} onClose={() => setStatusItem(null)} title="Alterar Status" size="sm">
        <div className="space-y-4">
          {statusItem && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
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
                    ? opt.color + ' ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-current'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
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
