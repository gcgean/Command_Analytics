
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface TelegramSendOptions {
  userId: string
  mensagem: string
  anexos?: File[] | Blob[] | { buffer: Buffer; filename: string; contentType: string }[]
}

export class TelegramService {
  private static readonly BASE_URL = 'http://apicommandsystem.com.br:2450'
  private static readonly AUTH_USER = 'cmdcrm%$#@!'
  private static readonly AUTH_PASS = 'cmdcrm%$#@!'

  /**
   * Envia uma mensagem via Telegram usando a API do Command System.
   */
  static async enviar(options: TelegramSendOptions): Promise<{ success: boolean; error?: string }> {
    try {
      const formData = new FormData()
      formData.append('userId', options.userId)
      formData.append('mensagem', options.mensagem)

      if (options.anexos && options.anexos.length > 0) {
        for (let i = 0; i < options.anexos.length; i++) {
          const anexo = options.anexos[i]
          
          if ('buffer' in anexo) {
            // Se for um buffer (comum no backend)
            const bytes = Uint8Array.from(anexo.buffer)

            const blob = new Blob([bytes], {
              type: anexo.contentType || 'application/octet-stream',
            })
            formData.append(`anexo${i}`, blob, anexo.filename)
          } else {
            // Se for um File ou Blob (comum no frontend ou via streams)
            formData.append(`anexo${i}`, anexo)
          }
        }
      }

      const authHeader = 'Basic ' + Buffer.from(`${this.AUTH_USER}:${this.AUTH_PASS}`).toString('base64')

      const response = await fetch(`${this.BASE_URL}/commandapi/telegram/mensagens`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader
        },
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { 
          success: false, 
          error: errorData.errorMessage || `Erro HTTP: ${response.status} ${response.statusText}` 
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error('Erro ao enviar mensagem via Telegram:', error)
      return { success: false, error: error.message || 'Erro interno ao processar envio' }
    }
  }
}
