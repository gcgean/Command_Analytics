import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  // Limpa tudo em ordem correta
  await prisma.monitorAtendimento.deleteMany()
  await prisma.avaliacaoNPS.deleteMany()
  await prisma.comissao.deleteMany()
  await prisma.analiseFinanceira.deleteMany()
  await prisma.tarefa.deleteMany()
  await prisma.video.deleteMany()
  await prisma.meta.deleteMany()
  await prisma.campanha.deleteMany()
  await prisma.versao.deleteMany()
  await prisma.servidor.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.negocio.deleteMany()
  await prisma.pipelineItem.deleteMany()
  await prisma.atendimento.deleteMany()
  await prisma.agendaItem.deleteMany()
  await prisma.assinatura.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.contador.deleteMany()
  await prisma.plano.deleteMany()
  await prisma.usuario.deleteMany()

  // ============================================================
  // USUÁRIOS
  // ============================================================
  const senhaHash = await bcrypt.hash('123456', 10)
  const [carlos, ana, pedro, mariana, roberto] = await Promise.all([
    prisma.usuario.create({ data: { nome: 'Carlos Silva', email: 'carlos@command.com.br', senha: senhaHash, cargo: 'Analista Suporte', departamento: 'Suporte', ativo: true, permissoes: '["all"]' } }),
    prisma.usuario.create({ data: { nome: 'Ana Rodrigues', email: 'ana@command.com.br', senha: senhaHash, cargo: 'Consultora CS', departamento: 'CS', ativo: true, permissoes: '["all"]' } }),
    prisma.usuario.create({ data: { nome: 'Pedro Alves', email: 'pedro@command.com.br', senha: senhaHash, cargo: 'Desenvolvedor', departamento: 'Técnico', ativo: true, permissoes: '["all"]' } }),
    prisma.usuario.create({ data: { nome: 'Mariana Costa', email: 'mariana@command.com.br', senha: senhaHash, cargo: 'Analista Fiscal', departamento: 'Fiscal', ativo: true, permissoes: '["all"]' } }),
    prisma.usuario.create({ data: { nome: 'Roberto Melo', email: 'roberto@command.com.br', senha: senhaHash, cargo: 'Vendedor', departamento: 'Comercial', ativo: true, permissoes: '["all"]' } }),
  ])
  console.log('✅ Usuários criados')

  // ============================================================
  // PLANOS
  // ============================================================
  const [planoPremium, planoEnterprise, planoBasico, planoStarter, planoAnual] = await Promise.all([
    prisma.plano.create({ data: { nome: 'Premium', descricao: 'Plano completo para empresas de médio porte', preco: 900, periodicidade: 'Mensal', funcionalidades: '["PDV ilimitado","NF-e e NFC-e","Integração SPED","Suporte prioritário","Backup automático","App mobile"]', destaque: false } }),
    prisma.plano.create({ data: { nome: 'Enterprise', descricao: 'Solução enterprise para grandes redes', preco: 2200, periodicidade: 'Mensal', funcionalidades: '["Tudo do Premium","Multi-filial","BI integrado","API dedicada","SLA 4h","Gerente de conta","Integração WMS/ERP"]', destaque: true } }),
    prisma.plano.create({ data: { nome: 'Básico', descricao: 'Ideal para pequenos negócios', preco: 450, periodicidade: 'Mensal', funcionalidades: '["1 PDV","NFC-e","Suporte básico","Backup semanal"]', destaque: false } }),
    prisma.plano.create({ data: { nome: 'Starter', descricao: 'Para negócios que estão começando', preco: 250, periodicidade: 'Mensal', funcionalidades: '["1 PDV","NFC-e básico","Suporte via ticket"]', destaque: false } }),
    prisma.plano.create({ data: { nome: 'Anual Premium', descricao: 'Premium com desconto anual', preco: 800, periodicidade: 'Anual', funcionalidades: '["Tudo do Premium","Desconto 12%","Suporte VIP"]', destaque: false } }),
  ])
  console.log('✅ Planos criados')

  // ============================================================
  // CONTADORES
  // ============================================================
  const [contJoao, contMaria, contCarlosN] = await Promise.all([
    prisma.contador.create({ data: { nome: 'João Contador', empresa: 'JC Contabilidade', telefone: '(11) 3456-0001', email: 'joao@jccontab.com.br', cidade: 'São Paulo', uf: 'SP', totalClientes: 3, totalIndicacoes: 5, dataCadastro: '2022-01-15', ativo: true } }),
    prisma.contador.create({ data: { nome: 'Maria Fiscal', empresa: 'MF Assessoria Fiscal', telefone: '(19) 3456-0002', email: 'maria@mfassessoria.com.br', cidade: 'Campinas', uf: 'SP', totalClientes: 2, totalIndicacoes: 3, dataCadastro: '2023-06-20', ativo: true } }),
    prisma.contador.create({ data: { nome: 'Carlos Nunes', empresa: 'Nunes & Associados', telefone: '(41) 3456-0003', email: 'carlos@nunesassoc.com.br', cidade: 'Curitiba', uf: 'PR', totalClientes: 1, totalIndicacoes: 1, dataCadastro: '2024-02-10', ativo: false } }),
  ])
  console.log('✅ Contadores criados')

  // ============================================================
  // CLIENTES
  // ============================================================
  const [cli1, cli2, cli3, cli4, cli5, cli6, cli7] = await Promise.all([
    prisma.cliente.create({ data: { codigo: 'CLI001', nome: 'Supermercado Bom Preço Ltda', cnpj: '12.345.678/0001-90', cidade: 'São Paulo', uf: 'SP', telefone: '(11) 3456-7890', email: 'contato@bompreco.com.br', segmento: 'Varejo', regime: 'Simples Nacional', curvaABC: 'A', status: 'Ativo', planoId: planoPremium.id, mensalidade: 1200, dataContrato: '2022-03-15', responsavel: 'Ana Rodrigues', versaoSistema: '5.8.2', ultimoBackup: '2026-03-17', ultimoFTP: '2026-03-17', conexoes: 12, caixas: 4, certificadoVencimento: '2026-04-15', contadorId: contJoao.id } }),
    prisma.cliente.create({ data: { codigo: 'CLI002', nome: 'Farmácia Saúde Total', cnpj: '23.456.789/0001-01', cidade: 'Campinas', uf: 'SP', telefone: '(19) 2345-6789', email: 'ti@saudetotal.com.br', segmento: 'Farmácia', regime: 'Lucro Presumido', curvaABC: 'A', status: 'Ativo', planoId: planoEnterprise.id, mensalidade: 2500, dataContrato: '2021-07-01', responsavel: 'Carlos Silva', versaoSistema: '5.8.2', ultimoBackup: '2026-03-16', ultimoFTP: '2026-03-17', conexoes: 25, caixas: 8, certificadoVencimento: '2026-06-30', contadorId: contMaria.id } }),
    prisma.cliente.create({ data: { codigo: 'CLI003', nome: 'Atacado Distribuidor Norte', cnpj: '34.567.890/0001-12', cidade: 'Manaus', uf: 'AM', telefone: '(92) 3456-7890', email: 'admin@atacadonorte.com.br', segmento: 'Atacado', regime: 'Lucro Real', curvaABC: 'B', status: 'Ativo', planoId: planoPremium.id, mensalidade: 900, dataContrato: '2023-01-10', responsavel: 'Ana Rodrigues', versaoSistema: '5.7.9', ultimoBackup: '2026-03-14', ultimoFTP: '2026-03-15', conexoes: 8, caixas: 2, certificadoVencimento: '2026-05-20' } }),
    prisma.cliente.create({ data: { codigo: 'CLI004', nome: 'Posto Combustíveis Rota', cnpj: '45.678.901/0001-23', cidade: 'Belo Horizonte', uf: 'MG', telefone: '(31) 3456-7890', email: 'suporte@postorota.com.br', segmento: 'Posto', regime: 'Simples Nacional', curvaABC: 'B', status: 'Ativo', planoId: planoBasico.id, mensalidade: 600, dataContrato: '2023-05-22', responsavel: 'Carlos Silva', versaoSistema: '5.8.1', ultimoBackup: '2026-03-17', ultimoFTP: '2026-03-17', conexoes: 5, caixas: 2, certificadoVencimento: '2026-03-28' } }),
    prisma.cliente.create({ data: { codigo: 'CLI005', nome: 'Lojas Moda & Estilo', cnpj: '56.789.012/0001-34', cidade: 'Porto Alegre', uf: 'RS', telefone: '(51) 3456-7890', email: 'ti@modaestilo.com.br', segmento: 'Varejo', regime: 'Simples Nacional', curvaABC: 'C', status: 'Ativo', planoId: planoBasico.id, mensalidade: 450, dataContrato: '2024-02-14', responsavel: 'Pedro Alves', versaoSistema: '5.6.0', ultimoBackup: '2026-03-10', ultimoFTP: '2026-03-11', conexoes: 3, caixas: 1, certificadoVencimento: '2026-12-15' } }),
    prisma.cliente.create({ data: { codigo: 'CLI006', nome: 'Distribuidora Alimentos RS', cnpj: '67.890.123/0001-45', cidade: 'Caxias do Sul', uf: 'RS', telefone: '(54) 3456-7890', email: 'gerencia@alimentosrs.com.br', segmento: 'Atacado', regime: 'Lucro Presumido', curvaABC: 'A', status: 'Bloqueado', planoId: planoEnterprise.id, mensalidade: 1800, dataContrato: '2020-11-05', responsavel: 'Mariana Costa', versaoSistema: '5.8.0', ultimoBackup: '2026-03-17', ultimoFTP: '2026-03-17', conexoes: 18, caixas: 5, certificadoVencimento: '2026-08-10' } }),
    prisma.cliente.create({ data: { codigo: 'CLI007', nome: 'Serviços Técnicos Omega', cnpj: '78.901.234/0001-56', cidade: 'Curitiba', uf: 'PR', telefone: '(41) 3456-7890', email: 'omega@omega.com.br', segmento: 'Serviços', regime: 'MEI', curvaABC: 'C', status: 'Ativo', planoId: planoBasico.id, mensalidade: 350, dataContrato: '2024-06-01', responsavel: 'Roberto Melo', versaoSistema: '5.8.2', ultimoBackup: '2026-03-17', ultimoFTP: '2026-03-17', conexoes: 2, caixas: 1, certificadoVencimento: '2026-09-20' } }),
  ])
  console.log('✅ Clientes criados')

  // ============================================================
  // ATENDIMENTOS
  // ============================================================
  await prisma.atendimento.createMany({ data: [
    { clienteId: cli1.id, tecnicoId: carlos.id, departamento: 'Suporte', tipoContato: 'WhatsApp', status: 2, prioridade: 'Alta', bugSistema: false, foraHorario: false, observacoes: 'Cliente relata lentidão no sistema de caixa nos horários de pico.', dataAbertura: '2026-03-18T08:30:00', tempoAtendimento: 45 },
    { clienteId: cli2.id, tecnicoId: ana.id, departamento: 'Fiscal', tipoContato: 'Telefone', status: 3, prioridade: 'Urgente', bugSistema: true, foraHorario: false, observacoes: 'Erro na emissão de NF-e para medicamentos controlados. SPED incorreto.', solucao: 'Aguardando retorno do cliente com arquivo de log.', dataAbertura: '2026-03-18T09:00:00', tempoAtendimento: 30 },
    { clienteId: cli3.id, tecnicoId: pedro.id, departamento: 'Técnico', tipoContato: 'E-mail', status: 13, prioridade: 'Normal', bugSistema: true, foraHorario: false, observacoes: 'Módulo de integração com WMS apresentando timeout após 2 minutos.', dataAbertura: '2026-03-17T14:20:00', tempoAtendimento: 180 },
    { clienteId: cli4.id, tecnicoId: carlos.id, departamento: 'Suporte', tipoContato: 'WhatsApp', status: 7, prioridade: 'Normal', bugSistema: false, foraHorario: false, observacoes: 'Dúvida sobre configuração de bomba de abastecimento.', solucao: 'Configuração realizada via acesso remoto. Testado e funcionando.', dataAbertura: '2026-03-17T10:00:00', dataFechamento: '2026-03-17T11:30:00', tempoAtendimento: 90 },
    { clienteId: cli5.id, tecnicoId: mariana.id, departamento: 'Fiscal', tipoContato: 'WhatsApp', status: 1, prioridade: 'Baixa', bugSistema: false, foraHorario: false, observacoes: 'Dúvida sobre CFOP para vendas interestaduais.', dataAbertura: '2026-03-18T10:15:00', tempoAtendimento: 0 },
    { clienteId: cli6.id, tecnicoId: ana.id, departamento: 'CS', tipoContato: 'Presencial', status: 6, prioridade: 'Alta', bugSistema: false, foraHorario: false, observacoes: 'Treinamento de novos funcionários no módulo financeiro.', dataAbertura: '2026-03-18T07:00:00', tempoAtendimento: 120 },
    { clienteId: cli1.id, tecnicoId: pedro.id, departamento: 'Técnico', tipoContato: 'E-mail', status: 9, prioridade: 'Alta', bugSistema: true, foraHorario: true, observacoes: 'Relatório de fechamento de caixa com valores divergentes no sábado à noite.', dataAbertura: '2026-03-16T23:45:00', tempoAtendimento: 240 },
    { clienteId: cli7.id, tecnicoId: roberto.id, departamento: 'Comercial', tipoContato: 'Telefone', status: 0, prioridade: 'Urgente', bugSistema: false, foraHorario: false, observacoes: 'Renovação de contrato vencida. Cliente reclamando do bloqueio.', dataAbertura: '2026-03-15T09:00:00', tempoAtendimento: 60 },
    { clienteId: cli2.id, tecnicoId: carlos.id, departamento: 'Certificado', tipoContato: 'E-mail', status: 4, prioridade: 'Alta', bugSistema: false, foraHorario: false, observacoes: 'Renovação do certificado digital A3. Prazo em 10 dias.', dataAbertura: '2026-03-18T11:00:00', tempoAtendimento: 20 },
    { clienteId: cli4.id, tecnicoId: mariana.id, departamento: 'Financeiro', tipoContato: 'WhatsApp', status: 3, prioridade: 'Normal', bugSistema: false, foraHorario: false, observacoes: 'Segunda via de boleto para fevereiro. Cliente alega não ter recebido.', dataAbertura: '2026-03-18T08:00:00', tempoAtendimento: 15 },
  ]})
  console.log('✅ Atendimentos criados')

  // ============================================================
  // AGENDA
  // ============================================================
  await prisma.agendaItem.createMany({ data: [
    { clienteId: cli3.id, tecnicoId: ana.id, tipo: 'Instalação', status: 'Aguardando', data: '2026-03-18', horario: '14:00', observacoes: 'Instalação do sistema na filial de Manaus.' },
    { clienteId: cli5.id, tecnicoId: carlos.id, tipo: 'Treinamento', status: 'Aguardando', data: '2026-03-18', horario: '09:00', observacoes: 'Treinamento modulo PDV para funcionários novos.' },
    { clienteId: cli1.id, tecnicoId: pedro.id, tipo: 'Visita', status: 'Finalizado', data: '2026-03-17', horario: '10:00', observacoes: 'Visita técnica para avaliação de infraestrutura.' },
    { clienteId: cli6.id, tecnicoId: ana.id, tipo: 'Retorno', status: 'Aguardando', data: '2026-03-19', horario: '15:30', observacoes: 'Retorno CS após implantação.' },
    { clienteId: cli7.id, tecnicoId: roberto.id, tipo: 'Treinamento', status: 'Não Finalizado', data: '2026-03-16', horario: '14:00', observacoes: 'Treinamento módulo financeiro. Cliente não compareceu.' },
  ]})
  console.log('✅ Agenda criada')

  // ============================================================
  // ASSINATURAS
  // ============================================================
  await prisma.assinatura.createMany({ data: [
    { clienteId: cli1.id, planoId: planoPremium.id, formaPagamento: 'Boleto', valor: 1200, vencimento: 10, dataInicio: '2022-03-15', status: 'Ativa' },
    { clienteId: cli2.id, planoId: planoEnterprise.id, formaPagamento: 'PIX', valor: 2500, vencimento: 5, dataInicio: '2021-07-01', status: 'Ativa' },
    { clienteId: cli3.id, planoId: planoPremium.id, formaPagamento: 'Boleto', valor: 900, vencimento: 15, dataInicio: '2023-01-10', status: 'Ativa' },
    { clienteId: cli4.id, planoId: planoBasico.id, formaPagamento: 'Cartão de Crédito', valor: 600, vencimento: 20, dataInicio: '2023-05-22', status: 'Ativa' },
    { clienteId: cli5.id, planoId: planoBasico.id, formaPagamento: 'PIX', valor: 450, vencimento: 5, dataInicio: '2024-02-14', status: 'Ativa' },
    { clienteId: cli6.id, planoId: planoEnterprise.id, formaPagamento: 'Boleto', valor: 1800, vencimento: 1, dataInicio: '2020-11-05', status: 'Suspensa' },
  ]})
  console.log('✅ Assinaturas criadas')

  // ============================================================
  // PIPELINE
  // ============================================================
  await prisma.pipelineItem.createMany({ data: [
    { clienteId: cli3.id, etapa: 2, responsavelId: ana.id, dataEntrada: '2026-03-10' },
    { clienteId: cli5.id, etapa: 3, responsavelId: carlos.id, dataEntrada: '2026-03-05' },
    { clienteId: cli7.id, etapa: 13, responsavelId: ana.id, dataEntrada: '2026-03-15' },
    { clienteId: cli4.id, etapa: 6, responsavelId: carlos.id, dataEntrada: '2026-03-01' },
    { clienteId: cli2.id, etapa: 7, responsavelId: ana.id, dataEntrada: '2026-02-20' },
  ]})
  console.log('✅ Pipeline criado')

  // ============================================================
  // CRM - NEGÓCIOS
  // ============================================================
  await prisma.negocio.createMany({ data: [
    { nome: 'Rede de Farmácias Pague Menos', empresa: 'Pague Menos Ltda', responsavelId: roberto.id, valor: 15000, status: 'Negociação', dataCriacao: '2026-02-10', telefone: '(85) 9999-0000' },
    { nome: 'Supermercado Mega', empresa: 'Mega Comércio SA', responsavelId: roberto.id, valor: 8000, status: 'Proposta', dataCriacao: '2026-03-01', telefone: '(11) 8888-0000' },
    { nome: 'Posto de Gasolina Central', empresa: 'Central Combustíveis', responsavelId: roberto.id, valor: 3500, status: 'Qualificação', dataCriacao: '2026-03-10' },
    { nome: 'Atacadão do Norte', empresa: 'Distribuidora Norte SA', responsavelId: roberto.id, valor: 22000, status: 'Fechado Ganho', dataCriacao: '2026-01-15', dataFechamento: '2026-02-28' },
    { nome: 'Farmácia Drogaria City', empresa: 'City Farma Ltda', responsavelId: roberto.id, valor: 4500, status: 'Prospecção', dataCriacao: '2026-03-15' },
    { nome: 'Minimercado Bairro', empresa: 'Mini Comercio ME', responsavelId: roberto.id, valor: 1200, status: 'Fechado Perdido', dataCriacao: '2026-02-01', dataFechamento: '2026-03-01' },
  ]})

  await prisma.lead.createMany({ data: [
    { nome: 'João Santana', empresa: 'Mercearia São João', telefone: '(11) 99999-0001', email: 'joao@saojoa.com', cidade: 'São Paulo', uf: 'SP', segmento: 'Varejo', origem: 'Google Ads', responsavelId: roberto.id, dataCadastro: '2026-03-10' },
    { nome: 'Fernanda Lima', empresa: 'Farmácia Lima', telefone: '(41) 99999-0002', cidade: 'Curitiba', uf: 'PR', segmento: 'Farmácia', origem: 'Indicação', responsavelId: roberto.id, dataCadastro: '2026-03-12' },
    { nome: 'Ricardo Sousa', empresa: 'Posto Sousa', telefone: '(61) 99999-0003', cidade: 'Brasília', uf: 'DF', segmento: 'Posto', origem: 'WhatsApp', responsavelId: roberto.id, dataCadastro: '2026-03-14' },
  ]})
  console.log('✅ CRM (Negócios e Leads) criado')

  // ============================================================
  // FINANCEIRO
  // ============================================================
  await prisma.analiseFinanceira.createMany({ data: [
    { clienteId: cli1.id, mensalidade: 1200, custoSuporte: 320, custoDev: 150, custoFixo: 80, margemValor: 650, margemPercent: 54.2 },
    { clienteId: cli2.id, mensalidade: 2500, custoSuporte: 480, custoDev: 200, custoFixo: 120, margemValor: 1700, margemPercent: 68.0 },
    { clienteId: cli3.id, mensalidade: 900, custoSuporte: 280, custoDev: 350, custoFixo: 60, margemValor: 210, margemPercent: 23.3 },
    { clienteId: cli4.id, mensalidade: 600, custoSuporte: 120, custoDev: 80, custoFixo: 40, margemValor: 360, margemPercent: 60.0 },
    { clienteId: cli5.id, mensalidade: 450, custoSuporte: 200, custoDev: 120, custoFixo: 30, margemValor: 100, margemPercent: 22.2 },
    { clienteId: cli6.id, mensalidade: 1800, custoSuporte: 350, custoDev: 90, custoFixo: 90, margemValor: 1270, margemPercent: 70.6 },
    { clienteId: cli7.id, mensalidade: 350, custoSuporte: 180, custoDev: 60, custoFixo: 25, margemValor: 85, margemPercent: 24.3 },
  ]})

  await prisma.comissao.createMany({ data: [
    { vendedorId: roberto.id, clienteId: cli4.id, tipo: 'Venda', valor: 180, percentual: 5, dataVenda: '2023-05-22', status: 'Paga' },
    { vendedorId: roberto.id, clienteId: cli7.id, tipo: 'Venda', valor: 105, percentual: 5, dataVenda: '2024-06-01', status: 'Paga' },
    { vendedorId: roberto.id, clienteId: cli5.id, tipo: 'Venda', valor: 135, percentual: 5, dataVenda: '2024-02-14', status: 'Pendente' },
    { vendedorId: ana.id, clienteId: cli3.id, tipo: 'Upsell', valor: 200, percentual: 8, dataVenda: '2026-01-15', status: 'Aprovada' },
  ]})
  console.log('✅ Financeiro criado')

  // ============================================================
  // DESENVOLVIMENTO
  // ============================================================
  await prisma.tarefa.createMany({ data: [
    { descricao: 'Correção de erro no relatório de CMV', clienteId: cli1.id, prioridade: 'A', status: 'Em Desenvolvimento', percentualConclusao: 65, software: 'Command PDV', desenvolvedores: '["Pedro Alves"]', dataCriacao: '2026-03-10', isBug: true },
    { descricao: 'Integração com TEF Stone', prioridade: 'B', status: 'Em Teste', percentualConclusao: 90, software: 'Command PDV', segmento: 'Varejo', desenvolvedores: '["Pedro Alves"]', dataCriacao: '2026-02-15', isBug: false },
    { descricao: 'Módulo de rastreabilidade medicamentos', clienteId: cli2.id, prioridade: 'A', status: 'Pendente', percentualConclusao: 0, software: 'Command Farma', segmento: 'Farmácia', desenvolvedores: '["Pedro Alves"]', dataCriacao: '2026-03-01', isBug: false },
    { descricao: 'Ajuste no timeout da integração WMS', clienteId: cli3.id, prioridade: 'A', status: 'Em Desenvolvimento', percentualConclusao: 40, software: 'Command Atacado', segmento: 'Atacado', desenvolvedores: '["Pedro Alves"]', dataCriacao: '2026-03-17', isBug: true },
    { descricao: 'Nova tela de relatórios gerenciais', prioridade: 'C', status: 'Pendente', percentualConclusao: 0, software: 'Command PDV', desenvolvedores: '[]', dataCriacao: '2026-03-05', isBug: false },
    { descricao: 'App mobile v2.0 - redesign', prioridade: 'B', status: 'Em Desenvolvimento', percentualConclusao: 25, software: 'Command Mobile', desenvolvedores: '["Pedro Alves"]', dataCriacao: '2026-02-01', isBug: false },
  ]})
  console.log('✅ Tarefas criadas')

  // ============================================================
  // VÍDEOS
  // ============================================================
  await prisma.video.createMany({ data: [
    { titulo: 'Como configurar o PDV para venda fracionada', categoria: 'Treinamento', segmento: 'Varejo', colaborador: 'Ana Rodrigues', dataCadastro: '2026-02-10', url: 'https://youtube.com/watch?v=abc', visualizacoes: 145 },
    { titulo: 'Emissão de NF-e passo a passo', categoria: 'Fiscal', colaborador: 'Mariana Costa', dataCadastro: '2026-01-20', url: 'https://youtube.com/watch?v=def', visualizacoes: 289 },
    { titulo: 'Configuração de certificado digital A3', categoria: 'Certificado', colaborador: 'Carlos Silva', dataCadastro: '2025-12-15', url: 'https://youtube.com/watch?v=ghi', visualizacoes: 512 },
    { titulo: 'Módulo de rastreabilidade para farmácias', categoria: 'Treinamento', segmento: 'Farmácia', colaborador: 'Ana Rodrigues', dataCadastro: '2026-03-01', url: 'https://youtube.com/watch?v=jkl', visualizacoes: 67 },
    { titulo: 'Integração com balanças e periféricos', categoria: 'Técnico', colaborador: 'Pedro Alves', dataCadastro: '2026-02-28', url: 'https://youtube.com/watch?v=mno', visualizacoes: 203 },
  ]})
  console.log('✅ Vídeos criados')

  // ============================================================
  // METAS / NPS
  // ============================================================
  await prisma.meta.createMany({ data: [
    { descricao: 'Atendimentos no mês', responsavel: 'Carlos Silva', departamento: 'Suporte', metaValor: 200, realizado: 156, unidade: 'atendimentos', periodo: 'Março/2026', status: 'Em andamento' },
    { descricao: 'NPS médio Suporte', responsavel: 'Equipe Suporte', departamento: 'Suporte', metaValor: 75, realizado: 71, unidade: 'pontos', periodo: 'Março/2026', status: 'Em andamento' },
    { descricao: 'Novos contratos', responsavel: 'Roberto Melo', departamento: 'Comercial', metaValor: 10, realizado: 4, unidade: 'contratos', periodo: 'Março/2026', status: 'Em andamento' },
    { descricao: 'Churn Rate', responsavel: 'Ana Rodrigues', departamento: 'CS', metaValor: 2, realizado: 1, unidade: '%', periodo: 'Março/2026', status: 'Concluída' },
    { descricao: 'Implantações concluídas', responsavel: 'Ana Rodrigues', departamento: 'Instalação', metaValor: 8, realizado: 3, unidade: 'implantações', periodo: 'Março/2026', status: 'Em andamento' },
  ]})

  await prisma.avaliacaoNPS.createMany({ data: [
    { clienteId: cli1.id, nota: 9, comentario: 'Atendimento rápido e eficiente.', departamento: 'Suporte', data: '2026-03-15', categoria: 'Promotor' },
    { clienteId: cli2.id, nota: 8, comentario: 'Bom suporte, poderia ser mais rápido.', departamento: 'Suporte', data: '2026-03-14', categoria: 'Neutro' },
    { clienteId: cli4.id, nota: 10, comentario: 'Excelente! Resolveram tudo remotamente.', departamento: 'Técnico', data: '2026-03-17', categoria: 'Promotor' },
    { clienteId: cli6.id, nota: 5, comentario: 'Demora para atender. Esperamos muito.', departamento: 'Suporte', data: '2026-03-12', categoria: 'Detrator' },
    { clienteId: cli7.id, nota: 7, comentario: 'Ok, mas o sistema ainda trava às vezes.', departamento: 'Técnico', data: '2026-03-10', categoria: 'Neutro' },
  ]})
  console.log('✅ Metas e NPS criados')

  // ============================================================
  // MONITOR ATENDIMENTOS
  // ============================================================
  await prisma.monitorAtendimento.createMany({ data: [
    { clienteNome: 'Supermercado Bom Preço', numero: '(11) 99999-0001', atendente: 'Carlos Silva', departamento: 'Suporte', status: 'Em Atendimento', inicioAtendimento: '2026-03-18T08:30:00', tempoEspera: 45, mensagens: 12 },
    { clienteNome: 'Farmácia Saúde Total', numero: '(19) 98888-0002', atendente: 'Ana Rodrigues', departamento: 'Fiscal', status: 'Aguardando', inicioAtendimento: '2026-03-18T09:15:00', tempoEspera: 22, mensagens: 5 },
    { clienteNome: 'Posto Combustíveis Rota', numero: '(31) 97777-0003', atendente: 'Mariana Costa', departamento: 'Financeiro', status: 'Em Atendimento', inicioAtendimento: '2026-03-18T08:00:00', tempoEspera: 68, mensagens: 20 },
    { clienteNome: 'Lojas Moda & Estilo', numero: '(51) 96666-0004', atendente: '', departamento: 'Suporte', status: 'Aguardando', inicioAtendimento: '2026-03-18T10:00:00', tempoEspera: 8, mensagens: 2 },
    { clienteNome: 'Atacado Distribuidor Norte', numero: '(92) 95555-0005', atendente: 'Pedro Alves', departamento: 'Técnico', status: 'Em Atendimento', inicioAtendimento: '2026-03-18T07:45:00', tempoEspera: 95, mensagens: 31 },
  ]})
  console.log('✅ Monitor de Atendimentos criado')

  // ============================================================
  // CAMPANHAS
  // ============================================================
  await prisma.campanha.createMany({ data: [
    { titulo: 'Renovação Anual com 15% OFF', descricao: 'Campanha de renovação antecipada com desconto especial para clientes Premium.', dataInicio: '2026-03-01', dataFim: '2026-03-31', ativa: true, visualizacoes: 234, tipo: 'Banner', segmento: 'Varejo' },
    { titulo: 'Novo Módulo Farmácia - Rastreabilidade', descricao: 'Apresentação do novo módulo de rastreabilidade de medicamentos controlados.', dataInicio: '2026-02-15', dataFim: '2026-04-15', ativa: true, visualizacoes: 89, tipo: 'E-mail', segmento: 'Farmácia' },
    { titulo: 'Treinamento Gratuito Q1 2026', descricao: 'Série de treinamentos online gratuitos para clientes ativos.', dataInicio: '2026-01-01', dataFim: '2026-01-31', ativa: false, visualizacoes: 512, tipo: 'WhatsApp' },
  ]})
  console.log('✅ Campanhas criadas')

  // ============================================================
  // VERSÕES
  // ============================================================
  await prisma.versao.createMany({ data: [
    { software: 'Command PDV', versao: '5.8.2', dataLancamento: '2026-03-01', obrigatoria: true, beta: false, notas: 'Correções críticas no módulo fiscal. Atualização obrigatória para emissão de NFC-e.', segmentos: '["Varejo","Atacado","Posto"]' },
    { software: 'Command Farma', versao: '3.2.1', dataLancamento: '2026-02-20', obrigatoria: false, beta: false, notas: 'Melhorias no módulo de rastreabilidade e performance geral.', segmentos: '["Farmácia"]' },
    { software: 'Command Mobile', versao: '2.0.0-beta', dataLancamento: '2026-03-15', obrigatoria: false, beta: true, notas: 'Versão beta do novo aplicativo mobile com redesign completo.', segmentos: '["Varejo","Farmácia"]' },
    { software: 'Command PDV', versao: '5.9.0-beta', dataLancamento: '2026-03-18', obrigatoria: false, beta: true, notas: 'Nova versão beta com integração PIX automático e novo dashboard gerencial.', segmentos: '["Varejo","Atacado","Posto","Farmácia"]' },
  ]})
  console.log('✅ Versões criadas')

  // ============================================================
  // SERVIDORES
  // ============================================================
  await prisma.servidor.createMany({ data: [
    { nome: 'srv-prod-01', ip: '192.168.1.10', provedor: 'AWS', localizacao: 'sa-east-1 (São Paulo)', cpuPercent: 45, ramPercent: 62, discoUsado: 280, discoTotal: 500, online: true, latencia: 12, historicoUso: '[40,42,38,45,50,47,45]', ultimaVerificacao: '2026-03-18T11:00:00' },
    { nome: 'srv-prod-02', ip: '192.168.1.11', provedor: 'AWS', localizacao: 'sa-east-1 (São Paulo)', cpuPercent: 78, ramPercent: 84, discoUsado: 420, discoTotal: 500, online: true, latencia: 15, historicoUso: '[70,75,80,78,82,79,78]', ultimaVerificacao: '2026-03-18T11:00:00' },
    { nome: 'srv-db-01', ip: '192.168.1.20', provedor: 'DigitalOcean', localizacao: 'NYC-3 (Nova York)', cpuPercent: 22, ramPercent: 71, discoUsado: 150, discoTotal: 1000, online: true, latencia: 180, historicoUso: '[20,18,25,22,19,23,22]', ultimaVerificacao: '2026-03-18T11:00:00' },
    { nome: 'srv-backup-01', ip: '192.168.1.30', provedor: 'Azure', localizacao: 'Brazil South', cpuPercent: 5, ramPercent: 32, discoUsado: 2100, discoTotal: 4000, online: false, latencia: 0, historicoUso: '[5,4,6,5,0,0,0]', ultimaVerificacao: '2026-03-18T09:00:00' },
  ]})
  console.log('✅ Servidores criados')

  console.log('\n🎉 Seed concluído com sucesso!')
  console.log('📧 Login: carlos@command.com.br | Senha: 123456')
}

main()
  .catch(e => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
