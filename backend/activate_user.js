const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const id = 12;
  await prisma.usuario.update({ where: { id }, data: { ativo: 'S' } });
  const u = await prisma.usuario.findUnique({ where: { id } });
  console.log(u);
}

main().catch(console.error).finally(() => prisma.$disconnect());
