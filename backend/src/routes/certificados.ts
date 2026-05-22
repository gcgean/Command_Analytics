import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

type CertificadoRow = {
  id: number
  razaoEmpresa: string | null
  nomeFantasia: string | null
  cidade: string | null
  telefone: string | null
  celular: string | null
  email: string | null
  cnpj: string | null
  tipo: string | null
  validade: Date | string | null
  ultimaSincronizacao: Date | string | null
  tipoCliente: string | null
  contadorNome: string | null
  contadorTelefone: string | null
  contadorEmail: string | null
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function diffDaysFromToday(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatSituacao(dias: number | null): string {
  if (dias === null) return 'Sem validade'
  if (dias < 0) return `VENCIDO - ${Math.abs(dias)} DIAS`
  if (dias === 0) return 'VENCE HOJE'
  return `A VENCER - ${dias} DIAS`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export async function certificadosRoutes(app: FastifyInstance) {
  app.get('/listagem', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async (request) => {
    const { dataIni, dataFin } = request.query as { dataIni?: string; dataFin?: string }
    const hoje = new Date()
    const inicio = dataIni ? new Date(`${dataIni}T00:00:00`) : startOfMonth(hoje)
    const fim = dataFin ? new Date(`${dataFin}T23:59:59`) : endOfMonth(hoje)

    const rows = await prisma.$queryRaw<CertificadoRow[]>`
      SELECT
        C.ID AS id,
        C.RAZAO_EMP AS razaoEmpresa,
        C.NOME_FANTASIA AS nomeFantasia,
        C.CIDADE AS cidade,
        C.TELEFONE AS telefone,
        C.CELULAR_CLI AS celular,
        C.EMAIL_CLI AS email,
        C.CNPJ_CLI AS cnpj,
        C.TIPO AS tipo,
        C.DATA_VAL_CERT_DIG AS validade,
        C.DATA_SINCR_DADOS AS ultimaSincronizacao,
        C.tipo_cliente AS tipoCliente,
        CO.NOME_COMERCIAL AS contadorNome,
        CO.TELEFONE AS contadorTelefone,
        CO.EMAIL AS contadorEmail
      FROM certificados C
      JOIN (
          SELECT
            CNPJ_CLI,
            MAX(CONCAT(DATE_FORMAT(DATA_VAL_CERT_DIG, '%Y%m%d'), LPAD(ID, 12, '0'))) AS K
          FROM certificados
          WHERE DATA_VAL_CERT_DIG BETWEEN ${inicio} AND ${fim}
          GROUP BY CNPJ_CLI
      ) U
        ON U.CNPJ_CLI = C.CNPJ_CLI
       AND U.K = CONCAT(DATE_FORMAT(C.DATA_VAL_CERT_DIG, '%Y%m%d'), LPAD(C.ID, 12, '0'))
      LEFT JOIN (
        SELECT CNPJ_CLI, MAX(cod_cli) AS cod_cli
        FROM cliente
        GROUP BY CNPJ_CLI
      ) CIU ON CIU.CNPJ_CLI = C.CNPJ_CLI
      LEFT JOIN (
        SELECT CE1.*
        FROM contador_cliente CE1
        INNER JOIN (
          SELECT COD_CLIENTE, MAX(ID_REG) AS ID
          FROM contador_cliente
          GROUP BY COD_CLIENTE
        ) Ultimo
          ON CE1.COD_CLIENTE = Ultimo.COD_CLIENTE
         AND CE1.ID_REG = Ultimo.ID
      ) CE ON CE.COD_CLIENTE = CIU.cod_cli
      LEFT JOIN contador CO ON CO.ID_CONTADOR = CE.COD_CONTADOR
      ORDER BY C.DATA_VAL_CERT_DIG ASC
    `

    return rows.map((row) => {
      const diasParaVencimento = diffDaysFromToday(row.validade)
      return {
        id: Number(row.id),
        razaoEmpresa: row.razaoEmpresa || '',
        nomeFantasia: row.nomeFantasia || '',
        cidade: row.cidade || '',
        telefone: row.telefone || '',
        celular: row.celular || '',
        email: row.email || '',
        cnpj: row.cnpj || '',
        tipo: row.tipo || '',
        validade: toDateOnly(row.validade),
        ultimaSincronizacao: toDateOnly(row.ultimaSincronizacao),
        tipoCliente: row.tipoCliente || '',
        contadorNome: row.contadorNome || '',
        contadorTelefone: row.contadorTelefone || '',
        contadorEmail: row.contadorEmail || '',
        diasParaVencimento,
        situacao: formatSituacao(diasParaVencimento),
      }
    })
  })

  app.get('/proximos-12-meses', { preHandler: authMiddleware, schema: { tags: ['Certificados'] } }, async () => {
    const hoje = new Date()
    const inicio = startOfMonth(hoje)
    const fim = endOfMonth(addMonths(inicio, 11))

    const rows = await prisma.$queryRaw<Array<{ referencia: string; total: number }>>`
      SELECT
        DATE_FORMAT(base.validade, '%Y-%m') AS referencia,
        COUNT(*) AS total
      FROM (
        SELECT
          c.CNPJ_CLI AS cnpj,
          MAX(c.DATA_VAL_CERT_DIG) AS validade
        FROM certificados c
        WHERE c.DATA_VAL_CERT_DIG BETWEEN ${inicio} AND ${fim}
        GROUP BY c.CNPJ_CLI
      ) base
      GROUP BY DATE_FORMAT(base.validade, '%Y-%m')
      ORDER BY referencia ASC
    `

    const mapa = new Map<string, number>()
    for (const row of rows) {
      mapa.set(String(row.referencia), Number(row.total ?? 0))
    }

    return Array.from({ length: 12 }, (_, index) => {
      const data = addMonths(inicio, index)
      const referencia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
      return {
        referencia,
        mesLabel: data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase(),
        total: mapa.get(referencia) ?? 0,
      }
    })
  })
}
