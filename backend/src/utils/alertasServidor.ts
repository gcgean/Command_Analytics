import { prisma } from '../database/client'
import { TelegramService } from '../services/telegram'

// Checagem roda a cada 5 min: 2 seguidas evitam alarme por uma falha momentânea de rede.
const VERIFICACOES_PARA_ALERTAR = 2
const RAM_LIMITE = 90
// Só considera normalizado abaixo disso — sem a folga, servidor oscilando em 89/91% alternaria
// "gargalo"/"normalizou" a cada checagem.
const RAM_NORMAL = 85

export async function initAlertasServidor(): Promise<void> {
  // Quem recebe é escolhido em cada servidor: servidor de um cliente específico interessa a quem
  // cuida dele, não a todo mundo que ligou "alertas" no próprio cadastro.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS servidor_alerta_usuario (
      servidor_id   INT NOT NULL,
      usuario_id    INT NOT NULL,
      queda         TINYINT(1) NOT NULL DEFAULT 0,
      ram           TINYINT(1) NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (servidor_id, usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // Estado no banco, não em memória: reiniciar o backend não pode reenviar alerta já dado.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS servidor_alerta_estado (
      servidor_id     INT PRIMARY KEY,
      falhas          INT NOT NULL DEFAULT 0,
      queda_alertada  TINYINT(1) NOT NULL DEFAULT 0,
      ram_altas       INT NOT NULL DEFAULT 0,
      ram_alertada    TINYINT(1) NOT NULL DEFAULT 0,
      atualizado_em   DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export type AlertaUsuario = { usuarioId: number; queda: boolean; ram: boolean }

export async function lerAlertasDoServidor(servidorId: number): Promise<AlertaUsuario[]> {
  const rows = await prisma.$queryRaw<Array<{ usuario_id: number; queda: number; ram: number }>>`
    SELECT usuario_id, queda, ram FROM servidor_alerta_usuario WHERE servidor_id = ${servidorId}
  `
  return rows.map((r) => ({ usuarioId: Number(r.usuario_id), queda: Number(r.queda) === 1, ram: Number(r.ram) === 1 }))
}

/** Substitui a lista inteira do servidor — quem não vier marcado deixa de receber. */
export async function salvarAlertasDoServidor(servidorId: number, lista: AlertaUsuario[]): Promise<void> {
  const marcados = lista.filter((l) => l.queda || l.ram)
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM servidor_alerta_usuario WHERE servidor_id = ${servidorId}`,
    ...marcados.map(
      (l) => prisma.$executeRaw`
        INSERT INTO servidor_alerta_usuario (servidor_id, usuario_id, queda, ram)
        VALUES (${servidorId}, ${l.usuarioId}, ${l.queda ? 1 : 0}, ${l.ram ? 1 : 0})
      `,
    ),
  ])
}

type TipoAlerta = 'queda' | 'ram'

async function enviar(servidorId: number, tipo: TipoAlerta, mensagem: string) {
  const destinatarios = await prisma.$queryRawUnsafe<Array<{ id: number; idTelegram: string }>>(
    `SELECT u.COD_USU AS id, u.ID_TELEGRAM AS idTelegram
       FROM servidor_alerta_usuario a
       JOIN usuario u ON u.COD_USU = a.usuario_id
      WHERE a.servidor_id = ? AND a.${tipo === 'queda' ? 'queda' : 'ram'} = 1
        AND COALESCE(u.ATIVO, 'S') = 'S'
        AND COALESCE(u.ID_TELEGRAM, '') <> ''`,
    servidorId,
  )
  for (const d of destinatarios) {
    const envio = await TelegramService.enviar({ userId: String(d.idTelegram), mensagem })
    if (!envio.success) console.warn(`⚠ Alerta de servidor não enviado pro usuário ${d.id}:`, envio.error)
  }
}

/**
 * Chamado a cada checagem de servidor. Mantém contadores de falha/RAM alta e dispara no máximo um
 * aviso por evento (caiu → voltou, gargalo → normalizou).
 */
export async function avaliarAlertasServidor(
  servidor: { id: number; nome: string | null },
  resultado: { online: boolean; ramPercent: number | null },
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ falhas: number; queda_alertada: number; ram_altas: number; ram_alertada: number }>>`
    SELECT falhas, queda_alertada, ram_altas, ram_alertada FROM servidor_alerta_estado WHERE servidor_id = ${servidor.id}
  `
  const e = {
    falhas: Number(rows[0]?.falhas ?? 0),
    quedaAlertada: Number(rows[0]?.queda_alertada ?? 0) === 1,
    ramAltas: Number(rows[0]?.ram_altas ?? 0),
    ramAlertada: Number(rows[0]?.ram_alertada ?? 0) === 1,
  }
  const nome = servidor.nome?.trim() || `Servidor #${servidor.id}`
  const hora = new Date().toLocaleString('pt-BR')

  if (!resultado.online) {
    e.falhas += 1
    if (e.falhas >= VERIFICACOES_PARA_ALERTAR && !e.quedaAlertada) {
      await enviar(servidor.id, 'queda', `🔴 Servidor fora do ar\n\n${nome}\nSem resposta em ${e.falhas} verificações seguidas.\n${hora}`)
      e.quedaAlertada = true
    }
    e.ramAltas = 0
  } else {
    if (e.quedaAlertada) {
      await enviar(servidor.id, 'queda', `🟢 Servidor voltou\n\n${nome} está respondendo de novo.\n${hora}`)
    }
    e.falhas = 0
    e.quedaAlertada = false

    const ram = resultado.ramPercent
    if (ram !== null) {
      if (ram >= RAM_LIMITE) {
        e.ramAltas += 1
        if (e.ramAltas >= VERIFICACOES_PARA_ALERTAR && !e.ramAlertada) {
          await enviar(servidor.id, 'ram', `🟠 Gargalo de memória RAM\n\n${nome}\nRAM em ${ram.toFixed(0)}% há ${e.ramAltas} verificações seguidas.\n${hora}`)
          e.ramAlertada = true
        }
      } else if (ram < RAM_NORMAL) {
        if (e.ramAlertada) {
          await enviar(servidor.id, 'ram', `✅ Memória RAM normalizada\n\n${nome}\nRAM em ${ram.toFixed(0)}%.\n${hora}`)
        }
        e.ramAltas = 0
        e.ramAlertada = false
      }
    }
  }

  await prisma.$executeRaw`
    INSERT INTO servidor_alerta_estado (servidor_id, falhas, queda_alertada, ram_altas, ram_alertada)
    VALUES (${servidor.id}, ${e.falhas}, ${e.quedaAlertada ? 1 : 0}, ${e.ramAltas}, ${e.ramAlertada ? 1 : 0})
    ON DUPLICATE KEY UPDATE falhas = VALUES(falhas), queda_alertada = VALUES(queda_alertada),
                            ram_altas = VALUES(ram_altas), ram_alertada = VALUES(ram_alertada)
  `
}
