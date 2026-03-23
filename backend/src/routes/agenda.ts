import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'

const nomeTecnico = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

export async function agendaRoutes(app: FastifyInstance) {
  // GET /agenda
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { data, dataInicio, dataFim, tecnicoId, status, clienteId, tipo } = request.query as Record<string, string>

    const where: Record<string, any> = {}
    if (tecnicoId) where.tecnicoId = Number(tecnicoId)
    if (clienteId) where.clienteId = Number(clienteId)
    if (status !== undefined) where.status = Number(status)
    if (tipo) where.tipo = tipo

    // Filtro por data exata (dia)
    if (data) {
      const d = new Date(data)
      d.setHours(0, 0, 0, 0)
      const proximo = new Date(d)
      proximo.setDate(proximo.getDate() + 1)
      where.data = { gte: d, lt: proximo }
    } else if (dataInicio || dataFim) {
      where.data = {}
      if (dataInicio) where.data.gte = new Date(dataInicio)
      if (dataFim) {
        const fim = new Date(dataFim)
        fim.setDate(fim.getDate() + 1)
        where.data.lt = fim
      }
    }

    // Build dynamic WHERE conditions for agenda table
    const condA: Prisma.Sql[] = []
    if (tecnicoId) condA.push(Prisma.sql`a.cod_colaborador = ${Number(tecnicoId)}`)
    if (clienteId) condA.push(Prisma.sql`a.cod_cli = ${Number(clienteId)}`)
    if (status !== undefined) condA.push(Prisma.sql`a.Status_agendamento = ${Number(status)}`)
    if (tipo) condA.push(Prisma.sql`a.Tipo = ${tipo}`)
    if (data) {
      condA.push(Prisma.sql`a.data_agendamento = ${new Date(data + 'T12:00:00Z')}`)
    } else {
      if (dataInicio) condA.push(Prisma.sql`a.data_agendamento >= ${new Date(dataInicio + 'T00:00:00Z')}`)
      if (dataFim) condA.push(Prisma.sql`a.data_agendamento <= ${new Date(dataFim + 'T23:59:59Z')}`)
    }
    const whereA = condA.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condA, ' AND ')}` : Prisma.empty

    // Build dynamic WHERE conditions for agendamento_programado table
    const condP: Prisma.Sql[] = [Prisma.sql`p.status <> 3`]  // exclude cancelled
    if (tecnicoId) condP.push(Prisma.sql`p.cod_tecnico = ${Number(tecnicoId)}`)
    if (clienteId) condP.push(Prisma.sql`p.cod_cli = ${Number(clienteId)}`)
    if (data) {
      condP.push(Prisma.sql`p.data_agendamento = ${new Date(data + 'T12:00:00Z')}`)
    } else {
      if (dataInicio) condP.push(Prisma.sql`p.data_agendamento >= ${new Date(dataInicio + 'T00:00:00Z')}`)
      if (dataFim) condP.push(Prisma.sql`p.data_agendamento <= ${new Date(dataFim + 'T23:59:59Z')}`)
    }
    const whereP = Prisma.sql`WHERE ${Prisma.join(condP, ' AND ')}`

    const items: any[] = await prisma.$queryRaw`
      SELECT a.cod_agenda AS id, a.cod_cli AS clienteId, a.cod_colaborador AS tecnicoId,
             a.Tipo AS tipo, a.Status_agendamento AS status,
             a.data_agendamento AS data, a.hora_ini AS horarioIni, a.data_fin_agendamento AS dataFim, a.hora_fin AS horarioFim,
             a.descricao AS observacoes,
             a.criado_por AS criadoPorId, a.data_criacao AS dataCriacao,
             COALESCE(cli.NOME_FANTASIA, cli.NOME_CLI) AS clienteNome,
             COALESCE(tec.NOME_USUARIO_COMPLETO, tec.NOME_USU) AS tecnicoNome,
             COALESCE(cri.NOME_USUARIO_COMPLETO, cri.NOME_USU) AS criadoPorNome,
             'agenda' AS origem
      FROM agenda a
      LEFT JOIN cliente cli ON cli.COD_CLI = a.cod_cli
      LEFT JOIN usuario tec ON tec.COD_USU = a.cod_colaborador
      LEFT JOIN usuario cri ON cri.COD_USU = a.criado_por
      ${whereA}

      UNION ALL

      SELECT p.id AS id, p.cod_cli AS clienteId, p.cod_tecnico AS tecnicoId,
             'Agendamento' AS tipo, p.status AS status,
             p.data_agendamento AS data, p.hora_inicio AS horarioIni, p.data_agendamento AS dataFim, NULL AS horarioFim,
             p.descricao AS observacoes,
             NULL AS criadoPorId, p.data_criacao AS dataCriacao,
             COALESCE(cliP.NOME_FANTASIA, cliP.NOME_CLI) AS clienteNome,
             COALESCE(tecP.NOME_USUARIO_COMPLETO, tecP.NOME_USU) AS tecnicoNome,
             NULL AS criadoPorNome,
             'programado' AS origem
      FROM agendamento_programado p
      LEFT JOIN cliente cliP ON cliP.COD_CLI = p.cod_cli
      LEFT JOIN usuario tecP ON tecP.COD_USU = p.cod_tecnico
      ${whereP}

      ORDER BY data ASC, horarioIni ASC
    `

    return items.map(a => ({
      ...a,
      id: Number(a.id),
      clienteId: a.clienteId ? Number(a.clienteId) : null,
      tecnicoId: a.tecnicoId ? Number(a.tecnicoId) : null,
      criadoPorId: a.criadoPorId ? Number(a.criadoPorId) : null,
      status: a.status != null ? Number(a.status) : null,
    }))
  })

  // ─── DISPONIBILIDADE DE TÉCNICOS ─────────────────────────────

  // GET /agenda/disponibilidade
  app.get('/disponibilidade', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async () => {
    return prisma.$queryRaw<any[]>`
      SELECT d.id, d.cod_tecnico AS tecnicoId, d.dias_semana AS diasSemana,
             d.hora_inicio AS horaInicio, d.hora_fim AS horaFim,
             d.intervalo_min AS intervaloMin, d.ativo,
             d.data_inicio AS dataInicio, d.data_fim AS dataFim,
             d.intervalo_ini AS intervaloIni, d.intervalo_fim AS intervaloFim,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
      FROM tecnico_disponibilidade d
      LEFT JOIN usuario u ON u.COD_USU = d.cod_tecnico
      ORDER BY tecnicoNome
    `
  })

  // POST /agenda/disponibilidade
  app.post('/disponibilidade', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, diasSemana, horaInicio, horaFim, intervaloMin, dataInicio, dataFim, intervaloIni, intervaloFim } = request.body as {
      tecnicoId: number; diasSemana: string; horaInicio: string; horaFim: string; intervaloMin: number
      dataInicio?: string | null; dataFim?: string | null; intervaloIni?: string | null; intervaloFim?: string | null
    }
    await prisma.$executeRaw`
      INSERT INTO tecnico_disponibilidade
        (cod_tecnico, dias_semana, hora_inicio, hora_fim, intervalo_min, ativo, data_inicio, data_fim, intervalo_ini, intervalo_fim)
      VALUES
        (${tecnicoId}, ${diasSemana}, ${horaInicio}, ${horaFim}, ${intervaloMin}, 1,
         ${dataInicio ?? null}, ${dataFim ?? null}, ${intervaloIni ?? null}, ${intervaloFim ?? null})
      ON DUPLICATE KEY UPDATE
        dias_semana = ${diasSemana}, hora_inicio = ${horaInicio},
        hora_fim = ${horaFim}, intervalo_min = ${intervaloMin}, ativo = 1,
        data_inicio = ${dataInicio ?? null}, data_fim = ${dataFim ?? null},
        intervalo_ini = ${intervaloIni ?? null}, intervalo_fim = ${intervaloFim ?? null}
    `
    return reply.status(201).send({ ok: true })
  })

  // DELETE /agenda/disponibilidade/:tecnicoId
  app.delete('/disponibilidade/:tecnicoId', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId } = request.params as { tecnicoId: string }
    await prisma.$executeRaw`DELETE FROM tecnico_disponibilidade WHERE cod_tecnico = ${Number(tecnicoId)}`
    return reply.status(204).send()
  })

  // ─── SLOTS DISPONÍVEIS ────────────────────────────────────────

  // GET /agenda/slots?tecnicoId=1&data=2026-03-20
  app.get('/slots', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, data } = request.query as { tecnicoId?: string; data?: string }
    if (!data) return reply.status(400).send({ error: 'data é obrigatório' })

    const dispRows: any[] = tecnicoId
      ? await prisma.$queryRaw`
          SELECT d.id, d.cod_tecnico, d.dias_semana, d.hora_inicio, d.hora_fim, d.intervalo_min,
                 d.data_inicio, d.data_fim, d.intervalo_ini, d.intervalo_fim,
                 COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
          FROM tecnico_disponibilidade d
          LEFT JOIN usuario u ON u.COD_USU = d.cod_tecnico
          WHERE d.cod_tecnico = ${Number(tecnicoId)} AND d.ativo = 1
        `
      : await prisma.$queryRaw`
          SELECT d.id, d.cod_tecnico, d.dias_semana, d.hora_inicio, d.hora_fim, d.intervalo_min,
                 d.data_inicio, d.data_fim, d.intervalo_ini, d.intervalo_fim,
                 COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
          FROM tecnico_disponibilidade d
          LEFT JOIN usuario u ON u.COD_USU = d.cod_tecnico
          WHERE d.ativo = 1
          ORDER BY tecnicoNome
        `

    if (!dispRows.length) return []

    const [y, m, d] = data.split('-').map(Number)
    const dataObj = new Date(y, m - 1, d)
    const diaSemana = dataObj.getDay()

    // Helper: parse "HH:MM" or Date (UTC) to minutes since midnight
    const strToMin = (val: any): number | null => {
      if (!val) return null
      const str = val instanceof Date
        ? `${String(val.getUTCHours()).padStart(2, '0')}:${String(val.getUTCMinutes()).padStart(2, '0')}`
        : String(val).substring(0, 5)
      const [h, min] = str.split(':').map(Number)
      if (isNaN(h)) return null
      return h * 60 + min
    }

    const result = []

    for (const disp of dispRows) {
      // Filter by validity period if set
      if (disp.data_inicio) {
        const ini = new Date(disp.data_inicio)
        if (dataObj < ini) continue
      }
      if (disp.data_fim) {
        const fim = new Date(disp.data_fim)
        fim.setHours(23, 59, 59)
        if (dataObj > fim) continue
      }

      const dias = String(disp.dias_semana).split(',').map(Number)
      if (!dias.includes(diaSemana)) continue

      const [hIni, mIni] = String(disp.hora_inicio).split(':').map(Number)
      const [hFim, mFim] = String(disp.hora_fim).split(':').map(Number)
      const startMin = hIni * 60 + mIni
      const endMin = hFim * 60 + (mFim || 0)
      const intervalo = Number(disp.intervalo_min) || 60

      // Lunch break range (if configured)
      const lunchIni = strToMin(disp.intervalo_ini)
      const lunchFim = strToMin(disp.intervalo_fim)

      const allSlots: string[] = []
      for (let min = startMin; min < endMin; min += intervalo) {
        // Skip slots that fall within the lunch break
        if (lunchIni !== null && lunchFim !== null && min >= lunchIni && min < lunchFim) continue
        allSlots.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
      }

      const tId = Number(disp.cod_tecnico)

      const agendaItems: any[] = await prisma.$queryRaw`
        SELECT hora_ini, hora_fin FROM agenda
        WHERE cod_colaborador = ${tId} AND DATE(data_agendamento) = ${data} AND hora_ini IS NOT NULL
      `

      const programados: any[] = await prisma.$queryRaw`
        SELECT hora_inicio, duracao_min FROM agendamento_programado
        WHERE cod_tecnico = ${tId} AND DATE(data_agendamento) = ${data} AND status = 1
      `

      // Bloqueios ativos para este técnico nesta data (bloqueio geral ou específico)
      const bloqueios: any[] = await prisma.$queryRaw`
        SELECT hora_ini, hora_fim FROM agendamento_bloqueio
        WHERE ativo = 1
          AND (cod_tecnico = ${tId} OR cod_tecnico IS NULL)
          AND data_ini <= ${data} AND data_fim >= ${data}
      `

      // Build occupied ranges [iniMin, finMin)
      const ranges: Array<{ iniMin: number; finMin: number }> = []
      for (const item of agendaItems) {
        const iniMin = strToMin(item.hora_ini)
        if (iniMin === null) continue
        const finMin = strToMin(item.hora_fin) ?? (iniMin + intervalo)
        ranges.push({ iniMin, finMin: finMin > iniMin ? finMin : iniMin + intervalo })
      }
      for (const ap of programados) {
        const iniMin = strToMin(ap.hora_inicio)
        if (iniMin === null) continue
        const finMin = iniMin + (Number(ap.duracao_min) || 60)
        ranges.push({ iniMin, finMin })
      }
      for (const bl of bloqueios) {
        const iniMin = strToMin(bl.hora_ini)
        const finMin = strToMin(bl.hora_fim)
        if (iniMin === null || finMin === null) continue
        ranges.push({ iniMin, finMin })
      }

      const isOccupied = (slot: string) => {
        const [h, m] = slot.split(':').map(Number)
        const slotMin = h * 60 + m
        return ranges.some(r => slotMin >= r.iniMin && slotMin < r.finMin)
      }

      result.push({
        tecnicoId: tId,
        tecnicoNome: disp.tecnicoNome,
        slotsDisponiveis: allSlots.filter(s => !isOccupied(s)),
        slotsOcupados: allSlots.filter(s => isOccupied(s)),
      })
    }

    return result
  })

  // ─── AGENDAMENTOS PROGRAMADOS ─────────────────────────────────

  // GET /agenda/agendamentos-prog
  app.get('/agendamentos-prog', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { tecnicoId, status } = request.query as Record<string, string>
    const rows: any[] = await prisma.$queryRaw`
      SELECT ap.id, ap.cod_tecnico AS tecnicoId, ap.cod_cli AS clienteId,
             ap.data_agendamento AS data, ap.hora_inicio AS horaInicio,
             ap.duracao_min AS duracao, ap.descricao, ap.status,
             ap.data_criacao AS dataCriacao,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome,
             c.NOME_FANTASIA AS clienteNome
      FROM agendamento_programado ap
      LEFT JOIN usuario u ON u.COD_USU = ap.cod_tecnico
      LEFT JOIN cliente c ON c.cod_cli = ap.cod_cli
      ORDER BY ap.data_agendamento ASC, ap.hora_inicio ASC
    `
    // Convert BigInt fields returned by $queryRaw
    const normalized = rows.map(r => ({
      ...r,
      id: Number(r.id),
      tecnicoId: r.tecnicoId != null ? Number(r.tecnicoId) : null,
      clienteId: r.clienteId != null ? Number(r.clienteId) : null,
      duracao: r.duracao != null ? Number(r.duracao) : null,
      status: r.status != null ? Number(r.status) : null,
    }))
    let result = normalized
    if (tecnicoId) result = result.filter(r => r.tecnicoId === Number(tecnicoId))
    if (status !== undefined) result = result.filter(r => r.status === Number(status))
    return result
  })

  // POST /agenda/agendamentos-prog
  app.post('/agendamentos-prog', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, clienteId, data, horaInicio, duracao, descricao } = request.body as {
      tecnicoId: number; clienteId?: number; data: string; horaInicio: string; duracao?: number; descricao?: string
    }
    const payload = request.user as { id: number }

    const conflitoProg: any[] = await prisma.$queryRaw`
      SELECT id FROM agendamento_programado
      WHERE cod_tecnico = ${tecnicoId} AND DATE(data_agendamento) = ${data}
        AND hora_inicio = ${horaInicio} AND status = 1
    `
    if (conflitoProg.length > 0) {
      return reply.status(409).send({ error: 'Já existe um agendamento nesse horário.' })
    }

    const conflitoAgenda: any[] = await prisma.$queryRaw`
      SELECT cod_agenda FROM agenda
      WHERE cod_colaborador = ${tecnicoId} AND DATE(data_agendamento) = ${data}
        AND TIME_FORMAT(hora_ini, '%H:%i') = ${horaInicio}
    `
    if (conflitoAgenda.length > 0) {
      return reply.status(409).send({ error: 'Horário ocupado na agenda principal do técnico.' })
    }

    await prisma.$executeRaw`
      INSERT INTO agendamento_programado
        (cod_tecnico, cod_cli, data_agendamento, hora_inicio, duracao_min, descricao, status)
      VALUES
        (${tecnicoId}, ${clienteId ?? null}, ${data}, ${horaInicio}, ${duracao ?? 60}, ${descricao ?? null}, 1)
    `

    const [inserted]: any[] = await prisma.$queryRaw`SELECT LAST_INSERT_ID() AS id`
    const newId = Number(inserted?.id ?? 0)
    if (newId > 0) {
      registrarAuditoria({
        tabela: 'agendamento_programado', registroId: newId, acao: 'CRIACAO', usuarioId: payload.id,
        dadosAntes: null,
        dadosDepois: { tecnicoId, clienteId: clienteId ?? null, data, horaInicio, duracao: duracao ?? 60, descricao: descricao ?? null },
      })
    }

    return reply.status(201).send({ ok: true })
  })

  // PATCH /agenda/agendamentos-prog/:id/status
  app.patch('/agendamentos-prog/:id/status', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: number }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT status FROM agendamento_programado WHERE id = ${Number(id)}`
    const statusAntes = before?.status != null ? Number(before.status) : null

    await prisma.$executeRaw`UPDATE agendamento_programado SET status = ${status} WHERE id = ${Number(id)}`

    registrarAuditoria({
      tabela: 'agendamento_programado', registroId: Number(id), acao: 'STATUS', usuarioId: payload.id,
      dadosAntes: { status: statusAntes },
      dadosDepois: { status },
    })

    return { ok: true }
  })

  // PUT /agenda/agendamentos-prog/:id (full update)
  app.put('/agendamentos-prog/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const { tecnicoId, clienteId, data, horaInicio, duracao, descricao } = request.body as {
      tecnicoId?: number; clienteId?: number | null; data?: string; horaInicio?: string; duracao?: number; descricao?: string | null
    }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT cod_tecnico AS tecnicoId, cod_cli AS clienteId,
             DATE_FORMAT(data_agendamento, '%Y-%m-%d') AS data,
             hora_inicio AS horaInicio, duracao_min AS duracao, descricao
      FROM agendamento_programado WHERE id = ${Number(id)}
    `
    const dadosAntes = before ? {
      tecnicoId: before.tecnicoId != null ? Number(before.tecnicoId) : null,
      clienteId: before.clienteId != null ? Number(before.clienteId) : null,
      data: before.data ?? null,
      horaInicio: before.horaInicio ?? null,
      duracao: before.duracao != null ? Number(before.duracao) : null,
      descricao: before.descricao ?? null,
    } : null

    if (tecnicoId !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET cod_tecnico = ${tecnicoId} WHERE id = ${Number(id)}`
    if (clienteId !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET cod_cli = ${clienteId ?? null} WHERE id = ${Number(id)}`
    if (data !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET data_agendamento = ${data} WHERE id = ${Number(id)}`
    if (horaInicio !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET hora_inicio = ${horaInicio} WHERE id = ${Number(id)}`
    if (duracao !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET duracao_min = ${duracao} WHERE id = ${Number(id)}`
    if (descricao !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET descricao = ${descricao ?? null} WHERE id = ${Number(id)}`

    registrarAuditoria({
      tabela: 'agendamento_programado', registroId: Number(id), acao: 'ALTERACAO', usuarioId: payload.id,
      dadosAntes,
      dadosDepois: {
        tecnicoId: tecnicoId !== undefined ? tecnicoId : dadosAntes?.tecnicoId,
        clienteId: clienteId !== undefined ? clienteId : dadosAntes?.clienteId,
        data: data !== undefined ? data : dadosAntes?.data,
        horaInicio: horaInicio !== undefined ? horaInicio : dadosAntes?.horaInicio,
        duracao: duracao !== undefined ? duracao : dadosAntes?.duracao,
        descricao: descricao !== undefined ? descricao : dadosAntes?.descricao,
      },
    })

    return { ok: true }
  })

  // DELETE /agenda/agendamentos-prog/:id (soft delete → status 3)
  app.delete('/agendamentos-prog/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT cod_tecnico AS tecnicoId, cod_cli AS clienteId,
             DATE_FORMAT(data_agendamento, '%Y-%m-%d') AS data,
             hora_inicio AS horaInicio, descricao, status
      FROM agendamento_programado WHERE id = ${Number(id)}
    `

    await prisma.$executeRaw`UPDATE agendamento_programado SET status = 3 WHERE id = ${Number(id)}`

    registrarAuditoria({
      tabela: 'agendamento_programado', registroId: Number(id), acao: 'EXCLUSAO', usuarioId: payload.id,
      dadosAntes: before ? {
        tecnicoId: before.tecnicoId != null ? Number(before.tecnicoId) : null,
        clienteId: before.clienteId != null ? Number(before.clienteId) : null,
        data: before.data ?? null,
        horaInicio: before.horaInicio ?? null,
        descricao: before.descricao ?? null,
        status: before.status != null ? Number(before.status) : null,
      } : null,
      dadosDepois: null,
    })

    return reply.status(204).send()
  })

  // ─── BLOQUEIOS ────────────────────────────────────────────────

  // GET /agenda/bloqueios
  app.get('/bloqueios', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { tecnicoId } = request.query as Record<string, string>
    const rows: any[] = await prisma.$queryRaw`
      SELECT b.id, b.cod_tecnico AS tecnicoId, b.data_ini AS dataIni, b.hora_ini AS horaIni,
             b.data_fim AS dataFim, b.hora_fim AS horaFim, b.motivo, b.ativo,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
      FROM agendamento_bloqueio b
      LEFT JOIN usuario u ON u.COD_USU = b.cod_tecnico
      WHERE b.ativo = 1
      ORDER BY b.data_ini ASC, b.hora_ini ASC
    `
    if (tecnicoId) return rows.filter(r => r.tecnicoId === null || Number(r.tecnicoId) === Number(tecnicoId))
    return rows
  })

  // POST /agenda/bloqueios
  app.post('/bloqueios', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, dataIni, horaIni, dataFim, horaFim, motivo } = request.body as {
      tecnicoId?: number | null; dataIni: string; horaIni: string; dataFim: string; horaFim: string; motivo?: string
    }
    await prisma.$executeRaw`
      INSERT INTO agendamento_bloqueio (cod_tecnico, data_ini, hora_ini, data_fim, hora_fim, motivo, ativo)
      VALUES (${tecnicoId ?? null}, ${dataIni}, ${horaIni}, ${dataFim}, ${horaFim}, ${motivo ?? null}, 1)
    `
    return reply.status(201).send({ ok: true })
  })

  // DELETE /agenda/bloqueios/:id
  app.delete('/bloqueios/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRaw`UPDATE agendamento_bloqueio SET ativo = 0 WHERE id = ${Number(id)}`
    return reply.status(204).send()
  })

  // GET /agenda/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const item = await prisma.agendaItem.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: { select: { id: true, nome: true } },
        tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
      },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado.' })
    const { cliente, tecnico, ...rest } = item
    return { ...rest, clienteNome: cliente?.nome ?? '', tecnicoNome: nomeTecnico(tecnico) }
  })

  // POST /agenda
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { clienteId, tecnicoId, tipo, data, horario, dataFim, horarioFim, observacoes } = request.body as any
    const payload = request.user as { id: number }
    const item = await prisma.agendaItem.create({
      data: {
        clienteId: clienteId ? Number(clienteId) : null,
        tecnicoId: tecnicoId ? Number(tecnicoId) : null,
        tipo: tipo || null,
        data: data ? new Date(data + 'T12:00:00Z') : null,
        horarioIni: horario ? new Date(`1970-01-01T${horario}:00Z`) : null,
        dataFim: dataFim ? new Date(dataFim + 'T12:00:00Z') : null,
        horarioFim: horarioFim ? new Date(`1970-01-01T${horarioFim}:00Z`) : null,
        observacoes: observacoes || null,
      } as any,
    })
    // Save criado_por and data_criacao via raw since not in schema
    await prisma.$executeRaw`UPDATE agenda SET criado_por = ${payload.id}, data_criacao = NOW() WHERE cod_agenda = ${Number(item.id)}`
    registrarAuditoria({
      tabela: 'agenda', registroId: Number(item.id), acao: 'CRIACAO', usuarioId: payload.id,
      dadosAntes: null,
      dadosDepois: {
        clienteId: clienteId ? Number(clienteId) : null,
        tecnicoId: tecnicoId ? Number(tecnicoId) : null,
        tipo: tipo || null,
        data: data || null,
        horarioIni: horario || null,
        dataFim: dataFim || null,
        horarioFim: horarioFim || null,
        observacoes: observacoes || null,
      },
    })
    return reply.status(201).send({ ...item, id: Number(item.id) })
  })

  // PUT /agenda/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const { clienteId, tecnicoId, tipo, data, horario, dataFim, horarioFim, observacoes } = request.body as any
    const payload = request.user as { id: number }

    // Capture before state for audit
    const [before]: any[] = await prisma.$queryRaw`
      SELECT cod_cli AS clienteId, cod_colaborador AS tecnicoId, Tipo AS tipo,
             Status_agendamento AS status,
             DATE_FORMAT(data_agendamento, '%Y-%m-%d') AS data,
             TIME_FORMAT(hora_ini, '%H:%i') AS horarioIni,
             DATE_FORMAT(data_fin_agendamento, '%Y-%m-%d') AS dataFim,
             TIME_FORMAT(hora_fin, '%H:%i') AS horarioFim,
             descricao AS observacoes
      FROM agenda WHERE cod_agenda = ${Number(id)}
    `
    const dadosAntes = before ? {
      clienteId: before.clienteId != null ? Number(before.clienteId) : null,
      tecnicoId: before.tecnicoId != null ? Number(before.tecnicoId) : null,
      tipo: before.tipo ?? null,
      data: before.data ?? null,
      horarioIni: before.horarioIni ?? null,
      dataFim: before.dataFim ?? null,
      horarioFim: before.horarioFim ?? null,
      observacoes: before.observacoes ?? null,
    } : null

    await prisma.agendaItem.update({
      where: { id: Number(id) },
      data: {
        ...(clienteId !== undefined && { clienteId: clienteId ? Number(clienteId) : null }),
        ...(tecnicoId !== undefined && { tecnicoId: tecnicoId ? Number(tecnicoId) : null }),
        ...(tipo !== undefined && { tipo: tipo || null }),
        ...(data !== undefined && { data: data ? new Date(data + 'T12:00:00Z') : null }),
        ...(horario !== undefined && { horarioIni: horario ? new Date(`1970-01-01T${horario}:00Z`) : null }),
        ...(dataFim !== undefined && { dataFim: dataFim ? new Date(dataFim + 'T12:00:00Z') : null }),
        ...(horarioFim !== undefined && { horarioFim: horarioFim ? new Date(`1970-01-01T${horarioFim}:00Z`) : null }),
        ...(observacoes !== undefined && { observacoes: observacoes || null }),
      },
    })

    registrarAuditoria({
      tabela: 'agenda', registroId: Number(id), acao: 'ALTERACAO', usuarioId: payload.id,
      dadosAntes,
      dadosDepois: {
        clienteId: clienteId !== undefined ? (clienteId ? Number(clienteId) : null) : dadosAntes?.clienteId,
        tecnicoId: tecnicoId !== undefined ? (tecnicoId ? Number(tecnicoId) : null) : dadosAntes?.tecnicoId,
        tipo: tipo !== undefined ? (tipo || null) : dadosAntes?.tipo,
        data: data !== undefined ? (data || null) : dadosAntes?.data,
        horarioIni: horario !== undefined ? (horario || null) : dadosAntes?.horarioIni,
        dataFim: dataFim !== undefined ? (dataFim || null) : dadosAntes?.dataFim,
        horarioFim: horarioFim !== undefined ? (horarioFim || null) : dadosAntes?.horarioFim,
        observacoes: observacoes !== undefined ? (observacoes || null) : dadosAntes?.observacoes,
      },
    })

    return { ok: true }
  })

  // PATCH /agenda/:id/status
  app.patch('/:id/status', { preHandler: authMiddleware, schema: { tags: ['Agenda'], summary: 'Atualizar status do agendamento' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: number }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT Status_agendamento AS status FROM agenda WHERE cod_agenda = ${Number(id)}`
    const statusAntes = before?.status != null ? Number(before.status) : null

    const result = await prisma.agendaItem.update({ where: { id: Number(id) }, data: { status } })

    registrarAuditoria({
      tabela: 'agenda', registroId: Number(id), acao: 'STATUS', usuarioId: payload.id,
      dadosAntes: { status: statusAntes },
      dadosDepois: { status },
    })

    return result
  })

  // DELETE /agenda/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT cod_cli AS clienteId, cod_colaborador AS tecnicoId, Tipo AS tipo,
             Status_agendamento AS status,
             DATE_FORMAT(data_agendamento, '%Y-%m-%d') AS data,
             TIME_FORMAT(hora_ini, '%H:%i') AS horarioIni,
             descricao AS observacoes
      FROM agenda WHERE cod_agenda = ${Number(id)}
    `

    await prisma.agendaItem.delete({ where: { id: Number(id) } })

    registrarAuditoria({
      tabela: 'agenda', registroId: Number(id), acao: 'EXCLUSAO', usuarioId: payload.id,
      dadosAntes: before ? {
        clienteId: before.clienteId != null ? Number(before.clienteId) : null,
        tecnicoId: before.tecnicoId != null ? Number(before.tecnicoId) : null,
        tipo: before.tipo ?? null,
        data: before.data ?? null,
        horarioIni: before.horarioIni ?? null,
        observacoes: before.observacoes ?? null,
      } : null,
      dadosDepois: null,
    })

    return reply.status(204).send()
  })
}
