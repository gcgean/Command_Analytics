import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { registrarNotificacao } from './notificacoesAgendamento'

const nome = (u: { nomeCompleto?: string | null; nomeUsu?: string | null } | null) =>
  u?.nomeCompleto || u?.nomeUsu || 'alguém'

/**
 * Avisa quem lançou a solicitação, o técnico responsável e o desenvolvedor vinculado sobre o
 * que mudou — exceto quem fez a própria alteração. Dois canais independentes, igual ao padrão
 * de notificacoesAgendamento.ts: sino da plataforma (sempre, pra todo mundo com id de usuário)
 * e Telegram (só quem tem ID_TELEGRAM vinculado — e depende do relay externo estar acessível).
 * Nunca lança: falha de envio só é logada.
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
      (c, i, arr) => c.id !== usuarioAtorId && arr.findIndex((o) => o.id === c.id) === i
    )
    if (!destinatarios.length) return

    const ator = await prisma.usuario.findUnique({
      where: { id: usuarioAtorId },
      select: { nomeCompleto: true, nomeUsu: true },
    })
    const titulo = `Solicitação #${atendimentoId} atualizada`
    const mensagemPlataforma = `${descricao}\n\nAlterado por: ${nome(ator)}`
    const mensagemTelegram = `🔔 Solicitação #${atendimentoId}\n${descricao}\n\nAlterado por: ${nome(ator)}`

    for (const destinatario of destinatarios) {
      // Sino da plataforma: sempre grava, não depende de Telegram estar linkado nem do relay externo.
      try {
        await registrarNotificacao({
          usuarioId: destinatario.id,
          canal: 'plataforma',
          tipo: 'solicitacao_atualizacao',
          chaveEvento: `solicitacao_atualizacao:plataforma:usuario-${destinatario.id}:atendimento-${atendimentoId}:${Date.now()}`,
          titulo,
          mensagem: mensagemPlataforma,
        })
      } catch (e) {
        console.warn(`⚠ Falha ao gravar notificação de plataforma pro usuário ${destinatario.id} (solicitação #${atendimentoId}):`, e)
      }

      if (!destinatario.idTelegram) continue
      const envio = await TelegramService.enviar({ userId: destinatario.idTelegram, mensagem: mensagemTelegram })
      if (!envio.success) {
        console.warn(`⚠ Falha ao notificar usuário ${destinatario.id} no Telegram sobre solicitação #${atendimentoId}:`, envio.error)
      }
    }
  } catch (e) {
    console.warn(`⚠ Erro ao notificar atualização da solicitação #${atendimentoId}:`, e)
  }
}
