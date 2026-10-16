/* Validação do fluxo: carrega o modelo do banco e roda o motor como as telas rodam. */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const j = (v, d) => { try { return JSON.parse(v || '') } catch { return d } }

function atende(c, r) {
  const b = r[c.chave]
  const t = Array.isArray(b) ? b.join('|') : String(b ?? '')
  const vazio = t.trim() === ''
  switch (c.operador) {
    case 'preenchido': return !vazio
    case 'vazio': return vazio
    case 'diferente': return t !== String(c.valor ?? '')
    case 'contem': return !vazio && t.toLowerCase().includes(String(c.valor ?? '').toLowerCase())
    default: return !vazio && t === String(c.valor ?? '')
  }
}

async function main() {
  const [m] = await prisma.$queryRawUnsafe(`SELECT * FROM triagem_modelo WHERE slug='meios-pagamento'`)
  const perguntas = (await prisma.$queryRawUnsafe(
    `SELECT * FROM triagem_pergunta WHERE modelo_id=? AND ativo=1 ORDER BY ordem,id`, m.id))
    .map(p => ({ ...p, condicao: j(p.condicao, null), opcoes: j(p.opcoes, []) }))
  const cenarios = (await prisma.$queryRawUnsafe(
    `SELECT * FROM triagem_cenario WHERE modelo_id=? AND ativo=1 ORDER BY ordem,id`, m.id))
    .map(c => ({ ...c, condicoes: j(c.condicoes, []), passos: j(c.passos, []) }))

  const visiveis = (r, cli) => perguntas.filter(p => {
    if (cli && p.publico === 'tecnico') return false
    if (!cli && p.publico === 'cliente') return false
    return !p.condicao || atende(p.condicao, r)
  })
  const cenarioDe = r => cenarios.find(c => c.condicoes.length && c.condicoes.every(x => atende(x, r))) || null
  const falta = (r, cli) => visiveis(r, cli).filter(p => p.obrigatoria
    && String(Array.isArray(r[p.chave]) ? r[p.chave].join('') : (r[p.chave] ?? '')).trim() === '')

  const linhas = []
  linhas.push(`modelo: ${m.nome} | tipo_processo: ${m.tipo_processo} | link: ${m.permite_link ? 'sim' : 'nao'}`)
  linhas.push(`perguntas: ${perguntas.length} | cenarios: ${cenarios.length}`)
  linhas.push('')
  linhas.push('-- cenarios com checklist vinculado --')
  for (const c of cenarios) linhas.push(`  ${c.checklist_id ? '[checklist ' + c.checklist_id + ']' : '[    sem    ]'} ${c.nome}`)

  // Os valores vêm do próprio cadastro: digitar o texto à mão aqui esconderia erro de acento.
  const opc = (chave, i) => perguntas.find(p => p.chave === chave).opcoes[i]
  const motivo = i => opc('motivo', i)
  const tema = i => opc('assunto_duvida', i)
  const equip = i => opc('equipamento', i)
  const MOT = perguntas.find(p => p.chave === 'motivo').opcoes
  linhas.push('')
  linhas.push('-- opcoes de motivo --')
  MOT.forEach((o, i) => linhas.push('  [' + i + '] ' + o))

  const base = {
    cnpj: '12345678000199', razao_social: 'Mercado Teste LTDA', responsavel: 'Ana',
    telefone: '85999990000', caixas: '2',
  }
  const iErro = MOT.findIndex(o => o.toLowerCase().includes('erro'))
  const iDuvida = MOT.findIndex(o => o.toLowerCase().includes('vid'))
  const iAdicional = MOT.findIndex(o => o.toLowerCase().includes('adicionar'))
  const iContratar = MOT.findIndex(o => o.toLowerCase().includes('contratar'))

  const casos = {
    'duvida delivery com SmartPOS': { ...base, motivo: motivo(iDuvida), assunto_duvida: tema(0), ja_integrado: 'Sim', equipamento: equip(2), modelo_smartpos: 'P2', serie_smartpos: '123', adquirente: 'Cielo' },
    'erro de transacao com TEF': { ...base, motivo: motivo(iErro), ja_integrado: 'Sim', equipamento: equip(3), ec_tef: '999', logico_tef: '001', adquirente: 'Rede', erro_data: '2026-10-15', erro_valor: '120,00', erro_documento: 'Não emitido' },
    'maquina adicional': { ...base, motivo: motivo(iAdicional), ja_integrado: 'Sim', equipamento: equip(2), modelo_smartpos: 'P2', serie_smartpos: '456', adquirente: 'Cielo' },
    'contratar com SmartPOS': { ...base, motivo: motivo(iContratar), ja_integrado: 'Não', equipamento: equip(2), modelo_smartpos: 'P2', serie_smartpos: '789', adquirente: 'Stone' },
    'contratar sem equipamento': { ...base, motivo: motivo(iContratar), ja_integrado: 'Não', equipamento: equip(0), adquirente: 'A definir' },
  }
  linhas.push('')
  linhas.push('-- roteamento --')
  for (const [nome, r] of Object.entries(casos)) {
    const c = cenarioDe(r)
    linhas.push(`  ${nome.padEnd(32)} -> ${c ? c.nome : '(nenhum)'}`
      + (c && c.prioridade !== 'normal' ? ` [${c.prioridade}]` : '')
      + (c && c.checklist_id ? ' [checklist]' : ''))
    linhas.push(`      perguntas visiveis: tecnico ${visiveis(r, false).length} | cliente ${visiveis(r, true).length}`
      + ` | obrigatorias em aberto: ${falta(r, false).length}`)
  }

  const soCliente = perguntas.filter(p => p.publico === 'tecnico').map(p => p.chave)
  linhas.push('')
  linhas.push(`perguntas que o link do cliente NUNCA mostra: ${soCliente.join(', ') || '(nenhuma)'}`)

  require('fs').writeFileSync('scripts/.valida-triagem.txt', linhas.join('\n'), 'utf8')
  console.log('ok')
}
main().catch(e => { console.error('ERRO:', String(e.message).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
