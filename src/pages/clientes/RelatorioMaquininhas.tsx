import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Loader2, RefreshCcw, Eye } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import type { Operadora, MaquininhasRelatorio, TipoMaquininha, StatusMaquininha } from '../../types'

const STATUS_LABEL: Record<StatusMaquininha, string> = {
  NAO_INTEGRADO: 'Não integrado',
  EM_IMPLANTACAO: 'Em implantação',
  INTEGRADO: 'Integrado',
}

const STATUS_CLASSES: Record<string, string> = {
  NAO_INTEGRADO: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  EM_IMPLANTACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  INTEGRADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

export function RelatorioMaquininhas() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [filtros, setFiltros] = useState<{ operadoraId: string; tipo: string; statusIntegracao: string }>({
    operadoraId: '', tipo: '', statusIntegracao: '',
  })
  const [dados, setDados] = useState<MaquininhasRelatorio | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getOperadoras().then(setOperadoras).catch(() => {})
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.getMaquininhasRelatorio({
        operadoraId: filtros.operadoraId ? Number(filtros.operadoraId) : undefined,
        tipo: (filtros.tipo || undefined) as TipoMaquininha | undefined,
        statusIntegracao: (filtros.statusIntegracao || undefined) as StatusMaquininha | undefined,
      })
      setDados(data)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar o relatório.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 rounded-lg">
          <CreditCard className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Relatório de Maquininhas</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Maquininhas de cartão por cliente, operadora e status de integração com o sistema.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Clientes</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.clientes ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Registros</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.registros ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Maquininhas</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{dados?.totais.maquininhas ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Integradas</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{dados?.totais.integradas ?? 0}</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Select
            label="Operadora"
            options={[{ value: '', label: 'Todas' }, ...operadoras.map((o) => ({ value: String(o.id), label: o.nome }))]}
            value={filtros.operadoraId}
            onChange={(e) => setFiltros((f) => ({ ...f, operadoraId: e.target.value }))}
          />
          <Select
            label="Tipo"
            options={[{ value: '', label: 'Todos' }, { value: 'TEF', label: 'TEF' }, { value: 'SMARTPOS', label: 'SmartPOS' }]}
            value={filtros.tipo}
            onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
          />
          <Select
            label="Status de integração"
            options={[{ value: '', label: 'Todos' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
            value={filtros.statusIntegracao}
            onChange={(e) => setFiltros((f) => ({ ...f, statusIntegracao: e.target.value }))}
          />
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="secondary" icon={<RefreshCcw className="w-4 h-4" />} onClick={carregar}>Atualizar</Button>
        </div>
      </Card>

      {/* Resumos por operadora / tipo / status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Por operadora</h3>
          <div className="space-y-2">
            {(dados?.porOperadora ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Sem dados.</p>
            ) : dados!.porOperadora.map((o) => (
              <div key={o.operadora} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{o.operadora}</span>
                <span className="text-slate-500">{o.maquininhas} ({o.integradas} integradas)</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Por tipo</h3>
          <div className="space-y-2">
            {(dados?.porTipo ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Sem dados.</p>
            ) : dados!.porTipo.map((t) => (
              <div key={t.tipo} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{t.tipo === 'SMARTPOS' ? 'SmartPOS' : t.tipo}</span>
                <span className="text-slate-500">{t.maquininhas}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Por status</h3>
          <div className="space-y-2">
            {(dados?.porStatus ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Sem dados.</p>
            ) : dados!.porStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASSES[s.status])}>
                  {STATUS_LABEL[s.status as StatusMaquininha] ?? s.status}
                </span>
                <span className="text-slate-500">{s.maquininhas}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Detalhado */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                {['Cliente', 'Operadora', 'Tipo', 'Qtd', 'Status', 'Observação', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : (dados?.detalhado ?? []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Nenhuma maquininha encontrada para os filtros informados.</td></tr>
              ) : (
                dados!.detalhado.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{d.clienteNome}</p>
                      {d.cnpj && <p className="text-xs text-slate-500">{d.cnpj}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.operadoraNome}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.tipo === 'SMARTPOS' ? 'SmartPOS' : d.tipo}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.quantidade}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_CLASSES[d.statusIntegracao])}>
                        {STATUS_LABEL[d.statusIntegracao]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{d.observacao || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/clientes/${d.clienteId}?tab=tecnico`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver cliente
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
