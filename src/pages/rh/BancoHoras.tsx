import { useState } from 'react'
import { Clock, Plus, X, Loader2, TrendingUp, Calendar, AlertCircle } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import clsx from 'clsx'

type TipoMovimento = 'Hora Extra' | 'Falta c/ Atestado' | 'Falta s/ Atestado' | 'Home Office'

interface Lancamento {
  id: number
  funcionario: string
  tipo: TipoMovimento
  horas: number
  dataInicio: string
  dataFim: string
  saldoAtual: number
  observacao?: string
}

const mockLancamentos: Lancamento[] = [
  { id: 1, funcionario: 'Carlos Silva', tipo: 'Hora Extra', horas: 4, dataInicio: '2026-03-10', dataFim: '2026-03-10', saldoAtual: 12, observacao: 'Atendimento emergencial cliente' },
  { id: 2, funcionario: 'Ana Rodrigues', tipo: 'Home Office', horas: 8, dataInicio: '2026-03-11', dataFim: '2026-03-11', saldoAtual: -8, observacao: '' },
  { id: 3, funcionario: 'Pedro Alves', tipo: 'Hora Extra', horas: 6, dataInicio: '2026-03-12', dataFim: '2026-03-12', saldoAtual: 20, observacao: 'Deploy sistema' },
  { id: 4, funcionario: 'Mariana Costa', tipo: 'Falta c/ Atestado', horas: 8, dataInicio: '2026-03-13', dataFim: '2026-03-13', saldoAtual: 2, observacao: 'Atestado médico' },
  { id: 5, funcionario: 'Roberto Melo', tipo: 'Falta s/ Atestado', horas: 8, dataInicio: '2026-03-14', dataFim: '2026-03-14', saldoAtual: -16, observacao: '' },
  { id: 6, funcionario: 'Carlos Silva', tipo: 'Hora Extra', horas: 3, dataInicio: '2026-03-15', dataFim: '2026-03-15', saldoAtual: 15, observacao: 'Suporte fora de hora' },
]

const funcionarios = ['Carlos Silva', 'Ana Rodrigues', 'Pedro Alves', 'Mariana Costa', 'Roberto Melo']
const tipos: TipoMovimento[] = ['Hora Extra', 'Falta c/ Atestado', 'Falta s/ Atestado', 'Home Office']

const tipoCor: Record<TipoMovimento, string> = {
  'Hora Extra': 'bg-emerald-500/20 text-emerald-400',
  'Falta c/ Atestado': 'bg-amber-500/20 text-amber-400',
  'Falta s/ Atestado': 'bg-red-500/20 text-red-400',
  'Home Office': 'bg-blue-500/20 text-blue-400',
}

export function BancoHoras() {
  const { toast } = useToast()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(mockLancamentos)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    funcionario: '',
    tipo: '' as TipoMovimento | '',
    horas: '',
    dataInicio: '',
    dataFim: '',
    observacao: '',
  })

  const filtrados = lancamentos.filter(l =>
    (!filtroFuncionario || l.funcionario === filtroFuncionario) &&
    (!filtroTipo || l.tipo === filtroTipo)
  )

  const saldoTotal = lancamentos.reduce((s, l) => {
    return s + (l.tipo === 'Hora Extra' ? l.horas : -l.horas)
  }, 0)

  const horasExtras = lancamentos
    .filter(l => l.tipo === 'Hora Extra' && l.dataInicio.startsWith('2026-03'))
    .reduce((s, l) => s + l.horas, 0)

  const faltasPendentes = lancamentos
    .filter(l => l.tipo === 'Falta s/ Atestado')
    .length

  const handleSalvar = async () => {
    if (!form.funcionario || !form.tipo || !form.horas || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      const novo: Lancamento = {
        id: Date.now(),
        funcionario: form.funcionario,
        tipo: form.tipo as TipoMovimento,
        horas: Number(form.horas),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        saldoAtual: saldoTotal + (form.tipo === 'Hora Extra' ? Number(form.horas) : -Number(form.horas)),
        observacao: form.observacao,
      }
      setLancamentos(prev => [novo, ...prev])
      setShowModal(false)
      setForm({ funcionario: '', tipo: '', horas: '', dataInicio: '', dataFim: '', observacao: '' })
      toast.success('Lançamento registrado com sucesso!')
    } catch {
      toast.error('Erro ao registrar lançamento.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (s: string) => s.split('-').reverse().join('/')

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
              {saldoTotal >= 0 ? '+' : ''}{saldoTotal}h
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Horas Extras do Mês</p>
            <p className="text-2xl font-bold text-emerald-400">{horasExtras}h</p>
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
        <select className="input-field max-w-[200px]" value={filtroFuncionario} onChange={e => setFiltroFuncionario(e.target.value)}>
          <option value="">Todos funcionários</option>
          {funcionarios.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="input-field max-w-[200px]" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Funcionário', 'Tipo', 'Horas', 'Data Início', 'Data Fim', 'Saldo Atual', 'Observação'].map(h => (
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
                  <span className={l.tipo === 'Hora Extra' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {l.tipo === 'Hora Extra' ? '+' : '-'}{l.horas}h
                  </span>
                </td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(l.dataInicio)}</td>
                <td className="table-cell text-slate-600 dark:text-slate-400">{formatDate(l.dataFim)}</td>
                <td className="table-cell">
                  <span className={clsx('font-semibold', l.saldoAtual >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {l.saldoAtual >= 0 ? '+' : ''}{l.saldoAtual}h
                  </span>
                </td>
                <td className="table-cell text-slate-500 italic">{l.observacao || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                <select className="input-field" value={form.funcionario} onChange={e => setForm(p => ({ ...p, funcionario: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Tipo *</label>
                <select className="input-field" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoMovimento }))}>
                  <option value="">Selecione...</option>
                  {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Início *</label>
                  <input type="date" className="input-field" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Data Fim *</label>
                  <input type="date" className="input-field" value={form.dataFim} onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Quantidade de Horas *</label>
                <input type="number" min="1" max="24" className="input-field" placeholder="Ex: 4" value={form.horas} onChange={e => setForm(p => ({ ...p, horas: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Observação</label>
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
