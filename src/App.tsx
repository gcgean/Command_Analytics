import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { MainLayout } from './components/layout/MainLayout'

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

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
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

        <Route path="agenda" element={<Agenda />} />
        <Route path="agenda/agendamentos" element={<AgendamentoProgramado />} />

        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<DetalheCliente />} />
        <Route path="clientes/monitor" element={<MonitorClientes />} />

        <Route path="planos" element={<Planos />} />
        <Route path="planos/assinaturas" element={<AssinaturaCliente />} />

        <Route path="implantacao" element={<Pipeline />} />
        <Route path="implantacao/orcamento" element={<Orcamento />} />
        <Route path="implantacao/acompanhamento" element={<AcompImplantacao />} />

        <Route path="crm" element={<Negocios />} />
        <Route path="crm/leads" element={<PesquisaLeads />} />

        <Route path="financeiro" element={<AnaliseFinanceira />} />
        <Route path="comissoes" element={<Comissoes />} />
        <Route path="desenvolvimento" element={<Tarefas />} />
        <Route path="videos" element={<Videos />} />
        <Route path="metas" element={<Metas />} />
        <Route path="monitor" element={<MonitorAtendimentos />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="contadores" element={<Contadores />} />
        <Route path="versoes" element={<Versoes />} />
        <Route path="servidores" element={<Servidores />} />

        <Route path="banco-horas" element={<BancoHoras />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="grupos-acesso" element={<GruposAcesso />} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
