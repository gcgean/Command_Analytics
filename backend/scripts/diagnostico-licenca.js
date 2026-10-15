/**
 * Diagnóstico de provisionamento da IA para o ERP, direto no banco.
 *
 * Existe porque a rota /api/ia-externa/diagnostico exige login, e no servidor é mais prático
 * consultar sem passar por HTTP. Nunca imprime a licença nem a chave de IA — só o que é preciso
 * para descobrir por que uma ativação foi recusada.
 *
 * Uso:
 *   node scripts/diagnostico-licenca.js                      → últimas tentativas de todos
 *   node scripts/diagnostico-licenca.js 10435623000140        → tudo sobre um CNPJ
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const n = (v) => Number(v ?? 0)
const data = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '—')

async function main() {
  const cnpj = String(process.argv[2] ?? '').replace(/\D/g, '')

  if (!cnpj) {
    const linhas = await prisma.$queryRawUnsafe(
      `SELECT cnpj, sistema, resultado, motivo, licencas_cnpj, tamanho_chave, criado_em
         FROM ia_provisionamento_log ORDER BY criado_em DESC LIMIT 20`)
    console.log('\n=== Últimas 20 tentativas de ativação ===\n')
    if (linhas.length === 0) console.log('  Nenhuma tentativa registrada ainda.')
    for (const l of linhas) {
      console.log(`${data(l.criado_em)}  ${l.cnpj}  ${l.resultado.toUpperCase()}`)
      console.log(`   ${l.motivo ?? 'ok'}`)
      console.log(`   sistema: ${l.sistema ?? '—'} · licenças do CNPJ: ${n(l.licencas_cnpj)}`
        + ` · tamanho da chave enviada: ${n(l.tamanho_chave)}\n`)
    }
    return
  }

  const [cli] = await prisma.$queryRawUnsafe(
    `SELECT cod_cli, NOME_FANTASIA AS nome, ATIVO FROM cliente
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ? LIMIT 1`, cnpj)
  console.log(`\n=== CNPJ ${cnpj} ===`)
  console.log(cli ? `Cliente: ${cli.nome} (cod ${cli.cod_cli}, ativo ${cli.ATIVO})`
                  : 'Cliente: não encontrado na base')

  const licencas = await prisma.$queryRawUnsafe(
    `SELECT l.id, l.sistema_id, s.descricao AS sistema, LENGTH(l.chave) AS tam,
            l.vencimento, l.demo,
            (l.vencimento IS NULL OR l.vencimento >= CURDATE()) AS vigente
       FROM licencas l LEFT JOIN sistema s ON s.id = l.sistema_id
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(l.cnpj,'.',''),'/',''),'-',''),' ','') = ?
      ORDER BY l.sistema_id`, cnpj)

  console.log(`\n--- Licenças: ${licencas.length} ---`)
  for (const l of licencas) {
    console.log(`  sistema ${n(l.sistema_id)} (${l.sistema ?? '?'})`
      + ` · chave de ${n(l.tam)} caracteres`
      + ` · ${n(l.vigente) ? 'vigente' : 'VENCIDA'}`
      + ` · venc: ${l.vencimento ? String(l.vencimento).slice(0, 10) : 'sem data'}`
      + (String(l.demo) === 'S' ? ' · DEMO' : ''))
  }

  const chaves = await prisma.$queryRawUnsafe(
    `SELECT nome, chave_final, instalacao, ativo, limite_dia, ultimo_uso
       FROM ia_cliente_externo WHERE cnpj = ?`, cnpj)
  console.log(`\n--- Chaves de IA já provisionadas: ${chaves.length} ---`)
  for (const c of chaves) {
    console.log(`  ${c.nome} · …${c.chave_final} · ${c.instalacao ?? 'sem instalação'}`
      + ` · ${c.ativo ? 'ativa' : 'inativa'} · último uso: ${data(c.ultimo_uso)}`)
  }

  const tentativas = await prisma.$queryRawUnsafe(
    `SELECT resultado, motivo, instalacao, sistema, licencas_cnpj, tamanho_chave, criado_em
       FROM ia_provisionamento_log WHERE cnpj = ? ORDER BY criado_em DESC LIMIT 15`, cnpj)
  console.log(`\n--- Tentativas de ativação: ${tentativas.length} ---`)
  for (const t of tentativas) {
    console.log(`  ${data(t.criado_em)}  ${t.resultado.toUpperCase()}  ${t.motivo ?? 'ok'}`)
    console.log(`     instalação: ${t.instalacao ?? '—'} · sistema: ${t.sistema ?? '—'}`
      + ` · chave enviada: ${n(t.tamanho_chave)} caracteres`)
  }

  // O diagnóstico que mais resolve: o tamanho bate com o que o banco espera?
  const tamanhos = [...new Set(licencas.map((l) => n(l.tam)))]
  const enviados = [...new Set(tentativas.map((t) => n(t.tamanho_chave)))].filter(Boolean)
  if (tamanhos.length && enviados.length && !enviados.some((e) => tamanhos.includes(e))) {
    console.log(`\n>> As licenças têm ${tamanhos.join('/')} caracteres, mas o ERP enviou`
      + ` ${enviados.join('/')}. São credenciais diferentes — o ERP está mandando outro valor,`
      + ` não a chave de licença.`)
  }
  console.log()
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
