import nodemailer from 'nodemailer'
import { prisma } from '../database/client'

export interface ConfigEmail {
  ativo: boolean
  host: string
  porta: number
  seguro: boolean
  usuario: string
  senha: string
  remetenteNome: string
  remetenteEmail: string
}

let ensurePromise: Promise<void> | null = null

export function ensureConfiguracaoEmail(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS configuracao_email (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          ativo           TINYINT(1) NOT NULL DEFAULT 0,
          host            VARCHAR(150) NULL,
          porta           INT NOT NULL DEFAULT 587,
          seguro          TINYINT(1) NOT NULL DEFAULT 0,
          usuario         VARCHAR(150) NULL,
          senha           VARCHAR(255) NULL,
          remetente_nome  VARCHAR(100) NULL,
          remetente_email VARCHAR(150) NULL,
          data_criacao    DATETIME NOT NULL DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    })()
  }
  return ensurePromise
}

export async function obterConfigEmail(): Promise<ConfigEmail | null> {
  await ensureConfiguracaoEmail()
  const rows = await prisma.$queryRaw<Array<Record<string, any>>>`
    SELECT ativo, host, porta, seguro, usuario, senha, remetente_nome, remetente_email
      FROM configuracao_email ORDER BY id LIMIT 1
  `
  const c = rows[0]
  if (!c) return null
  return {
    ativo: Number(c.ativo) === 1,
    host: String(c.host ?? ''),
    porta: Number(c.porta ?? 587),
    seguro: Number(c.seguro) === 1,
    usuario: String(c.usuario ?? ''),
    senha: String(c.senha ?? ''),
    remetenteNome: String(c.remetente_nome ?? ''),
    remetenteEmail: String(c.remetente_email ?? ''),
  }
}

/** Senha vazia mantém a que já está gravada — a tela nunca recebe a senha de volta pra reenviar. */
export async function salvarConfigEmail(dados: Partial<ConfigEmail>): Promise<void> {
  await ensureConfiguracaoEmail()
  const atual = await obterConfigEmail()
  const c: ConfigEmail = {
    ativo: dados.ativo ?? atual?.ativo ?? false,
    host: (dados.host ?? atual?.host ?? '').trim(),
    porta: Number(dados.porta ?? atual?.porta ?? 587),
    seguro: dados.seguro ?? atual?.seguro ?? false,
    usuario: (dados.usuario ?? atual?.usuario ?? '').trim(),
    senha: dados.senha?.trim() ? dados.senha.trim() : atual?.senha ?? '',
    remetenteNome: (dados.remetenteNome ?? atual?.remetenteNome ?? '').trim(),
    remetenteEmail: (dados.remetenteEmail ?? atual?.remetenteEmail ?? '').trim(),
  }
  const valores = [
    c.ativo ? 1 : 0, c.host, c.porta, c.seguro ? 1 : 0, c.usuario, c.senha, c.remetenteNome, c.remetenteEmail,
  ]
  if (atual) {
    await prisma.$executeRawUnsafe(
      `UPDATE configuracao_email SET ativo=?, host=?, porta=?, seguro=?, usuario=?, senha=?, remetente_nome=?, remetente_email=?
        ORDER BY id LIMIT 1`,
      ...valores,
    )
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO configuracao_email (ativo, host, porta, seguro, usuario, senha, remetente_nome, remetente_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ...valores,
    )
  }
}

export interface ResultadoEnvio {
  success: boolean
  error?: string
}

/**
 * Envio único de e-mail. Nunca lança: quem chama está no meio de gravar uma solicitação ou de
 * notificar alguém, e um SMTP fora do ar não pode derrubar a operação principal.
 */
export async function enviarEmail(opcoes: {
  para: string
  assunto: string
  html: string
  texto?: string
}): Promise<ResultadoEnvio> {
  try {
    const config = await obterConfigEmail()
    if (!config || !config.ativo) return { success: false, error: 'Envio de e-mail desativado nas configurações.' }
    if (!config.host || !config.remetenteEmail) {
      return { success: false, error: 'Configuração de e-mail incompleta (host e e-mail do remetente são obrigatórios).' }
    }

    const transporte = nodemailer.createTransport({
      host: config.host,
      port: config.porta,
      // 465 é SSL direto; 587 começa em texto e sobe pra TLS com STARTTLS.
      secure: config.seguro || config.porta === 465,
      ...(config.usuario ? { auth: { user: config.usuario, pass: config.senha } } : {}),
    })

    await transporte.sendMail({
      from: config.remetenteNome ? `"${config.remetenteNome}" <${config.remetenteEmail}>` : config.remetenteEmail,
      to: opcoes.para,
      subject: opcoes.assunto,
      text: opcoes.texto ?? opcoes.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html: opcoes.html,
    })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao enviar o e-mail.' }
  }
}

/** Moldura comum das mensagens ao cliente — sem imagem externa, pra não cair em spam. */
export function montarHtmlEmail(titulo: string, corpoHtml: string, rodape?: string): string {
  return `
<div style="font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#1e293b;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:600">${titulo}</div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6">${corpoHtml}</div>
    <div style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
      ${rodape ?? 'Esta é uma mensagem automática — não é necessário responder.'}
    </div>
  </div>
</div>`.trim()
}
