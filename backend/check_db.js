const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRaw`SHOW COLUMNS FROM agenda`;
  console.log(result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
