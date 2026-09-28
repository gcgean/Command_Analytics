import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { registrarAuditoria } from '../utils/auditoria'
import {
  registrarSolicitante,
  destinatariosNovaDemanda,
  avisarSolicitante,
  escapar,
} from '../utils/demandaPublica'

// Status 4 (Aguardando Análise Dev) é a fila de triagem: demanda de cliente entra sem projeto e
// sem desenvolvedor, e alguém decide o que fazer com ela.
const STATUS_TRIAGEM = 4
// Mesmo usuário que o formulário externo antigo já usa como lançador.
const USUARIO_FORMULARIO = 1

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

    await registrarSolicitante(criado.id, {
      nome,
      email,
      whatsapp: whatsapp || null,
      documento: documentoFormatado,
      clienteId: cliente?.cod_cli ?? null,
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
      clienteEncontrado: !!cliente,
      clienteNome: cliente?.nome ?? null,
    })
  })
}
