import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import path from 'path'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { baixarArquivoCommand, enviarArquivoCommand } from '../services/commandApi'

/**
 * Campanhas de mensagem exibidas aos clientes no ERP.
 *
 * Usa as MESMAS tabelas do cadastro Delphi (UCadCampanha), que continua em uso em paralelo:
 *   campanha_mensagem          — a campanha (ativa 'S'/'N', tipo_acao 0/1/2, imagem no servidor de arquivos do Command)
 *   clientes_campanha_mensagem — clientes que devem ver a campanha
 * Os formatos gravados aqui precisam continuar idênticos aos do Delphi para não quebrar o ERP.
 */

/**
 * Filtros de quem entra na campanha. Montados em um lugar so porque a listagem de
 * candidatos e o "adicionar todos" precisam enxergar exatamente o mesmo conjunto - se as
 * duas consultas divergirem, o botao adiciona gente que a tela nao mostrou.
 */
type FiltroClientes = {
  search?: string
  estado?: string
  cidade?: string
  planoId?: number | string
  classificacaoId?: number | string
  incluirInativos?: boolean
}

function condicoesClientes(f: FiltroClientes): { sql: string; valores: any[] } {
  const cond: string[] = []
  const valores: any[] = []
  if (!f.incluirInativos) cond.push("COALESCE(cl.ATIVO, 'S') = 'S'")
  const busca = String(f.search ?? '').trim()
  if (busca) {
    cond.push('(cl.NOME_FANTASIA LIKE ? OR cl.NOME_CLI LIKE ? OR cl.CNPJ_CLI LIKE ? OR CAST(cl.cod_cli AS CHAR) = ?)')
    const like = `%${busca}%`
    valores.push(like, like, like, busca)
  }
  const estado = String(f.estado ?? '').trim()
  if (estado) { cond.push('cl.ESTRES_CLI = ?'); valores.push(estado) }
  const cidade = String(f.cidade ?? '').trim()
  if (cidade) { cond.push('cl.CIDRES_CLI = ?'); valores.push(cidade) }
  const plano = Number(f.planoId ?? 0)
  if (plano > 0) { cond.push('cl.id_plano_principal = ?'); valores.push(plano) }
  const classificacao = Number(f.classificacaoId ?? 0)
  if (classificacao > 0) { cond.push('cl.COD_CLA = ?'); valores.push(classificacao) }
  return { sql: cond.length ? cond.join(' AND ') : '1=1', valores }
}

const PASTA_IMAGENS = '/CommandAnalytics/Campanhas/'
const TAMANHO_MAX = 100 // todas as colunas de texto da campanha são VARCHAR(100)
const TIPOS_ACAO = new Set([0, 1, 2]) // 0 sem ação · 1 clique no botão · 2 vídeo (clique no botão)
const EXTENSOES_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'])
const TAMANHO_MAX_IMAGEM = 10 * 1024 * 1024

type CampanhaRow = {
  id: number
  ativa: string
  titulo: string
  descricao: string
  data_inicial: Date | null
  data_final: Date | null
  nome_arquivo: string
  tipo_acao: number
  acao: string | null
  texto_botao_acao: string | null
  clientes?: bigint | number | null
}

type CampanhaPayload = {
  titulo?: string
  descricao?: string
  dataInicial?: string
  dataFinal?: string
  ativa?: boolean
  tipoAcao?: number
  acao?: string
  textoBotaoAcao?: string
  nomeArquivo?: string
}

function dataIso(value: Date | null): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : null
}

function mapCampanha(r: CampanhaRow) {
  return {
    id: Number(r.id),
    ativa: String(r.ativa).toUpperCase() === 'S',
    titulo: r.titulo,
    descricao: r.descricao,
    dataInicial: dataIso(r.data_inicial),
    dataFinal: dataIso(r.data_final),
    nomeArquivo: r.nome_arquivo,
    tipoAcao: Number(r.tipo_acao),
    acao: r.acao ?? '',
    textoBotaoAcao: r.texto_botao_acao ?? '',
    totalClientes: Number(r.clientes ?? 0),
  }
}

function isDataValida(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

function isCaminhoImagemValido(caminho: string): boolean {
  return caminho.startsWith(PASTA_IMAGENS) && !caminho.includes('..') && !caminho.includes('\\')
}

/** Valida e normaliza o corpo de criação/edição. Retorna a mensagem de erro ou os valores prontos para gravar. */
function validarPayload(body: CampanhaPayload): { erro: string } | { dados: {
  titulo: string; descricao: string; dataInicial: string; dataFinal: string; ativa: 'S' | 'N'
  tipoAcao: number; acao: string; textoBotaoAcao: string | null; nomeArquivo: string
} } {
  // O Delphi grava título e descrição em maiúsculas.
  const titulo = String(body.titulo ?? '').trim().toUpperCase()
  const descricao = String(body.descricao ?? '').trim().toUpperCase()
  const dataInicial = String(body.dataInicial ?? '').trim()
  const dataFinal = String(body.dataFinal ?? '').trim()
  const tipoAcao = Number(body.tipoAcao)
  const acao = String(body.acao ?? '').trim()
  const textoBotaoAcao = String(body.textoBotaoAcao ?? '').trim()
  const nomeArquivo = String(body.nomeArquivo ?? '').trim()

  if (!titulo) return { erro: 'Informe o título da campanha.' }
  if (!descricao) return { erro: 'Informe a descrição da campanha.' }
  if (!isDataValida(dataInicial) || !isDataValida(dataFinal)) return { erro: 'Informe as datas inicial e final.' }
  if (dataFinal < dataInicial) return { erro: 'A data final não pode ser anterior à data inicial.' }
  if (!TIPOS_ACAO.has(tipoAcao)) return { erro: 'Tipo de ação inválido.' }
  if (!nomeArquivo) return { erro: 'Envie a imagem da campanha.' }
  if (!isCaminhoImagemValido(nomeArquivo)) return { erro: 'Caminho da imagem inválido.' }
  if (tipoAcao !== 0 && !acao) return { erro: 'Informe o link da página ou do vídeo.' }
  if (tipoAcao !== 0 && !textoBotaoAcao) return { erro: 'Informe o texto do botão de ação.' }

  for (const [campo, valor] of [['Título', titulo], ['Descrição', descricao], ['Link', acao], ['Texto do botão', textoBotaoAcao], ['Imagem', nomeArquivo]] as const) {
    if (valor.length > TAMANHO_MAX) return { erro: `${campo} deve ter no máximo ${TAMANHO_MAX} caracteres.` }
  }

  return {
    dados: {
      titulo,
      descricao,
      dataInicial,
      dataFinal,
      ativa: body.ativa === false ? 'N' : 'S',
      tipoAcao,
      // `acao` é NOT NULL com default '0' na tabela; mantém esse valor quando a campanha não tem ação.
      acao: tipoAcao === 0 ? (acao || '0') : acao,
      textoBotaoAcao: textoBotaoAcao || null,
      nomeArquivo,
    },
  }
}

async function buscarCampanha(id: number): Promise<CampanhaRow | null> {
  const rows = await prisma.$queryRaw<CampanhaRow[]>`
    SELECT id, ativa, titulo, descricao, data_inicial, data_final, nome_arquivo, tipo_acao, acao, texto_botao_acao
    FROM campanha_mensagem WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

function getUsuarioId(request: any): number | null {
  return Number(request.user?.id || 0) || null
}

function parseId(value: unknown): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function nomeArquivoSeguro(original: string): string {
  const ext = path.extname(original).toLowerCase()
  const base = path.basename(original, path.extname(original))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'imagem'
  return `${base}${ext}`
}

export async function campanhasRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Listar campanhas com total de clientes vinculados' } }, async () => {
    const rows = await prisma.$queryRaw<CampanhaRow[]>`
      SELECT m.id, m.ativa, m.titulo, m.descricao, m.data_inicial, m.data_final, m.nome_arquivo, m.tipo_acao,
             m.acao, m.texto_botao_acao, COUNT(c.id) AS clientes
      FROM campanha_mensagem m
      LEFT JOIN clientes_campanha_mensagem c ON c.id_campanha = m.id
      GROUP BY m.id
      ORDER BY m.id DESC
    `
    return rows.map(mapCampanha)
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Criar campanha' } }, async (request, reply) => {
    const validacao = validarPayload(request.body as CampanhaPayload)
    if ('erro' in validacao) return reply.status(400).send({ error: validacao.erro })
    const d = validacao.dados

    const novoId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO campanha_mensagem (ativa, titulo, descricao, data_inicial, data_final, nome_arquivo, tipo_acao, acao, texto_botao_acao)
        VALUES (${d.ativa}, ${d.titulo}, ${d.descricao}, ${d.dataInicial}, ${d.dataFinal}, ${d.nomeArquivo}, ${d.tipoAcao}, ${d.acao}, ${d.textoBotaoAcao})
      `
      const [row] = await tx.$queryRaw<Array<{ id: bigint | number }>>`SELECT LAST_INSERT_ID() AS id`
      return Number(row?.id ?? 0)
    })

    registrarAuditoria({ tabela: 'campanha_mensagem', registroId: novoId, acao: 'CRIACAO', usuarioId: getUsuarioId(request), dadosAntes: null, dadosDepois: d })
    return reply.status(201).send({ id: novoId })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Editar campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const antes = await buscarCampanha(id)
    if (!antes) return reply.status(404).send({ error: 'Campanha não encontrada.' })

    const validacao = validarPayload(request.body as CampanhaPayload)
    if ('erro' in validacao) return reply.status(400).send({ error: validacao.erro })
    const d = validacao.dados

    await prisma.$executeRaw`
      UPDATE campanha_mensagem
      SET ativa = ${d.ativa}, titulo = ${d.titulo}, descricao = ${d.descricao}, data_inicial = ${d.dataInicial},
          data_final = ${d.dataFinal}, nome_arquivo = ${d.nomeArquivo}, tipo_acao = ${d.tipoAcao}, acao = ${d.acao},
          texto_botao_acao = ${d.textoBotaoAcao}
      WHERE id = ${id}
    `
    const dadosAntes = {
      titulo: antes.titulo, descricao: antes.descricao, dataInicial: dataIso(antes.data_inicial), dataFinal: dataIso(antes.data_final),
      ativa: String(antes.ativa).toUpperCase(), tipoAcao: Number(antes.tipo_acao), acao: antes.acao ?? '',
      textoBotaoAcao: antes.texto_botao_acao ?? null, nomeArquivo: antes.nome_arquivo,
    }
    registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'ALTERACAO', usuarioId: getUsuarioId(request), dadosAntes, dadosDepois: d })
    return { ok: true }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Ativar/inativar campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const antes = await buscarCampanha(id)
    if (!antes) return reply.status(404).send({ error: 'Campanha não encontrada.' })

    const novaAtiva = String(antes.ativa).toUpperCase() === 'S' ? 'N' : 'S'
    await prisma.$executeRaw`UPDATE campanha_mensagem SET ativa = ${novaAtiva} WHERE id = ${id}`
    registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'STATUS', usuarioId: getUsuarioId(request), dadosAntes: { ativa: antes.ativa }, dadosDepois: { ativa: novaAtiva } })
    return { ok: true, ativa: novaAtiva === 'S' }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Excluir campanha e seus vínculos de clientes' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const antes = await buscarCampanha(id)
    if (!antes) return reply.status(404).send({ error: 'Campanha não encontrada.' })

    await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM clientes_campanha_mensagem WHERE id_campanha = ${id}`,
      prisma.$executeRaw`DELETE FROM campanha_mensagem WHERE id = ${id}`,
    ])
    registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'EXCLUSAO', usuarioId: getUsuarioId(request), dadosAntes: mapCampanha(antes), dadosDepois: null })
    return reply.status(204).send()
  })

  // ─── Imagem (servidor de arquivos do Command, o mesmo usado pelo Delphi e lido pelo ERP) ───

  app.post('/imagem', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Enviar imagem da campanha' } }, async (request, reply) => {
    const arquivo = (await request.file()) as MultipartFile | undefined
    if (!arquivo) return reply.status(400).send({ error: 'Selecione uma imagem.' })

    const ext = path.extname(String(arquivo.filename || '')).toLowerCase()
    if (!EXTENSOES_IMAGEM.has(ext)) {
      return reply.status(400).send({ error: 'Formato não suportado. Use PNG, JPG, GIF, BMP ou WEBP.' })
    }

    const conteudo = await arquivo.toBuffer()
    if (conteudo.length > TAMANHO_MAX_IMAGEM) return reply.status(400).send({ error: 'Imagem maior que 10 MB.' })

    try {
      const caminho = await enviarArquivoCommand(`${PASTA_IMAGENS}${nomeArquivoSeguro(arquivo.filename)}`, conteudo)
      return { caminho }
    } catch (err: any) {
      request.log.error({ err }, 'Falha ao enviar imagem de campanha')
      return reply.status(502).send({ error: 'Não foi possível enviar a imagem ao servidor de arquivos.' })
    }
  })

  app.get('/imagem', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Visualizar imagem da campanha' } }, async (request, reply) => {
    const caminho = String((request.query as { caminho?: string }).caminho ?? '').trim()
    if (!isCaminhoImagemValido(caminho)) return reply.status(400).send({ error: 'Caminho da imagem inválido.' })

    try {
      const conteudo = await baixarArquivoCommand(caminho)
      const ext = path.extname(caminho).toLowerCase()
      const tipo = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg'
      return reply.header('Cache-Control', 'private, max-age=3600').type(tipo).send(conteudo)
    } catch {
      return reply.status(404).send({ error: 'Imagem não encontrada.' })
    }
  })

  // ─── Clientes da campanha ───

  app.get('/:id/clientes', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Clientes vinculados à campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const { search, page, limit } = request.query as { search?: string; page?: string; limit?: string }
    const pagina = Math.max(1, Number(page) || 1)
    const tamanho = Math.min(200, Math.max(1, Number(limit) || 50))
    const busca = String(search ?? '').trim()
    const like = `%${busca}%`

    const filtro = busca
      ? prisma.$queryRaw<Array<{ total: bigint | number }>>`
          SELECT COUNT(*) AS total FROM clientes_campanha_mensagem c
          LEFT JOIN cliente cl ON cl.cod_cli = c.id_cliente
          WHERE c.id_campanha = ${id} AND (cl.NOME_FANTASIA LIKE ${like} OR cl.NOME_CLI LIKE ${like} OR cl.CNPJ_CLI LIKE ${like} OR CAST(c.id_cliente AS CHAR) = ${busca})`
      : prisma.$queryRaw<Array<{ total: bigint | number }>>`SELECT COUNT(*) AS total FROM clientes_campanha_mensagem WHERE id_campanha = ${id}`

    const dadosQuery = busca
      ? prisma.$queryRaw<any[]>`
          SELECT c.id_cliente AS clienteId, cl.NOME_FANTASIA AS nomeFantasia, cl.NOME_CLI AS nome, cl.CNPJ_CLI AS cnpj,
                 cl.ATIVO AS ativo, c.visualizada
          FROM clientes_campanha_mensagem c
          LEFT JOIN cliente cl ON cl.cod_cli = c.id_cliente
          WHERE c.id_campanha = ${id} AND (cl.NOME_FANTASIA LIKE ${like} OR cl.NOME_CLI LIKE ${like} OR cl.CNPJ_CLI LIKE ${like} OR CAST(c.id_cliente AS CHAR) = ${busca})
          ORDER BY COALESCE(cl.NOME_FANTASIA, cl.NOME_CLI) ASC
          LIMIT ${tamanho} OFFSET ${(pagina - 1) * tamanho}`
      : prisma.$queryRaw<any[]>`
          SELECT c.id_cliente AS clienteId, cl.NOME_FANTASIA AS nomeFantasia, cl.NOME_CLI AS nome, cl.CNPJ_CLI AS cnpj,
                 cl.ATIVO AS ativo, c.visualizada
          FROM clientes_campanha_mensagem c
          LEFT JOIN cliente cl ON cl.cod_cli = c.id_cliente
          WHERE c.id_campanha = ${id}
          ORDER BY COALESCE(cl.NOME_FANTASIA, cl.NOME_CLI) ASC
          LIMIT ${tamanho} OFFSET ${(pagina - 1) * tamanho}`

    const [[{ total } = { total: 0 }], rows] = await Promise.all([filtro, dadosQuery])
    return {
      total: Number(total ?? 0),
      page: pagina,
      limit: tamanho,
      data: rows.map((r) => ({
        clienteId: Number(r.clienteId),
        nome: String(r.nomeFantasia || r.nome || `Cliente #${r.clienteId}`).trim(),
        razaoSocial: r.nome ?? null,
        cnpj: r.cnpj ?? null,
        ativo: String(r.ativo ?? '').toUpperCase() === 'S',
        visualizada: String(r.visualizada ?? '').toUpperCase() === 'S',
      })),
    }
  })

  /** Opcoes dos filtros, tiradas da propria base - lista fixa envelhece. */
  app.get('/opcoes-clientes', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Opções de estado, cidade, plano e classificação' } }, async (request) => {
    const { estado } = request.query as { estado?: string }
    const uf = String(estado ?? '').trim()

    const [estados, cidades, planos, classificacoes] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT ESTRES_CLI AS uf FROM cliente
          WHERE ESTRES_CLI IS NOT NULL AND TRIM(ESTRES_CLI) <> '' ORDER BY ESTRES_CLI`),
      uf
        ? prisma.$queryRawUnsafe<any[]>(
            `SELECT DISTINCT CIDRES_CLI AS cidade FROM cliente
              WHERE ESTRES_CLI = ? AND CIDRES_CLI IS NOT NULL AND TRIM(CIDRES_CLI) <> ''
              ORDER BY CIDRES_CLI`, uf)
        : Promise.resolve([] as any[]),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, descricao FROM planos WHERE ativo = 1 ORDER BY descricao`),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COD_CLA AS id, NOME_CLA AS nome FROM classif_cliente ORDER BY NOME_CLA`),
    ])

    return {
      estados: estados.map((e) => String(e.uf).trim()).filter(Boolean),
      cidades: cidades.map((c) => String(c.cidade).trim()).filter(Boolean),
      planos: planos.map((p) => ({ id: Number(p.id), descricao: String(p.descricao ?? '') })),
      classificacoes: classificacoes
        .filter((c) => String(c.nome ?? '').trim())
        .map((c) => ({ id: Number(c.id), nome: String(c.nome).trim() })),
    }
  })

  /**
   * Candidatos a entrar na campanha: quem casa com os filtros e ainda nao esta vinculado.
   * O total vem do banco, nao da pagina - e o numero que o botao "adicionar todos" promete.
   */
  app.get('/:id/clientes-disponiveis', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Clientes que ainda podem entrar na campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const q = request.query as Record<string, string>
    const pagina = Math.max(1, Number(q.page) || 1)
    const tamanho = Math.min(100, Math.max(1, Number(q.limit) || 20))
    const { sql, valores } = condicoesClientes({
      search: q.search, estado: q.estado, cidade: q.cidade,
      planoId: q.planoId, classificacaoId: q.classificacaoId,
      incluirInativos: q.incluirInativos === 'true',
    })
    const where = `${sql} AND NOT EXISTS (
      SELECT 1 FROM clientes_campanha_mensagem x WHERE x.id_campanha = ? AND x.id_cliente = cl.cod_cli)`

    const [contagem, linhas] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS total FROM cliente cl WHERE ${where}`, ...valores, id),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT cl.cod_cli AS id, cl.NOME_FANTASIA AS fantasia, cl.NOME_CLI AS nome,
                cl.CNPJ_CLI AS cnpj, cl.CIDRES_CLI AS cidade, cl.ESTRES_CLI AS uf, cl.ATIVO AS ativo
           FROM cliente cl WHERE ${where}
          ORDER BY COALESCE(cl.NOME_FANTASIA, cl.NOME_CLI)
          LIMIT ${tamanho} OFFSET ${(pagina - 1) * tamanho}`, ...valores, id),
    ])

    return {
      total: Number(contagem[0]?.total ?? 0),
      page: pagina,
      limit: tamanho,
      data: linhas.map((r) => ({
        id: Number(r.id),
        nome: String(r.fantasia || r.nome || `Cliente #${r.id}`).trim(),
        cnpj: r.cnpj ?? null,
        cidade: r.cidade ?? null,
        uf: r.uf ?? null,
        ativo: String(r.ativo ?? 'S').toUpperCase() === 'S',
      })),
    }
  })

  app.post('/:id/clientes', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Adicionar clientes à campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    if (!(await buscarCampanha(id))) return reply.status(404).send({ error: 'Campanha não encontrada.' })

    const { clienteIds, todosAtivos, filtros } = request.body as {
      clienteIds?: number[]; todosAtivos?: boolean; filtros?: FiltroClientes
    }

    // visualizada = 'S' replica 100% dos vínculos gravados pelo Delphi; não criar vínculo duplicado.
    let adicionados = 0
    if (todosAtivos || filtros) {
      // Os filtros vao para o banco, nao para a pagina: "adicionar todos" significa todos os
      // que a listagem encontrou, e nao so os que couberam na tela.
      const { sql, valores } = condicoesClientes(filtros ?? {})
      adicionados = await prisma.$executeRawUnsafe(
        `INSERT INTO clientes_campanha_mensagem (id_campanha, id_cliente, visualizada)
         SELECT ?, cl.cod_cli, 'S' FROM cliente cl
          WHERE ${sql}
            AND NOT EXISTS (SELECT 1 FROM clientes_campanha_mensagem x
                             WHERE x.id_campanha = ? AND x.id_cliente = cl.cod_cli)`,
        id, ...valores, id)
    } else {
      const ids = Array.from(new Set((clienteIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)))
      if (!ids.length) return reply.status(400).send({ error: 'Selecione ao menos um cliente.' })
      for (const clienteId of ids) {
        adicionados += await prisma.$executeRaw`
          INSERT INTO clientes_campanha_mensagem (id_campanha, id_cliente, visualizada)
          SELECT ${id}, cl.cod_cli, 'S' FROM cliente cl
          WHERE cl.cod_cli = ${clienteId}
            AND NOT EXISTS (SELECT 1 FROM clientes_campanha_mensagem x WHERE x.id_campanha = ${id} AND x.id_cliente = ${clienteId})
        `
      }
    }

    if (adicionados > 0) {
      registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'ALTERACAO', usuarioId: getUsuarioId(request), dadosAntes: null, dadosDepois: { clientesAdicionados: adicionados, todosAtivos: Boolean(todosAtivos), filtros: filtros ?? null } })
    }
    return { ok: true, adicionados }
  })

  app.delete('/:id/clientes', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Remover todos os clientes da campanha' } }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'ID inválido.' })
    const removidos = await prisma.$executeRaw`DELETE FROM clientes_campanha_mensagem WHERE id_campanha = ${id}`
    if (removidos > 0) {
      registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'ALTERACAO', usuarioId: getUsuarioId(request), dadosAntes: { clientesRemovidos: removidos }, dadosDepois: null })
    }
    return { ok: true, removidos }
  })

  app.delete('/:id/clientes/:clienteId', { preHandler: authMiddleware, schema: { tags: ['Campanhas'], summary: 'Remover cliente da campanha' } }, async (request, reply) => {
    const params = request.params as { id: string; clienteId: string }
    const id = parseId(params.id)
    const clienteId = parseId(params.clienteId)
    if (!id || !clienteId) return reply.status(400).send({ error: 'Parâmetros inválidos.' })
    await prisma.$executeRaw`DELETE FROM clientes_campanha_mensagem WHERE id_campanha = ${id} AND id_cliente = ${clienteId}`
    registrarAuditoria({ tabela: 'campanha_mensagem', registroId: id, acao: 'ALTERACAO', usuarioId: getUsuarioId(request), dadosAntes: { clienteRemovido: clienteId }, dadosDepois: null })
    return reply.status(204).send()
  })
}
