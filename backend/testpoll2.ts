import { prisma } from './src/database/client'
import { checarServidor } from './src/utils/servidorMonitor'

async function main() {
  const s = await prisma.servidor.findUnique({ where: { id: 8 } })
  console.log('servidor row:', s)
  const r = await checarServidor(s as any)
  console.log('resultado:', r)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
