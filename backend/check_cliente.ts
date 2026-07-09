import { prisma } from './src/database/client'

async function main() {
  const cols: any[] = await prisma.$queryRaw`SHOW COLUMNS FROM cliente`
  console.log(cols.map((c:any)=>c.Field).join(', '))
  const rows: any[] = await prisma.$queryRaw`
    SELECT * FROM cliente WHERE COD_CLI = 424
  `
  console.log(JSON.stringify(rows, (_k,v)=>typeof v==='bigint'?Number(v):v, 2))
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
