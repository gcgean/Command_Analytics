import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { obterConfigIA } from '../ia/config'
import { ProvedorDeepSeek } from '../ia/deepseek'

/**
 * Porta de entrada da IA para sistemas externos — hoje o ERP Delphi, que precisa explicar
 * relatórios para o cliente final.
 *
 * Por que não deixar o Delphi chamar a IA direto: a chave do provedor iria dentro do executável
 * instalado na máquina do cliente, e um .exe distribuído é a pior lugar possível para um segredo.
 * Aqui a chave fica no servidor, o uso é registrado e trocar de provedor não exige atualizar o
 * ERP em cliente nenhum.
 *
 * Diferente de /assistente/conversar: aquele roda com as ferramentas e as permissões de um
 * usuário logado do Analytics e consulta o nosso banco. Este é sem estado — recebe os dados do
 * relatório prontos e só explica, sem acesso a dado nenhum nosso.
 */

const LIMITE_PADRAO_DIA = 500
const MAX_CARACTERES_DADOS = 60_000

export async function initIaExterna(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_cliente_externo (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      -- Só o hash da chave fica guardado: nem o banco nem a tela voltam a ver o valor original.
      chave_hash    CHAR(64) NOT NULL,
      -- Últimos caracteres, só para a pessoa reconhecer qual chave é qual na lista.
      chave_final   VARCHAR(8) NOT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      limite_dia    INT NOT NULL DEFAULT ${LIMITE_PADRAO_DIA},
      ultimo_uso    DATETIME NULL,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_ia_cliente_chave (chave_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_cliente_uso (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id  INT NOT NULL,
      dia         DATE NOT NULL,
      chamadas    INT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_ia_uso (cliente_id, dia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const hash = (chave: string) => crypto.createHash('sha256').update(chave).digest('hex')

/** Identifica o sistema externo pela chave e já contabiliza a chamada do dia. */
async function autorizar(chave: string | undefined): Promise<
  { ok: true; id: number; nome: string } | { ok: false; status: number; erro: string }
> {
  if (!chave) return { ok: false, status: 401, erro: 'Informe a chave em X-API-Key.' }

  const [c] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, ativo, limite_dia FROM ia_cliente_externo WHERE chave_hash = ?`, hash(chave))
  if (!c) return { ok: false, status: 401, erro: 'Chave inválida.' }
  if (!c.ativo) return { ok: false, status: 403, erro: 'Chave desativada.' }

  const hoje = new Date().toISOString().slice(0, 10)
  const [uso] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT chamadas FROM ia_cliente_uso WHERE cliente_id = ? AND dia = ?`, Number(c.id), hoje)
  if (Number(uso?.chamadas ?? 0) >= Number(c.limite_dia)) {
    return { ok: false, status: 429, erro: 'Limite diário desta chave atingido.' }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ia_cliente_uso (cliente_id, dia, chamadas) VALUES (?,?,1)
     ON DUPLICATE KEY UPDATE chamadas = chamadas + 1`, Number(c.id), hoje)
  await prisma.$executeRawUnsafe(
    `UPDATE ia_cliente_externo SET ultimo_uso = NOW() WHERE id = ?`, Number(c.id))

  return { ok: true, id: Number(c.id), nome: String(c.nome) }
}

export async function iaExternaRoutes(app: FastifyInstance) {
  /**
   * POST /api/ia-externa/explicar
   * Header: X-API-Key
   * Body: { relatorio, periodo?, dados, pergunta?, publico? }
   *
   * `dados` é o conteúdo do relatório já pronto — JSON, CSV ou texto. Nada é buscado no nosso
   * banco: o que o ERP não mandar, a IA não sabe.
   */
  app.post('/explicar', { schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const auth = await autorizar(request.headers['x-api-key'] as string | undefined)
    if (!auth.ok) return reply.status(auth.status).send({ error: auth.erro })

    const config = await obterConfigIA()
    if (!config.ativo || !config.apiKey) {
      return reply.status(503).send({ error: 'Assistente de IA não configurado no Command Analytics.' })
    }

    const b = request.body as {
      relatorio?: string; periodo?: string; dados?: unknown
      pergunta?: string; publico?: string
    }
    const relatorio = String(b.relatorio ?? '').trim()
    if (!relatorio) return reply.status(400).send({ error: 'Informe o nome do relatório em "relatorio".' })
    if (b.dados === undefined || b.dados === null || b.dados === '') {
      return reply.status(400).send({ error: 'Informe os dados do relatório em "dados".' })
    }

    const dados = typeof b.dados === 'string' ? b.dados : JSON.stringify(b.dados, null, 1)
    if (dados.length > MAX_CARACTERES_DADOS) {
      return reply.status(413).send({
        error: `Os dados excedem ${MAX_CARACTERES_DADOS} caracteres. Envie o relatório já resumido ou em partes.`,
      })
    }

    // O público muda o vocabulário: o dono da loja não quer ouvir "CMV" nem "ticket médio".
    const publico = b.publico === 'tecnico' ? 'tecnico' : 'cliente'
    const instrucao = publico === 'tecnico'
      ? 'Você fala com um usuário técnico do sistema. Pode usar termos de gestão e contabilidade.'
      : 'Você fala com o dono de um comércio, que não é contador nem analista. Use linguagem '
        + 'simples e direta, explique qualquer termo técnico que precisar usar.'

    const sistema = [
      'Você explica relatórios de um sistema de gestão comercial brasileiro.',
      instrucao,
      'Responda em português do Brasil. Valores em reais no formato R$ 1.234,56.',
      'Baseie-se EXCLUSIVAMENTE nos dados recebidos. Se a resposta não estiver neles, diga que o',
      'relatório não tem essa informação — nunca estime, complete ou invente número.',
      'Seja direto: comece pela conclusão e depois justifique com os números que a sustentam.',
      'Aponte o que chama atenção (quedas, picos, concentração) só quando os dados mostrarem.',
    ].join(' ')

    const usuario = [
      `Relatório: ${relatorio}`,
      b.periodo ? `Período: ${b.periodo}` : null,
      '',
      'Dados:',
      dados,
      '',
      b.pergunta?.trim()
        ? `Pergunta do usuário: ${b.pergunta.trim()}`
        : 'Explique este relatório em até 5 parágrafos curtos, destacando o que é mais relevante.',
    ].filter((l) => l !== null).join('\n')

    try {
      const provedor = new ProvedorDeepSeek(config.apiKey, config.modelo)
      // Sem ferramentas: este canal não consulta o banco do Analytics, só interpreta o que veio.
      const resposta = await provedor.conversar(
        [{ papel: 'system', conteudo: sistema }, { papel: 'user', conteudo: usuario }],
        [],
      )
      return { resposta: resposta.texto, modelo: config.modelo, cliente: auth.nome }
    } catch (e: any) {
      request.log.error({ err: e, cliente: auth.nome }, 'Falha na IA externa')
      return reply.status(502).send({ error: 'Falha ao consultar a IA. Tente novamente.' })
    }
  })

  /** Teste de vida para o ERP conferir chave e disponibilidade sem gastar uma chamada de IA. */
  app.get('/status', { schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const chave = request.headers['x-api-key'] as string | undefined
    if (!chave) return reply.status(401).send({ error: 'Informe a chave em X-API-Key.' })
    const [c] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT nome, ativo, limite_dia FROM ia_cliente_externo WHERE chave_hash = ?`, hash(chave))
    if (!c) return reply.status(401).send({ error: 'Chave inválida.' })
    const config = await obterConfigIA()
    const hoje = new Date().toISOString().slice(0, 10)
    const [uso] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.chamadas FROM ia_cliente_uso u
         INNER JOIN ia_cliente_externo e ON e.id = u.cliente_id
        WHERE e.chave_hash = ? AND u.dia = ?`, hash(chave), hoje)
    return {
      cliente: c.nome,
      ativo: !!c.ativo,
      iaDisponivel: config.ativo && !!config.apiKey,
      usoHoje: Number(uso?.chamadas ?? 0),
      limiteDia: Number(c.limite_dia),
    }
  })

  // ── Administração das chaves (usuário logado no Analytics) ──
  app.get('/chaves', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT e.id, e.nome, e.chave_final, e.ativo, e.limite_dia, e.ultimo_uso, e.criado_em,
             COALESCE((SELECT u.chamadas FROM ia_cliente_uso u
                        WHERE u.cliente_id = e.id AND u.dia = CURDATE()), 0) AS uso_hoje
        FROM ia_cliente_externo e ORDER BY e.ativo DESC, e.nome`)
    return linhas.map((l) => ({
      id: Number(l.id),
      nome: l.nome,
      chaveFinal: l.chave_final,
      ativo: !!l.ativo,
      limiteDia: Number(l.limite_dia),
      usoHoje: Number(l.uso_hoje ?? 0),
      ultimoUso: l.ultimo_uso ?? null,
      criadoEm: l.criado_em,
    }))
  })

  app.post('/chaves', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const b = request.body as { nome?: string; limiteDia?: number }
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do sistema.' })

    const chave = `ca_${crypto.randomBytes(24).toString('hex')}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO ia_cliente_externo (nome, chave_hash, chave_final, limite_dia) VALUES (?,?,?,?)`,
      nome, hash(chave), chave.slice(-6), Number(b.limiteDia) || LIMITE_PADRAO_DIA,
    )
    // Única vez que a chave existe em texto: guardamos só o hash.
    return reply.status(201).send({ chave, aviso: 'Copie agora: esta chave não será exibida de novo.' })
  })

  app.put('/chaves/:id', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const b = request.body as { nome?: string; ativo?: boolean; limiteDia?: number }
    await prisma.$executeRawUnsafe(
      `UPDATE ia_cliente_externo SET nome = COALESCE(?, nome), ativo = ?, limite_dia = COALESCE(?, limite_dia)
        WHERE id = ?`,
      String(b.nome ?? '').trim() || null, b.ativo === false ? 0 : 1,
      Number(b.limiteDia) || null, Number(id),
    )
    return { ok: true }
  })

  app.delete('/chaves/:id', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM ia_cliente_externo WHERE id = ?`, Number(id))
    return { ok: true }
  })
}
