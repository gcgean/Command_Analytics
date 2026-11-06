import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, Plus, ShieldOff, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { ChaveApi } from '../../types'

/**
 * Chaves de API das aplicações externas.
 *
 * O token aparece uma vez só, no momento em que é criado: o sistema guarda apenas um resumo
 * criptográfico dele. Por isso a tela trata a exibição como um momento à parte, com aviso —
 * quem fechar sem copiar precisa gerar outra chave.
 */

const dataHora = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function ChavesApi() {
  const { can } = usePermissions()
  const { toast } = useToast()
  const podeVer = can('chaves-api') || can('grupos-acesso')

  const [chaves, setChaves] = useState<ChaveApi[]>([])
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [tokenNovo, setTokenNovo] = useState<{ nome: string; token: string } | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      setChaves(await api.getChavesApi())
    } catch {
      setChaves([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { if (podeVer) void carregar() }, [podeVer])

  async function criar() {
    const limpo = nome.trim()
    if (!limpo) {
      toast.error('Dê um nome à chave — é por ele que se sabe o que revogar depois.')
      return
    }
    setCriando(true)
    try {
      const r = await api.criarChaveApi(limpo)
      setTokenNovo({ nome: limpo, token: r.token })
      setNome('')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível criar a chave.')
    } finally {
      setCriando(false)
    }
  }

  async function revogar(c: ChaveApi) {
    if (!confirm(
      `Revogar a chave "${c.nome}"?\n\nA aplicação que usa esse token para de agendar na hora.`
    )) return
    try {
      await api.revogarChaveApi(c.id)
      toast.success('Chave revogada.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível revogar.')
    }
  }

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Token copiado.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie à mão.')
    }
  }

  if (!podeVer) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Você não tem acesso às chaves de API.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800 dark:bg-slate-700 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Chaves de API</h1>
          <p className="text-sm text-slate-500">
            Credenciais das aplicações externas que agendam pelo sistema.
          </p>
        </div>
      </div>

      {/* O token só existe aqui. Fica num bloco próprio para não se perder entre as linhas. */}
      {tokenNovo && (
        <Card className="border-amber-300 dark:border-amber-600/60 bg-amber-50 dark:bg-amber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Copie agora o token de “{tokenNovo.nome}”
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                Ele não aparece de novo. O sistema guarda só um resumo criptográfico — quem
                perder o token gera outra chave.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs text-slate-800 dark:text-slate-100 break-all">
                  {tokenNovo.token}
                </code>
                <Button variant="secondary" onClick={() => copiar(tokenNovo.token)}>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </Button>
                <Button variant="secondary" onClick={() => setTokenNovo(null)}>Já copiei</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Nova chave</h3>
        <p className="text-xs text-slate-500 mb-3">
          Uma chave por aplicação. Assim dá para cortar o acesso de uma sem derrubar as outras.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input-field flex-1 min-w-[16rem]"
            placeholder="Nome da aplicação (ex.: Site de agendamento)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void criar() }}
          />
          <Button onClick={criar} disabled={criando}>
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Gerar chave
          </Button>
        </div>
      </Card>

      <Card padding="none">
        {carregando ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          </div>
        ) : chaves.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            Nenhuma chave criada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Aplicação', 'Situação', 'Criada em', 'Último uso', 'Chamadas', ''].map((h) => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chaves.map((c) => (
                  <tr key={c.id} className={clsx('table-row', !c.ativo && 'opacity-60')}>
                    <td className="table-cell font-medium text-slate-900 dark:text-slate-100">{c.nome}</td>
                    <td className="table-cell">
                      <span className={clsx('badge', c.ativo
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-500/20 text-slate-500')}>
                        {c.ativo ? 'Ativa' : 'Revogada'}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500">{dataHora(c.criadoEm)}</td>
                    <td className="table-cell text-slate-500">{dataHora(c.ultimoUsoEm)}</td>
                    <td className="table-cell text-slate-500">{c.chamadas}</td>
                    <td className="table-cell text-right">
                      {c.ativo && (
                        <button onClick={() => revogar(c)} title="Revogar chave"
                          className="text-slate-400 hover:text-red-500 inline-flex items-center gap-1 text-xs">
                          <ShieldOff className="w-3.5 h-3.5" /> Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
          Como a aplicação externa usa
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          O token vai no cabeçalho <code className="text-slate-700 dark:text-slate-300">X-API-Key</code> de
          toda chamada. O caminho é sempre o mesmo: pedir os procedimentos, pedir os horários
          livres e mandar agendar.
        </p>
        <div className="rounded-xl bg-slate-900 text-slate-100 p-3 overflow-x-auto">
          <pre className="text-[11px] leading-relaxed">{`GET  /api/integracao/agenda/procedimentos
GET  /api/integracao/agenda/tecnicos?procedimentoId=22
GET  /api/integracao/agenda/horarios?procedimentoId=22&dataInicio=2026-11-09&dataFim=2026-11-13
POST /api/integracao/agenda/agendamentos
     { "tecnicoId": 49, "procedimentoId": 22, "data": "2026-11-09",
       "horaInicio": "14:00", "documento": "00000000000191",
       "descricao": "Treinamento de PDV" }
GET  /api/integracao/agenda/agendamentos/:id
DEL  /api/integracao/agenda/agendamentos/:id`}</pre>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          O horário é conferido de novo na hora de gravar: se alguém ocupar a vaga entre a
          consulta e o envio, a resposta é <strong>409</strong> e nada é agendado. Limite de 120
          chamadas por minuto por chave.
        </p>
      </Card>
    </div>
  )
}
