import { prisma } from './src/database/client'
async function main() {
  const aud: any[] = await prisma.$queryRaw`
    SELECT id, acao, usuario_nome, criado_em, dados_antes, dados_depois
    FROM auditoria
    WHERE tabela='cliente_prontuario' AND registro_id=1990
    ORDER BY criado_em ASC
  `
  for (const a of aud) {
    const antes = JSON.parse(a.dados_antes || '{}').prontuario || ''
    const depois = JSON.parse(a.dados_depois || '{}').prontuario || ''
    console.log(`--- #${a.id} ${a.usuario_nome} em ${a.criado_em.toISOString()} ---`)
    console.log('ANTES (', antes.length, 'chars):', antes.slice(0,120))
    console.log('DEPOIS(', depois.length, 'chars):', depois.slice(0,120))
    console.log()
  }
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
