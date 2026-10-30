import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { getUserPermissions } from './grupos'

/**
 * Lançamentos de comissão — o que a tela Delphi UComissoes faz.
 *
 * Usa as MESMAS tabelas do Delphi, que segue em uso em paralelo:
 *   cliente_log_plano       — toda mudança de plano/módulo do cliente (origem do que comissionar)
 *   comissoes_funcionario   — o lançamento em si; cliente_log_plano.id_comissao fecha o vínculo
 *
 * Esse par é o que impede comissionar a mesma venda duas vezes: enquanto id_comissao for NULL
 * a movimentação está em aberto; ao comissionar, ela sai da lista. É por isso que criar e
 * excluir lançamento andam sempre em transação — gravar um sem o outro deixaria venda órfã
 * (nunca mais comissionável) ou duplicada.
 */

/** Clientes internos/de teste que o Delphi exclui da base de comissão. */
const CLIENTES_IGNORADOS = [1, 6, 7, 8]
const LIMITE_COD_CLI = 10000000

/**
 * Percentual sobre o valor base. Regra do Delphi: TEF e Delivery-Faturamento pagam metade,
 * porque boa parte da receita vai para o fornecedor.
 */
const PERC_REDUZIDO = 25
const PERC_PADRAO = 50
export function percentualDoPlano(descricaoPlano: string | null | undefined): number {
  const d = String(descricaoPlano ?? '').trim().toLowerCase()
  return d.includes('delivery - faturamento') || d.includes('tef') ? PERC_REDUZIDO : PERC_PADRAO
}

const hoje = () => new Date().toISOString().slice(0, 10)
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`
const periodo = (q: Record<string, string>) => ({
  inicio: /^\d{4}-\d{2}-\d{2}$/.test(q.inicio ?? '') ? q.inicio : primeiroDoMes(),
  fim: /^\d{4}-\d{2}-\d{2}$/.test(q.fim ?? '') ? q.fim : hoje(),
})

const num = (v: any) => (v == null ? 0 : Number(v))

/**
 * Movimentações de plano ainda não comissionadas. Tradução direta do SQL do Delphi —
 * o `GROUP BY 1,2` do original agrupava por id (chave única), então era no-op e saiu.
 */
const SQL_PENDENTES = `
SELECT d1.id, d1.descricao_acao, d1.cod_cli, d1.nome_cli, d1.nome_fantasia_cli, d1.cnpj_cli,
       d1.tipo, d1.desc_tipo, d1.desc_plano_atual, d1.desc_plano_anterior,
       d1.valor_assinatura_anterior, d1.valor_assinatura_atual, d1.data_hora,
       d1.nome_usuario, d1.valor_total_plano_atual, d1.valor_total_plano_anterior,
       (d1.valor_assinatura_atual - d1.valor_assinatura_anterior) AS valor_base_para_comissao
  FROM (
    SELECT CONCAT(COALESCE(logcli.desc_tipo, ''), ' de ',
                  COALESCE(logcli.desc_tipo_inclusao_alteracao_remocao, '')) AS descricao_acao,
           logcli.*
      FROM (
        SELECT clp.id, clp.id_cli AS cod_cli, c.NOME_CLI AS nome_cli,
               c.NOME_FANTASIA AS nome_fantasia_cli, c.CNPJ_CLI AS cnpj_cli,
               clp.data_hora, clp.tipo, clp.nome_usuario,
               CASE COALESCE(clp.tipo, 0)
                    WHEN 0 THEN 'Inclusão' WHEN 1 THEN 'Alteração' WHEN 2 THEN 'Remoção'
                    ELSE '' END AS desc_tipo,
               CASE COALESCE(clp.tipo, 0)
                    WHEN 0 THEN (CASE COALESCE(patu.modulo, false) WHEN true THEN 'Módulo' ELSE 'Plano' END)
                    ELSE (CASE COALESCE(pant.modulo, false) WHEN true THEN 'Módulo' ELSE 'Plano' END)
               END AS desc_tipo_inclusao_alteracao_remocao,
               pant.descricao AS desc_plano_anterior,
               patu.descricao AS desc_plano_atual,
               clp.valor_total_plano_anterior, clp.valor_total_plano_atual,
               clp.valor_assinatura_anterior, clp.valor_assinatura_atual
          FROM cliente_log_plano clp
          INNER JOIN cliente c ON clp.id_cli = c.cod_cli
          LEFT JOIN planos pant ON clp.id_plano_anterior = pant.id
          LEFT JOIN planos patu ON clp.id_plano_atual = patu.id
         WHERE CAST(clp.data_hora AS DATE) BETWEEN ? AND ?
           AND ((COALESCE(clp.valor_total_plano_atual, 0) > 0 AND clp.tipo IN (0, 1))
             OR (COALESCE(clp.valor_total_plano_atual, 0) <= 0 AND clp.tipo = 2))
           AND clp.id_cli NOT IN (${CLIENTES_IGNORADOS.join(',')})
           AND clp.id_cli < ${LIMITE_COD_CLI}
           AND c.ATIVO = 'S'
           AND clp.id_comissao IS NULL
         ORDER BY clp.id) logcli) AS d1
 WHERE d1.descricao_acao <> 'Inclusão de Plano'
   AND d1.desc_tipo <> 'Remoção'`

/** Vincular e excluir mexem em dinheiro: ver a tela não basta. */
async function exigirPermissaoDeLancamento(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = Number((request.user as any)?.id || 0)
  const permissoes = await getUserPermissions(usuarioId)
  if (!permissoes.includes('*') && !permissoes.includes('comissoes-lancar')) {
    return reply.status(403).send({ error: 'Você não tem permissão para lançar ou excluir comissões.' })
  }
}

export async function comissoesLancamentosRoutes(app: FastifyInstance) {
  /** Lançamentos no período (aba Listagem). */
  app.get('/lancamentos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)
    const { colaboradorId } = request.query as Record<string, string>
    const cond: string[] = ['CAST(co.data_venda AS DATE) BETWEEN ? AND ?']
    const val: any[] = [inicio, fim]
    if (Number(colaboradorId) > 0) { cond.push('co.cod_func = ?'); val.push(Number(colaboradorId)) }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT co.id, co.cod_func, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome_usu,
              co.descricao, co.cod_cli, COALESCE(c.NOME_FANTASIA, c.NOME_CLI) AS nome_cliente,
              co.valor_comissao, co.Valor_operacao, co.data_venda
         FROM comissoes_funcionario co
         INNER JOIN usuario u ON co.cod_func = u.COD_USU
         INNER JOIN cliente c ON c.cod_cli = co.cod_cli
        WHERE ${cond.join(' AND ')}
        ORDER BY co.data_venda DESC, co.id DESC`, ...val)

    const itens = linhas.map((r) => ({
      id: Number(r.id),
      colaboradorId: r.cod_func == null ? null : Number(r.cod_func),
      colaboradorNome: String(r.nome_usu ?? '').trim(),
      clienteId: r.cod_cli == null ? null : Number(r.cod_cli),
      clienteNome: String(r.nome_cliente ?? '').trim(),
      descricao: r.descricao ?? null,
      valor: num(r.valor_comissao),
      valorOperacao: num(r.Valor_operacao),
      dataVenda: r.data_venda ?? null,
    }))
    return {
      inicio, fim,
      total: itens.reduce((s, i) => s + i.valor, 0),
      totalOperacao: itens.reduce((s, i) => s + i.valorOperacao, 0),
      itens,
    }
  })

  /** Movimentações de plano ainda sem comissão (aba Vincular). */
  app.get('/pendentes', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `${SQL_PENDENTES} ORDER BY d1.data_hora DESC, d1.id DESC`, inicio, fim)

    const itens = linhas.map((r) => {
      const base = num(r.valor_base_para_comissao)
      return {
        id: Number(r.id),
        acao: String(r.descricao_acao ?? '').trim(),
        tipo: r.tipo == null ? null : Number(r.tipo),
        descTipo: r.desc_tipo ?? null,
        clienteId: Number(r.cod_cli),
        clienteNome: String(r.nome_fantasia_cli || r.nome_cli || '').trim(),
        razaoSocial: r.nome_cli ?? null,
        cnpj: r.cnpj_cli ?? null,
        planoAtual: r.desc_plano_atual ?? null,
        planoAnterior: r.desc_plano_anterior ?? null,
        assinaturaAnterior: num(r.valor_assinatura_anterior),
        assinaturaAtual: num(r.valor_assinatura_atual),
        valorBase: base,
        // A tela mostra antes de gravar: ninguém deveria descobrir o valor só depois.
        percentual: percentualDoPlano(r.desc_plano_atual),
        valorComissao: Number(((base * percentualDoPlano(r.desc_plano_atual)) / 100).toFixed(2)),
        dataHora: r.data_hora ?? null,
        lancadoPor: r.nome_usuario ?? null,
        comissionavel: base > 0,
      }
    })
    return {
      inicio, fim,
      total: itens.length,
      comissionaveis: itens.filter((i) => i.comissionavel).length,
      valorBaseTotal: itens.reduce((s, i) => s + (i.comissionavel ? i.valorBase : 0), 0),
      itens,
    }
  })

  /** Ranking de vendas no período. */
  app.get('/ranking', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)
    // A posição sai do próprio período. No Delphi ela comparava o total do período com o
    // total histórico, e dava posição que não correspondia à lista exibida.
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT co.cod_func, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome_usu,
              SUM(co.valor_comissao) AS total_comissao,
              SUM(co.Valor_operacao) AS total_operacao,
              COUNT(*) AS vendas
         FROM comissoes_funcionario co
         INNER JOIN usuario u ON u.COD_USU = co.cod_func
        WHERE CAST(co.data_venda AS DATE) BETWEEN ? AND ?
        GROUP BY co.cod_func, nome_usu
        ORDER BY total_comissao DESC`, inicio, fim)

    return {
      inicio, fim,
      itens: linhas.map((r, i) => ({
        posicao: i + 1,
        colaboradorId: Number(r.cod_func),
        colaboradorNome: String(r.nome_usu ?? '').trim(),
        total: num(r.total_comissao),
        totalOperacao: num(r.total_operacao),
        vendas: Number(r.vendas ?? 0),
      })),
    }
  })

  /** Ranking dos treinamentos: nota média e quantidade por colaborador, no período. */
  app.get('/treinamentos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { inicio, fim } = periodo(request.query as Record<string, string>)
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(o.NOME_USUARIO_COMPLETO, o.NOME_USU) AS colaborador,
              a.cod_colaborador,
              AVG(a.Nota) AS media_nota,
              COUNT(a.Nota) AS qtd_treinamentos
         FROM agenda a
         LEFT JOIN usuario o ON o.COD_USU = a.cod_colaborador
        WHERE a.cod_agenda > 0
          AND COALESCE(a.Nota, 0) > 0
          AND a.data_agendamento BETWEEN ? AND ?
        GROUP BY a.cod_colaborador, colaborador
        ORDER BY COUNT(a.Nota) DESC, AVG(a.Nota) DESC`, inicio, fim)

    return {
      inicio, fim,
      itens: linhas.map((r) => ({
        colaboradorId: r.cod_colaborador == null ? null : Number(r.cod_colaborador),
        colaborador: String(r.colaborador ?? 'Sem colaborador').trim(),
        mediaNota: Number(num(r.media_nota).toFixed(2)),
        quantidade: Number(r.qtd_treinamentos ?? 0),
      })),
    }
  })

  /** Colaboradores que podem receber comissão (ativos do ponto de revenda). */
  app.get('/colaboradores', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome
         FROM usuario u
        WHERE COALESCE(u.ATIVO, 'S') = 'S'
        ORDER BY nome`)
    return linhas.map((r) => ({ id: Number(r.id), nome: String(r.nome ?? '').trim() }))
  })

  /**
   * Vincula a movimentação a um colaborador, criando o lançamento. O id_comissao gravado de
   * volta no log é o que tira a venda da lista de pendentes — por isso os dois passos são uma
   * transação só.
   */
  app.post('/lancamentos', { preHandler: [authMiddleware, exigirPermissaoDeLancamento], schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as { logId?: number; colaboradorId?: number; percentual?: number }
    const logId = Number(b.logId ?? 0)
    const colaboradorId = Number(b.colaboradorId ?? 0)
    if (!logId || !colaboradorId) {
      return reply.status(400).send({ error: 'Informe a movimentação e o colaborador.' })
    }

    const [log] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT clp.id, clp.id_cli, clp.data_hora, clp.id_comissao,
              clp.valor_assinatura_atual, clp.valor_assinatura_anterior,
              patu.descricao AS desc_plano_atual
         FROM cliente_log_plano clp
         LEFT JOIN planos patu ON clp.id_plano_atual = patu.id
        WHERE clp.id = ?`, logId)
    if (!log) return reply.status(404).send({ error: 'Movimentação não encontrada.' })
    if (log.id_comissao != null) {
      return reply.status(400).send({ error: 'Esta movimentação já foi comissionada.' })
    }

    const base = num(log.valor_assinatura_atual) - num(log.valor_assinatura_anterior)
    if (base <= 0) {
      return reply.status(400).send({ error: 'O valor base para comissão é menor ou igual a zero.' })
    }

    const [colaborador] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COD_USU FROM usuario WHERE COD_USU = ?`, colaboradorId)
    if (!colaborador) return reply.status(400).send({ error: 'Colaborador não encontrado.' })

    // O percentual pode ser ajustado na tela, mas o padrão continua sendo a regra do Delphi.
    const percentual = Number(b.percentual ?? NaN)
    const perc = Number.isFinite(percentual) && percentual > 0 && percentual <= 100
      ? percentual
      : percentualDoPlano(log.desc_plano_atual)
    const valor = Number(((base * perc) / 100).toFixed(2))
    const descricao = String(log.desc_plano_atual ?? '').slice(0, 100)

    const comissaoId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO comissoes_funcionario
           (cod_func, valor_comissao, descricao, cod_cli, data_venda, Valor_operacao)
         VALUES (?,?,?,?,?,?)`,
        colaboradorId, valor, descricao, Number(log.id_cli), log.data_hora, base)
      const [novo] = await tx.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
      const id = Number(novo?.id ?? 0)
      if (!id) throw new Error('Não foi possível obter o id do lançamento.')
      await tx.$executeRawUnsafe(
        `UPDATE cliente_log_plano SET id_comissao = ? WHERE id = ? AND id_comissao IS NULL`,
        id, logId)
      return id
    })

    registrarAuditoria({
      tabela: 'comissoes_funcionario', registroId: comissaoId, acao: 'CRIACAO',
      usuarioId: Number((request.user as any)?.id || 0), dadosAntes: null,
      dadosDepois: { logId, colaboradorId, percentual: perc, valor, valorBase: base },
    })
    return reply.status(201).send({ id: comissaoId, valor, percentual: perc })
  })

  /** Exclui o lançamento e devolve a movimentação para a lista de pendentes. */
  app.delete('/lancamentos/:id', { preHandler: [authMiddleware, exigirPermissaoDeLancamento], schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM comissoes_funcionario WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Lançamento não encontrado.' })

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE cliente_log_plano SET id_comissao = NULL WHERE id_comissao = ?`, id)
      await tx.$executeRawUnsafe(`DELETE FROM comissoes_funcionario WHERE id = ?`, id)
    })

    registrarAuditoria({
      tabela: 'comissoes_funcionario', registroId: id, acao: 'EXCLUSAO',
      usuarioId: Number((request.user as any)?.id || 0),
      dadosAntes: {
        colaboradorId: atual.cod_func, clienteId: atual.cod_cli,
        descricao: atual.descricao, valor: num(atual.valor_comissao),
      },
      dadosDepois: null,
    })
    return { ok: true }
  })
}
