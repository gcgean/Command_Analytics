import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

// Routes
import { authRoutes } from './routes/auth'
import { clientesRoutes } from './routes/clientes'
import { atendimentosRoutes } from './routes/atendimentos'
import { agendaRoutes } from './routes/agenda'
import { planosRoutes } from './routes/planos'
import { pipelineRoutes } from './routes/pipeline'
import { crmRoutes } from './routes/crm'
import { financeiroRoutes } from './routes/financeiro'
import { tarefasRoutes } from './routes/tarefas'
import { videosRoutes } from './routes/videos'
import { metasRoutes } from './routes/metas'
import { monitorRoutes } from './routes/monitor'
import { campanhasRoutes } from './routes/campanhas'
import { contadoresRoutes } from './routes/contadores'
import { versoesRoutes } from './routes/versoes'
import { servidoresRoutes } from './routes/servidores'
import { dashboardRoutes } from './routes/dashboard'
import { usuariosRoutes } from './routes/usuarios'
import { gruposRoutes } from './routes/grupos'
import { auditoriaRoutes } from './routes/auditoria'
import { telegramRoutes } from './routes/telegram'
import { etapasRoutes } from './routes/etapas'
import { checklistsRoutes } from './routes/checklists'
import { procedimentosRoutes } from './routes/procedimentos'
import { initAuditoria } from './utils/auditoria'
import { initEtapas } from './utils/etapas'
import { initChecklists } from './utils/checklists'
import { initProcedimentos } from './utils/procedimentos'

const app = Fastify({ logger: process.env.NODE_ENV === 'development' })
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'

// ─── Plugins ──────────────────────────────────────────────────
app.register(cors, {
  origin: true,
  credentials: true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'command-analytics-secret',
  sign: { expiresIn: JWT_EXPIRES_IN },
})

app.register(swagger, {
  openapi: {
    info: { title: 'Command Analytics API', version: '1.0.0', description: 'API interna do sistema Command Analytics (Cilos Sistema)' },
    tags: [
      { name: 'Auth', description: 'Autenticação' },
      { name: 'Clientes', description: 'Gestão de clientes' },
      { name: 'Atendimentos', description: 'Suporte e atendimentos' },
      { name: 'Agenda', description: 'Agenda de visitas e treinamentos' },
      { name: 'Planos', description: 'Planos e assinaturas' },
      { name: 'Pipeline', description: 'Implantação / pipeline' },
      { name: 'CRM', description: 'Negócios e leads' },
      { name: 'Financeiro', description: 'Análise financeira e comissões' },
      { name: 'Tarefas', description: 'Desenvolvimento' },
      { name: 'Vídeos', description: 'Vídeos de treinamento' },
      { name: 'Metas', description: 'Metas e NPS' },
      { name: 'Monitor', description: 'Monitor de atendimentos em tempo real' },
      { name: 'Campanhas', description: 'Campanhas de marketing' },
      { name: 'Contadores', description: 'Contadores parceiros' },
      { name: 'Versões', description: 'Versões e licenças' },
      { name: 'Servidores', description: 'Infraestrutura em nuvem' },
      { name: 'Dashboard', description: 'KPIs do dashboard' },
      { name: 'Usuários', description: 'Gestão de usuários' },
      { name: 'Etapas', description: 'Cadastro de etapas customizadas' },
      { name: 'Checklists', description: 'Cadastro de checklists customizados' },
      { name: 'Procedimentos', description: 'Cadastro de procedimentos com duração' },
      { name: 'Auditoria', description: 'Histórico de alterações' },
    ],
  },
})

app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
})

// ─── API prefix ────────────────────────────────────────────────
app.register(async (api) => {
  // Health check dentro do prefixo
  api.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }))

  // Rotas da aplicação
  api.register(authRoutes,         { prefix: '/auth' })
  api.register(usuariosRoutes,     { prefix: '/usuarios' })
  api.register(clientesRoutes,     { prefix: '/clientes' })
  api.register(atendimentosRoutes, { prefix: '/atendimentos' })
  api.register(agendaRoutes,       { prefix: '/agenda' })
  api.register(planosRoutes,       { prefix: '/planos' })
  api.register(pipelineRoutes,     { prefix: '/pipeline' })
  api.register(crmRoutes,          { prefix: '/crm' })
  api.register(financeiroRoutes,   { prefix: '/financeiro' })
  api.register(tarefasRoutes,      { prefix: '/tarefas' })
  api.register(videosRoutes,       { prefix: '/videos' })
  api.register(metasRoutes,        { prefix: '/metas' })
  api.register(monitorRoutes,      { prefix: '/monitor' })
  api.register(campanhasRoutes,    { prefix: '/campanhas' })
  api.register(contadoresRoutes,   { prefix: '/contadores' })
  api.register(versoesRoutes,      { prefix: '/versoes' })
  api.register(servidoresRoutes,   { prefix: '/servidores' })
  api.register(dashboardRoutes,    { prefix: '/dashboard' })
  api.register(gruposRoutes,       { prefix: '/grupos' })
  api.register(auditoriaRoutes,    { prefix: '/auditoria' })
  api.register(telegramRoutes,     { prefix: '/telegram' })
  api.register(etapasRoutes,       { prefix: '/etapas' })
  api.register(checklistsRoutes,   { prefix: '/checklists' })
  api.register(procedimentosRoutes,{ prefix: '/procedimentos' })
}, { prefix: '/api' })

// ─── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3333

app.listen({ port: PORT, host: '0.0.0.0' }, async (err) => {
  if (err) { app.log.error(err); process.exit(1) }
  console.log(`\n🚀 Command Analytics API rodando em http://localhost:${PORT}`)
  console.log(`📖 Documentação Swagger: http://localhost:${PORT}/docs`)
  console.log(`💾 Banco de dados: SQLite (${process.env.DATABASE_URL})`)
  console.log(`🔐 Expiração do token JWT: ${JWT_EXPIRES_IN}`)
  // Garante que a tabela de auditoria existe
  initAuditoria()
    .then(() => console.log('✓ Tabela de auditoria verificada'))
    .catch(e => console.warn('⚠ Auditoria init:', e.message))
  initEtapas()
    .then(() => console.log('✓ Tabela de cadastro de etapas verificada'))
    .catch(e => console.warn('⚠ Etapas init:', e.message))
  initChecklists()
    .then(() => console.log('✓ Tabela de cadastro de checklists verificada'))
    .catch(e => console.warn('⚠ Checklists init:', e.message))
  initProcedimentos()
    .then(() => console.log('✓ Tabela de cadastro de procedimentos verificada'))
    .catch(e => console.warn('⚠ Procedimentos init:', e.message))
})
