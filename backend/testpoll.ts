import { ensureServidorMonitorColumns, pollServidor } from './src/utils/servidorMonitor'

async function main() {
  await ensureServidorMonitorColumns()
  console.log('columns ensured')
  await pollServidor(8)
  console.log('polled 8 (vps1, expected online)')
  await pollServidor(12)
  console.log('polled 12 (apicilos, expected offline/timeout)')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
