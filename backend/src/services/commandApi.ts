// Acesso à API do Command System (relay de Telegram e servidor de arquivos usados pelo ERP/Delphi).
export const COMMAND_API_BASE_URL = 'http://apicommandsystem.com.br:2450'

const AUTH_USER = 'cmdcrm%$#@!'
const AUTH_PASS = 'cmdcrm%$#@!'

export function commandApiAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
}

const FILES_STREAM_URL = `${COMMAND_API_BASE_URL}/commandapi/files/stream`

/**
 * Envia um arquivo ao servidor de arquivos do Command (mesmo endpoint usado pelo Delphi).
 * `destino` é o caminho lógico desejado (ex.: /CommandAnalytics/Campanhas/banner.jpg); o servidor
 * renomeia o arquivo e devolve o caminho final, que é o valor a ser gravado no banco.
 */
export async function enviarArquivoCommand(destino: string, conteudo: Buffer): Promise<string> {
  const response = await fetch(FILES_STREAM_URL, {
    method: 'POST',
    headers: {
      Authorization: commandApiAuthHeader(),
      'Content-Type': 'application/octet-stream',
      'X-Filename': destino,
    },
    body: new Uint8Array(conteudo),
  })

  const texto = await response.text()
  if (!response.ok) {
    throw new Error(`Servidor de arquivos respondeu HTTP ${response.status}: ${texto.slice(0, 200)}`)
  }

  let caminho = ''
  try {
    caminho = String(JSON.parse(texto)?.caminho ?? '').trim()
  } catch {
    // resposta não-JSON tratada abaixo
  }
  if (!caminho) throw new Error('Servidor de arquivos não retornou o caminho do arquivo enviado.')
  return caminho
}

/** Baixa um arquivo do servidor de arquivos do Command pelo caminho gravado no banco. */
export async function baixarArquivoCommand(caminho: string): Promise<Buffer> {
  const response = await fetch(FILES_STREAM_URL, {
    headers: {
      Authorization: commandApiAuthHeader(),
      'X-Filename': caminho,
    },
  })
  if (!response.ok) {
    throw new Error(`Servidor de arquivos respondeu HTTP ${response.status}.`)
  }
  return Buffer.from(await response.arrayBuffer())
}
