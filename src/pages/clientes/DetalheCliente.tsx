import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, Phone, Mail, MapPin, Package, Headphones, DollarSign, Cpu, GitBranch, Shield, AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { api } from '../../services/api'
import type { Cliente, Atendimento, Assinatura, StatusAtendimento } from '../../types'
import clsx from 'clsx'

const tabs = [
  { label: 'Dados', icon: <Building2 className="w-4 h-4" /> },
  { label: 'Planos', icon: <Package className="w-4 h-4" /> },
  { label: 'Atendimentos', icon: <Headphones className="w-4 h-4" /> },
  { label: 'Financeiro', icon: <DollarSign className="w-4 h-4" /> },
  { label: 'Técnico', icon: <Cpu className="w-4 h-4" /> },
  { label: 'Implantação', icon: <GitBranch className="w-4 h-4" /> },
]

const curvaColors: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-amber-500/20 text-amber-400',
  C: 'bg-red-500/20 text-red-400',
}

function getClienteStatus(c: Cliente): string {
  if (c.ativo === 'N') return 'Inativo'
  if (c.bloqueado === 'S') return 'Bloqueado'
  return 'Ativo'
}

type ClienteDetalhe = Cliente & { atendimentos?: Atendimento[]; assinaturas?: Assinatura[] }

export function DetalheCliente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState<ClienteDetalhe | undefined>()
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getClienteById(Number(id)).then((c: any) => {
      setCliente(c as ClienteDetalhe)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400">
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
  const clienteAssinaturas = cliente.assinaturas ?? []

  const statusLabel = getClienteStatus(cliente)
  const curvaKey = cliente.curvaABC ?? ''

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/clientes')}>
          Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-100">{cliente.nome ?? '—'}</h2>
            {curvaKey && (
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', curvaColors[curvaKey] ?? '')}>
                Curva {curvaKey}
              </span>
            )}
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              statusLabel === 'Ativo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            )}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">#{cliente.id} · {cliente.cnpj ?? '—'}</p>
        </div>
        <Button variant="secondary">Editar Cliente</Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              i === activeTab
                ? 'text-blue-400 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 0: Dados */}
      {activeTab === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" /> Dados Cadastrais
            </h3>
            <dl className="space-y-3">
              {[
                { label: 'Razão Social', value: cliente.nomeRazao ?? cliente.nome ?? '—' },
                { label: 'CNPJ', value: cliente.cnpj ?? '—' },
                { label: 'Segmento', value: cliente.idSegmento ? `Segmento ${cliente.idSegmento}` : '—' },
                { label: 'Regime Tributário', value: cliente.idRegime ? `Regime ${cliente.idRegime}` : '—' },
                { label: 'Data Contrato', value: cliente.dataContrato ? new Date(cliente.dataContrato).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—' },
                { label: 'Responsável', value: cliente.responsavel ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-300 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" /> Contato
            </h3>
            <dl className="space-y-3">
              {[
                { label: 'Cidade/UF', value: `${cliente.cidade ?? '—'}/${cliente.uf ?? '—'}` },
                { label: 'Telefone', value: cliente.telefone ?? '—' },
                { label: 'E-mail', value: cliente.email ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-300 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {/* Tab 1: Planos */}
      {activeTab === 1 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Plano Contratado</h3>
          <div className="p-4 bg-slate-900 rounded-xl border border-blue-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-100">
                  {cliente.idPlano ? `Plano ${cliente.idPlano}` : '—'}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Vigência desde {cliente.dataContrato ? new Date(cliente.dataContrato).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-400">
                  R$ {Number(cliente.mensalidade ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500">por mês</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Atendimentos */}
      {activeTab === 2 && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-700">
            <p className="text-sm font-semibold text-slate-100">{clienteAtendimentos.length} atendimento(s) no histórico</p>
          </div>
          <div className="divide-y divide-slate-700">
            {clienteAtendimentos.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-4">
                <span className="font-mono text-xs text-blue-400 mt-0.5">#{a.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 line-clamp-1">{a.observacoes ?? '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {a.tecnicoNome} · Depto {a.departamento ?? '—'} · {a.dataAbertura ? new Date(a.dataAbertura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <StatusBadge status={a.status as StatusAtendimento} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 3: Financeiro */}
      {activeTab === 3 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Assinaturas</h3>
          {clienteAssinaturas.map(a => (
            <div key={a.id} className="p-4 bg-slate-900 rounded-xl border border-slate-700">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-100">{a.planoNome}</p>
                  <p className="text-sm text-slate-400 mt-1">{a.formaPagamento} · Vencimento dia {a.vencimento}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-400">R$ {a.valor.toLocaleString('pt-BR')}</p>
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded-full',
                    a.status === 'Ativa' ? 'bg-emerald-500/20 text-emerald-400' :
                    a.status === 'Suspensa' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-600/40 text-slate-500'
                  )}>
                    {a.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Tab 4: Técnico */}
      {activeTab === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Dados do Sistema</h3>
            <dl className="space-y-3">
              {[
                { label: 'Versão do Sistema', value: '—' },
                { label: 'Conexões Ativas', value: '—' },
                { label: 'Caixas (PDV)', value: '—' },
                { label: 'Último Backup', value: '—' },
                { label: 'Último FTP', value: '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs font-medium text-slate-300 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" /> Certificado Digital
            </h3>
            <p className="text-sm text-slate-500">Certificado não cadastrado.</p>
          </Card>
        </div>
      )}

      {/* Tab 5: Implantação */}
      {activeTab === 5 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Status da Implantação</h3>
          <p className="text-sm text-slate-400">Acompanhe o status do processo de implantação completo na tela Pipeline de Implantação.</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/implantacao')}>
            Ver Pipeline
          </Button>
        </Card>
      )}
    </div>
  )
}
