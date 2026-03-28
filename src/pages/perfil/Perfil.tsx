import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, Loader2, Shield, Key, Clock, Users, CheckCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/ui/Toast'

export function Perfil() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: user?.nome || '',
    email: user?.email || '',
    telefone: '(11) 99999-0001',
    cargo: user?.cargo || '',
    departamento: user?.departamento || '',
  })
  const [integracoes, setIntegracoes] = useState({
    nomeCRM: 'Pipe CRM',
    nomeMegaZap: 'MegaZap Business',
    idTelegram: '@carlos_cilos',
  })

  const iniciais = form.nome
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleSalvarPerfil = async () => {
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Perfil atualizado com sucesso!')
    } catch {
      toast.error('Erro ao atualizar perfil.')
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarIntegracoes = async () => {
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Integrações salvas com sucesso!')
    } catch {
      toast.error('Erro ao salvar integrações.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meu Perfil</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Gerencie suas informações pessoais e integrações</p>
      </div>

      {/* Avatar + Info */}
      <div className="card flex items-center gap-6">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-white">{iniciais}</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{form.nome}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">{form.cargo} · {form.departamento}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Último acesso: 18/03/2026 às 08:30
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              Grupo: Administrador
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              Conta Ativa
            </span>
          </div>
        </div>
      </div>

      {/* Dados Pessoais */}
      <div className="card space-y-5">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Informações Pessoais</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome Completo</label>
            <input className="input-field" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">E-mail</label>
            <input type="email" className="input-field" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Telefone</label>
            <input className="input-field" value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Cargo</label>
            <input className="input-field" value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Departamento</label>
            <input className="input-field opacity-60 cursor-not-allowed" value={form.departamento} readOnly />
          </div>
        </div>
        <button onClick={handleSalvarPerfil} disabled={loading} className="btn-primary disabled:opacity-60">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Perfil</>}
        </button>
      </div>

      {/* Integrações */}
      <div className="card space-y-5">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Integrações</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome no CRM</label>
            <input className="input-field" value={integracoes.nomeCRM} onChange={e => setIntegracoes(p => ({ ...p, nomeCRM: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome no MegaZap</label>
            <input className="input-field" value={integracoes.nomeMegaZap} onChange={e => setIntegracoes(p => ({ ...p, nomeMegaZap: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">ID Telegram</label>
            <input className="input-field" placeholder="@usuario" value={integracoes.idTelegram} onChange={e => setIntegracoes(p => ({ ...p, idTelegram: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSalvarIntegracoes} disabled={loading} className="btn-primary disabled:opacity-60">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Integrações</>}
        </button>
      </div>

      {/* Segurança */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-xl">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Segurança</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Última alteração de senha: 45 dias atrás</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/alterar-senha')}
            className="flex items-center gap-2 btn-secondary text-sm"
          >
            <Key size={15} />
            Alterar Senha
          </button>
        </div>
      </div>
    </div>
  )
}
