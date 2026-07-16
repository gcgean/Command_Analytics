import { useState, useEffect, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Clock, User, Search, Calendar, Pencil, CheckSquare, Trash2, History, Eye } from 'lucide-react'
import { AuditoriaTimeline } from '../../components/ui/AuditoriaTimeline'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { Input, Textarea } from '../../components/ui/Input'
import { DateInput } from '../../components/ui/DateInput'
import { api } from '../../services/api'
import type { AgendaItem } from '../../types'
import clsx from 'clsx'
import { Anexos } from '../../components/ui/Anexos'
import { AnexosDraft } from '../../components/ui/AnexosDraft'

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TIPOS = ['Instalação', 'Treinamento', 'Visita', 'Retorno', 'Outros']

const tipoColors: Record<string, string> = {
  Instalação: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Treinamento: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Visita: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Retorno: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}
const defaultTipoColor = 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30'

function normalizarTipoAgenda(valor?: string | null): string {
  const raw = String(valor ?? '').trim()
  if (!raw) return 'Outros'
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (normalized.includes('TREIN')) return 'Treinamento'
  if (normalized.includes('INSTAL')) return 'Instalação'
  if (normalized.includes('RETORN')) return 'Retorno'
  if (normalized.includes('VISIT')) return 'Visita'
  return 'Outros'
}

function limparMarcadorTipoAgenda(valor?: string | null): string {
  return String(valor ?? '').replace(/^\s*\[TIPO_AGENDA:[^\]]+\]\s*/i, '')
}

function formatDurationLabel(duracaoMin: number | string | null | undefined): string {
  const total = Number(duracaoMin ?? 0)
  if (!Number.isFinite(total) || total <= 0) return ''
  if (total < 60) return `${total} min`
  const horas = Math.floor(total / 60)
  const resto = total % 60
  return resto ? `${horas}h ${resto}min` : `${horas}h`
}

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

// Função para formatar tempo garantindo que string válida seja usada
function formatTime(t: any): string {
  if (!t) return ''
  
  if (typeof t === 'string') {
    // Se for string apenas "1970-01-01" ou equivalente sem hora, retorna vazio
    if (t.startsWith('1970-') && (!t.includes('T') || t.includes('T00:00:00'))) return ''
    
    // Se a string contiver a data e a hora "1970-01-01T09:00:00.000Z", extraímos a hora
    if (t.includes('T')) {
      const match = t.match(/T(\d{2}:\d{2})/)
      if (match) return match[1]
    }
    // Se for string no formato "HH:MM:SS" ou "HH:MM", retornar
    if (t.includes(':')) return t.substring(0, 5)
  }
  
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  
  // Ignore fallback date (1970) sem parte de hora se isso ocorrer
  // Normalmente o Prisma manda a Time como um DateTime UTC em 1970
  // Então d.getUTCHours() é a hora correta.
  
  // Porém se for apenas "1970-01-01" sem tempo nenhum, e horas for 00:00, podemos ignorar em alguns casos,
  // mas como o banco tem default para meia noite se omitido, não podemos bloquear 00:00.
  // Como as horas do banco Time vem com `1970-01-01T09:00:00.000Z`, o getUTCHours() extrai 9.
  
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function addMinutesToTime(horario: string, duracaoMin: number | string | null | undefined): string {
  const match = /^(\d{2}):(\d{2})$/.exec(horario)
  const duracao = Math.round(Number(duracaoMin ?? 0))
  if (!match || !Number.isFinite(duracao) || duracao <= 0) return ''

  const totalMinutos = Number(match[1]) * 60 + Number(match[2]) + duracao
  const minutosDia = 24 * 60
  const normalizado = ((totalMinutos % minutosDia) + minutosDia) % minutosDia

  return `${String(Math.floor(normalizado / 60)).padStart(2, '0')}:${String(normalizado % 60).padStart(2, '0')}`
}

function getHorarioFinalAgenda(item: AgendaItem, inicio: string): string {
  const fimSalvo = formatTime((item as any).horarioFim || (item as any).horaFim || (item as any).hora_fin)
  if (fimSalvo) return fimSalvo

  return addMinutesToTime(
    inicio,
    item.duracao ?? (item as any).duracaoMin ?? (item as any).duracao_min
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getAgendaDateKey(a: AgendaItem): string {
  if (!a.data) return ''
  return String(a.data).substring(0, 10)
}

function getAgendaDateRange(a: AgendaItem): string[] {
  const inicio = getAgendaDateKey(a)
  if (!inicio) return []
  const fimRaw = (a as any).dataFim ? String((a as any).dataFim).substring(0, 10) : ''
  const fim = fimRaw && fimRaw !== 'null' && fimRaw !== 'undefined' && !fimRaw.startsWith('1970') && fimRaw > inicio
    ? fimRaw
    : inicio
  if (fim === inicio) return [inicio]
  const dias: string[] = []
  const cursor = new Date(`${inicio}T00:00:00Z`)
  const fimDate = new Date(`${fim}T00:00:00Z`)
  while (cursor.getTime() <= fimDate.getTime()) {
    dias.push(cursor.toISOString().substring(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
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
export function Agenda() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const [errorMessage, setErrorMessage] = useState('')

  // Filters
  const [filters, setFilters] = useState({
    dataInicio: toBRDate(todayStr()),
    dataFim: toBRDate(todayStr()),
    clienteId: '',
    tecnicoId: '',
    tipo: '',
    status: '',
  })

  // Supporting data
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([])
  const [procedimentos, setProcedimentos] = useState<{ id: number; nome: string; duracaoMin: number; ativo: boolean }[]>([])

  // New appointment modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    clienteId: '',
    tecnicoId: '',
    tipo: 'Instalação',
    data: toBRDate(todayStr()),
    horario: '09:00',
    dataFim: toBRDate(todayStr()),
    horarioFim: '10:00',
    observacoes: '',
  })
  const [formClienteNome, setFormClienteNome] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])

  // Edit appointment modal
  const [editItem, setEditItem] = useState<AgendaItem | null>(null)
  const [editForm, setEditForm] = useState({
    clienteId: '',
    tecnicoId: '',
    tipo: '',
    procedimentoId: '',
    data: '',
    horario: '',
    dataFim: '',
    horarioFim: '',
    duracao: '',
    observacoes: '',
  })
  const [editError, setEditError] = useState('')
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
    api.getProcedimentos({ ativo: '1' })
      .then((p: any) => setProcedimentos(Array.isArray(p) ? p : []))
      .catch(() => {})
  }, [])

  // Load month events whenever month changes
  useEffect(() => {
    loadMonthData()
  }, [currentMonth])

  // Initial search for today
  useEffect(() => {
    buscar()
  }, [])

  // Chegando do Pipeline de Implantação com "agendar" pré-preenchido: abre o modal de novo
  // agendamento já com cliente e observação prontos.
  useEffect(() => {
    const prefill = (location.state as any)?.criarAgendamentoPrefill as
      | { clienteId: number; clienteNome?: string; observacao?: string }
      | undefined
    if (prefill?.clienteId) {
      setForm(f => ({ ...f, clienteId: String(prefill.clienteId), observacoes: prefill.observacao || '' }))
      setFormClienteNome(prefill.clienteNome || '')
      setShowModal(true)
      navigate(location.pathname + location.search, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadMonthData() {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const ini = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const fim = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    setErrorMessage('')
    api.getAgenda({ dataInicio: ini, dataFim: fim })
      .then(d => setAgendaMes(d as AgendaItem[]))
      .catch((error: any) => {
        setAgendaMes([])
        setErrorMessage(error?.message || 'Não foi possível carregar a agenda.')
      })
  }

  function buscar(overrides?: typeof filters) {
    const f = overrides ?? filters
    const dIni = fromBRDate(f.dataInicio)
    const dFim = fromBRDate(f.dataFim)
    if (!dIni || !dFim) return

    setLoading(true)
    setSearched(true)
    setErrorMessage('')
    const params: Record<string, string> = {}
    if (dIni) params.dataInicio = dIni
    if (dFim) params.dataFim = dFim
    if (f.clienteId) params.clienteId = f.clienteId
    if (f.tecnicoId) params.tecnicoId = f.tecnicoId
    if (f.tipo) params.tipo = f.tipo
    if (f.status) params.status = f.status
    api.getAgenda(params)
      .then(d => setResults(d as AgendaItem[]))
      .catch((error: any) => {
        setResults([])
        setErrorMessage(error?.message || 'Não foi possível carregar os agendamentos.')
      })
      .finally(() => setLoading(false))
  }

  // Após salvar um agendamento de Instalação ou Treinamento, pergunta se o usuário quer criar
  // o processo de implantação já com cliente e observação prontos (substitui o antigo botão).
  function abrirCriacaoProcessoImplantacao(clienteId: string, clienteNome: string, observacoes: string) {
    navigate('/implantacao', {
      state: {
        criarProcessoPrefill: {
          clienteId: Number(clienteId),
          clienteNome,
          observacao: observacoes || '',
        },
      },
    })
  }

  const TIPOS_SUGEREM_PROCESSO = ['Instalação', 'Treinamento']

  function handleDayClick(dateKey: string) {
    const brDate = toBRDate(dateKey)
    const newFilters = { ...filters, dataInicio: brDate, dataFim: brDate }
    setFilters(newFilters)
    buscar(newFilters)
  }

  async function saveAgendamento() {
    setSaving(true)
    try {
      const created: any = await api.createAgendaItem({
        clienteId: form.clienteId ? Number(form.clienteId) : undefined,
        tecnicoId: form.tecnicoId ? Number(form.tecnicoId) : undefined,
        tipo: form.tipo || undefined,
        data: fromBRDate(form.data) || undefined,
        horario: form.horario || undefined,
        dataFim: fromBRDate(form.dataFim) || undefined,
        horarioFim: form.horarioFim || undefined,
        observacoes: form.observacoes || undefined,
        temAnexos: newFiles.length > 0,
      } as any)

      const createdId = Number(created?.id ?? created?.cod_agenda ?? created?.codAgenda)
      if (createdId && newFiles.length) {
        await api.uploadAnexos({ tabela: 'agenda', registroId: createdId, files: newFiles })
        await api.notifyAgendaItem(createdId)
      }

      setShowModal(false)
      const { clienteId: clienteIdSalvo, tipo: tipoSalvo, observacoes: observacoesSalvas } = form
      const clienteNomeSalvo = formClienteNome
      setForm({ clienteId: '', tecnicoId: '', tipo: 'Instalação', data: toBRDate(todayStr()), horario: '09:00', dataFim: toBRDate(todayStr()), horarioFim: '10:00', observacoes: '' })
      setFormClienteNome('')
      setNewFiles([])
      buscar()
      loadMonthData()

      if (clienteIdSalvo && TIPOS_SUGEREM_PROCESSO.includes(tipoSalvo)) {
        const desejaCriarProcesso = window.confirm(
          `Deseja criar um processo de implantação para este agendamento de ${tipoSalvo.toLowerCase()}?`
        )
        if (desejaCriarProcesso) {
          abrirCriacaoProcessoImplantacao(clienteIdSalvo, clienteNomeSalvo, observacoesSalvas)
        }
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar agendamento.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(item: AgendaItem) {
    setEditItem(item)
    setEditError('')
    
    // Safety checks for dates
    let dataIniStr = ''
    if (item.data) {
      const parsedData = String(item.data).substring(0, 10)
      if (parsedData !== 'null' && parsedData !== 'undefined' && !parsedData.startsWith('1970')) dataIniStr = parsedData
    }
    
    let dataFimStr = ''
    if ((item as any).dataFim) {
      const parsedDataFim = String((item as any).dataFim).substring(0, 10)
      if (parsedDataFim !== 'null' && parsedDataFim !== 'undefined' && !parsedDataFim.startsWith('1970')) dataFimStr = parsedDataFim
    }
    
    setEditForm({
      clienteId: String(item.clienteId ?? ''),
      tecnicoId: String(item.tecnicoId ?? ''),
      tipo: (item as any).origem === 'programado' ? normalizarTipoAgenda(item.tipo) : (item.tipo ?? ''),
      procedimentoId: (item as any).procedimentoId ? String((item as any).procedimentoId) : '',
      data: dataIniStr ? toBRDate(dataIniStr) : '',
      horario: formatTime((item as any).horario || item.horarioIni || (item as any).horaInicio),
      dataFim: dataFimStr ? toBRDate(dataFimStr) : '',
      horarioFim: (item as any).horarioFim ? formatTime((item as any).horarioFim) : '',
      duracao: (item as any).duracao != null ? String((item as any).duracao) : '',
      observacoes: limparMarcadorTipoAgenda((item as any).observacoes),
    })
  }

  async function saveEdit() {
    if (!editItem) return
    setSavingEdit(true)
    setEditError('')
    try {
      const isProg = (editItem as any).origem === 'programado'
      if (isProg) {
        if (!editForm.procedimentoId) {
          setEditError('Selecione o procedimento.')
          return
        }
        await api.updateAgendamentoProg(editItem.id, {
          tecnicoId: editForm.tecnicoId ? Number(editForm.tecnicoId) : undefined,
          clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
          procedimentoId: editForm.procedimentoId ? Number(editForm.procedimentoId) : null,
          data: fromBRDate(editForm.data) || undefined,
          horaInicio: editForm.horario || undefined,
          duracao: editForm.duracao ? Number(editForm.duracao) : undefined,
          descricao: editForm.observacoes || null,
          tipo: editForm.tipo || null,
        })
      } else {
        await api.updateAgendaItem(editItem.id, {
          clienteId: editForm.clienteId ? Number(editForm.clienteId) : null,
          tecnicoId: editForm.tecnicoId ? Number(editForm.tecnicoId) : null,
          tipo: editForm.tipo || null,
          data: fromBRDate(editForm.data) || null,
          horario: editForm.horario || null,
          dataFim: fromBRDate(editForm.dataFim) || null,
          horarioFim: editForm.horarioFim || null,
          observacoes: editForm.observacoes || null,
        } as any)
      }
      setEditItem(null)
      buscar()
    } catch (e: any) {
      setEditError(e?.message || 'Não foi possível salvar as alterações.')
    } finally {
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
    for (const key of getAgendaDateRange(a)) {
      acc[key] = (acc[key] || 0) + 1
    }
    return acc
  }, {})

  const today = todayStr()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">Clique em um dia para filtrar ou use os filtros abaixo</p>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
          Novo Agendamento
        </Button>
      </div>

      {/* Compact Calendar */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Week header */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_DAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Days — compact fixed height */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const dateKey = formatDateKey(day)
            const count = agendaByDate[dateKey] || 0
            const brDateKey = toBRDate(dateKey)
            const isSelected = filters.dataInicio === brDateKey && filters.dataFim === brDateKey
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
                    ? 'bg-blue-100 dark:bg-slate-700 text-blue-700 dark:text-white border border-blue-500'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
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
            <DateInput
              label="Data início"
              mode="br"
              value={filters.dataInicio}
              onChange={(value) => setFilters(f => ({ ...f, dataInicio: value }))}
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <DateInput
              label="Data fim"
              mode="br"
              value={filters.dataFim}
              onChange={(value) => setFilters(f => ({ ...f, dataFim: value }))}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <ClienteSearch
              label="Cliente"
              value={filters.clienteId}
              onChange={(id) => setFilters(f => ({ ...f, clienteId: id }))}
              placeholder="Buscar cliente..."
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
          <div className="flex-1 min-w-[140px]">
            <Select
              label="Status"
              options={[
                { value: '', label: 'Todos' },
                { value: 'aguardando', label: 'Aguardando' },
                { value: '2', label: 'Efetuado' },
                { value: '3', label: 'Não efetuado' },
                { value: '4', label: 'Reagendado' },
              ]}
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            />
          </div>
          <Button icon={<Search className="w-4 h-4" />} onClick={() => buscar()}>
            Buscar
          </Button>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Counter */}
        {searched && !loading && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{results.length}</span>
              {' '}agendamento{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">Buscando agendamentos...</div>
        )}

        {/* Empty state */}
        {!loading && searched && results.length === 0 && !errorMessage && (
          <div className="text-center py-10 text-slate-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum agendamento encontrado para os filtros selecionados.</p>
          </div>
        )}

        {/* Results list */}
        {!loading && results.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <div className="min-w-[680px] space-y-0 px-1">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-2">Horário</div>
              <div className="col-span-1">Data</div>
              <div className="col-span-4">Cliente / Descrição</div>
              <div className="col-span-2">Técnico</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1"></div>
            </div>

            {results.map((item, index) => {
              const statusLabel = getStatusLabel(item.status)
              const tipoKey = item.tipo ?? ''
              const tipoClass = tipoColors[tipoKey] ?? defaultTipoColor
              
              const ini = formatTime((item as any).horario || item.horarioIni || (item as any).horaInicio)
              const fim = getHorarioFinalAgenda(item, ini)
              
              // Se o horário final for igual ao inicial, não mostramos
              const timeStr = ini ? (fim && fim !== ini ? `${ini} – ${fim}` : ini) : (fim || '—')
              
              const rawDate = String(item.data ?? '').substring(0, 10)
              let dateStr = '—'
              if (rawDate && rawDate !== 'null' && rawDate !== 'undefined') {
                 // Check if rawDate is exactly "1970-01-01" which usually means invalid/missing date from db
                 if (!rawDate.startsWith('1970')) {
                   dateStr = new Date(rawDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                 }
              }
              
              const rawDateFim = String((item as any).dataFim ?? '').substring(0, 10)
              if (rawDateFim && rawDateFim !== 'null' && rawDateFim !== 'undefined' && !rawDateFim.startsWith('1970') && rawDateFim !== rawDate) {
                 const dateFimStr = new Date(rawDateFim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                 dateStr = dateStr !== '—' ? `${dateStr} – ${dateFimStr}` : dateFimStr
              }
              const descricao = (item as any).observacoes as string | null | undefined

              return (
                <Fragment key={item.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors items-center border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                  >
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-mono text-slate-700 dark:text-slate-300 text-xs">{timeStr}</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">#{item.id}</p>
                      </div>
                    </div>
                    <div className="col-span-1 text-xs text-slate-600 dark:text-slate-400">{dateStr}</div>
                    <div className="col-span-4 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.clienteNome || '—'}</p>
                      {descricao && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{descricao}</p>}
                      {(item as any).criadoPorNome && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate">
                          por {(item as any).criadoPorNome}
                          {(item as any).dataCriacao ? ` · ${new Date((item as any).dataCriacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{item.tecnicoNome || '—'}</span>
                    </div>
                    <div className="col-span-1">
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded-full border',
                          (item as any).origem === 'programado'
                            ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                            : tipoClass
                        )}
                      >
                        {tipoKey || '—'}
                      </span>
                    </div>
                    <div className="col-span-1">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full', statusColors[statusLabel] ?? '')}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="col-span-1 flex gap-0.5 justify-end flex-nowrap">
                      {item.clienteId ? (
                        <button
                          onClick={() => navigate(`/clientes/${item.clienteId}`)}
                          title="Ver cliente"
                          className="p-1 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => setAuditoriaItem({
                          tabela: (item as any).origem === 'programado' ? 'agendamento_programado' : 'agenda',
                          registroId: item.id,
                          label: item.clienteNome || `#${item.id}`,
                        })}
                        title="Histórico de auditoria"
                        className="p-1 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openStatusChange(item)}
                        title="Alterar Status"
                        className="p-1 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        title="Alterar Agendamento"
                        className="p-1 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
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
                        className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {index < results.length - 1 && (
                    <div className="mx-3 my-1 h-px bg-slate-200/70 dark:bg-slate-700/60" />
                  )}
                </Fragment>
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
            onChange={(id, cliente) => {
              setForm(f => ({ ...f, clienteId: id }))
              setFormClienteNome(cliente ? (cliente.nome || cliente.nomeRazao || '') : '')
            }}
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
            <div className="hidden"></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DateInput
              label="Data Inicial"
              mode="br"
              value={form.data}
              onChange={(value) => setForm(f => ({ ...f, data: value }))}
            />
            <Input
              label="Horário Inicial"
              type="time"
              value={form.horario}
              onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DateInput
              label="Data Final"
              mode="br"
              value={form.dataFim}
              onChange={(value) => setForm(f => ({ ...f, dataFim: value }))}
            />
            <Input
              label="Horário Final"
              type="time"
              value={form.horarioFim}
              onChange={e => setForm(f => ({ ...f, horarioFim: e.target.value }))}
            />
          </div>
          <Textarea
            label="Observações"
            placeholder="Observações do agendamento..."
            value={form.observacoes}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            maxLength={5000}
            rows={4}
          />
          <AnexosDraft files={newFiles} onChange={setNewFiles} />
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
          {(editItem as any)?.origem === 'programado' ? (
            <>
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
              <Select
                label="Tipo"
                options={TIPOS.map(t => ({ value: t, label: t }))}
                value={editForm.tipo}
                onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
              />
              <Select
                label="Procedimento *"
                options={procedimentos.map((p) => ({
                  value: String(p.id),
                  label: `${p.nome} · ${formatDurationLabel(p.duracaoMin)}`,
                }))}
                placeholder="Selecione o procedimento"
                value={editForm.procedimentoId}
                onChange={e => {
                  const procedimentoId = e.target.value
                  const procedimento = procedimentos.find((p) => String(p.id) === procedimentoId)
                  setEditForm((f) => ({
                    ...f,
                    procedimentoId,
                    duracao: procedimento ? String(procedimento.duracaoMin) : f.duracao,
                  }))
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <DateInput
                  label="Data"
                  mode="br"
                  value={editForm.data}
                  onChange={(value) => setEditForm(f => ({ ...f, data: value }))}
                />
                <Input
                  label="Hora início"
                  type="time"
                  value={editForm.horario}
                  onChange={e => setEditForm(f => ({ ...f, horario: e.target.value }))}
                />
              </div>
              <Input
                label="Duração calculada"
                value={formatDurationLabel(editForm.duracao)}
                readOnly
              />
              <Textarea
                label="Descrição"
                placeholder="Descreva o objetivo do agendamento..."
                value={editForm.observacoes}
                onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                maxLength={500}
                rows={4}
              />
            </>
          ) : (
            <>
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
                <>
                  <Select
                    label="Tipo"
                    options={TIPOS.map(t => ({ value: t, label: t }))}
                    value={editForm.tipo}
                    onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                  />
                  <div className="hidden"></div>
                </>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DateInput
                  label="Data Inicial"
                  mode="br"
                  value={editForm.data}
                  onChange={(value) => setEditForm(f => ({ ...f, data: value }))}
                />
                <Input
                  label="Horário Inicial"
                  type="time"
                  value={editForm.horario}
                  onChange={e => setEditForm(f => ({ ...f, horario: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DateInput
                  label="Data Final"
                  mode="br"
                  value={editForm.dataFim}
                  onChange={(value) => setEditForm(f => ({ ...f, dataFim: value }))}
                />
                <Input
                  label="Horário Final"
                  type="time"
                  value={editForm.horarioFim}
                  onChange={e => setEditForm(f => ({ ...f, horarioFim: e.target.value }))}
                />
              </div>
              <Textarea
                label="Observações"
                placeholder="Observações do agendamento..."
                value={editForm.observacoes}
                onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                maxLength={5000}
                rows={4}
              />
            </>
          )}
          {editItem && (
            <Anexos
              tabela={(editItem as any).origem === 'programado' ? 'agendamento_programado' : 'agenda'}
              registroId={editItem.id}
            />
          )}
          {editError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {editError}
            </div>
          )}
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
            <p className="text-sm text-slate-600 dark:text-slate-400">
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
