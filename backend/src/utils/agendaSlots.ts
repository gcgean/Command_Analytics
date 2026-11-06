import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'

/**
 * Cálculo dos horários livres de um técnico.
 *
 * Vivia dentro da rota `GET /agenda/slots`, que era o único consumidor. Com a API de
 * integração passou a haver um segundo, e duplicar esta conta significaria duas verdades
 * sobre o que é "horário livre" — a tela mostrando um horário e a integração agendando em
 * cima de outra coisa.
 *
 * A ordem das regras importa: a janela do dia vem da configuração por dia da semana quando
 * existe, e cai para a configuração base quando não existe ou vem inválida; o intervalo de
 * almoço corta; e por fim agenda principal, agendamentos programados e bloqueios ocupam.
 */

export const MIN_DURACAO_PROCEDIMENTO = 15

/** Máximo de dias por consulta: sem o corte, um intervalo errado varre o banco inteiro. */
const MAX_DIAS_INTERVALO = 31

export function parseDiasSemanaCsv(raw: any): number[] {
  return String(raw ?? '')
    .split(',')
    .map((n) => Number(String(n).trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
}

export function parseTimeToMinutes(value: any): number | null {
  if (!value) return null
  const asStr = value instanceof Date
    ? `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
    : String(value).substring(0, 5)
  const [h, m] = asStr.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function overlapsRange(
  targetIni: number, targetFim: number, otherIni: number, otherFim: number,
): boolean {
  return targetIni < otherFim && targetFim > otherIni
}

export interface SlotsDoTecnico {
  tecnicoId: number
  tecnicoNome: string
  data: string
  slotsDisponiveis: string[]
  slotsOcupados: string[]
  slotMotivos: Record<string, string>
}

export interface ResultadoSlots {
  ok: boolean
  erro?: string
  /** Duração do procedimento usada no cálculo, em minutos. */
  duracaoMin?: number
  itens: SlotsDoTecnico[]
}

export async function calcularSlots(params: {
  procedimentoId: number | string | undefined
  tecnicoId?: number | string | null
  dataInicio?: string
  dataFim?: string
}): Promise<ResultadoSlots> {
  const startStr = params.dataInicio
  const endStr = params.dataFim || startStr
  const tecnicoId = params.tecnicoId ? Number(params.tecnicoId) : null
  const procedimentoId = Number(params.procedimentoId ?? 0)

  if (!startStr) return { ok: false, erro: 'Data é obrigatória', itens: [] }
  if (!procedimentoId) {
    return { ok: false, erro: 'Procedimento é obrigatório para calcular os horários disponíveis.', itens: [] }
  }

  const procedimentoRows: any[] = await prisma.$queryRaw`
    SELECT id, nome, duracao_min, ativo
    FROM cadastro_procedimentos
    WHERE id = ${procedimentoId}
    LIMIT 1
  `
  if (!procedimentoRows.length || Number(procedimentoRows[0].ativo) !== 1) {
    return { ok: false, erro: 'Procedimento inválido ou inativo.', itens: [] }
  }
  const duracaoProcedimento = Math.max(
    MIN_DURACAO_PROCEDIMENTO, Number(procedimentoRows[0].duracao_min ?? 0))

  const procedimentoTecnicosRows: Array<{ tecnicoId: number }> = await prisma.$queryRaw`
    SELECT cod_tecnico AS tecnicoId
    FROM cadastro_procedimentos_tecnicos
    WHERE procedimento_id = ${procedimentoId}
  `
  const procedimentoTecnicosIds = Array.from(new Set(
    procedimentoTecnicosRows
      .map((row) => Number(row.tecnicoId))
      .filter((id) => Number.isFinite(id) && id > 0)))

  // Técnico pedido que não faz o procedimento: nenhum horário, e não é erro.
  if (tecnicoId && procedimentoTecnicosIds.length > 0 && !procedimentoTecnicosIds.includes(tecnicoId)) {
    return { ok: true, duracaoMin: duracaoProcedimento, itens: [] }
  }

  const dates: string[] = []
  const dStart = new Date(startStr + 'T12:00:00')
  const dEnd = new Date(endStr + 'T12:00:00')
  const current = new Date(dStart)
  let limite = 0
  while (current <= dEnd && limite < MAX_DIAS_INTERVALO) {
    dates.push(current.toISOString().substring(0, 10))
    current.setDate(current.getDate() + 1)
    limite++
  }

  const dispConds: Prisma.Sql[] = [Prisma.sql`d.ativo = 1`]
  if (tecnicoId) dispConds.push(Prisma.sql`d.cod_tecnico = ${tecnicoId}`)
  if (procedimentoTecnicosIds.length > 0) {
    dispConds.push(Prisma.sql`d.cod_tecnico IN (${Prisma.join(procedimentoTecnicosIds)})`)
  }

  const dispRows: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT d.id, d.cod_tecnico, d.dias_semana, d.hora_inicio, d.hora_fim, d.intervalo_min,
           d.data_inicio, d.data_fim, d.intervalo_ini, d.intervalo_fim,
           COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
    FROM tecnico_disponibilidade d
    LEFT JOIN usuario u ON u.COD_USU = d.cod_tecnico
    WHERE ${Prisma.join(dispConds, ' AND ')}
    ORDER BY tecnicoNome
  `)
  if (!dispRows.length) return { ok: true, duracaoMin: duracaoProcedimento, itens: [] }

  const tecnicoIds = Array.from(new Set(
    dispRows.map((d: any) => Number(d.cod_tecnico)).filter((id: number) => Number.isFinite(id) && id > 0)))
  const detalheRows = tecnicoIds.length
    ? await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cod_tecnico AS tecnicoId, dia_semana AS diaSemana, hora_inicio AS horaInicio,
               hora_fim AS horaFim, intervalo_min AS intervaloMin,
               intervalo_ini AS intervaloIni, intervalo_fim AS intervaloFim
        FROM tecnico_disponibilidade_dia
        WHERE ativo = 1 AND cod_tecnico IN (${Prisma.join(tecnicoIds)})
      `)
    : []
  const detalheMap = new Map<string, any>()
  for (const det of detalheRows) {
    detalheMap.set(`${Number(det.tecnicoId)}-${Number(det.diaSemana)}`, det)
  }

  const itens: SlotsDoTecnico[] = []

  for (const dataStr of dates) {
    const [y, m, d] = dataStr.split('-').map(Number)
    const dataObj = new Date(y, m - 1, d)
    const diaSemana = dataObj.getDay()

    for (const disp of dispRows) {
      if (disp.data_inicio) {
        const ini = new Date(disp.data_inicio)
        if (dataObj < ini) continue
      }
      if (disp.data_fim) {
        const fim = new Date(disp.data_fim)
        fim.setHours(23, 59, 59)
        if (dataObj > fim) continue
      }

      const tId = Number(disp.cod_tecnico)
      const detalheDia = detalheMap.get(`${tId}-${diaSemana}`)
      const usaFallbackBase = !detalheDia

      const dias = parseDiasSemanaCsv(disp.dias_semana)
      if (usaFallbackBase && !dias.includes(diaSemana)) continue

      const horaInicioRef = usaFallbackBase ? disp.hora_inicio : detalheDia.horaInicio
      const horaFimRef = usaFallbackBase ? disp.hora_fim : detalheDia.horaFim
      const fallbackStartMin = parseTimeToMinutes(disp.hora_inicio)
      const fallbackEndMin = parseTimeToMinutes(disp.hora_fim)

      let startMin = parseTimeToMinutes(horaInicioRef)
      let endMin = parseTimeToMinutes(horaFimRef)

      // Se o detalhe do dia vier em formato inesperado/inválido, volta para a base legada.
      if ((!Number.isFinite(startMin as number) || !Number.isFinite(endMin as number)
        || (endMin as number) <= (startMin as number))
        && !usaFallbackBase
        && fallbackStartMin !== null && fallbackEndMin !== null
        && fallbackEndMin > fallbackStartMin) {
        startMin = fallbackStartMin
        endMin = fallbackEndMin
      }
      if (startMin === null || endMin === null || endMin <= startMin) continue

      const intervaloRaw = Number(usaFallbackBase ? disp.intervalo_min : detalheDia.intervaloMin)
      const intervalo = Number.isFinite(intervaloRaw) && intervaloRaw > 0 ? intervaloRaw : 60

      const lunchIni = parseTimeToMinutes(usaFallbackBase ? disp.intervalo_ini : detalheDia.intervaloIni)
      const lunchFim = parseTimeToMinutes(usaFallbackBase ? disp.intervalo_fim : detalheDia.intervaloFim)

      const allSlots: string[] = []
      for (let min = startMin; min < endMin; min += intervalo) {
        if (lunchIni !== null && lunchFim !== null && min >= lunchIni && min < lunchFim) continue
        allSlots.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
      }

      const agendaItems: any[] = await prisma.$queryRaw`
        SELECT hora_ini, hora_fin FROM agenda
        WHERE cod_colaborador = ${tId} AND DATE(data_agendamento) = ${dataStr} AND hora_ini IS NOT NULL
          AND COALESCE(Status_agendamento, 0) IN (0, 1)
      `
      const programados: any[] = await prisma.$queryRaw`
        SELECT hora_inicio, duracao_min FROM agendamento_programado
        WHERE cod_tecnico = ${tId} AND DATE(data_agendamento) = ${dataStr} AND status = 1
      `
      const bloqueios: any[] = await prisma.$queryRaw`
        SELECT hora_ini, hora_fim FROM agendamento_bloqueio
        WHERE ativo = 1
          AND (cod_tecnico = ${tId} OR cod_tecnico IS NULL)
          AND data_ini <= ${dataStr} AND data_fim >= ${dataStr}
      `

      const ranges: Array<{ iniMin: number; finMin: number; motivo: 'agenda' | 'programado' | 'bloqueio' }> = []
      for (const item of agendaItems) {
        const iniMin = parseTimeToMinutes(item.hora_ini)
        if (iniMin === null) continue
        const finMin = parseTimeToMinutes(item.hora_fin) ?? (iniMin + intervalo)
        ranges.push({ iniMin, finMin: finMin > iniMin ? finMin : iniMin + intervalo, motivo: 'agenda' })
      }
      for (const ap of programados) {
        const iniMin = parseTimeToMinutes(ap.hora_inicio)
        if (iniMin === null) continue
        ranges.push({ iniMin, finMin: iniMin + (Number(ap.duracao_min) || 60), motivo: 'programado' })
      }
      for (const bl of bloqueios) {
        const iniMin = parseTimeToMinutes(bl.hora_ini)
        const finMin = parseTimeToMinutes(bl.hora_fim)
        if (iniMin === null || finMin === null) continue
        ranges.push({ iniMin, finMin, motivo: 'bloqueio' })
      }

      const motivoDoSlot = (slot: string): string | null => {
        const [h, m2] = slot.split(':').map(Number)
        const slotIni = h * 60 + m2
        const slotFim = slotIni + duracaoProcedimento
        if (slotFim > endMin!) return 'fora_janela_duracao'
        if (lunchIni !== null && lunchFim !== null && overlapsRange(slotIni, slotFim, lunchIni, lunchFim)) {
          return 'intervalo'
        }
        return ranges.find((r) => overlapsRange(slotIni, slotFim, r.iniMin, r.finMin))?.motivo ?? null
      }

      const slotMotivos: Record<string, string> = {}
      const slotsDisponiveis: string[] = []
      const slotsOcupados: string[] = []
      for (const slot of allSlots) {
        const motivo = motivoDoSlot(slot)
        if (!motivo) { slotsDisponiveis.push(slot); continue }
        slotsOcupados.push(slot)
        slotMotivos[slot] = motivo
      }

      itens.push({
        tecnicoId: tId,
        tecnicoNome: disp.tecnicoNome,
        data: dataStr,
        slotsDisponiveis,
        slotsOcupados,
        slotMotivos,
      })
    }
  }

  return { ok: true, duracaoMin: duracaoProcedimento, itens }
}
