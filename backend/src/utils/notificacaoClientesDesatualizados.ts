import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { SISTEMAS_VERSAO, type SistemaVersao } from '../routes/projetos'

const HORARIO_ENVIO = '08:00'
const INTERVALO_MS = 10 * 60 * 1000
const STATUS_CONCLUIDO = 7

let handle: ReturnType<typeof setInterval> | null = null
let ultimoEnvio: string | null = null

/** Compara "6.57.3.0" numericamente — como texto, "6.9" sairia maior que "6.57". */
function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

interface Pendencia {
  atendimentoId: number
  clienteNome: string
  projetoNome: string
  versaoInstalada: string
  versaoEntrega: string
}

/**
 * Agrupa por técnico que lançou as solicitações já entregues em versão, mas cujo cliente ainda
 * roda uma versão anterior. Mesma regra da aba "Clientes a atualizar" — é de propósito: se as
 * duas divergissem, o técnico receberia no Telegram algo que não acha na tela.
 */
export async function levantarPendenciasPorTecnico(): Promise<Map<number, Pendencia[]>> {
  const concluidas = await prisma.atendimento.findMany({
    where: {
      status: STATUS_CONCLUIDO,
      dataFechamento: { not: null },
      projeto: { sistemaVersao: { not: null } },
      tecnicoId: { not: null },
    },
    select: {
      id: true, clienteId: true, tecnicoId: true, dataFechamento: true,
      cliente: { select: { nome: true } },
      projeto: { select: { nome: true, sistemaVersao: true } },
    },
    orderBy: { dataFechamento: 'desc' },
    take: 2000,
  })
  if (!concluidas.length) return new Map()

  const versoes = await prisma.versao.findMany({
    where: { sistemaId: { in: Object.values(SISTEMAS_VERSAO).map((s) => s.sistemaId) }, data: { not: null } },
    select: { sistemaId: true, versao: true, data: true },
    orderBy: { data: 'asc' },
  })

  const clienteIds = [...new Set(concluidas.map((a) => a.clienteId).filter(Boolean) as number[])]
  if (!clienteIds.length) return new Map()
  const instaladas = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
    `SELECT cod_cli AS clienteId, versao_exe_retaguarda AS RETAGUARDA,
            versao_exe_pdv AS PDV, versao_exe_connection AS CONNECTION
       FROM dados_gerais_clientes WHERE cod_cli IN (${clienteIds.map(() => '?').join(',')})`,
    ...clienteIds,
  )
  const porCliente = new Map(instaladas.map((r) => [Number(r.clienteId), r]))

  const porTecnico = new Map<number, Pendencia[]>()
  for (const a of concluidas) {
    const sistema = a.projeto?.sistemaVersao as SistemaVersao | null
    if (!sistema || !a.clienteId || !a.tecnicoId || !a.dataFechamento) continue

    const entrega = versoes.find(
      (v) => v.sistemaId === SISTEMAS_VERSAO[sistema].sistemaId && v.data! >= a.dataFechamento!,
    )
    if (!entrega) continue

    const instalada = String(porCliente.get(a.clienteId)?.[sistema] ?? '').trim()
    if (!instalada || compararVersao(instalada, entrega.versao) >= 0) continue

    const lista = porTecnico.get(a.tecnicoId) ?? []
    lista.push({
      atendimentoId: a.id,
      clienteNome: a.cliente?.nome?.trim() || `cliente #${a.clienteId}`,
      projetoNome: a.projeto?.nome ?? 'sem projeto',
      versaoInstalada: instalada,
      versaoEntrega: entrega.versao,
    })
    porTecnico.set(a.tecnicoId, lista)
  }
  return porTecnico
}

/** Monta e dispara o resumo diário. Exportada pra permitir disparo manual/teste. */
export async function enviarResumoClientesDesatualizados(): Promise<{ tecnicos: number; enviados: number }> {
  const porTecnico = await levantarPendenciasPorTecnico()
  if (!porTecnico.size) return { tecnicos: 0, enviados: 0 }

  const tecnicos = await prisma.usuario.findMany({
    where: { id: { in: [...porTecnico.keys()] } },
    select: { id: true, idTelegram: true, nomeCompleto: true, nomeUsu: true },
  })

  let enviados = 0
  for (const tecnico of tecnicos) {
    if (!tecnico.idTelegram) continue
    const pendencias = porTecnico.get(tecnico.id) ?? []
    if (!pendencias.length) continue

    // Telegram corta em 4096 caracteres — lista longa vira "e mais N".
    const linhas = pendencias.slice(0, 25).map(
      (p) => `• ${p.clienteNome} (#${p.atendimentoId})\n   ${p.projetoNome}: tem ${p.versaoInstalada}, precisa ${p.versaoEntrega}`,
    )
    const restante = pendencias.length - linhas.length
    const mensagem =
      `📦 Clientes seus que já podem ser atualizados (${pendencias.length})\n\n` +
      `A versão com o que eles pediram já saiu, mas continuam numa versão anterior.\n\n` +
      linhas.join('\n') +
      (restante > 0 ? `\n\n…e mais ${restante}. Veja a lista completa em Mapa de Solicitações › Clientes a atualizar.` : '')

    const envio = await TelegramService.enviar({ userId: tecnico.idTelegram, mensagem })
    if (envio.success) enviados += 1
    else console.warn(`⚠ Falha ao enviar resumo de atualizações para ${tecnico.id}:`, envio.error)
  }
  return { tecnicos: porTecnico.size, enviados }
}

/**
 * Verifica a cada 10 minutos se já passou do horário de envio e se ainda não enviou hoje. O
 * controle é em memória (reseta em restart), mesmo padrão dos outros agendadores do projeto —
 * o pior caso de um restart no horário é um resumo repetido, não um resumo perdido.
 */
export function startClientesDesatualizadosScheduler(): void {
  if (handle) return
  const tick = async () => {
    const agora = new Date()
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
    const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    if (ultimoEnvio === hoje || horaAtual < HORARIO_ENVIO) return

    ultimoEnvio = hoje
    try {
      const r = await enviarResumoClientesDesatualizados()
      if (r.enviados) console.log(`✓ Resumo de clientes a atualizar enviado para ${r.enviados} técnico(s)`)
    } catch (e) {
      console.warn('⚠ Falha ao enviar resumo de clientes a atualizar:', e)
    }
  }
  handle = setInterval(() => void tick(), INTERVALO_MS)
  void tick()
}
