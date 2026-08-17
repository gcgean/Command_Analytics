import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { getUserPermissions } from './grupos'

// Ponto de revenda da própria Cilos no legado (Command System em Delphi) — todos os
// lançamentos existentes usam esse valor, então mantemos ao criar novos pelo web.
const COD_PONTO_REVENDA_CILOS = 1

// Réplica da regra de negócio do legado (UBancoHorasExtras.pas, TFormBancodeHorasFunc.CalculaTotal):
// só débito com TIPO_FALTA nulo/0 ("Desconto de horas padrão") afeta o saldo; C sempre credita;
// faltas com/sem atestado e home office (TIPO_FALTA 1/2/3) são só registro, não mexem no saldo.
function classificar(tipoMov: string, tipoFalta: number | null): { tipo: string; afetaSaldo: boolean } {
  if (tipoMov === 'C') return { tipo: 'Hora Extra', afetaSaldo: true }
  const falta = tipoFalta ?? 0
  if (falta === 1) return { tipo: 'Falta c/ Atestado', afetaSaldo: false }
  if (falta === 2) return { tipo: 'Falta s/ Atestado', afetaSaldo: false }
  if (falta === 3) return { tipo: 'Home Office', afetaSaldo: false }
  return { tipo: 'Desconto de Horas Padrão', afetaSaldo: true }
}

function tipoParaMovFalta(tipo: string): { tipoMov: string; tipoFalta: number | null } {
  switch (tipo) {
    case 'Hora Extra': return { tipoMov: 'C', tipoFalta: null }
    case 'Falta c/ Atestado': return { tipoMov: 'D', tipoFalta: 1 }
    case 'Falta s/ Atestado': return { tipoMov: 'D', tipoFalta: 2 }
    case 'Home Office': return { tipoMov: 'D', tipoFalta: 3 }
    case 'Desconto de Horas Padrão': return { tipoMov: 'D', tipoFalta: 0 }
    default: return { tipoMov: 'D', tipoFalta: 0 }
  }
}

interface LancamentoRow {
  ID_BH: number
  COD_FUNCIONARIO: number
  funcionario: string | null
  QTD_HORAS: number
  TIPO_MOV: string
  TIPO_FALTA: number | null
  DATA_HORA_INI: Date | null
  DATA_HORA_FIN: Date | null
  DATA_HORA_LANC: Date | null
  OBS: string | null
  COD_USU_LANC: number
  lancadoPor: string | null
  qtdAnexos: number | bigint
}

export async function bancoHorasRoutes(app: FastifyInstance) {
  // GET /banco-horas — lista completa dos lançamentos (620 registros no total, sem paginação
  // necessária), com saldo acumulado por funcionário calculado seguindo a mesma regra do legado.
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Banco de Horas'] } }, async () => {
    const rows = await prisma.$queryRaw<LancamentoRow[]>`
      SELECT b.ID_BH, b.COD_FUNCIONARIO, f.NOME_USU AS funcionario,
             b.QTD_HORAS, b.TIPO_MOV, b.TIPO_FALTA,
             b.DATA_HORA_INI, b.DATA_HORA_FIN, b.DATA_HORA_LANC, b.OBS,
             b.COD_USU_LANC, l.NOME_USU AS lancadoPor,
             COALESCE(an.qtd, 0) AS qtdAnexos
      FROM banco_de_horas b
      LEFT JOIN usuario f ON f.COD_USU = b.COD_FUNCIONARIO
      LEFT JOIN usuario l ON l.COD_USU = b.COD_USU_LANC
      LEFT JOIN (
        SELECT registro_id, COUNT(*) AS qtd FROM agendamento_anexo
        WHERE tabela = 'banco_de_horas' GROUP BY registro_id
      ) an ON an.registro_id = b.ID_BH
      ORDER BY b.DATA_HORA_INI ASC, b.ID_BH ASC
    `

    const saldoAcumuladoPorFuncionario = new Map<number, number>()

    const lancamentos = rows.map((r) => {
      const { tipo, afetaSaldo } = classificar(r.TIPO_MOV, r.TIPO_FALTA)
      const horas = Number(r.QTD_HORAS ?? 0)
      const delta = afetaSaldo ? (r.TIPO_MOV === 'C' ? horas : -horas) : 0
      const saldoAnterior = saldoAcumuladoPorFuncionario.get(r.COD_FUNCIONARIO) ?? 0
      const saldoAcumulado = saldoAnterior + delta
      saldoAcumuladoPorFuncionario.set(r.COD_FUNCIONARIO, saldoAcumulado)

      return {
        id: r.ID_BH,
        funcionarioId: r.COD_FUNCIONARIO,
        funcionario: r.funcionario || `Funcionário #${r.COD_FUNCIONARIO}`,
        tipo,
        tipoMov: r.TIPO_MOV,
        tipoFalta: r.TIPO_FALTA,
        horas,
        afetaSaldo,
        dataInicio: r.DATA_HORA_INI,
        dataFim: r.DATA_HORA_FIN,
        dataLancamento: r.DATA_HORA_LANC,
        observacao: r.OBS,
        lancadoPor: r.lancadoPor,
        saldoAcumulado,
        qtdAnexos: Number(r.qtdAnexos ?? 0),
      }
    })

    // Retorna mais recente primeiro pra exibição (o acúmulo acima já foi calculado em ordem cronológica)
    lancamentos.reverse()

    return lancamentos
  })

  // POST /banco-horas — cria um novo lançamento (crédito ou débito)
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Banco de Horas'], summary: 'Lançar horas extras/faltas' } }, async (request, reply) => {
    const { funcionarioId, tipo, horas, dataInicio, dataFim, observacao } = request.body as {
      funcionarioId?: number
      tipo?: string
      horas?: number
      dataInicio?: string
      dataFim?: string
      observacao?: string
    }
    const usuarioId = Number((request.user as any)?.id || 0) || null

    const permissoes = usuarioId ? await getUserPermissions(usuarioId) : []
    if (!permissoes.includes('*') && !permissoes.includes('banco-horas-lancar')) {
      return reply.status(403).send({ error: 'Você não tem permissão para lançar ou descontar horas.' })
    }

    if (!funcionarioId) return reply.status(400).send({ error: 'Selecione o funcionário.' })
    if (!tipo) return reply.status(400).send({ error: 'Selecione o tipo de movimento.' })
    if (!horas || horas <= 0) return reply.status(400).send({ error: 'Informe a quantidade de horas.' })
    if (!dataInicio || !dataFim) return reply.status(400).send({ error: 'Informe o período (data início e fim).' })
    if (!observacao || !observacao.trim()) return reply.status(400).send({ error: 'Informe a observação.' })

    if (usuarioId === funcionarioId) {
      return reply.status(400).send({ error: 'Você não pode lançar horas para você mesmo.' })
    }

    const { tipoMov, tipoFalta } = tipoParaMovFalta(tipo)

    await prisma.$executeRaw`
      INSERT INTO banco_de_horas
        (COD_FUNCIONARIO, QTD_HORAS, TIPO_MOV, DATA_HORA_LANC, COD_USU_LANC,
         DATA_HORA_INI, DATA_HORA_FIN, ID_CLIENTE_REF, OBS, COD_PONTO_REVENDA, VALOR, TIPO_FALTA)
      VALUES
        (${funcionarioId}, ${horas}, ${tipoMov}, NOW(), ${usuarioId},
         ${dataInicio}, ${dataFim}, 0, ${observacao.trim()}, ${COD_PONTO_REVENDA_CILOS}, 0, ${tipoFalta})
    `

    const novo = await prisma.$queryRaw<Array<{ ID_BH: number }>>`
      SELECT ID_BH FROM banco_de_horas WHERE COD_FUNCIONARIO = ${funcionarioId} ORDER BY ID_BH DESC LIMIT 1
    `
    const novoId = Number(novo[0]?.ID_BH || 0)

    await registrarAuditoria({
      tabela: 'banco_de_horas',
      registroId: novoId,
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: { funcionarioId, tipo, horas, dataInicio, dataFim, observacao: observacao.trim() },
    }).catch(() => {})

    return { ok: true, id: novoId }
  })
}
