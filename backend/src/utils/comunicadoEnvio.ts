import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'

/**
 * Disparo de comunicado por Telegram.
 *
 * Vivia dentro da rota, que era o único lugar que enviava. Com o comunicado automático dos
 * campeões do mês passou a existir um segundo emissor, e duplicar o laço de envio significaria
 * duas regras de espaçamento, dois formatos de texto e dois jeitos de registrar quem recebeu.
 *
 * O envio é sequencial e espaçado de propósito: a API do Telegram limita o ritmo e responde
 * 429 quando se dispara tudo de uma vez — e um 429 no meio deixa metade da equipe sem receber,
 * sem ninguém perceber.
 */

const INTERVALO_ENVIO_MS = 120
export const MAX_CARACTERES = 4000 // limite do Telegram é 4096; sobra para o rodapé

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface ResultadoComunicado {
  id: number
  destinatarios: number
  entregues: number
  falhas: number
}

/** Usuários ativos e com Telegram vinculado — quem pode receber qualquer comunicado. */
export async function destinatariosDisponiveis(): Promise<any[]> {
  return prisma.$queryRawUnsafe<any[]>(`
    SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome,
           u.ID_TELEGRAM AS telegram
      FROM usuario u
     WHERE u.ID_TELEGRAM IS NOT NULL AND u.ID_TELEGRAM <> '' AND COALESCE(u.ATIVO,'S') = 'S'`)
}

export function montarTexto(titulo: string | null, mensagem: string): string {
  return titulo ? `📢 *${titulo}*\n\n${mensagem}` : `📢 ${mensagem}`
}

/**
 * Envia e registra. `usuarios` vazio significa todos os vinculados e ativos.
 *
 * Cada destinatário vira uma linha em `comunicado_destinatario`: sem isso não dá para saber
 * quem ficou de fora nem reenviar só a quem falhou.
 */
export async function dispararComunicado(opcoes: {
  titulo?: string | null
  mensagem: string
  usuarios?: number[]
  autor?: number | null
}): Promise<ResultadoComunicado> {
  const mensagem = String(opcoes.mensagem ?? '').trim()
  if (!mensagem) throw new Error('Escreva a mensagem.')
  if (mensagem.length > MAX_CARACTERES) {
    throw new Error(`A mensagem passa de ${MAX_CARACTERES} caracteres.`)
  }

  const escolhidos = (opcoes.usuarios ?? []).map(Number).filter(Boolean)
  const todos = await destinatariosDisponiveis()
  const alvo = escolhidos.length ? todos.filter((u) => escolhidos.includes(Number(u.id))) : todos
  if (alvo.length === 0) throw new Error('Nenhum destinatário com Telegram vinculado.')

  const titulo = String(opcoes.titulo ?? '').trim().slice(0, 160) || null

  await prisma.$executeRawUnsafe(
    `INSERT INTO comunicado (titulo, mensagem, enviado_por, destinatarios) VALUES (?,?,?,?)`,
    titulo, mensagem, opcoes.autor ?? null, alvo.length)
  const [criado] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
  const comunicadoId = Number(criado?.id ?? 0)

  const texto = montarTexto(titulo, mensagem)
  let entregues = 0
  let falhas = 0

  for (const u of alvo) {
    let erro: string | null = null
    try {
      const r = await TelegramService.enviar({ userId: String(u.telegram), mensagem: texto })
      if (r.success) entregues += 1
      else { falhas += 1; erro = r.error ?? 'Falha no envio' }
    } catch (e: any) {
      falhas += 1
      erro = String(e?.message ?? e)
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO comunicado_destinatario (comunicado_id, usuario_id, nome, entregue, erro)
       VALUES (?,?,?,?,?)`,
      comunicadoId, Number(u.id), String(u.nome ?? '').slice(0, 150),
      erro ? 0 : 1, erro?.slice(0, 300) ?? null).catch(() => {})
    await espera(INTERVALO_ENVIO_MS)
  }

  await prisma.$executeRawUnsafe(
    `UPDATE comunicado SET entregues = ?, falhas = ? WHERE id = ?`, entregues, falhas, comunicadoId)

  return { id: comunicadoId, destinatarios: alvo.length, entregues, falhas }
}
