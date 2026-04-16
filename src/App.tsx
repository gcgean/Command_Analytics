import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { MainLayout } from './components/layout/MainLayout'
import type { Usuario } from './types'

// Auth
import { Login } from './pages/auth/Login'
import { AlterarSenha } from './pages/auth/AlterarSenha'

// Dashboard
import { Dashboard } from './pages/dashboard/Dashboard'

// Atendimentos
import { Atendimentos } from './pages/atendimentos/Atendimentos'
import { NovoAtendimento } from './pages/atendimentos/NovoAtendimento'
import { HistoricoAtendimentos } from './pages/atendimentos/HistoricoAtendimentos'
import { MapaAtendimentos } from './pages/atendimentos/MapaAtendimentos'

// Agenda
import { Agenda } from './pages/agenda/Agenda'
import { AgendamentoProgramado } from './pages/agenda/AgendamentoProgramado'

// Clientes
import { Clientes } from './pages/clientes/Clientes'
import { DetalheCliente } from './pages/clientes/DetalheCliente'
import { MonitorClientes } from './pages/clientes/MonitorClientes'

// Planos
import { Planos } from './pages/planos/Planos'
import { AssinaturaCliente } from './pages/planos/AssinaturaCliente'

// Implantação
import { Pipeline } from './pages/implantacao/Pipeline'
import { Orcamento } from './pages/implantacao/Orcamento'
import { AcompImplantacao } from './pages/implantacao/AcompImplantacao'
import { DashboardImplantacao } from './pages/implantacao/DashboardImplantacao'

// CRM
import { Negocios } from './pages/crm/Negocios'
import { PesquisaLeads } from './pages/crm/PesquisaLeads'

// Financeiro
import { AnaliseFinanceira } from './pages/financeiro/AnaliseFinanceira'

// Comissões
import { Comissoes } from './pages/comissoes/Comissoes'

// Desenvolvimento
import { Tarefas } from './pages/desenvolvimento/Tarefas'

// Vídeos
import { Videos } from './pages/videos/Videos'

// Metas
import { Metas } from './pages/metas/Metas'

// Monitor
import { MonitorAtendimentos } from './pages/monitor/MonitorAtendimentos'

// Campanhas
import { Campanhas } from './pages/campanhas/Campanhas'

// Contadores
import { Contadores } from './pages/contadores/Contadores'

// Versões
import { Versoes } from './pages/versoes/Versoes'

// Servidores
import { Servidores } from './pages/servidores/Servidores'

// RH
import { BancoHoras } from './pages/rh/BancoHoras'

// Configurações
import { Configuracoes } from './pages/configuracoes/Configuracoes'
import { Usuarios } from './pages/configuracoes/Usuarios'
import { CadastroEtapas } from './pages/configuracoes/CadastroEtapas'
import { CadastroChecklists } from './pages/configuracoes/CadastroChecklists'
import { CadastroProcedimentos } from './pages/configuracoes/CadastroProcedimentos'

// Perfil
import { Perfil } from './pages/perfil/Perfil'

// Grupos de Acesso
import { GruposAcesso } from './pages/grupos/GruposAcesso'

// 404
import { NotFound } from './pages/NotFound'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function userCan(user: Usuario | null, recurso: string | string[]) {
  const permissoes: string[] = (user as any)?.permissoes ?? []
  if (permissoes.includes('*')) return true
  const recursos = Array.isArray(recurso) ? recurso : [recurso]
  return recursos.some((r) => {
    if (r === 'boletim-comercial') return permissoes.includes('boletim-comercial') || permissoes.includes('metas')
    if (r === 'metas') return permissoes.includes('metas') || permissoes.includes('boletim-comercial')
    return permissoes.includes(r)
  })
}

function PermissionRoute({
  children,
  recurso,
}: {
  children: React.ReactNode
  recurso: string | string[]
}) {
  const user = useAuthStore(s => s.user)
  if (!userCan(user, recurso)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useThemeStore(s => s.theme)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const refreshSession = useAuthStore(s => s.refreshSession)
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  useEffect(() => {
    if (!isAuthenticated) return

    const runRefresh = async () => {
      try {
        await refreshSession()
      } catch (err: any) {
        const message = String(err?.message ?? '')
        if (message.includes('401') || message.toLowerCase().includes('token')) {
          logout()
        }
      }
    }

    const onFocus = () => { void runRefresh() }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runRefresh()
      }
    }

    void runRefresh()
    const intervalId = window.setInterval(() => { void runRefresh() }, 30 * 60 * 1000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated, refreshSession, logout])

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

      {/* Alterar senha — standalone page (sem layout de sidebar) */}
      <Route path="/alterar-senha" element={<ProtectedRoute><AlterarSenha /></ProtectedRoute>} />

      {/* Protected routes */}
      <Route
        path="/"
        element={<ProtectedRoute><MainLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        <Route path="atendimentos" element={<Atendimentos />} />
        <Route path="atendimentos/novo" element={<NovoAtendimento />} />
        <Route path="atendimentos/historico" element={<HistoricoAtendimentos />} />
        <Route path="atendimentos/mapa" element={<MapaAtendimentos />} />

        <Route path="agenda" element={<PermissionRoute recurso="agenda"><Agenda /></PermissionRoute>} />
        <Route path="agenda/agendamentos" element={<PermissionRoute recurso="agenda-agendamentos"><AgendamentoProgramado /></PermissionRoute>} />

        <Route path="clientes" element={<PermissionRoute recurso="clientes"><Clientes /></PermissionRoute>} />
        <Route path="clientes/:id" element={<DetalheCliente />} />
        <Route path="clientes/monitor" element={<PermissionRoute recurso="monitor-clientes"><MonitorClientes /></PermissionRoute>} />

        <Route path="planos" element={<PermissionRoute recurso="planos"><Planos /></PermissionRoute>} />
        <Route path="planos/assinaturas" element={<PermissionRoute recurso="planos"><AssinaturaCliente /></PermissionRoute>} />

        <Route path="implantacao" element={<PermissionRoute recurso="implantacao"><Pipeline /></PermissionRoute>} />
        <Route path="implantacao/dashboard" element={<PermissionRoute recurso="implantacao"><DashboardImplantacao /></PermissionRoute>} />
        <Route path="implantacao/orcamento" element={<PermissionRoute recurso="implantacao-orcamento"><Orcamento /></PermissionRoute>} />
        <Route path="implantacao/acompanhamento" element={<PermissionRoute recurso="implantacao-acompanhamento"><AcompImplantacao /></PermissionRoute>} />

        <Route path="crm" element={<PermissionRoute recurso="crm"><Negocios /></PermissionRoute>} />
        <Route path="crm/leads" element={<PermissionRoute recurso="crm-leads"><PesquisaLeads /></PermissionRoute>} />

        <Route path="financeiro" element={<PermissionRoute recurso="financeiro"><AnaliseFinanceira /></PermissionRoute>} />
        <Route path="comissoes" element={<PermissionRoute recurso="comissoes"><Comissoes /></PermissionRoute>} />
        <Route path="desenvolvimento" element={<PermissionRoute recurso="desenvolvimento"><Tarefas /></PermissionRoute>} />
        <Route path="videos" element={<PermissionRoute recurso="videos"><Videos /></PermissionRoute>} />
        <Route path="metas" element={<PermissionRoute recurso={['boletim-comercial', 'metas']}><Metas /></PermissionRoute>} />
        <Route path="monitor" element={<PermissionRoute recurso="monitor"><MonitorAtendimentos /></PermissionRoute>} />
        <Route path="campanhas" element={<PermissionRoute recurso="campanhas"><Campanhas /></PermissionRoute>} />
        <Route path="contadores" element={<PermissionRoute recurso="contadores"><Contadores /></PermissionRoute>} />
        <Route path="versoes" element={<PermissionRoute recurso="versoes"><Versoes /></PermissionRoute>} />
        <Route path="servidores" element={<PermissionRoute recurso="servidores"><Servidores /></PermissionRoute>} />

        <Route path="banco-horas" element={<PermissionRoute recurso="banco-horas"><BancoHoras /></PermissionRoute>} />
        <Route path="configuracoes" element={<PermissionRoute recurso="configuracoes"><Configuracoes /></PermissionRoute>} />
        <Route path="cadastro-etapas" element={<PermissionRoute recurso="cadastro-etapas"><CadastroEtapas /></PermissionRoute>} />
        <Route path="cadastro-procedimentos" element={<PermissionRoute recurso="cadastro-procedimentos"><CadastroProcedimentos /></PermissionRoute>} />
        <Route path="cadastro-checklists" element={<PermissionRoute recurso={['cadastro-checklists', 'cadastro-checklists-editar']}><CadastroChecklists /></PermissionRoute>} />
        <Route path="usuarios" element={<PermissionRoute recurso="usuarios"><Usuarios /></PermissionRoute>} />
        <Route path="grupos-acesso" element={<PermissionRoute recurso="grupos-acesso"><GruposAcesso /></PermissionRoute>} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
