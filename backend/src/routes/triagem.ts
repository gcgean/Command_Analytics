import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { pipeline } from 'node:stream/promises'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import {
  carregarModelo, perguntasVisiveis, identificarCenario, pendencias, gerarToken, ORIGENS,
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
    // Cancelada não suja a lista do dia a dia, mas continua acessível pelo filtro.
    if (situacao) { cond.push('a.situacao = ?'); val.push(situacao) }
    else cond.push("a.situacao <> 'cancelado'")
    if (busca) {
      cond.push('(a.cliente_nome LIKE ? OR a.cnpj LIKE ? OR a.contato LIKE ?)')
      const termo = `%${busca}%`
      val.push(termo, termo, termo)
    }
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*, m.nome AS modelo_nome, m.slug AS modelo_slug,
              COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS atendente,
              (SELECT COUNT(*) FROM triagem_anexo x WHERE x.atendimento_id = a.id) AS fotos
         FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
         LEFT JOIN usuario u ON u.COD_USU = a.atendente_id
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY a.atualizado_em DESC LIMIT 200`, ...val)

    // O cenário é recalculado aqui, e não lido de cenario_id: o id guardado envelhece quando
    // os cenários são recadastrados, e o que vale é o que as respostas dizem agora.
    const cache = new Map<number, Awaited<ReturnType<typeof carregarModelo>>>()
    const saida = []
    for (const a of linhas) {
      const idModelo = Number(a.modelo_id)
      if (!cache.has(idModelo)) cache.set(idModelo, await carregarModelo(idModelo))
      const modelo = cache.get(idModelo) ?? null
      const respostas = JSON.parse(a.respostas || '{}')
      const cenario = modelo ? identificarCenario(modelo, respostas) : null
      const faltando = modelo ? pendencias(modelo, respostas).length : 0
      saida.push({
        ...formatarAtendimento(a),
        cenarioId: cenario?.id ?? null,
        cenario: cenario?.nome ?? null,
        prioridade: cenario?.prioridade ?? 'normal',
        fotos: Number(a.fotos ?? 0),
        pendentes: faltando,
        // O que a tela precisa saber para oferecer (ou não) o botão de abrir o processo.
        prontoParaProcesso: !a.processo_id && !!a.cliente_id && !!cenario && faltando === 0,
      })
    }
    return saida
  })

  // Contadores dos cards da tela. A lista acima é limitada a 200 linhas, então contar no
  // front mentiria quando houver mais triagens; aqui as contagens vêm direto do banco.
  // Respeita busca e tipo, mas não a situação: os cards já são a divisão por situação.
  app.get('/atendimentos-resumo', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request) => {
    const { modelo, busca } = request.query as Record<string, string>
    const cond: string[] = []
    const val: any[] = []
    if (modelo) { cond.push('m.slug = ?'); val.push(modelo) }
    if (busca) {
      cond.push('(a.cliente_nome LIKE ? OR a.cnpj LIKE ? OR a.contato LIKE ?)')
      const termo = `%${busca}%`
      val.push(termo, termo, termo)
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''

    const porSituacao = await prisma.$queryRawUnsafe<Array<{ situacao: string; total: bigint | number }>>(
      `SELECT a.situacao, COUNT(*) AS total
         FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
        ${where}
        GROUP BY a.situacao`, ...val)
    const contagem: Record<string, number> = {}
    for (const r of porSituacao) contagem[r.situacao] = Number(r.total)

    // "Pronta p/ processo" e "prioridade alta" dependem das respostas (cenário/pendências),
    // então são calculadas em JS — só sobre as triagens ainda em andamento.
    const emAndamento = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.modelo_id, a.respostas, a.cliente_id, a.processo_id
         FROM triagem_atendimento a
         INNER JOIN triagem_modelo m ON m.id = a.modelo_id
        WHERE a.situacao NOT IN ('concluido', 'cancelado')${cond.length ? ` AND ${cond.join(' AND ')}` : ''}`, ...val)
    const cache = new Map<number, Awaited<ReturnType<typeof carregarModelo>>>()
    let prontas = 0
    let prioridadeAlta = 0
    for (const a of emAndamento) {
      const idModelo = Number(a.modelo_id)
      if (!cache.has(idModelo)) cache.set(idModelo, await carregarModelo(idModelo))
      const modeloTriagem = cache.get(idModelo) ?? null
      if (!modeloTriagem) continue
      const respostas = JSON.parse(a.respostas || '{}')
      const cenario = identificarCenario(modeloTriagem, respostas)
      if (cenario?.prioridade === 'alta') prioridadeAlta += 1
      if (!a.processo_id && a.cliente_id && cenario && pendencias(modeloTriagem, respostas).length === 0) prontas += 1
    }

    const canceladas = contagem.cancelado ?? 0
    const total = Object.values(contagem).reduce((s, n) => s + n, 0) - canceladas
    return {
      total,
      emTriagem: contagem.em_triagem ?? 0,
      aguardandoCliente: contagem.aguardando_cliente ?? 0,
      clienteRespondeu: contagem.respondido ?? 0,
      processosAbertos: contagem.concluido ?? 0,
      canceladas,
      prontasParaProcesso: prontas,
      prioridadeAlta,
    }
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
    if (!modelo) return reply.status(404).send({ error: 'Modelo indisponível.' })

    const respostas = JSON.parse(a.respostas || '{}')
    const cenario = identificarCenario(modelo, respostas)
    return {
      ...formatarAtendimento(a),
      // Chave própria: 'modelo' no resumo é o nome, aqui vai a definição inteira.
      modeloCompleto: modelo,
      // A tela do atendente precisa do cenário inteiro — roteiro, alerta e checklist —,
      // não só do nome gravado.
      cenarioAtual: cenario,
      checklist: await carregarChecklist(cenario?.checklistId ?? null),
      perguntas: perguntasVisiveis(modelo, respostas),
      pendencias: pendencias(modelo, respostas).map((pg) => pg.chave),
      anexos: await listarAnexos(Number(a.id)),
    }
  })

  app.post('/atendimentos', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const modelo = await carregarModelo(String(b.modelo ?? ''))
    if (!modelo) return reply.status(400).send({ error: 'Informe um modelo de triagem válido.' })

    let cnpj = String(b.cnpj ?? '').replace(/\D/g, '') || null
    let clienteId = b.clienteId ? Number(b.clienteId) : null
    let clienteNome = String(b.clienteNome ?? '').trim() || null
    const contato = String(b.contato ?? '').trim() || null
    const telefone = String(b.telefone ?? '').trim() || null

    // Reaproveita o cadastro quando o CNPJ já é nosso — a spec pede não duplicar cliente.
    let cadastro: any = null
    if (clienteId) {
      ;[cadastro] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM cliente WHERE cod_cli = ?`, clienteId)
    } else if (cnpj) {
      ;[cadastro] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM cliente
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
          ORDER BY CASE WHEN COALESCE(ATIVO,'S')='S' THEN 0 ELSE 1 END LIMIT 1`, cnpj)
      if (cadastro) clienteId = Number(cadastro.cod_cli)
    }
    if (cadastro) {
      clienteNome = clienteNome || cadastro.NOME_FANTASIA || cadastro.NOME_CLI || null
      cnpj = cnpj || String(cadastro.CNPJ_CLI ?? '').replace(/\D/g, '') || null
    }

    // O atendente não deve redigitar o que o cadastro já tem: as perguntas marcadas com
    // `origem` nascem preenchidas. Quem fala e por qual WhatsApp continua sendo digitado,
    // porque é a pessoa do contato, não o cliente.
    const respostas: Record<string, any> = { ...(b.respostas ?? {}) }
    for (const p of modelo.perguntas) {
      if (!p.origem || respostas[p.chave] != null) continue
      const o = ORIGENS[p.origem]
      if (!o) continue
      const valor = o.fonte === 'cliente'
        ? cadastro?.[o.coluna]
        : (o.coluna === 'contato' ? contato : telefone)
      const texto = String(valor ?? '').trim()
      // Campo do legado costuma guardar a máscara vazia (".   .   /    -"): sem nenhuma letra
      // ou número não é dado, e preencher isso daria uma obrigatória por respondida.
      if (texto !== '' && /[A-Za-z0-9]/.test(texto)) respostas[p.chave] = texto
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_atendimento
         (modelo_id, cliente_id, cnpj, cliente_nome, contato, telefone, respostas, situacao, atendente_id)
       VALUES (?,?,?,?,?,?,?, 'em_triagem', ?)`,
      modelo.id, clienteId, cnpj, clienteNome, contato, telefone,
      JSON.stringify(respostas),
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
      cenarioAtual: cenario,
      checklist: await carregarChecklist(cenario?.checklistId ?? null),
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

    // status_atual é NOT NULL no Pipeline. Sem etapa resolvida o INSERT quebra, então cai
    // para a primeira etapa ativa do quadro — e, se nem isso existir, avisa em vez de falhar.
    let etapa = cenario.etapaDestino ?? modelo.etapaInicial ?? null
    if (etapa == null) {
      const [primeira] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM cadastro_etapas WHERE ativo = 1 ORDER BY ordem, id LIMIT 1`)
      etapa = primeira ? Number(primeira.id) : null
    }
    if (etapa == null) {
      return reply.status(400).send({
        error: 'Nenhuma etapa cadastrada no Pipeline para receber o processo.',
      })
    }
    const titulo = `${modelo.nome} — ${cenario.nome}`

    const fotos = await listarAnexos(Number(id))
    const resumo = montarResumo(modelo, respostas, cenario, fotos, Number(id))

    await prisma.$executeRawUnsafe(
      `INSERT INTO implantacao_processos
         (cliente_id, tipo, titulo, servico_nome, status_atual, observacao,
          processo_principal, criado_em, atualizado_em, criado_por, atualizado_por)
       VALUES (?,?,?,?,?,?,0, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?)`,
      Number(a.cliente_id), modelo.tipoProcesso, titulo.slice(0, 160), cenario.nome.slice(0, 120),
      etapa, resumo.observacao, usuarioId, usuarioId,
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

    // O processo precisa carregar o que o cliente respondeu, senão quem pega depois tem que
    // voltar na triagem para entender o caso. observacao é varchar(2000), então vai em partes.
    for (const bloco of resumo.blocos) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO implantacao_movimentacoes
           (cliente_id, processo_id, tipo, observacao, usuario_id, data_hora)
         VALUES (?,?, 'observacao', ?, ?, UTC_TIMESTAMP())`,
        Number(a.cliente_id), processoId, bloco, usuarioId,
      ).catch(() => {})
    }

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento SET processo_id = ?, situacao = 'concluido', cenario_id = ?
        WHERE id = ?`, processoId, cenario.id, Number(id))

    // Depois do processo: o processo é o que importa, e uma falha aqui não pode desfazê-lo.
    let efeito: string | null = null
    if (modelo.acaoConclusao) {
      efeito = await executarAcaoConclusao(
        modelo.acaoConclusao, respostas, Number(a.cliente_id), Number(id), usuarioId,
      ).catch(() => null)
      if (efeito) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO implantacao_movimentacoes
             (cliente_id, processo_id, tipo, observacao, usuario_id, data_hora)
           VALUES (?,?, 'observacao', ?, ?, UTC_TIMESTAMP())`,
          Number(a.cliente_id), processoId, efeito, usuarioId,
        ).catch(() => {})
      }
    }

    return { processoId, cenario: cenario.nome, etapa, efeito }
  })

  /**
   * Cancelar em vez de apagar: a triagem é registro de atendimento, e saber que alguém
   * ligou e desistiu vale mais do que a linha sumir. Reversível.
   */
  app.post('/atendimentos/:id/cancelar', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { motivo?: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, processo_id, situacao, respostas FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.processo_id) {
      return reply.status(400).send({
        error: 'Esta triagem já gerou um processo no Pipeline. Cancele o processo por lá.',
      })
    }

    const respostas = JSON.parse(a.respostas || '{}')
    const motivo = String(b?.motivo ?? '').trim()
    if (motivo) respostas.__cancelamento = motivo

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento
          SET situacao = 'cancelado', token = NULL, token_expira = NULL, respostas = ?
        WHERE id = ?`, JSON.stringify(respostas), Number(id))
    return { ok: true }
  })

  app.post('/atendimentos/:id/reabrir', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, situacao FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.situacao !== 'cancelado') return reply.status(400).send({ error: 'Esta triagem não está cancelada.' })
    await prisma.$executeRawUnsafe(
      `UPDATE triagem_atendimento SET situacao = 'em_triagem' WHERE id = ?`, Number(id))
    return { ok: true }
  })

  /** Apagar de vez, com os arquivos. Só o que nunca virou processo. */
  app.delete('/atendimentos/:id', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, processo_id FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.processo_id) {
      return reply.status(400).send({
        error: 'Esta triagem gerou o processo #' + Number(a.processo_id)
          + ' e não pode ser apagada — é o registro de como ele nasceu.',
      })
    }

    // Os arquivos saem do disco junto: deixá-los órfãos só ocuparia espaço para sempre.
    const anexos = await prisma.$queryRawUnsafe<any[]>(
      `SELECT stored_name FROM triagem_anexo WHERE atendimento_id = ?`, Number(id))
    for (const x of anexos) {
      const caminho = path.join(pastaAnexos(), String(x.stored_name))
      if (dentroDe(pastaAnexos(), caminho)) await fs.unlink(caminho).catch(() => {})
    }
    await prisma.$executeRawUnsafe(`DELETE FROM triagem_anexo WHERE atendimento_id = ?`, Number(id))
    await prisma.$executeRawUnsafe(`DELETE FROM triagem_atendimento WHERE id = ?`, Number(id))
    return { ok: true, arquivosRemovidos: anexos.length }
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
      anexos: (await listarAnexos(Number(a.id))).filter((x) => x.enviadoPor === 'cliente'),
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
      // 'respondido' é um estado próprio: o atendente precisa ver que a bola voltou para ele.
      b.finalizar ? 'respondido' : a.situacao, b.finalizar ? 1 : 0, Number(a.id),
    )

    return {
      ok: true,
      finalizado: !!b.finalizar,
      perguntas: perguntasVisiveis(modelo, novas, true),
    }
  })

  // ── Fotos: do atendente e do cliente ──
  app.post('/atendimentos/:id/anexos', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { chave } = request.query as { chave?: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, modelo_id, situacao FROM triagem_atendimento WHERE id = ?`, Number(id))
    if (!a) return reply.status(404).send({ error: 'Atendimento não encontrado.' })
    if (a.situacao === 'concluido') {
      return reply.status(400).send({ error: 'Atendimento concluído não aceita novos arquivos.' })
    }

    const modelo = await carregarModelo(Number(a.modelo_id))
    const pergunta = modelo?.perguntas.find((p) => p.chave === chave)
    if (!pergunta || !TIPOS_ARQUIVO.has(pergunta.tipo)) {
      return reply.status(400).send({ error: 'Esta pergunta não recebe arquivos.' })
    }

    const r = await receberArquivos(request, Number(id), pergunta.chave, 'tecnico')
    if (r.aceitos === 0) {
      return reply.status(400).send({
        error: r.recusados[0] ?? 'Nenhum arquivo aceito.', recusados: r.recusados,
      })
    }
    const respostas = await sincronizarRespostaAnexo(Number(id), pergunta.chave)
    return { ok: true, aceitos: r.aceitos, recusados: r.recusados, respostas, anexos: await listarAnexos(Number(id)) }
  })

  app.get('/anexos/:anexoId/arquivo', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { anexoId } = request.params as { anexoId: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_anexo WHERE id = ?`, Number(anexoId))
    if (!a) return reply.status(404).send({ error: 'Arquivo não encontrado.' })

    const dir = pastaAnexos()
    const caminho = path.join(dir, String(a.stored_name))
    // O nome vem do banco, mas conferir o caminho é barato e fecha a porta para '..'.
    if (!dentroDe(dir, caminho)) return reply.status(400).send({ error: 'Caminho inválido.' })
    if (!(await fs.stat(caminho).catch(() => null))) {
      return reply.status(404).send({ error: 'Arquivo não está mais no servidor.' })
    }
    const baixar = (request.query as any)?.download === '1'
    reply.header('Content-Type', String(a.mime_type))
    reply.header('Content-Disposition',
      `${baixar ? 'attachment' : 'inline'}; filename="${String(a.original_name).replace(/"/g, '')}"`)
    return reply.send(createReadStream(caminho))
  })

  app.delete('/anexos/:anexoId', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { anexoId } = request.params as { anexoId: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_anexo WHERE id = ?`, Number(anexoId))
    if (!a) return reply.status(404).send({ error: 'Arquivo não encontrado.' })
    const caminho = path.join(pastaAnexos(), String(a.stored_name))
    if (dentroDe(pastaAnexos(), caminho)) await fs.unlink(caminho).catch(() => {})
    await prisma.$executeRawUnsafe(`DELETE FROM triagem_anexo WHERE id = ?`, Number(anexoId))
    await sincronizarRespostaAnexo(Number(a.atendimento_id), String(a.chave))
    return { ok: true }
  })

  app.post('/publico/:token/anexos', { schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const { chave } = request.query as { chave?: string }
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
    const pergunta = modelo?.perguntas.find((p) => p.chave === chave)
    // Mesma regra das respostas: o cliente só envia arquivo para pergunta que é dele.
    if (!pergunta || !TIPOS_ARQUIVO.has(pergunta.tipo) || pergunta.publico === 'tecnico') {
      return reply.status(400).send({ error: 'Esta pergunta não recebe arquivos.' })
    }

    const r = await receberArquivos(request, Number(a.id), pergunta.chave, 'cliente')
    if (r.aceitos === 0) {
      return reply.status(400).send({
        error: r.recusados[0] ?? 'Nenhum arquivo aceito.', recusados: r.recusados,
      })
    }
    await sincronizarRespostaAnexo(Number(a.id), pergunta.chave)
    return { ok: true, aceitos: r.aceitos, recusados: r.recusados, anexos: await listarAnexos(Number(a.id)) }
  })

  app.delete('/publico/:token/anexos/:anexoId', { schema: { tags: ['Triagem'] } }, async (request, reply) => {
    const { token, anexoId } = request.params as { token: string; anexoId: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, token_expira, situacao FROM triagem_atendimento WHERE token = ?`, token)
    if (!a) return reply.status(404).send({ error: 'Link inválido.' })
    if (a.token_expira && new Date(a.token_expira) < new Date()) {
      return reply.status(410).send({ error: 'Este link expirou.' })
    }
    // Só o que o próprio cliente mandou por este link: foto do técnico não sai daqui.
    const [anexo] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_anexo WHERE id = ? AND atendimento_id = ? AND enviado_por = 'cliente'`,
      Number(anexoId), Number(a.id))
    if (!anexo) return reply.status(404).send({ error: 'Arquivo não encontrado.' })
    const caminho = path.join(pastaAnexos(), String(anexo.stored_name))
    if (dentroDe(pastaAnexos(), caminho)) await fs.unlink(caminho).catch(() => {})
    await prisma.$executeRawUnsafe(`DELETE FROM triagem_anexo WHERE id = ?`, Number(anexoId))
    await sincronizarRespostaAnexo(Number(a.id), String(anexo.chave))
    return { ok: true }
  })

  /**
   * Os arquivos da triagem que originou um processo. O Pipeline consulta por aqui em vez de
   * receber uma cópia dos arquivos: um lugar só guarda a foto, e ela não se duplica.
   */
  app.get('/por-processo/:processoId', { preHandler: authMiddleware, schema: { tags: ['Triagem'] } }, async (request) => {
    const { processoId } = request.params as { processoId: string }
    const [a] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_atendimento WHERE processo_id = ? LIMIT 1`, Number(processoId))
    if (!a) return { triagemId: null, modelo: null, cenario: null, respostas: [], anexos: [] }

    const modelo = await carregarModelo(Number(a.modelo_id))
    const respostas = JSON.parse(a.respostas || '{}')
    const cenario = modelo ? identificarCenario(modelo, respostas) : null

    // Já vai montado para a tela: rótulo, grupo e valor legível, na ordem do cadastro.
    const itens = (modelo?.perguntas ?? [])
      .filter((p) => !TIPOS_ARQUIVO.has(p.tipo))
      .map((p) => {
        const bruto = respostas[p.chave]
        const valor = (Array.isArray(bruto) ? bruto.join(', ') : String(bruto ?? '')).trim()
        return { chave: p.chave, grupo: p.grupo ?? 'Informações', texto: p.texto, valor }
      })
      .filter((x) => x.valor !== '')

    return {
      triagemId: Number(a.id),
      modelo: modelo?.nome ?? null,
      cenario: cenario ? { nome: cenario.nome, alerta: cenario.alerta, passos: cenario.passos } : null,
      respostas: itens,
      anexos: await listarAnexos(Number(a.id)),
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

// ── Fotos da triagem ──
// O caso que motivou isto: a etiqueta atrás da maquininha diz o modelo, e é com ela que o
// suporte confere a compatibilidade. Pedir a foto na triagem evita a ida e volta.

const TIPOS_ARQUIVO = new Set(['foto', 'arquivo'])
const MIME_ANEXO = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
])
const MAX_ANEXO_BYTES = 15 * 1024 * 1024
const MAX_ANEXOS_POR_PERGUNTA = 6

const pastaAnexos = () => path.resolve(process.cwd(), 'uploads', 'triagem')

const dentroDe = (pai: string, filho: string) => {
  const rel = path.relative(pai, filho)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function esvaziar(stream: NodeJS.ReadableStream) {
  for await (const _c of stream as any) void _c
}

async function listarAnexos(atendimentoId: number) {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, chave, original_name, mime_type, size_bytes, enviado_por, criado_em
       FROM triagem_anexo WHERE atendimento_id = ? ORDER BY id`, atendimentoId)
  return linhas.map((a) => ({
    id: Number(a.id),
    chave: a.chave as string,
    nome: a.original_name as string,
    mimeType: a.mime_type as string,
    tamanho: Number(a.size_bytes ?? 0),
    enviadoPor: a.enviado_por as string,
    criadoEm: a.criado_em,
  }))
}

/**
 * A resposta da pergunta passa a ser a lista de arquivos. Assim o motor continua genérico:
 * 'preenchido', obrigatoriedade e condições funcionam sem saber que ali tem foto.
 */
async function sincronizarRespostaAnexo(atendimentoId: number, chave: string) {
  const nomes = await prisma.$queryRawUnsafe<any[]>(
    `SELECT original_name FROM triagem_anexo WHERE atendimento_id = ? AND chave = ? ORDER BY id`,
    atendimentoId, chave)
  const [a] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT respostas FROM triagem_atendimento WHERE id = ?`, atendimentoId)
  const respostas = JSON.parse(a?.respostas || '{}')
  if (nomes.length === 0) delete respostas[chave]
  else respostas[chave] = nomes.map((n) => String(n.original_name))
  await prisma.$executeRawUnsafe(
    `UPDATE triagem_atendimento SET respostas = ? WHERE id = ?`,
    JSON.stringify(respostas), atendimentoId)
  return respostas
}

/** Recebe os arquivos da requisição e grava os que passam nas regras. */
async function receberArquivos(request: any, atendimentoId: number, chave: string, quem: string) {
  const dir = pastaAnexos()
  await fs.mkdir(dir, { recursive: true })

  const [{ total }] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS total FROM triagem_anexo WHERE atendimento_id = ? AND chave = ?`,
    atendimentoId, chave)
  let jaTem = Number(total ?? 0)
  let aceitos = 0
  const recusados: string[] = []

  for await (const part of request.parts()) {
    if ((part as any).type !== 'file') continue
    const arquivo = part as MultipartFile
    const nomeBruto = String((arquivo as any).filename || 'arquivo')

    if (jaTem >= MAX_ANEXOS_POR_PERGUNTA) {
      await esvaziar(arquivo.file as any)
      recusados.push(`${nomeBruto}: limite de ${MAX_ANEXOS_POR_PERGUNTA} arquivos`)
      continue
    }
    const mimeType = String((arquivo as any).mimetype || '')
    if (!MIME_ANEXO.has(mimeType)) {
      await esvaziar(arquivo.file as any)
      recusados.push(`${nomeBruto}: formato não aceito`)
      continue
    }

    const original = nomeBruto.replace(/[^a-zA-Z0-9._\-\s]/g, '').trim()
      .replace(/\s+/g, ' ').slice(0, 180) || 'arquivo'
    const guardado = `${randomUUID()}${path.extname(original).slice(0, 10)}`
    const caminho = path.join(dir, guardado)
    await pipeline(arquivo.file, createWriteStream(caminho))

    const stat = await fs.stat(caminho)
    if (stat.size > MAX_ANEXO_BYTES) {
      await fs.unlink(caminho).catch(() => {})
      recusados.push(`${original}: acima de 15 MB`)
      continue
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_anexo
         (atendimento_id, chave, original_name, stored_name, mime_type, size_bytes, enviado_por)
       VALUES (?,?,?,?,?,?,?)`,
      atendimentoId, chave, original, guardado, mimeType, Number(stat.size), quem)
    jaTem += 1
    aceitos += 1
  }

  return { aceitos, recusados }
}

/**
 * Rotinas rodadas ao concluir, além de abrir o processo. O modelo diz qual rodar
 * (`acao_conclusao`), então o motor segue sem conhecer as perguntas de cada triagem.
 *
 * Toda ação é tolerante: se as respostas esperadas não existirem, ela não faz nada e a
 * conclusão segue. Nenhuma delas pode derrubar a abertura do processo.
 */
async function executarAcaoConclusao(
  acao: string, respostas: Record<string, any>, clienteId: number,
  triagemId: number, usuarioId: number | null,
): Promise<string | null> {
  if (acao !== 'maquininha') return null

  // O cadastro de maquininhas só conhece TEF e SmartPOS. Maquininha avulsa e "nenhum"
  // ficam de fora — registrar como um dos dois seria inventar informação.
  const equipamento = String(respostas.equipamento ?? '')
  const tipo = equipamento === 'SmartPOS' ? 'SMARTPOS' : equipamento === 'TEF/PinPad' ? 'TEF' : null
  if (!tipo) return null

  const nomeOperadora = String(respostas.adquirente ?? '').trim()
  const operadoraLivre = String(respostas.adquirente_outra ?? '').trim()
  if (nomeOperadora === '') return null

  // O nome tem que bater com o catálogo; "Outra" cai na entrada própria do catálogo.
  const [op] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM cadastro_operadoras WHERE nome = ? AND ativo = 1 LIMIT 1`, nomeOperadora)
  if (!op) return null

  const quantidade = Math.max(1, Number(respostas.qtd_maquininhas ?? 1) || 1)
  const integrado = String(respostas.ja_integrado ?? '') === 'Sim'
  const status = integrado ? 'INTEGRADO' : 'EM_IMPLANTACAO'

  const detalhes = [
    operadoraLivre ? `Operadora informada: ${operadoraLivre}` : '',
    respostas.modelo_smartpos ? `Modelo: ${respostas.modelo_smartpos}` : '',
    respostas.serie_smartpos ? `Série: ${respostas.serie_smartpos}` : '',
    respostas.ec_tef ? `EC: ${respostas.ec_tef}` : '',
    respostas.logico_tef ? `Número lógico: ${respostas.logico_tef}` : '',
    `Registrado pela triagem #${triagemId}.`,
  ].filter(Boolean).join(' | ').slice(0, 2000)

  // Mesmo cliente, mesma operadora e mesmo tipo: atualiza em vez de criar uma segunda linha.
  const [existente] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM cliente_maquininhas
      WHERE cliente_id = ? AND operadora_id = ? AND tipo = ? LIMIT 1`,
    clienteId, Number(op.id), tipo)

  if (existente) {
    await prisma.$executeRawUnsafe(
      `UPDATE cliente_maquininhas
          SET quantidade = ?, status_integracao = ?, observacao = ?,
              atualizado_em = NOW(), atualizado_por = ?
        WHERE id = ?`,
      quantidade, status, detalhes, usuarioId, Number(existente.id))
    return `Maquininha ${tipo} / ${nomeOperadora} atualizada no cadastro do cliente.`
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO cliente_maquininhas
       (cliente_id, operadora_id, tipo, quantidade, status_integracao, observacao,
        criado_por, atualizado_por)
     VALUES (?,?,?,?,?,?,?,?)`,
    clienteId, Number(op.id), tipo, quantidade, status, detalhes, usuarioId, usuarioId)
  return `Maquininha ${tipo} / ${nomeOperadora} cadastrada para o cliente.`
}

/**
 * Transcreve a triagem para o processo. O que o cliente respondeu tem que viajar junto —
 * quem pega o processo depois não deveria precisar abrir a triagem para entender o caso.
 */
function montarResumo(
  modelo: any, respostas: Record<string, any>, cenario: any,
  fotos: Array<{ chave: string; nome: string; enviadoPor: string }>, triagemId: number,
) {
  const valor = (v: any) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim()

  // Agrupado como na tela, com uma linha em branco entre blocos: no histórico do Pipeline
  // isso é lido por gente, não por máquina.
  const linhas: string[] = []
  let grupoAtual = ''
  for (const p of modelo.perguntas as any[]) {
    // Pergunta de arquivo tem seção própria: repetir os nomes aqui só ocupa linha.
    if (TIPOS_ARQUIVO.has(p.tipo)) continue
    const texto = valor(respostas[p.chave])
    if (texto === '') continue
    const grupo = p.grupo || 'Informações'
    if (grupo !== grupoAtual) {
      if (linhas.length > 0) linhas.push('')
      linhas.push(`${grupo.toUpperCase()}`)
      grupoAtual = grupo
    }
    // Muitas perguntas já terminam em "?"; "?:" fica feio.
    const rotulo = /[?:]$/.test(p.texto) ? p.texto : `${p.texto}:`
    linhas.push(`• ${rotulo} ${texto}`)
  }
  if (fotos.length > 0) {
    linhas.push('')
    linhas.push('ARQUIVOS')
    for (const f of fotos) {
      linhas.push(`• ${f.nome} — enviado pelo ${f.enviadoPor}`)
    }
    linhas.push(`(as imagens aparecem no histórico deste processo)`)
  }

  const cabecalho = [
    `TRIAGEM #${triagemId} — ${modelo.nome}`,
    `Cenário: ${cenario.nome}`,
    cenario.alerta ? `` : '',
    cenario.alerta ? `ATENÇÃO: ${cenario.alerta}` : '',
  ].filter(Boolean).join('\n')

  const roteiro = cenario.passos.length
    ? ['', 'ROTEIRO DO CENÁRIO', ...cenario.passos.map((x: string, i: number) => `${i + 1}. ${x}`)].join('\n')
    : ''

  // A observação do processo é o resumo curto; o detalhe completo vai nas movimentações,
  // porque as duas colunas são varchar(2000).
  const observacao = (cabecalho + roteiro).slice(0, 2000)

  const blocos: string[] = []
  let atual = [`RESPOSTAS DA TRIAGEM #${triagemId}`, '']
  let tamanho = 40
  for (const l of linhas) {
    if (tamanho + l.length + 1 > 1900) {
      blocos.push(atual.join('\n'))
      atual = [`RESPOSTAS DA TRIAGEM #${triagemId} (continuação)`, '']
      tamanho = 50
    }
    atual.push(l)
    tamanho += l.length + 1
  }
  if (atual.length > 2) blocos.push(atual.join('\n'))

  return { observacao, blocos }
}

/** Itens do checklist que o cenário exige. O cadastro é o mesmo que o Pipeline usa. */
async function carregarChecklist(id: number | null) {
  if (!id) return null
  const [c] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, descricao, itens FROM cadastro_checklists WHERE id = ? AND ativo = 1`, id)
  if (!c) return null
  let itens: string[] = []
  try { itens = JSON.parse(c.itens || '[]') } catch { itens = [] }
  return {
    id: Number(c.id),
    nome: c.nome as string,
    descricao: (c.descricao ?? null) as string | null,
    itens: itens.map((i: any) => (typeof i === 'string' ? i : String(i?.texto ?? i?.nome ?? ''))),
  }
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
