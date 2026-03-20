import { useState } from 'react'
import { Save, Loader2, Plus, X, CheckCircle, Wifi } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import clsx from 'clsx'

type Aba = 'geral' | 'whatsapp' | 'email' | 'parametros'

interface TokenWhats {
  id: number
  descricao: string
  token: string
  ativo: boolean
}

interface ContaEmail {
  id: number
  host: string
  porta: string
  email: string
  nomeRemetente: string
  tls: boolean
}

const mockTokens: TokenWhats[] = [
  { id: 1, descricao: 'Suporte Principal', token: 'whatsapp_tok_abc123...', ativo: true },
  { id: 2, descricao: 'Comercial', token: 'whatsapp_tok_xyz789...', ativo: false },
]

const mockContas: ContaEmail[] = [
  { id: 1, host: 'smtp.gmail.com', porta: '587', email: 'suporte@cilos.com.br', nomeRemetente: 'Cilos Suporte', tls: true },
]

export function Configuracoes() {
  const { toast } = useToast()
  const [aba, setAba] = useState<Aba>('geral')
  const [loading, setLoading] = useState(false)
  const [testando, setTestando] = useState<number | null>(null)

  // Geral
  const [geral, setGeral] = useState({
    custoHoraSuporte: '45',
    custoHoraDev: '80',
    custoFixoMensal: '5000',
    custoKm: '0.80',
    velocidadeKmh: '60',
    margemHoraSuporte: '30',
  })

  // WhatsApp
  const [tokenApi, setTokenApi] = useState('Bearer eyJhbGciOiJI...')
  const [tokenNotif, setTokenNotif] = useState('notif_sk_live_...')
  const [tokens, setTokens] = useState<TokenWhats[]>(mockTokens)

  // Email
  const [contas, setContas] = useState<ContaEmail[]>(mockContas)

  // Parâmetros
  const [params, setParams] = useState({
    chavePix: 'financeiro@cilos.com.br',
    percReajuste: '10',
    percMaxDesconto: '20',
    diasCarencia: '5',
  })

  const handleSalvar = async () => {
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Configurações salvas com sucesso!')
    } catch {
      toast.error('Erro ao salvar configurações.')
    } finally {
      setLoading(false)
    }
  }

  const handleTestarEmail = async (id: number) => {
    setTestando(id)
    try {
      await new Promise(r => setTimeout(r, 1200))
      toast.success('Conexão SMTP testada com sucesso!')
    } catch {
      toast.error('Falha ao conectar ao servidor SMTP.')
    } finally {
      setTestando(null)
    }
  }

  const removerToken = (id: number) => {
    setTokens(prev => prev.filter(t => t.id !== id))
    toast.info('Token removido.')
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'E-mail' },
    { key: 'parametros', label: 'Parâmetros' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configurações do Sistema</h1>
        <p className="text-slate-400 text-sm mt-1">Parâmetros e integrações da plataforma</p>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-slate-700">
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', aba === a.key ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Aba Geral */}
      {aba === 'geral' && (
        <div className="card max-w-2xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200">Custos e Parâmetros Gerais</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Custo/hora Suporte (R$)', key: 'custoHoraSuporte' },
              { label: 'Custo/hora Desenvolvimento (R$)', key: 'custoHoraDev' },
              { label: 'Custo Fixo Mensal (R$)', key: 'custoFixoMensal' },
              { label: 'Custo por km (R$)', key: 'custoKm' },
              { label: 'Velocidade média (km/h)', key: 'velocidadeKmh' },
              { label: 'Margem Hora Suporte (%)', key: 'margemHoraSuporte' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                <input type="number" className="input-field" value={(geral as Record<string, string>)[f.key]}
                  onChange={e => setGeral(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
          </button>
        </div>
      )}

      {/* Aba WhatsApp */}
      {aba === 'whatsapp' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Tokens de API</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Token API WhatsApp</label>
              <input className="input-field font-mono text-xs" value={tokenApi} onChange={e => setTokenApi(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Token de Notificações</label>
              <input className="input-field font-mono text-xs" value={tokenNotif} onChange={e => setTokenNotif(e.target.value)} />
            </div>
            <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Tokens Cadastrados</h3>
              <button className="btn-secondary text-xs py-1">
                <Plus size={13} /> Novo Token
              </button>
            </div>
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
                  <div>
                    <p className="text-sm text-slate-200 font-medium">{t.descricao}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{t.token}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-xs ${t.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <button onClick={() => removerToken(t.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aba E-mail */}
      {aba === 'email' && (
        <div className="space-y-4 max-w-2xl">
          {contas.map(c => (
            <div key={c.id} className="card space-y-4">
              <h3 className="text-sm font-semibold text-slate-200">Conta SMTP — {c.email}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Host SMTP</label>
                  <input className="input-field" defaultValue={c.host} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Porta</label>
                  <input className="input-field" defaultValue={c.porta} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">E-mail</label>
                  <input type="email" className="input-field" defaultValue={c.email} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nome Remetente</label>
                  <input className="input-field" defaultValue={c.nomeRemetente} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`tls-${c.id}`} defaultChecked={c.tls} className="rounded border-slate-700 bg-slate-800 text-blue-600" />
                  <label htmlFor={`tls-${c.id}`} className="text-sm text-slate-300 cursor-pointer">Usar TLS/SSL</label>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
                <button onClick={() => handleTestarEmail(c.id)} disabled={testando === c.id} className="btn-secondary disabled:opacity-60">
                  {testando === c.id
                    ? <><Loader2 size={15} className="animate-spin" /> Testando...</>
                    : <><Wifi size={15} /> Testar Conexão</>}
                </button>
              </div>
            </div>
          ))}
          <button className="btn-secondary w-full justify-center">
            <Plus size={15} /> Adicionar Conta SMTP
          </button>
        </div>
      )}

      {/* Aba Parâmetros */}
      {aba === 'parametros' && (
        <div className="card max-w-2xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200">Parâmetros Comerciais</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Chave PIX</label>
              <input className="input-field" value={params.chavePix} onChange={e => setParams(p => ({ ...p, chavePix: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Percentual de Reajuste Anual (%)</label>
              <input type="number" className="input-field" value={params.percReajuste} onChange={e => setParams(p => ({ ...p, percReajuste: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">% Máx. Desconto Implantação</label>
              <input type="number" className="input-field" value={params.percMaxDesconto} onChange={e => setParams(p => ({ ...p, percMaxDesconto: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Dias de Carência para Bloqueio</label>
              <input type="number" className="input-field" value={params.diasCarencia} onChange={e => setParams(p => ({ ...p, diasCarencia: e.target.value }))} />
            </div>
          </div>
          <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
          </button>
        </div>
      )}
    </div>
  )
}
