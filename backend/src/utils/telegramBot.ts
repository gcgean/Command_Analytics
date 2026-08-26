import { prisma } from '../database/client'

// Envia mensagens de confirmação direto pela API do Telegram (mesmo bot/token usado pro
// polling), sem depender do relay externo (apicommandsystem.com.br) usado pelo TelegramService
// pra notificações — aqui é uma resposta imediata dentro da própria conversa de vínculo.
async function obterTokenBot(): Promise<string | null> {
  const config = await prisma.configuracaoTelegram.findFirst()
  return config?.tokenApi || null
}

let usernameBotCache: { valor: string; expiraEm: number } | null = null
async function obterUsernameBot(): Promise<string | null> {
  if (usernameBotCache && usernameBotCache.expiraEm > Date.now()) return usernameBotCache.valor
  const token = await obterTokenBot()
  if (!token) return null
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await resp.json()
    const username = data?.result?.username as string | undefined
    if (username) {
      usernameBotCache = { valor: username, expiraEm: Date.now() + 60 * 60 * 1000 }
      return username
    }
  } catch { /* ignora — cai no retorno null abaixo */ }
  return null
}

// Códigos de vínculo são efêmeros (10 min), guardados só em memória — não precisam sobreviver
// a um restart do processo, e evita criar tabela nova só pra isso.
interface CodigoPendente { usuarioId: number; expiraEm: number }
const codigosPendentes = new Map<string, CodigoPendente>()
const CODIGO_TTL_MS = 10 * 60 * 1000

function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function gerarCodigoVinculo(usuarioId: number): Promise<{ codigo: string; botUsername: string | null; expiraEm: number }> {
  // Invalida qualquer código anterior ainda pendente pra esse mesmo usuário.
  for (const [codigo, dado] of codigosPendentes) {
    if (dado.usuarioId === usuarioId) codigosPendentes.delete(codigo)
  }
  let codigo = gerarCodigo()
  while (codigosPendentes.has(codigo)) codigo = gerarCodigo()

  const expiraEm = Date.now() + CODIGO_TTL_MS
  codigosPendentes.set(codigo, { usuarioId, expiraEm })
  const botUsername = await obterUsernameBot()
  return { codigo, botUsername, expiraEm }
}

async function enviarMensagemDireta(chatId: string, texto: string): Promise<void> {
  const token = await obterTokenBot()
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    })
  } catch { /* melhor esforço — não é crítico se a confirmação falhar */ }
}

let offsetAtualizacoes = 0
let processandoPoll = false

async function processarAtualizacao(update: any): Promise<void> {
  const mensagem = update?.message
  const texto = String(mensagem?.text ?? '').trim()
  const chatId = mensagem?.chat?.id
  if (!texto || chatId === undefined || chatId === null) return

  // Só reage a mensagens que são exatamente um código de 6 dígitos — qualquer outra coisa
  // enviada ao bot é ignorada silenciosamente, sem responder nada.
  if (!/^\d{6}$/.test(texto)) return

  const pendente = codigosPendentes.get(texto)
  if (!pendente || pendente.expiraEm < Date.now()) {
    codigosPendentes.delete(texto)
    return
  }

  codigosPendentes.delete(texto)
  const usuario = await prisma.usuario.update({
    where: { id: pendente.usuarioId },
    data: { idTelegram: String(chatId) },
  }).catch(() => null)

  if (usuario) {
    const nome = usuario.nomeCompleto || usuario.nomeUsu || 'usuário'
    await enviarMensagemDireta(String(chatId), `✅ Telegram vinculado com sucesso à conta de ${nome} no Command Analytics!`)
  }
}

async function pollUpdates(): Promise<void> {
  const token = await obterTokenBot()
  if (!token) return

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offsetAtualizacoes}&timeout=0&allowed_updates=["message"]`
    )
    const data = await resp.json()
    if (!data?.ok || !Array.isArray(data.result)) return

    for (const update of data.result) {
      offsetAtualizacoes = Math.max(offsetAtualizacoes, Number(update.update_id) + 1)
      await processarAtualizacao(update)
    }
  } catch (e: any) {
    console.warn('⚠ Telegram polling:', e?.message)
  }
}

const POLL_INTERVAL_MS = 3000
let schedulerHandle: ReturnType<typeof setInterval> | null = null

export function startTelegramPollingScheduler(): void {
  if (schedulerHandle) return
  const executar = () => {
    if (processandoPoll) return
    processandoPoll = true
    pollUpdates().finally(() => { processandoPoll = false })
  }
  schedulerHandle = setInterval(executar, POLL_INTERVAL_MS)
  setTimeout(executar, 5_000)
}
