import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Headphones, Calendar, Monitor,
  Users, BarChart3, GitBranch, Briefcase, BookUser,
  DollarSign, Award, Package,
  Code2, Tag, Video, Target, Server,
  ChevronDown, ChevronRight, LogOut, Command, Menu, X,
  MessageSquare, ClipboardList, Map, TrendingUp, FileText,
  ShoppingBag, Megaphone, Clock, Settings, Receipt, ShieldCheck
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { usePermissions } from '../../contexts/PermissionsContext'

interface NavItem {
  label: string
  icon: React.ReactNode
  to?: string
  recurso?: string
  children?: NavItem[]
}

const navGroups: { group: string; items: NavItem[] }[] = [
  {
    group: 'OPERACIONAL',
    items: [
      { label: 'Dashboard',            icon: <LayoutDashboard className="w-4 h-4" />, to: '/dashboard',      recurso: 'dashboard' },
      {
        label: 'Atendimentos', icon: <Headphones className="w-4 h-4" />, recurso: 'atendimentos', children: [
          { label: 'Todos Atendimentos', icon: <ClipboardList className="w-4 h-4" />, to: '/atendimentos' },
          { label: 'Novo Atendimento',   icon: <MessageSquare className="w-4 h-4" />, to: '/atendimentos/novo' },
          { label: 'Histórico',          icon: <FileText className="w-4 h-4" />,      to: '/atendimentos/historico' },
          { label: 'Mapa',               icon: <Map className="w-4 h-4" />,           to: '/atendimentos/mapa' },
        ]
      },
      {
        label: 'Agenda', icon: <Calendar className="w-4 h-4" />, children: [
          { label: 'Calendário',    icon: <Calendar className="w-4 h-4" />,     to: '/agenda',              recurso: 'agenda' },
          { label: 'Agendamentos', icon: <ClipboardList className="w-4 h-4" />, to: '/agenda/agendamentos', recurso: 'agenda-agendamentos' },
        ]
      },
      { label: 'Monitor Atendimentos', icon: <Monitor className="w-4 h-4" />, to: '/monitor', recurso: 'monitor' },
    ]
  },
  {
    group: 'CLIENTES',
    items: [
      { label: 'Clientes',         icon: <Users className="w-4 h-4" />,    to: '/clientes',         recurso: 'clientes' },
      { label: 'Monitor Clientes', icon: <BarChart3 className="w-4 h-4" />,to: '/clientes/monitor', recurso: 'monitor-clientes' },
      {
        label: 'Implantação', icon: <GitBranch className="w-4 h-4" />, recurso: 'implantacao', children: [
          { label: 'Pipeline',       icon: <GitBranch className="w-4 h-4" />,    to: '/implantacao',                  recurso: 'implantacao' },
          { label: 'Acompanhamento', icon: <ClipboardList className="w-4 h-4" />,to: '/implantacao/acompanhamento',   recurso: 'implantacao-acompanhamento' },
          { label: 'Orçamento',      icon: <Receipt className="w-4 h-4" />,      to: '/implantacao/orcamento',        recurso: 'implantacao-orcamento' },
        ]
      },
      {
        label: 'CRM / Negócios', icon: <Briefcase className="w-4 h-4" />, children: [
          { label: 'Negócios',          icon: <TrendingUp className="w-4 h-4" />, to: '/crm',       recurso: 'crm' },
          { label: 'Pesquisa de Leads', icon: <BookUser className="w-4 h-4" />,   to: '/crm/leads', recurso: 'crm-leads' },
        ]
      },
      { label: 'Contadores', icon: <BookUser className="w-4 h-4" />, to: '/contadores', recurso: 'contadores' },
    ]
  },
  {
    group: 'FINANCEIRO',
    items: [
      { label: 'Análise Financeira', icon: <DollarSign className="w-4 h-4" />, to: '/financeiro', recurso: 'financeiro' },
      { label: 'Comissões',          icon: <Award className="w-4 h-4" />,      to: '/comissoes',  recurso: 'comissoes' },
      {
        label: 'Planos', icon: <Package className="w-4 h-4" />, recurso: 'planos', children: [
          { label: 'Catálogo de Planos', icon: <ShoppingBag className="w-4 h-4" />, to: '/planos' },
          { label: 'Assinaturas',        icon: <FileText className="w-4 h-4" />,    to: '/planos/assinaturas' },
        ]
      },
    ]
  },
  {
    group: 'DESENVOLVIMENTO',
    items: [
      { label: 'Tarefas Dev',       icon: <Code2 className="w-4 h-4" />, to: '/desenvolvimento', recurso: 'desenvolvimento' },
      { label: 'Versões e Licenças',icon: <Tag className="w-4 h-4" />,   to: '/versoes',         recurso: 'versoes' },
    ]
  },
  {
    group: 'MARKETING',
    items: [
      { label: 'Campanhas', icon: <Megaphone className="w-4 h-4" />, to: '/campanhas', recurso: 'campanhas' },
      { label: 'Vídeos',    icon: <Video className="w-4 h-4" />,     to: '/videos',    recurso: 'videos' },
    ]
  },
  {
    group: 'METAS',
    items: [
      { label: 'Metas e NPS', icon: <Target className="w-4 h-4" />, to: '/metas', recurso: 'metas' },
    ]
  },
  {
    group: 'RH',
    items: [
      { label: 'Banco de Horas', icon: <Clock className="w-4 h-4" />, to: '/banco-horas', recurso: 'banco-horas' },
    ]
  },
  {
    group: 'INFRAESTRUTURA',
    items: [
      { label: 'Servidores em Nuvem', icon: <Server className="w-4 h-4" />,      to: '/servidores',    recurso: 'servidores' },
      { label: 'Grupos de Acesso',    icon: <ShieldCheck className="w-4 h-4" />, to: '/grupos-acesso', recurso: 'grupos-acesso' },
      { label: 'Configurações',       icon: <Settings className="w-4 h-4" />,    to: '/configuracoes', recurso: 'configuracoes' },
    ]
  },
]

function filterItems(items: NavItem[], can: (r: string) => boolean): NavItem[] {
  return items
    .filter(item => !item.recurso || can(item.recurso))
    .map(item => {
      if (!item.children) return item
      const filteredChildren = filterItems(item.children, can)
      return { ...item, children: filteredChildren }
    })
    .filter(item => !item.children || item.children.length > 0)
}

function filterGroups(groups: typeof navGroups, can: (r: string) => boolean) {
  return groups
    .map(g => ({ ...g, items: filterItems(g.items, can) }))
    .filter(g => g.items.length > 0)
}

function NavItemComponent({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const [open, setOpen] = useState(false)

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={clsx('sidebar-link w-full', depth > 0 && 'pl-6')}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {open && (
          <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700">
            {item.children.map(child => (
              <NavItemComponent key={child.label} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to!}
      className={({ isActive }) =>
        clsx('sidebar-link', isActive && 'active', depth > 0 && 'text-xs py-2')
      }
    >
      {item.icon}
      <span>{item.label}</span>
    </NavLink>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const { can } = usePermissions()

  const visibleGroups = filterGroups(navGroups, can)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const iniciais = user?.nome
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CA'

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onToggle} />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 h-full bg-slate-900 border-r border-slate-800 z-30 flex flex-col transition-all duration-300',
          collapsed ? '-translate-x-full lg:translate-x-0 lg:w-16' : 'translate-x-0 w-64'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-800 min-h-[64px]">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Command className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-100 truncate">Command Analytics</p>
              <p className="text-xs text-slate-500 truncate">Cilos Sistema</p>
            </div>
          )}
          <button
            onClick={onToggle}
            className="ml-auto text-slate-400 hover:text-slate-100 p-1 rounded lg:flex hidden"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
          {visibleGroups.map(group => (
            <div key={group.group}>
              {!collapsed && (
                <p className="px-3 mb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                  {group.group}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item =>
                  collapsed ? (
                    item.to ? (
                      <NavLink
                        key={item.label}
                        to={item.to}
                        title={item.label}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-200',
                            isActive && 'text-white bg-blue-600 hover:bg-blue-600'
                          )
                        }
                      >
                        {item.icon}
                      </NavLink>
                    ) : (
                      <div key={item.label} title={item.label} className="flex items-center justify-center p-2.5 rounded-lg text-slate-400">
                        {item.icon}
                      </div>
                    )
                  ) : (
                    <NavItemComponent key={item.label} item={item} />
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={() => navigate('/perfil')}
            title="Meu Perfil"
            className={clsx(
              'flex items-center gap-2 px-2 py-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-200',
              collapsed && 'w-full justify-center'
            )}
          >
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{iniciais.slice(0, 1)}</span>
            </div>
            {!collapsed && <span className="text-sm font-medium truncate">{user?.nome?.split(' ')[0]}</span>}
          </button>
          <button
            onClick={handleLogout}
            title="Sair"
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 text-sm font-medium',
              collapsed ? 'w-full justify-center' : 'flex-1'
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
