import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'

/**
 * Comissões de certificado digital — a aba "Gerenciador de comissões" do sistema legado.
 *
 * Usa as MESMAS tabelas do Delphi, que segue em uso em paralelo:
 *   indicacao_contador — cada certificado emitido, com o valor e a comissão do indicador
 *   contador           — o escritório de contabilidade que indicou
 *   certificadora      — quem emitiu (Ceará Certificação, ONLINE ID)
 *
 * A comissão NÃO é calculada por regra fixa: o histórico tem 10%, 25%, 40%, 50% e zero.
 * Quem lança decide o percentual, então a tela pede o valor e o percentual e mostra o
 * resultado antes de gravar, em vez de impor uma regra que a operação não segue.
 */

const ehData = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
const num = (v: any) => (v == null ? 0 : Number(v))
const hoje = () => new Date().toISOString().slice(0, 10)
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`

function periodo(q: Record<string, string>) {
  return {
    inicio: ehData(q.inicio) ? q.inicio : primeiroDoMes(),
    fim: ehData(q.fim) ? q.fim : hoje(),
  }
}

export async function comissoesCertificadoRoutes(app: FastifyInstance) {
  /** Gerenciador: um lançamento por linha, com os totais do rodapé. */
  app.get('/indicacoes', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request) => {
    const q = request.query as Record<string, string>
    const { inicio, fim } = periodo(q)
    const cond: string[] = ['i.data_indicacao BETWEEN ? AND ?']
    const val: any[] = [inicio, fim]

    if (Number(q.contadorId) > 0) { cond.push('i.id_contador = ?'); val.push(Number(q.contadorId)) }
    if (Number(q.certificadoraId) > 0) { cond.push('i.id_certificadora = ?'); val.push(Number(q.certificadoraId)) }
    if (Number(q.usuarioId) > 0) { cond.push('i.id_usu_lanc = ?'); val.push(Number(q.usuarioId)) }
    if (q.comComissao === 'true') cond.push('COALESCE(i.comissao_valor, 0) > 0')
    if (q.comComissao === 'false') cond.push('COALESCE(i.comissao_valor, 0) = 0')
    const busca = String(q.busca ?? '').trim()
    if (busca) {
      cond.push(`(c.NOME_CLI LIKE ? OR c.NOME_FANTASIA LIKE ? OR co.DESCRICAO_ESCRITORIO LIKE ?
                  OR co.NOME_RESP LIKE ?)`)
      const t = `%${busca}%`
      val.push(t, t, t, t)
    }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id, i.data_hora_lanc, i.data_indicacao, i.tipo, i.valor, i.comissao_valor,
              i.tipo_cliente, i.validade_certificado,
              i.id_contador, co.DESCRICAO_ESCRITORIO AS escritorio, co.NOME_RESP AS contadorResp,
              co.NOME_COMERCIAL AS contadorComercial, co.CHAVE_PIX AS chavePix,
              co.EMAIL AS contadorEmail, co.TELEFONE AS contadorTelefone,
              i.id_cliente, c.NOME_CLI AS clienteNome, c.NOME_FANTASIA AS clienteFantasia,
              i.id_usu_lanc, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario,
              i.id_certificadora, ce.descricao_certificadora AS certificadora
         FROM indicacao_contador i
         LEFT JOIN contador co ON co.ID_CONTADOR = i.id_contador
         LEFT JOIN cliente c ON c.cod_cli = i.id_cliente
         LEFT JOIN usuario u ON u.COD_USU = i.id_usu_lanc
         LEFT JOIN certificadora ce ON ce.id_certificadora = i.id_certificadora
        WHERE ${cond.join(' AND ')}
        ORDER BY i.data_indicacao DESC, i.id DESC
        LIMIT 2000`, ...val).catch(() => [])

    const itens = linhas.map((r) => {
      const valor = num(r.valor)
      const comissao = num(r.comissao_valor)
      return {
        id: Number(r.id),
        dataIndicacao: r.data_indicacao ?? null,
        dataLancamento: r.data_hora_lanc ?? null,
        tipo: r.tipo == null ? null : Number(r.tipo),
        valor,
        comissao,
        // O percentual não é guardado: vem da razão entre os dois, como no relatório antigo.
        percentual: valor > 0 ? Number(((comissao / valor) * 100).toFixed(2)) : 0,
        tipoCliente: r.tipo_cliente ?? null,
        validadeCertificado: r.validade_certificado ?? null,
        contadorId: r.id_contador == null ? null : Number(r.id_contador),
        escritorio: r.escritorio ?? null,
        contador: r.contadorResp || r.contadorComercial || null,
        chavePix: r.chavePix ?? null,
        clienteId: r.id_cliente == null ? null : Number(r.id_cliente),
        cliente: String(r.clienteNome ?? '').trim(),
        clienteFantasia: r.clienteFantasia ?? null,
        usuarioId: r.id_usu_lanc == null ? null : Number(r.id_usu_lanc),
        usuario: String(r.usuario ?? '').trim(),
        certificadoraId: r.id_certificadora == null ? null : Number(r.id_certificadora),
        certificadora: r.certificadora ?? null,
      }
    })

    return {
      inicio, fim,
      total: itens.length,
      valorOperacao: itens.reduce((s, i) => s + i.valor, 0),
      valorComissao: itens.reduce((s, i) => s + i.comissao, 0),
      itens,
    }
  })

  /** Qtd por Contador: quantas indicações cada escritório trouxe no período. */
  app.get('/por-contador', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT co.ID_CONTADOR AS id, co.DESCRICAO_ESCRITORIO AS escritorio,
              co.NOME_RESP AS responsavel, co.NOME_COMERCIAL AS comercial, co.CIDADE AS cidade,
              co.CHAVE_PIX AS chavePix,
              COUNT(*) AS indicacoes,
              SUM(i.valor) AS valor,
              SUM(i.comissao_valor) AS comissao
         FROM indicacao_contador i
         INNER JOIN contador co ON co.ID_CONTADOR = i.id_contador
        WHERE i.data_indicacao BETWEEN ? AND ?
        GROUP BY co.ID_CONTADOR, co.DESCRICAO_ESCRITORIO, co.NOME_RESP, co.NOME_COMERCIAL,
                 co.CIDADE, co.CHAVE_PIX
        ORDER BY indicacoes DESC, comissao DESC`, inicio, fim).catch(() => [])

    const itens = linhas.map((r) => {
      const valor = num(r.valor)
      const comissao = num(r.comissao)
      return {
        contadorId: Number(r.id),
        escritorio: r.escritorio ?? null,
        responsavel: r.responsavel ?? null,
        comercial: r.comercial ?? null,
        cidade: r.cidade ?? null,
        chavePix: r.chavePix ?? null,
        indicacoes: Number(r.indicacoes ?? 0),
        valor,
        comissao,
        percentual: valor > 0 ? Number(((comissao / valor) * 100).toFixed(2)) : 0,
      }
    })
    return {
      inicio, fim,
      total: itens.length,
      valorOperacao: itens.reduce((s, i) => s + i.valor, 0),
      valorComissao: itens.reduce((s, i) => s + i.comissao, 0),
      itens,
    }
  })

  /**
   * Comissão Agente: rateio por certificadora entre quem lançou.
   *
   * A regra do legado: o percentual pago sobre o total emitido sobe com o volume da EQUIPE
   * (0% até 10 certificados, 1% de 11 a 20, e assim por diante até 5% acima de 51). Cada
   * pessoa participa pela fatia que emitiu, com um teto de 60% — o que passa disso é
   * redistribuído igualmente entre todos, para uma pessoa só não levar o bolo inteiro.
   */
  app.get('/agente', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)

    const porPessoa = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.COD_USU AS usuarioId, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario,
              i.id_certificadora AS certificadoraId,
              ce.descricao_certificadora AS certificadora,
              COUNT(i.id) AS qtdIndividual,
              SUM(i.valor) AS valorIndividual
         FROM indicacao_contador i
         INNER JOIN usuario u ON u.COD_USU = i.id_usu_lanc
         LEFT JOIN certificadora ce ON ce.id_certificadora = i.id_certificadora
        WHERE i.data_indicacao BETWEEN ? AND ?
          AND COALESCE(i.id_certificadora, 0) > 0
        GROUP BY u.COD_USU, usuario, i.id_certificadora, ce.descricao_certificadora`,
      inicio, fim).catch(() => [])

    const porCertificadora = await prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id_certificadora AS certificadoraId,
              COUNT(i.id) AS qtdEquipe,
              SUM(i.valor) AS valorEquipe
         FROM indicacao_contador i
        WHERE i.data_indicacao BETWEEN ? AND ?
          AND COALESCE(i.id_certificadora, 0) > 0
        GROUP BY i.id_certificadora`, inicio, fim).catch(() => [])

    const equipe = new Map(porCertificadora.map((r) => [Number(r.certificadoraId), {
      qtd: Number(r.qtdEquipe ?? 0), valor: num(r.valorEquipe),
    }]))

    /** Faixa por volume da equipe, igual ao legado. */
    const percentualPorVolume = (qtd: number) => {
      if (qtd <= 10) return 0
      if (qtd <= 20) return 0.01
      if (qtd <= 30) return 0.02
      if (qtd <= 40) return 0.03
      if (qtd <= 50) return 0.04
      return 0.05
    }

    // Excedente acima de 60% por certificadora, para redistribuir.
    const excedente = new Map<number, { total: number; pessoas: number }>()
    for (const r of porPessoa) {
      const cid = Number(r.certificadoraId)
      const eq = equipe.get(cid)
      const participacao = eq && eq.qtd > 0 ? Number(r.qtdIndividual) / eq.qtd : 0
      const atual = excedente.get(cid) ?? { total: 0, pessoas: 0 }
      atual.total += participacao > 0.6 ? participacao - 0.6 : 0
      atual.pessoas += 1
      excedente.set(cid, atual)
    }

    const itens = porPessoa.map((r) => {
      const cid = Number(r.certificadoraId)
      const eq = equipe.get(cid) ?? { qtd: 0, valor: 0 }
      const ex = excedente.get(cid) ?? { total: 0, pessoas: 0 }
      const participacaoInicial = eq.qtd > 0 ? Number(r.qtdIndividual) / eq.qtd : 0
      const sobra = ex.pessoas > 0 ? ex.total / ex.pessoas : 0

      const participacao = eq.qtd === 0 ? 0
        : ex.total === 0 ? participacaoInicial
          : participacaoInicial > 0.6 ? 0.6 + sobra
            : participacaoInicial + sobra

      const percAplicado = percentualPorVolume(eq.qtd)
      return {
        usuarioId: Number(r.usuarioId),
        usuario: String(r.usuario ?? '').trim(),
        certificadoraId: cid,
        certificadora: r.certificadora ?? null,
        qtdIndividual: Number(r.qtdIndividual ?? 0),
        qtdEquipe: eq.qtd,
        valorIndividual: num(r.valorIndividual),
        valorEquipe: eq.valor,
        percentualAplicado: Number((percAplicado * 100).toFixed(2)),
        participacaoInicial: Number((participacaoInicial * 100).toFixed(2)),
        participacaoFinal: Number((participacao * 100).toFixed(2)),
        baseCalculo: Number((eq.valor * participacao).toFixed(2)),
        comissao: Number((eq.valor * percAplicado * participacao).toFixed(2)),
      }
    }).sort((a, b) => a.certificadoraId - b.certificadoraId || b.comissao - a.comissao)

    return {
      inicio, fim,
      total: itens.length,
      valorComissao: itens.reduce((s, i) => s + i.comissao, 0),
      itens,
    }
  })

  app.get('/certificadoras', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id_certificadora AS id, descricao_certificadora AS nome
         FROM certificadora ORDER BY descricao_certificadora`).catch(() => [])
    return linhas.map((r) => ({ id: Number(r.id), nome: String(r.nome ?? '').trim() }))
  })

  /** Contadores para o seletor — só id e nome, a tela de cadastro é outra. */
  app.get('/contadores', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request) => {
    const busca = String((request.query as Record<string, string>).busca ?? '').trim()
    const cond = busca
      ? `WHERE (DESCRICAO_ESCRITORIO LIKE ? OR NOME_RESP LIKE ? OR NOME_COMERCIAL LIKE ?)`
      : ''
    const val = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`] : []
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ID_CONTADOR AS id,
              COALESCE(NULLIF(DESCRICAO_ESCRITORIO,''), NULLIF(NOME_COMERCIAL,''), NOME_RESP) AS nome,
              NOME_RESP AS responsavel, CIDADE AS cidade, CHAVE_PIX AS chavePix
         FROM contador ${cond}
        ORDER BY nome LIMIT 300`, ...val).catch(() => [])
    return linhas.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome ?? '').trim() || `Contador #${r.id}`,
      responsavel: r.responsavel ?? null,
      cidade: r.cidade ?? null,
      chavePix: r.chavePix ?? null,
    }))
  })

  /** Lançar indicação. */
  app.post('/indicacoes', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const clienteId = Number(b.clienteId ?? 0)
    const valor = Number(b.valor ?? 0)

    if (!clienteId) return reply.status(400).send({ error: 'Escolha o cliente do certificado.' })
    if (!ehData(b.dataIndicacao)) return reply.status(400).send({ error: 'Informe a data da indicação.' })
    if (!(valor > 0)) return reply.status(400).send({ error: 'Informe o valor da operação.' })

    const [cliente] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cod_cli FROM cliente WHERE cod_cli = ?`, clienteId)
    if (!cliente) return reply.status(400).send({ error: 'Cliente não encontrado no cadastro.' })

    // A comissão vem pronta ou sai do percentual — o histórico tem 10%, 25%, 40% e 50%,
    // então não há uma regra única para impor aqui.
    const percentual = Number(b.percentual ?? NaN)
    const comissao = b.comissao != null && b.comissao !== ''
      ? Number(b.comissao)
      : Number.isFinite(percentual) ? Number(((valor * percentual) / 100).toFixed(2)) : 0

    await prisma.$executeRawUnsafe(
      `INSERT INTO indicacao_contador
         (data_hora_lanc, data_indicacao, id_contador, id_cliente, tipo, valor, comissao_valor,
          id_usu_lanc, tipo_cliente, validade_certificado, id_certificadora)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.dataIndicacao,
      Number(b.contadorId ?? 0) || 0,
      clienteId,
      Number(b.tipo ?? 0) || 0,
      valor,
      comissao > 0 ? comissao : 0,
      usuarioId,
      b.tipoCliente == null || b.tipoCliente === '' ? null : String(b.tipoCliente).slice(0, 50),
      ehData(b.validadeCertificado) ? b.validadeCertificado : null,
      Number(b.certificadoraId ?? 0) || 0)

    const [novo] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
    const id = Number(novo?.id ?? 0)
    registrarAuditoria({
      tabela: 'indicacao_contador', registroId: id, acao: 'CRIACAO', usuarioId,
      dadosAntes: null, dadosDepois: { clienteId, valor, comissao, contadorId: b.contadorId ?? null },
    })
    return reply.status(201).send({ id, comissao })
  })

  app.put('/indicacoes/:id', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const b = request.body as Record<string, any>
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM indicacao_contador WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Lançamento não encontrado.' })

    const valor = b.valor == null || b.valor === '' ? num(atual.valor) : Number(b.valor)
    const percentual = Number(b.percentual ?? NaN)
    const comissao = b.comissao != null && b.comissao !== ''
      ? Number(b.comissao)
      : Number.isFinite(percentual) ? Number(((valor * percentual) / 100).toFixed(2))
        : num(atual.comissao_valor)

    await prisma.$executeRawUnsafe(
      `UPDATE indicacao_contador
          SET data_indicacao = ?, id_contador = ?, tipo = ?, valor = ?, comissao_valor = ?,
              tipo_cliente = ?, validade_certificado = ?, id_certificadora = ?
        WHERE id = ?`,
      ehData(b.dataIndicacao) ? b.dataIndicacao : atual.data_indicacao,
      b.contadorId === undefined ? atual.id_contador : (Number(b.contadorId) || 0),
      b.tipo === undefined ? atual.tipo : (Number(b.tipo) || 0),
      valor,
      comissao,
      b.tipoCliente === undefined ? atual.tipo_cliente
        : (b.tipoCliente === '' ? null : String(b.tipoCliente).slice(0, 50)),
      b.validadeCertificado === undefined ? atual.validade_certificado
        : (ehData(b.validadeCertificado) ? b.validadeCertificado : null),
      b.certificadoraId === undefined ? atual.id_certificadora : (Number(b.certificadoraId) || 0),
      id)

    registrarAuditoria({
      tabela: 'indicacao_contador', registroId: id, acao: 'ALTERACAO',
      usuarioId: Number((request.user as any)?.id || 0),
      dadosAntes: { valor: num(atual.valor), comissao: num(atual.comissao_valor) },
      dadosDepois: { valor, comissao },
    })
    return { ok: true, comissao }
  })

  app.delete('/indicacoes/:id', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM indicacao_contador WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Lançamento não encontrado.' })
    await prisma.$executeRawUnsafe(`DELETE FROM indicacao_contador WHERE id = ?`, id)
    registrarAuditoria({
      tabela: 'indicacao_contador', registroId: id, acao: 'EXCLUSAO',
      usuarioId: Number((request.user as any)?.id || 0),
      dadosAntes: {
        clienteId: atual.id_cliente, valor: num(atual.valor),
        comissao: num(atual.comissao_valor), dataIndicacao: atual.data_indicacao,
      },
      dadosDepois: null,
    })
    return { ok: true }
  })
}
