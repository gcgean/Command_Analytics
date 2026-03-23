import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command, Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario || !password) {
      setError('Preencha todos os campos.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(usuario, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Credenciais inválidas. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Command className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Command Analytics</p>
              <p className="text-sm text-blue-300">Cilos Sistema</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Gestão inteligente<br />
            <span className="text-blue-400">para sua empresa</span>
          </h2>
          <p className="mt-4 text-slate-400 text-lg leading-relaxed">
            Monitore atendimentos, clientes, metas e muito mais em tempo real.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-4">
          {[
            { label: 'Atendimentos/mês', value: '2.400+' },
            { label: 'Clientes gerenciados', value: '1.200+' },
            { label: 'NPS médio', value: '72 pts' },
            { label: 'Uptime', value: '99,9%' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Command className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Command Analytics</p>
              <p className="text-sm text-slate-500">Cilos Sistema</p>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-100">Entrar na plataforma</h1>
            <p className="mt-2 text-sm text-slate-400">Acesse com suas credenciais corporativas</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="seu.usuario"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-slate-700 bg-slate-800 text-blue-600" />
                <span className="text-sm text-slate-400">Lembrar-me</span>
              </label>
              <button type="button" className="text-sm text-blue-400 hover:text-blue-300">
                Esqueci a senha
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-600">
            Command Analytics v1.0.0 — Cilos Sistema © 2026
          </p>
        </div>
      </div>
    </div>
  )
}
