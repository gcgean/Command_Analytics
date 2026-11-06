import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'
import { registrarAuditoria } from '../utils/auditoria'
import { calcularSlots, MIN_DURACAO_PROCEDIMENTO } from '../utils/agendaSlots'
import {
  autenticarChave, criarChave, dentroDoLimite, listarChaves, revogarChave,
  type ChaveAutenticada,
} from '../utils/apiChaves'
import {
  validarJanelaAgendamentoProgramado,
  montarDescricaoAgendamentoProgramado,
  limparPrefixoTipoAgendamentoProgramado,
  enviarNotificacaoAgendamento,
  sincronizarResponsavelImplantacao,
  MAX_DESCRICAO_AGENDAMENTO_PROGRAMADO,
} from './agenda'

/**
 * API de agendamento para aplicações externas.
 *
 * O fluxo é o mesmo que a tela faz: pergunta os procedimentos, pergunta os horários livres de
 * um procedimento num intervalo de datas, e manda criar num técnico e horário escolhidos.
 *
 * O cálculo de disponibilidade e a validação da janela são exatamente os da tela — não há uma
 * segunda regra do que é horário livre. O que muda é só a porta de entrada: chave de API em
 * vez de sessão de usuário, limite de ritmo por chave, e nenhum acesso ao resto do sistema.
 *
 * O agendamento criado aqui é um `agendamento_programado` comum: aparece na Lista de
 * Agendamentos, notifica o técnico pelo Telegram e entra na auditoria como os outros.
 */

/** Usuário a quem os registros criados pela integração são atribuídos. */
const USUARIO_INTEGRACAO = 1

interface RequisicaoComChave extends FastifyRequest {
  chave?: ChaveAutenticada
}

async function exigirChave(request: RequisicaoComChave, reply: FastifyReply) {
  const cabecalho = request.headers['x-api-key']
  const auth = String(request.headers.authorization ?? '')
  const token = String(
    (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)
    ?? (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : ''))

  const chave = await autenticarChave(token)
  if (!chave) {
    return reply.status(401).send({ error: 'Chave de API ausente ou inválida.' })
  }
  if (!dentroDoLimite(chave.id)) {
    return reply.status(429).send({ error: 'Muitas requisições. Tente de novo em um minuto.' })
  }
  request.chave = chave
}

const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '')
const ehData = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
const ehHora = (v: any) => /^\d{2}:\d{2}$/.test(String(v ?? ''))

export async function integracaoAgendaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', exigirChave)

  /** Confere se a chave está viva, sem efeito nenhum. Útil na configuração do cliente. */
  app.get('/ping', async (request: RequisicaoComChave) => ({
    ok: true, chave: request.chave?.nome, agora: new Date().toISOString(),
  }))

  /** Procedimentos ativos e quais técnicos atendem cada um. */
  app.get('/procedimentos', async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.nome, p.duracao_min,
             GROUP_CONCAT(pt.cod_tecnico) AS tecnicos
        FROM cadastro_procedimentos p
        LEFT JOIN cadastro_procedimentos_tecnicos pt ON pt.procedimento_id = p.id
       WHERE p.ativo = 1
       GROUP BY p.id, p.nome, p.duracao_min
       ORDER BY p.nome`).catch(() => [])
    return linhas.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome ?? ''),
      duracaoMin: Math.max(MIN_DURACAO_PROCEDIMENTO, Number(r.duracao_min ?? 0)),
      tecnicoIds: String(r.tecnicos ?? '').split(',').map(Number).filter(Boolean),
    }))
  })

  /**
   * Técnicos com agenda configurada. Com `procedimentoId`, só os que atendem aquele
   * procedimento — procedimento sem técnico amarrado vale para todos.
   */
  app.get('/tecnicos', async (request) => {
    const { procedimentoId } = request.query as { procedimentoId?: string }
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT d.cod_tecnico AS id,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome
        FROM tecnico_disponibilidade d
        LEFT JOIN usuario u ON u.COD_USU = d.cod_tecnico
       WHERE d.ativo = 1 AND COALESCE(u.ATIVO, 'S') = 'S'
       ORDER BY nome`).catch(() => [])

    const id = Number(procedimentoId ?? 0)
    if (!id) return linhas.map((r) => ({ id: Number(r.id), nome: String(r.nome ?? '') }))

    const doProc = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cod_tecnico AS id FROM cadastro_procedimentos_tecnicos WHERE procedimento_id = ?`,
      id).catch(() => [])
    const permitidos = new Set(doProc.map((r) => Number(r.id)))
    return linhas
      .filter((r) => permitidos.size === 0 || permitidos.has(Number(r.id)))
      .map((r) => ({ id: Number(r.id), nome: String(r.nome ?? '') }))
  })

  /**
   * Horários livres. `procedimentoId` e `dataInicio` são obrigatórios; o intervalo é limitado
   * a 31 dias. Devolve por técnico e por dia, já descontando agenda, bloqueios e almoço, e
   * considerando a duração do procedimento — um horário só aparece livre se o atendimento
   * inteiro couber nele.
   */
  app.get('/horarios', async (request, reply) => {
    const { procedimentoId, tecnicoId, dataInicio, dataFim } = request.query as {
      procedimentoId?: string; tecnicoId?: string; dataInicio?: string; dataFim?: string
    }
    if (!ehData(dataInicio)) {
      return reply.status(400).send({ error: 'Informe dataInicio no formato AAAA-MM-DD.' })
    }
    if (dataFim && !ehData(dataFim)) {
      return reply.status(400).send({ error: 'dataFim deve estar no formato AAAA-MM-DD.' })
    }

    const r = await calcularSlots({
      procedimentoId, tecnicoId, dataInicio, dataFim: dataFim || dataInicio,
    })
    if (!r.ok) return reply.status(400).send({ error: r.erro })

    // Só o que interessa a quem vai agendar: a lista de ocupados é diagnóstico da tela.
    return {
      duracaoMin: r.duracaoMin,
      disponibilidade: r.itens
        .filter((i) => i.slotsDisponiveis.length > 0)
        .map((i) => ({
          data: i.data,
          tecnicoId: i.tecnicoId,
          tecnicoNome: i.tecnicoNome,
          horarios: i.slotsDisponiveis,
        })),
    }
  })

  /**
   * Cria o agendamento.
   *
   * O horário é conferido de novo aqui, contra o banco, e não contra o que a aplicação
   * externa viu em `/horarios`: entre a consulta e o envio alguém pode ter ocupado a vaga.
   * Nesse caso a resposta é 409 e nada é gravado.
   */
  app.post('/agendamentos', async (request: RequisicaoComChave, reply) => {
    const b = request.body as Record<string, any>
    const tecnicoId = Number(b.tecnicoId ?? 0)
    const procedimentoId = Number(b.procedimentoId ?? 0)
    const data = String(b.data ?? '')
    const horaInicio = String(b.horaInicio ?? '')
    const descricao = String(b.descricao ?? '').trim()

    if (!tecnicoId) return reply.status(400).send({ error: 'Informe o tecnicoId.' })
    if (!procedimentoId) return reply.status(400).send({ error: 'Informe o procedimentoId.' })
    if (!ehData(data)) return reply.status(400).send({ error: 'Informe data no formato AAAA-MM-DD.' })
    if (!ehHora(horaInicio)) return reply.status(400).send({ error: 'Informe horaInicio no formato HH:MM.' })
    if (descricao.length > MAX_DESCRICAO_AGENDAMENTO_PROGRAMADO) {
      return reply.status(400).send({
        error: `A descrição pode ter no máximo ${MAX_DESCRICAO_AGENDAMENTO_PROGRAMADO} caracteres.`,
      })
    }

    const [proc]: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome, duracao_min, ativo FROM cadastro_procedimentos WHERE id = ? LIMIT 1`,
      procedimentoId)
    if (!proc || Number(proc.ativo) !== 1) {
      return reply.status(400).send({ error: 'Procedimento inválido ou inativo.' })
    }

    // O procedimento pode estar amarrado a técnicos específicos; sem amarração, vale qualquer um.
    const doProc = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cod_tecnico AS id FROM cadastro_procedimentos_tecnicos WHERE procedimento_id = ?`,
      procedimentoId).catch(() => [])
    if (doProc.length > 0 && !doProc.some((r) => Number(r.id) === tecnicoId)) {
      return reply.status(400).send({ error: 'Esse técnico não atende o procedimento informado.' })
    }

    // Cliente: por id, ou pelo CNPJ/CPF, que é o que a aplicação externa costuma ter em mãos.
    let clienteId: number | null = Number(b.clienteId ?? 0) || null
    if (!clienteId && b.documento) {
      const doc = soDigitos(b.documento)
      const [cli]: any[] = await prisma.$queryRawUnsafe(
        `SELECT cod_cli FROM cliente
          WHERE REPLACE(REPLACE(REPLACE(COALESCE(CNPJ_CLI,''), '.', ''), '/', ''), '-', '') = ?
          LIMIT 1`, doc)
      if (!cli) return reply.status(404).send({ error: 'Cliente não encontrado para esse documento.' })
      clienteId = Number(cli.cod_cli)
    }
    if (clienteId) {
      const [existe]: any[] = await prisma.$queryRawUnsafe(
        `SELECT cod_cli FROM cliente WHERE cod_cli = ? LIMIT 1`, clienteId)
      if (!existe) return reply.status(404).send({ error: 'Cliente não encontrado.' })
    }

    const duracaoFinal = Math.max(
      MIN_DURACAO_PROCEDIMENTO,
      Number(b.duracao ?? proc.duracao_min ?? 60))

    const conflitoProg: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM agendamento_programado
        WHERE cod_tecnico = ? AND DATE(data_agendamento) = ? AND hora_inicio = ? AND status = 1`,
      tecnicoId, data, horaInicio)
    if (conflitoProg.length > 0) {
      return reply.status(409).send({ error: 'Já existe um agendamento nesse horário.' })
    }

    const conflitoAgenda: any[] = await prisma.$queryRawUnsafe(
      `SELECT cod_agenda FROM agenda
        WHERE cod_colaborador = ? AND DATE(data_agendamento) = ?
          AND TIME_FORMAT(hora_ini, '%H:%i') = ?
          AND COALESCE(Status_agendamento, 0) IN (0, 1)`,
      tecnicoId, data, horaInicio)
    if (conflitoAgenda.length > 0) {
      return reply.status(409).send({ error: 'Horário ocupado na agenda principal do técnico.' })
    }

    const janela = await validarJanelaAgendamentoProgramado({
      tecnicoId, data, horaInicio, duracao: duracaoFinal,
    })
    if (!janela.ok) return reply.status(409).send({ error: janela.motivo })

    const origem = `[${request.chave?.nome ?? 'integração'}]`
    const descricaoPersistida = montarDescricaoAgendamentoProgramado(
      descricao ? `${descricao} ${origem}` : `Agendado por ${origem}`,
      typeof b.tipo === 'string' ? b.tipo : null)

    await prisma.$executeRawUnsafe(
      `INSERT INTO agendamento_programado
         (cod_tecnico, cod_cli, procedimento_id, data_agendamento, hora_inicio, duracao_min, descricao, status)
       VALUES (?,?,?,?,?,?,?,1)`,
      tecnicoId, clienteId, procedimentoId, data, horaInicio, duracaoFinal, descricaoPersistida)

    const [inserido]: any[] = await prisma.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)
    const id = Number(inserido?.id ?? 0)

    enviarNotificacaoAgendamento({
      tecnicoId,
      clienteId: clienteId ?? undefined,
      data,
      horaIni: horaInicio,
      tipo: 'PROGRAMADO',
      observacao: limparPrefixoTipoAgendamentoProgramado(descricaoPersistida) || undefined,
      isProgramado: true,
      possuiAnexos: false,
    })

    if (id > 0) {
      registrarAuditoria({
        tabela: 'agendamento_programado', registroId: id, acao: 'CRIACAO',
        usuarioId: USUARIO_INTEGRACAO,
        dadosAntes: null,
        dadosDepois: {
          origem: `API: ${request.chave?.nome ?? ''}`,
          tecnicoId, clienteId, procedimentoId,
          procedimentoNome: String(proc.nome ?? ''),
          data, horaInicio, duracao: duracaoFinal,
        },
      })
      await sincronizarResponsavelImplantacao({
        clienteId, tecnicoId, usuarioId: USUARIO_INTEGRACAO,
        origem: 'API de integração (criação)',
      })
    }

    return reply.status(201).send({
      id, tecnicoId, clienteId, procedimentoId, data, horaInicio, duracaoMin: duracaoFinal,
    })
  })

  /** Consulta de um agendamento criado pela integração (ou por qualquer outro caminho). */
  app.get('/agendamentos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [r]: any[] = await prisma.$queryRawUnsafe(`
      SELECT ap.id, ap.cod_tecnico AS tecnicoId, ap.cod_cli AS clienteId,
             ap.procedimento_id AS procedimentoId, ap.duracao_min AS duracaoMin,
             DATE_FORMAT(ap.data_agendamento, '%Y-%m-%d') AS data,
             TIME_FORMAT(ap.hora_inicio, '%H:%i') AS horaInicio,
             ap.status, ap.descricao,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome,
             p.nome AS procedimentoNome
        FROM agendamento_programado ap
        LEFT JOIN usuario u ON u.COD_USU = ap.cod_tecnico
        LEFT JOIN cadastro_procedimentos p ON p.id = ap.procedimento_id
       WHERE ap.id = ? LIMIT 1`, Number(id))
    if (!r) return reply.status(404).send({ error: 'Agendamento não encontrado.' })
    return {
      ...r,
      id: Number(r.id),
      status: Number(r.status) === 1 ? 'ativo' : 'cancelado',
      descricao: limparPrefixoTipoAgendamentoProgramado(r.descricao) || null,
    }
  })

  /** Cancela. Status 0 em vez de apagar: o técnico já foi avisado, o registro precisa restar. */
  app.delete('/agendamentos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [r]: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM agendamento_programado WHERE id = ? AND status = 1`, Number(id))
    if (!r) return reply.status(404).send({ error: 'Agendamento não encontrado ou já cancelado.' })
    await prisma.$executeRawUnsafe(
      `UPDATE agendamento_programado SET status = 0 WHERE id = ?`, Number(id))
    registrarAuditoria({
      tabela: 'agendamento_programado', registroId: Number(id), acao: 'EXCLUSAO',
      usuarioId: USUARIO_INTEGRACAO, dadosAntes: null,
      dadosDepois: { origem: `API: ${(request as RequisicaoComChave).chave?.nome ?? ''}` },
    })
    return { ok: true }
  })
}

/**
 * Administração das chaves.
 *
 * Exige login e permissão de grupos de acesso: criar uma chave é abrir uma porta no sistema,
 * e isso pertence a quem já administra quem entra.
 */
async function exigirAdmin(request: FastifyRequest, reply: FastifyReply) {
  const id = Number((request.user as any)?.id ?? 0)
  const permissoes = await getUserPermissions(id).catch(() => [] as string[])
  // Recurso novo nasce desmarcado em todo grupo, então quem já administra Grupos de Acesso
  // entra por esse caminho — senão a tela nasceria invisível para todo mundo fora do super.
  const liberado = permissoes.includes('*')
    || permissoes.includes('chaves-api')
    || permissoes.includes('grupos-acesso')
  if (!liberado) {
    return reply.status(403).send({ error: 'Sem permissão para administrar chaves de API.' })
  }
}

export async function chavesApiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', exigirAdmin)

  app.get('/', { schema: { tags: ['Integração'] } }, async () => listarChaves())

  app.post('/', { schema: { tags: ['Integração'] } }, async (request, reply) => {
    const { nome } = request.body as { nome?: string }
    try {
      const r = await criarChave(
        String(nome ?? ''), Number((request.user as any)?.id || 0) || null)
      // O token aparece uma vez só. Quem não guardar agora gera outra chave.
      return reply.status(201).send(r)
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
  })

  app.delete('/:id', { schema: { tags: ['Integração'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await revogarChave(Number(id))
    return { ok: true }
  })
}
