import { prisma } from './src/database/client'
async function main() {
  const cliente: any[] = await prisma.$queryRaw`SELECT cod_cli, LENGTH(OBS_VENDA) AS len, OBS_VENDA AS obs FROM cliente WHERE cod_cli=1990`
  console.log('=== ESTADO ATUAL cliente 1990 ===')
  console.log('len:', cliente[0]?.len)
  console.log('conteudo (primeiros 500 chars):', String(cliente[0]?.obs).slice(0,500))
  console.log()

  const aud: any[] = await prisma.$queryRaw`
    SELECT id, acao, usuario_nome, criado_em, LENGTH(dados_antes) AS lenAntes, LENGTH(dados_depois) AS lenDepois
    FROM auditoria
    WHERE tabela='cliente_prontuario' AND registro_id=1990
    ORDER BY criado_em ASC
  `
  console.log('=== HISTORICO DE AUDITORIA (cliente_prontuario, registro 1990) ===')
  console.log(JSON.stringify(aud, (_k,v)=>typeof v==='bigint'?Number(v):v, 1))
  await prisma.$disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
