import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'

/**
 * Lembretes fixos recorrentes (ex.: "todo dia importar os atendimentos", "toda segunda
 * responder o e-mail do desenvolvimento"). A tabela `lembrete_dia_fixo_agenda` já existia em
 * produção (usada antes pelo sistema legado) — cada ocorrência é uma linha própria (uma
 * regra "todo dia" vira 31 linhas, uma por dia do mês). Mantemos esse formato de execução
 * (é o que o scheduler lê), mas adicionamos:
 *  - `id` (a tabela não tinha chave primária — impossível editar/excluir uma linha específica)
 *  - `regra_id`, ligando cada linha gerada à regra em `lembrete_regra`, que guarda a intenção
 *    do usuário ("a cada 5 dias", "todo dia 19", etc.) para a tela poder mostrar/editar como
 *    uma coisa só, em vez de dezenas de linhas soltas.
 *
 * Linhas legadas (criadas antes desta tela existir) ficam com regra_id NULL e continuam
 * disparando normalmente — só não são editáveis pela regra, apenas removíveis.
 */

export const TIPOS_RECORRENCIA = ['DIARIO', 'A_CADA_N_DIAS', 'DIA_MES', 'DIA_SEMANA'] as const
export type TipoRecorrencia = (typeof TIPOS_RECORRENCIA)[number]

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

let initPromise: Promise<void> | null = null

export function ensureLembretesFixos(): Promise<void> {
  if (!initPromise) initPromise = initLembretesFixos()
  return initPromise
}

async function ensureColumnExists(table: string, column: string, ddl: string) {
  const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `
  if (rows.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

export async function initLembretesFixos(): Promise<void> {
  // A tabela legada não tem PK — adiciona sem perder nenhuma das linhas existentes.
  await ensureColumnExists('lembrete_dia_fixo_agenda', 'id', 'id INT AUTO_INCREMENT PRIMARY KEY FIRST')
  await ensureColumnExists('lembrete_dia_fixo_agenda', 'regra_id', 'regra_id INT NULL AFTER cod_usu')
  await ensureColumnExists('lembrete_dia_fixo_agenda', 'hora', 'hora TIME NULL AFTER dia_semana')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lembrete_regra (
      id                          INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id                  INT NOT NULL,
      titulo                      VARCHAR(50) NOT NULL,
      mensagem                    VARCHAR(255) NOT NULL,
      tipo_recorrencia            VARCHAR(20) NOT NULL,
      intervalo_dias              INT NULL,
      dia_mes                     INT NULL,
      dia_semana                  INT NULL,
      hora                        TIME NULL,
      somente_usuario_visualizar  CHAR(1) NOT NULL DEFAULT 'S',
      ativo                       TINYINT(1) NOT NULL DEFAULT 1,
      criado_em                   DATETIME NOT NULL DEFAULT NOW(),
      criado_por                  INT NULL,
      atualizado_em               DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_lembrete_regra_usuario (usuario_id),
      INDEX idx_lembrete_regra_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await ensureColumnExists('lembrete_regra', 'hora', 'hora TIME NULL AFTER dia_semana')
}

/** Calcula os dias-do-mês (1..31) em que uma regra deve disparar, para gerar as linhas legadas. */
export function calcularDiasDoMes(tipo: TipoRecorrencia, intervaloDias?: number | null, diaMes?: number | null): number[] {
  if (tipo === 'DIARIO') return Array.from({ length: 31 }, (_, i) => i + 1)
  if (tipo === 'DIA_MES') return diaMes ? [diaMes] : []
  if (tipo === 'A_CADA_N_DIAS') {
    const n = Math.max(1, Number(intervaloDias) || 1)
    const dias: number[] = []
    for (let d = 1; d <= 31; d += n) dias.push(d)
    return dias
  }
  return [] // DIA_SEMANA usa a coluna dia_semana, não dia_fixo
}

export function descreverRecorrencia(tipo: string, intervaloDias?: number | null, diaMes?: number | null, diaSemana?: number | null): string {
  if (tipo === 'DIARIO') return 'Todo dia'
  if (tipo === 'A_CADA_N_DIAS') return `A cada ${intervaloDias ?? '?'} dia(s)`
  if (tipo === 'DIA_MES') return `Todo dia ${diaMes ?? '?'} do mês`
  if (tipo === 'DIA_SEMANA') return `Toda(o) ${DIAS_SEMANA_LABEL[(Number(diaSemana) || 1) - 1] ?? diaSemana}`
  return tipo
}

/** Regenera as linhas de execução (lembrete_dia_fixo_agenda) de uma regra a partir do zero. */
export async function regenerarLinhasDaRegra(regraId: number, dados: {
  usuarioId: number
  titulo: string
  mensagem: string
  tipoRecorrencia: TipoRecorrencia
  intervaloDias?: number | null
  diaMes?: number | null
  diaSemana?: number | null
  hora?: string | null
  somenteUsuarioVisualizar: string
}): Promise<void> {
  await prisma.$executeRaw`DELETE FROM lembrete_dia_fixo_agenda WHERE regra_id = ${regraId}`

  if (dados.tipoRecorrencia === 'DIA_SEMANA') {
    await prisma.$executeRaw`
      INSERT INTO lembrete_dia_fixo_agenda (cod_usu, regra_id, dia_fixo, dia_semana, hora, Mensagem, Titulo, Somente_usuario_Visualizar)
      VALUES (${dados.usuarioId}, ${regraId}, NULL, ${dados.diaSemana}, ${dados.hora ?? null}, ${dados.mensagem}, ${dados.titulo}, ${dados.somenteUsuarioVisualizar})
    `
    return
  }

  const dias = calcularDiasDoMes(dados.tipoRecorrencia, dados.intervaloDias, dados.diaMes)
  for (const dia of dias) {
    await prisma.$executeRaw`
      INSERT INTO lembrete_dia_fixo_agenda (cod_usu, regra_id, dia_fixo, dia_semana, hora, Mensagem, Titulo, Somente_usuario_Visualizar)
      VALUES (${dados.usuarioId}, ${regraId}, ${dia}, NULL, ${dados.hora ?? null}, ${dados.mensagem}, ${dados.titulo}, ${dados.somenteUsuarioVisualizar})
    `
  }
}

// ── Scheduler ──────────────────────────────────────────────────
let processando = false
let schedulerHandle: ReturnType<typeof setInterval> | null = null
const INTERVALO_MS = 10 * 60 * 1000 // a cada 10 minutos

async function jaNotificadoHoje(chaveEvento: string, canal: 'plataforma' | 'telegram', usuarioId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COUNT(*) AS total FROM notificacao_agendamento
    WHERE chave_evento = ${chaveEvento} AND canal = ${canal} AND usuario_id = ${usuarioId}
    LIMIT 1
  `
  return Number(rows[0]?.total ?? 0) > 0
}

async function registrarNotificacaoLembrete(usuarioId: number, canal: 'plataforma' | 'telegram', chaveEvento: string, titulo: string, mensagem: string) {
  await prisma.$executeRaw`
    INSERT INTO notificacao_agendamento (usuario_id, canal, tipo, chave_evento, titulo, mensagem, lida, criado_em)
    VALUES (${usuarioId}, ${canal}, 'lembrete_fixo', ${chaveEvento}, ${titulo}, ${mensagem}, 0, NOW())
  `
}

export async function processarLembretesFixos(agora = new Date()): Promise<{ processadas: number; plataforma: number; telegram: number }> {
  await ensureLembretesFixos()

  const diaMes = agora.getDate()
  // Convenção: 1=Domingo ... 7=Sábado (getDay() é 0=Domingo..6=Sábado).
  const diaSemana = agora.getDay() + 1
  const hojeStr = agora.toISOString().slice(0, 10)
  const horaAtual = agora.toTimeString().slice(0, 8) // 'HH:MM:SS'

  const linhas = await prisma.$queryRaw<Array<{
    id: number; cod_usu: number; Mensagem: string; Titulo: string | null
    telegramId: string | null; hora: string | null
  }>>`
    SELECT L.id, L.cod_usu, L.Mensagem, L.Titulo, U.ID_TELEGRAM AS telegramId, L.hora
    FROM lembrete_dia_fixo_agenda L
    LEFT JOIN usuario U ON U.COD_USU = L.cod_usu
    WHERE L.cod_usu IS NOT NULL
      AND (
        (L.dia_fixo IS NOT NULL AND L.dia_fixo = ${diaMes})
        OR (L.dia_fixo IS NULL AND L.dia_semana IS NOT NULL AND L.dia_semana = ${diaSemana})
      )
      AND (L.hora IS NULL OR L.hora <= ${horaAtual})
  `

  let plataforma = 0
  let telegram = 0
  const telegramConfig = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })

  for (const linha of linhas) {
    const titulo = linha.Titulo || 'Lembrete'
    const mensagem = linha.Mensagem || ''
    const usuarioId = Number(linha.cod_usu)

    const chavePlataforma = `lembrete_fixo:linha-${linha.id}:${hojeStr}`
    if (!(await jaNotificadoHoje(chavePlataforma, 'plataforma', usuarioId))) {
      await registrarNotificacaoLembrete(usuarioId, 'plataforma', chavePlataforma, titulo, mensagem)
      plataforma += 1
    }

    const chaveTelegram = `lembrete_fixo:linha-${linha.id}:${hojeStr}:tg`
    const destino = linha.telegramId || telegramConfig?.userIdPadrao || ''
    if (destino && !(await jaNotificadoHoje(chaveTelegram, 'telegram', usuarioId))) {
      const envio = await TelegramService.enviar({ userId: destino, mensagem: `📌 ${titulo}\n\n${mensagem}` })
      if (envio.success) {
        await registrarNotificacaoLembrete(usuarioId, 'telegram', chaveTelegram, titulo, mensagem)
        telegram += 1
      }
    }
  }

  return { processadas: linhas.length, plataforma, telegram }
}

/**
 * Avisa (uma única vez) o dono de cada regra ativa criada antes do campo "hora" existir —
 * sem horário definido, o lembrete continua dispando a qualquer momento do dia em que o
 * scheduler rodar, em vez do horário escolhido. Some quando o usuário edita a regra e define
 * um horário (chave de dedup usa o valor atual de "hora", então volta a avisar se for
 * limpo de novo no futuro).
 */
export async function avisarRegrasSemHorario(): Promise<{ avisadas: number }> {
  await ensureLembretesFixos()

  const regras = await prisma.$queryRaw<Array<{
    id: number; usuario_id: number; titulo: string; telegramId: string | null
  }>>`
    SELECT R.id, R.usuario_id, R.titulo, U.ID_TELEGRAM AS telegramId
    FROM lembrete_regra R
    LEFT JOIN usuario U ON U.COD_USU = R.usuario_id
    WHERE R.ativo = 1 AND R.hora IS NULL
  `

  if (!regras.length) return { avisadas: 0 }

  let avisadas = 0
  const telegramConfig = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })
  const titulo = 'Defina o horário do seu lembrete fixo'

  for (const regra of regras) {
    const usuarioId = Number(regra.usuario_id)
    const mensagem = `O lembrete "${regra.titulo}" ainda não tem um horário definido e está disparando a qualquer hora do dia. Edite o lembrete em Agenda > Lembretes Fixos e escolha um horário.`

    const chavePlataforma = `lembrete_fixo_sem_hora:regra-${regra.id}`
    let notificouAlgo = false
    if (!(await jaNotificadoHoje(chavePlataforma, 'plataforma', usuarioId))) {
      await registrarNotificacaoLembrete(usuarioId, 'plataforma', chavePlataforma, titulo, mensagem)
      notificouAlgo = true
    }

    const chaveTelegram = `lembrete_fixo_sem_hora:regra-${regra.id}:tg`
    const destino = regra.telegramId || telegramConfig?.userIdPadrao || ''
    if (destino && !(await jaNotificadoHoje(chaveTelegram, 'telegram', usuarioId))) {
      const envio = await TelegramService.enviar({ userId: destino, mensagem: `⏰ ${titulo}\n\n${mensagem}` })
      if (envio.success) {
        await registrarNotificacaoLembrete(usuarioId, 'telegram', chaveTelegram, titulo, mensagem)
        notificouAlgo = true
      }
    }

    if (notificouAlgo) avisadas += 1
  }

  return { avisadas }
}

async function executarCicloLembretes(): Promise<void> {
  await processarLembretesFixos().catch((e) => console.warn('⚠ Lembretes fixos:', e?.message))
  await avisarRegrasSemHorario().catch((e) => console.warn('⚠ Aviso de lembretes sem horário:', e?.message))
}

export function startLembretesFixosScheduler(): void {
  if (schedulerHandle) return
  schedulerHandle = setInterval(() => {
    if (processando) return
    processando = true
    executarCicloLembretes().finally(() => { processando = false })
  }, INTERVALO_MS)
  // Primeira checagem logo após o boot, sem esperar o primeiro intervalo.
  setTimeout(() => {
    if (processando) return
    processando = true
    executarCicloLembretes().finally(() => { processando = false })
  }, 15_000)
}
