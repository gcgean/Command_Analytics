import { prisma } from '../database/client'

const REQUEST_TIMEOUT_MS = 6000
const POLL_INTERVAL_MS = 5 * 60 * 1000

async function ensureColumnExists(table: string, column: string, ddl: string) {
  const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `
  if (rows.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

let ensurePromise: Promise<void> | null = null
export function ensureServidorMonitorColumns(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureColumnExists('hist_servidor_nuvem', 'conexoes_total', 'conexoes_total INT NULL')
      await ensureColumnExists('hist_servidor_nuvem', 'conexoes_aberto', 'conexoes_aberto INT NULL')
      await ensureColumnExists('hist_servidor_nuvem', 'conexoes_travado', 'conexoes_travado INT NULL')
      await ensureColumnExists('hist_servidor_nuvem', 'conexoes_fechado', 'conexoes_fechado INT NULL')
      await ensureColumnExists('servidor_nuvem', 'monitor_online', 'monitor_online TINYINT(1) NULL DEFAULT 0')
    })()
  }
  return ensurePromise
}

function authHeader(): Record<string, string> {
  const username = process.env.SERVIDOR_MONITOR_API_USERNAME || ''
  const password = process.env.SERVIDOR_MONITOR_API_PASSWORD || ''
  if (!username && !password) return {}
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return { Authorization: `Basic ${token}` }
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers: authHeader(), signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

interface ServidorParaChecar {
  id: number
  dns: string | null
  portaApi: number | null
}

interface ResultadoChecagem {
  online: boolean
  conexoesTotal: number | null
  conexoesAberto: number | null
  conexoesTravado: number | null
  conexoesFechado: number | null
  cpuPercent: number | null
  ramPercent: number | null
  discoTotal: number | null
  discoLivre: number | null
  driveDisco: string | null
}

const RESULTADO_VAZIO: ResultadoChecagem = {
  online: false,
  conexoesTotal: null,
  conexoesAberto: null,
  conexoesTravado: null,
  conexoesFechado: null,
  cpuPercent: null,
  ramPercent: null,
  discoTotal: null,
  discoLivre: null,
  driveDisco: null,
}

export async function checarServidor(servidor: ServidorParaChecar): Promise<ResultadoChecagem> {
  if (!servidor.dns || !servidor.portaApi) {
    return RESULTADO_VAZIO
  }
  const baseUrl = `http://${servidor.dns}:${servidor.portaApi}/api`
  try {
    const monitor = await fetchJson(`${baseUrl}/web/Monitor`, REQUEST_TIMEOUT_MS)
    const counts = monitor?.counts && typeof monitor.counts === 'object' ? monitor.counts : null
    const metrics = monitor?.metrics && typeof monitor.metrics === 'object' ? monitor.metrics : null
    const disco = metrics?.disco && typeof metrics.disco === 'object' ? metrics.disco : null
    return {
      online: true,
      conexoesTotal: counts ? Number(counts.total ?? 0) : null,
      conexoesAberto: counts ? Number(counts.aberto ?? 0) : null,
      conexoesTravado: counts ? Number(counts.travado ?? 0) : null,
      conexoesFechado: counts ? Number(counts.fechado ?? 0) : null,
      cpuPercent: metrics?.usoCpu !== undefined ? Number(metrics.usoCpu) : null,
      ramPercent: metrics?.usoMemoria !== undefined ? Number(metrics.usoMemoria) : null,
      discoTotal: disco?.espacoTotalGb !== undefined ? Number(disco.espacoTotalGb) : null,
      discoLivre: disco?.espacoLivreGb !== undefined ? Number(disco.espacoLivreGb) : null,
      driveDisco: disco?.drive ?? null,
    }
  } catch {
    return RESULTADO_VAZIO
  }
}

export async function pollServidor(servidorId: number): Promise<void> {
  const servidor = await prisma.servidor.findUnique({ where: { id: servidorId } })
  if (!servidor) return

  const resultado = await checarServidor(servidor)

  await prisma.servidor.update({
    where: { id: servidorId },
    data: {
      // Não escreve mais em "online" (coluna disponivel) — um trigger legado
      // (TRG_SERVIDOR_NUVEM_DISPONIVEL) trava essa coluna no valor antigo em qualquer UPDATE.
      monitorOnline: resultado.online,
      ...(resultado.cpuPercent !== null && { cpuPercent: resultado.cpuPercent }),
      ...(resultado.ramPercent !== null && { ramPercent: resultado.ramPercent }),
      ...(resultado.discoTotal !== null && { discoTotal: resultado.discoTotal }),
      ...(resultado.discoLivre !== null && { discoLivre: resultado.discoLivre }),
      ...(resultado.driveDisco !== null && { driveDisco: resultado.driveDisco }),
    },
  })

  await prisma.historicoServidor.create({
    data: {
      servidorId,
      online: resultado.online ? 1 : 0,
      dataConsulta: new Date(),
      usoCpu: resultado.cpuPercent ?? undefined,
      usoMemoria: resultado.ramPercent ?? undefined,
      conexoesTotal: resultado.conexoesTotal ?? undefined,
      conexoesAberto: resultado.conexoesAberto ?? undefined,
      conexoesTravado: resultado.conexoesTravado ?? undefined,
      conexoesFechado: resultado.conexoesFechado ?? undefined,
    } as never,
  })
}

export async function pollAllServidores(): Promise<void> {
  await ensureServidorMonitorColumns()
  const servidores = await prisma.servidor.findMany({
    where: {
      desativado: { not: true },
      dns: { not: null },
      portaApi: { not: null },
    },
    select: { id: true },
  })
  for (const servidor of servidores) {
    await pollServidor(servidor.id).catch((e) => console.warn(`⚠ Falha ao checar servidor ${servidor.id}:`, e?.message))
  }
}

let processando = false
let schedulerHandle: ReturnType<typeof setInterval> | null = null

export function startServidorMonitorScheduler(): void {
  if (schedulerHandle) return
  const executar = () => {
    if (processando) return
    processando = true
    pollAllServidores()
      .catch((e) => console.warn('⚠ Monitor de servidores:', e?.message))
      .finally(() => {
        processando = false
      })
  }
  schedulerHandle = setInterval(executar, POLL_INTERVAL_MS)
  setTimeout(executar, 15_000)
}
