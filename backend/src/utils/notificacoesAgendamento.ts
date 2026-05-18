import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'

export interface ConfiguracaoNotificacaoAgendamento {
  ativoPlataforma: boolean
  ativoTelegram: boolean
  horarioResumoDia: string
  antecedenciaMin: number
}

export interface NotificacaoPlataformaItem {
  id: number
  titulo: string
  mensagem: string
  tipo: 'agenda_dia' | 'agenda_lembrete'
  lida: boolean
  criadoEm: string
  agendaOrigem?: 'agenda' | 'programado' | null
  agendaId?: number | null
  agendamentoData?: string | null
  agendamentoHora?: string | null
}

type CanalNotificacao = 'plataforma' | 'telegram'
type TipoNotificacao = 'agenda_dia' | 'agenda_lembrete'

interface AgendamentoBase {
  id: number
  origem: 'agenda' | 'programado'
  tecnicoId: number | null
  tecnicoNome: string | null
  tecnicoTelegramId: string | null
  clienteId: number | null
  clienteNome: string | null
  tipo: string | null
  data: string | null
  horarioIni: string | null
  horarioFim: string | null
  observacoes: string | null
}

let schedulerHandle: NodeJS.Timeout | null = null
let schedulerRodando = false

const CONFIG_DEFAULT: ConfiguracaoNotificacaoAgendamento = {
  ativoPlataforma: true,
  ativoTelegram: true,
  horarioResumoDia: '08:00',
  antecedenciaMin: 30,
}

function normalizarHorario(horario: string | null | undefined): string {
  const valor = String(horario || '').trim()
  return /^\d{2}:\d{2}$/.test(valor) ? valor : CONFIG_DEFAULT.horarioResumoDia
}

function normalizarAntecedencia(valor: unknown): number {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return CONFIG_DEFAULT.antecedenciaMin
  return Math.max(1, Math.min(24 * 60, Math.round(numero)))
}

function formatarDataISO(date: Date): string {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function parseDateTimeLocal(data: string | null | undefined, hora: string | null | undefined): Date | null {
  if (!data || !hora) return null
  const valorHora = hora.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(valorHora)) return null
  const dt = new Date(`${data}T${valorHora}:00`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function formatarDataPtBr(data: string | null | undefined): string {
  if (!data) return '-'
  const dt = new Date(`${data}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return data
  return dt.toLocaleDateString('pt-BR')
}

function minutosEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000))
}

function construirChaveEvento(params: {
  canal: CanalNotificacao
  tipo: TipoNotificacao
  usuarioId: number
  origem?: string
  agendaId?: number | null
  dataRef: string
  horarioRef?: string | null
  antecedenciaMin?: number
}): string {
  if (params.tipo === 'agenda_dia') {
    return `${params.tipo}:${params.canal}:usuario-${params.usuarioId}:${params.dataRef}`
  }

  return [
    params.tipo,
    params.canal,
    `usuario-${params.usuarioId}`,
    params.origem || 'agenda',
    params.agendaId ?? '0',
    params.dataRef,
    params.horarioRef || '00:00',
    params.antecedenciaMin ?? 0,
  ].join(':')
}

async function existeNotificacao(chaveEvento: string, canal: CanalNotificacao, usuarioId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COUNT(*) AS total
    FROM notificacao_agendamento
    WHERE chave_evento = ${chaveEvento}
      AND canal = ${canal}
      AND usuario_id = ${usuarioId}
    LIMIT 1
  `

  return Number(rows[0]?.total ?? 0) > 0
}

async function registrarNotificacao(params: {
  usuarioId: number
  canal: CanalNotificacao
  tipo: TipoNotificacao
  chaveEvento: string
  titulo: string
  mensagem: string
  agendaOrigem?: string | null
  agendaId?: number | null
  agendamentoData?: string | null
  agendamentoHora?: string | null
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO notificacao_agendamento (
      usuario_id, canal, tipo, chave_evento, titulo, mensagem,
      agenda_origem, agenda_id, agendamento_data, agendamento_hora,
      lida, criado_em
    )
    VALUES (
      ${params.usuarioId}, ${params.canal}, ${params.tipo}, ${params.chaveEvento}, ${params.titulo}, ${params.mensagem},
      ${params.agendaOrigem ?? null}, ${params.agendaId ?? null}, ${params.agendamentoData ?? null}, ${params.agendamentoHora ?? null},
      0, NOW()
    )
  `
}

async function listarAgendamentosEntre(dataInicial: string, dataFinal: string): Promise<AgendamentoBase[]> {
  const rows = await prisma.$queryRaw<AgendamentoBase[]>`
    SELECT a.cod_agenda AS id,
           'agenda' AS origem,
           a.cod_colaborador AS tecnicoId,
           COALESCE(tec.NOME_USUARIO_COMPLETO, tec.NOME_USU) AS tecnicoNome,
           tec.idTelegram AS tecnicoTelegramId,
           a.cod_cli AS clienteId,
           COALESCE(cli.NOME_FANTASIA, cli.NOME_CLI) AS clienteNome,
           a.Tipo AS tipo,
           DATE_FORMAT(a.data_agendamento, '%Y-%m-%d') AS data,
           a.hora_ini AS horarioIni,
           a.hora_fin AS horarioFim,
           a.descricao AS observacoes
      FROM agenda a
      LEFT JOIN cliente cli ON cli.COD_CLI = a.cod_cli
      LEFT JOIN usuario tec ON tec.COD_USU = a.cod_colaborador
     WHERE DATE(a.data_agendamento) BETWEEN ${dataInicial} AND ${dataFinal}
       AND a.hora_ini IS NOT NULL
       AND COALESCE(a.Status_agendamento, 0) IN (0, 1)

    UNION ALL

    SELECT p.id AS id,
           'programado' AS origem,
           p.cod_tecnico AS tecnicoId,
           COALESCE(tecP.NOME_USUARIO_COMPLETO, tecP.NOME_USU) AS tecnicoNome,
           tecP.idTelegram AS tecnicoTelegramId,
           p.cod_cli AS clienteId,
           COALESCE(cliP.NOME_FANTASIA, cliP.NOME_CLI) AS clienteNome,
           COALESCE(cp.nome, 'Agendamento Programado') AS tipo,
           DATE_FORMAT(p.data_agendamento, '%Y-%m-%d') AS data,
           p.hora_inicio AS horarioIni,
           NULL AS horarioFim,
           p.descricao AS observacoes
      FROM agendamento_programado p
      LEFT JOIN cliente cliP ON cliP.COD_CLI = p.cod_cli
      LEFT JOIN usuario tecP ON tecP.COD_USU = p.cod_tecnico
      LEFT JOIN cadastro_procedimentos cp ON cp.id = p.procedimento_id
     WHERE DATE(p.data_agendamento) BETWEEN ${dataInicial} AND ${dataFinal}
       AND p.hora_inicio IS NOT NULL
       AND p.status = 1
  `

  return rows
}

function construirMensagemResumo(agendamentos: AgendamentoBase[], dataRef: string, tecnicoNome: string | null): { titulo: string; mensagem: string } {
  const titulo = 'Agendamentos do dia'
  const linhas = agendamentos
    .sort((a, b) => String(a.horarioIni || '').localeCompare(String(b.horarioIni || '')))
    .slice(0, 8)
    .map((item) => `• ${item.horarioIni || '--:--'} - ${item.clienteNome || 'Cliente não informado'} (${item.tipo || 'Agendamento'})`)

  const total = agendamentos.length
  const restante = total > linhas.length ? `\nE mais ${total - linhas.length} agendamento(s).` : ''
  const saudacao = tecnicoNome ? `${tecnicoNome}, ` : ''

  return {
    titulo,
    mensagem: `${saudacao}você tem ${total} agendamento(s) em ${formatarDataPtBr(dataRef)}.\n\n${linhas.join('\n')}${restante}`,
  }
}

function construirMensagemLembrete(agendamento: AgendamentoBase, antecedenciaMin: number): { titulo: string; mensagem: string } {
  const titulo = 'Lembrete de agendamento'
  const cliente = agendamento.clienteNome || 'Cliente não informado'
  const tipo = agendamento.tipo || 'Agendamento'
  const horario = agendamento.horarioIni || '--:--'
  const data = formatarDataPtBr(agendamento.data)
  const obs = agendamento.observacoes ? `\nObservação: ${agendamento.observacoes}` : ''

  return {
    titulo,
    mensagem: `Seu agendamento com ${cliente} começa às ${horario} de ${data}, em ${antecedenciaMin} minuto(s).\nTipo: ${tipo}${obs}`,
  }
}

async function gerarResumoDiario(
  tecnicoId: number,
  tecnicoTelegramId: string | null,
  tecnicoNome: string | null,
  agendamentos: AgendamentoBase[],
  config: ConfiguracaoNotificacaoAgendamento,
  dataRef: string
): Promise<void> {
  const resumo = construirMensagemResumo(agendamentos, dataRef, tecnicoNome)

  if (config.ativoPlataforma) {
    const chavePlataforma = construirChaveEvento({
      canal: 'plataforma',
      tipo: 'agenda_dia',
      usuarioId: tecnicoId,
      dataRef,
    })

    if (!(await existeNotificacao(chavePlataforma, 'plataforma', tecnicoId))) {
      await registrarNotificacao({
        usuarioId: tecnicoId,
        canal: 'plataforma',
        tipo: 'agenda_dia',
        chaveEvento: chavePlataforma,
        titulo: resumo.titulo,
        mensagem: resumo.mensagem,
        agendamentoData: dataRef,
      })
    }
  }

  if (config.ativoTelegram) {
    const chaveTelegram = construirChaveEvento({
      canal: 'telegram',
      tipo: 'agenda_dia',
      usuarioId: tecnicoId,
      dataRef,
    })

    if (!(await existeNotificacao(chaveTelegram, 'telegram', tecnicoId))) {
      const telegramConfig = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })
      const destino = tecnicoTelegramId || telegramConfig?.userIdPadrao || ''

      if (destino) {
        const envio = await TelegramService.enviar({
          userId: destino,
          mensagem: `📌 ${resumo.titulo}\n\n${resumo.mensagem}`,
        })

        if (envio.success) {
          await registrarNotificacao({
            usuarioId: tecnicoId,
            canal: 'telegram',
            tipo: 'agenda_dia',
            chaveEvento: chaveTelegram,
            titulo: resumo.titulo,
            mensagem: resumo.mensagem,
            agendamentoData: dataRef,
          })
        }
      }
    }
  }
}

async function gerarLembreteAgendamento(
  agendamento: AgendamentoBase,
  config: ConfiguracaoNotificacaoAgendamento
): Promise<void> {
  const tecnicoId = Number(agendamento.tecnicoId || 0)
  if (!tecnicoId) return

  const lembrete = construirMensagemLembrete(agendamento, config.antecedenciaMin)

  if (config.ativoPlataforma) {
    const chavePlataforma = construirChaveEvento({
      canal: 'plataforma',
      tipo: 'agenda_lembrete',
      usuarioId: tecnicoId,
      origem: agendamento.origem,
      agendaId: agendamento.id,
      dataRef: agendamento.data || '',
      horarioRef: agendamento.horarioIni,
      antecedenciaMin: config.antecedenciaMin,
    })

    if (!(await existeNotificacao(chavePlataforma, 'plataforma', tecnicoId))) {
      await registrarNotificacao({
        usuarioId: tecnicoId,
        canal: 'plataforma',
        tipo: 'agenda_lembrete',
        chaveEvento: chavePlataforma,
        titulo: lembrete.titulo,
        mensagem: lembrete.mensagem,
        agendaOrigem: agendamento.origem,
        agendaId: agendamento.id,
        agendamentoData: agendamento.data,
        agendamentoHora: agendamento.horarioIni,
      })
    }
  }

  if (config.ativoTelegram) {
    const chaveTelegram = construirChaveEvento({
      canal: 'telegram',
      tipo: 'agenda_lembrete',
      usuarioId: tecnicoId,
      origem: agendamento.origem,
      agendaId: agendamento.id,
      dataRef: agendamento.data || '',
      horarioRef: agendamento.horarioIni,
      antecedenciaMin: config.antecedenciaMin,
    })

    if (!(await existeNotificacao(chaveTelegram, 'telegram', tecnicoId))) {
      const telegramConfig = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })
      const destino = agendamento.tecnicoTelegramId || telegramConfig?.userIdPadrao || ''

      if (destino) {
        const envio = await TelegramService.enviar({
          userId: destino,
          mensagem: `⏰ ${lembrete.titulo}\n\n${lembrete.mensagem}`,
        })

        if (envio.success) {
          await registrarNotificacao({
            usuarioId: tecnicoId,
            canal: 'telegram',
            tipo: 'agenda_lembrete',
            chaveEvento: chaveTelegram,
            titulo: lembrete.titulo,
            mensagem: lembrete.mensagem,
            agendaOrigem: agendamento.origem,
            agendaId: agendamento.id,
            agendamentoData: agendamento.data,
            agendamentoHora: agendamento.horarioIni,
          })
        }
      }
    }
  }
}

export async function initNotificacoesAgendamento(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS configuracao_notificacao_agendamento (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ativo_plataforma TINYINT(1) NOT NULL DEFAULT 1,
      ativo_telegram TINYINT(1) NOT NULL DEFAULT 1,
      horario_resumo_dia VARCHAR(5) NOT NULL DEFAULT '08:00',
      antecedencia_min INT NOT NULL DEFAULT 30,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em DATETIME NOT NULL DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS notificacao_agendamento (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      canal VARCHAR(20) NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      chave_evento VARCHAR(190) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      mensagem TEXT NOT NULL,
      agenda_origem VARCHAR(20) NULL,
      agenda_id INT NULL,
      agendamento_data DATE NULL,
      agendamento_hora VARCHAR(5) NULL,
      lida TINYINT(1) NOT NULL DEFAULT 0,
      lida_em DATETIME NULL,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_notificacao_agendamento_chave (chave_evento),
      KEY idx_notificacao_usuario_canal_lida (usuario_id, canal, lida),
      KEY idx_notificacao_criado_em (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const existentes = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COUNT(*) AS total FROM configuracao_notificacao_agendamento
  `

  if (Number(existentes[0]?.total ?? 0) === 0) {
    await prisma.$executeRaw`
      INSERT INTO configuracao_notificacao_agendamento (
        ativo_plataforma, ativo_telegram, horario_resumo_dia, antecedencia_min, criado_em, atualizado_em
      )
      VALUES (1, 1, ${CONFIG_DEFAULT.horarioResumoDia}, ${CONFIG_DEFAULT.antecedenciaMin}, NOW(), NOW())
    `
  }
}

export async function getConfigNotificacaoAgendamento(): Promise<ConfiguracaoNotificacaoAgendamento> {
  const rows = await prisma.$queryRaw<Array<{
    ativo_plataforma: number
    ativo_telegram: number
    horario_resumo_dia: string
    antecedencia_min: number
  }>>`
    SELECT ativo_plataforma, ativo_telegram, horario_resumo_dia, antecedencia_min
    FROM configuracao_notificacao_agendamento
    ORDER BY id ASC
    LIMIT 1
  `

  const row = rows[0]
  if (!row) return { ...CONFIG_DEFAULT }

  return {
    ativoPlataforma: Number(row.ativo_plataforma ?? 0) === 1,
    ativoTelegram: Number(row.ativo_telegram ?? 0) === 1,
    horarioResumoDia: normalizarHorario(row.horario_resumo_dia),
    antecedenciaMin: normalizarAntecedencia(row.antecedencia_min),
  }
}

export async function saveConfigNotificacaoAgendamento(data: Partial<ConfiguracaoNotificacaoAgendamento>): Promise<ConfiguracaoNotificacaoAgendamento> {
  const atual = await getConfigNotificacaoAgendamento()
  const proximo: ConfiguracaoNotificacaoAgendamento = {
    ativoPlataforma: data.ativoPlataforma ?? atual.ativoPlataforma,
    ativoTelegram: data.ativoTelegram ?? atual.ativoTelegram,
    horarioResumoDia: normalizarHorario(data.horarioResumoDia ?? atual.horarioResumoDia),
    antecedenciaMin: normalizarAntecedencia(data.antecedenciaMin ?? atual.antecedenciaMin),
  }

  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM configuracao_notificacao_agendamento
    ORDER BY id ASC
    LIMIT 1
  `

  if (rows[0]?.id) {
    await prisma.$executeRaw`
      UPDATE configuracao_notificacao_agendamento
         SET ativo_plataforma = ${proximo.ativoPlataforma ? 1 : 0},
             ativo_telegram = ${proximo.ativoTelegram ? 1 : 0},
             horario_resumo_dia = ${proximo.horarioResumoDia},
             antecedencia_min = ${proximo.antecedenciaMin},
             atualizado_em = NOW()
       WHERE id = ${rows[0].id}
    `
  } else {
    await prisma.$executeRaw`
      INSERT INTO configuracao_notificacao_agendamento (
        ativo_plataforma, ativo_telegram, horario_resumo_dia, antecedencia_min, criado_em, atualizado_em
      )
      VALUES (
        ${proximo.ativoPlataforma ? 1 : 0}, ${proximo.ativoTelegram ? 1 : 0}, ${proximo.horarioResumoDia}, ${proximo.antecedenciaMin}, NOW(), NOW()
      )
    `
  }

  return proximo
}

export async function listNotificacoesPlataforma(usuarioId: number, limit = 20): Promise<NotificacaoPlataformaItem[]> {
  const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)))
  const rows = await prisma.$queryRaw<Array<{
    id: number
    titulo: string
    mensagem: string
    tipo: TipoNotificacao
    lida: number
    criadoEm: Date | string
    agendaOrigem: 'agenda' | 'programado' | null
    agendaId: number | null
    agendamentoData: string | null
    agendamentoHora: string | null
  }>>`
    SELECT id,
           titulo,
           mensagem,
           tipo,
           lida,
           criado_em AS criadoEm,
           agenda_origem AS agendaOrigem,
           agenda_id AS agendaId,
           DATE_FORMAT(agendamento_data, '%Y-%m-%d') AS agendamentoData,
           agendamento_hora AS agendamentoHora
      FROM notificacao_agendamento
     WHERE usuario_id = ${usuarioId}
       AND canal = 'plataforma'
     ORDER BY criado_em DESC
     LIMIT ${safeLimit}
  `

  return rows.map((row) => ({
    id: Number(row.id),
    titulo: row.titulo,
    mensagem: row.mensagem,
    tipo: row.tipo,
    lida: Number(row.lida ?? 0) === 1,
    criadoEm: row.criadoEm instanceof Date ? row.criadoEm.toISOString() : String(row.criadoEm),
    agendaOrigem: row.agendaOrigem,
    agendaId: row.agendaId,
    agendamentoData: row.agendamentoData,
    agendamentoHora: row.agendamentoHora,
  }))
}

export async function marcarNotificacaoLida(id: number, usuarioId: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE notificacao_agendamento
       SET lida = 1,
           lida_em = NOW()
     WHERE id = ${id}
       AND usuario_id = ${usuarioId}
       AND canal = 'plataforma'
  `

  return Number(result) > 0
}

export async function processarNotificacoesAgendamento(agora = new Date()): Promise<void> {
  if (schedulerRodando) return
  schedulerRodando = true

  try {
    const config = await getConfigNotificacaoAgendamento()
    if (!config.ativoPlataforma && !config.ativoTelegram) return

    const hoje = formatarDataISO(agora)
    const amanha = formatarDataISO(new Date(agora.getTime() + 24 * 60 * 60 * 1000))

    const agendamentosHoje = await listarAgendamentosEntre(hoje, hoje)
    const [horaResumo, minResumo] = config.horarioResumoDia.split(':').map((parte) => Number(parte))
    const resumoLiberado = agora.getHours() > horaResumo || (agora.getHours() === horaResumo && agora.getMinutes() >= minResumo)

    if (resumoLiberado) {
      const porTecnico = new Map<number, AgendamentoBase[]>()

      for (const item of agendamentosHoje) {
        const tecnicoId = Number(item.tecnicoId || 0)
        if (!tecnicoId) continue
        if (!porTecnico.has(tecnicoId)) porTecnico.set(tecnicoId, [])
        porTecnico.get(tecnicoId)!.push(item)
      }

      for (const [tecnicoId, itens] of porTecnico.entries()) {
        const tecnicoTelegramId = itens[0]?.tecnicoTelegramId || null
        const tecnicoNome = itens[0]?.tecnicoNome || null
        await gerarResumoDiario(tecnicoId, tecnicoTelegramId, tecnicoNome, itens, config, hoje)
      }
    }

    const agendamentosJanela = await listarAgendamentosEntre(hoje, amanha)
    for (const agendamento of agendamentosJanela) {
      const inicio = parseDateTimeLocal(agendamento.data, agendamento.horarioIni)
      if (!inicio) continue

      const lembreteEm = new Date(inicio.getTime() - config.antecedenciaMin * 60 * 1000)
      if (agora < lembreteEm || agora >= inicio) continue

      await gerarLembreteAgendamento(agendamento, config)
    }
  } catch (error: any) {
    console.warn('[notificacoes-agendamento] Falha ao processar notificações:', error?.message || error)
  } finally {
    schedulerRodando = false
  }
}

export function startNotificacoesAgendamentoScheduler(): void {
  if (schedulerHandle) return

  setTimeout(() => {
    processarNotificacoesAgendamento().catch((error) => {
      console.warn('[notificacoes-agendamento] Falha na execução inicial:', (error as any)?.message || error)
    })
  }, 10_000)

  schedulerHandle = setInterval(() => {
    processarNotificacoesAgendamento().catch((error) => {
      console.warn('[notificacoes-agendamento] Falha no agendador:', (error as any)?.message || error)
    })
  }, 60_000)
}
