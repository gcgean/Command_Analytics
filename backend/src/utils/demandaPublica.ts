import { prisma } from '../database/client'
import { enviarEmail, montarHtmlEmail } from './email'

/**
 * Quem pediu, por fora do sistema. O solicitante não é usuário do Analytics e o cliente pode nem
 * estar cadastrado, então nome/e-mail/WhatsApp ficam aqui — em `atendimentos` não há coluna pra
 * isso, e inventar uma na tabela do Delphi seria pior.
 */
export async function initDemandaPublica(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS solicitacao_publica (
      atendimento_id INT PRIMARY KEY,
      nome           VARCHAR(100) NULL,
      email          VARCHAR(150) NOT NULL,
      whatsapp       VARCHAR(30) NULL,
      documento      VARCHAR(20) NULL,
      cliente_id     INT NULL,
      avisar         TINYINT(1) NOT NULL DEFAULT 1,
      criado_em      DATETIME NOT NULL DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // Quem recebe no Telegram o aviso de demanda nova vinda do link público.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS usuario_alerta_demanda (
      usuario_id    INT PRIMARY KEY,
      nova_demanda  TINYINT(1) NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export interface Solicitante {
  nome: string | null
  email: string
  whatsapp: string | null
  avisar: boolean
}

export async function registrarSolicitante(
  atendimentoId: number,
  dados: { nome: string | null; email: string; whatsapp: string | null; documento: string | null; clienteId: number | null },
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO solicitacao_publica (atendimento_id, nome, email, whatsapp, documento, cliente_id)
    VALUES (${atendimentoId}, ${dados.nome}, ${dados.email}, ${dados.whatsapp}, ${dados.documento}, ${dados.clienteId})
    ON DUPLICATE KEY UPDATE nome = VALUES(nome), email = VALUES(email), whatsapp = VALUES(whatsapp)
  `
}

export async function obterSolicitante(atendimentoId: number): Promise<Solicitante | null> {
  const rows = await prisma.$queryRaw<Array<{ nome: string | null; email: string; whatsapp: string | null; avisar: number }>>`
    SELECT nome, email, whatsapp, avisar FROM solicitacao_publica WHERE atendimento_id = ${atendimentoId}
  `
  const r = rows[0]
  if (!r) return null
  return { nome: r.nome, email: r.email, whatsapp: r.whatsapp, avisar: Number(r.avisar) === 1 }
}

/** Depois de concluída ou negada, para de avisar — foi o que prometemos ao cliente no envio. */
export async function encerrarAvisos(atendimentoId: number): Promise<void> {
  await prisma.$executeRaw`UPDATE solicitacao_publica SET avisar = 0 WHERE atendimento_id = ${atendimentoId}`
}

export async function preferenciaDemanda(usuarioId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ nova_demanda: number }>>`
    SELECT nova_demanda FROM usuario_alerta_demanda WHERE usuario_id = ${usuarioId}
  `
  return Number(rows[0]?.nova_demanda ?? 0) === 1
}

export async function salvarPreferenciaDemanda(usuarioId: number, receber: boolean): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO usuario_alerta_demanda (usuario_id, nova_demanda) VALUES (${usuarioId}, ${receber ? 1 : 0})
    ON DUPLICATE KEY UPDATE nova_demanda = VALUES(nova_demanda)
  `
}

/** Usuários ativos que pediram pra receber o aviso e têm Telegram vinculado. */
export async function destinatariosNovaDemanda(): Promise<Array<{ id: number; idTelegram: string }>> {
  return prisma.$queryRawUnsafe(
    `SELECT u.COD_USU AS id, u.ID_TELEGRAM AS idTelegram
       FROM usuario_alerta_demanda p
       JOIN usuario u ON u.COD_USU = p.usuario_id
      WHERE p.nova_demanda = 1 AND COALESCE(u.ATIVO, 'S') = 'S' AND COALESCE(u.ID_TELEGRAM, '') <> ''`,
  )
}

/**
 * Avisa o solicitante por e-mail. Chamado no envio e a cada atualização da solicitação, até ela
 * ser concluída ou negada — foi o combinado mostrado a ele na tela de confirmação.
 */
export async function avisarSolicitante(
  atendimentoId: number,
  assunto: string,
  titulo: string,
  corpoHtml: string,
  opcoes?: { mesmoSemAvisar?: boolean },
): Promise<void> {
  const solicitante = await obterSolicitante(atendimentoId)
  if (!solicitante) return
  if (!solicitante.avisar && !opcoes?.mesmoSemAvisar) return

  const envio = await enviarEmail({
    para: solicitante.email,
    assunto,
    html: montarHtmlEmail(
      titulo,
      `${solicitante.nome ? `<p>Olá, ${escapar(solicitante.nome)}!</p>` : ''}${corpoHtml}
       <p style="margin-top:20px;color:#64748b">Protocolo da sua solicitação: <strong>#${atendimentoId}</strong></p>`,
    ),
  })
  if (!envio.success) console.warn(`⚠ E-mail da solicitação #${atendimentoId} não enviado:`, envio.error)
}

/** O texto vem do cliente e vai dentro de um HTML — sem isso, um "<" da descrição quebra o e-mail. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STATUS_CONCLUIDO = 7
const STATUS_CANCELADO = 8
const STATUS_ARQUIVADO = 14

/**
 * Traduz a mudança interna para o cliente que enviou a demanda. O texto interno (etapas como
 * "Testado OK", nomes de dev) não significa nada pra ele — o que importa é: recebemos, está
 * andando, ficou pronta ou foi recusada.
 */
export async function avisarSolicitanteDaMudanca(atendimentoId: number, descricaoInterna: string): Promise<void> {
  const solicitante = await obterSolicitante(atendimentoId)
  if (!solicitante || !solicitante.avisar) return

  const atendimento = await prisma.atendimento.findUnique({
    where: { id: atendimentoId },
    select: { status: true, solucao: true, motivoCancelamento: true },
  })
  if (!atendimento) return
  const status = Number(atendimento.status)

  if (status === STATUS_CONCLUIDO) {
    await avisarSolicitante(
      atendimentoId,
      `Sua solicitação #${atendimentoId} foi concluída`,
      'Solicitação concluída',
      `<p>Sua solicitação foi <strong>concluída</strong> pela nossa equipe.</p>` +
        (atendimento.solucao?.trim()
          ? `<p><strong>O que foi feito:</strong></p><blockquote style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #cbd5e1;white-space:pre-wrap">${escapar(atendimento.solucao.trim())}</blockquote>`
          : '') +
        `<p>Este é o último aviso automático sobre ela. Qualquer dúvida, fale com o suporte.</p>`,
    )
    await encerrarAvisos(atendimentoId)
    return
  }

  if (status === STATUS_CANCELADO || status === STATUS_ARQUIVADO) {
    const recusada = status === STATUS_CANCELADO
    await avisarSolicitante(
      atendimentoId,
      `Sua solicitação #${atendimentoId} não seguirá adiante`,
      recusada ? 'Solicitação recusada' : 'Solicitação arquivada',
      (recusada
        ? `<p>Sua solicitação foi <strong>recusada</strong> pela nossa equipe.</p>`
        : `<p>Sua solicitação foi <strong>arquivada</strong> e não está prevista para desenvolvimento no momento.</p>`) +
        (atendimento.motivoCancelamento?.trim()
          ? `<p><strong>Motivo:</strong></p><blockquote style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #cbd5e1;white-space:pre-wrap">${escapar(atendimento.motivoCancelamento.trim())}</blockquote>`
          : '') +
        `<p>Este é o último aviso automático sobre ela. Qualquer dúvida, fale com o suporte.</p>`,
    )
    await encerrarAvisos(atendimentoId)
    return
  }

  await avisarSolicitante(
    atendimentoId,
    `Atualização da sua solicitação #${atendimentoId}`,
    'Sua solicitação foi atualizada',
    `<p>Houve uma movimentação na solicitação que você enviou:</p>
     <blockquote style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #cbd5e1;white-space:pre-wrap">${escapar(descricaoInterna)}</blockquote>
     <p>Você continuará recebendo estes avisos até ela ser concluída ou recusada.</p>`,
  )
}
