import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { registrarMovimentacao, ensureImplantacaoBootstrap } from '../routes/pipeline'

const POLL_INTERVAL_MS = 10 * 60 * 1000

interface ProcessoVencidoRow {
  processoId: number
  clienteId: number
  titulo: string | null
  servicoNome: string | null
  dataLimite: Date
  responsavelId: number | null
  clienteNome: string | null
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10).split('-').reverse().join('/')
}

async function notificarProcessoVencido(processo: ProcessoVencidoRow): Promise<void> {
  const titulo = processo.servicoNome || processo.titulo || 'Implantação'
  const dataFormatada = formatarData(processo.dataLimite)
  const mensagem =
    `⚠️ Prazo vencido!\n\n` +
    `Cliente: ${processo.clienteNome || `#${processo.clienteId}`}\n` +
    `Processo: ${titulo}\n` +
    `Data limite combinada: ${dataFormatada}\n\n` +
    `Verifique com o cliente e atualize o prazo no Pipeline de Implantação.`

  let observacaoHistorico: string
  let usuarioAlvoId: number | null = null

  if (!processo.responsavelId) {
    observacaoHistorico = `⚠️ Prazo combinado (${dataFormatada}) venceu, mas o processo não tem responsável definido — notificação não enviada.`
  } else {
    const responsavel = await prisma.usuario.findUnique({ where: { id: processo.responsavelId } })
    const telegramConfig = await prisma.configuracaoTelegram.findFirst({ where: { ativo: true } })
    const destino = responsavel?.idTelegram || telegramConfig?.userIdPadrao || ''
    usuarioAlvoId = processo.responsavelId

    const nomeResponsavel = responsavel?.nomeCompleto || responsavel?.nomeUsu || 'responsável'
    if (!destino) {
      observacaoHistorico = `⚠️ Prazo combinado (${dataFormatada}) venceu — ${nomeResponsavel} não tem Telegram configurado, notificação não enviada.`
    } else {
      const envio = await TelegramService.enviar({ userId: destino, mensagem })
      observacaoHistorico = envio.success
        ? `⚠️ Prazo combinado (${dataFormatada}) venceu — ${nomeResponsavel} notificado via Telegram.`
        : `⚠️ Prazo combinado (${dataFormatada}) venceu — falha ao notificar ${nomeResponsavel} via Telegram (${envio.error ?? 'erro desconhecido'}).`
    }
  }

  await registrarMovimentacao({
    clienteId: processo.clienteId,
    processoId: processo.processoId,
    tipo: 'observacao',
    responsavelId: usuarioAlvoId,
    observacao: observacaoHistorico,
    usuarioId: null,
  })

  await prisma.$executeRaw`
    UPDATE implantacao_processos SET notificado_vencimento = UTC_TIMESTAMP() WHERE id = ${processo.processoId}
  `
}

export async function processarVencimentosImplantacao(): Promise<void> {
  await ensureImplantacaoBootstrap()
  const vencidos = await prisma.$queryRaw<ProcessoVencidoRow[]>`
    SELECT
      P.id AS processoId,
      P.cliente_id AS clienteId,
      P.titulo,
      P.servico_nome AS servicoNome,
      P.data_limite AS dataLimite,
      COALESCE(IRP.responsavel_id, IR.responsavel_id) AS responsavelId,
      COALESCE(C.NOME_FANTASIA, C.NOME_CLI) AS clienteNome
    FROM implantacao_processos P
    INNER JOIN cliente C ON C.cod_cli = P.cliente_id
    LEFT JOIN implantacao_responsavel_processo IRP ON IRP.processo_id = P.id
    LEFT JOIN implantacao_responsavel IR ON P.processo_principal = 1 AND IR.cliente_id = P.cliente_id
    WHERE COALESCE(P.ativo, 1) = 1
      AND P.data_limite IS NOT NULL
      AND P.data_limite < CURDATE()
      AND P.notificado_vencimento IS NULL
    LIMIT 100
  `

  for (const processo of vencidos) {
    await notificarProcessoVencido(processo).catch((e) =>
      console.warn(`⚠ Falha ao notificar vencimento do processo ${processo.processoId}:`, e?.message)
    )
  }
}

let processando = false
let schedulerHandle: ReturnType<typeof setInterval> | null = null

export function startNotificacoesVencimentoScheduler(): void {
  if (schedulerHandle) return
  const executar = () => {
    if (processando) return
    processando = true
    processarVencimentosImplantacao()
      .catch((e) => console.warn('⚠ Notificações de vencimento:', e?.message))
      .finally(() => {
        processando = false
      })
  }
  schedulerHandle = setInterval(executar, POLL_INTERVAL_MS)
  setTimeout(executar, 20_000)
}
