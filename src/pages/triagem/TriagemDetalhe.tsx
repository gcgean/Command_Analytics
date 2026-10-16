import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Link2, ListChecks, Loader2,
  Target, Trash2, ExternalLink, Save, Pencil, Building2,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { CampoTriagem, agruparPerguntas } from './CampoTriagem'
import type {
  AnexoTriagem, AtendimentoTriagemDetalhe, CenarioTriagem, ChecklistTriagem, PerguntaTriagem,
} from '../../types'

export function TriagemDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { toast } = useToast()

  const [dados, setDados] = useState<AtendimentoTriagemDetalhe | null>(null)
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  const [perguntas, setPerguntas] = useState<PerguntaTriagem[]>([])
  const [cenario, setCenario] = useState<CenarioTriagem | null>(null)
  const [checklist, setChecklist] = useState<ChecklistTriagem | null>(null)
  const [pendentes, setPendentes] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const [marcados, setMarcados] = useState<Record<number, boolean>>({})
  const [sujo, setSujo] = useState(false)
  const [editarCadastro, setEditarCadastro] = useState(false)
  const [anexos, setAnexos] = useState<AnexoTriagem[]>([])
  // A rota do arquivo é autenticada, então a miniatura vem por blob, não por src direto.
  const [miniaturas, setMiniaturas] = useState<Record<number, string>>({})
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      const d = await api.getAtendimentoTriagem(Number(id))
      setDados(d)
      setRespostas(d.respostas ?? {})
      setPerguntas(d.perguntas ?? [])
      setCenario(d.cenarioAtual ?? null)
      setChecklist(d.checklist ?? null)
      setPendentes(d.pendencias ?? [])
      setAnexos(d.anexos ?? [])
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir a triagem.')
      navegar('/triagem')
    } finally {
      setCarregando(false)
    }
  }, [id, toast, navegar])

  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    let vivo = true
    const criadas: string[] = []
    void (async () => {
      for (const a of anexos) {
        if (!a.mimeType.startsWith('image/') || miniaturas[a.id]) continue
        const blob = await api.getAnexoTriagemBlob(a.id).catch(() => null)
        if (!blob || !vivo) continue
        const url = URL.createObjectURL(blob)
        criadas.push(url)
        setMiniaturas((m) => ({ ...m, [a.id]: url }))
      }
    })()
    return () => { vivo = false; criadas.forEach((u) => URL.revokeObjectURL(u)) }
    // miniaturas fora das dependências de propósito: ele se realimentaria a cada blob novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexos])

  const anexosDe = (chave: string) => anexos
    .filter((a) => a.chave === chave)
    .map((a) => ({ ...a, url: miniaturas[a.id] }))

  async function enviarAnexo(chave: string, lista: FileList) {
    if (!id) return
    try {
      const r = await api.enviarAnexoTriagem(Number(id), chave, Array.from(lista))
      setAnexos(r.anexos)
      setRespostas(r.respostas)
      if (r.recusados?.length) toast.error(r.recusados.join(' · '))
      await salvar(r.respostas)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar o arquivo.')
    }
  }

  async function removerAnexo(anexoId: number) {
    await api.removerAnexoTriagem(anexoId).catch(() => {})
    await carregar()
  }

  const salvar = useCallback(async (novas: Record<string, any>) => {
    if (!id) return
    setSalvando(true)
    try {
      const r = await api.salvarRespostasTriagem(Number(id), novas)
      setRespostas(r.respostas)
      setPerguntas(r.perguntas)
      setCenario(r.cenarioAtual)
      setChecklist(r.checklist)
      setPendentes(r.pendencias)
      setSujo(false)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }, [id, toast])

  // O cenário muda conforme as respostas, então salvar logo depois de cada mudança é o que
  // mantém o roteiro da tela coerente com o que o atendente acabou de ouvir.
  function responder(chave: string, valor: any) {
    const novas = { ...respostas, [chave]: valor }
    setRespostas(novas)
    setSujo(true)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { void salvar(novas) }, 700)
  }

  const concluido = dados?.situacao === 'concluido'
  const faltando = useMemo(() => new Set(pendentes), [pendentes])

  // O que veio do cadastro não vira formulário: aparece como resumo, e só vira campo se o
  // atendente mandar corrigir. Redigitar CNPJ e razão social de um cliente que já é nosso
  // é trabalho sem ganho — e sujeito a erro.
  const doCadastro = useMemo(
    () => perguntas.filter((p) => p.origem && String(respostas[p.chave] ?? '').trim() !== ''),
    [perguntas, respostas])
  const chavesCadastro = useMemo(() => new Set(doCadastro.map((p) => p.chave)), [doCadastro])
  const grupos = useMemo(
    () => agruparPerguntas(editarCadastro ? perguntas : perguntas.filter((p) => !chavesCadastro.has(p.chave))),
    [perguntas, chavesCadastro, editarCadastro])

  async function concluir() {
    if (!id) return
    setConcluindo(true)
    try {
      if (sujo) await salvar(respostas)
      const r = await api.concluirTriagem(Number(id))
      toast.success(`Processo #${r.processoId} aberto no Pipeline.`)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível concluir.')
    } finally {
      setConcluindo(false)
    }
  }

  const linkCliente = dados?.token ? `${window.location.origin}/triagem-cliente/${dados.token}` : null

  async function gerarLink() {
    if (!id) return
    try {
      const r = await api.gerarLinkTriagem(Number(id))
      const url = `${window.location.origin}/triagem-cliente/${r.token}`
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success('Link gerado e copiado. Vale por 7 dias.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar o link.')
    }
  }

  async function revogarLink() {
    if (!id) return
    await api.revogarLinkTriagem(Number(id)).catch(() => {})
    toast.info('Link cancelado.')
    await carregar()
  }

  if (carregando || !dados) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
  }

  const alta = cenario?.prioridade === 'alta'

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button onClick={() => navegar('/triagem')}
            className="mt-1 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {dados.clienteNome || 'Cliente sem nome'}
            </h1>
            <p className="text-sm text-slate-500">
              {dados.modelo}
              {dados.contato ? ` · ${dados.contato}` : ''}
              {dados.telefone ? ` · ${dados.telefone}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {salvando && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> salvando
            </span>
          )}
          {!concluido && sujo && !salvando && (
            <Button variant="secondary" onClick={() => void salvar(respostas)}>
              <Save className="w-4 h-4" /> Salvar
            </Button>
          )}
          {dados.processoId && (
            <a href={`/implantacao/pipeline?processo=${dados.processoId}`}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              Processo #{dados.processoId} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {concluido && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-4 flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900 dark:text-emerald-200">
            <p className="font-medium">Triagem concluída — processo aberto no Pipeline.</p>
            <p className="text-emerald-700 dark:text-emerald-300 mt-0.5">
              Concluir a triagem não significa integração instalada. A instalação só é dada como
              pronta depois do checklist de testes aprovado dentro do processo.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Questionário */}
        <div className="lg:col-span-2 space-y-4">
          {doCadastro.length > 0 && !editarCadastro && (
            <Card>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Dados do cadastro
                  </h2>
                </div>
                {!concluido && (
                  <button onClick={() => setEditarCadastro(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Corrigir
                  </button>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {doCadastro.map((p) => (
                  <div key={p.chave}>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{p.texto}</dt>
                    <dd className="text-sm text-slate-800 dark:text-slate-200">
                      {String(respostas[p.chave])}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {editarCadastro && (
            <p className="text-xs text-slate-500">
              Corrigindo os dados do cadastro.{' '}
              <button onClick={() => setEditarCadastro(false)}
                className="text-blue-600 dark:text-blue-400 hover:underline">
                Voltar ao resumo
              </button>
            </p>
          )}
          {grupos.map(([grupo, lista]) => (
            <Card key={grupo}>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">{grupo}</h2>
              <div className="space-y-4">
                {lista.map((p) => (
                  <CampoTriagem key={p.chave} pergunta={p} valor={respostas[p.chave]}
                    pendente={faltando.has(p.chave)}
                    anexos={anexosDe(p.chave)}
                    onEnviar={concluido ? undefined : (l) => enviarAnexo(p.chave, l)}
                    onRemover={concluido ? undefined : removerAnexo}
                    onChange={(v) => { if (!concluido) responder(p.chave, v) }} />
                ))}
              </div>
            </Card>
          ))}
          {grupos.length === 0 && (
            <Card><p className="text-sm text-slate-500">Este modelo não tem perguntas cadastradas.</p></Card>
          )}
        </div>

        {/* Painel do cenário */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Target className={clsx('w-4 h-4', alta ? 'text-red-500' : 'text-indigo-500')} />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Cenário identificado</h2>
            </div>
            {cenario ? (
              <>
                <p className={clsx('font-medium text-sm',
                  alta ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>
                  {cenario.nome}
                </p>
                {cenario.descricao && <p className="text-xs text-slate-500 mt-1">{cenario.descricao}</p>}
                {cenario.alerta && (
                  <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 dark:text-amber-200">{cenario.alerta}</p>
                  </div>
                )}
                {cenario.passos.length > 0 && (
                  <ol className="mt-3 space-y-1.5">
                    {cenario.passos.map((p, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] flex items-center justify-center">
                          {i + 1}
                        </span>
                        {p}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Continue respondendo: o cenário aparece aqui assim que as respostas o definirem.
              </p>
            )}
          </Card>

          {checklist && (
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <ListChecks className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{checklist.nome}</h2>
              </div>
              {checklist.descricao && <p className="text-xs text-slate-500 mb-2">{checklist.descricao}</p>}
              <ul className="space-y-1.5">
                {checklist.itens.map((item, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setMarcados((m) => ({ ...m, [i]: !m[i] }))}
                      className="flex items-start gap-2 text-left w-full">
                      <span className={clsx('shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center',
                        marcados[i] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600')}>
                        {marcados[i] && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className={clsx('text-xs', marcados[i]
                        ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>
                        {item}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-400 mt-2">
                Conferência de apoio na triagem. O checklist que vale é o do processo no Pipeline.
              </p>
            </Card>
          )}

          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Cliente responde</h2>
            </div>
            {linkCliente ? (
              <>
                <p className="text-xs text-slate-500 mb-2 break-all">{linkCliente}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm"
                    onClick={() => { void navigator.clipboard.writeText(linkCliente); toast.success('Link copiado.') }}>
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={revogarLink}>
                    <Trash2 className="w-3.5 h-3.5" /> Cancelar
                  </Button>
                </div>
                {dados.tokenExpira && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    Válido até {new Date(dados.tokenExpira).toLocaleDateString('pt-BR')}.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Gere um link para o próprio cliente preencher. Ele vê apenas as perguntas
                  liberadas — nada de campo interno.
                </p>
                <Button variant="secondary" size="sm" onClick={gerarLink} disabled={concluido}>
                  <Link2 className="w-3.5 h-3.5" /> Gerar link
                </Button>
              </>
            )}
            {dados.respondidoPor === 'cliente' && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2">
                Últimas respostas preenchidas pelo cliente.
              </p>
            )}
          </Card>

          {!concluido && (
            <Card>
              {pendentes.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  {pendentes.length} resposta(s) obrigatória(s) em aberto.
                </p>
              )}
              {!dados.clienteId && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  Sem cliente do cadastro vinculado — o processo não pode ser aberto.
                </p>
              )}
              <Button className="w-full" onClick={concluir}
                disabled={concluindo || !cenario || pendentes.length > 0 || !dados.clienteId}>
                {concluindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Concluir e abrir processo
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
