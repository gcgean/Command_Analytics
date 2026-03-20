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
import { initAuditoria } from './utils/auditoria'

const app = Fastify({ logger: process.env.NODE_ENV === 'development' })

// ─── Plugins ──────────────────────────────────────────────────
app.register(cors, {
  origin: true,
  credentials: true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'command-analytics-secret',
  sign: { expiresIn: '8h' },
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
      { name: 'Auditoria', description: 'Histórico de alterações' },
    ],
  },
})

app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
})

// ─── Health Check ──────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }))

// ─── Routes ────────────────────────────────────────────────────
app.register(authRoutes,       { prefix: '/auth' })
app.register(usuariosRoutes,   { prefix: '/usuarios' })
app.register(clientesRoutes,   { prefix: '/clientes' })
app.register(atendimentosRoutes, { prefix: '/atendimentos' })
app.register(agendaRoutes,     { prefix: '/agenda' })
app.register(planosRoutes,     { prefix: '/planos' })
app.register(pipelineRoutes,   { prefix: '/pipeline' })
app.register(crmRoutes,        { prefix: '/crm' })
app.register(financeiroRoutes, { prefix: '/financeiro' })
app.register(tarefasRoutes,    { prefix: '/tarefas' })
app.register(videosRoutes,     { prefix: '/videos' })
app.register(metasRoutes,      { prefix: '/metas' })
app.register(monitorRoutes,    { prefix: '/monitor' })
app.register(campanhasRoutes,  { prefix: '/campanhas' })
app.register(contadoresRoutes, { prefix: '/contadores' })
app.register(versoesRoutes,    { prefix: '/versoes' })
app.register(servidoresRoutes, { prefix: '/servidores' })
app.register(dashboardRoutes,  { prefix: '/dashboard' })
app.register(gruposRoutes,     { prefix: '/grupos' })
app.register(auditoriaRoutes,  { prefix: '/auditoria' })

// ─── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3333

app.listen({ port: PORT, host: '0.0.0.0' }, async (err) => {
  if (err) { app.log.error(err); process.exit(1) }
  console.log(`\n🚀 Command Analytics API rodando em http://localhost:${PORT}`)
  console.log(`📖 Documentação Swagger: http://localhost:${PORT}/docs`)
  console.log(`💾 Banco de dados: SQLite (${process.env.DATABASE_URL})`)
  // Garante que a tabela de auditoria existe
  initAuditoria()
    .then(() => console.log('✓ Tabela de auditoria verificada'))
    .catch(e => console.warn('⚠ Auditoria init:', e.message))
})
