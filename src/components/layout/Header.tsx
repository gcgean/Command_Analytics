import { Bell, Menu, ChevronDown, LogOut, User, KeyRound, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'

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
  '/usuarios': 'Usuários',
  '/perfil': 'Meu Perfil',
}

interface HeaderProps {
  onToggleSidebar: () => void
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
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
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 flex-shrink-0 transition-colors duration-300">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false) }}
            className="relative text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</h3>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {notifications.map((n) => (
                  <div key={n.id} className="p-4 hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.urgent ? 'bg-red-400' : 'bg-blue-400'}`} />
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{n.text}</p>
                        <p className="text-xs text-slate-500 mt-1">{n.time} atrás</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-200 dark:border-slate-700">
                <button className="w-full text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 text-center">
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
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.nome?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'CA'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-none">{user?.nome?.split(' ')[0]}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Online</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl dark:shadow-none py-1 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.nome}</p>
                <p className="text-xs text-slate-500 truncate">{user?.departamento}</p>
              </div>
              
              <div className="py-1">
                <button
                  onClick={() => { navigate('/perfil'); setShowUserMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Meu Perfil
                </button>
                <button
                  onClick={() => { navigate('/alterar-senha'); setShowUserMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  Alterar Senha
                </button>
                <button
                  onClick={() => { toggleTheme(); setShowUserMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  Modo {theme === 'light' ? 'Escuro' : 'Claro'}
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
              
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
