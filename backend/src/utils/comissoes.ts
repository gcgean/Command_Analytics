import { prisma } from '../database/client'
import { percentualMetaGeral } from './metaGeral'
import { treinamentosAvaliados, type TreinamentoAvaliado } from './treinamentos'
import { comissaoAgente, certificadosEmitidos, type CertificadoEmitido } from './comissaoAgente'
import { comissaoPorCanal, type ApuracaoCanal } from './comissaoCanal'
import { avulsasPorUsuario, type ComissaoAvulsa } from './comissaoAvulsa'

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
      -- 'escada'       = comissão progressiva sobre o que a própria pessoa vendeu;
      -- 'proporcional' = bônus fixo multiplicado pelo % da meta que a EMPRESA bateu.
      tipo                VARCHAR(20) NOT NULL DEFAULT 'escada',
      valor_bonus         DECIMAL(12,2) NOT NULL DEFAULT 0,
      -- Quais produtos contam na base: 'todos', 'command' ou 'cilos'.
      escopo_produto      VARCHAR(20) NOT NULL DEFAULT 'todos',
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

  // Bonus por meta batida e por treinamento bem avaliado. Sao por PESSOA, nao por plano:
  // dois lideres no mesmo plano recebem valores diferentes, e e isso que o cadastro precisa
  // dizer. Colunas adicionadas aqui para bancos que ja tinham a tabela.
  for (const [coluna, tipo] of [
    ['bonus_meta', 'DECIMAL(12,2) NULL'],
    ['bonus_treinamento', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ]) {
    const [existe] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comissao_vendedor'
         AND COLUMN_NAME = ?`, coluna)
    if (!Number(existe?.total ?? 0)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE comissao_vendedor ADD COLUMN ${coluna} ${tipo}`).catch(() => {})
    }
  }

  // Quanto vale o treinamento bem avaliado. No plano, porque e regra da empresa, nao da pessoa.
  for (const [coluna, tipo] of [
    ['treino_nota_minima', 'DECIMAL(4,2) NOT NULL DEFAULT 9'],
    ['treino_valor_base', 'DECIMAL(12,2) NOT NULL DEFAULT 100'],
    ['treino_valor_unitario', 'DECIMAL(12,2) NOT NULL DEFAULT 20'],
  ]) {
    const [existe] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comissao_plano'
         AND COLUMN_NAME = ?`, coluna)
    if (!Number(existe?.total ?? 0)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE comissao_plano ADD COLUMN ${coluna} ${tipo}`).catch(() => {})
    }
  }

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

  // Colunas acrescentadas depois; o projeto não usa migrations.
  for (const [coluna, definicao] of [
    ['tipo', "VARCHAR(20) NOT NULL DEFAULT 'escada'"],
    ['valor_bonus', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
    ['escopo_produto', "VARCHAR(20) NOT NULL DEFAULT 'todos'"],
  ] as const) {
    const [existe] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'comissao_plano' AND column_name = ?`, coluna)
    if (Number(existe?.q ?? 0) === 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE comissao_plano ADD COLUMN \`${coluna}\` ${definicao}`)
    }
  }

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
  /** 'escada' (individual, progressiva) ou 'proporcional' (bônus × % da meta da empresa). */
  tipo: string
  valorBonus: number
  /** 'todos' | 'command' | 'cilos' — quais produtos contam na base. */
  escopoProduto: string
  fixoInicial: number
  fixoEfetivo: number
  mesesFaseInicial: number
  metaReferencia: number
  /** Regra do bônus por treinamento bem avaliado — vale para todos do plano. */
  treinoNotaMinima: number
  treinoValorBase: number
  treinoValorUnitario: number
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
    tipo: p.tipo ?? 'escada',
    valorBonus: Number(p.valor_bonus ?? 0),
    escopoProduto: p.escopo_produto ?? 'todos',
    fixoInicial: Number(p.fixo_inicial ?? 0),
    fixoEfetivo: Number(p.fixo_efetivo ?? 0),
    mesesFaseInicial: Number(p.meses_fase_inicial ?? 0),
    metaReferencia: Number(p.meta_referencia ?? 0),
    treinoNotaMinima: Number(p.treino_nota_minima ?? 9),
    treinoValorBase: Number(p.treino_valor_base ?? 100),
    treinoValorUnitario: Number(p.treino_valor_unitario ?? 20),
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
  /** Mensalidade negociada na venda, do próprio processo comercial. */
  mensalidadeVenda: number
  mensalidadeNova: number
  upgrades: number
  paycore: number
}

export interface LinhaApuracao {
  usuarioId: number
  nome: string
  /** 'escada' ou 'proporcional' — muda o que a base significa. */
  tipo: string
  /** No plano proporcional a base é o resultado da EMPRESA, não o individual. */
  baseEmpresa: boolean
  escopoProduto: string
  composicao: ComposicaoBase
  planoId: number
  planoNome: string
  dataAdmissao: string | null
  mesesDeCasa: number | null
  emFaseInicial: boolean
  base: number
  processos: number
  /** Processos comerciais + clientes novos atribuídos no mês. */
  sistemasFechados: number
  /** Falso quando a pessoa não vendeu sistema no mês: fica fora da escada de 1% a 30%. */
  naEscada: boolean
  meta: number
  percMeta: number | null
  faixaDe: number | null
  percentual: number
  variavel: number
  fixo: number
  total: number
  /** Quanto falta de implantação para alcançar a próxima faixa, e o que ela acrescenta. */
  proximaFaixa: { valorDe: number; percentual: number; falta: number; ganhoExtra: number } | null
  /**
   * Bônus por meta batida: o percentual da meta GERAL da empresa aplicado ao valor que a
   * pessoa tem cadastrado. 98% da meta pagam 98% do valor; 105% pagam 105% — sem teto.
   * Null para quem não tem esse bônus no cadastro.
   */
  bonusMeta: {
    valorCheio: number
    percMetaGeral: number
    valor: number
  } | null
  /** Bônus por treinamento bem avaliado no período. Null para quem não participa. */
  bonusTreinamento: {
    notaMinima: number
    quantidade: number
    valorBase: number
    valorUnitario: number
    valor: number
    /** Os treinamentos que geraram o bônus — a pessoa precisa poder conferir um a um. */
    itens: TreinamentoAvaliado[]
  } | null
  /** Prêmios lançados à mão para a competência. */
  avulsas: { total: number; itens: ComissaoAvulsa[] } | null
  /** Comissão por canal de aquisição: a cada bloco fechado no canal, um valor. */
  comissaoCanais: { total: number; itens: ApuracaoCanal[] } | null
  /**
   * Comissão de agente sobre os certificados digitais que a pessoa emitiu no período.
   * Null para quem não emitiu nenhum.
   */
  comissaoCertificado: {
    quantidade: number
    valorEmitido: number
    comissao: number
    itens: CertificadoEmitido[]
  } | null
  /**
   * Comissão dos upgrades já lançados na tela Comissões (50% ou 25% por venda). É dinheiro
   * decidido lá, por lançamento — aqui só é somado ao que a pessoa recebe no mês.
   */
  comissaoUpgrades: { quantidade: number; valorOperacao: number; valor: number }
  /**
   * Se a pessoa é medida por meta em R$. Quem só recebe bônus por meta geral e treinamento
   * não tem escada nem base individual, e mostrar meta zerada seria só confusão.
   */
  usaMetaValor: boolean
  fechado: boolean
  fechadoEm: string | null
}

/**
 * Apura a competência (YYYY-MM) para todos os vendedores do plano. Se já houver fechamento
 * gravado, devolve o valor congelado — o que foi pago não muda porque a configuração mudou depois.
 */
export async function apurar(
  competencia: string,
  /**
   * `detalhe: false` pula as listas item a item (os certificados emitidos). O histórico de
   * seis meses do Meu Desempenho só usa os totais, e carregar as listas de todo mundo em
   * todos os meses fazia a tela levar mais de vinte segundos para abrir.
   */
  opcoes: { detalhe?: boolean } = {},
): Promise<LinhaApuracao[]> {
  const comDetalhe = opcoes.detalhe !== false
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência inválida. Use AAAA-MM.')
  const [ano, mes] = competencia.split('-').map(Number)
  const inicio = `${competencia}-01`
  const fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`

  const planos = await listarPlanos()
  const porPlano = new Map(planos.map((p) => [p.id, p]))

  // Uma consulta só para todo mundo: o percentual da meta geral é o mesmo para a equipe
  // inteira, e é o número que o Boletim Comercial e o Meu Desempenho já mostram.
  const percMetaGeral = await percentualMetaGeral(inicio, fim).catch(() => 0)

  // O rateio dos certificados depende do volume da equipe inteira: uma consulta só, e cada
  // pessoa pega a sua fatia depois.
  const agentes = await comissaoAgente(inicio, fim).catch(() => [])
  const canaisPorUsuario: Map<number, ApuracaoCanal[]> =
    await comissaoPorCanal(inicio, fim).catch(() => new Map())
  const avulsasDoMes: Map<number, ComissaoAvulsa[]> =
    await avulsasPorUsuario(competencia).catch(() => new Map())
  const comissaoPorAgente = new Map<number, number>()
  for (const a of agentes) {
    comissaoPorAgente.set(a.usuarioId, (comissaoPorAgente.get(a.usuarioId) ?? 0) + a.comissao)
  }

  const vendedores = await prisma.$queryRawUnsafe<any[]>(
    `SELECT v.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, u.NOME_USU AS nome_usu
       FROM comissao_vendedor v
       LEFT JOIN usuario u ON u.COD_USU = v.usuario_id
      WHERE v.ativo = 1
      ORDER BY nome`)

  const fechamentos = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM comissao_apuracao WHERE competencia = ?`, competencia)

  // Quem recebe só por canal de aquisição não tem escada nem meta, e por isso nunca foi
  // vinculado a um plano — mas recebe, e precisa aparecer. Entra aqui com um plano vazio:
  // sem faixa, sem fixo e sem meta, só com as parcelas que de fato valem para a pessoa.
  const planoSemEscada: Plano = {
    id: 0, nome: 'Sem plano de escada', descricao: null, baseCalculo: 'vencimento',
    tipo: 'escada', valorBonus: 0, escopoProduto: 'todos',
    fixoInicial: 0, fixoEfetivo: 0, mesesFaseInicial: 0, metaReferencia: 0,
    treinoNotaMinima: 9, treinoValorBase: 100, treinoValorUnitario: 20,
    ativo: true, faixas: [],
  }
  const jaVinculados = new Set(vendedores.map((v) => Number(v.usuario_id)))
  for (const usuarioId of [...canaisPorUsuario.keys(), ...avulsasDoMes.keys()]) {
    if (jaVinculados.has(usuarioId)) continue
    const [u] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(NOME_USUARIO_COMPLETO, NOME_USU) AS nome, NOME_USU AS nome_usu
         FROM usuario WHERE COD_USU = ?`, usuarioId).catch(() => [])
    vendedores.push({
      usuario_id: usuarioId, plano_id: 0, ativo: 1,
      data_admissao: null, fixo_personalizado: null, meta_individual: 0,
      bonus_meta: null, bonus_treinamento: 0,
      nome: u?.nome ?? `Usuário ${usuarioId}`, nome_usu: u?.nome_usu ?? null,
    })
    jaVinculados.add(usuarioId)
  }

  // Cada pessoa é independente das outras: em série, dezessete pessoas viravam dezessete
  // rodadas de ida e volta ao banco e a tela demorava segundos para abrir.
  const linhas: LinhaApuracao[] = (await Promise.all(vendedores.map(async (v) => {
    const plano = Number(v.plano_id) === 0 ? planoSemEscada : porPlano.get(Number(v.plano_id))
    if (!plano) return null

    // A data que define "recebida" vem do plano: hoje o sistema só tem o vencimento da parcela.
    // Quase metade dos processos nao tem data de vencimento preenchida. Sem o COALESCE a
    // venda nao cai em mes nenhum: some da apuracao e ninguem recebe por ela.
    const dataDoProcesso = (alias: string) => plano.baseCalculo === 'processo'
      ? `${alias}.data_hora_dados`
      : `COALESCE(${alias}.data_venc_implantacao, ${alias}.data_hora_dados)`
    const coluna = dataDoProcesso('c')
    const usuarioId = Number(v.usuario_id)

    // Implantação e migração do pacote de entrada, pelo vendedor do processo.
    const pBase = prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q,
              COALESCE(SUM(c.valor_implantacao), 0) AS implantacao,
              COALESCE(SUM(c.valor_migracao), 0) AS migracao,
              COALESCE(SUM(c.valor_mensalidade), 0) AS mensalidade
         FROM processo_implantacao_comercial c
        WHERE c.id_usu_vendedor = ? AND DATE(${coluna}) BETWEEN ? AND ?`,
      usuarioId, inicio, fim,
    ).catch(() => [{ q: 0, implantacao: 0, migracao: 0, mensalidade: 0 }])

    // Mensalidade de cliente novo que NÃO passou pelo processo comercial. Quando passou, o
    // valor já veio acima, com o vendedor explícito na venda — contar dos dois lados dobraria
    // a mensalidade da mesma venda. A tabela `cliente` não guarda vendedor, então aqui a
    // atribuição é a mesma do Boletim: o CRM pelo CNPJ e, na falta dele, quem fez o cadastro.
    const pMens = prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q, COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
         LEFT JOIN usuario u ON u.COD_USU = c.cod_usu_local_Cad
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
          AND c.cod_cli NOT IN (
                SELECT pi.id_cli FROM processo_implantacao pi
                 INNER JOIN processo_implantacao_comercial pc ON pc.id_processo = pi.id
                 WHERE DATE(${dataDoProcesso('pc')}) BETWEEN ? AND ?
                   AND pi.id_cli IS NOT NULL)
          AND c.DATACADASTRO_CLI BETWEEN ? AND ?
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8
          AND UPPER(TRIM(COALESCE(
                (SELECT nn.vendedor_nome FROM crm_negocio nn
                  WHERE nn.documento = REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','')
                    AND nn.vendedor_nome IS NOT NULL AND nn.vendedor_nome <> ''
                  ORDER BY COALESCE(nn.finalizado_em, nn.criado_em, nn.data) DESC, nn.id DESC LIMIT 1),
                NULLIF(u.NOME_USU, ''), ''))) IN (UPPER(TRIM(?)), UPPER(TRIM(?)))`,
      inicio, fim, inicio, fim, v.nome ?? '', v.nome_usu ?? '',
    ).catch(() => [{ q: 0, valor: 0 }])

    const pUpg = prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
         FROM comissoes_funcionario co
         INNER JOIN cliente c ON c.cod_cli = co.cod_cli
        WHERE co.cod_func = ? AND CAST(co.data_venda AS DATE) BETWEEN ? AND ?
          AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30`,
      usuarioId, inicio, fim,
    ).catch(() => [{ valor: 0 }])

    // Escopo de produto: os produtos Cilos vivem no servidor PaycoreCilos; tudo que vem da nossa
    // base própria é Command. Por isso o escopo 'cilos' zera as parcelas da base própria.
    const filtroServidor = plano.escopoProduto === 'command'
      ? "AND COALESCE(s.nome, '') NOT LIKE '%cilos%'"
      : plano.escopoProduto === 'cilos' ? "AND COALESCE(s.nome, '') LIKE '%cilos%'" : ''

    // No PayCore o vendedor já vem resolvido para o nosso COD_USU na sincronização.
    const pPay = prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         INNER JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
        WHERE pc.vendedor_id = ? AND DATE(a.inicio) BETWEEN ? AND ? ${filtroServidor}`,
      usuarioId, inicio, fim,
    ).catch(() => [{ valor: 0 }])

    // As cinco consultas acima não dependem umas das outras. Em série eram cinco idas ao
    // banco por pessoa, e com dezessete pessoas a tela levava segundos para abrir.
    const [[b], [mens], [upg], [pay]] = await Promise.all([pBase, pMens, pUpg, pPay])

    // Com escopo 'cilos' só o PayCore da Cilos conta: implantação, mensalidade e upgrades são
    // todos da operação Command.
    const soCilos = plano.escopoProduto === 'cilos'
    const composicao: ComposicaoBase = {
      implantacao: soCilos ? 0 : Number(b?.implantacao ?? 0),
      migracao: soCilos ? 0 : Number(b?.migracao ?? 0),
      mensalidadeVenda: soCilos ? 0 : Number(b?.mensalidade ?? 0),
      mensalidadeNova: soCilos ? 0 : Number(mens?.valor ?? 0),
      upgrades: soCilos ? 0 : Number(upg?.valor ?? 0),
      paycore: Number(pay?.valor ?? 0),
    }
    let base = composicao.implantacao + composicao.migracao + composicao.mensalidadeVenda
      + composicao.mensalidadeNova + composicao.upgrades + composicao.paycore

    // No plano proporcional a pessoa não é medida pelo que ela mesma vendeu: o que vale é o
    // quanto a EMPRESA bateu da meta, no mesmo escopo de produto.
    const proporcional = plano.tipo === 'proporcional'
    if (proporcional) {
      base = await baseDaEmpresa(inicio, fim, plano.escopoProduto, coluna)
    }
    /**
     * Sistemas fechados no mês: processo comercial lançado ou cliente novo atribuído pelo
     * CRM. A escada é remuneração de VENDA — quem não vendeu sistema nenhum fica fora dela
     * e recebe só a comissão do próprio upgrade, que já vem decidida no lançamento. Sem
     * isso o mesmo upgrade pagava duas vezes: pelo percentual da escada e pelo lançamento.
     */
    const sistemasFechados = Number(b?.q ?? 0) + Number(mens?.q ?? 0)
    const naEscada = proporcional || sistemasFechados > 0

    const faixa = proporcional || !naEscada ? null : faixaDe(base, plano.faixas)
    const percentual = faixa?.percentual ?? 0

    const meses = mesesDesde(v.data_admissao, competencia)
    const emFaseInicial = meses !== null && meses < plano.mesesFaseInicial
    const fixo = v.fixo_personalizado != null
      ? Number(v.fixo_personalizado)
      : emFaseInicial ? plano.fixoInicial : plano.fixoEfetivo

    const meta = v.meta_individual != null ? Number(v.meta_individual) : plano.metaReferencia
    const atingido = meta > 0 ? base / meta : 0
    // 110% da meta pagam 110% do bônus: não há teto, é proporcional de verdade.
    const variavel = proporcional
      ? plano.valorBonus * atingido
      : naEscada ? (base * percentual) / 100 : 0

    // O próximo degrau vale sobre tudo, então o ganho extra não é só sobre a diferença.
    const acima = proporcional || !naEscada ? undefined
      : [...plano.faixas].sort((a, b2) => a.valorDe - b2.valorDe).find((f) => f.valorDe > base)
    const proximaFaixa = acima
      ? {
          valorDe: acima.valorDe,
          percentual: acima.percentual,
          falta: acima.valorDe - base,
          ganhoExtra: (acima.valorDe * acima.percentual) / 100 - variavel,
        }
      : null

    // ── Bônus por meta batida ──
    // Usa o MESMO percentual que o Boletim Comercial e o card de meta geral mostram. Se
    // usasse outra conta, a pessoa veria um número na tela e receberia sobre outro.
    const valorBonusMeta = v.bonus_meta == null ? 0 : Number(v.bonus_meta)
    const bonusMeta = valorBonusMeta > 0
      ? {
          valorCheio: valorBonusMeta,
          percMetaGeral: percMetaGeral,
          valor: Number(((valorBonusMeta * percMetaGeral) / 100).toFixed(2)),
        }
      : null

    // ── Bônus por treinamento bem avaliado ──
    // Sem treinamento nota alta no período não há bônus nenhum: o valor fixo é o
    // reconhecimento do primeiro, não um pagamento por existir.
    let bonusTreinamento: LinhaApuracao['bonusTreinamento'] = null
    if (Number(v.bonus_treinamento) === 1) {
      // Mesma fonte do Histórico de Treinamentos: as duas tabelas, só o tipo Treinamento.
      const itens = await treinamentosAvaliados(usuarioId, inicio, fim, plano.treinoNotaMinima)
      const qtd = itens.length
      bonusTreinamento = {
        notaMinima: plano.treinoNotaMinima,
        quantidade: qtd,
        valorBase: plano.treinoValorBase,
        valorUnitario: plano.treinoValorUnitario,
        valor: qtd > 0
          ? Number((plano.treinoValorBase + plano.treinoValorUnitario * qtd).toFixed(2))
          : 0,
        itens,
      }
    }

    // ── Comissão dos upgrades ──
    // O valor já está decidido no lançamento (comissoes_funcionario.valor_comissao); não é
    // recalculado aqui. Ficava de fora do total, e era dinheiro que a pessoa já recebia.
    const [comUpg] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS qtd,
              COALESCE(SUM(co.Valor_operacao), 0) AS operacao,
              COALESCE(SUM(co.valor_comissao), 0) AS comissao
         FROM comissoes_funcionario co
         INNER JOIN cliente c ON c.cod_cli = co.cod_cli
        WHERE co.cod_func = ? AND CAST(co.data_venda AS DATE) BETWEEN ? AND ?
          AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30`,
      usuarioId, inicio, fim,
    ).catch(() => [{ qtd: 0, operacao: 0, comissao: 0 }])
    const comissaoUpgrades = {
      quantidade: Number(comUpg?.qtd ?? 0),
      valorOperacao: Number(comUpg?.operacao ?? 0),
      valor: Number(Number(comUpg?.comissao ?? 0).toFixed(2)),
    }

    // ── Certificados digitais ──
    const comissaoAgenteValor = comissaoPorAgente.get(usuarioId) ?? 0
    const ehAgente = agentes.some((a) => a.usuarioId === usuarioId)
    const certificados = comDetalhe && ehAgente
      ? await certificadosEmitidos(usuarioId, inicio, fim).catch(() => [])
      : []
    const comissaoCertificado = certificados.length > 0 || (!comDetalhe && ehAgente)
      ? {
          quantidade: certificados.length,
          valorEmitido: Number(certificados.reduce((s, c) => s + c.valor, 0).toFixed(2)),
          comissao: Number(comissaoAgenteValor.toFixed(2)),
          itens: certificados,
        }
      : null

    // ── Canais de aquisição ──
    const listaCanais = canaisPorUsuario.get(usuarioId) ?? []
    const comissaoCanais = listaCanais.length > 0
      ? {
          total: Number(listaCanais.reduce((s, c) => s + c.valor, 0).toFixed(2)),
          itens: listaCanais,
        }
      : null

    // ── Avulsos ──
    const listaAvulsas = avulsasDoMes.get(usuarioId) ?? []
    const avulsas = listaAvulsas.length > 0
      ? {
          total: Number(listaAvulsas.reduce((s, a) => s + a.valor, 0).toFixed(2)),
          itens: listaAvulsas,
        }
      : null

    const extras = (bonusMeta?.valor ?? 0) + (bonusTreinamento?.valor ?? 0)
      + comissaoUpgrades.valor + (comissaoCertificado?.comissao ?? 0)
      + (comissaoCanais?.total ?? 0) + (avulsas?.total ?? 0)

    const fechado = fechamentos.find((f) => Number(f.usuario_id) === Number(v.usuario_id))

    return {
      usuarioId,
      nome: v.nome ?? `Usuário ${usuarioId}`,
      tipo: plano.tipo,
      baseEmpresa: proporcional,
      escopoProduto: plano.escopoProduto,
      composicao,
      planoId: plano.id,
      planoNome: plano.nome,
      dataAdmissao: v.data_admissao ? String(v.data_admissao).slice(0, 10) : null,
      mesesDeCasa: meses,
      emFaseInicial,
      base: fechado ? Number(fechado.base) : base,
      processos: Number(b?.q ?? 0),
      sistemasFechados,
      naEscada,
      meta,
      percMeta: meta > 0 ? (base / meta) * 100 : null,
      faixaDe: fechado ? (fechado.faixa_de == null ? null : Number(fechado.faixa_de)) : faixa?.valorDe ?? null,
      percentual: fechado ? Number(fechado.percentual) : percentual,
      variavel: fechado ? Number(fechado.variavel) : variavel,
      fixo: fechado ? Number(fechado.fixo) : fixo,
      total: fechado ? Number(fechado.total) : fixo + variavel + extras,
      proximaFaixa,
      bonusMeta,
      bonusTreinamento,
      comissaoUpgrades,
      comissaoCertificado,
      comissaoCanais,
      avulsas,
      usaMetaValor: meta > 0,
      fechado: !!fechado,
      fechadoEm: fechado?.fechado_em ?? null,
    }
  }))).filter((l): l is LinhaApuracao => l !== null)

  return linhas.sort((a, b) => b.base - a.base)
}

/**
 * Resultado da EMPRESA no período, usado pelos planos proporcionais. Soma as mesmas parcelas da
 * base individual, mas de todo mundo, respeitando o escopo de produto.
 */
async function baseDaEmpresa(
  inicio: string, fim: string, escopo: string, colunaData: string,
): Promise<number> {
  const soCilos = escopo === 'cilos'
  const filtroServidor = escopo === 'command'
    ? "AND COALESCE(s.nome, '') NOT LIKE '%cilos%'"
    : soCilos ? "AND COALESCE(s.nome, '') LIKE '%cilos%'" : ''

  const [pay] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
       FROM paycore_assinatura a
       LEFT JOIN paycore_servidor s ON s.id = a.servidor_id
      WHERE DATE(a.inicio) BETWEEN ? AND ? ${filtroServidor}`,
    inicio, fim,
  ).catch(() => [{ valor: 0 }])
  if (soCilos) return Number(pay?.valor ?? 0)

  const [impl] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM(c.valor_implantacao + c.valor_migracao), 0) AS valor
       FROM processo_implantacao_comercial c
      WHERE DATE(${colunaData}) BETWEEN ? AND ?`,
    inicio, fim,
  ).catch(() => [{ valor: 0 }])

  const [mens] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM(c.valor_mensalidade), 0) AS valor
       FROM cliente c
      WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000 AND c.ATIVO = 'S'
        AND c.DATACADASTRO_CLI BETWEEN ? AND ?
        AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8`,
    inicio, fim,
  ).catch(() => [{ valor: 0 }])

  const [upg] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
       FROM comissoes_funcionario co
       INNER JOIN cliente c ON c.cod_cli = co.cod_cli
      WHERE CAST(co.data_venda AS DATE) BETWEEN ? AND ?
        AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30`,
    inicio, fim,
  ).catch(() => [{ valor: 0 }])

  return Number(impl?.valor ?? 0) + Number(mens?.valor ?? 0)
    + Number(upg?.valor ?? 0) + Number(pay?.valor ?? 0)
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
