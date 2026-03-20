import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
      <div className="text-center">
        {/* 404 */}
        <div className="relative mb-6">
          <h1 className="text-[10rem] font-black leading-none select-none bg-gradient-to-br from-blue-400 via-blue-600 to-slate-700 bg-clip-text text-transparent animate-pulse">
            404
          </h1>
        </div>

        <h2 className="text-2xl font-bold text-slate-100 mb-3">Página não encontrada</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto mb-8">
          A página que você está procurando não existe ou foi movida para outro endereço.
        </p>

        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 hover:scale-105"
        >
          <LayoutDashboard className="w-5 h-5" />
          Voltar ao Dashboard
        </button>
      </div>
    </div>
  )
}
