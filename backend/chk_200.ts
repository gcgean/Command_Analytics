import { prisma } from './src/database/client'
async function main() {
  const rows: any[] = await prisma.$queryRaw`
    SELECT cod_cli, NOME_FANTASIA, LENGTH(OBS_VENDA) AS len, LEFT(OBS_VENDA,60) AS inicio
    FROM cliente WHERE LENGTH(OBS_VENDA) = 200
  `
  console.log('clientes com OBS_VENDA de exatamente 200 chars:', rows.length)
  rows.forEach((r:any)=>console.log(`#${r.cod_cli} ${r.NOME_FANTASIA}: ${r.inicio}`))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
