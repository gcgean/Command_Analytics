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
    descricao: 'Verificação do técnico na instalação do TEF com PinPad. '
      + 'A integração só é considerada instalada com todos os itens conferidos.',
    itens: [
      // Antes de ir ao cliente
      'Cadastro aprovado pelo fornecedor TEF (sem aprovação, não iniciar a instalação)',
      'EC e número lógico da adquirente em mãos e conferidos com o cadastro aprovado',
      'PinPad no local, com cabo e fonte, e modelo compatível confirmado',
      'Acesso remoto combinado e testado antes do horário marcado',
      'Movimento do caixa combinado com o cliente (instalar fora do pico)',
      // Instalação
      'Aplicativo de acesso do fornecedor TEF instalado na máquina do cliente',
      'Homologação por DLL informada ao fornecedor e pasta do sistema fiscal liberada',
      'PinPad reconhecido pelo sistema operacional, na porta correta',
      'Sistema do cliente atualizado na versão que suporta a integração',
      // Configuração no Command
      'Caixa/PDV configurado para usar o TEF',
      'Formas de pagamento criadas e vinculadas: crédito, débito e as demais que o cliente aceita',
      'Parcelamento configurado conforme o combinado com a adquirente',
      // Testes obrigatórios
      'Venda teste no crédito: valor enviado ao PinPad confere com o da venda',
      'Venda teste no débito: pagamento autorizado e retorno recebido pelo Command',
      'Comprovante impresso e foto do primeiro cupom enviada ao fornecedor TEF',
      'Cancelamento/estorno de teste executado e confirmado nos dois lados',
      'Forma de pagamento gravada corretamente no movimento do caixa',
      'Documento fiscal da venda teste emitido e conferido, quando aplicável',
      'Fechamento de caixa com a venda teste: valores batendo',
      // Encerramento
      'Confirmação do fornecedor TEF após o envio do comprovante',
      'Operador do cliente fez uma venda real acompanhada pelo técnico',
      'Cliente orientado sobre o que fazer quando a transação não retornar',
      'Dados do equipamento registrados no cadastro de maquininhas do cliente',
    ],
  },
  {
    nome: 'INSTALAÇÃO SmartPOS — Técnico',
    descricao: 'Verificação do técnico na integração do SmartPOS ao Command. '
      + 'A integração só é considerada instalada com todos os itens conferidos.',
    itens: [
      // Antes
      'Modelo e número de série conferidos na etiqueta ou no menu "Sobre" do aparelho',
      'Compatibilidade do modelo com a adquirente confirmada pela equipe técnica',
      'Habilitação MobTEF solicitada e concluída (portal.tef.net.br)',
      'Aplicativo MPM+ disponível e atualizado no aparelho',
      'Aparelho conectado à internet, com sinal estável no ponto de uso',
      // Configuração
      'Aparelho pareado com o Command e respondendo ao comando de venda',
      'Caixa/PDV configurado para enviar a cobrança ao SmartPOS',
      'Formas de pagamento criadas e vinculadas às do aparelho',
      'Parcelamento configurado conforme o combinado com a adquirente',
      // Testes obrigatórios
      'Venda teste: valor chega ao aparelho igual ao da venda',
      'Pagamento de teste autorizado no aparelho',
      'Retorno da transação recebido pelo Command, sem o operador digitar nada',
      'Forma de pagamento gravada corretamente no movimento do caixa',
      'Cancelamento/estorno de teste executado e confirmado nos dois lados',
      'Documento fiscal da venda teste emitido e conferido, quando aplicável',
      'Teste de queda de conexão: comportamento conhecido e explicado ao cliente',
      'Fechamento de caixa com a venda teste: valores batendo',
      // Encerramento
      'Operador do cliente fez uma venda real acompanhada pelo técnico',
      'Cliente orientado sobre o que fazer quando a transação não retornar',
      'Dados do equipamento registrados no cadastro de maquininhas do cliente',
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
