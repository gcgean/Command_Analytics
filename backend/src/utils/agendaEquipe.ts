import { prisma } from '../database/client'

/**
 * Agendamento com mais de um técnico.
 *
 * A tabela `agenda` é do Delphi e tem um técnico por linha (`cod_colaborador`). Em vez de
 * mexer no contrato com ele, um agendamento de equipe vira N linhas — uma por técnico, cada
 * um vendo na própria agenda — e esta tabela guarda o laço entre elas.
 *
 * Sem esse laço as cópias ficariam órfãs: quem editasse uma não saberia das outras, que é
 * exatamente o trabalho dobrado que a equipe quer evitar.
 */
export async function initAgendaEquipe(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS agenda_equipe (
      agenda_id INT NOT NULL PRIMARY KEY,
      grupo     CHAR(36) NOT NULL,
      -- A linha do técnico que foi escolhido primeiro: é a que leva os anexos.
      principal TINYINT(1) NOT NULL DEFAULT 0,
      criado_em DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_agenda_equipe_grupo (grupo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export interface MembroEquipe {
  agendaId: number
  tecnicoId: number | null
  tecnicoNome: string | null
  principal: boolean
}

/**
 * Para cada agendamento informado, quem mais está no mesmo grupo. Volta vazio para os
 * agendamentos de um técnico só — a tela não precisa tratar caso especial.
 */
export async function equipesDe(agendaIds: number[]): Promise<Map<number, MembroEquipe[]>> {
  const mapa = new Map<number, MembroEquipe[]>()
  const ids = agendaIds.filter((x) => Number.isFinite(x) && x > 0)
  if (ids.length === 0) return mapa

  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT e.grupo, e.agenda_id, e.principal, a.cod_colaborador AS tecnico_id,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnico_nome
       FROM agenda_equipe e
       INNER JOIN agenda_equipe meu ON meu.grupo = e.grupo
       LEFT JOIN agenda a ON a.cod_agenda = e.agenda_id
       LEFT JOIN usuario u ON u.COD_USU = a.cod_colaborador
      WHERE meu.agenda_id IN (${ids.map(() => '?').join(',')})
      ORDER BY e.principal DESC, e.agenda_id`, ...ids).catch(() => [])

  // Um grupo pode atender vários ids pedidos: monta por grupo e distribui.
  const porGrupo = new Map<string, MembroEquipe[]>()
  for (const l of linhas) {
    const g = String(l.grupo)
    if (!porGrupo.has(g)) porGrupo.set(g, [])
    const lista = porGrupo.get(g) as MembroEquipe[]
    if (lista.some((m) => m.agendaId === Number(l.agenda_id))) continue
    lista.push({
      agendaId: Number(l.agenda_id),
      tecnicoId: l.tecnico_id == null ? null : Number(l.tecnico_id),
      tecnicoNome: l.tecnico_nome ?? null,
      principal: Number(l.principal) === 1,
    })
  }

  const grupoDoId = new Map<number, string>()
  for (const [g, membros] of porGrupo) for (const m of membros) grupoDoId.set(m.agendaId, g)
  for (const id of ids) {
    const g = grupoDoId.get(id)
    if (g) mapa.set(id, porGrupo.get(g) ?? [])
  }
  return mapa
}
