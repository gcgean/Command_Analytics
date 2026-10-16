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

const CHECKLISTS = [
  {
    nome: 'INSTALAÇÃO TEF/PinPad — Técnico',
    descricao: 'O que o técnico confere na instalação do TEF com PinPad.',
    itens: [
      'Cadastro aprovado pelo fornecedor TEF',
      'PinPad instalado e reconhecido pelo sistema',
      'Formas de pagamento e PDV configurados no Command',
      'Venda teste no crédito e no débito aprovadas',
      'Retorno da transação recebido no Command',
      'Comprovante da venda teste enviado ao fornecedor TEF',
      'Estorno de teste confirmado nos dois lados',
      'Fechamento de caixa com a venda teste batendo',
      'Maquininha registrada no cadastro do cliente',
    ],
  },
  {
    nome: 'INSTALAÇÃO SmartPOS — Técnico',
    descricao: 'O que o técnico confere na integração do SmartPOS ao Command.',
    itens: [
      'Modelo compatível confirmado e habilitação MobTEF concluída',
      'MPM+ atualizado e aparelho conectado à internet',
      'Aparelho respondendo ao comando de venda do Command',
      'Formas de pagamento e PDV configurados no Command',
      'Venda teste aprovada, com o valor correto no aparelho',
      'Retorno da transação recebido sem o operador digitar nada',
      'Estorno de teste confirmado nos dois lados',
      'Fechamento de caixa com a venda teste batendo',
      'Maquininha registrada no cadastro do cliente',
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
