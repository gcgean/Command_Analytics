const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const id = 40;
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  const novoAtivo = usuario.ativo === 'S' ? 'N' : 'S';
  await prisma.usuario.update({
    where: { id },
    data: { ativo: novoAtivo },
  });
  console.log('User status toggled to:', novoAtivo);
}

main().catch(console.error).finally(() => prisma.$disconnect());