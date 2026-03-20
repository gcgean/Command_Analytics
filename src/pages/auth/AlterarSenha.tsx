import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command, Eye, EyeOff, Lock, Loader2, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

function calcForca(senha: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (senha.length === 0) return { level: 0, label: '', color: '' }
  let score = 0
  if (senha.length >= 8) score++
  if (/[A-Z]/.test(senha)) score++
  if (/[0-9]/.test(senha)) score++
  if (/[^A-Za-z0-9]/.test(senha)) score++
  if (score <= 1) return { level: 1, label: 'Fraca', color: 'bg-red-500' }
  if (score === 2) return { level: 2, label: 'Média', color: 'bg-amber-500' }
  return { level: 3, label: 'Forte', color: 'bg-emerald-500' }
}

const requisitos = [
  { label: 'Mínimo 8 caracteres', test: (s: string) => s.length >= 8 },
  { label: 'Pelo menos 1 letra maiúscula', test: (s: string) => /[A-Z]/.test(s) },
  { label: 'Pelo menos 1 número', test: (s: string) => /[0-9]/.test(s) },
]

export function AlterarSenha() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showAtual, setShowAtual] = useState(false)
  const [showNova, setShowNova] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)

  const forca = calcForca(novaSenha)
  const todosRequisitos = requisitos.every(r => r.test(novaSenha))
  const senhasCoincidem = novaSenha === confirmar && confirmar.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!senhaAtual) {
      toast.error('Informe a senha atual.')
      return
    }
    if (!todosRequisitos) {
      toast.error('A nova senha não atende aos requisitos mínimos.')
      return
    }
    if (!senhasCoincidem) {
      toast.error('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Senha alterada com sucesso!')
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmar('')
    } catch {
      toast.error('Erro ao alterar a senha. Tente novamente.')
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
            Segurança da<br />
            <span className="text-blue-400">sua conta</span>
          </h2>
          <p className="mt-4 text-slate-400 text-lg leading-relaxed">
            Mantenha sua senha atualizada regularmente para proteger suas informações.
          </p>
        </div>
        <div className="relative">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-300 mb-2">Dicas de segurança</p>
            <ul className="space-y-1 text-xs text-slate-400">
              <li>• Use senhas únicas para cada sistema</li>
              <li>• Evite dados pessoais como datas ou nomes</li>
              <li>• Troque sua senha a cada 90 dias</li>
              <li>• Nunca compartilhe sua senha</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Dashboard
          </button>

          <div>
            <h1 className="text-2xl font-bold text-slate-100">Alterar Senha</h1>
            <p className="mt-2 text-sm text-slate-400">Crie uma senha forte e segura</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Senha Atual */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Senha Atual</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showAtual ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={e => setSenhaAtual(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                />
                <button type="button" onClick={() => setShowAtual(!showAtual)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {showAtual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Nova Senha */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showNova ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                />
                <button type="button" onClick={() => setShowNova(!showNova)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {showNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Barra de força */}
              {novaSenha.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${forca.level >= i ? forca.color : 'bg-slate-700'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">Força: <span className={forca.level === 3 ? 'text-emerald-400' : forca.level === 2 ? 'text-amber-400' : 'text-red-400'}>{forca.label}</span></p>
                </div>
              )}

              {/* Requisitos */}
              {novaSenha.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {requisitos.map(r => (
                    <div key={r.label} className="flex items-center gap-2">
                      {r.test(novaSenha)
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                      <span className={`text-xs ${r.test(novaSenha) ? 'text-emerald-400' : 'text-slate-500'}`}>{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showConfirmar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-slate-800 border text-slate-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-slate-500 ${
                    confirmar.length > 0
                      ? senhasCoincidem
                        ? 'border-emerald-500 focus:ring-emerald-500'
                        : 'border-red-500 focus:ring-red-500'
                      : 'border-slate-700 focus:ring-blue-500'
                  }`}
                />
                <button type="button" onClick={() => setShowConfirmar(!showConfirmar)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {showConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmar.length > 0 && !senhasCoincidem && (
                <p className="text-xs text-red-400 mt-1">As senhas não coincidem.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              ) : 'Salvar Nova Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
