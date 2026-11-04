import { prisma } from '../database/client'
import { dispararComunicado, type ResultadoComunicado } from './comunicadoEnvio'
import {
  campeoesDeUpgrade, valorPremioCampeao, valorPremioAtendente, minimoAtendimentos,
} from './comissaoUpgrade'
import { rankingAtendimentos, melhoresAtendentes } from './rankingAtendimentos'

/**
 * Comunicado automático dos campeões do mês: upgrades e qualidade de atendimento.
 *
 * Sai todo dia 1º às 09:00, sempre sobre o mês que acabou de fechar — o mesmo corte que
 * libera os prêmios no Meu Desempenho. Anunciar durante o mês mostraria um líder provisório.
 *
 * O registro em `comunicado_campeoes` é o que impede o envio repetido: o scheduler roda de
 * dez em dez minutos e o dia 1º tem muitas rodadas depois das nove. A linha é gravada ANTES
 * do disparo, e é ela que dá o direito de enviar — se duas instâncias subirem ao mesmo tempo,
 * só uma consegue inserir e só uma envia.
 */

const POLL_INTERVAL_MS = 10 * 60 * 1000
const HORA_ENVIO = 9

export async function initComunicadoCampeoes(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comunicado_campeoes (
      competencia   CHAR(7) PRIMARY KEY,
      comunicado_id INT NULL,
      enviado_em    DATETIME NOT NULL DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

export function competenciaAnterior(ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function limites(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`,
  }
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function nomesDe(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return []
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(NOME_USUARIO_COMPLETO, NOME_USU) AS nome
       FROM usuario WHERE COD_USU IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => [])
  return linhas.map((r) => String(r.nome ?? '').trim()).filter(Boolean)
}

const juntar = (nomes: string[]) =>
  nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`

/**
 * Monta o texto do comunicado. Devolve `null` quando não há nada a anunciar — mês sem campeão
 * de upgrade e sem ninguém elegível no ranking não vira comunicado vazio.
 */
export async function textoCampeoes(
  competencia: string,
): Promise<{ titulo: string; mensagem: string } | null> {
  const { inicio, fim } = limites(competencia)

  const [idsUpgrade, premioUpgrade, premioAtendente, minAtend] = await Promise.all([
    campeoesDeUpgrade(inicio, fim).catch(() => [] as number[]),
    valorPremioCampeao().catch(() => 0),
    valorPremioAtendente().catch(() => 0),
    minimoAtendimentos().catch(() => 200),
  ])

  const ranking = await rankingAtendimentos(inicio, fim, minAtend).catch(() => [])
  const idsAtendimento = melhoresAtendentes(ranking)
  const linhaTopo = ranking.find((r) => r.elegivel && r.posicao === 1) ?? null

  const [nomesUpgrade, nomesAtendimento] = await Promise.all([
    nomesDe(idsUpgrade), nomesDe(idsAtendimento),
  ])

  const partes: string[] = []

  if (nomesUpgrade.length > 0) {
    const plural = nomesUpgrade.length > 1
    partes.push(
      `🚀 *${plural ? 'Campeões' : 'Campeão'} de upgrades:* ${juntar(nomesUpgrade)}\n` +
      `Quem mais levantou receita com upgrades na base no mês.` +
      (premioUpgrade > 0 ? ` Prêmio de ${brl(premioUpgrade)}.` : ''))
  }

  if (nomesAtendimento.length > 0) {
    const plural = nomesAtendimento.length > 1
    const detalhe = linhaTopo && !plural
      ? `Nota média ${linhaTopo.notaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${linhaTopo.atendimentos} atendimentos.`
      : `Melhor nota média nas filas de atendimento, com no mínimo ${minAtend} atendimentos no mês.`
    partes.push(
      `🏆 *${plural ? 'Campeões' : 'Campeão'} de qualidade no atendimento:* ${juntar(nomesAtendimento)}\n` +
      detalhe + (premioAtendente > 0 ? ` Prêmio de ${brl(premioAtendente)}.` : ''))
  }

  if (partes.length === 0) return null

  return {
    titulo: `Campeões de ${rotuloCompetencia(competencia)}`,
    mensagem: `${partes.join('\n\n')}\n\nParabéns! 👏`,
  }
}

/**
 * Envia o comunicado de uma competência, uma vez só.
 *
 * `forcar` ignora o registro anterior e é para reenvio manual — nunca para o scheduler.
 */
export async function enviarComunicadoCampeoes(
  competencia: string, opcoes: { forcar?: boolean } = {},
): Promise<{ enviado: boolean; motivo?: string; resultado?: ResultadoComunicado }> {
  await initComunicadoCampeoes()

  if (!opcoes.forcar) {
    // Reserva a competência antes de enviar: quem conseguir inserir é quem envia.
    const reservou = await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO comunicado_campeoes (competencia) VALUES (?)`, competencia)
    if (Number(reservou) === 0) return { enviado: false, motivo: 'já comunicado' }
  }

  const texto = await textoCampeoes(competencia)
  if (!texto) {
    // Sem campeão não há o que anunciar, e a reserva fica: insistir todo dia 1º às nove
    // num mês que não teve vencedor só geraria tentativa perpétua.
    return { enviado: false, motivo: 'sem campeão no período' }
  }

  let resultado: ResultadoComunicado
  try {
    resultado = await dispararComunicado({
      titulo: texto.titulo, mensagem: texto.mensagem, autor: null,
    })
  } catch (e) {
    // Falhou antes de sair qualquer mensagem: devolve a reserva para a próxima rodada
    // tentar de novo. Mantê-la perderia o comunicado do mês por um erro passageiro.
    if (!opcoes.forcar) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM comunicado_campeoes WHERE competencia = ? AND comunicado_id IS NULL`,
        competencia).catch(() => {})
    }
    throw e
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO comunicado_campeoes (competencia, comunicado_id) VALUES (?,?)
     ON DUPLICATE KEY UPDATE comunicado_id = VALUES(comunicado_id), enviado_em = NOW()`,
    competencia, resultado.id).catch(() => {})

  return { enviado: true, resultado }
}

let processando = false
let schedulerHandle: ReturnType<typeof setInterval> | null = null

export function startComunicadoCampeoesScheduler(): void {
  if (schedulerHandle) return

  const executar = () => {
    if (processando) return
    const agora = new Date()
    // Dia 1º, das nove da manhã em diante. Depois das nove e não "às nove em ponto":
    // se o servidor estiver reiniciando às 09:00, a rodada seguinte ainda envia.
    if (agora.getDate() !== 1 || agora.getHours() < HORA_ENVIO) return

    processando = true
    enviarComunicadoCampeoes(competenciaAnterior(agora))
      .then((r) => {
        if (r.enviado) {
          console.log(`✓ Comunicado dos campeões enviado (${r.resultado?.entregues} entregues, ${r.resultado?.falhas} falhas)`)
        }
      })
      .catch((e) => console.warn('⚠ Comunicado dos campeões:', e?.message))
      .finally(() => { processando = false })
  }

  schedulerHandle = setInterval(executar, POLL_INTERVAL_MS)
  setTimeout(executar, 30_000)
}
