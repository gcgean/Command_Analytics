import { prisma } from './src/database/client'
async function main() {
  const c: any[] = await prisma.$queryRaw`SHOW COLUMNS FROM cliente WHERE Field='OBS_VENDA'`
  console.log(JSON.stringify(c))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
