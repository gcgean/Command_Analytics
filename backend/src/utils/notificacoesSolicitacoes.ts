import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'

const nome = (u: { nomeCompleto?: string | null; nomeUsu?: string | null } | null) =>
  u?.nomeCompleto || u?.nomeUsu || 'alguém'

/**
 * Avisa no Telegram quem lançou a solicitação, o técnico responsável e o desenvolvedor
 * vinculado sobre o que mudou — exceto quem fez a própria alteração. Nunca lança: falha de
 * envio só é logada, igual ao padrão já usado em notificacoesAgendamento.ts.
 */
export async function notificarAtualizacaoSolicitacao(
  atendimentoId: number,
  usuarioAtorId: number,
  descricao: string
): Promise<void> {
  try {
    const atendimento = await prisma.atendimento.findUnique({
      where: { id: atendimentoId },
      select: {
        usuarioLancId: true,
        tecnico: { select: { id: true, idTelegram: true } },
        desenvolvedor: { select: { id: true, idTelegram: true } },
      },
    })
    if (!atendimento) return

    const candidatos: Array<{ id: number; idTelegram: string | null }> = []
    if (atendimento.tecnico) candidatos.push(atendimento.tecnico)
    if (atendimento.desenvolvedor) candidatos.push(atendimento.desenvolvedor)
    if (
      atendimento.usuarioLancId &&
      atendimento.usuarioLancId !== atendimento.tecnico?.id &&
      atendimento.usuarioLancId !== atendimento.desenvolvedor?.id
    ) {
      const lancador = await prisma.usuario.findUnique({
        where: { id: atendimento.usuarioLancId },
        select: { id: true, idTelegram: true },
      })
      if (lancador) candidatos.push(lancador)
    }

    const destinatarios = candidatos.filter(
      (c, i, arr) => c.id !== usuarioAtorId && !!c.idTelegram && arr.findIndex((o) => o.idTelegram === c.idTelegram) === i
    )
    if (!destinatarios.length) return

    const ator = await prisma.usuario.findUnique({
      where: { id: usuarioAtorId },
      select: { nomeCompleto: true, nomeUsu: true },
    })
    const mensagem = `🔔 Solicitação #${atendimentoId}\n${descricao}\n\nAlterado por: ${nome(ator)}`

    for (const destinatario of destinatarios) {
      const envio = await TelegramService.enviar({ userId: destinatario.idTelegram as string, mensagem })
      if (!envio.success) {
        console.warn(`⚠ Falha ao notificar usuário ${destinatario.id} sobre solicitação #${atendimentoId}:`, envio.error)
      }
    }
  } catch (e) {
    console.warn(`⚠ Erro ao notificar atualização da solicitação #${atendimentoId}:`, e)
  }
}
