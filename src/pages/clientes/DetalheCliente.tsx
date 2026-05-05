import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Headphones,
  DollarSign,
  Cpu,
  GitBranch,
  Shield,
  MapPin,
  NotebookPen,
  FileText,
  ClipboardList,
  CalendarDays,
  Phone,
} from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { ProntuarioEditor } from '../../components/clientes/ProntuarioEditor'
import { usePermissions } from '../../contexts/PermissionsContext'
import { api } from '../../services/api'
import type {
  Atendimento,
  Assinatura,
  Cliente,
  ClienteHistoricoDesenvolvimento,
  ClienteResumoAtendimentos,
  ClienteLegadoAgenda,
  ClienteLegadoContato,
  ClienteLegadoVendaCampo,
  StatusAtendimento,
} from '../../types'

const curvaColors: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-amber-500/20 text-amber-400',
  C: 'bg-red-500/20 text-red-400',
}

const departamentoColors: Record<string, string> = {
  Suporte: 'bg-blue-500/20 text-blue-400',
  Fiscal: 'bg-amber-500/20 text-amber-400',
  Financeiro: 'bg-green-500/20 text-green-400',
  Comercial: 'bg-purple-500/20 text-purple-400',
  Certificado: 'bg-orange-500/20 text-orange-400',
  CS: 'bg-cyan-500/20 text-cyan-400',
  Implantação: 'bg-pink-500/20 text-pink-400',
  Treinamento: 'bg-indigo-500/20 text-indigo-400',
  Técnico: 'bg-red-500/20 text-red-400',
  Desenvolvimento: 'bg-violet-500/20 text-violet-400',
}

const vendaLabels = [
  'TIPO DE INSTALACAO',
  'QTD DE MAQUINAS',
  'TIPO DE SERVIDOR',
  'QTD DE SISTEMAS',
  'TIPO DE DOCUMENTO FISCAL',
  'BALANCA INTEGRADA',
  'QTD DE IMPRESSORAS COMPARTILHADAS',
  'IMPRESSORA COMPARTILHADA',
  'QTD IMPRESSORA DE ETIQUETAS',
  'IMPRIMIR ETIQUETA COMPARTILHADA',
  'QTD DE BALANCAS DE ETIQUETAS',
  'CERTIFICADO DIGITAL',
  'TIPO DE TREINAMENTO',
  'QTD DE PESSOAS DO TREINAMENTO',
  'SETORES DO TREINAMENTO',
  'NOME DO VENDEDOR',
  'OBSERVACAO DO NEGOCIO',
] as const

type ClienteDetalhe = Cliente & {
  atendimentos?: Atendimento[]
  resumoAtendimentos?: ClienteResumoAtendimentos
  historicoDesenvolvimento?: ClienteHistoricoDesenvolvimento[]
  assinaturas?: Assinatura[]
  contador?: {
    id: number
    nome?: string | null
    nomeComercial?: string | null
    email?: string | null
    telefone?: string | null
  }
}

type ParsedLegacyNotes = {
  prontuarioTexto: string
  produtoCommand: string | null
  generalLines: string[]
  contactsFromText: string[]
  vendaFields: Array<{ label: string; value: string }>
}

function getClienteStatus(c: Cliente): string {
  if (c.ativo === 'N') return 'Inativo'
  if (c.bloqueado === 'S') return 'Bloqueado'
  return 'Ativo'
}

function normalizeLegacyLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|]/g, ' ')
    .replace(/[^A-Za-z0-9: ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function parseLegacyText(rawText?: string | null): ParsedLegacyNotes {
  const source = String(rawText ?? '').replace(/\r/g, '')
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '|' && line !== '-')

  const vendaMap = new Map<string, string>()
  const normalizedVendaLabels = vendaLabels.map((label) => ({
    label,
    normalized: normalizeLegacyLabel(label),
  }))

  let produtoCommand: string | null = null
  let inContactsBlock = false
  const generalLines: string[] = []
  const contactsFromText: string[] = []

  for (const line of lines) {
    const normalizedLine = normalizeLegacyLabel(line)

    if (normalizedLine.startsWith('PRODUTOS COMMAND A SEREM UTILIZADOS')) {
      const [, value = ''] = line.split(/:(.*)/, 2)
      produtoCommand = value.trim() || line
      continue
    }

    if (normalizedLine.includes('CONTATOS DO CLIENTE')) {
      inContactsBlock = true
      continue
    }

    const vendaLabel = normalizedVendaLabels.find(({ normalized }) => normalizedLine.startsWith(`${normalized}:`) || normalizedLine === normalized)
    if (vendaLabel) {
      const separatorIndex = line.indexOf(':')
      const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : ''
      vendaMap.set(vendaLabel.label, value)
      inContactsBlock = false
      continue
    }

    if (inContactsBlock) {
      contactsFromText.push(line)
      continue
    }

    generalLines.push(line)
  }

  return {
    prontuarioTexto: source.trim(),
    produtoCommand,
    generalLines,
    contactsFromText,
    vendaFields: vendaLabels.map((label) => ({
      label: `${label}:`,
      value: vendaMap.get(label) ?? '',
    })),
  }
}

function formatSafeDate(value: unknown) {
  if (!value) return '—'
  const asText = String(value)
  const date = new Date(asText)
  if (Number.isNaN(date.getTime())) return asText
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatSafeDateTime(value: unknown) {
  if (!value) return '—'
  const asText = String(value)
  const date = new Date(asText)
  if (Number.isNaN(date.getTime())) return asText
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSafeTime(value: unknown) {
  if (!value) return '—'
  const asText = String(value)
  const timeMatch = asText.match(/(\d{2}:\d{2})/)
  if (timeMatch) return timeMatch[1]
  const date = new Date(asText)
  if (Number.isNaN(date.getTime())) return asText
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatAgendaWindow(item: ClienteLegadoAgenda) {
  const data = formatSafeDate(item.data)
  const inicio = formatSafeTime(item.horarioIni)
  const fim = formatSafeTime(item.horarioFim)
  if (inicio !== '—' || fim !== '—') {
    return `${data} · ${inicio}${fim !== '—' ? ` às ${fim}` : ''}`
  }
  return data
}

function formatDurationMinutes(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  const total = Number(value)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours <= 0) return `${minutes} min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

export function DetalheCliente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [cliente, setCliente] = useState<ClienteDetalhe | undefined>()
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const canViewFinanceiro = can('clientes-valores')

  const tabs = [
    { key: 'dados', label: 'Dados', icon: <Building2 className="w-4 h-4" /> },
    { key: 'prontuario', label: 'Prontuário do cliente', icon: <NotebookPen className="w-4 h-4" /> },
    { key: 'observacoes-gerais', label: 'Observações gerais', icon: <FileText className="w-4 h-4" /> },
    { key: 'observacao-venda', label: 'Observação da venda', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'observacoes-agendamentos', label: 'Histórico de agendamentos', icon: <CalendarDays className="w-4 h-4" /> },
    { key: 'atendimentos', label: 'Atendimentos', icon: <Headphones className="w-4 h-4" /> },
    { key: 'desenvolvimento', label: 'Desenvolvimento', icon: <Cpu className="w-4 h-4" /> },
    ...(canViewFinanceiro ? [{ key: 'financeiro', label: 'Financeiro', icon: <DollarSign className="w-4 h-4" /> }] : []),
    { key: 'tecnico', label: 'Técnico', icon: <Cpu className="w-4 h-4" /> },
    { key: 'implantacao', label: 'Implantação', icon: <GitBranch className="w-4 h-4" /> },
  ]

  useEffect(() => {
    if (activeTab >= tabs.length) setActiveTab(0)
  }, [activeTab, tabs.length])

  useEffect(() => {
    const parsedId = Number(id)
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setCliente(undefined)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setCliente(undefined)

    api.getClienteById(parsedId, { signal: controller.signal })
      .then((c: any) => {
        setCliente(c as ClienteDetalhe)
        setLoading(false)
      })
      .catch((err: any) => {
        if (String(err?.message ?? '').toLowerCase().includes('tempo limite')) {
          setCliente(undefined)
          setLoading(false)
          return
        }
        const isAbort = err?.name === 'AbortError' || String(err?.message ?? '').toLowerCase().includes('aborted')
        if (isAbort) return
        setLoading(false)
      })

    return () => controller.abort()
  }, [id])

  const legacyParsed = useMemo(
    () => parseLegacyText(cliente?.legado?.observacaoPlataforma ?? ''),
    [cliente?.legado?.observacaoPlataforma],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-600 dark:text-slate-400">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        Carregando cliente...
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Cliente não encontrado.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/clientes')}>Voltar</Button>
      </div>
    )
  }

  const clienteAtendimentos = cliente.atendimentos ?? []
  const resumoAtendimentos = cliente.resumoAtendimentos
  const historicoDesenvolvimento = cliente.historicoDesenvolvimento ?? []
  const clienteAssinaturas = cliente.assinaturas ?? []
  const contatosLegado: ClienteLegadoContato[] = cliente.legado?.contatos ?? []
  const vendaLegado: ClienteLegadoVendaCampo[] = cliente.legado?.vendaCampos ?? []
  const agendaLegado: ClienteLegadoAgenda[] = cliente.legado?.agendaObservacoes ?? []
  const vendaFields = vendaLegado.length > 0 ? vendaLegado : legacyParsed.vendaFields
  const statusLabel = getClienteStatus(cliente)
  const curvaKey = cliente.curvaABC ?? ''
  const tabKey = tabs[activeTab]?.key ?? 'dados'

  const contatosFallback = [
    cliente.responsavel ? `Responsável: ${cliente.responsavel}` : '',
    cliente.telefone ? `Telefone: ${cliente.telefone}` : '',
    cliente.email ? `E-mail: ${cliente.email}` : '',
  ].filter(Boolean)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/clientes')}>
          Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{cliente.nome ?? '—'}</h2>
            {curvaKey && (
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', curvaColors[curvaKey] ?? '')}>
                Curva {curvaKey}
              </span>
            )}
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              statusLabel === 'Ativo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
            )}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">#{cliente.id} · {cliente.cnpj ?? '—'}</p>
        </div>
        <Button variant="secondary">Editar Cliente</Button>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              i === activeTab
                ? 'text-blue-400 border-blue-500'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {tabKey === 'dados' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" /> Dados cadastrais
            </h3>
            <dl className="space-y-3">
              {[
                { label: 'Razão Social', value: cliente.nomeRazao ?? cliente.nome ?? '—' },
                { label: 'CNPJ', value: cliente.cnpj ?? '—' },
                { label: 'Classificação', value: cliente.classificacaoNome ?? '—' },
                { label: 'Segmento', value: cliente.segmento ?? (cliente.idSegmento ? `Segmento ${cliente.idSegmento}` : '—') },
                { label: 'Regime Tributário', value: cliente.idRegime ? `Regime ${cliente.idRegime}` : '—' },
                { label: 'Data Contrato', value: formatSafeDate(cliente.dataContrato) },
                { label: 'Responsável', value: cliente.responsavel ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-700 dark:text-slate-300 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" /> Contato
            </h3>
            <dl className="space-y-3">
              {[
                { label: 'Cidade/UF', value: `${cliente.cidade ?? '—'}/${cliente.uf ?? '—'}` },
                { label: 'Telefone', value: cliente.telefone ?? '—' },
                { label: 'Telefone residencial', value: cliente.telefoneResidencial ?? '—' },
                { label: 'E-mail', value: cliente.email ?? '—' },
                { label: 'Contador', value: cliente.contador?.nomeComercial ?? cliente.contador?.nome ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-700 dark:text-slate-300 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {tabKey === 'prontuario' && (
        <ProntuarioEditor
          clienteId={cliente.id}
          initialValue={cliente.obsVenda ?? ''}
          onSave={async (html) => {
            const atualizado = await api.updateClienteProntuario(cliente.id, { observacoes: html })
            setCliente((prev) => prev ? { ...prev, obsVenda: atualizado.obsVenda ?? html } : prev)
          }}
        />
      )}

      {tabKey === 'observacoes-gerais' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Resumo do plano</h3>
            <div className="space-y-2">
              {legacyParsed.generalLines.length > 0 ? legacyParsed.generalLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm text-slate-700 dark:text-slate-300">
                  {line}
                </p>
              )) : (
                <p className="text-sm text-slate-500">Nenhuma observação geral encontrada no legado.</p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-400" /> Contatos do cliente
            </h3>
            <div className="space-y-3">
              {contatosLegado.length > 0 ? contatosLegado.map((contato, index) => (
                <div key={`${contato.descricao}-${contato.numero}-${index}`} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{contato.descricao || 'Contato'}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{contato.numero || '—'}</p>
                  {contato.setor && <p className="text-xs text-slate-500 mt-1">{contato.setor}</p>}
                </div>
              )) : legacyParsed.contactsFromText.length > 0 ? legacyParsed.contactsFromText.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm text-slate-700 dark:text-slate-300">{line}</p>
              )) : contatosFallback.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm text-slate-700 dark:text-slate-300">{line}</p>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tabKey === 'observacao-venda' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Campos trazidos do legado de venda</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
            {vendaFields.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 py-2">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-sm font-medium text-right text-slate-700 dark:text-slate-300">{value || '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tabKey === 'observacoes-agendamentos' && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {agendaLegado.length} agendamento(s) encontrado(s)
            </p>
          </div>
          {agendaLegado.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {agendaLegado.map((item) => (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {item.tipo || 'Agendamento'} · #{item.id}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{formatAgendaWindow(item)}</p>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs text-slate-500">{item.tecnicoNome || 'Sem técnico informado'}</span>
                      <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.origem === 'agendamento_programado' ? 'Programado' : 'Agenda'}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {item.observacoes || 'Sem observações registradas para este agendamento.'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">Nenhum agendamento encontrado para este cliente.</div>
          )}
        </Card>
      )}

      {tabKey === 'atendimentos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Tempo médio</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {formatDurationMinutes(resumoAtendimentos?.tempoMedioMinutos)}
              </p>
              <p className="mt-1 text-xs text-slate-500">média de duração dos atendimentos desse cliente</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total de chamados</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {resumoAtendimentos?.totalChamados ?? clienteAtendimentos.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">somente atendimentos normais concluídos</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Média por dia</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {resumoAtendimentos?.mediaChamadosPorDia != null ? resumoAtendimentos.mediaChamadosPorDia.toFixed(2) : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">baseado na data de cadastro do cliente</p>
            </Card>
          </div>

          <Card padding="none">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{clienteAtendimentos.length} atendimento(s) no histórico</p>
            </div>
            {clienteAtendimentos.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {clienteAtendimentos.map((a) => (
                  <div key={a.id} className="px-4 py-4 flex items-start gap-4">
                    <span className="font-mono text-xs text-blue-400 mt-0.5">#{a.id}</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <p className="text-xs text-slate-500">
                          {formatSafeDate(a.dataFechamento ?? a.dataAbertura)} · {a.tecnicoNome || 'Sem técnico informado'}
                        </p>
                        <StatusBadge status={a.status as StatusAtendimento} />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={clsx(
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                          a.departamentoLabel ? (departamentoColors[a.departamentoLabel] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300') : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                        )}>
                          {a.departamentoLabel ?? 'Sem departamento'}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Duração: {formatDurationMinutes(a.tempoAtendimento)}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Nota: {a.nota != null ? a.nota : '—'}
                        </span>
                      </div>

                      <div className="text-sm">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Procedimento efetuado</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{a.procedimentos || 'Não informado.'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-500">Nenhum atendimento normal encontrado para este cliente.</div>
            )}
          </Card>
        </div>
      )}

      {tabKey === 'desenvolvimento' && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {historicoDesenvolvimento.length} solicitação(ões) no desenvolvimento
            </p>
          </div>
          {historicoDesenvolvimento.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {historicoDesenvolvimento.map((item) => (
                <div key={item.id} className="px-4 py-4 flex items-start gap-4">
                  <span className="font-mono text-xs text-blue-400 mt-0.5">#{item.id}</span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                        {item.solicitacao}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Data da solicitação</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{formatSafeDate(item.dataSolicitacao ?? item.dataReferencia)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Técnico</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{item.tecnicoNome || 'Não informado.'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Desenvolvedor</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{item.desenvolvedorNome || 'Não informado.'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">Nenhum histórico de desenvolvimento encontrado para este cliente.</div>
          )}
        </Card>
      )}

      {tabKey === 'financeiro' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Assinaturas</h3>
          <div className="space-y-4">
            {clienteAssinaturas.length > 0 ? clienteAssinaturas.map((a) => (
              <div key={a.id} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{a.planoNome}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{a.formaPagamento} · Vencimento dia {a.vencimento}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-blue-400">R$ {a.valor.toLocaleString('pt-BR')}</p>
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      a.status === 'Ativa' ? 'bg-emerald-500/20 text-emerald-400' :
                        a.status === 'Suspensa' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-600/40 text-slate-500',
                    )}>
                      {a.status}
                    </span>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">Nenhuma assinatura encontrada para este cliente.</p>
            )}
          </div>
        </Card>
      )}

      {tabKey === 'tecnico' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Dados do sistema</h3>
            <dl className="space-y-3">
              {[
                { label: 'Versão do sistema', value: cliente.versaoSistema ?? '—' },
                { label: 'Conexões ativas', value: cliente.conexoes ?? '—' },
                { label: 'Caixas (PDV)', value: cliente.caixas ?? '—' },
                { label: 'Último backup', value: formatSafeDateTime(cliente.ultimoBackup) },
                { label: 'Último FTP', value: formatSafeDateTime(cliente.ultimoFTP) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-700 dark:text-slate-300 text-right">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" /> Certificado digital
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {cliente.certificadoVencimento ? `Vencimento: ${formatSafeDate(cliente.certificadoVencimento)}` : 'Certificado não cadastrado.'}
            </p>
          </Card>
        </div>
      )}

      {tabKey === 'implantacao' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Status da implantação</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Acompanhe o status do processo de implantação completo na tela Pipeline de Implantação.</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/implantacao')}>
            Ver Pipeline
          </Button>
        </Card>
      )}
    </div>
  )
}
