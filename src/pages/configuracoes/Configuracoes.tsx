import { useState, useEffect } from 'react'
import { Save, Loader2, Plus, X, CheckCircle, Wifi, Send, Sparkles } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import clsx from 'clsx'
import type { StatusProcessamentoNotificacaoAgendamento } from '../../types'

type Aba = 'geral' | 'whatsapp' | 'email' | 'telegram' | 'assistente' | 'notificacoes' | 'parametros' | 'precificacao'

interface TokenWhats {
  id: number
  descricao: string
  token: string
  ativo: boolean
}

const mockTokens: TokenWhats[] = [
  { id: 1, descricao: 'Suporte Principal', token: 'whatsapp_tok_abc123...', ativo: true },
  { id: 2, descricao: 'Comercial', token: 'whatsapp_tok_xyz789...', ativo: false },
]

export function Configuracoes() {
  const { toast } = useToast()
  const [aba, setAba] = useState<Aba>('geral')
  const [loading, setLoading] = useState(false)

  // Geral
  const [geral, setGeral] = useState({
    custoHoraSuporte: '45',
    custoHoraDev: '80',
    custoFixoMensal: '5000',
    custoKm: '0.80',
    velocidadeKmh: '60',
    margemHoraSuporte: '30',
  })

  // WhatsApp
  const [tokenApi, setTokenApi] = useState('Bearer eyJhbGciOiJI...')
  const [tokenNotif, setTokenNotif] = useState('notif_sk_live_...')
  const [tokens, setTokens] = useState<TokenWhats[]>(mockTokens)

  // Email (SMTP real, gravado no banco — a senha nunca volta do servidor)
  const [email, setEmail] = useState({
    ativo: false, host: '', porta: 587, seguro: false, usuario: '',
    remetenteNome: '', remetenteEmail: '', temSenha: false,
  })
  const [novaSenhaEmail, setNovaSenhaEmail] = useState('')
  const [emailTeste, setEmailTeste] = useState('')

  // Precificação: custos padrão que a tela de Precificação de Implantação usa como ponto de partida.
  const [precificacao, setPrecificacao] = useState({
    custoKm: 1.5, custoHoraTecnica: 80, custoHoraMigracao: 80, custoHoraSuporte: 60,
    custoHospedagem: 150, custoAlimentacao: 45, refeicoesDia: 2, horasTreinamento: 8,
    horasSuporteMes: 2, custoInfraMes: 0, custoLicencasMes: 0,
    margemAlvo: 30, impostosPerc: 6, comissaoPerc: 5, migracaoRepassePerc: 30,
  })
  const [salvandoPrecificacao, setSalvandoPrecificacao] = useState(false)
  const [salvandoEmail, setSalvandoEmail] = useState(false)
  const [testandoEmail, setTestandoEmail] = useState(false)

  // Parâmetros
  const [params, setParams] = useState({
    chavePix: 'financeiro@cilos.com.br',
    percReajuste: '10',
    percMaxDesconto: '20',
    diasCarencia: '5',
  })

  // Telegram
  const [telegram, setTelegram] = useState({
    ativo: true,
    nomeBot: '',
    userIdPadrao: '',
    tokenApi: '',
  })
  const [msgTeste, setMsgTeste] = useState('')
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [notificacoesAgendamento, setNotificacoesAgendamento] = useState({
    ativoPlataforma: true,
    ativoTelegram: true,
    horarioResumoDia: '08:00',
    antecedenciaMin: 30,
  })
  const [statusNotificacoes, setStatusNotificacoes] = useState<StatusProcessamentoNotificacaoAgendamento | null>(null)
  const [processandoNotificacoesAgora, setProcessandoNotificacoesAgora] = useState(false)

  // Assistente IA
  const [assistente, setAssistente] = useState({ ativo: true, modelo: 'deepseek-chat', temApiKey: false, modelosDisponiveis: ['deepseek-chat', 'deepseek-reasoner'] })
  const [novaApiKeyIA, setNovaApiKeyIA] = useState('')
  const [salvandoAssistente, setSalvandoAssistente] = useState(false)

  useEffect(() => {
    if (aba === 'telegram') {
      carregarConfigTelegram()
    }
    if (aba === 'assistente') {
      carregarConfigAssistente()
    }
    if (aba === 'email') {
      carregarConfigEmail()
    }
    if (aba === 'precificacao') {
      api.getParametrosPrecificacao()
        .then(setPrecificacao)
        .catch(() => toast.error('Erro ao carregar os parâmetros de precificação.'))
    }
    if (aba === 'notificacoes') {
      carregarConfigNotificacoesAgendamento()
      carregarStatusNotificacoesAgendamento()
    }
  }, [aba])

  const carregarConfigAssistente = async () => {
    try {
      const config = await api.getAssistenteConfig()
      setAssistente(config)
    } catch {
      toast.error('Erro ao carregar configurações do assistente de IA.')
    }
  }

  const handleSalvarAssistente = async () => {
    setSalvandoAssistente(true)
    try {
      await api.updateAssistenteConfig({
        ativo: assistente.ativo,
        modelo: assistente.modelo,
        apiKey: novaApiKeyIA.trim() || undefined,
      })
      setNovaApiKeyIA('')
      toast.success('Configurações do assistente salvas!')
      carregarConfigAssistente()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar configurações do assistente.')
    } finally {
      setSalvandoAssistente(false)
    }
  }

  const carregarConfigTelegram = async () => {
    try {
      const config = await api.getTelegramConfig()
      setTelegram({
        ativo: config.ativo,
        nomeBot: config.nomeBot || '',
        userIdPadrao: config.userIdPadrao || '',
        tokenApi: config.tokenApi || '',
      })
    } catch (error) {
      toast.error('Erro ao carregar configurações do Telegram.')
    }
  }

  const handleSalvarTelegram = async () => {
    setLoading(true)
    try {
      await api.updateTelegramConfig(telegram)
      toast.success('Configurações do Telegram salvas!')
    } catch {
      toast.error('Erro ao salvar configurações do Telegram.')
    } finally {
      setLoading(false)
    }
  }

  const handleEnviarTesteTelegram = async () => {
    if (!telegram.userIdPadrao || !msgTeste) {
      toast.warning('Informe o User ID e a mensagem de teste.')
      return
    }
    setEnviandoTeste(true)
    try {
      await api.sendTelegramMessage({
        userId: telegram.userIdPadrao,
        mensagem: msgTeste
      })
      toast.success('Mensagem de teste enviada!')
      setMsgTeste('')
    } catch (error: any) {
      toast.error('Falha ao enviar teste: ' + (error.message || 'Erro desconhecido'))
    } finally {
      setEnviandoTeste(false)
    }
  }

  const carregarConfigNotificacoesAgendamento = async () => {
    try {
      const config = await api.getNotificacoesAgendamentoConfig()
      setNotificacoesAgendamento({
        ativoPlataforma: config.ativoPlataforma,
        ativoTelegram: config.ativoTelegram,
        horarioResumoDia: config.horarioResumoDia || '08:00',
        antecedenciaMin: Number(config.antecedenciaMin || 30),
      })
    } catch {
      toast.error('Erro ao carregar as notificações de agendamento.')
    }
  }

  const handleSalvarNotificacoesAgendamento = async () => {
    setLoading(true)
    try {
      await api.updateNotificacoesAgendamentoConfig({
        ...notificacoesAgendamento,
        antecedenciaMin: Number(notificacoesAgendamento.antecedenciaMin || 30),
      })
      toast.success('Notificações de agendamento salvas!')
    } catch {
      toast.error('Erro ao salvar as notificações de agendamento.')
    } finally {
      setLoading(false)
    }
  }

  const carregarStatusNotificacoesAgendamento = async () => {
    try {
      const status = await api.getNotificacoesAgendamentoStatus()
      setStatusNotificacoes(status)
    } catch {
      // sem toast para não poluir a tela
    }
  }

  const handleProcessarNotificacoesAgora = async () => {
    setProcessandoNotificacoesAgora(true)
    try {
      const status = await api.processarNotificacoesAgendamentoAgora()
      setStatusNotificacoes(status)
      toast.success('Processamento manual concluído. Confira o sino e o Telegram.')
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao processar notificações agora.')
    } finally {
      setProcessandoNotificacoesAgora(false)
    }
  }

  const formatarDataHora = (valor?: string | null) => {
    if (!valor) return 'Ainda não executado'
    const data = new Date(valor)
    if (Number.isNaN(data.getTime())) return valor
    return data.toLocaleString('pt-BR')
  }

  const handleSalvar = async () => {
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Configurações salvas com sucesso!')
    } catch {
      toast.error('Erro ao salvar configurações.')
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarPrecificacao = async () => {
    setSalvandoPrecificacao(true)
    try {
      setPrecificacao(await api.salvarParametrosPrecificacao(precificacao))
      toast.success('Custos padrão salvos! A tela de precificação já usa os novos valores.')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar os parâmetros.')
    } finally {
      setSalvandoPrecificacao(false)
    }
  }

  const carregarConfigEmail = async () => {
    try {
      setEmail(await api.getConfigEmail())
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar a configuração de e-mail.')
    }
  }

  const handleSalvarEmail = async () => {
    setSalvandoEmail(true)
    try {
      await api.salvarConfigEmail({ ...email, senha: novaSenhaEmail.trim() || undefined })
      setNovaSenhaEmail('')
      toast.success('Configuração de e-mail salva!')
      carregarConfigEmail()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a configuração de e-mail.')
    } finally {
      setSalvandoEmail(false)
    }
  }

  // Teste é envio de verdade: só assim dá pra saber que a senha e a porta estão certas.
  const handleTestarEmail = async () => {
    setTestandoEmail(true)
    try {
      await api.testarEmail(emailTeste.trim())
      toast.success(`E-mail de teste enviado para ${emailTeste.trim()}. Confira a caixa de entrada (e o spam).`)
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar o e-mail de teste.')
    } finally {
      setTestandoEmail(false)
    }
  }

  const removerToken = (id: number) => {
    setTokens(prev => prev.filter(t => t.id !== id))
    toast.info('Token removido.')
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'E-mail' },
    { key: 'telegram', label: 'Telegram' },
    { key: 'assistente', label: 'Assistente IA' },
    { key: 'notificacoes', label: 'Notificações' },
    { key: 'parametros', label: 'Parâmetros' },
    { key: 'precificacao', label: 'Precificação' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configurações do Sistema</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Parâmetros e integrações da plataforma</p>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', aba === a.key ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-800 dark:text-slate-200')}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Aba Geral */}
      {aba === 'geral' && (
        <div className="card max-w-2xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custos e Parâmetros Gerais</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Custo/hora Suporte (R$)', key: 'custoHoraSuporte' },
              { label: 'Custo/hora Desenvolvimento (R$)', key: 'custoHoraDev' },
              { label: 'Custo Fixo Mensal (R$)', key: 'custoFixoMensal' },
              { label: 'Custo por km (R$)', key: 'custoKm' },
              { label: 'Velocidade média (km/h)', key: 'velocidadeKmh' },
              { label: 'Margem Hora Suporte (%)', key: 'margemHoraSuporte' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{f.label}</label>
                <input type="number" className="input-field" value={(geral as Record<string, string>)[f.key]}
                  onChange={e => setGeral(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
          </button>
        </div>
      )}

      {/* Aba WhatsApp */}
      {aba === 'whatsapp' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tokens de API</h3>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Token API WhatsApp</label>
              <input className="input-field font-mono text-xs" value={tokenApi} onChange={e => setTokenApi(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Token de Notificações</label>
              <input className="input-field font-mono text-xs" value={tokenNotif} onChange={e => setTokenNotif(e.target.value)} />
            </div>
            <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tokens Cadastrados</h3>
              <button className="btn-secondary text-xs py-1">
                <Plus size={13} /> Novo Token
              </button>
            </div>
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium">{t.descricao}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{t.token}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-xs ${t.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <button onClick={() => removerToken(t.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aba E-mail */}
      {aba === 'email' && (
        <div className="space-y-4 max-w-2xl">
          <div className="card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Servidor de envio (SMTP)</h3>
              <p className="text-xs text-slate-500 mt-1">
                É por aqui que saem os avisos para o cliente que envia demanda pelo link público — confirmação do envio
                e cada atualização, até a solicitação ser concluída ou recusada.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={email.ativo}
                onChange={(e) => setEmail(v => ({ ...v, ativo: e.target.checked }))}
              />
              Envio de e-mail ativo
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Host SMTP</label>
                <input
                  className="input-field"
                  placeholder="smtp.seudominio.com.br"
                  value={email.host}
                  onChange={(e) => setEmail(v => ({ ...v, host: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Porta</label>
                <input
                  className="input-field"
                  type="number"
                  value={email.porta}
                  onChange={(e) => setEmail(v => ({ ...v, porta: Number(e.target.value) }))}
                />
                <p className="text-[11px] text-slate-500 mt-1">587 com STARTTLS, ou 465/2465 com SSL (o sistema já reconhece essas portas).</p>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Usuário</label>
                <input
                  className="input-field"
                  placeholder="normalmente o próprio e-mail"
                  value={email.usuario}
                  onChange={(e) => setEmail(v => ({ ...v, usuario: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Senha</label>
                <input
                  className="input-field"
                  type="password"
                  placeholder={email.temSenha ? '•••••••• (já configurada)' : 'senha da conta de e-mail'}
                  value={novaSenhaEmail}
                  onChange={(e) => setNovaSenhaEmail(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-slate-500 mt-1">Deixe em branco para manter a senha atual.</p>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">E-mail do remetente</label>
                <input
                  className="input-field"
                  type="email"
                  placeholder="suporte@cilos.com.br"
                  value={email.remetenteEmail}
                  onChange={(e) => setEmail(v => ({ ...v, remetenteEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome do remetente</label>
                <input
                  className="input-field"
                  placeholder="Cilos Sistema"
                  value={email.remetenteNome}
                  onChange={(e) => setEmail(v => ({ ...v, remetenteNome: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={email.seguro}
                onChange={(e) => setEmail(v => ({ ...v, seguro: e.target.checked }))}
              />
              Forçar conexão SSL direta (só para servidor fora do padrão — 465 e 2465 já usam SSL sozinhas)
            </label>

            <button onClick={handleSalvarEmail} disabled={salvandoEmail} className="btn-primary disabled:opacity-60">
              {salvandoEmail ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
            </button>
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Testar envio</h3>
            <p className="text-xs text-slate-500">
              Salve antes de testar. O teste envia uma mensagem real — se ela chegar, está tudo certo.
            </p>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                type="email"
                placeholder="enviar teste para..."
                value={emailTeste}
                onChange={(e) => setEmailTeste(e.target.value)}
              />
              <button
                onClick={handleTestarEmail}
                disabled={testandoEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTeste.trim())}
                className="btn-secondary disabled:opacity-60"
              >
                {testandoEmail
                  ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                  : <><Wifi size={15} /> Enviar teste</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {aba === 'precificacao' && (() => {
        const campoMoeda = (rotulo: string, chave: keyof typeof precificacao, dica?: string) => (
          <div key={chave}>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{rotulo}</label>
            <input
              className="input-field"
              value={Number(precificacao[chave] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              onChange={(e) => setPrecificacao(v => ({ ...v, [chave]: Number(e.target.value.replace(/\D/g, '') || '0') / 100 }))}
              onFocus={(e) => e.target.select()}
            />
            {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
          </div>
        )
        const campoNumero = (rotulo: string, chave: keyof typeof precificacao, sufixo?: string, dica?: string) => (
          <div key={chave}>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">{rotulo}{sufixo ? ` (${sufixo})` : ''}</label>
            <input
              className="input-field" type="number" min={0} step="0.5"
              value={precificacao[chave]}
              onChange={(e) => setPrecificacao(v => ({ ...v, [chave]: parseFloat(e.target.value) || 0 }))}
              onFocus={(e) => e.target.select()}
            />
            {dica && <p className="text-[11px] text-slate-400 mt-1">{dica}</p>}
          </div>
        )

        return (
          <div className="space-y-4 max-w-3xl">
            <div className="card space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custos padrão da operação</h3>
                <p className="text-xs text-slate-500 mt-1">
                  São os valores que a tela <strong>Comercial › Orçamento</strong> já traz preenchidos. O vendedor pode
                  alterar caso a caso; aqui fica o padrão da empresa, para ninguém precisar saber de cor.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Custos de implantação</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {campoMoeda('Custo por km', 'custoKm', 'Combustível + desgaste do veículo.')}
                  {campoMoeda('Hora técnica', 'custoHoraTecnica', 'Salário + encargos ÷ horas trabalhadas.')}
                  {campoMoeda('Hora de migração', 'custoHoraMigracao')}
                  {campoMoeda('Diária de hospedagem', 'custoHospedagem')}
                  {campoMoeda('Refeição', 'custoAlimentacao')}
                  {campoNumero('Refeições por dia', 'refeicoesDia', 'por técnico')}
                  {campoNumero('Horas de treinamento', 'horasTreinamento', 'padrão')}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Margem e encargos</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {campoNumero('Margem desejada', 'margemAlvo', '%', 'Lucro que a empresa quer sobre a venda.')}
                  {campoNumero('Impostos', 'impostosPerc', '%', 'Simples/ISS sobre o faturamento.')}
                  {campoNumero('Comissão do vendedor', 'comissaoPerc', '%')}
                  {campoNumero('Repasse da migração', 'migracaoRepassePerc', '%', 'Parte do valor da migração paga a quem executa — é o custo da empresa.')}
                </div>
                <p className="text-[11px] text-slate-500 mt-3">
                  Preço sugerido = custo ÷ (1 − margem − impostos − comissão). Imposto e comissão saem do valor
                  cobrado, não do custo — por isso não é custo + margem.
                </p>
              </div>

              <button onClick={handleSalvarPrecificacao} disabled={salvandoPrecificacao} className="btn-primary disabled:opacity-60">
                {salvandoPrecificacao
                  ? <><Loader2 size={15} className="animate-spin" /> Salvando...</>
                  : <><Save size={15} /> Salvar custos padrão</>}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Aba Telegram */}
      {aba === 'telegram' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Configuração do Bot</h3>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="telegram-ativo" 
                  checked={telegram.ativo} 
                  onChange={e => setTelegram(p => ({ ...p, ativo: e.target.checked }))}
                  className="rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600" 
                />
                <label htmlFor="telegram-ativo" className="text-xs text-slate-600 dark:text-slate-400">Ativar Integração</label>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Nome do Bot</label>
                <input 
                  className="input-field" 
                  value={telegram.nomeBot} 
                  onChange={e => setTelegram(p => ({ ...p, nomeBot: e.target.value }))}
                  placeholder="Ex: CommandBot"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">User ID Padrão (Destino)</label>
                <input 
                  className="input-field font-mono text-xs" 
                  value={telegram.userIdPadrao} 
                  onChange={e => setTelegram(p => ({ ...p, userIdPadrao: e.target.value }))}
                  placeholder="Ex: 12345678"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Token API (Relay)</label>
                <input 
                  type="password"
                  className="input-field font-mono text-xs" 
                  value={telegram.tokenApi} 
                  onChange={e => setTelegram(p => ({ ...p, tokenApi: e.target.value }))}
                  placeholder="Deixe em branco para usar o padrão"
                />
                <p className="text-[10px] text-slate-500 mt-1">A autenticação básica do Command System é usada por padrão.</p>
              </div>
            </div>

            <button onClick={handleSalvarTelegram} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Configurações</>}
            </button>
          </div>

          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Teste de Envio</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Mensagem de Teste</label>
                <textarea 
                  className="input-field min-h-[80px] resize-none" 
                  value={msgTeste} 
                  onChange={e => setMsgTeste(e.target.value)}
                  placeholder="Digite uma mensagem para testar o envio..."
                />
              </div>
              <button 
                onClick={handleEnviarTesteTelegram} 
                disabled={enviandoTeste || !telegram.userIdPadrao} 
                className="btn-secondary w-full justify-center disabled:opacity-50"
              >
                {enviandoTeste ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : <><Send size={15} /> Enviar Mensagem de Teste</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aba Assistente IA */}
      {aba === 'assistente' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Sparkles size={16} className="text-blue-400" /> Assistente Command Analytics
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="assistente-ativo"
                  checked={assistente.ativo}
                  onChange={e => setAssistente(p => ({ ...p, ativo: e.target.checked }))}
                  className="rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600"
                />
                <label htmlFor="assistente-ativo" className="text-xs text-slate-600 dark:text-slate-400">Ativar assistente</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Modelo (DeepSeek)</label>
                <select
                  className="input-field"
                  value={assistente.modelo}
                  onChange={e => setAssistente(p => ({ ...p, modelo: e.target.value }))}
                >
                  {assistente.modelosDisponiveis.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  <code>deepseek-chat</code> é o recomendado — tem melhor suporte a chamar ferramentas (consultar dados, preparar agendamentos/lançamentos). <code>deepseek-reasoner</code> é um modelo de raciocínio mais lento e pode não seguir tão bem essas ferramentas.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                  {assistente.temApiKey ? 'Nova API Key (deixe em branco para não alterar)' : 'API Key da DeepSeek'}
                </label>
                <input
                  type="password"
                  className="input-field font-mono text-xs"
                  value={novaApiKeyIA}
                  onChange={e => setNovaApiKeyIA(e.target.value)}
                  placeholder={assistente.temApiKey ? '••••••••••••••••' : 'sk-...'}
                  autoComplete="off"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {assistente.temApiKey ? 'Já existe uma chave configurada.' : 'Nenhuma chave configurada ainda.'} Gere em platform.deepseek.com.
                </p>
              </div>
            </div>

            <button onClick={handleSalvarAssistente} disabled={salvandoAssistente} className="btn-primary disabled:opacity-60">
              {salvandoAssistente ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Configurações</>}
            </button>
          </div>
        </div>
      )}

      {/* Aba Notificações */}
      {aba === 'notificacoes' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Notificações de Agendamento</h3>
              <p className="text-xs text-slate-500 mt-1">
                Defina quando a plataforma deve avisar os usuários sobre os compromissos do dia e sobre a antecedência de cada agendamento.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Horário do aviso diário</label>
                <input
                  type="time"
                  className="input-field"
                  value={notificacoesAgendamento.horarioResumoDia}
                  onChange={e => setNotificacoesAgendamento(prev => ({ ...prev, horarioResumoDia: e.target.value }))}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Nesse horário a plataforma lembra o usuário dos agendamentos dele no dia.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Antecedência do lembrete (min)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  className="input-field"
                  value={notificacoesAgendamento.antecedenciaMin}
                  onChange={e => setNotificacoesAgendamento(prev => ({ ...prev, antecedenciaMin: Number(e.target.value || 30) }))}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Exemplo: com 30 minutos, um agendamento às 14:00 será avisado às 13:30.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificacoesAgendamento.ativoPlataforma}
                  onChange={e => setNotificacoesAgendamento(prev => ({ ...prev, ativoPlataforma: e.target.checked }))}
                  className="rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Notificar na plataforma</p>
                  <p className="text-[11px] text-slate-500">Mostra os avisos no sino do sistema.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificacoesAgendamento.ativoTelegram}
                  onChange={e => setNotificacoesAgendamento(prev => ({ ...prev, ativoTelegram: e.target.checked }))}
                  className="rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Notificar no Telegram</p>
                  <p className="text-[11px] text-slate-500">Usa o Telegram do técnico ou o destino padrão configurado.</p>
                </div>
              </label>
            </div>

            <button onClick={handleSalvarNotificacoesAgendamento} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Configurações</>}
            </button>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Teste e monitoramento</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Use este botão para forçar a verificação agora e confirmar se os avisos automáticos estão sendo gerados.
                </p>
              </div>
              <button
                onClick={handleProcessarNotificacoesAgora}
                disabled={processandoNotificacoesAgora}
                className="btn-secondary disabled:opacity-60"
              >
                {processandoNotificacoesAgora
                  ? <><Loader2 size={15} className="animate-spin" /> Processando...</>
                  : <><Send size={15} /> Processar agora</>}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Última execução</p>
                <p className="text-slate-800 dark:text-slate-200">{formatarDataHora(statusNotificacoes?.ultimaExecucaoEm)}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Último sucesso</p>
                <p className="text-slate-800 dark:text-slate-200">{formatarDataHora(statusNotificacoes?.ultimoSucessoEm)}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Agendamentos do dia lidos</p>
                <p className="text-slate-800 dark:text-slate-200">{statusNotificacoes?.ultimoResumo.agendamentosHoje ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Agendamentos na janela</p>
                <p className="text-slate-800 dark:text-slate-200">{statusNotificacoes?.ultimoResumo.agendamentosJanela ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Notificações na plataforma</p>
                <p className="text-slate-800 dark:text-slate-200">{statusNotificacoes?.ultimoResumo.plataformaGeradas ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Telegram enviados</p>
                <p className="text-slate-800 dark:text-slate-200">{statusNotificacoes?.ultimoResumo.telegramEnviados ?? 0}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs text-slate-500 mb-1">Situação da última tentativa</p>
              {statusNotificacoes?.ultimaMensagemErro ? (
                <p className="text-sm text-red-500">{statusNotificacoes.ultimaMensagemErro}</p>
              ) : (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} />
                  Sem erro registrado na última execução.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aba Parâmetros */}
      {aba === 'parametros' && (
        <div className="card max-w-2xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Parâmetros Comerciais</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Chave PIX</label>
              <input className="input-field" value={params.chavePix} onChange={e => setParams(p => ({ ...p, chavePix: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Percentual de Reajuste Anual (%)</label>
              <input type="number" className="input-field" value={params.percReajuste} onChange={e => setParams(p => ({ ...p, percReajuste: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">% Máx. Desconto Implantação</label>
              <input type="number" className="input-field" value={params.percMaxDesconto} onChange={e => setParams(p => ({ ...p, percMaxDesconto: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Dias de Carência para Bloqueio</label>
              <input type="number" className="input-field" value={params.diasCarencia} onChange={e => setParams(p => ({ ...p, diasCarencia: e.target.value }))} />
            </div>
          </div>
          <button onClick={handleSalvar} disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
          </button>
        </div>
      )}
    </div>
  )
}
