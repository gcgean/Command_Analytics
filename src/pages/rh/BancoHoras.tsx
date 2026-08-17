import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Plus, X, Loader2, TrendingUp, AlertCircle, Trophy, Paperclip, MoreVertical, Route } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import { DateInput } from '../../components/ui/DateInput'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { Anexos } from '../../components/ui/Anexos'
import { usePermissions } from '../../contexts/PermissionsContext'
import { api } from '../../services/api'
import clsx from 'clsx'
import type { LancamentoBancoHoras, TipoMovimentoBancoHoras, Usuario } from '../../types'

const tipos: TipoMovimentoBancoHoras[] = ['Hora Extra', 'Horas por Km', 'Falta c/ Atestado', 'Falta s/ Atestado', 'Home Office', 'Desconto de Horas Padrão']

const tipoCor: Record<TipoMovimentoBancoHoras, string> = {
  'Hora Extra': 'bg-emerald-500/20 text-emerald-400',
  'Horas por Km': 'bg-cyan-500/20 text-cyan-400',
  'Falta c/ Atestado': 'bg-amber-500/20 text-amber-400',
  'Falta s/ Atestado': 'bg-red-500/20 text-red-400',
  'Home Office': 'bg-blue-500/20 text-blue-400',
  'Desconto de Horas Padrão': 'bg-slate-500/20 text-slate-400',
}

function inicioMesAtualISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fimMesAtualISO(): string {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`
}

// Padrão de data dd/mm/aaaa em todo o sistema (igual Agendamento/Agendamento Programado) —
// o estado interno guarda BR, converte pra ISO só na hora de comparar/mandar pra API.
function toBRDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function fromBRDate(br: string): string {
  if (!br) return ''
  const [d, m, y] = br.split('/')
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m}-${d}`
}

function mesAtualBR() {
  return { ini: toBRDate(inicioMesAtualISO()), fim: toBRDate(fimMesAtualISO()) }
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

function formatDateTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function BancoHoras() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const podeLancar = can('banco-horas-lancar')

  const [aba, setAba] = useState<'lancamentos' | 'ranking'>('lancamentos')
  const [lancamentos, setLancamentos] = useState<LancamentoBancoHoras[]>([])
  const [funcionarios, setFuncionarios] = useState<Usuario[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDataIni, setFiltroDataIni] = useState(mesAtualBR().ini)
  const [filtroDataFim, setFiltroDataFim] = useState(mesAtualBR().fim)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    funcionarioId: '',
    tipo: '' as TipoMovimentoBancoHoras | '',
    horas: '',
    dataInicio: '',
    dataFim: '',
    observacao: '',
  })
  const [anexoFiles, setAnexoFiles] = useState<File[]>([])
  const anexoInputRef = useRef<HTMLInputElement | null>(null)
  const [anexosDe, setAnexosDe] = useState<LancamentoBancoHoras | null>(null)
  const [menuAberto, setMenuAberto] = useState<number | null>(null)

  const carregar = () => {
    setLoadingLista(true)
    api.getBancoHoras()
      .then(setLancamentos)
      .catch(() => toast.error('Falha ao carregar o banco de horas.'))
      .finally(() => setLoadingLista(false))
  }

  useEffect(() => {
    if (menuAberto === null) return
    const fechar = () => setMenuAberto(null)
    document.addEventListener('click', fechar)
    return () => document.removeEventListener('click', fechar)
  }, [menuAberto])

  useEffect(() => {
    carregar()
    api.getUsuarios().then(setFuncionarios).catch(() => setFuncionarios([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const funcionarioOptions = useMemo(
    () => funcionarios.map(f => ({ value: String(f.id), label: f.nome })),
    [funcionarios]
  )

  // Filtros, ranking e KPIs só devem considerar usuários ativos — GET /usuarios já só retorna
  // ativos, então basta restringir os lançamentos aos funcionarioId presentes nessa lista
  // (mantém o histórico de gente desligada fora da tela, mesmo que ela tenha lançamentos antigos).
  const idsAtivos = useMemo(() => new Set(funcionarios.map(f => f.id)), [funcionarios])
  const lancamentosAtivos = useMemo(
    () => lancamentos.filter(l => idsAtivos.has(l.funcionarioId)),
    [lancamentos, idsAtivos]
  )

  const filtrados = lancamentosAtivos
    .filter(l => {
      if (filtroFuncionario && String(l.funcionarioId) !== filtroFuncionario) return false
      if (filtroTipo && l.tipo !== filtroTipo) return false
      if (l.dataInicio) {
        const data = l.dataInicio.slice(0, 10)
        const dataIniIso = fromBRDate(filtroDataIni)
        const dataFimIso = fromBRDate(filtroDataFim)
        if (dataIniIso && data < dataIniIso) return false
        if (dataFimIso && data > dataFimIso) return false
      }
      return true
    })
    // Extrato sempre do mais novo pro mais antigo, pro gestor ver o último lançamento primeiro.
    .sort((a, b) => {
      const diff = new Date(b.dataInicio ?? 0).getTime() - new Date(a.dataInicio ?? 0).getTime()
      return diff !== 0 ? diff : b.id - a.id
    })

  // Ranking usa saldo global (todo o histórico), sem aplicar os filtros do extrato — é sempre
  // "quanto cada um tem agora", não uma foto do período filtrado.
  const saldoPorFuncionario = useMemo(() => {
    const mapa = new Map<number, { funcionarioId: number; funcionario: string; saldo: number }>()
    for (const l of lancamentosAtivos) {
      if (!mapa.has(l.funcionarioId)) {
        mapa.set(l.funcionarioId, { funcionarioId: l.funcionarioId, funcionario: l.funcionario, saldo: l.saldoAcumulado })
      }
    }
    return Array.from(mapa.values()).sort((a, b) => b.saldo - a.saldo)
  }, [lancamentosAtivos])

  // Totalizadores do topo seguem o técnico/tipo/período selecionados no extrato — usam o
  // saldoAcumulado (já é o saldo GLOBAL correto até aquele ponto) do lançamento mais recente
  // de cada funcionário dentro do filtro, então o valor continua sendo o saldo real, só que
  // "como estava" na última movimentação visível com o filtro atual.
  const saldoTotal = useMemo(() => {
    const mapa = new Map<number, number>()
    for (const l of filtrados) {
      if (!mapa.has(l.funcionarioId)) mapa.set(l.funcionarioId, l.saldoAcumulado)
    }
    return Array.from(mapa.values()).reduce((s, v) => s + Math.max(0, v), 0)
  }, [filtrados])

  const horasExtrasPeriodo = filtrados
    .filter(l => l.tipo === 'Hora Extra')
    .reduce((s, l) => s + l.horas, 0)

  const horasPorKm = useMemo(() => {
    const doTipo = filtrados.filter(l => l.tipo === 'Horas por Km')
    return { horas: doTipo.reduce((s, l) => s + l.horas, 0), qtd: doTipo.length }
  }, [filtrados])

  const faltasEDescontos = useMemo(() => {
    const somaHoras = (tipo: TipoMovimentoBancoHoras) =>
      filtrados.filter(l => l.tipo === tipo).reduce((s, l) => s + l.horas, 0)
    return {
      comAtestado: somaHoras('Falta c/ Atestado'),
      semAtestado: somaHoras('Falta s/ Atestado'),
      descontos: somaHoras('Desconto de Horas Padrão'),
    }
  }, [filtrados])

  const handleSalvar = async () => {
    if (!form.funcionarioId || !form.tipo || !form.horas || !form.dataInicio || !form.dataFim || !form.observacao.trim()) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    try {
      const { id } = await api.createLancamentoBancoHoras({
        funcionarioId: Number(form.funcionarioId),
        tipo: form.tipo as TipoMovimentoBancoHoras,
        horas: Number(form.horas.replace(',', '.')),
        dataInicio: fromBRDate(form.dataInicio),
        dataFim: fromBRDate(form.dataFim),
        observacao: form.observacao,
      })
      if (anexoFiles.length > 0) {
        try {
          await api.uploadAnexos({ tabela: 'banco_de_horas', registroId: id, files: anexoFiles })
        } catch (e: any) {
          toast.error(e?.message || 'Lançamento salvo, mas falhou o envio dos anexos.')
        }
      }
      setShowModal(false)
      setForm({ funcionarioId: '', tipo: '', horas: '', dataInicio: '', dataFim: '', observacao: '' })
      setAnexoFiles([])
      toast.success('Lançamento registrado com sucesso!')
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registrar lançamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Banco de Horas</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Controle de horas extras e faltas da equipe</p>
        </div>
        {podeLancar && (
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Lançar Horas
          </button>
        )}
      </div>

      {/* KPIs — seguem o técnico/tipo/período selecionados no extrato abaixo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-500/10"><Clock className="w-5 h-5 text-blue-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Horas Devidas aos Técnicos</p>
            <p className="text-2xl font-bold text-emerald-400">{saldoTotal.toFixed(2)}h</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Horas Extras no Período</p>
            <p className="text-2xl font-bold text-emerald-400">{horasExtrasPeriodo.toFixed(2)}h</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-cyan-500/10"><Route className="w-5 h-5 text-cyan-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Horas por Km</p>
            <p className="text-2xl font-bold text-cyan-400">{horasPorKm.horas.toFixed(2)}h</p>
            <p className="text-[11px] text-slate-500">{horasPorKm.qtd} lançamento(s)</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-500/10"><AlertCircle className="w-5 h-5 text-amber-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Faltas e Descontos</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Com atestado <span className="font-bold text-amber-400">{faltasEDescontos.comAtestado.toFixed(2)}h</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Sem atestado <span className="font-bold text-red-400">{faltasEDescontos.semAtestado.toFixed(2)}h</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Desconto de horas <span className="font-bold text-slate-500">{faltasEDescontos.descontos.toFixed(2)}h</span>
            </p>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            aba === 'lancamentos' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
          onClick={() => setAba('lancamentos')}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            aba === 'ranking' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
          onClick={() => setAba('ranking')}
        >
          Ranking de Horas
        </button>
      </div>

      {aba === 'ranking' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['#', 'Técnico', 'Saldo Disponível'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saldoPorFuncionario.map((f, i) => (
                <tr key={f.funcionarioId} className="table-row">
                  <td className="table-cell text-slate-500 w-10">
                    {i === 0 ? <Trophy size={16} className="text-amber-400" /> : i + 1}
                  </td>
                  <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{f.funcionario}</td>
                  <td className="table-cell">
                    <span className={clsx('font-semibold', f.saldo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {f.saldo >= 0 ? '+' : ''}{f.saldo.toFixed(2)}h
                    </span>
                  </td>
                </tr>
              ))}
              {saldoPorFuncionario.length === 0 && (
                <tr><td colSpan={3} className="table-cell text-center py-8 text-slate-500">Nenhum lançamento encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'lancamentos' && (
      <>
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <SearchableSelect
            value={filtroFuncionario}
            onChange={setFiltroFuncionario}
            options={[{ value: '', label: 'Todos funcionários' }, ...funcionarioOptions]}
            placeholder="Todos funcionários"
            searchPlaceholder="Buscar funcionário..."
          />
        </div>
        <select className="input-field max-w-[200px]" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">De</label>
          <DateInput mode="br" value={filtroDataIni} onChange={setFiltroDataIni} />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Até</label>
          <DateInput mode="br" value={filtroDataFim} onChange={setFiltroDataFim} />
        </div>
        <button
          type="button"
          className="btn-secondary !py-2 text-xs"
          onClick={() => { const m = mesAtualBR(); setFiltroDataIni(m.ini); setFiltroDataFim(m.fim) }}
        >
          Mês atual
        </button>
        <button
          type="button"
          className="btn-secondary !py-2 text-xs"
          onClick={() => { setFiltroDataIni(''); setFiltroDataFim('') }}
        >
          Limpar período
        </button>
      </div>

      {/* Tabela */}
      {loadingLista ? (
        <div className="flex items-center justify-center h-40 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando...
        </div>
      ) : (
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Funcionário', 'Tipo', 'Horas', 'Data Início', 'Data Fim', 'Saldo Acumulado', 'Observação', ''].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(l => (
              <tr key={l.id} className="table-row relative">
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{l.funcionario}</td>
                <td className="table-cell whitespace-nowrap">
                  <span className={`badge text-xs ${tipoCor[l.tipo]}`}>{l.tipo}</span>
                </td>
                <td className="table-cell whitespace-nowrap">
                  <span className={l.tipoMov === 'C' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {l.tipoMov === 'C' ? '+' : '-'}{l.horas}h
                  </span>
                </td>
                <td className="table-cell text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(l.dataInicio)}</td>
                <td className="table-cell text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(l.dataFim)}</td>
                <td className="table-cell whitespace-nowrap">
                  <span className={clsx('font-semibold', l.saldoAcumulado >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {l.saldoAcumulado >= 0 ? '+' : ''}{l.saldoAcumulado.toFixed(2)}h
                  </span>
                </td>
                <td className="table-cell text-slate-500 italic max-w-[220px] truncate" title={l.observacao ?? undefined}>{l.observacao || '—'}</td>
                <td className="table-cell text-right relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuAberto(prev => prev === l.id ? null : l.id) }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-500/10"
                    title="Mais opções"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuAberto === l.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-2 top-full mt-1 z-20 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg text-left p-3 space-y-2"
                    >
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Lançado por <span className="text-slate-700 dark:text-slate-200 font-medium">{l.lancadoPor || '—'}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Lançado em <span className="text-slate-700 dark:text-slate-200 font-medium">{formatDateTime(l.dataLancamento)}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => { setAnexosDe(l); setMenuAberto(null) }}
                        className={clsx(
                          'flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg w-full',
                          l.qtdAnexos > 0
                            ? 'text-emerald-500 hover:bg-emerald-500/10'
                            : 'text-slate-500 hover:bg-slate-500/10'
                        )}
                      >
                        <Paperclip size={13} />
                        {l.qtdAnexos > 0 ? `${l.qtdAnexos} arquivo(s) anexado(s)` : 'Nenhum arquivo — anexar'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center py-8 text-slate-500">Nenhum lançamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      </>
      )}

      {/* Modal Lançar */}
      {showModal && podeLancar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="card max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lançar Horas</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-800 dark:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Funcionário *</label>
                <SearchableSelect
                  value={form.funcionarioId}
                  onChange={(v) => setForm(p => ({ ...p, funcionarioId: v }))}
                  options={funcionarioOptions}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar funcionário..."
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Tipo *</label>
                <select className="input-field" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoMovimentoBancoHoras }))}>
                  <option value="">Selecione...</option>
                  {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Início *</label>
                  <DateInput mode="br" value={form.dataInicio} onChange={(value) => setForm(p => ({ ...p, dataInicio: value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Fim *</label>
                  <DateInput mode="br" value={form.dataFim} onChange={(value) => setForm(p => ({ ...p, dataFim: value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Quantidade de Horas *</label>
                <input type="text" inputMode="decimal" className="input-field" placeholder="Ex: 4 ou 2,5" value={form.horas} onChange={e => setForm(p => ({ ...p, horas: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Observação *</label>
                <textarea className="input-field resize-none h-20" placeholder="Motivo ou detalhes..." value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Anexar arquivos (opcional)</label>
                <input
                  ref={anexoInputRef}
                  type="file"
                  multiple
                  onChange={e => setAnexoFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-200"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSalvar} disabled={loading} className="btn-primary flex-1 justify-center disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar Lançamento'}
              </button>
              <button onClick={() => { setShowModal(false); setAnexoFiles([]) }} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Anexos */}
      {anexosDe && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setAnexosDe(null)}>
          <div className="card max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Arquivos Anexados — {anexosDe.funcionario}
              </h3>
              <button onClick={() => setAnexosDe(null)} className="text-slate-400 hover:text-slate-800 dark:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <Anexos
              tabela="banco_de_horas"
              registroId={anexosDe.id}
              title="Arquivos Anexados"
              emptyLabel="Nenhum arquivo anexado."
              className="border-0 p-0"
            />
          </div>
        </div>
      )}
    </div>
  )
}
