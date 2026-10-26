/**
 * Acrescenta os terminais da lista de HABILITAÇÃO, do formulário "Vinculação Smart TEF"
 * (atendimento.poscontrole.com.br/form/10009), lida em 26/10/2026.
 *
 * Por que duas listas: a página mob.tef.net.br é a vitrine, e esta é a lista operacional —
 * o que de fato aparece no formulário que a equipe preenche para pedir a habilitação. As
 * duas não batem (a Stone, por exemplo, tem 7 modelos aqui e 4 lá), e cada terminal guarda
 * de onde veio.
 *
 * A observação diz qual opção escolher no formulário. É isso que falta quando o técnico
 * sabe o modelo mas não sabe o que marcar na hora de pedir.
 *
 *   node scripts/seed-smartpos-habilitacao.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const FONTE = 'Formulário de habilitação Smart TEF (POS Controle), lido em 26/10/2026'

// Nomes diferentes para a mesma adquirente criariam dois grupos na tela.
const APELIDOS = {
  'Bin': 'BIN / Fiserv',
  'Caixa': 'Azulzinha (Caixa)',
  'Safra': 'SafraPay',
  'Sipag': 'Sipag (Sicoob)',
  'GetNet': 'Getnet',
  'Picpay': 'PicPay',
}

// [serviço no formulário, adquirente, [modelos], fabricante conhecido]
const SERVICOS = [
  ['_Celular Android - Testes e Homologação', 'Testes e homologação', ['Celular Android'], null],
  ['Bin - DX8000, P2 e N950', 'Bin', ['DX8000', 'P2', 'N950'], null],
  ['Caixa - DX8000, P2 e N950', 'Caixa', ['DX8000', 'P2', 'N950'], null],
  ['Cielo - LIO 2 / L300 / L400 / DX8000', 'Cielo', ['LIO 2', 'L300', 'L400', 'DX8000'], null],
  ['Clover - Claro Pay', 'Clover', ['Claro Pay'], 'Clover'],
  ['Clover - Servidor Bin', 'Clover', ['Servidor Bin'], 'Clover'],
  ['Clover - Servidor Caixa', 'Clover', ['Servidor Caixa'], 'Clover'],
  ['Clover - Servidor Sicredi', 'Clover', ['Servidor Sicredi'], 'Clover'],
  ['Clover - XP Pay', 'Clover', ['XP Pay'], 'Clover'],
  ['GetNet - A8 / P2 / P3 / N910 / DX8000', 'GetNet', ['A8', 'P2', 'P3', 'N910', 'DX8000'], null],
  ['Mercado Pago - Smart Point 2', 'Mercado Pago', ['Smart Point 2'], null],
  ['PagSeguro - A930 / GPOS 780 / GPOS 780S / P2 / P2-A11', 'PagSeguro',
    ['A930', 'GPOS 780', 'GPOS 780S', 'P2', 'P2-A11'], null],
  ['Picpay - P2', 'Picpay', ['P2'], 'Ingenico'],
  ['Rede - L400 / N960K', 'Rede', ['L400', 'N960K'], null],
  ['Safra - A8 / P2 / L300', 'Safra', ['A8', 'P2', 'L300'], null],
  ['Sicredi - DX8000, P2 e N950', 'Sicredi', ['DX8000', 'P2', 'N950'], null],
  ['Sipag - P2 / DX800 / X990', 'Sipag', ['P2', 'DX800', 'X990'], null],
  ['Stone - A8 / P2 / P2 A11 / L400 / T8 TECTOY / GPOS 730 / GPOS 700X', 'Stone',
    ['A8', 'P2', 'P2 A11', 'L400', 'T8 TECTOY', 'GPOS 730', 'GPOS 700X'], null],
  ['Vero - L300 / P2 / N950', 'Vero', ['L300', 'P2', 'N950'], null],
]

// As duas fontes escrevem o mesmo aparelho de jeitos diferentes. O nome é normalizado
// antes de gravar: sem isso a tela mostra o mesmo modelo duas vezes.
const SINONIMOS = [
  ['APOS A8', 'A8'],
  ['GPOS780', 'GPOS 780'],
  ['P2 A11', 'P2-A11'],
]
const canonico = (modelo) =>
  (SINONIMOS.find(([d]) => d === modelo) ?? [null, modelo])[1]

// Fabricante pelo nome do modelo, para os que a lista não traz. Só os padrões óbvios —
// na dúvida fica em branco, que é melhor do que chutar.
function fabricanteDe(modelo) {
  const m = modelo.toUpperCase()
  if (/^(P2|P3|L300|L400|LIO)/.test(m)) return 'Ingenico'
  if (/^(A8|APOS)/.test(m)) return 'Sunmi'
  if (/^(A9\d\d|DX8|DX\d)/.test(m)) return 'PAX'
  if (/^(N9\d\d|NEW\d)/.test(m)) return 'Newland'
  if (/^GPOS/.test(m)) return 'GPAY'
  return null
}

async function main() {
  let novos = 0
  let atualizados = 0
  let ordem = 1000

  for (const [servico, adquirenteBruta, modelos, fabricanteFixo] of SERVICOS) {
    const adquirente = APELIDOS[adquirenteBruta] ?? adquirenteBruta
    ordem += 10
    for (const modeloBruto of modelos) {
      const modelo = canonico(modeloBruto)
      const [existe] = await prisma.$queryRawUnsafe(
        `SELECT id, fonte FROM smartpos_homologado WHERE adquirente = ? AND modelo = ?`,
        adquirente, modelo)

      const observacao = `No formulário de habilitação, escolher: "${servico}"`.slice(0, 400)
      const fabricante = fabricanteFixo ?? fabricanteDe(modelo)

      if (existe) {
        // Já veio da vitrine: a fonte passa a registrar as duas, sem perder a primeira.
        const fonte = String(existe.fonte || '').includes('habilitação')
          ? existe.fonte
          : `${existe.fonte ? `${existe.fonte} | ` : ''}${FONTE}`.slice(0, 200)
        await prisma.$executeRawUnsafe(
          `UPDATE smartpos_homologado
              SET fonte = ?, observacao = ?, fabricante = COALESCE(fabricante, ?), ativo = 1
            WHERE id = ?`,
          fonte, observacao, fabricante, Number(existe.id))
        atualizados += 1
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO smartpos_homologado
             (adquirente, modelo, fabricante, observacao, fonte, ativo, ordem)
           VALUES (?,?,?,?,?,1,?)`,
          adquirente, modelo, fabricante, observacao, FONTE, ordem)
        novos += 1
      }
    }
  }

  // Reconcilia o que execuções anteriores gravaram com o nome antigo.
  let unificados = 0
  for (const [duplicado, canonico] of SINONIMOS) {
    const linhas = await prisma.$queryRawUnsafe(
      `SELECT id, adquirente, fonte, observacao, fabricante FROM smartpos_homologado WHERE modelo = ?`,
      duplicado)
    for (const d of linhas) {
      const [alvo] = await prisma.$queryRawUnsafe(
        `SELECT id, fonte, observacao FROM smartpos_homologado WHERE adquirente = ? AND modelo = ?`,
        d.adquirente, canonico)
      if (alvo) {
        // Mantém o canônico e junta o que o duplicado sabia.
        const fontes = [...new Set([
          ...String(alvo.fonte || '').split(' | '),
          ...String(d.fonte || '').split(' | '),
        ].filter(Boolean))].join(' | ').slice(0, 200)
        await prisma.$executeRawUnsafe(
          `UPDATE smartpos_homologado
              SET fonte = ?, observacao = COALESCE(?, observacao), fabricante = COALESCE(fabricante, ?)
            WHERE id = ?`,
          fontes, alvo.observacao || d.observacao, d.fabricante, Number(alvo.id))
        await prisma.$executeRawUnsafe(
          `DELETE FROM smartpos_homologado WHERE id = ?`, Number(d.id))
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE smartpos_homologado SET modelo = ? WHERE id = ?`, canonico, Number(d.id))
      }
      unificados += 1
    }
  }
  if (unificados > 0) console.log(`${unificados} modelo(s) com nome duplicado unificados.`)

  const [q] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) t, COUNT(DISTINCT adquirente) a FROM smartpos_homologado WHERE ativo = 1`)
  console.log(`${novos} terminais novos, ${atualizados} atualizados. `
    + `Catálogo com ${Number(q.t)} terminais em ${Number(q.a)} adquirentes.`)
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
