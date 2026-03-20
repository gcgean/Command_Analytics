/**
 * Script: migrate-senhas.ts
 * Lê o campo SENHA (plain text) de cada usuário e grava o hash bcrypt
 * no campo senha_analytics — apenas para usuários que ainda não têm hash.
 *
 * Executar: npx tsx scripts/migrate-senhas.ts
 */

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nomeUsu: true, senhaOriginal: true, senha: true },
  })

  let atualizados = 0
  let pulados = 0
  let semSenha = 0

  for (const u of usuarios) {
    if (!u.senhaOriginal) {
      semSenha++
      continue
    }
    if (u.senha) {
      // já tem hash — pular
      pulados++
      continue
    }

    const hash = await bcrypt.hash(u.senhaOriginal, 10)
    await prisma.usuario.update({
      where: { id: u.id },
      data: { senha: hash },
    })
    console.log(`✓ ${u.nomeUsu} (id=${u.id}) — hash gerado`)
    atualizados++
  }

  console.log(`\nConcluído: ${atualizados} atualizados | ${pulados} já tinham hash | ${semSenha} sem SENHA`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
