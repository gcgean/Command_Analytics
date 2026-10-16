/**
 * Checklists de instalação de meios de pagamento, para o técnico.
 *
 * Complementam os que já existem: INTEGRAÇÃO TEF e INTEGRAÇÃO P.O.S cobrem o fluxo
 * comercial (liberação financeira, contato com o fornecedor, acompanhamento). Estes aqui
 * são o que o técnico confere na instalação, item a item.
 *
 * É cadastro: depois de rodar, os itens podem ser editados na tela de Cadastro de Checklist
 * sem deploy. Rodar de novo atualiza os itens pelo nome.
 *
 *   node scripts/seed-checklists-instalacao-pagamento.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TELAS = ['implantacao', 'triagem']

// O mínimo para dar a integração por funcionando. Cada item é um impedimento real:
// sem ele, ou a instalação não anda, ou ela "termina" sem estar pronta.
const CHECKLISTS = [
  {
    nome: 'INSTALAÇÃO TEF/PinPad — Técnico',
    descricao: 'O mínimo para a integração TEF funcionar.',
    itens: [
      'Cadastro aprovado pelo fornecedor TEF',
      'PinPad reconhecido e formas de pagamento configuradas no Command',
      'Venda teste aprovada, com o retorno recebido no Command',
      'Comprovante da venda teste enviado ao fornecedor TEF',
    ],
  },
  {
    nome: 'INSTALAÇÃO SmartPOS — Técnico',
    descricao: 'O mínimo para a integração SmartPOS funcionar.',
    itens: [
      'Habilitação MobTEF concluída e MPM+ no aparelho',
      'Aparelho pareado e formas de pagamento configuradas no Command',
      'Venda teste aprovada, com o valor correto no aparelho',
      'Retorno da transação recebido sem o operador digitar nada',
    ],
  },
]

async function main() {
  for (const c of CHECKLISTS) {
    const [existe] = await prisma.$queryRawUnsafe(
      `SELECT id FROM cadastro_checklists WHERE nome = ?`, c.nome)
    if (existe) {
      await prisma.$executeRawUnsafe(
        `UPDATE cadastro_checklists SET descricao = ?, itens = ?, telas = ?, ativo = 1
          WHERE id = ?`,
        c.descricao, JSON.stringify(c.itens), JSON.stringify(TELAS), Number(existe.id))
      console.log(`atualizado: ${c.nome} (${c.itens.length} itens)`)
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cadastro_checklists (nome, descricao, itens, telas, etapas, ativo, ordem)
         VALUES (?,?,?,?,'[]',1,98)`,
        c.nome, c.descricao, JSON.stringify(c.itens), JSON.stringify(TELAS))
      console.log(`criado: ${c.nome} (${c.itens.length} itens)`)
    }
  }
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
