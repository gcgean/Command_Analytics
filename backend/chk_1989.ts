import { prisma } from './src/database/client'
async function main() {
  const c: any[] = await prisma.$queryRaw`SELECT LENGTH(OBS_VENDA) AS len, OBS_VENDA AS obs FROM cliente WHERE cod_cli=1989`
  console.log('len:', Number(c[0]?.len))
  console.log('primeiros 400 chars (raw):')
  console.log(JSON.stringify(String(c[0]?.obs).slice(0,400)))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
