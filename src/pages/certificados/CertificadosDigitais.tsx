import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Calendar,
  Eye,
  FileBadge2,
  Loader2,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react'
import clsx from 'clsx'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import type { CertificadoDigitalGraficoItem, CertificadoDigitalItem } from '../../types'

type AbaCertificados = 'listagem' | 'grafico'

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR')
}

function getInicioMesAtual() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function getFimMesAtual() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0)
}

function getSituacaoClassName(item: CertificadoDigitalItem) {
  if (item.diasParaVencimento === null) return 'bg-slate-100 text-slate-600'
  if (item.diasParaVencimento < 0) return 'bg-red-100 text-red-700'
  if (item.diasParaVencimento <= 7) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
        {total} certificado(s)
      </p>
    </div>
  )
}

export function CertificadosDigitais() {
  const { toast } = useToast()
  const [aba, setAba] = useState<AbaCertificados>('listagem')
  const [loading, setLoading] = useState(true)
  const [loadingGrafico, setLoadingGrafico] = useState(true)
  const [dataIni, setDataIni] = useState(formatDateInput(getInicioMesAtual()))
  const [dataFin, setDataFin] = useState(formatDateInput(getFimMesAtual()))
  const [certificados, setCertificados] = useState<CertificadoDigitalItem[]>([])
  const [grafico, setGrafico] = useState<CertificadoDigitalGraficoItem[]>([])

  const carregarListagem = async (params?: { dataIni?: string; dataFin?: string }) => {
    try {
      setLoading(true)
      const data = await api.getCertificadosDigitais({
        dataIni: params?.dataIni ?? dataIni,
        dataFin: params?.dataFin ?? dataFin,
      })
      setCertificados(data)
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar certificados digitais.')
    } finally {
      setLoading(false)
    }
  }

  const carregarGrafico = async () => {
    try {
      setLoadingGrafico(true)
      const data = await api.getCertificadosDigitaisGrafico()
      setGrafico(data)
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar gráfico de certificados.')
    } finally {
      setLoadingGrafico(false)
    }
  }

  useEffect(() => {
    carregarListagem({ dataIni, dataFin })
    carregarGrafico()
  }, [])

  const totalCertificados = certificados.length
  const vencidos = useMemo(() => certificados.filter((item) => (item.diasParaVencimento ?? 1) < 0).length, [certificados])
  const aVencer7Dias = useMemo(() => certificados.filter((item) => item.diasParaVencimento !== null && item.diasParaVencimento >= 0 && item.diasParaVencimento <= 7).length, [certificados])

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FileBadge2 className="w-5 h-5 text-blue-500" />
          Controle de Certificados Digitais
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Acompanhe certificados por período e visualize a concentração dos vencimentos dos próximos meses.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAba('listagem')}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              aba === 'listagem'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-slate-700'
            )}
          >
            <Target className="w-4 h-4" />
            Listagem por mês
          </button>
          <button
            type="button"
            onClick={() => setAba('grafico')}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              aba === 'grafico'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-slate-700'
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Gráfico Próx. Meses
          </button>
        </div>

        {aba === 'listagem' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">De</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={dataIni}
                    onChange={(e) => setDataIni(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Até</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={dataFin}
                    onChange={(e) => setDataFin(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => carregarListagem({ dataIni, dataFin })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-medium"
              >
                <Search className="w-4 h-4" />
                Visualizar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50">
                <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Certificados</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCertificados}</p>
              </div>
              <div className="rounded-2xl border border-red-200 dark:border-red-900/40 p-4 bg-red-50 dark:bg-red-950/20">
                <p className="text-xs uppercase tracking-wider text-red-400 mb-1">Vencidos</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{vencidos}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 p-4 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs uppercase tracking-wider text-amber-500 mb-1">A vencer em 7 dias</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{aVencer7Dias}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-400">Carregando listagem de certificados...</p>
                  </div>
                </div>
              ) : certificados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                  <RefreshCw className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-500">Nenhum certificado encontrado para o período informado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1550px] w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr className="text-left text-slate-500 dark:text-slate-400">
                        <th className="px-3 py-3 font-medium">Tipo</th>
                        <th className="px-3 py-3 font-medium">Validade</th>
                        <th className="px-3 py-3 font-medium">Dias</th>
                        <th className="px-3 py-3 font-medium">Nome empresa</th>
                        <th className="px-3 py-3 font-medium">Nome fantasia</th>
                        <th className="px-3 py-3 font-medium">Cidade</th>
                        <th className="px-3 py-3 font-medium">Telefone</th>
                        <th className="px-3 py-3 font-medium">Celular</th>
                        <th className="px-3 py-3 font-medium">Email</th>
                        <th className="px-3 py-3 font-medium">CNPJ</th>
                        <th className="px-3 py-3 font-medium">Tipo cliente</th>
                        <th className="px-3 py-3 font-medium">Últ. sincronização</th>
                        <th className="px-3 py-3 font-medium">Contador</th>
                        <th className="px-3 py-3 font-medium">Contato contador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {certificados.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 align-top">
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-1 text-xs font-medium">
                              <Eye className="w-3.5 h-3.5" />
                              {item.tipo || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{formatDateBr(item.validade)}</td>
                          <td className="px-3 py-3">
                            <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', getSituacaoClassName(item))}>
                              {item.situacao}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-800 dark:text-slate-100 font-medium">{item.razaoEmpresa || '—'}</td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{item.nomeFantasia || '—'}</td>
                          <td className="px-3 py-3">{item.cidade || '—'}</td>
                          <td className="px-3 py-3">{item.telefone || '—'}</td>
                          <td className="px-3 py-3">{item.celular || '—'}</td>
                          <td className="px-3 py-3">{item.email || '—'}</td>
                          <td className="px-3 py-3">{item.cnpj || '—'}</td>
                          <td className="px-3 py-3">{item.tipoCliente || '—'}</td>
                          <td className="px-3 py-3">{formatDateBr(item.ultimaSincronizacao)}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-800 dark:text-slate-100">{item.contadorNome || '—'}</div>
                            {item.contadorEmail && <div className="text-xs text-slate-500">{item.contadorEmail}</div>}
                          </td>
                          <td className="px-3 py-3">{item.contadorTelefone || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Certificados se vencendo nos próximos 12 meses
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Visualização mensal da quantidade de certificados que vencem em cada mês.
                  </p>
                </div>
              </div>

              {loadingGrafico ? (
                <div className="flex items-center justify-center h-[360px]">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-400">Carregando gráfico...</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={grafico} margin={{ top: 20, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="total" name="Dados" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
                    <Line type="monotone" dataKey="total" name="Evolução" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
