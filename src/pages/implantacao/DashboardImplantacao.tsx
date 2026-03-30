import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCcw, UserX, Users } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import type { ImplantacaoPainel } from '../../types'

function formatCidadeUf(cidade?: string | null, uf?: string | null) {
  if (cidade && uf) return `${cidade}/${uf}`
  return cidade || uf || '—'
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

function formatTempoDesde(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const dias = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  if (dias < 30) return `${dias} dias`
  if (dias < 365) return `${Math.floor(dias / 30)} meses`
  const anos = dias / 365
  return `${anos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} anos`
}

function getNomeDestaque(cliente: any) {
  const fantasia = String(cliente?.nomeFantasia || '').trim()
  const razao = String(cliente?.clienteNome || '').trim()
  return fantasia || razao || 'Cliente sem nome'
}

function getNomeSecundario(cliente: any) {
  const fantasia = String(cliente?.nomeFantasia || '').trim()
  const razao = String(cliente?.clienteNome || '').trim()
  if (!fantasia) return ''
  if (!razao || fantasia.toLowerCase() === razao.toLowerCase()) return ''
  return razao
}

export function DashboardImplantacao() {
  const [loading, setLoading] = useState(true)
  const [painel, setPainel] = useState<ImplantacaoPainel | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.getImplantacaoPainel()
      setPainel(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const resumo = useMemo(() => {
    const clientes = painel?.clientes || []
    const etapas = painel?.etapas || []

    const semResponsavel = clientes.filter((c) => !c.responsavelId).length
    const progressoMedioChecklist = clientes.length
      ? Math.round(clientes.reduce((acc, c) => acc + (c.progressoChecklist || 0), 0) / clientes.length)
      : 0
    const tempoMedioEtapa = clientes.length
      ? Math.round(clientes.reduce((acc, c) => acc + (c.diasNaEtapa || 0), 0) / clientes.length)
      : 0

    const etapasGargalo = etapas
      .map((etapa) => ({
        ...etapa,
        quantidade: etapa.quantidade || 0,
      }))
      .sort((a, b) => (b.quantidade || 0) - (a.quantidade || 0))
      .slice(0, 6)

    const responsaveis = new Map<string, { nome: string; total: number }>()
    clientes.forEach((cliente) => {
      const nome = cliente.responsavelNome || 'Sem responsável'
      if (!responsaveis.has(nome)) {
        responsaveis.set(nome, { nome, total: 0 })
      }
      const item = responsaveis.get(nome)!
      item.total += 1
    })
    const cargaPorResponsavel = Array.from(responsaveis.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const isPago = (cliente: any) => String(cliente.statusPrimeiroPgto || '').toUpperCase() === 'PAGOU'
    const clientesCriticos = clientes
      .filter((cliente) => isPago(cliente))
      .map((cliente) => {
        const status = Number(cliente.statusInstal || 0)
        const criterios: string[] = []

        if ([1, 11].includes(status)) {
          criterios.push('Pagou e está aguardando implantação')
        }
        if ([12, 15, 16].includes(status)) {
          criterios.push('Pagou e está na etapa de migração')
        }
        if ([1, 2, 3, 4, 11, 12, 15, 16].includes(status)) {
          criterios.push('Pagou e ainda não recebeu o 1º treinamento')
        }
        if ([1, 2, 3, 4, 11, 12, 13, 15, 16].includes(status)) {
          criterios.push('Pagou e ainda não recebeu o 2º treinamento')
        }

        return { ...cliente, criterios }
      })
      .filter((cliente) => cliente.criterios.length > 0)
      .sort((a, b) => {
        const byQtdCriterios = b.criterios.length - a.criterios.length
        if (byQtdCriterios !== 0) return byQtdCriterios
        return (b.diasNaEtapa || 0) - (a.diasNaEtapa || 0)
      })
      .slice(0, 40)

    return {
      semResponsavel,
      progressoMedioChecklist,
      tempoMedioEtapa,
      etapasGargalo,
      cargaPorResponsavel,
      clientesCriticos,
    }
  }, [painel])

  const kpis = painel?.kpis

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard de Implantação</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Indicadores executivos para gestão da implantação de novos clientes.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCcw className="w-4 h-4" />}
          onClick={() => void carregar()}
          loading={loading}
          className="w-full sm:w-auto justify-center"
        >
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card padding="sm">
          <p className="text-xs text-slate-500">Clientes em Implantação</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{kpis?.emProcesso ?? 0}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500">Concluídos</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{kpis?.concluidos ?? 0}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500">Pagos Aguardando Implantação</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">
            {resumo.clientesCriticos.filter((c) => c.criterios.includes('Pagou e está aguardando implantação')).length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500">Sem Responsável</p>
          <p className="text-xl sm:text-2xl font-bold text-rose-600 mt-1">{resumo.semResponsavel}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Saúde do Processo</p>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Progresso médio de checklist: <strong>{resumo.progressoMedioChecklist}%</strong>
            </p>
            <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Clock3 className="w-4 h-4 text-blue-500" />
              Tempo médio na etapa atual: <strong>{resumo.tempoMedioEtapa} dias</strong>
            </p>
            <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <UserX className="w-4 h-4 text-rose-500" />
              Sem responsável definido: <strong>{resumo.semResponsavel}</strong>
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Gargalos por Etapa</p>
          <div className="space-y-2">
            {resumo.etapasGargalo.map((etapa) => (
              <div key={etapa.status}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{etapa.status}. {etapa.nome}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{etapa.quantidade}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(100, ((etapa.quantidade || 0) / Math.max(1, (kpis?.totalClientes || 1))) * 100)}%`,
                      backgroundColor: etapa.cor,
                    }}
                  />
                </div>
              </div>
            ))}
            {resumo.etapasGargalo.length === 0 ? <p className="text-sm text-slate-500">Sem dados.</p> : null}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Carga por Responsável</p>
          <div className="space-y-2">
            {resumo.cargaPorResponsavel.map((item) => (
              <div key={item.nome} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.nome}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.total} clientes
                </p>
              </div>
            ))}
            {resumo.cargaPorResponsavel.length === 0 ? (
              <p className="text-sm text-slate-500 flex items-center gap-2"><Users className="w-4 h-4" /> Sem responsáveis vinculados.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Clientes Críticos para Ação ({resumo.clientesCriticos.length})
          </p>
          <p className="text-xs text-slate-500 mt-1">Lista de clientes pagos em etapas críticas da implantação e treinamento.</p>
        </div>
        <div className="md:hidden p-2.5 space-y-2">
          {resumo.clientesCriticos.map((cliente) => (
            <div key={cliente.clienteId} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(cliente)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{getNomeSecundario(cliente) || 'Sem razão social'} • {cliente.cnpj || 'Sem CNPJ'}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5">Status Pgto: {cliente.statusPrimeiroPgto || '—'}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Cidade/UF: {formatCidadeUf(cliente.cidade, cliente.uf)}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Responsável: {cliente.responsavelNome || 'Não definido'}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{cliente.criterios.join(' • ')}</p>
              <div className="mt-2">
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                  (cliente.progressoChecklist || 0) <= 20 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                )}>
                  Checklist {cliente.progressoChecklist || 0}%
                </span>
              </div>
            </div>
          ))}
          {!loading && resumo.clientesCriticos.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">Nenhum cliente crítico no momento.</div>
          ) : null}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Status Pgto</th>
                <th className="px-4 py-3">Data 1º Pgto</th>
                <th className="px-4 py-3">Cidade/UF</th>
                <th className="px-4 py-3">Data Cadastro</th>
                <th className="px-4 py-3">Tempo Últ Venda</th>
                <th className="px-4 py-3">Tempo Cadastrado</th>
                <th className="px-4 py-3">Critério Crítico</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Checklist</th>
              </tr>
            </thead>
            <tbody>
              {resumo.clientesCriticos.map((cliente) => (
                <tr key={cliente.clienteId} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{getNomeDestaque(cliente)}</p>
                    <p className="text-xs text-slate-500">{getNomeSecundario(cliente) || 'Sem razão social'} • {cliente.cnpj || 'Sem CNPJ'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold',
                      String(cliente.statusPrimeiroPgto || '').toUpperCase() === 'PAGOU'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    )}>
                      {cliente.statusPrimeiroPgto || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(cliente.dataPrimeiroPgto)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCidadeUf(cliente.cidade, cliente.uf)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(cliente.dataCadastro)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTempoDesde(cliente.dataUltimaVenda)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTempoDesde(cliente.dataCadastro)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                    {cliente.criterios.join(' • ')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{cliente.responsavelNome || 'Não definido'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                      (cliente.progressoChecklist || 0) <= 20 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    )}>
                      {cliente.progressoChecklist || 0}%
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && resumo.clientesCriticos.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>Nenhum cliente crítico no momento.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
