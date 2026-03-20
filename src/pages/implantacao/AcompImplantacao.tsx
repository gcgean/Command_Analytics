import { useState } from 'react'
import { CheckCircle, Circle, Loader2, ChevronRight, MessageSquare } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import clsx from 'clsx'

const etapas = [
  { id: 1, label: 'Aguardando Instalação' },
  { id: 2, label: 'Em Instalação' },
  { id: 3, label: 'Agendar Treinamento' },
  { id: 4, label: 'Reagendar Treinamento' },
  { id: 5, label: 'Treinamento Concluído' },
  { id: 6, label: 'Retorno CS' },
  { id: 7, label: 'Concluído' },
  { id: 8, label: 'Teste Demo' },
  { id: 9, label: 'Pós-venda' },
  { id: 10, label: 'Desistência' },
  { id: 11, label: 'Aguardando Cliente p/ Instalação' },
  { id: 12, label: 'Aguardando Migração' },
  { id: 13, label: 'Primeiro Treinamento' },
  { id: 14, label: 'Segundo Treinamento' },
  { id: 15, label: 'Em Migração' },
  { id: 16, label: 'Conferência de Migração' },
]

const etapasFluxo = [1, 2, 3, 5, 6, 7]

interface ClienteDemo {
  nome: string
  etapaAtual: number
  responsavel: string
  dataEntrada: string
  observacoes: string[]
}

const clienteDemo: ClienteDemo = {
  nome: 'Supermercado Novo Horizonte',
  etapaAtual: 3,
  responsavel: 'Ana Rodrigues',
  dataEntrada: '2026-03-10',
  observacoes: [
    '10/03/2026 — Contrato assinado. Iniciando processo de implantação.',
    '12/03/2026 — Instalação concluída com sucesso. Aguardando agendamento de treinamento.',
    '14/03/2026 — Cliente solicitou treinamento para semana que vem.',
  ],
}

export function AcompImplantacao() {
  const { toast } = useToast()
  const [cliente, setCliente] = useState<ClienteDemo>(clienteDemo)
  const [novaObs, setNovaObs] = useState('')
  const [loading, setLoading] = useState(false)

  const etapaObj = etapas.find(e => e.id === cliente.etapaAtual)
  const proximaEtapa = etapasFluxo[etapasFluxo.indexOf(cliente.etapaAtual) + 1]

  const handleAvancar = async () => {
    if (!proximaEtapa) {
      toast.info('Implantação já está na última etapa do fluxo principal.')
      return
    }
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      const etapaNome = etapas.find(e => e.id === proximaEtapa)?.label || ''
      setCliente(prev => ({
        ...prev,
        etapaAtual: proximaEtapa,
        observacoes: [...prev.observacoes, `${new Date().toLocaleDateString('pt-BR')} — Etapa avançada para: ${etapaNome}`],
      }))
      toast.success(`Etapa avançada para: ${etapaNome}`)
    } catch {
      toast.error('Erro ao avançar etapa.')
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarObs = async () => {
    if (!novaObs.trim()) return
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 500))
      setCliente(prev => ({
        ...prev,
        observacoes: [...prev.observacoes, `${new Date().toLocaleDateString('pt-BR')} — ${novaObs.trim()}`],
      }))
      setNovaObs('')
      toast.success('Observação adicionada!')
    } catch {
      toast.error('Erro ao salvar observação.')
    } finally {
      setLoading(false)
    }
  }

  const indexAtual = etapas.findIndex(e => e.id === cliente.etapaAtual)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Acompanhamento de Implantação</h1>
          <p className="text-slate-400 text-sm mt-1">
            {cliente.nome} · Responsável: {cliente.responsavel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {etapaObj?.label}
          </span>
          {proximaEtapa && (
            <button onClick={handleAvancar} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Avançando...</>
                : <><ChevronRight size={15} /> Avançar Etapa</>}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 card">
          <h3 className="text-sm font-semibold text-slate-200 mb-5">Timeline das Etapas</h3>
          <div className="space-y-1">
            {etapas.map((etapa, i) => {
              const concluida = i < indexAtual
              const atual = i === indexAtual
              const futura = i > indexAtual
              return (
                <div key={etapa.id} className="flex items-start gap-3">
                  {/* Ícone */}
                  <div className="flex flex-col items-center">
                    <div className={clsx(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                      concluida && 'bg-emerald-500/20',
                      atual && 'bg-blue-600 ring-4 ring-blue-500/30',
                      futura && 'bg-slate-800 border border-slate-700'
                    )}>
                      {concluida
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : atual
                          ? <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                          : <Circle className="w-4 h-4 text-slate-600" />}
                    </div>
                    {i < etapas.length - 1 && (
                      <div className={clsx('w-0.5 h-6 mt-1', concluida ? 'bg-emerald-500/30' : 'bg-slate-700')} />
                    )}
                  </div>
                  {/* Label */}
                  <div className="pb-1 pt-1">
                    <p className={clsx(
                      'text-sm font-medium',
                      concluida && 'text-emerald-400',
                      atual && 'text-blue-300 font-semibold',
                      futura && 'text-slate-500'
                    )}>
                      {etapa.id}. {etapa.label}
                      {atual && <span className="ml-2 text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Etapa atual</span>}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-4">
          <div className="card flex-1">
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              Observações
            </h3>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {cliente.observacoes.map((obs, i) => (
                <div key={i} className="text-xs text-slate-400 bg-slate-900 rounded-lg p-3 border border-slate-700">
                  {obs}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Nova Observação</h3>
            <textarea
              className="input-field resize-none h-24 text-sm"
              placeholder="Digite uma observação..."
              value={novaObs}
              onChange={e => setNovaObs(e.target.value)}
            />
            <button onClick={handleSalvarObs} disabled={loading || !novaObs.trim()} className="btn-primary mt-3 w-full justify-center disabled:opacity-60">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Adicionar Observação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
