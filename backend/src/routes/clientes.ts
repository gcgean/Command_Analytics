import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { ensureProntuarioGuard } from '../utils/prontuarioGuard'

type LegacyContatoRow = {
  descricao?: string | null
  numero?: string | null
  setor?: string | null
}

type LegacyVendaRow = {
  tipoInstalacao?: string | null
  qtdMaquinas?: string | null
  tipoServidor?: string | null
  qtdSistemas?: string | null
  tipoDocFiscal?: string | null
  balancaIntegrada?: string | null
  qtdImpressorasComp?: string | null
  impressoraCompartilhada?: string | null
  qtdImpressorasEtq?: string | null
  imprimirEtiquetaCompartilhada?: string | null
  qtdBalancasEtq?: string | null
  certificadoDigital?: string | null
  tipoTreinamento?: string | null
  qtdPessoasTreinamento?: string | null
  setoresTreinamento?: string | null
  nomeVendedor?: string | null
  observacaoNegocio?: string | null
}

type ClienteNuvemRow = {
  idGrupo?: number | null
  descricaoNuvemCliente?: string | null
  descPlanoNuvem?: string | null
  portaPrincipal?: number | string | null
  portaArquivos?: number | string | null
  portaAplicativos?: number | string | null
  idServerNuvem?: number | null
  nomeServidor?: string | null
  descricaoNuvem?: string | null
  numeroServidor?: number | string | null
  portaApiServidor?: number | string | null
}

function toTimeText(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/(\d{2}:\d{2})/)
    return match ? match[1] : String(value)
  }
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function addMinutesToTime(time: string | null | undefined, durationMin: number | null | undefined) {
  if (!time) return null
  const match = time.match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const total = (hours * 60) + minutes + Number(durationMin ?? 0)
  const normalized = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

const DEPARTAMENTO_LABEL: Record<number, string> = {
  1: 'Suporte',
  2: 'Comercial',
  3: 'Financeiro',
  4: 'Certificado',
  5: 'CS',
  6: 'Fiscal',
  7: 'Instalação',
  8: 'Treinamento',
  9: 'Técnico',
  10: 'Desenvolvimento',
  11: 'Migração',
}

async function getClienteLegacyData(clienteId: number) {
  let observacaoPlataforma: string | null = null
  let contatos: LegacyContatoRow[] = []
  let vendaRow: LegacyVendaRow | null = null

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ observacaoPlataforma: string | null }>>(
      'SELECT Observacao_plataforma AS observacaoPlataforma FROM cliente WHERE cod_cli = ? LIMIT 1',
      clienteId,
    )
    observacaoPlataforma = rows?.[0]?.observacaoPlataforma ?? null
  } catch {
    observacaoPlataforma = null
  }

  try {
    const rows = await prisma.$queryRawUnsafe<LegacyVendaRow[]>(
      `SELECT
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 1 limit 1) as tipoInstalacao,
        (select dipi.desc_outro from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 2 limit 1) as qtdMaquinas,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 3 limit 1) as tipoServidor,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 4 limit 1) as qtdSistemas,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 5 limit 1) as tipoDocFiscal,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 6 limit 1) as balancaIntegrada,
        (select dipi.desc_outro from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 7 limit 1) as qtdImpressorasComp,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 8 limit 1) as impressoraCompartilhada,
        (select dipi.desc_outro from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 9 limit 1) as qtdImpressorasEtq,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 10 limit 1) as imprimirEtiquetaCompartilhada,
        (select dipi.desc_outro from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 11 limit 1) as qtdBalancasEtq,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 12 limit 1) as certificadoDigital,
        (select ip.descricao from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 13 limit 1) as tipoTreinamento,
        (select dipi.desc_outro from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 14 limit 1) as qtdPessoasTreinamento,
        (select group_concat(ip.descricao separator ', ') from dados_instalacao_processo_implantacao dipi inner join itens_pergunta ip on (dipi.id_item_pergunta = ip.id) where dipi.id_processo = pi.id and ip.id_pergunta = 15) as setoresTreinamento,
        (select u.NOME_USUARIO_COMPLETO from processo_implantacao_comercial pic inner join usuario u on (pic.id_usu_dados = u.COD_USU) where pic.id_processo = pi.id limit 1) as nomeVendedor,
        (select n.descricao from negocios n where n.id = pi.id_negocio limit 1) as observacaoNegocio
      FROM cliente c
      LEFT JOIN processo_implantacao pi ON (c.cod_cli = pi.id_cli)
      WHERE c.cod_cli = ?
      ORDER BY pi.id DESC
      LIMIT 1`,
      clienteId,
    )
    vendaRow = rows?.[0] ?? null
  } catch {
    vendaRow = null
  }

  try {
    contatos = await prisma.$queryRawUnsafe<LegacyContatoRow[]>(
      'SELECT DESCRICAO AS descricao, NUMERO AS numero, setor FROM CONTATOS WHERE COD_CLI = ? ORDER BY DESCRICAO ASC',
      clienteId,
    )
  } catch {
    try {
      contatos = await prisma.$queryRawUnsafe<LegacyContatoRow[]>(
        'SELECT descricao, numero, setor FROM contatos WHERE cod_cli = ? ORDER BY descricao ASC',
        clienteId,
      )
    } catch {
      contatos = []
    }
  }

  return {
    observacaoPlataforma,
    vendaCampos: [
      ['TIPO DE INSTALACAO', vendaRow?.tipoInstalacao],
      ['QTD DE MAQUINAS', vendaRow?.qtdMaquinas],
      ['TIPO DE SERVIDOR', vendaRow?.tipoServidor],
      ['QTD DE SISTEMAS', vendaRow?.qtdSistemas],
      ['TIPO DE DOCUMENTO FISCAL', vendaRow?.tipoDocFiscal],
      ['BALANCA INTEGRADA', vendaRow?.balancaIntegrada],
      ['QTD DE IMPRESSORAS COMPARTILHADAS', vendaRow?.qtdImpressorasComp],
      ['IMPRESSORA COMPARTILHADA', vendaRow?.impressoraCompartilhada],
      ['QTD IMPRESSORA DE ETIQUETAS', vendaRow?.qtdImpressorasEtq],
      ['IMPRIMIR ETIQUETA COMPARTILHADA', vendaRow?.imprimirEtiquetaCompartilhada],
      ['QTD DE BALANCAS DE ETIQUETAS', vendaRow?.qtdBalancasEtq],
      ['CERTIFICADO DIGITAL', vendaRow?.certificadoDigital],
      ['TIPO DE TREINAMENTO', vendaRow?.tipoTreinamento],
      ['QTD DE PESSOAS DO TREINAMENTO', vendaRow?.qtdPessoasTreinamento],
      ['SETORES DO TREINAMENTO', vendaRow?.setoresTreinamento],
      ['NOME DO VENDEDOR', vendaRow?.nomeVendedor],
      ['OBSERVACAO DO NEGOCIO', vendaRow?.observacaoNegocio],
    ].map(([label, value]) => ({
      label,
      value: value ? String(value).trim() : '',
    })),
    contatos: contatos.map((contato) => ({
      descricao: String(contato.descricao ?? '').trim(),
      numero: String(contato.numero ?? '').trim(),
      setor: contato.setor ? String(contato.setor).trim() : null,
    })).filter((contato) => contato.descricao || contato.numero || contato.setor),
  }
}

async function getClienteNuvemData(clienteId: number) {
  try {
    const rows = await prisma.$queryRawUnsafe<ClienteNuvemRow[]>(
      `SELECT DISTINCT
        gu.id_grupo AS idGrupo,
        gu.descricao AS descricaoNuvemCliente,
        p.descricao AS descPlanoNuvem,
        gu.porta_principal AS portaPrincipal,
        gu.porta_arquivos AS portaArquivos,
        gu.porta_aplicativos AS portaAplicativos,
        sn.id_server_nuvem AS idServerNuvem,
        sn.nome_servidor AS nomeServidor,
        sn.descricao_nuvem AS descricaoNuvem,
        sn.numero_servidor AS numeroServidor,
        sn.porta_api_servidor AS portaApiServidor
      FROM cliente c
      INNER JOIN grupo_clientes_dados_gerais gc
        ON gc.cod_cli = c.cod_cli
      INNER JOIN grupo_clientes gu
        ON gu.id_grupo = gc.id_grupo
      LEFT JOIN servidor_nuvem sn
        ON sn.id_server_nuvem = gu.id_servidor_nuvem
      LEFT JOIN planos p
        ON p.id = (
          SELECT cp.id_plano
          FROM cliente_planos cp
          INNER JOIN planos p2
            ON p2.id = cp.id_plano
          WHERE cp.id_cli = c.cod_cli
            AND COALESCE(p2.tamanho_max_nuvem, 0) > 0
          ORDER BY cp.id
          LIMIT 1
        )
      WHERE c.cod_cli = ?
        AND c.ativo = 'S'
        AND COALESCE(gu.ativo, '') <> 'N'
      ORDER BY sn.numero_servidor, sn.nome_servidor, gu.id_grupo`,
      clienteId,
    )

    return rows.map((row) => ({
      idGrupo: row.idGrupo != null ? Number(row.idGrupo) : null,
      descricaoNuvemCliente: row.descricaoNuvemCliente ? String(row.descricaoNuvemCliente).trim() : null,
      descPlanoNuvem: row.descPlanoNuvem ? String(row.descPlanoNuvem).trim() : null,
      portaPrincipal: row.portaPrincipal != null && row.portaPrincipal !== '' ? String(row.portaPrincipal).trim() : null,
      portaArquivos: row.portaArquivos != null && row.portaArquivos !== '' ? String(row.portaArquivos).trim() : null,
      portaAplicativos: row.portaAplicativos != null && row.portaAplicativos !== '' ? String(row.portaAplicativos).trim() : null,
      idServerNuvem: row.idServerNuvem != null ? Number(row.idServerNuvem) : null,
      nomeServidor: row.nomeServidor ? String(row.nomeServidor).trim() : null,
      descricaoNuvem: row.descricaoNuvem ? String(row.descricaoNuvem).trim() : null,
      numeroServidor: row.numeroServidor != null && row.numeroServidor !== '' ? String(row.numeroServidor).trim() : null,
      portaApiServidor: row.portaApiServidor != null && row.portaApiServidor !== '' ? String(row.portaApiServidor).trim() : null,
    }))
  } catch {
    return []
  }
}

function fmt(c: any) {
  return {
    id: c.id,
    nome: c.nome,
    nomeRazao: c.nomeRazao,
    cnpj: c.cnpj,
    cidade: c.cidade,
    uf: c.uf,
    endereco: c.endereco,
    telefoneResidencial: c.telefoneResidencial,
    cep: c.cep,
    classificacaoNome: c.classificacao?.nome ?? null,
    telefone: c.telefone,
    email: c.email,
    ativo: c.ativo,
    bloqueado: c.bloqueado,
    curvaABC: c.curvaABC,
    mensalidade: c.mensalidade,
    dataContrato: c.dataContrato,
    responsavel: c.responsavel,
    idSegmento: c.idSegmento,
    idRegime: c.idRegime,
    idPlano: c.idPlano,
    contadorId: c.contadorId,
    observacoes: c.observacoes,
    obsVenda: c.obsVenda,
    // Contador embutido se incluído
    contador: c.contador
      ? {
          id: c.contador.id,
          nome: c.contador.nome,
          nomeComercial: c.contador.nomeComercial,
          email: c.contador.email,
          telefone: c.contador.telefone,
        }
      : undefined,
  }
}

export async function clientesRoutes(app: FastifyInstance) {
  // GET /clientes
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Listar clientes' } }, async (request) => {
    const { ativo, bloqueado, curvaABC, search, idSegmento, idRegime, idPlano, contadorId, codCla, page, limit } = request.query as Record<string, string>

    // Permite buscar CNPJ/CPF digitando só os números, sem pontuação (ex.: "42396737"),
    // já que o campo cnpj guarda o documento formatado ("42.396.737/0001-15").
    const documentoDigitos = String(search ?? '').replace(/\D/g, '')
    let idsPorDocumento: number[] = []
    if (documentoDigitos.length >= 4) {
      const rows = await prisma.$queryRaw<Array<{ cod_cli: number }>>`
        SELECT cod_cli
        FROM cliente
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(CNPJ_CLI, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ${'%' + documentoDigitos + '%'}
        LIMIT 200
      `
      idsPorDocumento = rows.map((r) => Number(r.cod_cli))
    }

    const where: any = {
      ...(ativo !== undefined && { ativo }),
      ...(bloqueado !== undefined && { bloqueado }),
      ...(curvaABC && { curvaABC }),
      ...(search && {
        OR: [
          { nome: { contains: search } },
          { nomeRazao: { contains: search } },
          { cnpj: { contains: search } },
          { cidade: { contains: search } },
          ...(idsPorDocumento.length ? [{ id: { in: idsPorDocumento } }] : []),
        ],
      }),
      ...(idSegmento && { idSegmento: Number(idSegmento) }),
      ...(idRegime && { idRegime: Number(idRegime) }),
      ...(idPlano && { idPlano: Number(idPlano) }),
      ...(codCla && { codCla: Number(codCla) }),
    }

    if (contadorId) {
      const links = await prisma.contadorCliente.findMany({
        where: { contadorId: Number(contadorId) },
        select: { clienteId: true },
      })
      const clientIds = links.map(l => l.clienteId).filter(id => id !== null) as number[]
      where.id = { in: clientIds }
    }

    const pg = page ? Math.max(Number(page), 1) : undefined
    const lm = limit ? Math.max(Number(limit), 1) : undefined

    if (pg && lm) {
      const total = await prisma.cliente.count({ where })
      const pages = Math.max(Math.ceil(total / lm), 1)
      const data = await prisma.cliente.findMany({
        where,
        include: {
          contador: {
            select: { id: true, nome: true, nomeComercial: true, email: true, telefone: true },
          },
          classificacao: {
            select: { nome: true },
          },
        },
        orderBy: { nome: 'asc' },
        skip: (pg - 1) * lm,
        take: lm,
      })
      return { total, page: pg, limit: lm, pages, data: data.map(fmt) }
    }

    const clientes = await prisma.cliente.findMany({
      where,
      include: {
        contador: {
          select: { id: true, nome: true, nomeComercial: true, email: true, telefone: true },
        },
        classificacao: {
          select: { nome: true },
        },
      },
      orderBy: { nome: 'asc' },
    })
    return clientes.map(fmt)
  })

  // GET /clientes/ativos — atalho para clientes ativos e não bloqueados
  app.get('/ativos', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Clientes ativos e não bloqueados' } }, async () => {
    const clientes = await prisma.cliente.findMany({
      where: { ativo: 'S', bloqueado: 'N' },
      orderBy: { nome: 'asc' },
    })
    return clientes.map(fmt)
  })

  // GET /clientes/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(id) },
        include: {
          contador: true,
          classificacao: { select: { nome: true } },
          assinaturas: {
            orderBy: { dataCriacao: 'desc' },
          },
        agendaItens: {
          include: {
            tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
          },
          orderBy: [{ data: 'desc' }, { horarioIni: 'desc' }],
        },
        agendamentosProg: {
          include: {
            tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
          },
          orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
        },
      },
    })
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })

    const legacy = await getClienteLegacyData(Number(id))
    const nuvens = await getClienteNuvemData(Number(id))
    const atendimentosHistorico = await prisma.$queryRawUnsafe<Array<{
      id: number
      clienteId: number | null
      observacoes: string | null
      solucao: string | null
      dataAtendimento: Date | string | null
      dataFechamento: Date | string | null
      nota: number | null
      departamento: number | null
      protocolo: string | null
      clienteNome: string | null
      tempoAtendimento: number | null
      tecnicoNome: string | null
      procedimentos: string | null
    }>>(
      `SELECT
        a.id_Atend AS id,
        a.cod_cli AS clienteId,
        a.Obs_Atendimento AS observacoes,
        a.solucao AS solucao,
        a.Data_hora_atendimento AS dataAtendimento,
        a.Data_hora_finalizacao AS dataFechamento,
        a.nota AS nota,
        a.departamento AS departamento,
        a.protocolo AS protocolo,
        a.nome_cliente_atendimento AS clienteNome,
        a.Tempo_atendimento AS tempoAtendimento,
        (SELECT ua.NOME_USU FROM usuario ua WHERE ua.COD_USU = a.cod_tecnico) AS tecnicoNome,
        (SELECT GROUP_CONCAT(pr.descricao ORDER BY pr.descricao SEPARATOR ', ')
          FROM procedimentos_atendimentos pa
          INNER JOIN procedimentos pr ON pr.cod_procedimento = pa.cod_procedimento
          WHERE pa.cod_atendimento = a.id_Atend) AS procedimentos
      FROM atendimentos a
      WHERE a.cod_cli = ?
        AND a.Status_Atendimento = 7
        AND a.cod_desenvolvedor IS NULL
        AND a.protocolo IS NOT NULL
        AND TRIM(a.protocolo) <> ''
      ORDER BY a.Data_hora_finalizacao DESC, a.id_Atend DESC`,
      Number(id),
    )
    const totalChamados = atendimentosHistorico.length
    const atendimentosComTempo = atendimentosHistorico.filter((item) => item.tempoAtendimento != null && Number(item.tempoAtendimento) > 0)
    const tempoMedioMinutos = atendimentosComTempo.length
      ? Number((atendimentosComTempo.reduce((acc, item) => acc + Number(item.tempoAtendimento ?? 0), 0) / atendimentosComTempo.length).toFixed(1))
      : null
    const desenvolvimentoHistorico = await prisma.$queryRawUnsafe<Array<{
      id: number
      clienteId: number | null
      clienteNome: string | null
      solicitacao: string | null
      dataSolicitacao: Date | string | null
      dataReferencia: Date | string | null
      tecnicoNome: string | null
      desenvolvedorNome: string | null
    }>>(
      `SELECT
        a.id_Atend AS id,
        a.cod_cli AS clienteId,
        c.NOME_FANTASIA AS clienteNome,
        a.Obs_Atendimento AS solicitacao,
        a.Data_hora_atendimento AS dataSolicitacao,
        COALESCE(a.Data_Ult_alteracao, a.Data_hora_finalizacao) AS dataReferencia,
        (SELECT ua.NOME_USU FROM usuario ua WHERE ua.COD_USU = a.cod_tecnico) AS tecnicoNome,
        (SELECT ua.NOME_USU FROM usuario ua WHERE ua.COD_USU = a.cod_desenvolvedor) AS desenvolvedorNome
      FROM atendimentos a
      INNER JOIN cliente c ON c.cod_cli = a.cod_cli
      WHERE a.cod_cli = ?
        AND a.Status_Atendimento = 7
        AND COALESCE(a.protocolo, 0) <= 0
        AND a.Obs_Atendimento <> 'LANCADO VIA EXCEL'
      ORDER BY COALESCE(a.Data_Ult_alteracao, a.Data_hora_finalizacao) DESC, a.id_Atend DESC`,
      Number(id),
    )
    const dataCadastro = cliente.dataContrato instanceof Date ? cliente.dataContrato : (cliente.dataContrato ? new Date(cliente.dataContrato) : null)
    const diasBase = dataCadastro && !Number.isNaN(dataCadastro.getTime())
      ? Math.max(1, Math.ceil((Date.now() - dataCadastro.getTime()) / 86400000))
      : null
    const mediaChamadosPorDia = diasBase ? Number((totalChamados / diasBase).toFixed(2)) : null
    const { assinaturas, agendaItens, agendamentosProg, ...rest } = cliente as any
    const agendaHistorico = [
      ...agendaItens.map(({ tecnico, ...item }: any) => ({
        ...item,
        origem: 'agenda' as const,
        tecnicoNome: tecnico?.nomeCompleto || tecnico?.nomeUsu || 'Usuário',
      })),
      ...agendamentosProg.map(({ tecnico, duracao, descricao, horaInicio, ...item }: any) => ({
        ...item,
        origem: 'agendamento_programado' as const,
        tipo: item.procedimentoNome ?? 'Agendamento programado',
        horarioIni: toTimeText(horaInicio),
        horarioFim: addMinutesToTime(toTimeText(horaInicio), duracao),
        dataFim: item.data,
        observacoes: descricao ?? null,
        tecnicoNome: tecnico?.nomeCompleto || tecnico?.nomeUsu || 'Usuário',
      })),
    ].sort((a, b) => {
      const aDate = new Date(`${String(a.data ?? '').substring(0, 10)}T${a.horarioIni ?? '00:00'}:00`).getTime()
      const bDate = new Date(`${String(b.data ?? '').substring(0, 10)}T${b.horarioIni ?? '00:00'}:00`).getTime()
      return bDate - aDate
    })

    return {
      ...fmt(rest),
      atendimentos: atendimentosHistorico.map((a) => ({
        id: Number(a.id),
        clienteId: a.clienteId != null ? Number(a.clienteId) : null,
        clienteNome: a.clienteNome ?? cliente.nome ?? '—',
        tecnicoId: null,
        tecnicoNome: a.tecnicoNome ?? 'Usuário',
        departamento: a.departamento != null ? Number(a.departamento) : null,
        departamentoLabel: a.departamento != null ? (DEPARTAMENTO_LABEL[Number(a.departamento)] ?? `Depto ${a.departamento}`) : null,
        tipoContato: null,
        status: 7,
        prioridade: null,
        bugSistema: null,
        foraHorario: null,
        observacoes: a.observacoes ?? null,
        solucao: a.solucao ?? null,
        dataAbertura: a.dataAtendimento ? new Date(a.dataAtendimento).toISOString() : null,
        dataFechamento: a.dataFechamento ? new Date(a.dataFechamento).toISOString() : null,
        nota: a.nota != null ? Number(a.nota) : null,
        procedimentos: a.procedimentos ?? null,
        tempoAtendimento: a.tempoAtendimento != null ? Number(a.tempoAtendimento) : null,
        protocolo: a.protocolo ?? null,
      })),
      resumoAtendimentos: {
        totalChamados,
        tempoMedioMinutos,
        mediaChamadosPorDia,
      },
      historicoDesenvolvimento: desenvolvimentoHistorico.map((item) => ({
        id: Number(item.id),
        clienteId: item.clienteId != null ? Number(item.clienteId) : null,
        clienteNome: item.clienteNome ?? cliente.nome ?? '—',
        solicitacao: item.solicitacao ?? 'Solicitação sem descrição.',
        dataSolicitacao: item.dataSolicitacao ? new Date(item.dataSolicitacao).toISOString() : null,
        dataReferencia: item.dataReferencia ? new Date(item.dataReferencia).toISOString() : null,
        tecnicoNome: item.tecnicoNome ?? null,
        desenvolvedorNome: item.desenvolvedorNome ?? null,
      })),
      assinaturas,
      nuvens,
      legado: {
        observacaoPlataforma: legacy.observacaoPlataforma,
        contatos: legacy.contatos,
        vendaCampos: legacy.vendaCampos,
        agendaObservacoes: agendaHistorico,
      },
    }
  })

  // POST /clientes
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const cliente = await prisma.cliente.create({ data: body as never })
    return reply.status(201).send(fmt(cliente))
  })

  // PUT /clientes/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Clientes'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const cliente = await prisma.cliente.update({
      where: { id: Number(id) },
      data: body as never,
    })
    return fmt(cliente)
  })

  app.put('/:id/prontuario', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Atualiza o prontuário do cliente' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const clienteId = Number(id)
    const payload = request.user as { id: number }
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return reply.status(400).send({ error: 'Cliente inválido.' })
    }

    const { observacoes, baseObservacoes } = request.body as { observacoes?: string; baseObservacoes?: string }
    const conteudo = String(observacoes ?? '')

    try {
      await ensureProntuarioGuard()

      const before = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, obsVenda: true },
      })
      if (!before) {
        return reply.status(404).send({ error: 'Cliente não encontrado.' })
      }

      // Controle de concorrência otimista: se o conteúdo atual no banco já não é mais
      // o mesmo que o editor tinha carregado (baseObservacoes), significa que alguém
      // salvou uma versão mais nova enquanto este usuário editava — recusa o save cego
      // (que sobrescreveria silenciosamente a versão mais recente) e devolve o conteúdo
      // atual para o front-end decidir o que fazer.
      if (baseObservacoes !== undefined) {
        const atualNoBanco = before.obsVenda ?? ''
        if (atualNoBanco !== baseObservacoes) {
          return reply.status(409).send({
            error: 'Este prontuário foi alterado por outra pessoa enquanto você editava. Revise a versão mais recente antes de salvar por cima.',
            atual: atualNoBanco,
          })
        }
      }

      // A gravação em OBS_VENDA é protegida por um trigger no banco (ver initProntuarioGuard):
      // qualquer UPDATE nessa coluna que não venha marcado com @allow_obs_venda_write = 1 é
      // revertido automaticamente. Isso bloqueia sobrescritas vindas do sistema legado (que
      // historicamente trunca o campo em 200 caracteres) — só este endpoint define a marca,
      // e sempre na mesma transação/conexão do UPDATE.
      await prisma.$transaction([
        prisma.$executeRaw`SET @allow_obs_venda_write = 1`,
        prisma.$executeRaw`UPDATE cliente SET OBS_VENDA = ${conteudo} WHERE cod_cli = ${clienteId}`,
      ])

      const cliente = await prisma.cliente.findUniqueOrThrow({
        where: { id: clienteId },
        include: {
          contador: {
            select: { id: true, nome: true, nomeComercial: true, email: true, telefone: true },
          },
          classificacao: {
            select: { nome: true },
          },
        },
      })

      registrarAuditoria({
        tabela: 'cliente_prontuario',
        registroId: clienteId,
        acao: 'ALTERACAO',
        usuarioId: payload.id,
        dadosAntes: {
          prontuario: before.obsVenda ?? null,
        },
        dadosDepois: {
          prontuario: conteudo || null,
        },
      })

      return fmt(cliente)
    } catch (error: any) {
      const message = String(error?.message ?? '')
      if (message.toLowerCase().includes('record to update not found')) {
        return reply.status(404).send({ error: 'Cliente não encontrado.' })
      }
      return reply.status(500).send({ error: 'Não foi possível salvar o prontuário.' })
    }
  })

  // PATCH /clientes/:id/toggle — ativar/inativar
  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Ativar/inativar cliente' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
    if (!cliente) return reply.status(404).send({ error: 'Cliente não encontrado.' })
    const novoAtivo = cliente.ativo === 'S' ? 'N' : 'S'
    const updated = await prisma.cliente.update({
      where: { id: Number(id) },
      data: { ativo: novoAtivo },
    })
    return fmt(updated)
  })

  // GET /clientes/monitor/resumo — contagens por status
  app.get('/monitor/resumo', { preHandler: authMiddleware, schema: { tags: ['Clientes'], summary: 'Resumo de clientes por status' } }, async () => {
    const [total, ativos, inativos, bloqueados, curvaA, curvaB, curvaC] = await Promise.all([
      prisma.cliente.count(),
      prisma.cliente.count({ where: { ativo: 'S', bloqueado: 'N' } }),
      prisma.cliente.count({ where: { ativo: 'N' } }),
      prisma.cliente.count({ where: { bloqueado: 'S' } }),
      prisma.cliente.count({ where: { curvaABC: 'A' } }),
      prisma.cliente.count({ where: { curvaABC: 'B' } }),
      prisma.cliente.count({ where: { curvaABC: 'C' } }),
    ])
    return { total, ativos, inativos, bloqueados, curvaA, curvaB, curvaC }
  })
}
