/**
 * Reescreve a escada de comissão do plano comercial com 30 degraus, de 1% a 30%.
 *
 * Por que: a 1ª faixa começava em R$ 1.000 e 87% das vendas valem menos que isso, então
 * quem vendia um sistema no mês ficava sem comissão — 22 de 50 vendedor-meses zerados no
 * último ano. Os pisos que já existiam foram mantidos com o mesmo percentual (ninguém perde);
 * o que mudou foi acrescentar 1% a 4% abaixo de R$ 1.000 e abrir 16% a 30% entre R$ 16 mil e
 * R$ 30 mil, faixa que o melhor mês já registrado (R$ 28,4 mil) alcança.
 *
 *   node scripts/aplicar-escada-30-faixas.js          (mostra o que fará)
 *   node scripts/aplicar-escada-30-faixas.js --aplicar
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// [piso em R$, percentual]. * marca piso que já existia antes, com o mesmo percentual.
const FAIXAS = [
  [100, 1], [200, 2], [400, 3], [700, 4],
  [1000, 5], [3000, 6], [5000, 7], [6000, 8], [7000, 9], [7500, 10],
  [10000, 11], [12500, 12], [13500, 13], [14000, 14], [15000, 15],
  [16000, 16], [17000, 17], [18000, 18], [19000, 19], [20000, 20],
  [21000, 21], [22000, 22], [23000, 23], [24000, 24], [25000, 25],
  [26000, 26], [27000, 27], [28000, 28], [29000, 29], [30000, 30],
]

const brl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

async function main() {
  const aplicar = process.argv.includes('--aplicar')

  const planos = await prisma.$queryRawUnsafe(
    `SELECT id, nome FROM comissao_plano WHERE tipo = 'escada' AND ativo = 1 ORDER BY id`)
  if (!planos.length) {
    console.log('Nenhum plano do tipo escada ativo. Nada a fazer.')
    return
  }

  for (const plano of planos) {
    const antes = await prisma.$queryRawUnsafe(
      `SELECT valor_de, percentual FROM comissao_faixa WHERE plano_id = ? ORDER BY valor_de`,
      Number(plano.id))
    console.log(`\nPlano #${plano.id} — ${plano.nome}`)
    console.log(`  antes: ${antes.length} faixa(s) | depois: ${FAIXAS.length}`)
    console.log(`  menor piso: ${brl(antes[0]?.valor_de ?? 0)} -> ${brl(FAIXAS[0][0])}`)
    console.log(`  maior percentual: ${Math.max(...antes.map((f) => Number(f.percentual)), 0)}% -> 30%`)

    if (!aplicar) continue

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM comissao_faixa WHERE plano_id = ?`, Number(plano.id))
      for (const [valorDe, percentual] of FAIXAS) {
        await tx.$executeRawUnsafe(
          `INSERT INTO comissao_faixa (plano_id, valor_de, percentual) VALUES (?,?,?)`,
          Number(plano.id), valorDe, percentual)
      }
    })
    const depois = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) q FROM comissao_faixa WHERE plano_id = ?`, Number(plano.id))
    console.log(`  gravado: ${Number(depois[0].q)} faixas.`)
  }

  if (!aplicar) console.log('\n(simulação — rode com --aplicar para gravar)')
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
