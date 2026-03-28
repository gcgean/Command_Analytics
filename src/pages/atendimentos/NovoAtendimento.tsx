import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, Calendar } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { api } from '../../services/api'
import type { AgendaItem } from '../../types'
import clsx from 'clsx'

const tabs = ['Dados', 'Tipo', 'Agendamentos']

const tipoContatoOptions = [
  { value: 'WhatsApp', label: '💬 WhatsApp' },
  { value: 'Telefone', label: '📞 Telefone' },
  { value: 'E-mail', label: '📧 E-mail' },
  { value: 'Presencial', label: '🤝 Presencial' },
  { value: 'Outras Mídias', label: '📱 Outras Mídias' },
]

const departamentoOptions = [
  'Suporte', 'Fiscal', 'Financeiro', 'Comercial', 'Certificado', 'CS', 'Instalação', 'Treinamento', 'Técnico'
].map(d => ({ value: d, label: d }))

const prioridadeOptions = [
  { value: 'Baixa', label: 'Baixa' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Alta', label: 'Alta' },
  { value: 'Urgente', label: 'Urgente' },
]

export function NovoAtendimento() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tecnicoOptions, setTecnicoOptions] = useState<{ value: string; label: string }[]>([])
  const [agendaList, setAgendaList] = useState<AgendaItem[]>([])

  const [form, setForm] = useState({
    clienteId: '',
    tecnicoId: '',
    data: new Date().toISOString().slice(0, 16),
    tipoContato: 'WhatsApp',
    observacoes: '',
    solucao: '',
    departamento: 'Suporte',
    prioridade: 'Normal',
    bugSistema: false,
    foraHorario: false,
  })

  useEffect(() => {
    api.getUsuarios().then((usrs: any) => {
      setTecnicoOptions((Array.isArray(usrs) ? usrs : []).map((u: any) => ({ value: String(u.id), label: u.nome ?? u.nomeCompleto ?? u.nomeUsu ?? `#${u.id}` })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.clienteId) { setAgendaList([]); return }
    api.getAgenda({ clienteId: form.clienteId }).then((d: any) => setAgendaList(Array.isArray(d) ? d : [])).catch(() => {})
  }, [form.clienteId])

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!form.clienteId || !form.tecnicoId) return
    setSaving(true)
    try {
      await api.createAtendimento({
        clienteId: Number(form.clienteId),
        tecnicoId: Number(form.tecnicoId),
        tipoContato: form.tipoContato as never,
        departamento: form.departamento as never,
        prioridade: form.prioridade as never,
        observacoes: form.observacoes,
        solucao: form.solucao || undefined,
        bugSistema: form.bugSistema,
        foraHorario: form.foraHorario,
        status: 1,
      })
      setSaved(true)
      setTimeout(() => navigate('/atendimentos'), 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/atendimentos')}>
          Voltar
        </Button>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Novo Atendimento</h2>
      </div>

      {saved && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-400">
          Atendimento salvo com sucesso! Redirecionando...
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              i === activeTab
                ? 'text-blue-400 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-800 dark:text-slate-200'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 0: Dados */}
      {activeTab === 0 && (
        <Card>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Cliente"
                options={clienteOptions}
                placeholder="Selecione o cliente"
                value={form.clienteId}
                onChange={e => handleChange('clienteId', e.target.value)}
              />
              <Select
                label="Técnico Responsável"
                options={tecnicoOptions}
                placeholder="Selecione o técnico"
                value={form.tecnicoId}
                onChange={e => handleChange('tecnicoId', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Data e Hora de Abertura"
                type="datetime-local"
                value={form.data}
                onChange={e => handleChange('data', e.target.value)}
              />
              <Select
                label="Tipo de Contato"
                options={tipoContatoOptions}
                value={form.tipoContato}
                onChange={e => handleChange('tipoContato', e.target.value)}
              />
            </div>
            <Textarea
              label="Observações / Descrição do Problema"
              placeholder="Descreva detalhadamente o problema relatado pelo cliente..."
              rows={5}
              value={form.observacoes}
              onChange={e => handleChange('observacoes', e.target.value)}
            />
            <Textarea
              label="Solução Aplicada"
              placeholder="Descreva a solução aplicada (se já resolvido)..."
              rows={3}
              value={form.solucao}
              onChange={e => handleChange('solucao', e.target.value)}
            />
          </div>
        </Card>
      )}

      {/* Tab 1: Tipo */}
      {activeTab === 1 && (
        <Card>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Departamento"
                options={departamentoOptions}
                value={form.departamento}
                onChange={e => handleChange('departamento', e.target.value)}
              />
              <Select
                label="Prioridade"
                options={prioridadeOptions}
                value={form.prioridade}
                onChange={e => handleChange('prioridade', e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Características</p>
              <label className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={form.bugSistema}
                  onChange={e => handleChange('bugSistema', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Bug de Sistema</p>
                  <p className="text-xs text-slate-500">Marque se o problema é um bug no software</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={form.foraHorario}
                  onChange={e => handleChange('foraHorario', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Fora do Horário Comercial</p>
                  <p className="text-xs text-slate-500">Atendimento realizado fora do horário padrão</p>
                </div>
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Agendamentos */}
      {activeTab === 2 && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Agendamentos do Cliente</p>
              <Button size="sm" variant="secondary" icon={<Calendar className="w-3.5 h-3.5" />}>
                Novo Agendamento
              </Button>
            </div>
            {!form.clienteId ? (
              <div className="text-center py-8 text-slate-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Selecione um cliente na aba "Dados" para ver agendamentos.</p>
              </div>
            ) : agendaList.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum agendamento vinculado a este cliente.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {agendaList.map(a => (
                  <div key={a.id} className="flex items-center gap-4 p-3 bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                    <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.tipo}</p>
                      <p className="text-xs text-slate-500">{new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {a.horario} · {a.tecnicoNome}</p>
                    </div>
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      a.status === 'Aguardando' ? 'bg-amber-500/20 text-amber-400' :
                      a.status === 'Finalizado' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-red-500/20 text-red-400'
                    )}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/atendimentos')}>
          Cancelar
        </Button>
        <div className="flex gap-3">
          {activeTab < 2 && (
            <Button variant="secondary" onClick={() => setActiveTab(t => t + 1)}>
              Próxima aba
            </Button>
          )}
          <Button
            icon={<Save className="w-4 h-4" />}
            loading={loading}
            onClick={handleSave}
          >
            Salvar Atendimento
          </Button>
        </div>
      </div>
    </div>
  )
}
