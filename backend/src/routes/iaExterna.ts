import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { obterConfigIA } from '../ia/config'
import { ProvedorDeepSeek } from '../ia/deepseek'

/**
 * Porta de entrada da IA para sistemas externos — hoje o ERP Delphi, que precisa explicar
 * relatórios para o cliente final.
 *
 * Por que não deixar o Delphi chamar a IA direto: a chave do provedor iria dentro do executável
 * instalado na máquina do cliente, e um .exe distribuído é a pior lugar possível para um segredo.
 * Aqui a chave fica no servidor, o uso é registrado e trocar de provedor não exige atualizar o
 * ERP em cliente nenhum.
 *
 * Diferente de /assistente/conversar: aquele roda com as ferramentas e as permissões de um
 * usuário logado do Analytics e consulta o nosso banco. Este é sem estado — recebe os dados do
 * relatório prontos e só explica, sem acesso a dado nenhum nosso.
 */

const LIMITE_PADRAO_DIA = 500
const MAX_CARACTERES_DADOS = 60_000

export async function initIaExterna(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_cliente_externo (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      nome          VARCHAR(120) NOT NULL,
      -- Só o hash da chave fica guardado: nem o banco nem a tela voltam a ver o valor original.
      chave_hash    CHAR(64) NOT NULL,
      -- Últimos caracteres, só para a pessoa reconhecer qual chave é qual na lista.
      chave_final   VARCHAR(8) NOT NULL,
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      limite_dia    INT NOT NULL DEFAULT ${LIMITE_PADRAO_DIA},
      -- Preenchidos quando a chave nasce de um provisionamento automático pelo ERP.
      cnpj          VARCHAR(20) NULL,
      instalacao    VARCHAR(80) NULL,
      origem        VARCHAR(20) NOT NULL DEFAULT 'manual',
      ultimo_uso    DATETIME NULL,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_ia_cliente_chave (chave_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  /**
   * Histórico das perguntas, para medir consumo por cliente e ver o que mais perguntam.
   *
   * O conteúdo do relatório NÃO é gravado de propósito: são dados financeiros do cliente final e
   * guardá-los aqui cria uma responsabilidade que não precisamos ter. Fica o tamanho, que já
   * explica o custo em tokens. A pergunta é gravada porque é ela que diz o que melhorar.
   */
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_cliente_conversa (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id     INT NOT NULL,
      cnpj           VARCHAR(20) NULL,
      cliente_nome   VARCHAR(200) NULL,
      usuario        VARCHAR(120) NULL,
      relatorio      VARCHAR(200) NULL,
      periodo        VARCHAR(60) NULL,
      pergunta       VARCHAR(500) NULL,
      tamanho_dados  INT NOT NULL DEFAULT 0,
      tokens_entrada INT NOT NULL DEFAULT 0,
      tokens_saida   INT NOT NULL DEFAULT 0,
      tokens_total   INT NOT NULL DEFAULT 0,
      duracao_ms     INT NOT NULL DEFAULT 0,
      erro           VARCHAR(200) NULL,
      criado_em      DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_ia_conv_cliente (cliente_id),
      INDEX idx_ia_conv_cnpj (cnpj),
      INDEX idx_ia_conv_data (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Colunas acrescentadas depois; o projeto não usa migrations.
  // Coluna acrescentada depois, para descobrir o formato do que o ERP envia.
  const [temFormato] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS q FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'ia_provisionamento_log'
        AND column_name = 'formato_chave'`)
  if (Number(temFormato?.q ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ia_provisionamento_log ADD COLUMN formato_chave VARCHAR(120) NULL`).catch(() => {})
  }

  for (const [coluna, definicao] of [
    ['cnpj', 'VARCHAR(20) NULL'],
    ['instalacao', 'VARCHAR(80) NULL'],
    ['origem', "VARCHAR(20) NOT NULL DEFAULT 'manual'"],
  ] as const) {
    const [existe] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ia_cliente_externo' AND column_name = ?`, coluna)
    if (Number(existe?.q ?? 0) === 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE ia_cliente_externo ADD COLUMN \`${coluna}\` ${definicao}`)
    }
  }

  /**
   * Instalações liberadas na mão por um usuário do Analytics.
   *
   * Existe para o caso em que o sistema externo não consegue enviar a licença que sabemos
   * validar. Em vez de afrouxar a regra para todo mundo, uma pessoa autoriza AQUELA instalação
   * daquele CNPJ, e só ela passa a provisionar sem a licença.
   */
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_instalacao_autorizada (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      cnpj         VARCHAR(20) NOT NULL,
      instalacao   VARCHAR(80) NOT NULL,
      observacao   VARCHAR(200) NULL,
      -- Uma linha pode liberar OU bloquear: com a liberação automática ligada, apagar a linha
      -- não impede nada, é preciso um bloqueio explícito.
      bloqueada    TINYINT(1) NOT NULL DEFAULT 0,
      origem       VARCHAR(20) NOT NULL DEFAULT 'manual',
      autorizado_por INT NULL,
      usado_em     DATETIME NULL,
      criado_em    DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_ia_instalacao (cnpj, instalacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  for (const [coluna, definicao] of [
    ['bloqueada', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['origem', "VARCHAR(20) NOT NULL DEFAULT 'manual'"],
  ] as const) {
    const [existe] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ia_instalacao_autorizada'
          AND column_name = ?`, coluna)
    if (Number(existe?.q ?? 0) === 0) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ia_instalacao_autorizada ADD COLUMN \`${coluna}\` ${definicao}`).catch(() => {})
    }
  }

  // Política de provisionamento. Uma linha só.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_provisionamento_config (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      -- Liberar sozinho qualquer instalação cujo CNPJ seja um cliente nosso.
      auto_clientes         TINYINT(1) NOT NULL DEFAULT 0,
      -- Se o cliente precisa estar ativo, e não só existir na base.
      exigir_cliente_ativo  TINYINT(1) NOT NULL DEFAULT 1,
      atualizado_em         DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [temCfg] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS q FROM ia_provisionamento_config`)
  if (Number(temCfg?.q ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`INSERT INTO ia_provisionamento_config (auto_clientes) VALUES (0)`)
  }

  /**
   * Tentativas de provisionamento. Um 403 sem registro é indepurável: não dá para dizer qual
   * regra recusou. A licença nunca é gravada — só o que é preciso para diagnosticar.
   */
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_provisionamento_log (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      cnpj          VARCHAR(20) NULL,
      instalacao    VARCHAR(80) NULL,
      sistema       VARCHAR(60) NULL,
      resultado     VARCHAR(30) NOT NULL,
      motivo        VARCHAR(200) NULL,
      licencas_cnpj INT NOT NULL DEFAULT 0,
      tamanho_chave INT NOT NULL DEFAULT 0,
      formato_chave VARCHAR(120) NULL,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_prov_log_cnpj (cnpj),
      INDEX idx_prov_log_data (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_cliente_uso (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id  INT NOT NULL,
      dia         DATE NOT NULL,
      chamadas    INT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_ia_uso (cliente_id, dia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const hash = (chave: string) => crypto.createHash('sha256').update(chave).digest('hex')

/**
 * Tentativas de provisionamento por CNPJ, em memória. Segura força bruta em cima das licenças;
 * reiniciar o processo zera, o que é aceitável para o que isso protege.
 */
const MAX_TENTATIVAS = 10
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000
const tentativas = new Map<string, number[]>()

function excedeuProvisionamento(chaveJanela: string): boolean {
  const agora = Date.now()
  const recentes = (tentativas.get(chaveJanela) ?? []).filter((t) => agora - t < JANELA_TENTATIVAS_MS)
  tentativas.set(chaveJanela, recentes)
  return recentes.length >= MAX_TENTATIVAS
}

/**
 * Descreve o FORMATO de uma credencial sem revelar o conteúdo. Quando o valor recebido não
 * confere, é isso que permite descobrir que tipo de credencial o sistema externo está mandando
 * — se é hexadecimal, base64, se tem separadores — sem precisar que alguém cole o segredo.
 */
function formatoDe(valor: string): string {
  const partes: string[] = []
  if (/^[0-9A-Fa-f]+$/.test(valor)) partes.push('hexadecimal')
  else if (/^[A-Za-z0-9+/]+=*$/.test(valor)) partes.push('base64')
  else if (/^[A-Za-z0-9]+$/.test(valor)) partes.push('alfanumérico')
  else partes.push('misto')

  if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)) partes.push('maiúsc+minúsc')
  else if (/[a-z]/.test(valor)) partes.push('minúsculas')
  else if (/[A-Z]/.test(valor)) partes.push('maiúsculas')

  // Separadores revelam a estrutura (UUID, JWT, campos concatenados) sem revelar o valor.
  const simbolos = [...new Set(valor.replace(/[A-Za-z0-9]/g, '').split(''))]
  if (simbolos.length) {
    partes.push(`símbolos: ${simbolos.join('')}`)
    const sep = simbolos.find((s) => valor.split(s).length > 1)
    if (sep) partes.push(`segmentos: ${valor.split(sep).map((p) => p.length).join('-')}`)
  }
  return partes.join(' · ').slice(0, 120)
}

function registrarTentativa(chaveJanela: string): void {
  const lista = tentativas.get(chaveJanela) ?? []
  lista.push(Date.now())
  tentativas.set(chaveJanela, lista)
}

/** Identifica o sistema externo pela chave e já contabiliza a chamada do dia. */
async function autorizar(chave: string | undefined): Promise<
  { ok: true; id: number; nome: string } | { ok: false; status: number; erro: string }
> {
  if (!chave) return { ok: false, status: 401, erro: 'Informe a chave em X-API-Key.' }

  const [c] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, ativo, limite_dia FROM ia_cliente_externo WHERE chave_hash = ?`, hash(chave))
  if (!c) return { ok: false, status: 401, erro: 'Chave inválida.' }
  if (!c.ativo) return { ok: false, status: 403, erro: 'Chave desativada.' }

  const hoje = new Date().toISOString().slice(0, 10)
  const [uso] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT chamadas FROM ia_cliente_uso WHERE cliente_id = ? AND dia = ?`, Number(c.id), hoje)
  if (Number(uso?.chamadas ?? 0) >= Number(c.limite_dia)) {
    return { ok: false, status: 429, erro: 'Limite diário desta chave atingido.' }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO ia_cliente_uso (cliente_id, dia, chamadas) VALUES (?,?,1)
     ON DUPLICATE KEY UPDATE chamadas = chamadas + 1`, Number(c.id), hoje)
  await prisma.$executeRawUnsafe(
    `UPDATE ia_cliente_externo SET ultimo_uso = NOW() WHERE id = ?`, Number(c.id))

  return { ok: true, id: Number(c.id), nome: String(c.nome) }
}

export async function iaExternaRoutes(app: FastifyInstance) {
  /**
   * POST /api/ia-externa/explicar
   * Header: X-API-Key
   * Body: { relatorio, periodo?, dados, pergunta?, publico? }
   *
   * `dados` é o conteúdo do relatório já pronto — JSON, CSV ou texto. Nada é buscado no nosso
   * banco: o que o ERP não mandar, a IA não sabe.
   */
  app.post('/explicar', { schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const auth = await autorizar(request.headers['x-api-key'] as string | undefined)
    if (!auth.ok) return reply.status(auth.status).send({ error: auth.erro })

    const config = await obterConfigIA()
    if (!config.ativo || !config.apiKey) {
      return reply.status(503).send({ error: 'Assistente de IA não configurado no Command Analytics.' })
    }

    const b = request.body as {
      relatorio?: string; periodo?: string; dados?: unknown
      pergunta?: string; publico?: string
      cnpj?: string; clienteNome?: string; usuario?: string
    }
    const relatorio = String(b.relatorio ?? '').trim()
    if (!relatorio) return reply.status(400).send({ error: 'Informe o nome do relatório em "relatorio".' })

    // Sem saber de quem é a pergunta não há como medir consumo nem cobrar de quem usa.
    const cnpj = String(b.cnpj ?? '').replace(/\D/g, '') || null
    const clienteNome = String(b.clienteNome ?? '').trim() || null
    if (!cnpj && !clienteNome) {
      return reply.status(400).send({
        error: 'Identifique o cliente final em "cnpj" (preferível) ou "clienteNome".',
      })
    }
    if (cnpj && cnpj.length !== 14 && cnpj.length !== 11) {
      return reply.status(400).send({ error: 'CNPJ/CPF inválido em "cnpj".' })
    }
    if (b.dados === undefined || b.dados === null || b.dados === '') {
      return reply.status(400).send({ error: 'Informe os dados do relatório em "dados".' })
    }

    const dados = typeof b.dados === 'string' ? b.dados : JSON.stringify(b.dados, null, 1)
    if (dados.length > MAX_CARACTERES_DADOS) {
      return reply.status(413).send({
        error: `Os dados excedem ${MAX_CARACTERES_DADOS} caracteres. Envie o relatório já resumido ou em partes.`,
      })
    }

    // O público muda o vocabulário: o dono da loja não quer ouvir "CMV" nem "ticket médio".
    const publico = b.publico === 'tecnico' ? 'tecnico' : 'cliente'
    const instrucao = publico === 'tecnico'
      ? 'Você fala com um usuário técnico do sistema. Pode usar termos de gestão e contabilidade.'
      : 'Você fala com o dono de um comércio, que não é contador nem analista. Use linguagem '
        + 'simples e direta, explique qualquer termo técnico que precisar usar.'

    const sistema = [
      'Você explica relatórios de um sistema de gestão comercial brasileiro.',
      instrucao,
      'Responda em português do Brasil. Valores em reais no formato R$ 1.234,56.',
      'Baseie-se EXCLUSIVAMENTE nos dados recebidos. Se a resposta não estiver neles, diga que o',
      'relatório não tem essa informação — nunca estime, complete ou invente número.',
      'Seja direto: comece pela conclusão e depois justifique com os números que a sustentam.',
      'Aponte o que chama atenção (quedas, picos, concentração) só quando os dados mostrarem.',
    ].join(' ')

    const usuario = [
      `Relatório: ${relatorio}`,
      b.periodo ? `Período: ${b.periodo}` : null,
      '',
      'Dados:',
      dados,
      '',
      b.pergunta?.trim()
        ? `Pergunta do usuário: ${b.pergunta.trim()}`
        : 'Explique este relatório em até 5 parágrafos curtos, destacando o que é mais relevante.',
    ].filter((l) => l !== null).join('\n')

    const comecou = Date.now()
    const registrar = (uso: { entrada: number; saida: number; total: number } | undefined, erro?: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ia_cliente_conversa
           (cliente_id, cnpj, cliente_nome, usuario, relatorio, periodo, pergunta,
            tamanho_dados, tokens_entrada, tokens_saida, tokens_total, duracao_ms, erro)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        auth.id, cnpj, clienteNome, String(b.usuario ?? '').trim().slice(0, 120) || null,
        relatorio.slice(0, 200), String(b.periodo ?? '').slice(0, 60) || null,
        (b.pergunta ?? '').trim().slice(0, 500) || null,
        dados.length, uso?.entrada ?? 0, uso?.saida ?? 0, uso?.total ?? 0,
        Date.now() - comecou, erro?.slice(0, 200) ?? null,
      ).catch((e) => request.log.warn({ err: e }, 'Falha ao registrar conversa da IA externa'))

    try {
      const provedor = new ProvedorDeepSeek(config.apiKey, config.modelo)
      // Sem ferramentas: este canal não consulta o banco do Analytics, só interpreta o que veio.
      const resposta = await provedor.conversar(
        [{ papel: 'system', conteudo: sistema }, { papel: 'user', conteudo: usuario }],
        [],
      )
      await registrar(resposta.uso)
      return {
        resposta: resposta.texto,
        modelo: config.modelo,
        cliente: auth.nome,
        tokens: resposta.uso ?? null,
      }
    } catch (e: any) {
      request.log.error({ err: e, cliente: auth.nome }, 'Falha na IA externa')
      await registrar(undefined, String(e?.message ?? e))
      return reply.status(502).send({ error: 'Falha ao consultar a IA. Tente novamente.' })
    }
  })

  /**
   * POST /api/ia-externa/provisionar
   *
   * O ERP troca a licença que ele já tem pela chave de IA daquela instalação, sem ninguém
   * digitar nada. Quem autoriza é a LICENÇA, não o CNPJ: o CNPJ é público e sozinho não prova
   * nada. A licença é conferida na tabela `licencas`, que é a mesma fonte usada para liberar o
   * próprio ERP.
   *
   * Uma chave por INSTALAÇÃO, não por cliente: o mesmo cliente pode ter várias máquinas, e
   * revogar uma não pode derrubar as outras.
   */
  app.post('/provisionar', { schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const b = request.body as {
      cnpj?: string; licenca?: string; instalacao?: string; sistema?: string
    }
    const cnpj = String(b.cnpj ?? '').replace(/\D/g, '')
    const licenca = String(b.licenca ?? '').trim()
    const instalacao = String(b.instalacao ?? '').trim().slice(0, 80)

    if (!cnpj || !licenca) {
      return reply.status(400).send({ error: 'Informe "cnpj" e "licenca".' })
    }
    if (!instalacao) {
      return reply.status(400).send({
        error: 'Informe "instalacao": um identificador estável da máquina/instalação.',
      })
    }

    // Tentativas erradas são limitadas: sem isso dá para varrer licenças por força bruta.
    const janela = `prov:${cnpj}`
    if (excedeuProvisionamento(janela)) {
      return reply.status(429).send({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
    }

    /** Registra a tentativa: sem isso um 403 não tem como ser investigado depois. */
    const logar = (resultado: string, motivo: string | null, licencasDoCnpj: number) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ia_provisionamento_log
           (cnpj, instalacao, sistema, resultado, motivo, licencas_cnpj, tamanho_chave, formato_chave)
         VALUES (?,?,?,?,?,?,?,?)`,
        cnpj, instalacao, String(b.sistema ?? '').slice(0, 60) || null,
        resultado, motivo, licencasDoCnpj, licenca.length,
        // Só a forma, nunca o valor — é o que identifica a credencial errada.
        resultado === 'provisionado' ? null : formatoDe(licenca),
      ).catch(() => {})

    // Quantas licenças esse CNPJ tem, independentemente da chave. Separa "CNPJ desconhecido"
    // de "chave não confere" — são problemas diferentes e a mensagem precisa dizer qual é.
    const [cont] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS q FROM licencas
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?`,
      cnpj).catch(() => [{ q: 0 }])
    const licencasDoCnpj = Number(cont?.q ?? 0)

    if (licencasDoCnpj === 0) {
      registrarTentativa(janela)
      await logar('recusado', 'CNPJ sem licença cadastrada', 0)
      return reply.status(403).send({ error: 'Nenhuma licença cadastrada para este CNPJ.' })
    }

    // A coluna `licencas.chave` usa collation latin1_bin: a comparação é binária e sensível a
    // maiúsculas. As chaves são hexadecimais em caixa alta, e hexadecimal não muda de valor com
    // a caixa — comparar normalizado evita recusar uma licença correta só por isso.
    // Em vez de adivinhar como o valor foi embrulhado, buscamos as licenças DAQUELE CNPJ e
    // verificamos se alguma delas está dentro do que chegou. Funciona com qualquer invólucro —
    // prefixo, sufixo ou símbolos no meio da chave — e não afrouxa nada: a licença comparada é
    // sempre uma licença daquele cliente.
    const candidatas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, chave, vencimento, demo, sistema_id
         FROM licencas
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?
          AND chave IS NOT NULL AND chave <> ''
        ORDER BY (vencimento IS NULL), vencimento DESC`, cnpj).catch(() => [] as any[])

    const enviadoLimpo = licenca.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    let lic: any = null
    let extraida = false
    for (const c of candidatas) {
      const chaveLimpa = String(c.chave).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (!chaveLimpa) continue
      if (enviadoLimpo === chaveLimpa) { lic = c; break }
      if (enviadoLimpo.includes(chaveLimpa)) { lic = c; extraida = true; break }
    }

    // A decisão explícita vale mais que tudo: um bloqueio recusa mesmo com licença válida,
    // porque é a forma de cortar o acesso de uma máquina específica.
    const [decisao] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, bloqueada FROM ia_instalacao_autorizada WHERE cnpj = ? AND instalacao = ?`,
      cnpj, instalacao).catch(() => [null])

    if (decisao && Number(decisao.bloqueada) === 1) {
      await logar('recusado', 'Instalação bloqueada manualmente', licencasDoCnpj)
      return reply.status(403).send({ error: 'Esta instalação está bloqueada. Fale com o suporte.' })
    }

    let liberadaPor: string | null = null
    if (!lic && decisao) liberadaPor = 'liberação manual'

    // Liberação automática: vale para quem é cliente nosso, quando a política estiver ligada.
    if (!lic && !liberadaPor) {
      const [cfg] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT auto_clientes, exigir_cliente_ativo FROM ia_provisionamento_config ORDER BY id LIMIT 1`)
      if (Number(cfg?.auto_clientes ?? 0) === 1) {
        const exigirAtivo = Number(cfg?.exigir_cliente_ativo ?? 1) === 1
        const [cli] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT cod_cli, COALESCE(ATIVO,'S') AS ativo FROM cliente
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
            ORDER BY CASE WHEN COALESCE(ATIVO,'S')='S' THEN 0 ELSE 1 END LIMIT 1`, cnpj)
        if (cli && (!exigirAtivo || String(cli.ativo) === 'S')) {
          liberadaPor = 'cliente Command (liberação automática)'
          // Registra para a instalação aparecer na lista e poder ser revogada depois.
          await prisma.$executeRawUnsafe(
            `INSERT IGNORE INTO ia_instalacao_autorizada (cnpj, instalacao, origem, observacao)
             VALUES (?,?,'automatico','Liberada pela política de clientes Command')`,
            cnpj, instalacao).catch(() => {})
        }
      }
    }

    if (decisao || liberadaPor) {
      await prisma.$executeRawUnsafe(
        `UPDATE ia_instalacao_autorizada SET usado_em = NOW() WHERE cnpj = ? AND instalacao = ?`,
        cnpj, instalacao).catch(() => {})
    }

    if (!lic && !liberadaPor) {
      registrarTentativa(janela)
      await logar(
        'recusado',
        `Nenhuma das ${candidatas.length} licença(s) do CNPJ está contida no valor enviado`,
        licencasDoCnpj,
      )
      return reply.status(403).send({
        error: `A chave enviada não confere com nenhuma das ${licencasDoCnpj} licença(s) deste CNPJ.`,
      })
    }
    if (lic?.vencimento && new Date(lic.vencimento) < new Date(new Date().toDateString())) {
      await logar('recusado', 'Licença vencida', licencasDoCnpj)
      return reply.status(403).send({
        error: 'Licença vencida. Regularize a licença para usar o assistente.',
      })
    }

    const [cli] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT NOME_FANTASIA AS nome FROM cliente
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ?
        LIMIT 1`, cnpj).catch(() => [null])
    const nome = `${cli?.nome || 'Cliente'} · ${String(b.sistema ?? 'ERP').slice(0, 30)}`.slice(0, 120)

    // Reprovisionar a MESMA instalação troca a chave dela e só dela.
    const chave = `ca_${crypto.randomBytes(24).toString('hex')}`
    const [jaTem] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM ia_cliente_externo WHERE cnpj = ? AND instalacao = ?`, cnpj, instalacao)

    if (jaTem) {
      await prisma.$executeRawUnsafe(
        `UPDATE ia_cliente_externo SET chave_hash = ?, chave_final = ?, nome = ?, ativo = 1 WHERE id = ?`,
        hash(chave), chave.slice(-6), nome, Number(jaTem.id),
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ia_cliente_externo
           (nome, chave_hash, chave_final, limite_dia, cnpj, instalacao, origem)
         VALUES (?,?,?,?,?,?,'erp')`,
        nome, hash(chave), chave.slice(-6), LIMITE_PADRAO_DIA, cnpj, instalacao,
      )
    }

    // Registra quando a licença veio embrulhada: é sinal de que o ERP manda um valor composto,
    // e vale saber disso sem precisar abrir chamado.
    await logar(
      liberadaPor ? `provisionado (${liberadaPor})`
        : extraida ? 'provisionado (licença extraída do valor enviado)'
        : 'provisionado',
      null, licencasDoCnpj)

    const config = await obterConfigIA()
    return {
      chave,
      cliente: nome,
      limiteDia: LIMITE_PADRAO_DIA,
      iaDisponivel: config.ativo && !!config.apiKey,
      aviso: 'Guarde esta chave: ela não é devolvida de novo. Provisionar outra vez gera uma nova '
        + 'e invalida esta, apenas para esta instalação.',
    }
  })

  /** Teste de vida para o ERP conferir chave e disponibilidade sem gastar uma chamada de IA. */
  app.get('/status', { schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const chave = request.headers['x-api-key'] as string | undefined
    if (!chave) return reply.status(401).send({ error: 'Informe a chave em X-API-Key.' })
    const [c] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT nome, ativo, limite_dia FROM ia_cliente_externo WHERE chave_hash = ?`, hash(chave))
    if (!c) return reply.status(401).send({ error: 'Chave inválida.' })
    const config = await obterConfigIA()
    const hoje = new Date().toISOString().slice(0, 10)
    const [uso] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.chamadas FROM ia_cliente_uso u
         INNER JOIN ia_cliente_externo e ON e.id = u.cliente_id
        WHERE e.chave_hash = ? AND u.dia = ?`, hash(chave), hoje)
    return {
      cliente: c.nome,
      ativo: !!c.ativo,
      iaDisponivel: config.ativo && !!config.apiKey,
      usoHoje: Number(uso?.chamadas ?? 0),
      limiteDia: Number(c.limite_dia),
    }
  })

  /**
   * Consumo da IA externa: quem gasta mais e o que mais perguntam. Serve para dimensionar custo
   * e para decidir o que melhorar na ferramenta.
   */
  app.get('/consumo', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { dias } = request.query as { dias?: string }
    const janela = Math.min(Math.max(Number(dias) || 30, 1), 365)

    const porCliente = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(c.cnpj, '') AS cnpj,
              COALESCE(MAX(c.cliente_nome), '') AS nome,
              COUNT(*) AS perguntas,
              SUM(c.tokens_total) AS tokens,
              SUM(c.erro IS NOT NULL) AS erros,
              ROUND(AVG(c.duracao_ms)) AS media_ms,
              MAX(c.criado_em) AS ultima,
              e.nome AS sistema
         FROM ia_cliente_conversa c
         LEFT JOIN ia_cliente_externo e ON e.id = c.cliente_id
        WHERE c.criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY c.cnpj, e.nome
        ORDER BY tokens DESC LIMIT 100`, janela)

    const porRelatorio = await prisma.$queryRawUnsafe<any[]>(
      `SELECT relatorio, COUNT(*) AS perguntas, SUM(tokens_total) AS tokens,
              COUNT(DISTINCT cnpj) AS clientes
         FROM ia_cliente_conversa
        WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND relatorio IS NOT NULL
        GROUP BY relatorio ORDER BY perguntas DESC LIMIT 30`, janela)

    // Só as que vieram com pergunta escrita: o resumo automático não diz nada sobre dúvidas.
    const perguntas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT pergunta, relatorio, cnpj, cliente_nome, criado_em
         FROM ia_cliente_conversa
        WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND pergunta IS NOT NULL AND pergunta <> ''
        ORDER BY criado_em DESC LIMIT 100`, janela)

    const porDia = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE(criado_em) AS dia, COUNT(*) AS perguntas, SUM(tokens_total) AS tokens
         FROM ia_cliente_conversa
        WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY dia ORDER BY dia`, janela)

    const [tot] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS perguntas, COALESCE(SUM(tokens_total), 0) AS tokens,
              COUNT(DISTINCT cnpj) AS clientes, SUM(erro IS NOT NULL) AS erros
         FROM ia_cliente_conversa
        WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, janela)

    return {
      dias: janela,
      resumo: {
        perguntas: Number(tot?.perguntas ?? 0),
        tokens: Number(tot?.tokens ?? 0),
        clientes: Number(tot?.clientes ?? 0),
        erros: Number(tot?.erros ?? 0),
      },
      porCliente: porCliente.map((l) => ({
        cnpj: l.cnpj || null,
        nome: l.nome || null,
        sistema: l.sistema ?? null,
        perguntas: Number(l.perguntas ?? 0),
        tokens: Number(l.tokens ?? 0),
        erros: Number(l.erros ?? 0),
        mediaMs: Number(l.media_ms ?? 0),
        ultima: l.ultima ?? null,
      })),
      porRelatorio: porRelatorio.map((l) => ({
        relatorio: l.relatorio,
        perguntas: Number(l.perguntas ?? 0),
        tokens: Number(l.tokens ?? 0),
        clientes: Number(l.clientes ?? 0),
      })),
      perguntas: perguntas.map((l) => ({
        pergunta: l.pergunta,
        relatorio: l.relatorio ?? null,
        cnpj: l.cnpj ?? null,
        cliente: l.cliente_nome ?? null,
        quando: l.criado_em,
      })),
      porDia: porDia.map((l) => ({
        dia: String(l.dia).slice(0, 10),
        perguntas: Number(l.perguntas ?? 0),
        tokens: Number(l.tokens ?? 0),
      })),
    }
  })

  /**
   * Diagnóstico de provisionamento, para suporte. Responde se o CNPJ tem licença e, quando a
   * chave é enviada, se ela casa — sem devolver a licença nem a chave de IA.
   */
  app.get('/diagnostico', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { cnpj: cnpjBruto, licenca } = request.query as { cnpj?: string; licenca?: string }
    const cnpj = String(cnpjBruto ?? '').replace(/\D/g, '')
    if (!cnpj) return { erro: 'Informe o cnpj.' }

    const licencas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, sistema_id, vencimento, demo, LENGTH(chave) AS tamanho_chave,
              (vencimento IS NULL OR vencimento >= CURDATE()) AS vigente
         FROM licencas
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?
        ORDER BY (vencimento IS NULL), vencimento DESC`, cnpj).catch(() => [])

    let confere: boolean | null = null
    let confereIgnorandoCaixa: boolean | null = null
    if (licenca) {
      const [exato] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS q FROM licencas
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ? AND chave = ?`,
        cnpj, licenca).catch(() => [{ q: 0 }])
      const [normalizado] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS q FROM licencas
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?
            AND UPPER(TRIM(chave)) = UPPER(TRIM(?))`,
        cnpj, licenca).catch(() => [{ q: 0 }])
      confere = Number(exato?.q ?? 0) > 0
      confereIgnorandoCaixa = Number(normalizado?.q ?? 0) > 0
    }

    const tentativas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT resultado, motivo, instalacao, sistema, licencas_cnpj, tamanho_chave,
              formato_chave, criado_em
         FROM ia_provisionamento_log WHERE cnpj = ? ORDER BY criado_em DESC LIMIT 20`,
      cnpj).catch(() => [])

    return {
      cnpj,
      licencas: licencas.map((l) => ({
        id: Number(l.id),
        sistemaId: Number(l.sistema_id ?? 0),
        vencimento: l.vencimento ? String(l.vencimento).slice(0, 10) : null,
        vigente: Number(l.vigente ?? 0) === 1,
        demo: String(l.demo ?? 'N') === 'S',
        // Só o tamanho: a licença em si nunca sai daqui.
        tamanhoChave: Number(l.tamanho_chave ?? 0),
      })),
      chaveEnviada: licenca
        ? { tamanho: licenca.length, confereExato: confere, confereIgnorandoCaixa }
        : null,
      tentativas: tentativas.map((l) => ({
        resultado: l.resultado,
        motivo: l.motivo ?? null,
        instalacao: l.instalacao ?? null,
        sistema: l.sistema ?? null,
        licencasDoCnpj: Number(l.licencas_cnpj ?? 0),
        tamanhoChave: Number(l.tamanho_chave ?? 0),
        formatoChave: l.formato_chave ?? null,
        quando: l.criado_em,
      })),
    }
  })

  app.get('/politica', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async () => {
    const [c] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT auto_clientes, exigir_cliente_ativo FROM ia_provisionamento_config ORDER BY id LIMIT 1`)
    const [n] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT SUM(bloqueada = 0) AS liberadas, SUM(bloqueada = 1) AS bloqueadas
         FROM ia_instalacao_autorizada`).catch(() => [null])
    return {
      autoClientes: Number(c?.auto_clientes ?? 0) === 1,
      exigirClienteAtivo: Number(c?.exigir_cliente_ativo ?? 1) === 1,
      liberadas: Number(n?.liberadas ?? 0),
      bloqueadas: Number(n?.bloqueadas ?? 0),
    }
  })

  app.put('/politica', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const b = request.body as { autoClientes?: boolean; exigirClienteAtivo?: boolean }
    await prisma.$executeRawUnsafe(
      `UPDATE ia_provisionamento_config SET auto_clientes = ?, exigir_cliente_ativo = ? ORDER BY id LIMIT 1`,
      b.autoClientes ? 1 : 0, b.exigirClienteAtivo === false ? 0 : 1,
    )
    return { ok: true }
  })

  /** Instalações que falharam a validação e aguardam decisão de alguém. */
  app.get('/instalacoes-pendentes', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT l.cnpj, l.instalacao, MAX(l.criado_em) AS ultima, COUNT(*) AS tentativas,
             MAX(l.sistema) AS sistema, MAX(l.motivo) AS motivo,
             (SELECT c.NOME_FANTASIA FROM cliente c
               WHERE REPLACE(REPLACE(REPLACE(REPLACE(c.CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = l.cnpj
               LIMIT 1) AS cliente,
             (SELECT a.bloqueada FROM ia_instalacao_autorizada a
               WHERE a.cnpj = l.cnpj AND a.instalacao = l.instalacao) AS bloqueada,
             (SELECT a.origem FROM ia_instalacao_autorizada a
               WHERE a.cnpj = l.cnpj AND a.instalacao = l.instalacao) AS origem_decisao
        FROM ia_provisionamento_log l
       WHERE l.instalacao IS NOT NULL
       GROUP BY l.cnpj, l.instalacao
       ORDER BY ultima DESC LIMIT 100`).catch(() => [])
    return linhas.map((l) => ({
      cnpj: l.cnpj,
      cliente: l.cliente ?? null,
      instalacao: l.instalacao,
      sistema: l.sistema ?? null,
      motivo: l.motivo ?? null,
      tentativas: Number(l.tentativas ?? 0),
      ultima: l.ultima,
      autorizada: l.bloqueada != null && Number(l.bloqueada) === 0,
      bloqueada: Number(l.bloqueada ?? 0) === 1,
      origemDecisao: l.origem_decisao ?? null,
    }))
  })

  /**
   * Libera uma instalação específica. Só faça isso quando souber de quem é a máquina: a partir
   * daqui ela provisiona sem apresentar licença.
   */
  app.post('/instalacoes-autorizadas', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const b = request.body as { cnpj?: string; instalacao?: string; observacao?: string }
    const cnpj = String(b.cnpj ?? '').replace(/\D/g, '')
    const instalacao = String(b.instalacao ?? '').trim().slice(0, 80)
    if (!cnpj || !instalacao) {
      return reply.status(400).send({ error: 'Informe o cnpj e a instalação.' })
    }
    // Mesmo na liberação manual, o CNPJ precisa ser de um cliente conhecido.
    const [cli] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cod_cli FROM cliente
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI,'.',''),'/',''),'-',''),' ','') = ? LIMIT 1`, cnpj)
    if (!cli) return reply.status(400).send({ error: 'CNPJ não encontrado na base de clientes.' })

    await prisma.$executeRawUnsafe(
      `INSERT INTO ia_instalacao_autorizada (cnpj, instalacao, observacao, autorizado_por)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE observacao = VALUES(observacao), autorizado_por = VALUES(autorizado_por)`,
      cnpj, instalacao, String(b.observacao ?? '').slice(0, 200) || null,
      Number((request.user as { id: number } | undefined)?.id ?? 0) || null,
    )
    return reply.status(201).send({ ok: true })
  })

  /**
   * Revogar grava um BLOQUEIO, em vez de apagar a liberação. Com a liberação automática ligada,
   * apagar a linha faria a instalação ser liberada de novo na tentativa seguinte.
   */
  app.delete('/instalacoes-autorizadas', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { cnpj: cnpjBruto, instalacao: inst } = request.query as { cnpj?: string; instalacao?: string }
    const cnpj = String(cnpjBruto ?? '').replace(/\D/g, '')
    const instalacao = String(inst ?? '').trim()
    await prisma.$executeRawUnsafe(
      `INSERT INTO ia_instalacao_autorizada (cnpj, instalacao, bloqueada, origem, observacao)
       VALUES (?,?,1,'manual','Bloqueada manualmente')
       ON DUPLICATE KEY UPDATE bloqueada = 1, observacao = 'Bloqueada manualmente'`,
      cnpj, instalacao)
    // A chave que já estava na máquina para de funcionar na hora.
    await prisma.$executeRawUnsafe(
      `UPDATE ia_cliente_externo SET ativo = 0 WHERE cnpj = ? AND instalacao = ?`,
      cnpj, instalacao).catch(() => {})
    return { ok: true }
  })

  /** Desfaz o bloqueio, devolvendo a instalação à política vigente. */
  app.post('/instalacoes-autorizadas/desbloquear', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const b = request.body as { cnpj?: string; instalacao?: string }
    const cnpj = String(b.cnpj ?? '').replace(/\D/g, '')
    const instalacao = String(b.instalacao ?? '').trim()
    await prisma.$executeRawUnsafe(
      `UPDATE ia_instalacao_autorizada SET bloqueada = 0 WHERE cnpj = ? AND instalacao = ?`,
      cnpj, instalacao)
    await prisma.$executeRawUnsafe(
      `UPDATE ia_cliente_externo SET ativo = 1 WHERE cnpj = ? AND instalacao = ?`,
      cnpj, instalacao).catch(() => {})
    return { ok: true }
  })

  // ── Administração das chaves (usuário logado no Analytics) ──
  app.get('/chaves', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT e.id, e.nome, e.chave_final, e.ativo, e.limite_dia, e.ultimo_uso, e.criado_em,
             e.cnpj, e.instalacao, e.origem,
             COALESCE((SELECT u.chamadas FROM ia_cliente_uso u
                        WHERE u.cliente_id = e.id AND u.dia = CURDATE()), 0) AS uso_hoje
        FROM ia_cliente_externo e ORDER BY e.ativo DESC, e.nome`)
    return linhas.map((l) => ({
      id: Number(l.id),
      nome: l.nome,
      chaveFinal: l.chave_final,
      cnpj: l.cnpj ?? null,
      instalacao: l.instalacao ?? null,
      origem: l.origem ?? 'manual',
      ativo: !!l.ativo,
      limiteDia: Number(l.limite_dia),
      usoHoje: Number(l.uso_hoje ?? 0),
      ultimoUso: l.ultimo_uso ?? null,
      criadoEm: l.criado_em,
    }))
  })

  app.post('/chaves', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request, reply) => {
    const b = request.body as { nome?: string; limiteDia?: number }
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do sistema.' })

    const chave = `ca_${crypto.randomBytes(24).toString('hex')}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO ia_cliente_externo (nome, chave_hash, chave_final, limite_dia) VALUES (?,?,?,?)`,
      nome, hash(chave), chave.slice(-6), Number(b.limiteDia) || LIMITE_PADRAO_DIA,
    )
    // Única vez que a chave existe em texto: guardamos só o hash.
    return reply.status(201).send({ chave, aviso: 'Copie agora: esta chave não será exibida de novo.' })
  })

  app.put('/chaves/:id', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const b = request.body as { nome?: string; ativo?: boolean; limiteDia?: number }
    await prisma.$executeRawUnsafe(
      `UPDATE ia_cliente_externo SET nome = COALESCE(?, nome), ativo = ?, limite_dia = COALESCE(?, limite_dia)
        WHERE id = ?`,
      String(b.nome ?? '').trim() || null, b.ativo === false ? 0 : 1,
      Number(b.limiteDia) || null, Number(id),
    )
    return { ok: true }
  })

  app.delete('/chaves/:id', { preHandler: authMiddleware, schema: { tags: ['IA externa'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM ia_cliente_externo WHERE id = ?`, Number(id))
    return { ok: true }
  })
}
