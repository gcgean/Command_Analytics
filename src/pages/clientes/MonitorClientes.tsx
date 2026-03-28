import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Wifi, RefreshCw, Monitor, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import type { Cliente } from '../../types'

// Note: MySQL clientes table has no ultimoFTP/ultimoBackup/certificadoVencimento/versaoSistema/conexoes/caixas
// Those fields default to undefined → safe fallbacks used throughout

function diasDesde(data: string) {
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
}

function statusDias(dias: number) {
  if (dias <= 1) return 'text-emerald-400'
  if (dias <= 7) return 'text-amber-400'
  return 'text-red-400'
}

function certStatus(validade: string) {
  const dias = Math.floor((new Date(validade).getTime() - Date.now()) / 86400000)
  if (dias > 60) return { cor: 'text-emerald-400', label: `${dias}d` }
  if (dias > 30) return { cor: 'text-amber-400', label: `${dias}d` }
  return { cor: 'text-red-400', label: `${dias}d` }
}

export function MonitorClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'atualizacao' | 'geral' | 'caixas'>('geral')

  useEffect(() => {
    api.getClientes().then((data: any) => {
      setClientes(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const semAtualizacao = clientes.filter(c => c.ultimoFTP && diasDesde(c.ultimoFTP) > 3)
  const comErroBkp = clientes.filter(c => c.ultimoBackup && diasDesde(c.ultimoBackup) > 1)
  const certVencendo = clientes.filter(c => {
    if (!c.certificadoVencimento) return false
    const dias = Math.floor((new Date(c.certificadoVencimento).getTime() - Date.now()) / 86400000)
    return dias <= 30
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Monitor de Clientes</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Monitoramento técnico em tempo real</p>
        </div>
        <button className="btn-primary" onClick={() => { setLoading(true); api.getClientes().then((d: any) => { setClientes(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false)) }}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Clientes Ativos', valor: clientes.filter(c => c.ativo === 'S').length.toString(), icon: Monitor, cor: 'text-blue-400' },
          { label: 'Sem Atualização (+3d)', valor: semAtualizacao.length.toString(), icon: AlertTriangle, cor: 'text-amber-400' },
          { label: 'Backup Atrasado', valor: comErroBkp.length.toString(), icon: XCircle, cor: 'text-red-400' },
          { label: 'Cert. Vencendo (30d)', valor: certVencendo.length.toString(), icon: AlertTriangle, cor: 'text-orange-400' },
        ].map(k => (
          <div key={k.label} className="card flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-slate-200 dark:bg-slate-700 ${k.cor}`}><k.icon size={22} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{k.valor}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-0">
        {(['geral', 'atualizacao'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === a ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
            {a === 'geral' ? 'Dados Gerais' : 'Sem Atualização'}
          </button>
        ))}
      </div>

      {/* Aba Geral */}
      {aba === 'geral' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Cliente', 'Versão', 'Últ. FTP', 'Últ. Backup', 'Conexões', 'Caixas', 'Cert. Digital', 'Status'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => {
                const diasFtp = c.ultimoFTP ? diasDesde(c.ultimoFTP) : 999
                const diasBkp = c.ultimoBackup ? diasDesde(c.ultimoBackup) : 999
                const cert = c.certificadoVencimento ? certStatus(c.certificadoVencimento) : { cor: 'text-slate-400', label: '—' }
                return (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{c.nome}</td>
                    <td className="table-cell"><span className="badge bg-blue-500/20 text-blue-300">{c.versaoSistema || '—'}</span></td>
                    <td className={`table-cell font-medium ${statusDias(diasFtp)}`}>{diasFtp === 0 ? 'Hoje' : `${diasFtp}d atrás`}</td>
                    <td className={`table-cell font-medium ${statusDias(diasBkp)}`}>{diasBkp === 0 ? 'Hoje' : `${diasBkp}d atrás`}</td>
                    <td className="table-cell"><span className="flex items-center gap-1"><Wifi size={14} className="text-slate-500 dark:text-slate-400" />{c.conexoes ?? 0}</span></td>
                    <td className="table-cell">{c.caixas ?? 0}</td>
                    <td className={`table-cell font-medium ${cert.cor}`}>{cert.label}</td>
                    <td className="table-cell">
                      {diasBkp > 1
                        ? <span className="flex items-center gap-1 text-red-400"><XCircle size={15} /> Backup atrasado</span>
                        : <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={15} /> OK</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Aba Sem Atualização */}
      {aba === 'atualizacao' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Cliente', 'Versão Instalada', 'Últ. FTP', 'Dias sem sync', 'Ação'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semAtualizacao.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium text-slate-100">{c.nome}</td>
                  <td className="table-cell"><span className="badge bg-red-500/20 text-red-300">{c.versaoSistema}</span></td>
                  <td className="table-cell text-slate-500 dark:text-slate-400">{c.ultimoFTP}</td>
                  <td className="table-cell"><span className="text-red-400 font-bold">{c.ultimoFTP ? diasDesde(c.ultimoFTP) : '?'}d</span></td>
                  <td className="table-cell"><button className="text-blue-400 hover:text-blue-300 text-xs underline">Contatar</button></td>
                </tr>
              ))}
              {semAtualizacao.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-slate-500 py-8">Todos os clientes estão atualizados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
