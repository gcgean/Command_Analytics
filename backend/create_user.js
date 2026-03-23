const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const maxId = await prisma.usuario.aggregate({ _max: { id: true } });
  const id = (maxId._max.id || 0) + 1;
  await prisma.usuario.create({
    data: {
      id,
      nomeUsu: 'testee',
      nomeCompleto: 'Teste',
      email: 'test@ee.com',
      cargo: 'Sup',
      ativo: 'S'
    }
  });
  console.log('User created with ID:', id);
}

main().catch(console.error).finally(() => prisma.$disconnect());