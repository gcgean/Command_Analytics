import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import {
  ensureLembretesFixos,
  TIPOS_RECORRENCIA,
  TipoRecorrencia,
  descreverRecorrencia,
  regenerarLinhasDaRegra,
  processarLembretesFixos,
} from '../utils/lembretesFixos'

function tipoValido(valor: unknown): valor is TipoRecorrencia {
  return TIPOS_RECORRENCIA.includes(String(valor) as TipoRecorrencia)
}

// Prisma devolve colunas TIME de $queryRaw como objetos Date (época 1970, horário em UTC),
// não como string "HH:MM:SS" — String(date) usa o fuso local e quebra tudo. Extrai via UTC.
function horaParaString(valor: unknown): string | null {
  if (!valor) return null
  if (valor instanceof Date) {
    const hh = String(valor.getUTCHours()).padStart(2, '0')
    const mm = String(valor.getUTCMinutes()).padStart(2, '0')
    const ss = String(valor.getUTCSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  return String(valor)
}

export async function lembretesFixosRoutes(app: FastifyInstance) {
  // ── Regras (modelo novo) ────────────────────────────────────
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Lista regras de lembrete fixo e o legado sem regra' } }, async () => {
    await ensureLembretesFixos()

    const regras = await prisma.$queryRaw<any[]>`
      SELECT R.id, R.usuario_id AS usuarioId, COALESCE(U.NOME_USUARIO_COMPLETO, U.NOME_USU) AS usuarioNome,
             R.titulo, R.mensagem, R.tipo_recorrencia AS tipoRecorrencia, R.intervalo_dias AS intervaloDias,
             R.dia_mes AS diaMes, R.dia_semana AS diaSemana, R.hora, R.somente_usuario_visualizar AS somenteUsuarioVisualizar,
             R.ativo, R.criado_em AS criadoEm
      FROM lembrete_regra R
      LEFT JOIN usuario U ON U.COD_USU = R.usuario_id
      ORDER BY R.ativo DESC, U.NOME_USUARIO_COMPLETO ASC
    `

    const legado = await prisma.$queryRaw<any[]>`
      SELECT L.cod_usu AS usuarioId, COALESCE(U.NOME_USUARIO_COMPLETO, U.NOME_USU) AS usuarioNome,
             L.Titulo AS titulo, L.Mensagem AS mensagem,
             GROUP_CONCAT(L.id ORDER BY L.id) AS ids,
             COUNT(*) AS totalDias
      FROM lembrete_dia_fixo_agenda L
      LEFT JOIN usuario U ON U.COD_USU = L.cod_usu
      WHERE L.regra_id IS NULL
      GROUP BY L.cod_usu, L.Titulo, L.Mensagem
      ORDER BY U.NOME_USUARIO_COMPLETO ASC
    `

    return {
      regras: regras.map((r) => ({
        id: Number(r.id),
        usuarioId: Number(r.usuarioId),
        usuarioNome: r.usuarioNome || `Usuário #${r.usuarioId}`,
        titulo: r.titulo,
        mensagem: r.mensagem,
        tipoRecorrencia: r.tipoRecorrencia,
        intervaloDias: r.intervaloDias === null ? null : Number(r.intervaloDias),
        diaMes: r.diaMes === null ? null : Number(r.diaMes),
        diaSemana: r.diaSemana === null ? null : Number(r.diaSemana),
        hora: horaParaString(r.hora)?.slice(0, 5) ?? null,
        somenteUsuarioVisualizar: r.somenteUsuarioVisualizar,
        ativo: Number(r.ativo) === 1,
        descricaoRecorrencia: descreverRecorrencia(r.tipoRecorrencia, r.intervaloDias, r.diaMes, r.diaSemana),
        criadoEm: r.criadoEm,
      })),
      legado: legado.map((l) => ({
        usuarioId: Number(l.usuarioId),
        usuarioNome: l.usuarioNome || `Usuário #${l.usuarioId}`,
        titulo: l.titulo,
        mensagem: l.mensagem,
        ids: String(l.ids).split(',').map(Number),
        totalDias: Number(l.totalDias),
      })),
    }
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Cria uma regra de lembrete fixo' } }, async (request, reply) => {
    await ensureLembretesFixos()
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const { usuarioId: destinatarioId, titulo, mensagem, tipoRecorrencia, intervaloDias, diaMes, diaSemana, hora, somenteUsuarioVisualizar } = request.body as Record<string, unknown>

    const idDestinatario = Number(destinatarioId)
    const tituloNorm = String(titulo ?? '').trim()
    const mensagemNorm = String(mensagem ?? '').trim()
    const horaNorm = /^\d{2}:\d{2}$/.test(String(hora ?? '')) ? `${hora}:00` : null

    if (!Number.isFinite(idDestinatario) || idDestinatario <= 0) return reply.status(400).send({ error: 'Selecione o usuário.' })
    if (!tituloNorm) return reply.status(400).send({ error: 'Informe o título.' })
    if (!mensagemNorm) return reply.status(400).send({ error: 'Informe a mensagem do lembrete.' })
    if (!tipoValido(tipoRecorrencia)) return reply.status(400).send({ error: 'Tipo de recorrência inválido.' })
    if (!horaNorm) return reply.status(400).send({ error: 'Selecione o horário do lembrete.' })

    const tipo = tipoRecorrencia as TipoRecorrencia
    const intervalo = tipo === 'A_CADA_N_DIAS' ? Number(intervaloDias) : null
    const dMes = tipo === 'DIA_MES' ? Number(diaMes) : null
    const dSemana = tipo === 'DIA_SEMANA' ? Number(diaSemana) : null

    if (tipo === 'A_CADA_N_DIAS' && (!Number.isFinite(intervalo) || (intervalo as number) < 1)) {
      return reply.status(400).send({ error: 'Informe a cada quantos dias o lembrete deve repetir.' })
    }
    if (tipo === 'DIA_MES' && (!Number.isFinite(dMes) || (dMes as number) < 1 || (dMes as number) > 31)) {
      return reply.status(400).send({ error: 'Informe um dia do mês entre 1 e 31.' })
    }
    if (tipo === 'DIA_SEMANA' && (!Number.isFinite(dSemana) || (dSemana as number) < 1 || (dSemana as number) > 7)) {
      return reply.status(400).send({ error: 'Selecione o dia da semana.' })
    }

    const somenteVisivel = somenteUsuarioVisualizar === false || somenteUsuarioVisualizar === 'N' ? 'N' : 'S'

    await prisma.$executeRaw`
      INSERT INTO lembrete_regra
        (usuario_id, titulo, mensagem, tipo_recorrencia, intervalo_dias, dia_mes, dia_semana, hora, somente_usuario_visualizar, ativo, criado_em, criado_por, atualizado_em)
      VALUES
        (${idDestinatario}, ${tituloNorm}, ${mensagemNorm}, ${tipo}, ${intervalo}, ${dMes}, ${dSemana}, ${horaNorm}, ${somenteVisivel}, 1, NOW(), ${usuarioId}, NOW())
    `
    const novo = await prisma.$queryRaw<Array<{ id: number }>>`SELECT id FROM lembrete_regra ORDER BY id DESC LIMIT 1`
    const regraId = Number(novo[0]?.id || 0)

    await regenerarLinhasDaRegra(regraId, {
      usuarioId: idDestinatario,
      titulo: tituloNorm,
      mensagem: mensagemNorm,
      tipoRecorrencia: tipo,
      intervaloDias: intervalo,
      diaMes: dMes,
      diaSemana: dSemana,
      hora: horaNorm,
      somenteUsuarioVisualizar: somenteVisivel,
    })

    await registrarAuditoria({
      tabela: 'lembrete_regra',
      registroId: regraId,
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: { usuarioId: idDestinatario, titulo: tituloNorm, mensagem: mensagemNorm, recorrencia: descreverRecorrencia(tipo, intervalo, dMes, dSemana) },
    })

    return { ok: true, id: regraId }
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Atualiza uma regra de lembrete fixo' } }, async (request, reply) => {
    await ensureLembretesFixos()
    const { id } = request.params as { id: string }
    const regraId = Number(id)
    const usuarioId = Number((request.user as any)?.id || 0) || null
    if (!Number.isFinite(regraId) || regraId <= 0) return reply.status(400).send({ error: 'Regra inválida.' })

    const atual = await prisma.$queryRaw<any[]>`SELECT * FROM lembrete_regra WHERE id = ${regraId} LIMIT 1`
    if (!atual.length) return reply.status(404).send({ error: 'Regra não encontrada.' })

    const body = request.body as Record<string, unknown>
    const idDestinatario = body.usuarioId === undefined ? Number(atual[0].usuario_id) : Number(body.usuarioId)
    const tituloNorm = body.titulo === undefined ? atual[0].titulo : String(body.titulo).trim()
    const mensagemNorm = body.mensagem === undefined ? atual[0].mensagem : String(body.mensagem).trim()
    const tipo = (body.tipoRecorrencia === undefined ? atual[0].tipo_recorrencia : body.tipoRecorrencia) as TipoRecorrencia
    const ativo = body.ativo === undefined ? Number(atual[0].ativo) === 1 : Boolean(body.ativo)
    const somenteVisivel = body.somenteUsuarioVisualizar === undefined
      ? atual[0].somente_usuario_visualizar
      : (body.somenteUsuarioVisualizar === false || body.somenteUsuarioVisualizar === 'N' ? 'N' : 'S')

    let horaNorm: string | null
    if (body.hora === undefined) {
      horaNorm = horaParaString(atual[0].hora)
    } else if (body.hora === null || body.hora === '') {
      horaNorm = null
    } else if (/^\d{2}:\d{2}$/.test(String(body.hora))) {
      horaNorm = `${body.hora}:00`
    } else {
      return reply.status(400).send({ error: 'Horário inválido.' })
    }

    if (!tituloNorm) return reply.status(400).send({ error: 'Informe o título.' })
    if (!mensagemNorm) return reply.status(400).send({ error: 'Informe a mensagem do lembrete.' })
    if (!tipoValido(tipo)) return reply.status(400).send({ error: 'Tipo de recorrência inválido.' })

    const intervalo = tipo === 'A_CADA_N_DIAS' ? Number(body.intervaloDias ?? atual[0].intervalo_dias) : null
    const dMes = tipo === 'DIA_MES' ? Number(body.diaMes ?? atual[0].dia_mes) : null
    const dSemana = tipo === 'DIA_SEMANA' ? Number(body.diaSemana ?? atual[0].dia_semana) : null

    if (tipo === 'A_CADA_N_DIAS' && (!Number.isFinite(intervalo) || (intervalo as number) < 1)) {
      return reply.status(400).send({ error: 'Informe a cada quantos dias o lembrete deve repetir.' })
    }
    if (tipo === 'DIA_MES' && (!Number.isFinite(dMes) || (dMes as number) < 1 || (dMes as number) > 31)) {
      return reply.status(400).send({ error: 'Informe um dia do mês entre 1 e 31.' })
    }
    if (tipo === 'DIA_SEMANA' && (!Number.isFinite(dSemana) || (dSemana as number) < 1 || (dSemana as number) > 7)) {
      return reply.status(400).send({ error: 'Selecione o dia da semana.' })
    }

    await prisma.$executeRaw`
      UPDATE lembrete_regra
      SET usuario_id = ${idDestinatario}, titulo = ${tituloNorm}, mensagem = ${mensagemNorm},
          tipo_recorrencia = ${tipo}, intervalo_dias = ${intervalo}, dia_mes = ${dMes}, dia_semana = ${dSemana}, hora = ${horaNorm},
          somente_usuario_visualizar = ${somenteVisivel}, ativo = ${ativo ? 1 : 0}, atualizado_em = NOW()
      WHERE id = ${regraId}
    `

    if (ativo) {
      await regenerarLinhasDaRegra(regraId, {
        usuarioId: idDestinatario,
        titulo: tituloNorm,
        mensagem: mensagemNorm,
        tipoRecorrencia: tipo,
        intervaloDias: intervalo,
        diaMes: dMes,
        diaSemana: dSemana,
        hora: horaNorm,
        somenteUsuarioVisualizar: somenteVisivel,
      })
    } else {
      // Regra desativada: remove as linhas de execução para parar de disparar, sem apagar a regra.
      await prisma.$executeRaw`DELETE FROM lembrete_dia_fixo_agenda WHERE regra_id = ${regraId}`
    }

    await registrarAuditoria({
      tabela: 'lembrete_regra',
      registroId: regraId,
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: { titulo: atual[0].titulo, mensagem: atual[0].mensagem, ativo: Number(atual[0].ativo) === 1 },
      dadosDepois: { titulo: tituloNorm, mensagem: mensagemNorm, ativo, recorrencia: descreverRecorrencia(tipo, intervalo, dMes, dSemana) },
    })

    return { ok: true }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Remove uma regra de lembrete fixo' } }, async (request, reply) => {
    await ensureLembretesFixos()
    const { id } = request.params as { id: string }
    const regraId = Number(id)
    const usuarioId = Number((request.user as any)?.id || 0) || null
    if (!Number.isFinite(regraId) || regraId <= 0) return reply.status(400).send({ error: 'Regra inválida.' })

    const atual = await prisma.$queryRaw<any[]>`SELECT * FROM lembrete_regra WHERE id = ${regraId} LIMIT 1`
    if (!atual.length) return reply.status(404).send({ error: 'Regra não encontrada.' })

    await prisma.$executeRaw`DELETE FROM lembrete_dia_fixo_agenda WHERE regra_id = ${regraId}`
    await prisma.$executeRaw`DELETE FROM lembrete_regra WHERE id = ${regraId}`

    await registrarAuditoria({
      tabela: 'lembrete_regra',
      registroId: regraId,
      acao: 'EXCLUSAO',
      usuarioId,
      dadosAntes: { titulo: atual[0].titulo, mensagem: atual[0].mensagem },
    })

    return { ok: true }
  })

  // ── Linhas legadas (sem regra) ──────────────────────────────
  app.delete('/linhas', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Remove linhas legadas (sem regra) por id' } }, async (request, reply) => {
    await ensureLembretesFixos()
    const { ids } = request.body as { ids?: number[] }
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const idsValidos = Array.isArray(ids) ? ids.map(Number).filter((v) => Number.isFinite(v) && v > 0) : []
    if (!idsValidos.length) return reply.status(400).send({ error: 'Informe ao menos um id.' })

    await prisma.$executeRawUnsafe(
      `DELETE FROM lembrete_dia_fixo_agenda WHERE regra_id IS NULL AND id IN (${idsValidos.map(() => '?').join(',')})`,
      ...idsValidos
    )

    await registrarAuditoria({
      tabela: 'lembrete_dia_fixo_agenda',
      registroId: idsValidos[0],
      acao: 'EXCLUSAO',
      usuarioId,
      dadosAntes: { ids: idsValidos },
    })

    return { ok: true, removidos: idsValidos.length }
  })

  // ── Utilitário: forçar uma checagem manual (para suporte/testes) ──
  app.post('/processar-agora', { preHandler: authMiddleware, schema: { tags: ['LembretesFixos'], summary: 'Força o processamento imediato dos lembretes de hoje' } }, async () => {
    return processarLembretesFixos()
  })
}
