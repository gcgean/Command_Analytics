const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const u = await prisma.usuario.findFirst({ where: { nomeUsu: 'naiane' } });
  console.log(u);
}

main().catch(console.error).finally(() => prisma.$disconnect());
