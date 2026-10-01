import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { enviarEmail, montarHtmlEmail } from '../utils/email'

/**
 * Propostas comerciais de implantação. Antes a tela só calculava na memória do navegador: ao
 * recarregar, o orçamento sumia e não havia registro do que foi enviado pro cliente. Aqui cada
 * proposta gerada fica gravada, com os valores do momento, pra servir de histórico e permitir
 * reenviar o mesmo e-mail depois.
 */
/** Acrescenta a coluna só se faltar — a tabela já pode existir da versão anterior da tela. */
async function garantirColuna(coluna: string, ddl: string) {
  const rows = await prisma.$queryRaw<Array<{ c: bigint | number }>>`
    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orcamento_proposta' AND COLUMN_NAME = ${coluna}
  `
  if (Number(rows[0]?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE orcamento_proposta ADD COLUMN ${ddl}`)
  }
}

export async function initOrcamentos(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS orcamento_proposta (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id     INT NULL,
      cliente_nome   VARCHAR(150) NULL,
      cliente_email  VARCHAR(150) NULL,
      valor_plano    DECIMAL(10,2) NOT NULL DEFAULT 0,
      subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
      desconto_perc  DECIMAL(5,2) NOT NULL DEFAULT 0,
      total          DECIMAL(10,2) NOT NULL DEFAULT 0,
      parcelas       INT NOT NULL DEFAULT 1,
      validade_dias  INT NOT NULL DEFAULT 15,
      itens          TEXT NULL,
      observacoes    VARCHAR(1000) NULL,
      email_enviado  TINYINT(1) NOT NULL DEFAULT 0,
      usuario_id     INT NULL,
      criado_em      DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_orcamento_cliente (cliente_id),
      INDEX idx_orcamento_data (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // A tela virou precificação interna: além do que será cobrado, guarda o custo apurado e a
  // margem resultante. Sem isso não dá pra olhar para trás e saber se o preço fechado deu lucro.
  await garantirColuna('custo_implantacao', 'custo_implantacao DECIMAL(10,2) NOT NULL DEFAULT 0')
  await garantirColuna('custo_mensal', 'custo_mensal DECIMAL(10,2) NOT NULL DEFAULT 0')
  await garantirColuna('preco_implantacao', 'preco_implantacao DECIMAL(10,2) NOT NULL DEFAULT 0')
  await garantirColuna('lucro_implantacao', 'lucro_implantacao DECIMAL(10,2) NOT NULL DEFAULT 0')
  await garantirColuna('lucro_mensal', 'lucro_mensal DECIMAL(10,2) NOT NULL DEFAULT 0')
  await garantirColuna('margem_perc', 'margem_perc DECIMAL(6,2) NOT NULL DEFAULT 0')
  await garantirColuna('impostos_perc', 'impostos_perc DECIMAL(6,2) NOT NULL DEFAULT 0')
  await garantirColuna('comissao_perc', 'comissao_perc DECIMAL(6,2) NOT NULL DEFAULT 0')
  await garantirColuna('payback_meses', 'payback_meses DECIMAL(6,1) NULL')
}

interface ItemProposta { descricao: string; detalhe?: string; valor: number }

const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function montarHtmlProposta(p: {
  clienteNome: string
  itens: ItemProposta[]
  subtotal: number
  descontoPerc: number
  descontoValor: number
  total: number
  valorPlano: number
  parcelas: number
  validadeDias: number
  observacoes?: string | null
}): string {
  const linhas = p.itens
    .filter((i) => i.valor > 0)
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0">
          <strong>${i.descricao}</strong>
          ${i.detalhe ? `<br><span style="color:#64748b;font-size:12px">${i.detalhe}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${moeda(i.valor)}</td>
      </tr>`,
    )
    .join('')

  const parcelaValor = p.parcelas > 1 ? p.total / p.parcelas : 0

  return montarHtmlEmail(
    'Proposta Comercial',
    `
    <p>Olá${p.clienteNome ? `, <strong>${p.clienteNome}</strong>` : ''}!</p>
    <p>Segue a proposta de implantação do nosso sistema.</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${linhas || '<tr><td style="padding:8px 0;color:#64748b">Sem custos de implantação.</td></tr>'}
      <tr>
        <td style="padding:8px 0"><strong>Subtotal</strong></td>
        <td style="padding:8px 0;text-align:right"><strong>${moeda(p.subtotal)}</strong></td>
      </tr>
      ${p.descontoValor > 0
        ? `<tr>
             <td style="padding:4px 0;color:#16a34a">Desconto (${p.descontoPerc}%)</td>
             <td style="padding:4px 0;text-align:right;color:#16a34a">- ${moeda(p.descontoValor)}</td>
           </tr>`
        : ''}
      <tr>
        <td style="padding:12px 0;border-top:2px solid #1e293b;font-size:16px"><strong>Total da implantação</strong></td>
        <td style="padding:12px 0;border-top:2px solid #1e293b;text-align:right;font-size:16px"><strong>${moeda(p.total)}</strong></td>
      </tr>
      ${p.parcelas > 1
        ? `<tr><td colspan="2" style="padding:4px 0;color:#64748b;font-size:13px">
             ou ${p.parcelas}x de ${moeda(parcelaValor)}
           </td></tr>`
        : ''}
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:16px 0">
      <span style="color:#166534">Mensalidade do plano</span><br>
      <strong style="color:#166534;font-size:18px">${moeda(p.valorPlano)}/mês</strong>
    </div>

    ${p.observacoes ? `<p style="white-space:pre-wrap"><strong>Observações:</strong><br>${p.observacoes}</p>` : ''}

    <p style="color:#64748b;font-size:13px">
      Proposta válida por ${p.validadeDias} dias. Qualquer dúvida, é só responder este e-mail.
    </p>`,
    'Proposta gerada pelo Command Analytics — Cilos Sistema.',
  )
}

export async function orcamentosRoutes(app: FastifyInstance) {
  // GET /orcamentos — histórico das últimas propostas
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Orçamentos'] } }, async (request) => {
    const { clienteId, limite } = request.query as Record<string, string>
    const take = Math.min(Number(limite || 30), 100)
    const linhas = clienteId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM orcamento_proposta WHERE cliente_id = ? ORDER BY id DESC LIMIT ?`,
          Number(clienteId), take,
        )
      : await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM orcamento_proposta ORDER BY id DESC LIMIT ?`, take)

    return linhas.map((l) => ({
      id: Number(l.id),
      clienteId: l.cliente_id ? Number(l.cliente_id) : null,
      clienteNome: l.cliente_nome,
      clienteEmail: l.cliente_email,
      valorPlano: Number(l.valor_plano),
      subtotal: Number(l.subtotal),
      descontoPerc: Number(l.desconto_perc),
      total: Number(l.total),
      parcelas: Number(l.parcelas),
      validadeDias: Number(l.validade_dias),
      observacoes: l.observacoes,
      custoImplantacao: Number(l.custo_implantacao ?? 0),
      custoMensal: Number(l.custo_mensal ?? 0),
      precoImplantacao: Number(l.preco_implantacao ?? 0),
      lucroImplantacao: Number(l.lucro_implantacao ?? 0),
      lucroMensal: Number(l.lucro_mensal ?? 0),
      margemPerc: Number(l.margem_perc ?? 0),
      paybackMeses: l.payback_meses === null || l.payback_meses === undefined ? null : Number(l.payback_meses),
      emailEnviado: Number(l.email_enviado) === 1,
      criadoEm: l.criado_em,
      itens: (() => {
        try { return JSON.parse(l.itens || '[]') as ItemProposta[] } catch { return [] as ItemProposta[] }
      })(),
    }))
  })

  // POST /orcamentos — grava a proposta e, se pedirem, manda por e-mail
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Orçamentos'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const itens: ItemProposta[] = Array.isArray(b.itens) ? b.itens : []
    const enviarPara = String(b.enviarPara ?? '').trim()

    if (enviarPara && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(enviarPara)) {
      return reply.status(400).send({ error: 'E-mail de destino inválido.' })
    }

    const subtotal = Number(b.subtotal ?? 0)
    const descontoPerc = Number(b.descontoPerc ?? 0)
    const descontoValor = subtotal * (descontoPerc / 100)
    const total = Number(b.total ?? subtotal - descontoValor)

    await prisma.$executeRawUnsafe(
      `INSERT INTO orcamento_proposta
        (cliente_id, cliente_nome, cliente_email, valor_plano, subtotal, desconto_perc, total, parcelas, validade_dias, itens, observacoes, email_enviado, usuario_id,
         custo_implantacao, custo_mensal, preco_implantacao, lucro_implantacao, lucro_mensal, margem_perc, impostos_perc, comissao_perc, payback_meses)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?, ?,?,?,?,?,?,?,?,?)`,
      b.clienteId ? Number(b.clienteId) : null,
      String(b.clienteNome ?? '').slice(0, 150) || null,
      enviarPara || null,
      Number(b.valorPlano ?? 0),
      subtotal,
      descontoPerc,
      total,
      Math.max(1, Number(b.parcelas ?? 1)),
      Math.max(1, Number(b.validadeDias ?? 15)),
      JSON.stringify(itens).slice(0, 60000),
      String(b.observacoes ?? '').slice(0, 1000) || null,
      usuarioId,
      Number(b.custoImplantacao ?? 0),
      Number(b.custoMensal ?? 0),
      Number(b.precoImplantacao ?? b.total ?? 0),
      Number(b.lucroImplantacao ?? 0),
      Number(b.lucroMensal ?? 0),
      Number(b.margemPerc ?? 0),
      Number(b.impostosPerc ?? 0),
      Number(b.comissaoPerc ?? 0),
      b.paybackMeses === null || b.paybackMeses === undefined ? null : Number(b.paybackMeses),
    )
    const [novo] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
    const id = Number(novo?.id ?? 0)

    if (!enviarPara) return reply.status(201).send({ ok: true, id, emailEnviado: false })

    const envio = await enviarEmail({
      para: enviarPara,
      assunto: `Proposta comercial${b.clienteNome ? ` — ${b.clienteNome}` : ''}`,
      html: montarHtmlProposta({
        clienteNome: String(b.clienteNome ?? ''),
        itens,
        subtotal,
        descontoPerc,
        descontoValor,
        total,
        valorPlano: Number(b.valorPlano ?? 0),
        parcelas: Math.max(1, Number(b.parcelas ?? 1)),
        validadeDias: Math.max(1, Number(b.validadeDias ?? 15)),
        observacoes: b.observacoes,
      }),
    })

    // A proposta fica gravada mesmo se o e-mail falhar: o cálculo não se perde e dá pra reenviar.
    if (!envio.success) {
      return reply.status(201).send({ ok: true, id, emailEnviado: false, erroEmail: envio.error })
    }
    await prisma.$executeRawUnsafe(`UPDATE orcamento_proposta SET email_enviado = 1 WHERE id = ?`, id)
    return reply.status(201).send({ ok: true, id, emailEnviado: true })
  })

  // POST /orcamentos/:id/reenviar — manda de novo a mesma proposta
  app.post('/:id/reenviar', { preHandler: authMiddleware, schema: { tags: ['Orçamentos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { para } = request.body as { para?: string }

    const [linha] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM orcamento_proposta WHERE id = ?`, Number(id))
    if (!linha) return reply.status(404).send({ error: 'Proposta não encontrada.' })

    const destino = String(para ?? linha.cliente_email ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destino)) {
      return reply.status(400).send({ error: 'Informe um e-mail de destino válido.' })
    }

    const subtotal = Number(linha.subtotal)
    const descontoPerc = Number(linha.desconto_perc)
    const envio = await enviarEmail({
      para: destino,
      assunto: `Proposta comercial${linha.cliente_nome ? ` — ${linha.cliente_nome}` : ''}`,
      html: montarHtmlProposta({
        clienteNome: String(linha.cliente_nome ?? ''),
        itens: (() => { try { return JSON.parse(linha.itens || '[]') } catch { return [] } })(),
        subtotal,
        descontoPerc,
        descontoValor: subtotal * (descontoPerc / 100),
        total: Number(linha.total),
        valorPlano: Number(linha.valor_plano),
        parcelas: Number(linha.parcelas),
        validadeDias: Number(linha.validade_dias),
        observacoes: linha.observacoes,
      }),
    })
    if (!envio.success) return reply.status(400).send({ error: envio.error || 'Falha ao enviar o e-mail.' })

    await prisma.$executeRawUnsafe(`UPDATE orcamento_proposta SET email_enviado = 1, cliente_email = ? WHERE id = ?`, destino, Number(id))
    return { ok: true }
  })
}
