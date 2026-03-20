import { Bell, Menu, ChevronDown, LogOut, User, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/atendimentos': 'Atendimentos',
  '/atendimentos/novo': 'Novo Atendimento',
  '/atendimentos/historico': 'Histórico de Atendimentos',
  '/atendimentos/mapa': 'Mapa de Atendimentos',
  '/agenda': 'Agenda',
  '/clientes': 'Clientes',
  '/clientes/monitor': 'Monitor de Clientes',
  '/planos': 'Planos',
  '/planos/assinaturas': 'Assinaturas',
  '/implantacao': 'Pipeline de Implantação',
  '/implantacao/orcamento': 'Orçamento de Implantação',
  '/crm': 'CRM / Negócios',
  '/crm/leads': 'Pesquisa de Leads',
  '/financeiro': 'Análise Financeira',
  '/comissoes': 'Comissões',
  '/desenvolvimento': 'Tarefas de Desenvolvimento',
  '/videos': 'Vídeos',
  '/metas': 'Metas e NPS',
  '/monitor': 'Monitor de Atendimentos',
  '/campanhas': 'Campanhas',
  '/contadores': 'Contadores',
  '/versoes': 'Versões e Licenças',
  '/servidores': 'Servidores em Nuvem',
  '/implantacao/acompanhamento': 'Acompanhamento de Implantação',
  '/banco-horas': 'Banco de Horas',
  '/configuracoes': 'Configurações do Sistema',
  '/perfil': 'Meu Perfil',
}

interface HeaderProps {
  onToggleSidebar: () => void
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const title = routeTitles[location.pathname] || 'Command Analytics'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const notifications = [
    { id: 1, text: 'Certificado de Supermercado Bom Preço vence em 28 dias', time: '10 min', urgent: true },
    { id: 2, text: '2 atendimentos ultrapassaram 2h sem resolução', time: '25 min', urgent: true },
    { id: 3, text: 'Nova tarefa de desenvolvimento criada', time: '1h', urgent: false },
  ]

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition-colors lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-slate-100">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false) }}
            className="relative text-slate-400 hover:text-slate-100 p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-slate-100">Notificações</h3>
              </div>
              <div className="divide-y divide-slate-700">
                {notifications.map((n) => (
                  <div key={n.id} className="p-4 hover:bg-slate-700/50 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.urgent ? 'bg-red-400' : 'bg-blue-400'}`} />
                      <div>
                        <p className="text-xs text-slate-300">{n.text}</p>
                        <p className="text-xs text-slate-500 mt-1">{n.time} atrás</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-700">
                <button className="w-full text-xs text-blue-400 hover:text-blue-300 text-center">
                  Ver todas as notificações
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false) }}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-100 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {user?.nome?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'CA'}
              </span>
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-medium text-slate-200">{user?.nome || 'Usuário'}</p>
              <p className="text-xs text-slate-500">{user?.departamento}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 hidden md:block" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 py-1">
              <button
                onClick={() => { navigate('/perfil'); setShowUserMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              >
                <User className="w-4 h-4" />
                Meu Perfil
              </button>
              <button
                onClick={() => { navigate('/alterar-senha'); setShowUserMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                Alterar Senha
              </button>
              <div className="border-t border-slate-700 my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
