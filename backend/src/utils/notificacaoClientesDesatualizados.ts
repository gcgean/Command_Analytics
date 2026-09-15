import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'
import { SISTEMAS_VERSAO, type SistemaVersao } from '../routes/projetos'
import { registrarNotificacao } from './notificacoesAgendamento'
import { compararVersao, versoesMaisNovasDoCliente } from './versaoInstaladaCliente'

const HORARIO_ENVIO = '08:00'
const INTERVALO_MS = 10 * 60 * 1000
const STATUS_CONCLUIDO = 7

let handle: ReturnType<typeof setInterval> | null = null
let rodando = false

function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Chave por técnico e por dia, gravada no banco. Assim reiniciar o backend não reenvia, e se o
// envio falhar pra um técnico só ele é tentado de novo — quem já recebeu não recebe duas vezes.
const chaveDoDia = (tecnicoId: number, dia: string) => `clientes_desatualizados:telegram:usuario-${tecnicoId}:${dia}`

async function jaEnviadoHoje(chave: string, tecnicoId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS total FROM notificacao_agendamento
     WHERE chave_evento = ${chave} AND canal = 'telegram' AND usuario_id = ${tecnicoId}
  `
  return Number(rows[0]?.total ?? 0) > 0
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
  const porCliente = await versoesMaisNovasDoCliente(clienteIds)

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

  const dia = hojeLocal()
  let enviados = 0
  for (const tecnico of tecnicos) {
    if (!tecnico.idTelegram) continue
    const pendencias = porTecnico.get(tecnico.id) ?? []
    if (!pendencias.length) continue
    const chave = chaveDoDia(tecnico.id, dia)
    if (await jaEnviadoHoje(chave, tecnico.id)) continue

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
    if (!envio.success) {
      console.warn(`⚠ Falha ao enviar resumo de atualizações para ${tecnico.id}:`, envio.error)
      continue
    }
    await registrarNotificacao({
      usuarioId: tecnico.id,
      canal: 'telegram',
      tipo: 'clientes_desatualizados',
      chaveEvento: chave,
      titulo: `Clientes a atualizar (${pendencias.length})`,
      mensagem: mensagem.slice(0, 1000),
    })
    enviados += 1
  }
  return { tecnicos: porTecnico.size, enviados }
}

/**
 * Verifica a cada 10 minutos se já passou do horário de envio. Quem já recebeu hoje é checado no
 * banco (chaveDoDia), então reinício do backend não dispara de novo.
 */
export function startClientesDesatualizadosScheduler(): void {
  if (handle) return
  const tick = async () => {
    const agora = new Date()
    const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    if (rodando || horaAtual < HORARIO_ENVIO) return

    rodando = true
    try {
      const r = await enviarResumoClientesDesatualizados()
      if (r.enviados) console.log(`✓ Resumo de clientes a atualizar enviado para ${r.enviados} técnico(s)`)
    } catch (e) {
      console.warn('⚠ Falha ao enviar resumo de clientes a atualizar:', e)
    } finally {
      rodando = false
    }
  }
  handle = setInterval(() => void tick(), INTERVALO_MS)
  void tick()
}
