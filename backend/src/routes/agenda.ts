import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { TelegramService } from '../services/telegram'
import { initProcedimentos } from '../utils/procedimentos'

const nomeTecnico = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

const MIN_DURACAO_PROCEDIMENTO = 15

function parseTimeToMinutes(value: any): number | null {
  if (!value) return null
  const asStr = value instanceof Date
    ? `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
    : String(value).substring(0, 5)
  const [h, m] = asStr.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function dateYmd(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(`${value}T12:00:00`)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function overlapsRange(targetIni: number, targetFim: number, otherIni: number, otherFim: number): boolean {
  return targetIni < otherFim && targetFim > otherIni
}

async function validarJanelaAgendamentoProgramado(args: {
  tecnicoId: number
  data: string
  horaInicio: string
  duracao: number
  agendamentoIdIgnorar?: number | null
}) {
  const tecnicoId = Number(args.tecnicoId)
  const duracao = Math.max(MIN_DURACAO_PROCEDIMENTO, Math.round(Number(args.duracao || 0)))
  const dataStr = dateYmd(args.data)
  const inicioMin = parseTimeToMinutes(args.horaInicio)
  if (inicioMin === null) {
    return { ok: false as const, motivo: 'Horário inicial inválido.' }
  }
  const fimMin = inicioMin + duracao

  const dispRows: any[] = await prisma.$queryRaw`
    SELECT d.cod_tecnico, d.dias_semana, d.hora_inicio, d.hora_fim, d.intervalo_ini, d.intervalo_fim, d.data_inicio, d.data_fim
    FROM tecnico_disponibilidade d
    WHERE d.cod_tecnico = ${tecnicoId} AND d.ativo = 1
    LIMIT 1
  `
  if (!dispRows.length) {
    return { ok: false as const, motivo: 'Técnico sem disponibilidade configurada.' }
  }

  const disp = dispRows[0]
  const [y, m, d] = dataStr.split('-').map(Number)
  const dataObj = new Date(y, m - 1, d)
  const diaSemana = dataObj.getDay()
  const dias = String(disp.dias_semana ?? '').split(',').map((n: string) => Number(n))
  if (!dias.includes(diaSemana)) {
    return { ok: false as const, motivo: 'A data escolhida não está nos dias ativos da disponibilidade do técnico.' }
  }

  if (disp.data_inicio) {
    const ini = new Date(disp.data_inicio)
    ini.setHours(0, 0, 0, 0)
    if (dataObj < ini) return { ok: false as const, motivo: 'Data fora do período de validade da disponibilidade.' }
  }
  if (disp.data_fim) {
    const fim = new Date(disp.data_fim)
    fim.setHours(23, 59, 59, 999)
    if (dataObj > fim) return { ok: false as const, motivo: 'Data fora do período de validade da disponibilidade.' }
  }

  const disponibilidadeIni = parseTimeToMinutes(disp.hora_inicio)
  const disponibilidadeFim = parseTimeToMinutes(disp.hora_fim)
  if (disponibilidadeIni === null || disponibilidadeFim === null || disponibilidadeFim <= disponibilidadeIni) {
    return { ok: false as const, motivo: 'Disponibilidade do técnico inválida.' }
  }
  if (inicioMin < disponibilidadeIni || fimMin > disponibilidadeFim) {
    return { ok: false as const, motivo: 'Duração do procedimento ultrapassa a janela de trabalho disponível.' }
  }

  const almocoIni = parseTimeToMinutes(disp.intervalo_ini)
  const almocoFim = parseTimeToMinutes(disp.intervalo_fim)
  if (almocoIni !== null && almocoFim !== null && overlapsRange(inicioMin, fimMin, almocoIni, almocoFim)) {
    return { ok: false as const, motivo: 'Duração do procedimento conflita com o intervalo bloqueado do técnico.' }
  }

  const agendaItems: any[] = await prisma.$queryRaw`
    SELECT hora_ini, hora_fin FROM agenda
    WHERE cod_colaborador = ${tecnicoId}
      AND DATE(data_agendamento) = ${dataStr}
      AND hora_ini IS NOT NULL
  `

  const programados: any[] = await prisma.$queryRaw`
    SELECT id, hora_inicio, duracao_min FROM agendamento_programado
    WHERE cod_tecnico = ${tecnicoId}
      AND DATE(data_agendamento) = ${dataStr}
      AND status = 1
  `

  const bloqueios: any[] = await prisma.$queryRaw`
    SELECT hora_ini, hora_fim FROM agendamento_bloqueio
    WHERE ativo = 1
      AND (cod_tecnico = ${tecnicoId} OR cod_tecnico IS NULL)
      AND data_ini <= ${dataStr}
      AND data_fim >= ${dataStr}
  `

  const ranges: Array<{ iniMin: number; finMin: number }> = []

  for (const item of agendaItems) {
    const ini = parseTimeToMinutes(item.hora_ini)
    if (ini === null) continue
    const fim = parseTimeToMinutes(item.hora_fin) ?? (ini + 60)
    ranges.push({ iniMin: ini, finMin: fim > ini ? fim : ini + 60 })
  }

  for (const item of programados) {
    const idRow = Number(item.id ?? 0)
    if (args.agendamentoIdIgnorar && idRow === Number(args.agendamentoIdIgnorar)) continue
    const ini = parseTimeToMinutes(item.hora_inicio)
    if (ini === null) continue
    const fim = ini + Math.max(MIN_DURACAO_PROCEDIMENTO, Number(item.duracao_min ?? 60))
    ranges.push({ iniMin: ini, finMin: fim })
  }

  for (const bl of bloqueios) {
    const ini = parseTimeToMinutes(bl.hora_ini)
    const fim = parseTimeToMinutes(bl.hora_fim)
    if (ini === null || fim === null) continue
    ranges.push({ iniMin: ini, finMin: fim })
  }

  const conflito = ranges.some((r) => overlapsRange(inicioMin, fimMin, r.iniMin, r.finMin))
  if (conflito) {
    return { ok: false as const, motivo: 'Não há tempo livre contínuo suficiente nesse horário para este procedimento.' }
  }

  return { ok: true as const }
}

async function sincronizarResponsavelImplantacao(args: {
  clienteId?: number | null
  tecnicoId?: number | null
  usuarioId?: number | null
  origem: string
}) {
  const clienteId = Number(args.clienteId ?? 0)
  const tecnicoId = Number(args.tecnicoId ?? 0)
  const usuarioId = Number(args.usuarioId ?? 0) || null

  if (!Number.isFinite(clienteId) || clienteId <= 0) return
  if (!Number.isFinite(tecnicoId) || tecnicoId <= 0) return

  try {
    const atualRows = await prisma.$queryRaw<{ responsavel_id: number | null }[]>`
      SELECT responsavel_id
      FROM implantacao_responsavel
      WHERE cliente_id = ${clienteId}
      LIMIT 1
    `
    const responsavelAtual = atualRows[0]?.responsavel_id ? Number(atualRows[0].responsavel_id) : null

    await prisma.$executeRaw`
      INSERT INTO implantacao_responsavel (cliente_id, responsavel_id, atualizado_em, atualizado_por, observacao)
      VALUES (${clienteId}, ${tecnicoId}, NOW(), ${usuarioId}, ${`Sincronizado automaticamente via ${args.origem}`})
      ON DUPLICATE KEY UPDATE
        responsavel_id = VALUES(responsavel_id),
        atualizado_em = NOW(),
        atualizado_por = VALUES(atualizado_por),
        observacao = VALUES(observacao)
    `

    if (responsavelAtual !== tecnicoId) {
      await prisma.$executeRaw`
        INSERT INTO implantacao_movimentacoes
          (cliente_id, tipo, responsavel_id, observacao, usuario_id, data_hora)
        VALUES
          (${clienteId}, 'responsavel', ${tecnicoId}, ${`Responsável da implantação sincronizado via ${args.origem}`}, ${usuarioId}, NOW())
      `
    }
  } catch (error) {
    // Não impede o agendamento principal caso a infraestrutura de implantação esteja indisponível/permissões restritas.
    console.warn('[agenda] Falha ao sincronizar responsável da implantação:', (error as any)?.message ?? error)
  }
}

/**
 * Envia notificação de agendamento via Telegram para o técnico
 */
async function enviarNotificacaoAgendamento(data: {
  tecnicoId: number,
  clienteId?: number | null,
  data: string,
  horaIni: string,
  horaFim?: string | null,
  descricao?: string | null,
  tipo?: string | null,
  isProgramado?: boolean,
  observacao?: string | null
}) {
  try {
    const config = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })
    if (!config) return

    const tecnico = await prisma.usuario.findUnique({ 
      where: { id: data.tecnicoId },
      select: { id: true, nomeCompleto: true, nomeUsu: true, idTelegram: true }
    })
    
    // Prioriza o idTelegram do técnico, se não houver usa o padrão da configuração
    const targetUserId = tecnico?.idTelegram || config.userIdPadrao
    if (!targetUserId) return

    let clienteNome = 'Cliente não informado'
    if (data.clienteId) {
      const cliente = await prisma.cliente.findUnique({ 
        where: { id: data.clienteId },
        select: { nome: true }
      })
      if (cliente) clienteNome = cliente.nome || clienteNome
    }

    const dataFormatada = new Date(data.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const titulo = data.isProgramado ? '📅 AGENDAMENTO PROGRAMADO' : '📅 NOVO AGENDAMENTO'
    
    const msg = [
      `======== ${titulo} ========`,
      `👤 Técnico: ${tecnico?.nomeCompleto || tecnico?.nomeUsu || 'N/A'}`,
      `🏢 Cliente: ${clienteNome}`,
      `🗓️ Data: ${dataFormatada}`,
      `⏰ Horário: ${data.horaIni}${data.horaFim ? ` ATÉ ${data.horaFim}` : ''}`,
      `📝 Tipo: ${data.tipo || 'N/A'}`,
      data.descricao || data.observacao ? `🗒️ Obs: ${data.descricao || data.observacao}` : '',
      `===============================`
    ].filter(Boolean).join('\n')

    await TelegramService.enviar({
      userId: targetUserId,
      mensagem: msg
    })
  } catch (error) {
    console.error('Falha ao enviar notificação Telegram:', error)
  }
}

export async function agendaRoutes(app: FastifyInstance) {
  await initProcedimentos()

  // POST /agenda/correcao-status-efetuado
  // Corrige em lote agendamentos com status "Efetuado" (2) sem evidência de mudança de status para 2 na auditoria.
  // Modo seguro: por padrão só retorna prévia; para aplicar, envie { executar: true }.
  app.post('/correcao-status-efetuado', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const payload = request.user as { id: number }
    const { executar, dataInicio, dataFim } = (request.body as {
      executar?: boolean
      dataInicio?: string
      dataFim?: string
    } | undefined) ?? {}

    const filtros: Prisma.Sql[] = [Prisma.sql`COALESCE(a.Status_agendamento, 0) = 2`]
    if (dataInicio) filtros.push(Prisma.sql`a.data_agendamento >= ${new Date(`${dataInicio}T00:00:00Z`)}`)
    if (dataFim) filtros.push(Prisma.sql`a.data_agendamento <= ${new Date(`${dataFim}T23:59:59Z`)}`)

    const where = Prisma.sql`WHERE ${Prisma.join(filtros, ' AND ')}`

    const candidatos: Array<{ id: number }> = await prisma.$queryRaw`
      SELECT a.cod_agenda AS id
      FROM agenda a
      LEFT JOIN (
        SELECT DISTINCT au.registro_id
        FROM auditoria au
        WHERE au.tabela = 'agenda'
          AND au.acao = 'STATUS'
          AND au.dados_depois LIKE '%"status":2%'
      ) hist ON hist.registro_id = a.cod_agenda
      ${where}
        AND hist.registro_id IS NULL
      ORDER BY a.cod_agenda
    `

    const ids = candidatos.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0)

    if (!executar) {
      return {
        ok: true,
        modo: 'preview',
        totalCandidatos: ids.length,
        ids: ids.slice(0, 200),
        observacao: 'Envie executar=true para aplicar a correção (status 2 -> 1) nos IDs candidatos.',
      }
    }

    if (!ids.length) {
      return { ok: true, modo: 'executado', totalCorrigidos: 0, ids: [] }
    }

    await prisma.$executeRaw`
      UPDATE agenda
      SET Status_agendamento = 1
      WHERE cod_agenda IN (${Prisma.join(ids)})
    `

    const usuarioRows: any[] = await prisma.$queryRaw`
      SELECT COALESCE(NOME_USUARIO_COMPLETO, NOME_USU) AS nome
      FROM usuario
      WHERE COD_USU = ${payload.id}
      LIMIT 1
    `
    const usuarioNome = usuarioRows[0]?.nome ?? null

    await prisma.$executeRaw`
      INSERT INTO auditoria (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois, campos_alterados, criado_em)
      SELECT
        'agenda' AS tabela,
        a.cod_agenda AS registro_id,
        'STATUS' AS acao,
        ${payload.id} AS usuario_id,
        ${usuarioNome} AS usuario_nome,
        JSON_OBJECT('status', 2) AS dados_antes,
        JSON_OBJECT('status', 1) AS dados_depois,
        JSON_ARRAY('status') AS campos_alterados,
        NOW() AS criado_em
      FROM agenda a
      WHERE a.cod_agenda IN (${Prisma.join(ids)})
    `

    return {
      ok: true,
      modo: 'executado',
      totalCorrigidos: ids.length,
      ids: ids.slice(0, 200),
    }
  })

  // GET /agenda
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { data, dataInicio, dataFim, tecnicoId, status, clienteId, tipo } = request.query as Record<string, string>
    const statusNorm = String(status ?? '').trim().toLowerCase()
    const statusIsAguardando = statusNorm === 'aguardando'
    const statusNum =
      statusNorm !== '' && !statusIsAguardando && Number.isFinite(Number(statusNorm))
        ? Number(statusNorm)
        : null

    const where: Record<string, any> = {}
    if (tecnicoId) where.tecnicoId = Number(tecnicoId)
    if (clienteId) where.clienteId = Number(clienteId)
    if (statusNorm !== '') where.status = statusIsAguardando ? { in: [0, 1] } : statusNum
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
    if (statusIsAguardando) condA.push(Prisma.sql`COALESCE(a.Status_agendamento, 0) IN (0, 1)`)
    else if (statusNum !== null) condA.push(Prisma.sql`a.Status_agendamento = ${statusNum}`)
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
    if (statusIsAguardando) condP.push(Prisma.sql`p.status = 1`)
    else if (statusNum !== null) condP.push(Prisma.sql`p.status = ${statusNum}`)
    // agendamento_programado não possui coluna de tipo equivalente à agenda.
    // Quando o usuário filtra por tipo (ex.: Treinamento), evitamos misturar
    // itens programados que poderiam aparecer como "Instalação" no formulário.
    if (tipo && tipo !== 'Agendamento') condP.push(Prisma.sql`1 = 0`)
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

  // GET /agenda/slots?tecnicoId=1&dataInicio=2026-03-20&dataFim=2026-03-22
  app.get('/slots', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, data, dataInicio, dataFim } = request.query as { tecnicoId?: string; data?: string; dataInicio?: string; dataFim?: string }
    
    const startStr = dataInicio || data
    const endStr = dataFim || startStr
    
    if (!startStr) return reply.status(400).send({ error: 'Data é obrigatória' })

    const dates: string[] = []
    const dStart = new Date(startStr + 'T12:00:00')
    const dEnd = new Date(endStr + 'T12:00:00')
    
    // Limit range to 31 days to avoid infinite loops or memory issues
    let current = new Date(dStart)
    let limit = 0
    while (current <= dEnd && limit < 31) {
      dates.push(current.toISOString().substring(0, 10))
      current.setDate(current.getDate() + 1)
      limit++
    }

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

    const finalResult = []

    for (const dataStr of dates) {
      const [y, m, d] = dataStr.split('-').map(Number)
      const dataObj = new Date(y, m - 1, d)
      const diaSemana = dataObj.getDay()
      const dayResult: any[] = []

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
        const lunchIni = parseTimeToMinutes(disp.intervalo_ini)
        const lunchFim = parseTimeToMinutes(disp.intervalo_fim)

        const allSlots: string[] = []
        for (let min = startMin; min < endMin; min += intervalo) {
          if (lunchIni !== null && lunchFim !== null && min >= lunchIni && min < lunchFim) continue
          allSlots.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
        }

        const tId = Number(disp.cod_tecnico)

        const agendaItems: any[] = await prisma.$queryRaw`
          SELECT hora_ini, hora_fin FROM agenda
          WHERE cod_colaborador = ${tId} AND DATE(data_agendamento) = ${dataStr} AND hora_ini IS NOT NULL
        `

        const programados: any[] = await prisma.$queryRaw`
          SELECT hora_inicio, duracao_min FROM agendamento_programado
          WHERE cod_tecnico = ${tId} AND DATE(data_agendamento) = ${dataStr} AND status = 1
        `

        const bloqueios: any[] = await prisma.$queryRaw`
          SELECT hora_ini, hora_fim FROM agendamento_bloqueio
          WHERE ativo = 1
            AND (cod_tecnico = ${tId} OR cod_tecnico IS NULL)
            AND data_ini <= ${dataStr} AND data_fim >= ${dataStr}
        `

        const ranges: Array<{ iniMin: number; finMin: number }> = []
        for (const item of agendaItems) {
          const iniMin = parseTimeToMinutes(item.hora_ini)
          if (iniMin === null) continue
          const finMin = parseTimeToMinutes(item.hora_fin) ?? (iniMin + intervalo)
          ranges.push({ iniMin, finMin: finMin > iniMin ? finMin : iniMin + intervalo })
        }
        for (const ap of programados) {
          const iniMin = parseTimeToMinutes(ap.hora_inicio)
          if (iniMin === null) continue
          const finMin = iniMin + (Number(ap.duracao_min) || 60)
          ranges.push({ iniMin, finMin })
        }
        for (const bl of bloqueios) {
          const iniMin = parseTimeToMinutes(bl.hora_ini)
          const finMin = parseTimeToMinutes(bl.hora_fim)
          if (iniMin === null || finMin === null) continue
          ranges.push({ iniMin, finMin })
        }

        const isOccupied = (slot: string) => {
          const [h, m] = slot.split(':').map(Number)
          const slotMin = h * 60 + m
          return ranges.some(r => slotMin >= r.iniMin && slotMin < r.finMin)
        }

        dayResult.push({
          tecnicoId: tId,
          tecnicoNome: disp.tecnicoNome,
          data: dataStr,
          slotsDisponiveis: allSlots.filter(s => !isOccupied(s)),
          slotsOcupados: allSlots.filter(s => isOccupied(s)),
        })
      }
      if (dayResult.length > 0) {
        finalResult.push(...dayResult)
      }
    }

    return finalResult
  })

  // ─── AGENDAMENTOS PROGRAMADOS ─────────────────────────────────

  // GET /agenda/agendamentos-prog
  app.get('/agendamentos-prog', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request) => {
    const { tecnicoId, status, dataInicio, dataFim, clienteId, procedimentoId } = request.query as Record<string, string>

    const conds: Prisma.Sql[] = []
    if (tecnicoId) conds.push(Prisma.sql`ap.cod_tecnico = ${Number(tecnicoId)}`)
    if (clienteId) conds.push(Prisma.sql`ap.cod_cli = ${Number(clienteId)}`)
    if (procedimentoId) conds.push(Prisma.sql`ap.procedimento_id = ${Number(procedimentoId)}`)
    if (status !== undefined && status !== '') conds.push(Prisma.sql`ap.status = ${Number(status)}`)
    if (dataInicio) conds.push(Prisma.sql`ap.data_agendamento >= ${dataInicio}`)
    if (dataFim) conds.push(Prisma.sql`ap.data_agendamento <= ${dataFim}`)

    const where = conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty

    const rows: any[] = await prisma.$queryRaw`
      SELECT ap.id, ap.cod_tecnico AS tecnicoId, ap.cod_cli AS clienteId,
             ap.procedimento_id AS procedimentoId,
             ap.data_agendamento AS data, ap.hora_inicio AS horaInicio,
             ap.duracao_min AS duracao, ap.descricao, ap.status,
             ap.data_criacao AS dataCriacao,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome,
             c.NOME_FANTASIA AS clienteNome,
             p.nome AS procedimentoNome
      FROM agendamento_programado ap
      LEFT JOIN usuario u ON u.COD_USU = ap.cod_tecnico
      LEFT JOIN cliente c ON c.cod_cli = ap.cod_cli
      LEFT JOIN cadastro_procedimentos p ON p.id = ap.procedimento_id
      ${where}
      ORDER BY ap.data_agendamento ASC, ap.hora_inicio ASC
    `
    // Convert BigInt fields returned by $queryRaw
    return rows.map(r => ({
      ...r,
      id: Number(r.id),
      tecnicoId: r.tecnicoId != null ? Number(r.tecnicoId) : null,
      clienteId: r.clienteId != null ? Number(r.clienteId) : null,
      procedimentoId: r.procedimentoId != null ? Number(r.procedimentoId) : null,
      duracao: r.duracao != null ? Number(r.duracao) : null,
      status: r.status != null ? Number(r.status) : null,
    }))
  })

  // POST /agenda/agendamentos-prog/validar-duracao
  app.post('/agendamentos-prog/validar-duracao', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, data, horaInicio, duracao, agendamentoIdIgnorar } = request.body as {
      tecnicoId: number
      data: string
      horaInicio: string
      duracao: number
      agendamentoIdIgnorar?: number | null
    }

    const tecnicoNum = Number(tecnicoId)
    if (!Number.isFinite(tecnicoNum) || tecnicoNum <= 0) return reply.status(400).send({ error: 'Técnico inválido.' })
    if (!String(data || '').trim()) return reply.status(400).send({ error: 'Data obrigatória.' })
    if (!String(horaInicio || '').trim()) return reply.status(400).send({ error: 'Hora inicial obrigatória.' })

    const check = await validarJanelaAgendamentoProgramado({
      tecnicoId: tecnicoNum,
      data: String(data),
      horaInicio: String(horaInicio),
      duracao: Number(duracao ?? 0),
      agendamentoIdIgnorar: agendamentoIdIgnorar ?? null,
    })

    if (!check.ok) {
      return reply.status(409).send({ ok: false, error: check.motivo })
    }
    return { ok: true }
  })

  // POST /agenda/agendamentos-prog
  app.post('/agendamentos-prog', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { tecnicoId, clienteId, procedimentoId, data, horaInicio, duracao, descricao } = request.body as {
      tecnicoId: number
      clienteId?: number
      procedimentoId?: number
      data: string
      horaInicio: string
      duracao?: number
      descricao?: string
    }
    const payload = request.user as { id: number }
    const procId = Number(procedimentoId ?? 0)
    if (!Number.isFinite(procId) || procId <= 0) {
      return reply.status(400).send({ error: 'Selecione o procedimento do agendamento.' })
    }

    const procRows: any[] = await prisma.$queryRaw`
      SELECT id, nome, duracao_min, ativo
      FROM cadastro_procedimentos
      WHERE id = ${procId}
      LIMIT 1
    `
    if (!procRows.length || Number(procRows[0].ativo) !== 1) {
      return reply.status(400).send({ error: 'Procedimento inválido ou inativo.' })
    }

    const duracaoProcedimento = Math.max(MIN_DURACAO_PROCEDIMENTO, Number(procRows[0].duracao_min ?? 60))
    const duracaoFinal = Math.max(MIN_DURACAO_PROCEDIMENTO, Number(duracao ?? duracaoProcedimento))

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

    const janelaOk = await validarJanelaAgendamentoProgramado({
      tecnicoId,
      data,
      horaInicio,
      duracao: duracaoFinal,
    })
    if (!janelaOk.ok) {
      return reply.status(409).send({ error: janelaOk.motivo })
    }

    await prisma.$executeRaw`
      INSERT INTO agendamento_programado
        (cod_tecnico, cod_cli, procedimento_id, data_agendamento, hora_inicio, duracao_min, descricao, status)
      VALUES
        (${tecnicoId}, ${clienteId ?? null}, ${procId}, ${data}, ${horaInicio}, ${duracaoFinal}, ${descricao ?? null}, 1)
    `

    // Enviar notificação via Telegram
    enviarNotificacaoAgendamento({
      tecnicoId,
      clienteId,
      data,
      horaIni: horaInicio,
      tipo: 'PROGRAMADO',
      observacao: descricao,
      isProgramado: true
    })

    const [inserted]: any[] = await prisma.$queryRaw`SELECT LAST_INSERT_ID() AS id`
    const newId = Number(inserted?.id ?? 0)
    if (newId > 0) {
    registrarAuditoria({
      tabela: 'agendamento_programado', registroId: newId, acao: 'CRIACAO', usuarioId: payload.id,
      dadosAntes: null,
      dadosDepois: {
        tecnicoId,
        clienteId: clienteId ?? null,
        procedimentoId: procId,
        procedimentoNome: String(procRows[0].nome ?? ''),
        data,
        horaInicio,
        duracao: duracaoFinal,
        descricao: descricao ?? null,
      },
    })

    await sincronizarResponsavelImplantacao({
      clienteId: clienteId ?? null,
      tecnicoId,
      usuarioId: payload.id,
      origem: 'Agenda Programada (criação)',
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
  app.put('/agendamentos-prog/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tecnicoId, clienteId, procedimentoId, data, horaInicio, duracao, descricao } = request.body as {
      tecnicoId?: number
      clienteId?: number | null
      procedimentoId?: number | null
      data?: string
      horaInicio?: string
      duracao?: number
      descricao?: string | null
    }
    const payload = request.user as { id: number }

    const [before]: any[] = await prisma.$queryRaw`
      SELECT cod_tecnico AS tecnicoId, cod_cli AS clienteId,
             DATE_FORMAT(data_agendamento, '%Y-%m-%d') AS data,
             procedimento_id AS procedimentoId,
             hora_inicio AS horaInicio, duracao_min AS duracao, descricao
      FROM agendamento_programado WHERE id = ${Number(id)}
    `
    const dadosAntes = before ? {
      tecnicoId: before.tecnicoId != null ? Number(before.tecnicoId) : null,
      clienteId: before.clienteId != null ? Number(before.clienteId) : null,
      procedimentoId: before.procedimentoId != null ? Number(before.procedimentoId) : null,
      data: before.data ?? null,
      horaInicio: before.horaInicio ?? null,
      duracao: before.duracao != null ? Number(before.duracao) : null,
      descricao: before.descricao ?? null,
    } : null

    if (procedimentoId !== undefined && procedimentoId !== null) {
      const procRows: any[] = await prisma.$queryRaw`
        SELECT id, ativo, duracao_min
        FROM cadastro_procedimentos
        WHERE id = ${Number(procedimentoId)}
        LIMIT 1
      `
      if (!procRows.length || Number(procRows[0].ativo) !== 1) {
        return reply.status(400).send({ error: 'Procedimento inválido ou inativo.' })
      }
    }

    const tecnicoFinal = tecnicoId !== undefined ? tecnicoId : (dadosAntes?.tecnicoId ?? null)
    const dataFinal = data !== undefined ? data : (dadosAntes?.data ?? null)
    const horaInicioFinal = horaInicio !== undefined ? horaInicio : (dadosAntes?.horaInicio ?? null)
    const duracaoFinal = duracao !== undefined ? duracao : (dadosAntes?.duracao ?? 60)
    if (tecnicoFinal && dataFinal && horaInicioFinal) {
      const janelaOk = await validarJanelaAgendamentoProgramado({
        tecnicoId: Number(tecnicoFinal),
        data: String(dataFinal),
        horaInicio: String(horaInicioFinal),
        duracao: Number(duracaoFinal ?? 60),
        agendamentoIdIgnorar: Number(id),
      })
      if (!janelaOk.ok) {
        return reply.status(409).send({ error: janelaOk.motivo })
      }
    }

    if (tecnicoId !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET cod_tecnico = ${tecnicoId} WHERE id = ${Number(id)}`
    if (clienteId !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET cod_cli = ${clienteId ?? null} WHERE id = ${Number(id)}`
    if (procedimentoId !== undefined) await prisma.$executeRaw`UPDATE agendamento_programado SET procedimento_id = ${procedimentoId ?? null} WHERE id = ${Number(id)}`
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
        procedimentoId: procedimentoId !== undefined ? procedimentoId : dadosAntes?.procedimentoId,
        data: data !== undefined ? data : dadosAntes?.data,
        horaInicio: horaInicio !== undefined ? horaInicio : dadosAntes?.horaInicio,
        duracao: duracao !== undefined ? duracao : dadosAntes?.duracao,
        descricao: descricao !== undefined ? descricao : dadosAntes?.descricao,
      },
    })

    const clienteFinal = clienteId !== undefined ? (clienteId ?? null) : (dadosAntes?.clienteId ?? null)
    await sincronizarResponsavelImplantacao({
      clienteId: clienteFinal,
      tecnicoId: tecnicoFinal,
      usuarioId: payload.id,
      origem: 'Agenda Programada (edição)',
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
        status: 1,
        data: data ? new Date(data + 'T12:00:00Z') : null,
        horarioIni: horario ? new Date(`1970-01-01T${horario}:00Z`) : null,
        dataFim: dataFim ? new Date(dataFim + 'T12:00:00Z') : null,
        horarioFim: horarioFim ? new Date(`1970-01-01T${horarioFim}:00Z`) : null,
        observacoes: observacoes || null,
      } as any,
    })
    // Save criado_por and data_criacao via raw since not in schema
    await prisma.$executeRaw`UPDATE agenda SET criado_por = ${payload.id}, data_criacao = NOW() WHERE cod_agenda = ${Number(item.id)}`

    // Enviar notificação via Telegram
    enviarNotificacaoAgendamento({
      tecnicoId: Number(tecnicoId),
      clienteId: clienteId ? Number(clienteId) : null,
      data,
      horaIni: horario,
      horaFim: horarioFim,
      tipo: tipo || 'REUNIÃO',
      observacao: observacoes,
      isProgramado: false
    })
    registrarAuditoria({
      tabela: 'agenda', registroId: Number(item.id), acao: 'CRIACAO', usuarioId: payload.id,
      dadosAntes: null,
      dadosDepois: {
        clienteId: clienteId ? Number(clienteId) : null,
        tecnicoId: tecnicoId ? Number(tecnicoId) : null,
        tipo: tipo || null,
        status: 1,
        data: data || null,
        horarioIni: horario || null,
        dataFim: dataFim || null,
        horarioFim: horarioFim || null,
        observacoes: observacoes || null,
      },
    })

    await sincronizarResponsavelImplantacao({
      clienteId: clienteId ? Number(clienteId) : null,
      tecnicoId: tecnicoId ? Number(tecnicoId) : null,
      usuarioId: payload.id,
      origem: 'Agenda (criação)',
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

    const clienteFinal = clienteId !== undefined ? (clienteId ? Number(clienteId) : null) : (dadosAntes?.clienteId ?? null)
    const tecnicoFinal = tecnicoId !== undefined ? (tecnicoId ? Number(tecnicoId) : null) : (dadosAntes?.tecnicoId ?? null)
    await sincronizarResponsavelImplantacao({
      clienteId: clienteFinal,
      tecnicoId: tecnicoFinal,
      usuarioId: payload.id,
      origem: 'Agenda (edição)',
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
