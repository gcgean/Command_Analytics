import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { pipeline } from 'node:stream/promises'
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { registrarAuditoria } from '../utils/auditoria'
import {
  registrarSolicitante,
  tokenValido,
  destinatariosNovaDemanda,
  avisarSolicitante,
  escapar,
} from '../utils/demandaPublica'

// Status 4 (Aguardando Análise Dev) é a fila de triagem: demanda de cliente entra sem projeto e
// sem desenvolvedor, e alguém decide o que fazer com ela.
const STATUS_TRIAGEM = 4
// Mesmo usuário que o formulário externo antigo já usa como lançador.
const USUARIO_FORMULARIO = 1

// Limites menores que os internos: é uma porta aberta na internet, e 5 arquivos de 25MB já cobrem
// print, vídeo curto de tela e PDF, que é o que o cliente costuma mandar.
const MAX_ANEXOS_PUBLICO = 5
const MAX_TAMANHO_PUBLICO = 25 * 1024 * 1024
const MIME_PUBLICO = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm',
])

const soDigitos = (v: string) => String(v ?? '').replace(/\D/g, '')

/**
 * Rota pública, sem login: qualquer um na internet pode chamar. Por isso o limite por IP — sem
 * ele, o endereço de consulta de CNPJ viraria uma forma de varrer a base de clientes, e o de
 * envio, uma forma de encher o Mapa de Solicitações.
 */
const janelas = new Map<string, { inicio: number; qtd: number }>()
function excedeuLimite(ip: string, chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now()
  const id = `${chave}:${ip}`
  const atual = janelas.get(id)
  if (!atual || agora - atual.inicio > janelaMs) {
    janelas.set(id, { inicio: agora, qtd: 1 })
    return false
  }
  atual.qtd += 1
  return atual.qtd > maximo
}

export async function publicoRoutes(app: FastifyInstance) {
  // GET /publico/cliente?documento= — diz apenas se o CNPJ/CPF já é cliente, e o nome
  app.get('/cliente', { schema: { tags: ['Público'], summary: 'Procura o cliente pelo CNPJ/CPF' } }, async (request, reply) => {
    const { documento } = request.query as { documento?: string }
    const digitos = soDigitos(documento ?? '')
    if (digitos.length !== 11 && digitos.length !== 14) {
      return reply.status(400).send({ error: 'Informe um CNPJ ou CPF completo.' })
    }
    if (excedeuLimite(request.ip, 'consulta', 30, 10 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Muitas consultas seguidas. Aguarde alguns minutos.' })
    }

    const achados = await prisma.$queryRawUnsafe<Array<{ cod_cli: number; nome: string | null }>>(
      `SELECT cod_cli, COALESCE(NOME_FANTASIA, NOME_CLI) AS nome FROM cliente
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
        ORDER BY CASE WHEN COALESCE(ATIVO,'S') = 'S' THEN 0 ELSE 1 END, cod_cli LIMIT 1`,
      digitos,
    )
    const cliente = achados[0]
    // Só o nome: é o suficiente pra pessoa confirmar que é a empresa dela, e nada além disso
    // precisa sair pra fora do sistema.
    return cliente ? { encontrado: true, nome: cliente.nome ?? '' } : { encontrado: false, nome: '' }
  })

  // POST /publico/solicitacoes — o cliente manda a demanda pelo link público
  app.post('/solicitacoes', { schema: { tags: ['Público'], summary: 'Recebe a demanda enviada pelo cliente' } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim().slice(0, 100)
    const email = String(b.email ?? '').trim().slice(0, 150)
    const whatsapp = String(b.whatsapp ?? '').trim().slice(0, 30)
    const documento = soDigitos(b.documento ?? '')
    const descricao = String(b.descricao ?? '').trim()

    if (!nome) return reply.status(400).send({ error: 'Informe seu nome.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply.status(400).send({ error: 'Informe um e-mail válido.' })
    if (whatsapp && soDigitos(whatsapp).length < 10) return reply.status(400).send({ error: 'Informe um WhatsApp válido com DDD.' })
    if (documento.length !== 11 && documento.length !== 14) return reply.status(400).send({ error: 'Informe um CNPJ ou CPF válido.' })
    if (descricao.length < 15) return reply.status(400).send({ error: 'Descreva a demanda com um pouco mais de detalhe.' })

    if (excedeuLimite(request.ip, 'envio', 5, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Muitos envios seguidos deste mesmo acesso. Tente novamente mais tarde.' })
    }

    const achados = await prisma.$queryRawUnsafe<Array<{ cod_cli: number; nome: string | null }>>(
      `SELECT cod_cli, COALESCE(NOME_FANTASIA, NOME_CLI) AS nome FROM cliente
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
        ORDER BY CASE WHEN COALESCE(ATIVO,'S') = 'S' THEN 0 ELSE 1 END, cod_cli LIMIT 1`,
      documento,
    )
    const cliente = achados[0] ?? null

    // Cabeçalho no mesmo formato do formulário externo antigo ("DADOS DO SOLICITANTE"), que o
    // resto do sistema já usa pra saber que o lançador é o formulário, e não uma pessoa.
    const documentoFormatado = documento.length === 14
      ? documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
      : documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    const observacoes = [
      'DADOS DO SOLICITANTE:',
      `Nome: ${nome}`,
      `E-mail: ${email}`,
      whatsapp ? `WhatsApp: ${whatsapp}` : '',
      `CNPJ/CPF: ${documentoFormatado}`,
      cliente ? `Cliente: ${cliente.nome ?? ''} (código ${cliente.cod_cli})` : 'Cliente: NÃO IDENTIFICADO — vincular manualmente',
      '',
      'DEMANDA:',
      descricao,
    ].filter(Boolean).join('\n')

    const agora = new Date()
    const criado = await prisma.atendimento.create({
      data: {
        clienteId: cliente?.cod_cli ?? null,
        tipoContato: 0,
        observacoes: observacoes.slice(0, 5000),
        status: STATUS_TRIAGEM,
        dataAbertura: agora,
        dataAtendimento: agora,
        usuarioLancId: USUARIO_FORMULARIO,
        prioritario: '',
        foraHorario: '',
        bugSistema: '',
        prioridade: '',
      },
      select: { id: true },
    })

    await prisma.$executeRaw`
      INSERT INTO log_atendimento (cod_Atendimento, obs_atendimento, data_hora_log, cod_usu)
      VALUES (${criado.id}, ${`Demanda enviada pelo cliente via link público (${nome})`.slice(0, 300)}, NOW(), ${USUARIO_FORMULARIO})
    `
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: criado.id,
      acao: 'CRIACAO',
      usuarioId: null,
      dadosDepois: { origem: 'link público', nome, email, documento: documentoFormatado, clienteId: cliente?.cod_cli ?? null },
    })

    // Token de uso curto devolvido junto: é com ele que a tela envia os anexos logo em seguida.
    const token = randomUUID()
    await registrarSolicitante(criado.id, {
      nome,
      email,
      whatsapp: whatsapp || null,
      documento: documentoFormatado,
      clienteId: cliente?.cod_cli ?? null,
      token,
    })

    // Avisa quem marcou no cadastro que quer saber de demanda nova.
    const aviso =
      `📨 Nova demanda enviada por cliente\n\n` +
      `Solicitação #${criado.id}\n` +
      `Cliente: ${cliente ? cliente.nome ?? `código ${cliente.cod_cli}` : 'NÃO IDENTIFICADO'}\n` +
      `Solicitante: ${nome}${whatsapp ? ` (${whatsapp})` : ''}\n` +
      `E-mail: ${email}\n\n` +
      `${descricao.slice(0, 500)}${descricao.length > 500 ? '…' : ''}`
    for (const d of await destinatariosNovaDemanda()) {
      const envio = await TelegramService.enviar({ userId: String(d.idTelegram), mensagem: aviso })
      if (!envio.success) console.warn(`⚠ Aviso de nova demanda não enviado pro usuário ${d.id}:`, envio.error)
    }

    // Confirmação pro cliente. Se o e-mail não estiver configurado ainda, a demanda já entrou do
    // mesmo jeito — só o aviso deixa de sair, e isso fica registrado no log do servidor.
    void avisarSolicitante(
      criado.id,
      `Recebemos sua solicitação #${criado.id}`,
      'Solicitação recebida',
      `<p>Sua solicitação foi registrada e já está na fila de análise da nossa equipe de desenvolvimento.</p>
       <p><strong>O que você pediu:</strong></p>
       <blockquote style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #cbd5e1;white-space:pre-wrap">${escapar(descricao)}</blockquote>
       <p>Você vai receber um e-mail a cada atualização, até a solicitação ser concluída ou recusada.</p>`,
      { mesmoSemAvisar: true },
    )

    return reply.status(201).send({
      ok: true,
      id: criado.id,
      token,
      clienteEncontrado: !!cliente,
      clienteNome: cliente?.nome ?? null,
    })
  })

  // POST /publico/anexos?id=&token= — arquivos e vídeos do formulário público
  app.post('/anexos', { schema: { tags: ['Público'], summary: 'Anexos da demanda enviada pelo cliente' } }, async (request, reply) => {
    const { id, token } = request.query as { id?: string; token?: string }
    const atendimentoId = Number(id)
    if (!Number.isInteger(atendimentoId) || atendimentoId <= 0) {
      return reply.status(400).send({ error: 'Solicitação inválida.' })
    }
    if (!(await tokenValido(atendimentoId, String(token ?? '')))) {
      return reply.status(403).send({ error: 'Envio de anexos expirado. Fale com o suporte informando o número da solicitação.' })
    }

    // Mesma pasta e mesma tabela dos anexos internos: assim o arquivo aparece direto no card do
    // Mapa de Solicitações, sem uma segunda galeria só pra demanda pública.
    const uploadsDir = path.resolve(process.cwd(), 'uploads', 'atendimentos')
    await fs.mkdir(uploadsDir, { recursive: true })

    let enviados = 0
    try {
      for await (const part of request.parts()) {
        if ((part as any).type !== 'file') continue
        const filePart = part as MultipartFile
        if (enviados >= MAX_ANEXOS_PUBLICO) {
          for await (const _c of filePart.file as any) void _c
          continue
        }

        const mimeType = String((filePart as any).mimetype || '')
        if (!MIME_PUBLICO.has(mimeType)) {
          for await (const _c of filePart.file as any) void _c
          continue
        }

        const originalName = String((filePart as any).filename || 'arquivo')
          .replace(/[^a-zA-Z0-9._\-\s]/g, '').trim().replace(/\s+/g, ' ').slice(0, 180) || 'arquivo'
        const storedName = `${randomUUID()}${path.extname(originalName).slice(0, 10)}`
        const fullPath = path.join(uploadsDir, storedName)
        await pipeline(filePart.file, createWriteStream(fullPath))

        const stat = await fs.stat(fullPath)
        if (stat.size > MAX_TAMANHO_PUBLICO) {
          await fs.unlink(fullPath).catch(() => {})
          continue
        }

        await prisma.$executeRaw`
          INSERT INTO agendamento_anexo (tabela, registro_id, original_name, stored_name, mime_type, size_bytes, created_by, created_at)
          VALUES ('atendimentos', ${atendimentoId}, ${originalName}, ${storedName}, ${mimeType}, ${Number(stat.size)}, ${USUARIO_FORMULARIO}, NOW())
        `
        enviados += 1
      }
    } catch {
      return reply.status(400).send({ error: 'Falha ao enviar os arquivos.' })
    }

    if (enviados === 0) return reply.status(400).send({ error: 'Nenhum arquivo aceito (verifique o tipo e o tamanho).' })
    return { ok: true, enviados }
  })
}
