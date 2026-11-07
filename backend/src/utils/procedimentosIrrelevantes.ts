import { Prisma } from '@prisma/client'

/**
 * Procedimentos que não representam atendimento e por isso ficam fora de toda contagem.
 *
 * Nenhum deles é trabalho prestado: encerramento automático por inatividade, agradecimento,
 * registro duplicado do mesmo chamado, mensagem do robô e marcação de agenda. Contá-los
 * infla o volume de quem atende muito pouco e distorce a média do ranking — e, no caso do
 * encerramento por inatividade, o número é manipulável: basta fechar em massa.
 *
 * O nome é a chave, não o código: o mesmo procedimento aparece cadastrado várias vezes
 * (FALTA DE INTERACAO tem cinco códigos diferentes). Fixar ids deixaria de fora qualquer
 * duplicata criada depois.
 */
export const PROCEDIMENTOS_FORA_DA_CONTAGEM = [
  'FALTA DE INTERACAO DO USUARIO - CHAMADO FINALIZADO',
  'AGRADECIMENTO DE CLIENTE',
  'DOIS CONTATOS - MESMO CHAMADO',
  'MENSAGEM AUTOMATICA DO CLIENTE',
  'AGENDAMENTO DE ATENDIMENTO COM O CLIENTE',
]

/**
 * Trecho SQL que exclui esses atendimentos. `alias` é como a tabela `atendimentos` foi
 * nomeada na consulta.
 *
 * A comparação dispensa normalizar acento e caixa porque a coluna é `latin1_swedish_ci`,
 * que já ignora os dois — é assim que "Mensagem automática do cliente", a única gravada em
 * minúsculas e com acento, casa com a constante aqui.
 */
export function sqlSemProcedimentoIrrelevante(alias = 'a'): string {
  const nomes = PROCEDIMENTOS_FORA_DA_CONTAGEM
    .map((d) => `pr.descricao LIKE '%${d}%'`)
    .join(' OR ')
  return `NOT EXISTS (
    SELECT 1 FROM procedimentos_atendimentos pa
     INNER JOIN procedimentos pr ON pr.cod_procedimento = pa.cod_procedimento
     WHERE pa.cod_atendimento = ${alias}.id_Atend AND (${nomes})
  )`
}

/** A mesma condição para as consultas que usam template tag em vez de SQL em texto. */
export const semProcedimentoIrrelevante = (alias = 'a') =>
  Prisma.raw(sqlSemProcedimentoIrrelevante(alias))
