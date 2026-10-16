import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import {
  carregarModelo, perguntasVisiveis, identificarCenario, pendencias, gerarToken,
} from '../utils/triagem'

/** Triagem guiada: questionário por cadastro, atendimento virando processo no Pipeline. */
export async function triagemRoutes(app: FastifyInstance) {
  // ── Modelos ──
  app.get('/modelos', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.*,
              (SELECT COUNT(*) FROM triagem_pergunta p WHERE p.modelo_id = m.id AND p.ativo = 1) AS perguntas,
              (SELECT COUNT(*) FROM triagem_cenario c WHERE c.modelo_id = m.id AND c.ativo = 1) AS cenarios,
              (SELECT COUNT(*) FROM triagem_atendimento a WHERE a.modelo_id = m.id) AS atendimentos
         FROM triagem_modelo m WHERE m.ativo = 1 ORDER BY m.nome`)
    return linhas.map((m) => ({
      id: Number(m.id), nome: m.nome, slug: m.slug, descricao: m.descricao ?? null,
      tipoProcesso: m.tipo_processo, etapaInicial: m.etapa_inicial == null ? null : Number(m.etapa_inicial),
      permiteLink: !!m.permite_link,
      perguntas: Number(m.perguntas ?? 0), cenarios: Number(m.cenarios ?? 0),
      atendimentos: Number(m.atendimentos ?? 0),
    }))
  })

  app.get('/modelos/:slug', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const modelo = await carregarModelo(slug)
    if (!modelo) return reply.status(404).send({ error: 'Modelo de triagem não encontrado.' })
    return modelo
  })

  // ── Atendimentos ──
  app.get('/atendimentos', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request) => {
    const { modelo, situacao, busca } = request.query as Record<string, string>
    const cond: string[] = []
    const val: any[] = []
    if (modelo) { cond.push('m.slug = ?'); val.push(modelo) }
    if (situacao) { cond.push('a.situacao = ?'); val.push(situacao) }
    if (busca) {
      cond.push('(a.cliente_nome LIKE ? OR a.cnpj LIKE ? OR a.contato LIKE ?)')
      const termo = `%${busca}%`
      val.push(termo, termo, termo)
    }
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*, m.nome AS modelo_nome, m.slug AS modelo_slug, c.nome AS cenario_nome,
              c.prioridade, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS atendente
         FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
         LEFT JOIN triagem_cenario c ON c.id = a.cenario_id
         LEFT JOIN usuario u ON u.COD_USU = a.atendente_id
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY a.atualizado_em DESC LIMIT 200`, ...val)
    return linhas.map(formatarAtendimento)
  })

  app.get('/atendimentos/:id', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*, m.nome AS modelo_nome, m.slug AS modelo_slug, c.nome AS cenario_nome, c.prioridade
         FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
         LEFT JOIN triagem_cenario c ON c.id = a.cenario_id
        WHERE a.id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    const modelo = await carregarModelo(Number(a.modelo_id))
    return { ...formatarAtendimento(a), modelo }
  })

  app.post('/atendimentos', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const modelo = await carregarModelo(String(b.modelo ?? ''))
    if (!modelo) return reply.status(400).send({ error: 'Informe um modelo de triagem válido.' })

    const cnpj = String(b.cnpj ?? '').replace(/\D/g, '') || null
    let clienteId = b.clienteId ? Number(b.clienteId) : null
    let clienteNome = String(b.clienteNome ?? '').trim() || null

    // Reaproveita o cadastro quando o CNPJ já é nosso — a spec pede não duplicar cliente.
    if (!clienteId && cnpj) {
      const [c] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT cod_cli, NOME_FANTASIA AS nome FROM cliente
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
          ORDER BY CASE WHEN COALESCE(ATIVO,'S')='S' THEN 0 ELSE 1 END LIMIT 1`, cnpj)
      if (c) { clienteId = Number(c.cod_cli); clienteNome = clienteNome || c.nome }
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_atendimento
         (modelo_id, cliente_id, cnpj, cliente_nome, contato, telefone, respostas, situacao, atendente_id)
       VALUES (?,?,?,?,?,?,?, 'em_triagem', ?)`,
      modelo.id, clienteId, cnpj, clienteNome,
      String(b.contato ?? '').trim() || null, String(b.telefone ?? '').trim() || null,
      JSON.stringify(b.respostas ?? {}),
      Number((request.user as { id: number } | undefined)?.id ?? 0) || null,
    )
    const [novo] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
    return reply.status(201).send({ id: Number(novo?.id ?? 0) })
  })

  /** Salva as respostas e devolve o que o motor conclui — cenário, pendências e próximas perguntas. */
  app.put('/atendimentos/:id/respostas', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { respostas?: Record<string, any> }

    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.situacao === 'concluido') {
      return reply.status(400).send({ error: 'Atendimento concluído não aceita alteração.' })
    }

    const modelo = await carregarModelo(Number(a.modelo_id))
    if (!modelo) return reply.status(400).send({ error: 'Modelo indisponível.' })

    const respostas = { ...JSON.parse(a.respostas || '{}'), ...(b.respostas ?? {}) }
    const cenario = identificarCenario(modelo, respostas)

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento SET respostas = ?, cenario_id = ?, respondido_por = 'tecnico'
        WHERE id = ?`,
      JSON.stringify(respostas), cenario?.id ?? null, Number(id),
    )
    return {
      respostas,
      cenario,
      perguntas: perguntasVisiveis(modelo, respostas),
      pendencias: pendencias(modelo, respostas).map((p) => p.chave),
    }
  })

  /**
   * Conclui a triagem criando o processo no Pipeline. Só passa com as obrigatórias respondidas
   * e um cenário identificado — concluir sem isso geraria processo sem rumo.
   */
  app.post('/atendimentos/:id/concluir', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuarioId = Number((request.user as { id: number } | undefined)?.id ?? 0) || null

    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.processo_id) return reply.status(400).send({ error: 'Esta triagem já gerou um processo.' })
    if (!a.cliente_id) {
      return reply.status(400).send({
        error: 'Vincule a um cliente do cadastro antes de abrir o processo no Pipeline.',
      })
    }

    const modelo = await carregarModelo(Number(a.modelo_id))
    if (!modelo) return reply.status(400).send({ error: 'Modelo indisponível.' })

    const respostas = JSON.parse(a.respostas || '{}')
    const faltando = pendencias(modelo, respostas)
    if (faltando.length > 0) {
      return reply.status(400).send({
        error: `Faltam ${faltando.length} resposta(s) obrigatória(s).`,
        pendencias: faltando.map((p) => ({ chave: p.chave, texto: p.texto })),
      })
    }

    const cenario = identificarCenario(modelo, respostas)
    if (!cenario) {
      return reply.status(400).send({
        error: 'As respostas não identificam nenhum cenário. Revise antes de abrir o processo.',
      })
    }

    const etapa = cenario.etapaDestino ?? modelo.etapaInicial ?? null
    const titulo = `${modelo.nome} — ${cenario.nome}`

    await prisma.$executeRawUnsafe(
      `INSERT INTO implantacao_processos
         (cliente_id, tipo, titulo, servico_nome, status_atual, observacao,
          processo_principal, criado_em, atualizado_em, criado_por, atualizado_por)
       VALUES (?,?,?,?,?,?,0, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?)`,
      Number(a.cliente_id), modelo.tipoProcesso, titulo.slice(0, 200), cenario.nome.slice(0, 120),
      etapa, cenario.passos.length ? cenario.passos.map((p, i) => `${i + 1}. ${p}`).join('\n') : null,
      usuarioId, usuarioId,
    )
    const [p] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM implantacao_processos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1`,
      Number(a.cliente_id))
    const processoId = Number(p?.id ?? 0)

    // A movimentação é o que faz o processo aparecer no histórico do Pipeline desde o início.
    await prisma.$executeRawUnsafe(
      `INSERT INTO implantacao_movimentacoes
         (cliente_id, processo_id, tipo, status_origem, status_destino, observacao, usuario_id, data_hora)
       VALUES (?,?, 'status', NULL, ?, ?, ?, UTC_TIMESTAMP())`,
      Number(a.cliente_id), processoId, etapa,
      `Aberto pela triagem "${modelo.nome}" — cenário: ${cenario.nome}`, usuarioId,
    ).catch(() => {})

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento SET processo_id = ?, situacao = 'concluido', cenario_id = ?
        WHERE id = ?`, processoId, cenario.id, Number(id))

    return { processoId, cenario: cenario.nome, etapa }
  })

  // ── Link para o cliente responder ──
  app.post('/atendimentos/:id/link', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id, m.permite_link FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id WHERE a.id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (!a.permite_link) return reply.status(400).send({ error: 'Esta triagem não aceita link para o cliente.' })

    const token = gerarToken()
    // Prazo curto: o link carrega dados do atendimento e não deve ficar válido para sempre.
    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento
          SET token = ?, token_expira = DATE_ADD(NOW(), INTERVAL 7 DAY), situacao = 'aguardando_cliente'
        WHERE id = ?`, token, Number(id))
    return { token }
  })

  app.delete('/atendimentos/:id/link', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento SET token = NULL, token_expira = NULL WHERE id = ?`, Number(id))
    return { ok: true }
  })

  /**
   * O que o cliente vê no link. Só as perguntas marcadas para ele — nada de campo interno,
   * nada de cenário, nada de outros atendimentos.
   */
  app.get('/publico/:token', { schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*, m.nome AS modelo_nome FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
        WHERE a.token = ?`, token)
    if (!a) return reply.status(404).send({ error: 'Link inválido.' })
    if (a.token_expira && new Date(a.token_expira) < new Date()) {
      return reply.status(410).send({ error: 'Este link expirou. Peça um novo ao atendente.' })
    }
    if (a.situacao === 'concluido') {
      return reply.status(410).send({ error: 'Este atendimento já foi concluído.' })
    }

    const modelo = await carregarModelo(Number(a.modelo_id))
    if (!modelo) return reply.status(404).send({ error: 'Formulário indisponível.' })

    const respostas = JSON.parse(a.respostas || '{}')
    return {
      titulo: a.modelo_nome,
      descricao: modelo.descricao,
      cliente: a.cliente_nome ?? null,
      respostas,
      perguntas: perguntasVisiveis(modelo, respostas, true),
    }
  })

  app.put('/publico/:token', { schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const b = request.body as { respostas?: Record<string, any>; finalizar?: boolean }

    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_atendimento WHERE token = ?`, token)
    if (!a) return reply.status(404).send({ error: 'Link inválido.' })
    if (a.token_expira && new Date(a.token_expira) < new Date()) {
      return reply.status(410).send({ error: 'Este link expirou.' })
    }
    if (a.situacao === 'concluido') {
      return reply.status(410).send({ error: 'Este atendimento já foi concluído.' })
    }

    const modelo = await carregarModelo(Number(a.modelo_id))
    if (!modelo) return reply.status(404).send({ error: 'Formulário indisponível.' })

    // O cliente só pode escrever nas perguntas que são dele: uma resposta forjada para uma
    // pergunta interna mudaria o cenário sem o atendente saber.
    const permitidas = new Set(
      modelo.perguntas.filter((p) => p.publico !== 'tecnico').map((p) => p.chave))
    const atuais = JSON.parse(a.respostas || '{}')
    const novas: Record<string, any> = { ...atuais }
    for (const [chave, valor] of Object.entries(b.respostas ?? {})) {
      if (permitidas.has(chave)) novas[chave] = valor
    }

    const faltando = b.finalizar ? pendencias(modelo, novas, true) : []
    if (faltando.length > 0) {
      return reply.status(400).send({
        error: 'Responda os campos obrigatórios antes de enviar.',
        pendencias: faltando.map((p) => p.chave),
      })
    }

    const cenario = identificarCenario(modelo, novas)
    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento
          SET respostas = ?, cenario_id = ?, respondido_por = 'cliente',
              situacao = ?, token = CASE WHEN ? THEN NULL ELSE token END
        WHERE id = ?`,
      JSON.stringify(novas), cenario?.id ?? null,
      b.finalizar ? 'em_triagem' : a.situacao, b.finalizar ? 1 : 0, Number(a.id),
    )

    return {
      ok: true,
      finalizado: !!b.finalizar,
      perguntas: perguntasVisiveis(modelo, novas, true),
    }
  })

  // ── Biblioteca de respostas ──
  app.get('/respostas', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request) => {
    const { busca, categoria, modelo } = request.query as Record<string, string>
    const cond = ['r.ativo = 1']
    const val: any[] = []
    if (categoria) { cond.push('r.categoria = ?'); val.push(categoria) }
    if (modelo) { cond.push('(r.modelo_id IS NULL OR m.slug = ?)'); val.push(modelo) }
    if (busca) {
      cond.push('(r.pergunta LIKE ? OR r.resposta_cliente LIKE ? OR r.orientacao LIKE ?)')
      const termo = `%${busca}%`
      val.push(termo, termo, termo)
    }
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.*, m.slug AS modelo_slug FROM triagem_resposta_pronta r
         LEFT JOIN triagem_modelo m ON m.id = r.modelo_id
        WHERE ${cond.join(' AND ')} ORDER BY r.categoria, r.pergunta LIMIT 300`, ...val)
    return linhas.map((r) => ({
      id: Number(r.id),
      categoria: r.categoria ?? null,
      pergunta: r.pergunta,
      respostaCliente: r.resposta_cliente ?? null,
      orientacao: r.orientacao ?? null,
      proximaAcao: r.proxima_acao ?? null,
      setor: r.setor ?? null,
      fonte: r.fonte ?? null,
      impactoFiscal: !!r.impacto_fiscal,
      // Resposta de impacto fiscal não aprovada não deve ser usada com cliente.
      aprovada: !!r.aprovada,
      revisadoEm: r.revisado_em ? String(r.revisado_em).slice(0, 10) : null,
      modeloSlug: r.modelo_slug ?? null,
    }))
  })
}

function formatarAtendimento(a: any) {
  return {
    id: Number(a.id),
    modelo: a.modelo_nome ?? null,
    modeloSlug: a.modelo_slug ?? null,
    processoId: a.processo_id == null ? null : Number(a.processo_id),
    clienteId: a.cliente_id == null ? null : Number(a.cliente_id),
    cnpj: a.cnpj ?? null,
    clienteNome: a.cliente_nome ?? null,
    contato: a.contato ?? null,
    telefone: a.telefone ?? null,
    cenarioId: a.cenario_id == null ? null : Number(a.cenario_id),
    cenario: a.cenario_nome ?? null,
    prioridade: a.prioridade ?? 'normal',
    respostas: JSON.parse(a.respostas || '{}'),
    situacao: a.situacao,
    token: a.token ?? null,
    tokenExpira: a.token_expira ?? null,
    respondidoPor: a.respondido_por ?? null,
    atendente: a.atendente ?? null,
    criadoEm: a.criado_em,
    atualizadoEm: a.atualizado_em,
  }
}
