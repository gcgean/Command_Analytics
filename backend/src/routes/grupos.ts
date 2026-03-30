import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// ─── Todos os recursos mapeados do sistema ────────────────────
export const SYSTEM_RESOURCES = [
  // OPERACIONAL
  { id: 'dashboard',                label: 'Dashboard',                       grupo: 'OPERACIONAL' },
  { id: 'atendimentos',             label: 'Atendimentos',                    grupo: 'OPERACIONAL' },
  { id: 'agenda',                   label: 'Agenda — Calendário',             grupo: 'OPERACIONAL' },
  { id: 'agenda-agendamentos',      label: 'Agenda — Agendamentos Programados', grupo: 'OPERACIONAL' },
  { id: 'monitor',                  label: 'Monitor de Atendimentos',         grupo: 'OPERACIONAL' },
  // CLIENTES
  { id: 'clientes',                 label: 'Clientes',                        grupo: 'CLIENTES' },
  { id: 'monitor-clientes',         label: 'Monitor de Clientes',             grupo: 'CLIENTES' },
  { id: 'implantacao',              label: 'Pipeline de Implantação',         grupo: 'CLIENTES' },
  { id: 'implantacao-orcamento',    label: 'Orçamento',                       grupo: 'CLIENTES' },
  { id: 'implantacao-acompanhamento', label: 'Acompanhamento Implantação',    grupo: 'CLIENTES' },
  { id: 'crm',                      label: 'CRM — Negócios',                  grupo: 'CLIENTES' },
  { id: 'crm-leads',                label: 'CRM — Pesquisa de Leads',         grupo: 'CLIENTES' },
  { id: 'contadores',               label: 'Contadores',                      grupo: 'CLIENTES' },
  // FINANCEIRO
  { id: 'financeiro',               label: 'Análise Financeira',              grupo: 'FINANCEIRO' },
  { id: 'comissoes',                label: 'Comissões',                       grupo: 'FINANCEIRO' },
  { id: 'planos',                   label: 'Planos e Assinaturas',            grupo: 'FINANCEIRO' },
  // DESENVOLVIMENTO
  { id: 'desenvolvimento',          label: 'Tarefas Dev',                     grupo: 'DESENVOLVIMENTO' },
  { id: 'versoes',                  label: 'Versões e Licenças',              grupo: 'DESENVOLVIMENTO' },
  // MARKETING
  { id: 'campanhas',                label: 'Campanhas',                       grupo: 'MARKETING' },
  { id: 'videos',                   label: 'Vídeos',                          grupo: 'MARKETING' },
  // METAS
  { id: 'boletim-comercial',        label: 'Boletim Comercial',               grupo: 'METAS' },
  // RH
  { id: 'banco-horas',              label: 'Banco de Horas',                  grupo: 'RH' },
  // SISTEMA
  { id: 'servidores',               label: 'Servidores em Nuvem',             grupo: 'INFRAESTRUTURA' },
  { id: 'configuracoes',            label: 'Configurações',                   grupo: 'INFRAESTRUTURA' },
  { id: 'cadastro-etapas',          label: 'Cadastro de Etapas',              grupo: 'INFRAESTRUTURA' },
  { id: 'cadastro-checklists',      label: 'Cadastro de Checklist',           grupo: 'INFRAESTRUTURA' },
  { id: 'cadastro-checklists-editar', label: 'Cadastro de Checklist — Criar/Editar', grupo: 'INFRAESTRUTURA' },
  { id: 'usuarios',                 label: 'Usuários',                        grupo: 'INFRAESTRUTURA' },
  { id: 'grupos-acesso',            label: 'Grupos de Acesso',                grupo: 'INFRAESTRUTURA' },
]

// ─── Helper: busca permissões efetivas de um usuário ─────────
export async function getUserPermissions(usuarioId: number): Promise<string[]> {
  // Check if user is in any super group
  const superCheck: any[] = await prisma.$queryRaw`
    SELECT g.id FROM grupo_acesso g
    INNER JOIN usuario_grupo ug ON ug.grupo_id = g.id
    WHERE ug.usuario_id = ${usuarioId} AND g.super_grupo = 1 AND g.ativo = 1
    LIMIT 1
  `
  if (superCheck.length > 0) return ['*']

  // Collect all resources from all active groups the user belongs to
  const perms: any[] = await prisma.$queryRaw`
    SELECT DISTINCT gp.recurso
    FROM grupo_permissao gp
    INNER JOIN usuario_grupo ug ON ug.grupo_id = gp.grupo_id
    INNER JOIN grupo_acesso g ON g.id = gp.grupo_id
    WHERE ug.usuario_id = ${usuarioId} AND g.ativo = 1
  `
  return perms.map(p => String(p.recurso))
}

export async function gruposRoutes(app: FastifyInstance) {
  // GET /grupos — lista todos os grupos com contagem
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async () => {
    const grupos: any[] = await prisma.$queryRaw`
      SELECT g.id, g.nome, g.descricao, g.super_grupo AS superGrupo, g.ativo, g.data_criacao AS dataCriacao,
             COUNT(DISTINCT ug.usuario_id) AS totalUsuarios,
             COUNT(DISTINCT gp.recurso) AS totalPermissoes
      FROM grupo_acesso g
      LEFT JOIN usuario_grupo ug ON ug.grupo_id = g.id
      LEFT JOIN grupo_permissao gp ON gp.grupo_id = g.id
      GROUP BY g.id
      ORDER BY g.super_grupo DESC, g.nome ASC
    `
    // Convert BigInt (returned by COUNT) to Number for JSON serialization
    return grupos.map(g => ({
      ...g,
      id: Number(g.id),
      superGrupo: Number(g.superGrupo),
      ativo: Number(g.ativo),
      totalUsuarios: Number(g.totalUsuarios),
      totalPermissoes: Number(g.totalPermissoes),
    }))
  })

  // GET /grupos/recursos — lista todos os recursos do sistema
  app.get('/recursos', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async () => {
    return SYSTEM_RESOURCES
  })

  // GET /grupos/:id — detalhes do grupo com usuários e permissões
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const grupos: any[] = await prisma.$queryRaw`
      SELECT id, nome, descricao, super_grupo AS superGrupo, ativo FROM grupo_acesso WHERE id = ${Number(id)}
    `
    if (!grupos.length) return reply.status(404).send({ error: 'Grupo não encontrado.' })

    const permissoes: any[] = await prisma.$queryRaw`
      SELECT recurso FROM grupo_permissao WHERE grupo_id = ${Number(id)}
    `
    const usuarios: any[] = await prisma.$queryRaw`
      SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, u.NOME_USU AS usuario
      FROM usuario_grupo ug
      INNER JOIN usuario u ON u.COD_USU = ug.usuario_id
      WHERE ug.grupo_id = ${Number(id)}
      ORDER BY nome
    `
    return {
      ...grupos[0],
      id: Number(grupos[0].id),
      superGrupo: Number(grupos[0].superGrupo),
      ativo: Number(grupos[0].ativo),
      permissoes: permissoes.map(p => String(p.recurso)),
      usuarios: usuarios.map(u => ({ ...u, id: Number(u.id) })),
    }
  })

  // POST /grupos — criar grupo
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { nome, descricao, superGrupo } = request.body as { nome: string; descricao?: string; superGrupo?: boolean }
    if (!nome) return reply.status(400).send({ error: 'Nome é obrigatório.' })
    const result: any = await prisma.$executeRaw`
      INSERT INTO grupo_acesso (nome, descricao, super_grupo, ativo) VALUES (${nome}, ${descricao ?? null}, ${superGrupo ? 1 : 0}, 1)
    `
    const [novo]: any[] = await prisma.$queryRaw`SELECT id FROM grupo_acesso ORDER BY id DESC LIMIT 1`
    return reply.status(201).send({ id: novo.id, nome, descricao, superGrupo: !!superGrupo })
  })

  // PUT /grupos/:id — atualizar grupo
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { nome, descricao, superGrupo, ativo } = request.body as { nome?: string; descricao?: string; superGrupo?: boolean; ativo?: boolean }
    if (nome !== undefined) await prisma.$executeRaw`UPDATE grupo_acesso SET nome = ${nome} WHERE id = ${Number(id)}`
    if (descricao !== undefined) await prisma.$executeRaw`UPDATE grupo_acesso SET descricao = ${descricao} WHERE id = ${Number(id)}`
    if (superGrupo !== undefined) await prisma.$executeRaw`UPDATE grupo_acesso SET super_grupo = ${superGrupo ? 1 : 0} WHERE id = ${Number(id)}`
    if (ativo !== undefined) await prisma.$executeRaw`UPDATE grupo_acesso SET ativo = ${ativo ? 1 : 0} WHERE id = ${Number(id)}`
    return { ok: true }
  })

  // DELETE /grupos/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRaw`DELETE FROM usuario_grupo WHERE grupo_id = ${Number(id)}`
    await prisma.$executeRaw`DELETE FROM grupo_permissao WHERE grupo_id = ${Number(id)}`
    await prisma.$executeRaw`DELETE FROM grupo_acesso WHERE id = ${Number(id)}`
    return reply.status(204).send()
  })

  // PUT /grupos/:id/permissoes — substituir lista de permissões
  app.put('/:id/permissoes', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { recursos } = request.body as { recursos: string[] }
    await prisma.$executeRaw`DELETE FROM grupo_permissao WHERE grupo_id = ${Number(id)}`
    for (const recurso of recursos) {
      await prisma.$executeRaw`INSERT IGNORE INTO grupo_permissao (grupo_id, recurso) VALUES (${Number(id)}, ${recurso})`
    }
    return { ok: true }
  })

  // POST /grupos/:id/usuarios — adicionar usuário ao grupo
  app.post('/:id/usuarios', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { usuarioId } = request.body as { usuarioId: number }
    await prisma.$executeRaw`INSERT IGNORE INTO usuario_grupo (usuario_id, grupo_id) VALUES (${usuarioId}, ${Number(id)})`
    return reply.status(201).send({ ok: true })
  })

  // DELETE /grupos/:id/usuarios/:usuarioId — remover usuário do grupo
  app.delete('/:id/usuarios/:usuarioId', { preHandler: authMiddleware, schema: { tags: ['Grupos'] } }, async (request, reply) => {
    const { id, usuarioId } = request.params as { id: string; usuarioId: string }
    await prisma.$executeRaw`DELETE FROM usuario_grupo WHERE grupo_id = ${Number(id)} AND usuario_id = ${Number(usuarioId)}`
    return reply.status(204).send()
  })
}
