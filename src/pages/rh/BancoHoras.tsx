import { useEffect, useMemo, useState } from 'react'
import { Clock, Plus, X, Loader2, TrendingUp, AlertCircle } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import { DateInput } from '../../components/ui/DateInput'
import { api } from '../../services/api'
import clsx from 'clsx'
import type { LancamentoBancoHoras, TipoMovimentoBancoHoras, Usuario } from '../../types'

const tipos: TipoMovimentoBancoHoras[] = ['Hora Extra', 'Falta c/ Atestado', 'Falta s/ Atestado', 'Home Office', 'Desconto de Horas Padrão']

const tipoCor: Record<TipoMovimentoBancoHoras, string> = {
  'Hora Extra': 'bg-emerald-500/20 text-emerald-400',
  'Falta c/ Atestado': 'bg-amber-500/20 text-amber-400',
  'Falta s/ Atestado': 'bg-red-500/20 text-red-400',
  'Home Office': 'bg-blue-500/20 text-blue-400',
  'Desconto de Horas Padrão': 'bg-slate-500/20 text-slate-400',
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

export function BancoHoras() {
  const { toast } = useToast()
  const [lancamentos, setLancamentos] = useState<LancamentoBancoHoras[]>([])
  const [funcionarios, setFuncionarios] = useState<Usuario[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
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

  const carregar = () => {
    setLoadingLista(true)
    api.getBancoHoras()
      .then(setLancamentos)
      .catch(() => toast.error('Falha ao carregar o banco de horas.'))
      .finally(() => setLoadingLista(false))
  }

  useEffect(() => {
    carregar()
    api.getUsuarios().then(setFuncionarios).catch(() => setFuncionarios([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = lancamentos.filter(l =>
    (!filtroFuncionario || String(l.funcionarioId) === filtroFuncionario) &&
    (!filtroTipo || l.tipo === filtroTipo)
  )

  const saldoTotal = useMemo(() => {
    // Saldo por funcionário (último saldoAcumulado de cada um), somado — evita contar
    // deltas de funcionários diferentes fora de ordem.
    const ultimoPorFuncionario = new Map<number, number>()
    for (const l of lancamentos) {
      if (!ultimoPorFuncionario.has(l.funcionarioId)) ultimoPorFuncionario.set(l.funcionarioId, l.saldoAcumulado)
    }
    return Array.from(ultimoPorFuncionario.values()).reduce((s, v) => s + v, 0)
  }, [lancamentos])

  const hoje = new Date()
  const horasExtrasMes = lancamentos
    .filter(l => l.tipo === 'Hora Extra' && l.dataInicio && new Date(l.dataInicio).getMonth() === hoje.getMonth() && new Date(l.dataInicio).getFullYear() === hoje.getFullYear())
    .reduce((s, l) => s + l.horas, 0)

  const faltasPendentes = lancamentos.filter(l => l.tipo === 'Falta s/ Atestado').length

  const handleSalvar = async () => {
    if (!form.funcionarioId || !form.tipo || !form.horas || !form.dataInicio || !form.dataFim || !form.observacao.trim()) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    try {
      await api.createLancamentoBancoHoras({
        funcionarioId: Number(form.funcionarioId),
        tipo: form.tipo as TipoMovimentoBancoHoras,
        horas: Number(form.horas.replace(',', '.')),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        observacao: form.observacao,
      })
      setShowModal(false)
      setForm({ funcionarioId: '', tipo: '', horas: '', dataInicio: '', dataFim: '', observacao: '' })
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
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Lançar Horas
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-500/10"><Clock className="w-5 h-5 text-blue-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Saldo Total de Horas</p>
            <p className={clsx('text-2xl font-bold', saldoTotal >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {saldoTotal >= 0 ? '+' : ''}{saldoTotal.toFixed(2)}h
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Horas Extras do Mês</p>
            <p className="text-2xl font-bold text-emerald-400">{horasExtrasMes.toFixed(2)}h</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-500/10"><AlertCircle className="w-5 h-5 text-amber-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Faltas Pendentes</p>
            <p className="text-2xl font-bold text-amber-400">{faltasPendentes}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select className="input-field max-w-[220px]" value={filtroFuncionario} onChange={e => setFiltroFuncionario(e.target.value)}>
          <option value="">Todos funcionários</option>
          {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select className="input-field max-w-[200px]" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
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
              {['Funcionário', 'Tipo', 'Horas', 'Data Início', 'Data Fim', 'Saldo Acumulado', 'Lançado por', 'Observação'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(l => (
              <tr key={l.id} className="table-row">
                <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{l.funcionario}</td>
                <td className="table-cell">
                  <span className={`badge text-xs ${tipoCor[l.tipo]}`}>{l.tipo}</span>
                </td>
                <td className="table-cell">
                  <span className={l.tipoMov === 'C' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {l.tipoMov === 'C' ? '+' : '-'}{l.horas}h
                  </span>
                </td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(l.dataInicio)}</td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(l.dataFim)}</td>
                <td className="table-cell">
                  <span className={clsx('font-semibold', l.saldoAcumulado >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {l.saldoAcumulado >= 0 ? '+' : ''}{l.saldoAcumulado.toFixed(2)}h
                  </span>
                </td>
                <td className="table-cell text-slate-500">{l.lancadoPor || '—'}</td>
                <td className="table-cell text-slate-500 italic">{l.observacao || '—'}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center py-8 text-slate-500">Nenhum lançamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Modal Lançar */}
      {showModal && (
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
                <select className="input-field" value={form.funcionarioId} onChange={e => setForm(p => ({ ...p, funcionarioId: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
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
                  <DateInput mode="iso" value={form.dataInicio} onChange={(value) => setForm(p => ({ ...p, dataInicio: value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Fim *</label>
                  <DateInput mode="iso" value={form.dataFim} onChange={(value) => setForm(p => ({ ...p, dataFim: value }))} />
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
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSalvar} disabled={loading} className="btn-primary flex-1 justify-center disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar Lançamento'}
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
