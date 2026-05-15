import { useEffect, useState } from 'react'
import { Calendar, Eye, GraduationCap, PencilLine, Search, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { DateInput } from '../../components/ui/DateInput'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { usePermissions } from '../../contexts/PermissionsContext'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import type { AgendaItem } from '../../types'

const TIPOS = ['Treinamento', 'Instalação', 'Visita', 'Retorno', 'Outros']

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: '2', label: 'Efetuado' },
  { value: '3', label: 'Não efetuado' },
  { value: '4', label: 'Reagendado' },
]

const statusColors: Record<string, string> = {
  Aguardando: 'bg-amber-500/20 text-amber-400',
  Efetuado: 'bg-emerald-500/20 text-emerald-400',
  'Não efetuado': 'bg-red-500/20 text-red-400',
  Reagendado: 'bg-purple-500/20 text-purple-400',
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

function formatDate(value?: string | Date | null) {
  if (!value) return '—'
  const iso = value instanceof Date ? value.toISOString().substring(0, 10) : String(value).substring(0, 10)
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

function getStatusLabel(status: number | null | undefined): string {
  if (status === 0 || status === 1) return 'Aguardando'
  if (status === 2) return 'Efetuado'
  if (status === 3) return 'Não efetuado'
  if (status === 4) return 'Reagendado'
  return 'Aguardando'
}

function normalizeTipo(tipo?: string | null): string {
  const raw = String(tipo ?? '').trim()
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

function formatNotaUsuario(item: AgendaItem) {
  if (!item.notaUsuarioNome) return ''
  if (!item.notaAtualizadaEm) return `Lançado por ${item.notaUsuarioNome}`

  const data = new Date(item.notaAtualizadaEm)
  if (Number.isNaN(data.getTime())) return `Lançado por ${item.notaUsuarioNome}`

  return `Lançado por ${item.notaUsuarioNome} em ${data.toLocaleDateString('pt-BR')}`
}

type AbaHistorico = 'lista' | 'ranking'

type RankingTreinamentoItem = {
  tecnicoId: number | null
  tecnicoNome: string
  mediaNota: number
  quantidadeTreinamentos: number
  quantidadeAvaliacoes: number
}

function parseNotaValida(nota?: string | null) {
  if (nota == null) return null
  const valor = String(nota).replace(',', '.').trim()
  if (!valor) return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero
}

export function HistoricoTreinamentos() {
  const { can } = usePermissions()
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [abaAtiva, setAbaAtiva] = useState<AbaHistorico>('lista')
  const [filters, setFilters] = useState({
    dataInicio: toBRDate(todayStr()),
    dataFim: toBRDate(todayStr()),
    clienteId: '',
    tecnicoId: '',
    tipo: 'Treinamento',
    status: '',
  })
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([])
  const [results, setResults] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notaModalItem, setNotaModalItem] = useState<AgendaItem | null>(null)
  const [notaValor, setNotaValor] = useState('')
  const [notaErro, setNotaErro] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  const podeAvaliarTreinamento = can('historico-treinamentos') && !!user
  const rankingMap = results.reduce<Map<string, RankingTreinamentoItem & { somaNotas: number }>>((acc, item) => {
    const tecnicoId = item.tecnicoId ?? null
    const tecnicoNome = item.tecnicoNome?.trim() || 'Técnico não informado'
    const chave = `${tecnicoId ?? 'sem-id'}::${tecnicoNome}`
    const notaValida = parseNotaValida(item.nota)
    const existente = acc.get(chave)

    if (existente) {
      existente.quantidadeTreinamentos += 1
      if (notaValida !== null) {
        existente.somaNotas += notaValida
        existente.quantidadeAvaliacoes += 1
      }
      return acc
    }

    acc.set(chave, {
      tecnicoId,
      tecnicoNome,
      mediaNota: 0,
      quantidadeTreinamentos: 1,
      quantidadeAvaliacoes: notaValida !== null ? 1 : 0,
      somaNotas: notaValida ?? 0,
    })
    return acc
  }, new Map())

  const rankingNotas = Array.from(rankingMap.values())
    .filter((item) => item.quantidadeAvaliacoes > 0)
    .map((item) => ({
      ...item,
      mediaNota: item.somaNotas / item.quantidadeAvaliacoes,
    }))
    .sort((a, b) => {
      if (b.mediaNota !== a.mediaNota) return b.mediaNota - a.mediaNota
      if (b.quantidadeTreinamentos !== a.quantidadeTreinamentos) return b.quantidadeTreinamentos - a.quantidadeTreinamentos
      if (b.quantidadeAvaliacoes !== a.quantidadeAvaliacoes) return b.quantidadeAvaliacoes - a.quantidadeAvaliacoes
      return a.tecnicoNome.localeCompare(b.tecnicoNome)
    })

  useEffect(() => {
    api.getUsuarios()
      .then((usuarios: any[]) => {
        setTecnicos(
          usuarios.map((usuario: any) => ({
            id: Number(usuario.id),
            nome: usuario.nome || usuario.nomeCompleto || usuario.nomeUsu || `#${usuario.id}`,
          })),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    buscar()
  }, [])

  function buscar(overrides?: typeof filters) {
    const current = overrides ?? filters
    const dataInicio = fromBRDate(current.dataInicio)
    const dataFim = fromBRDate(current.dataFim)

    if (!dataInicio || !dataFim) {
      setErrorMessage('Informe a data inicial e final.')
      setResults([])
      setSearched(true)
      return
    }

    setLoading(true)
    setSearched(true)
    setErrorMessage('')

    const params: Record<string, string> = {
      dataInicio,
      dataFim,
      tipo: current.tipo || 'Treinamento',
    }

    if (current.clienteId) params.clienteId = current.clienteId
    if (current.tecnicoId) params.tecnicoId = current.tecnicoId
    if (current.status) params.status = current.status

    api.getAgenda(params)
      .then((items) => {
        const treinamentos = (items as AgendaItem[]).filter((item) => normalizeTipo(item.tipo) === 'Treinamento')
        setResults(treinamentos)
      })
      .catch((error: any) => {
        setResults([])
        setErrorMessage(error?.message || 'Não foi possível carregar o histórico de treinamentos.')
      })
      .finally(() => setLoading(false))
  }

  function abrirModalNota(item: AgendaItem) {
    setNotaModalItem(item)
    setNotaValor(item.nota ? String(item.nota) : '')
    setNotaErro('')
  }

  function fecharModalNota() {
    if (savingNota) return
    setNotaModalItem(null)
    setNotaValor('')
    setNotaErro('')
  }

  async function salvarNota() {
    if (!notaModalItem) return

    const valorNormalizado = notaValor.replace(',', '.').trim()
    const numeroNota = Number(valorNormalizado)

    if (!valorNormalizado) {
      setNotaErro('Informe uma nota de 0 a 10.')
      return
    }

    if (!Number.isFinite(numeroNota) || numeroNota < 0 || numeroNota > 10) {
      setNotaErro('A nota precisa estar entre 0 e 10.')
      return
    }

    setSavingNota(true)
    setNotaErro('')

    try {
      if (notaModalItem.origem === 'programado') {
        await api.updateAgendamentoProgNota(notaModalItem.id, valorNormalizado)
      } else {
        await api.updateAgendaNota(notaModalItem.id, valorNormalizado)
      }

      await buscar()
      fecharModalNota()
    } catch (error: any) {
      setNotaErro(error?.message || 'Não foi possível salvar a nota do treinamento.')
    } finally {
      setSavingNota(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-500/10 rounded-lg">
          <GraduationCap className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de Treinamentos</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Registro e consulta de treinamentos por período</p>
        </div>
      </div>

      <Card>
        <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setAbaAtiva('lista')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              abaAtiva === 'lista'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            Listagem
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('ranking')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              abaAtiva === 'ranking'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            Ranking de notas
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[130px]">
            <DateInput
              label="Data início"
              mode="br"
              value={filters.dataInicio}
              onChange={(value) => setFilters((current) => ({ ...current, dataInicio: value }))}
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <DateInput
              label="Data fim"
              mode="br"
              value={filters.dataFim}
              onChange={(value) => setFilters((current) => ({ ...current, dataFim: value }))}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <ClienteSearch
              label="Cliente"
              value={filters.clienteId}
              onChange={(id) => setFilters((current) => ({ ...current, clienteId: id }))}
              placeholder="Buscar cliente..."
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              label="Técnico"
              options={[{ value: '', label: 'Todos' }, ...tecnicos.map((tecnico) => ({ value: String(tecnico.id), label: tecnico.nome }))]}
              value={filters.tecnicoId}
              onChange={(event) => setFilters((current) => ({ ...current, tecnicoId: event.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              label="Tipo"
              options={TIPOS.map((tipo) => ({ value: tipo, label: tipo }))}
              value={filters.tipo}
              onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              label="Status"
              options={statusOptions}
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
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

        {searched && !loading && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {abaAtiva === 'lista' ? (
                <>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{results.length}</span>
                  {' '}treinamento{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{rankingNotas.length}</span>
                  {' '}técnico{rankingNotas.length !== 1 ? 's' : ''} com nota válida no período
                </>
              )}
            </span>
          </div>
        )}

        {abaAtiva === 'lista' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['ID', 'Cliente', 'Técnico', 'Data', 'Tipo', 'Status', 'Nota', 'Observação'].map((header) => (
                    <th key={header} className="table-header text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((item) => {
                  const statusLabel = getStatusLabel(item.status)
                  return (
                    <tr key={`${item.origem ?? 'agenda'}-${item.id}`} className="table-row">
                      <td className="table-cell font-mono text-blue-400 font-semibold">#{item.id}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{item.clienteNome || '—'}</span>
                          {item.clienteId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/clientes/${item.clienteId}`)}
                              title="Ver cliente"
                              className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="table-cell text-slate-600 dark:text-slate-400">{item.tecnicoNome || '—'}</td>
                      <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(item.data)}</td>
                      <td className="table-cell text-slate-600 dark:text-slate-400">{item.tipo || 'Treinamento'}</td>
                      <td className="table-cell">
                        <span className={`badge text-xs ${statusColors[statusLabel] ?? 'bg-slate-500/20 text-slate-500'}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="table-cell text-slate-600 dark:text-slate-400">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{item.nota || '—'}</span>
                            {podeAvaliarTreinamento && (
                              <button
                                type="button"
                                onClick={() => abrirModalNota(item)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10"
                              >
                                {item.nota ? <PencilLine className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                                {item.nota ? 'Editar' : 'Dar nota'}
                              </button>
                            )}
                          </div>
                          {item.nota && formatNotaUsuario(item) && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatNotaUsuario(item)}</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell text-slate-500">{item.observacoes || '—'}</td>
                    </tr>
                  )
                })}

                {!loading && results.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-cell text-center text-slate-500 py-10">
                      Nenhum treinamento encontrado para os filtros informados.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={8} className="table-cell text-center text-slate-500 py-10">
                      Carregando treinamentos...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Posição', 'Técnico', 'Nota média', 'Qtd. treinamentos', 'Qtd. avaliações válidas'].map((header) => (
                    <th key={header} className="table-header text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingNotas.map((item, index) => (
                  <tr key={`${item.tecnicoId ?? 'sem-id'}-${item.tecnicoNome}`} className="table-row">
                    <td className="table-cell font-semibold text-slate-900 dark:text-slate-100">#{index + 1}</td>
                    <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{item.tecnicoNome}</td>
                    <td className="table-cell">
                      <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-500">
                        {item.mediaNota.toFixed(2)}
                      </span>
                    </td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{item.quantidadeTreinamentos}</td>
                    <td className="table-cell text-slate-600 dark:text-slate-400">{item.quantidadeAvaliacoes}</td>
                  </tr>
                ))}

                {!loading && rankingNotas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-cell text-center text-slate-500 py-10">
                      Nenhuma nota válida encontrada para montar o ranking no período filtrado.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={5} className="table-cell text-center text-slate-500 py-10">
                      Carregando ranking...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={!!notaModalItem}
        onClose={fecharModalNota}
        title={notaModalItem?.nota ? 'Editar nota do treinamento' : 'Dar nota ao treinamento'}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <div className="font-medium text-slate-900 dark:text-slate-100">{notaModalItem?.clienteNome || 'Treinamento'}</div>
            <div>{notaModalItem?.tipo || 'Treinamento'} em {notaModalItem ? formatDate(notaModalItem.data) : '—'}</div>
            <div>Técnico: {notaModalItem?.tecnicoNome || '—'}</div>
          </div>

          <Input
            label="Nota"
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={notaValor}
            onChange={(event) => setNotaValor(event.target.value)}
            error={notaErro}
            placeholder="Informe uma nota de 0 a 10"
          />

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={fecharModalNota}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <Button onClick={() => void salvarNota()} disabled={savingNota}>
              {savingNota ? 'Salvando...' : 'Salvar nota'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
