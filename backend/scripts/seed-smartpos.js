/**
 * Cadastra os SmartPOS homologados, por adquirente.
 *
 * A lista foi lida de https://mob.tef.net.br (página "Adquirentes e terminais") em
 * 26/10/2026. É a homologação do fornecedor TEF, a mesma que a triagem manda conferir
 * antes de prometer compatibilidade ao cliente.
 *
 * É cadastro: depois de rodar, dá para editar, desativar e acrescentar pela tela, sem
 * deploy. Rodar de novo atualiza pelo par (adquirente, modelo) e não apaga o que a equipe
 * tiver incluído.
 *
 *   node scripts/seed-smartpos.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const FONTE = 'mob.tef.net.br — homologação do fornecedor TEF, lida em 26/10/2026'

const CATALOGO = {
  'Rede': [['L400', 'Ingenico'], ['GPOS700', 'GPAY'], ['N960K', 'Newland']],
  'Cielo': [['L300', 'Ingenico'], ['DX8000', 'PAX']],
  'Stone': [['APOS A8', 'Sunmi'], ['P2', 'Ingenico'], ['L300', 'Ingenico'], ['L400', 'Ingenico']],
  'Getnet': [['APOS A8', 'Sunmi'], ['N910', 'Newland'], ['P2', 'Ingenico'], ['DX8000', 'PAX']],
  'SafraPay': [['APOS A8', 'Sunmi'], ['P2 / P3 Mini', 'Ingenico'], ['DX8000', 'PAX']],
  'PagSeguro': [['P2', 'Ingenico'], ['A910', 'PAX'], ['A930', 'PAX'], ['GPOS780', 'GPAY']],
  'BIN / Fiserv': [['P2', 'Ingenico'], ['DX8000', 'PAX']],
  'Azulzinha (Caixa)': [['P2', 'Ingenico'], ['DX8000', 'PAX']],
  'Clover': [['Clover Flex', 'Clover']],
  'Sicredi': [['P2', 'Ingenico'], ['DX8000', 'PAX']],
  'Sipag (Sicoob)': [['P2', 'Ingenico'], ['DX8000', 'PAX']],
  'Vero': [['L300', 'Ingenico'], ['GPOS700', 'GPAY'], ['P2', 'Ingenico'], ['N950', 'Newland']],
  'Multpag': [['A910', 'PAX'], ['P2', 'Ingenico'], ['NEW9220', 'Newland']],
  'Adiq': [['P2', 'Ingenico']],
  'InfinityPay': [['Android', null], ['iOS', null]],
  'Ceopag': [['A910', 'PAX']],
}

async function main() {
  let ordem = 0
  let total = 0
  for (const [adquirente, terminais] of Object.entries(CATALOGO)) {
    ordem += 10
    for (const [modelo, fabricante] of terminais) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO smartpos_homologado (adquirente, modelo, fabricante, fonte, ativo, ordem)
         VALUES (?,?,?,?,1,?)
         ON DUPLICATE KEY UPDATE fabricante = VALUES(fabricante), fonte = VALUES(fonte),
           ordem = VALUES(ordem)`,
        adquirente, modelo, fabricante, FONTE, ordem)
      total += 1
    }
  }
  const [q] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) t FROM smartpos_homologado WHERE ativo = 1`)
  console.log(`${total} terminais cadastrados em ${Object.keys(CATALOGO).length} adquirentes `
    + `(${Number(q.t)} ativos no total).`)
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
