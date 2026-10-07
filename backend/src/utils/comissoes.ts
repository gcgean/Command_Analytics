import { prisma } from '../database/client'

/**
 * Plano de remuneração comercial: fixo por fase + comissão progressiva sobre a implantação.
 *
 * A regra do plano é "faixa cheia": atingida a faixa, o percentual dela vale sobre TODO o
 * faturamento de implantação do mês, não só sobre o que passou do degrau.
 *
 * A base da comissão é tudo que o vendedor fechou no mês:
 *   implantação + migração (de `processo_implantacao_comercial`, que já guarda o vendedor),
 *   mensalidade dos clientes novos, upgrades e assinaturas do PayCore atribuídas a ele.
 *
 * Isso é diferente do Boletim Comercial, que mede só receita recorrente nova e não inclui
 * implantação: são duas perguntas distintas — quanto a empresa passou a faturar por mês contra
 * quanto cada vendedor produziu no período.
 */

/** Escada do plano apresentado: valor mínimo da faixa → percentual. */
const FAIXAS_PADRAO: Array<[number, number]> = [
  [1000, 5], [3000, 6], [5000, 7], [7500, 8], [10000, 10],
  [12500, 11], [15000, 14], [17500, 15], [20000, 16], [25000, 18], [30000, 20],
]

export async function initComissoes(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_plano (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      nome                VARCHAR(160) NOT NULL,
      descricao           TEXT NULL,
      -- 'vencimento' = implantação com vencimento no mês; 'processo' = pela data do processo.
      base_calculo        VARCHAR(20) NOT NULL DEFAULT 'vencimento',
      fixo_inicial        DECIMAL(12,2) NOT NULL DEFAULT 0,
      fixo_efetivo        DECIMAL(12,2) NOT NULL DEFAULT 0,
      meses_fase_inicial  INT NOT NULL DEFAULT 3,
      meta_referencia     DECIMAL(12,2) NOT NULL DEFAULT 0,
      ativo               TINYINT(1) NOT NULL DEFAULT 1,
      criado_em           DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em       DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_faixa (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      plano_id   INT NOT NULL,
      -- Faturamento mínimo de implantação no mês para a faixa valer.
      valor_de   DECIMAL(12,2) NOT NULL,
      percentual DECIMAL(6,3) NOT NULL,
      INDEX idx_comissao_faixa_plano (plano_id),
      UNIQUE KEY uk_comissao_faixa (plano_id, valor_de),
      CONSTRAINT fk_comissao_faixa_plano FOREIGN KEY (plano_id) REFERENCES comissao_plano(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Um vendedor por linha: é aqui que a meta deixa de ser do setor e passa a ser da pessoa.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_vendedor (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id         INT NOT NULL,
      plano_id           INT NOT NULL,
      data_admissao      DATE NULL,
      -- Quando preenchidos, sobrepõem o que vem do plano para esta pessoa.
      fixo_personalizado DECIMAL(12,2) NULL,
      meta_individual    DECIMAL(12,2) NULL,
      ativo              TINYINT(1) NOT NULL DEFAULT 1,
      criado_em          DATETIME NOT NULL DEFAULT NOW(),
      atualizado_em      DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY uk_comissao_vendedor (usuario_id),
      INDEX idx_comissao_vendedor_plano (plano_id),
      CONSTRAINT fk_comissao_vendedor_plano FOREIGN KEY (plano_id) REFERENCES comissao_plano(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Fechamento do mês. Guarda o resultado congelado: se a faixa mudar depois, o que foi pago não muda.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comissao_apuracao (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id  INT NOT NULL,
      competencia CHAR(7) NOT NULL,
      base        DECIMAL(12,2) NOT NULL DEFAULT 0,
      faixa_de    DECIMAL(12,2) NULL,
      percentual  DECIMAL(6,3) NOT NULL DEFAULT 0,
      variavel    DECIMAL(12,2) NOT NULL DEFAULT 0,
      fixo        DECIMAL(12,2) NOT NULL DEFAULT 0,
      total       DECIMAL(12,2) NOT NULL DEFAULT 0,
      observacao  VARCHAR(400) NULL,
      fechado_em  DATETIME NOT NULL DEFAULT NOW(),
      fechado_por INT NULL,
      UNIQUE KEY uk_comissao_apuracao (usuario_id, competencia),
      INDEX idx_comissao_apuracao_comp (competencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Semeia o plano do documento, uma vez só.
  const [c] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS q FROM comissao_plano`)
  if (Number(c?.q ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_plano
         (nome, descricao, base_calculo, fixo_inicial, fixo_efetivo, meses_fase_inicial, meta_referencia)
       VALUES (?,?,?,?,?,?,?)`,
      'Plano Comercial Command System',
      'Fixo + comissão progressiva sobre a implantação recebida. Atingida a faixa, o percentual '
        + 'vale sobre todo o faturamento de implantação do mês.',
      'vencimento', 2500, 3000, 3, 10000,
    )
    const [p] = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM comissao_plano ORDER BY id LIMIT 1`)
    for (const [de, perc] of FAIXAS_PADRAO) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO comissao_faixa (plano_id, valor_de, percentual) VALUES (?,?,?)`,
        Number(p.id), de, perc,
      )
    }
  }
}

export interface Plano {
  id: number
  nome: string
  descricao: string | null
  baseCalculo: string
  fixoInicial: number
  fixoEfetivo: number
  mesesFaseInicial: number
  metaReferencia: number
  ativo: boolean
  faixas: Array<{ id: number; valorDe: number; percentual: number }>
}

export async function listarPlanos(): Promise<Plano[]> {
  const planos = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM comissao_plano ORDER BY id`)
  const faixas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM comissao_faixa ORDER BY plano_id, valor_de`)
  return planos.map((p) => ({
    id: Number(p.id),
    nome: p.nome,
    descricao: p.descricao ?? null,
    baseCalculo: p.base_calculo,
    fixoInicial: Number(p.fixo_inicial ?? 0),
    fixoEfetivo: Number(p.fixo_efetivo ?? 0),
    mesesFaseInicial: Number(p.meses_fase_inicial ?? 0),
    metaReferencia: Number(p.meta_referencia ?? 0),
    ativo: !!p.ativo,
    faixas: faixas.filter((f) => Number(f.plano_id) === Number(p.id)).map((f) => ({
      id: Number(f.id), valorDe: Number(f.valor_de), percentual: Number(f.percentual),
    })),
  }))
}

/** A faixa vigente é a maior cujo piso o faturamento alcançou. */
export function faixaDe(base: number, faixas: Array<{ valorDe: number; percentual: number }>) {
  let atual: { valorDe: number; percentual: number } | null = null
  for (const f of [...faixas].sort((a, b) => a.valorDe - b.valorDe)) {
    if (base >= f.valorDe) atual = f
  }
  return atual
}

/** Quantos meses completos entre a admissão e o fim da competência. */
function mesesDesde(admissao: string | Date | null, competencia: string): number | null {
  if (!admissao) return null
  const d = new Date(admissao)
  const [ano, mes] = competencia.split('-').map(Number)
  if (!ano || !mes) return null
  return (ano - d.getFullYear()) * 12 + (mes - 1 - d.getMonth())
}

/** De onde veio cada parte da base — o vendedor precisa poder conferir a conta. */
export interface ComposicaoBase {
  implantacao: number
  migracao: number
  mensalidadeNova: number
  upgrades: number
  paycore: number
}

export interface LinhaApuracao {
  usuarioId: number
  nome: string
  composicao: ComposicaoBase
  planoId: number
  planoNome: string
  dataAdmissao: string | null
  mesesDeCasa: number | null
  emFaseInicial: boolean
  base: number
  processos: number
  meta: number
  percMeta: number | null
  faixaDe: number | null
  percentual: number
  variavel: number
  fixo: number
  total: number
  /** Quanto falta de implantação para alcançar a próxima faixa, e o que ela acrescenta. */
  proximaFaixa: { valorDe: number; percentual: number; falta: number; ganhoExtra: number } | null
  fechado: boolean
  fechadoEm: string | null
}

/**
 * Apura a competência (YYYY-MM) para todos os vendedores do plano. Se já houver fechamento
 * gravado, devolve o valor congelado — o que foi pago não muda porque a configuração mudou depois.
 */
export async function apurar(competencia: string): Promise<LinhaApuracao[]> {
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência inválida. Use AAAA-MM.')
  const [ano, mes] = competencia.split('-').map(Number)
  const inicio = `${competencia}-01`
  const fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`

  const planos = await listarPlanos()
  const porPlano = new Map(planos.map((p) => [p.id, p]))

  const vendedores = await prisma.$queryRawUnsafe<any[]>(
    `SELECT v.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, u.NOME_USU AS nome_usu
       FROM comissao_vendedor v
       LEFT JOIN usuario u ON u.COD_USU = v.usuario_id
      WHERE v.ativo = 1
      ORDER BY nome`)

  const fechamentos = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM comissao_apuracao WHERE competencia = ?`, competencia)

  const linhas: LinhaApuracao[] = []
  for (const v of vendedores) {
    const plano = porPlano.get(Number(v.plano_id))
    if (!plano) continue

    // A data que define "recebida" vem do plano: hoje o sistema só tem o vencimento da parcela.
    const coluna = plano.baseCalculo === 'processo' ? 'c.data_hora_dados' : 'c.data_venc_implantacao'
    const usuarioId = Number(v.usuario_id)

    // Implantação e migração do pacote de entrada, pelo vendedor do processo.
    const [b] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q,
              COALESCE(SUM(c.valor_implantacao), 0) AS implantacao,
              COALESCE(SUM(c.valor_migracao), 0) AS migracao
         FROM processo_implantacao_comercial c
        WHERE c.id_usu_vendedor = ? AND DATE(${coluna}) BETWEEN ? AND ?`,
      usuarioId, inicio, fim,
    ).catch(() => [{ q: 0, implantacao: 0, migracao: 0 }])

    // Mensalidade dos clientes novos. A tabela `cliente` não guarda vendedor: a atribuição é a
    // mesma do Boletim — o CRM pelo CNPJ e, na falta dele, quem fez o cadastro.
    const [mens] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
         LEFT JOIN usuario u ON u.COD_USU = c.cod_usu_local_Cad
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
          AND c.DATACADASTRO_CLI BETWEEN ? AND ?
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
          AND UPPER(TRIM(COALESCE(
                (SELECT nn.vendedor_nome FROM crm_negocio nn
                  WHERE nn.documento = REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','')
                    AND nn.vendedor_nome IS NOT NULL AND nn.vendedor_nome <> ''
                  ORDER BY COALESCE(nn.finalizado_em, nn.criado_em, nn.data) DESC, nn.id DESC LIMIT 1),
                NULLIF(u.NOME_USU, ''), ''))) IN (UPPER(TRIM(?)), UPPER(TRIM(?)))`,
      inicio, fim, v.nome ?? '', v.nome_usu ?? '',
    ).catch(() => [{ valor: 0 }])

    const [upg] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
         FROM comissoes_funcionario co
         INNER JOIN cliente c ON c.cod_cli = co.cod_cli
        WHERE co.cod_func = ? AND CAST(co.data_venda AS DATE) BETWEEN ? AND ?
          AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30`,
      usuarioId, inicio, fim,
    ).catch(() => [{ valor: 0 }])

    // No PayCore o vendedor já vem resolvido para o nosso COD_USU na sincronização.
    const [pay] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         INNER JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
        WHERE pc.vendedor_id = ? AND DATE(a.inicio) BETWEEN ? AND ?`,
      usuarioId, inicio, fim,
    ).catch(() => [{ valor: 0 }])

    const composicao: ComposicaoBase = {
      implantacao: Number(b?.implantacao ?? 0),
      migracao: Number(b?.migracao ?? 0),
      mensalidadeNova: Number(mens?.valor ?? 0),
      upgrades: Number(upg?.valor ?? 0),
      paycore: Number(pay?.valor ?? 0),
    }
    const base = composicao.implantacao + composicao.migracao
      + composicao.mensalidadeNova + composicao.upgrades + composicao.paycore
    const faixa = faixaDe(base, plano.faixas)
    const percentual = faixa?.percentual ?? 0
    const variavel = (base * percentual) / 100

    const meses = mesesDesde(v.data_admissao, competencia)
    const emFaseInicial = meses !== null && meses < plano.mesesFaseInicial
    const fixo = v.fixo_personalizado != null
      ? Number(v.fixo_personalizado)
      : emFaseInicial ? plano.fixoInicial : plano.fixoEfetivo

    const meta = v.meta_individual != null ? Number(v.meta_individual) : plano.metaReferencia

    // O próximo degrau vale sobre tudo, então o ganho extra não é só sobre a diferença.
    const acima = [...plano.faixas].sort((a, b2) => a.valorDe - b2.valorDe)
      .find((f) => f.valorDe > base)
    const proximaFaixa = acima
      ? {
          valorDe: acima.valorDe,
          percentual: acima.percentual,
          falta: acima.valorDe - base,
          ganhoExtra: (acima.valorDe * acima.percentual) / 100 - variavel,
        }
      : null

    const fechado = fechamentos.find((f) => Number(f.usuario_id) === Number(v.usuario_id))

    linhas.push({
      usuarioId,
      nome: v.nome ?? `Usuário ${usuarioId}`,
      composicao,
      planoId: plano.id,
      planoNome: plano.nome,
      dataAdmissao: v.data_admissao ? String(v.data_admissao).slice(0, 10) : null,
      mesesDeCasa: meses,
      emFaseInicial,
      base: fechado ? Number(fechado.base) : base,
      processos: Number(b?.q ?? 0),
      meta,
      percMeta: meta > 0 ? (base / meta) * 100 : null,
      faixaDe: fechado ? (fechado.faixa_de == null ? null : Number(fechado.faixa_de)) : faixa?.valorDe ?? null,
      percentual: fechado ? Number(fechado.percentual) : percentual,
      variavel: fechado ? Number(fechado.variavel) : variavel,
      fixo: fechado ? Number(fechado.fixo) : fixo,
      total: fechado ? Number(fechado.total) : fixo + variavel,
      proximaFaixa,
      fechado: !!fechado,
      fechadoEm: fechado?.fechado_em ?? null,
    })
  }
  return linhas.sort((a, b) => b.base - a.base)
}

/** Congela a apuração da competência, para o que foi pago não mudar depois. */
export async function fechar(competencia: string, usuarioId: number | null, porQuem: number | null) {
  const linhas = await apurar(competencia)
  const alvo = usuarioId ? linhas.filter((l) => l.usuarioId === usuarioId) : linhas
  for (const l of alvo) {
    if (l.fechado) continue
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_apuracao
         (usuario_id, competencia, base, faixa_de, percentual, variavel, fixo, total, fechado_por)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE base=VALUES(base), faixa_de=VALUES(faixa_de),
         percentual=VALUES(percentual), variavel=VALUES(variavel), fixo=VALUES(fixo),
         total=VALUES(total), fechado_por=VALUES(fechado_por), fechado_em=NOW()`,
      l.usuarioId, competencia, l.base, l.faixaDe, l.percentual, l.variavel, l.fixo, l.total, porQuem,
    )
  }
  return { fechados: alvo.filter((l) => !l.fechado).length }
}

export async function reabrir(competencia: string, usuarioId: number) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM comissao_apuracao WHERE competencia = ? AND usuario_id = ?`, competencia, usuarioId)
  return { ok: true }
}
