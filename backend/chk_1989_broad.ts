import { prisma } from './src/database/client'
async function main() {
  const aud: any[] = await prisma.$queryRaw`
    SELECT id, tabela, registro_id, acao, usuario_nome, criado_em
    FROM auditoria WHERE registro_id=1989 ORDER BY criado_em ASC
  `
  console.log('todas auditorias com registro_id=1989:', JSON.stringify(aud, (_k,v)=>typeof v==='bigint'?Number(v):v))

  // Verifica se ha algum backup/snapshot em outra tabela relacionada
  const cliente: any[] = await prisma.$queryRaw`SELECT cod_cli, NOME_FANTASIA, DATACADASTRO_CLI FROM cliente WHERE cod_cli=1989`
  console.log('cliente:', JSON.stringify(cliente, (_k,v)=>typeof v==='bigint'?Number(v):v))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
