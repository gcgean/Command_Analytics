import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Database, Loader2, Save, PlugZap, Search, Table2, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { ConfigRevendas, MapaRevendas, TesteRevendas } from '../../types'

export function Revendas() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'conexao' | 'mapa'>('conexao')
  const [config, setConfig] = useState<ConfigRevendas | null>(null)
  const [form, setForm] = useState({ host: '', porta: 3306, usuario: '', senha: '', banco: '', ativo: true, horaSync: '03:00' })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<TesteRevendas | null>(null)
  const [mapa, setMapa] = useState<MapaRevendas | null>(null)
  const [mapeando, setMapeando] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [amostra, setAmostra] = useState<{ tabela: string; linhas: any[] } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const c = await api.getConfigRevendas()
      setConfig(c)
      setForm((f) => ({
        ...f, host: c.host, porta: c.porta, usuario: c.usuario, banco: c.banco,
        ativo: c.ativo, horaSync: c.horaSync, senha: '',
      }))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a configuração.')
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar() {
    setSalvando(true)
    try {
      await api.salvarConfigRevendas({ ...form, senha: form.senha.trim() || undefined })
      setForm((f) => ({ ...f, senha: '' }))
      toast.success('Conexão salva!')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function testar() {
    setTestando(true)
    setTeste(null)
    try {
      const r = await api.testarConexaoRevendas()
      setTeste(r)
      if (r.ok) toast.success('Conexão estabelecida!')
      else toast.error(r.erro || 'Não foi possível conectar.')
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar.')
    } finally {
      setTestando(false)
    }
  }

  async function mapear() {
    setMapeando(true)
    try {
      const m = await api.mapearBancoRevendas(filtro.trim() || undefined)
      setMapa(m)
      setAba('mapa')
      if (m.tabelas.length === 0) toast.error('Nenhuma tabela encontrada com esse filtro.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ler o esquema do banco.')
    } finally {
      setMapeando(false)
    }
  }

  async function verAmostra(tabela: string) {
    if (aberta === tabela) { setAberta(null); setAmostra(null); return }
    setAberta(tabela)
    setAmostra(null)
    try {
      setAmostra(await api.amostraTabelaRevendas(tabela, 10))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ler a tabela.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white"><Database size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Revendas</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Banco externo das revendas, lido uma vez por dia. O Analytics só lê — nunca grava lá.
            </p>
          </div>
        </div>
        <Button variant="secondary" disabled={testando} onClick={testar}>
          {testando ? <><Loader2 className="w-4 h-4 animate-spin" /> Testando...</> : <><PlugZap className="w-4 h-4" /> Testar conexão</>}
        </Button>
      </div>

      {config?.ultimoErro && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{config.ultimoErro}</span>
        </div>
      )}

      {teste && (
        <div className={clsx('rounded-lg border p-3 text-xs flex gap-2',
          teste.ok
            ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            : 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300')}>
          {teste.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>
            {teste.ok
              ? `Conectado ao banco ${teste.banco} (MySQL ${teste.versao}) — ${teste.tabelas} tabela(s).`
              : teste.erro}
          </span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['conexao', 'Conexão'], ['mapa', 'Mapa do banco']] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === id ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>}

      {!carregando && aba === 'conexao' && (
        <div className="max-w-2xl">
          <Card>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Acesso ao banco das revendas</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Use um usuário <strong>somente leitura</strong> (apenas SELECT) e libere o IP deste servidor
                  no banco de origem. O Analytics nunca escreve nessa base.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Host</label>
                  <input className="input-field font-mono text-xs" placeholder="ex.: 191.0.0.10 ou db.suaempresa.com.br"
                    value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Porta</label>
                  <input className="input-field" type="number" value={form.porta}
                    onChange={(e) => setForm({ ...form, porta: Number(e.target.value) || 3306 })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Usuário</label>
                  <input className="input-field" value={form.usuario}
                    onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Senha</label>
                  <input className="input-field" type="password" autoComplete="new-password"
                    placeholder={config?.temSenha ? '•••••••• (já configurada)' : 'senha do usuário'}
                    value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                  <p className="text-[11px] text-slate-400 mt-1">Em branco mantém a atual.</p>
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Banco</label>
                  <input className="input-field font-mono text-xs" value={form.banco}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Horário da sincronização diária</label>
                  <input className="input-field" type="time" value={form.horaSync}
                    onChange={(e) => setForm({ ...form, horaSync: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
                  <input type="checkbox" className="accent-violet-600" checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Sincronizar automaticamente todo dia
                </label>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-slate-500">
                Última sincronização:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {config?.ultimaSync ? new Date(config.ultimaSync).toLocaleString('pt-BR') : 'nunca'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={salvando} onClick={salvar}>
                  {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar</>}
                </Button>
                <Button variant="secondary" disabled={mapeando} onClick={mapear}>
                  {mapeando ? <><Loader2 className="w-4 h-4 animate-spin" /> Lendo...</> : <><Table2 className="w-4 h-4" /> Mapear o banco</>}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!carregando && aba === 'mapa' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input-field pl-9" placeholder="Filtrar tabelas (ex.: revenda)"
                value={filtro} onChange={(e) => setFiltro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void mapear() }} />
            </div>
            <Button variant="secondary" disabled={mapeando} onClick={mapear}>
              {mapeando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
            </Button>
          </div>

          {!mapa && (
            <Card><p className="text-sm text-slate-500 py-6 text-center">
              Clique em "Mapear o banco" para listar as tabelas do banco das revendas.
            </p></Card>
          )}

          {mapa && (
            <Card padding="none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {mapa.banco} · {mapa.tabelas.length} tabela(s)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clique numa tabela para ver as colunas e uma amostra das primeiras linhas.
                </p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[560px] overflow-y-auto">
                {mapa.tabelas.map((t) => (
                  <div key={t.tabela}>
                    <button onClick={() => verAmostra(t.tabela)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200">{t.tabela}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {t.colunas.length} colunas · ~{t.linhas.toLocaleString('pt-BR')} linhas
                      </span>
                    </button>
                    {aberta === t.tabela && (
                      <div className="px-4 pb-4 space-y-3 bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          {t.colunas.map((c) => (
                            <span key={c} className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                              {c}
                            </span>
                          ))}
                        </div>
                        {!amostra && <p className="text-xs text-slate-500">Carregando amostra...</p>}
                        {amostra?.tabela === t.tabela && amostra.linhas.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="text-[11px] w-full bg-white dark:bg-slate-800">
                              <thead className="bg-slate-100 dark:bg-slate-900/60">
                                <tr>
                                  {Object.keys(amostra.linhas[0]).map((k) => (
                                    <th key={k} className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {amostra.linhas.map((linha, i) => (
                                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                                    {Object.values(linha).map((v, j) => (
                                      <td key={j} className="px-2 py-1 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[16rem] truncate">
                                        {v === null ? <span className="text-slate-400">null</span> : String(v)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {amostra?.tabela === t.tabela && amostra.linhas.length === 0 && (
                          <p className="text-xs text-slate-500">Tabela vazia.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
