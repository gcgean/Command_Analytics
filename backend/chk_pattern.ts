import { prisma } from './src/database/client'
async function main() {
  const rows: any[] = await prisma.$queryRaw`
    SELECT cod_cli, NOME_FANTASIA, LENGTH(OBS_VENDA) AS len,
      LEFT(OBS_VENDA, 30) AS inicio
    FROM cliente
    WHERE OBS_VENDA LIKE '%--TW-BORDER-SPACING%'
    ORDER BY cod_cli
  `
  console.log('total clientes com esse padrao de CSS junk:', rows.length)
  rows.forEach((r:any) => console.log(`#${r.cod_cli} ${r.NOME_FANTASIA} | len=${Number(r.len)} | inicio: ${r.inicio}`))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
