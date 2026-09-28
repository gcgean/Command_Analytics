import { useState } from 'react'
import { CheckCircle2, Loader2, Mail, Search, AlertTriangle } from 'lucide-react'
import { api } from '../../services/api'

const soDigitos = (v: string) => v.replace(/\D/g, '')

function mascararDocumento(v: string): string {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (_m, a, b, c, e) =>
      [a, b, c].filter(Boolean).join('.') + (e ? `-${e}` : ''))
  }
  return d.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*/, (_m, a, b, c, e, f) =>
    [a, b].filter(Boolean).join('.') + (c ? `.${c}` : '') + (e ? `/${e}` : '') + (f ? `-${f}` : ''))
}

function mascararTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_m, a, b, c) =>
    (a ? `(${a}` : '') + (a.length === 2 ? ') ' : '') + b + (c ? `-${c}` : ''))
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, (_m, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ''}`)
}

type Cliente = { estado: 'vazio' | 'buscando' | 'achado' | 'novo'; nome: string }

export function SolicitacaoDemanda() {
  const [form, setForm] = useState({ nome: '', documento: '', email: '', whatsapp: '', descricao: '' })
  const [cliente, setCliente] = useState<Cliente>({ estado: 'vazio', nome: '' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState<{ id: number } | null>(null)

  const alterar = (campo: keyof typeof form, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  // Busca ao completar o documento: quem digita o CNPJ certo já vê o nome da empresa e sabe que
  // chegou no lugar certo, sem precisar de mais um botão na tela.
  const procurarCliente = async (valor: string) => {
    const digitos = soDigitos(valor)
    if (digitos.length !== 11 && digitos.length !== 14) {
      setCliente({ estado: 'vazio', nome: '' })
      return
    }
    setCliente({ estado: 'buscando', nome: '' })
    try {
      const r = await api.buscarClientePublico(digitos)
      setCliente(r.encontrado ? { estado: 'achado', nome: r.nome } : { estado: 'novo', nome: '' })
    } catch {
      setCliente({ estado: 'vazio', nome: '' })
    }
  }

  const enviar = async () => {
    setErro('')
    setEnviando(true)
    try {
      const r = await api.enviarDemandaPublica({
        nome: form.nome.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        documento: soDigitos(form.documento),
        descricao: form.descricao.trim(),
      })
      setEnviado({ id: r.id })
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível enviar sua solicitação. Tente novamente em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  const podeEnviar =
    form.nome.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) &&
    soDigitos(form.whatsapp).length >= 10 &&
    [11, 14].includes(soDigitos(form.documento).length) &&
    form.descricao.trim().length >= 15

  if (enviado) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Solicitação enviada</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Seu protocolo é <strong className="text-slate-900 dark:text-slate-100">#{enviado.id}</strong>. Guarde esse número.
          </p>
          <div className="mt-6 text-left bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex gap-3">
            <Mail size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Você vai receber um e-mail em <strong>{form.email.trim()}</strong> a cada atualização desta
              solicitação, até ela ser <strong>concluída</strong> ou <strong>recusada</strong>. Se não encontrar nossas
              mensagens, confira a caixa de spam.
            </p>
          </div>
          <button
            className="btn-secondary mt-6"
            onClick={() => {
              setEnviado(null)
              setForm({ nome: '', documento: '', email: '', whatsapp: '', descricao: '' })
              setCliente({ estado: 'vazio', nome: '' })
            }}
          >
            Enviar outra solicitação
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4">
      <div className="w-full max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Solicitação de Demanda</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Conte o que você precisa. Nossa equipe de desenvolvimento analisa cada pedido e responde por e-mail.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quem é você?</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
              <input
                className="input-field"
                placeholder="Como podemos te chamar"
                value={form.nome}
                onChange={(e) => alterar('nome', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">CNPJ/CPF da empresa <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  className="input-field pr-9"
                  placeholder="00.000.000/0000-00"
                  value={form.documento}
                  onChange={(e) => {
                    const v = mascararDocumento(e.target.value)
                    alterar('documento', v)
                    void procurarCliente(v)
                  }}
                />
                {cliente.estado === 'buscando' && <Loader2 size={15} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
                {cliente.estado === 'achado' && <CheckCircle2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                {cliente.estado === 'novo' && <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500" />}
              </div>
              {cliente.estado === 'achado' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Cadastro localizado: <strong>{cliente.nome}</strong></p>
              )}
              {cliente.estado === 'novo' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Não localizamos esse documento no nosso cadastro. Pode enviar assim mesmo — confirmamos com você depois.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">E-mail <span className="text-red-500">*</span></label>
              <input
                type="email"
                className="input-field"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => alterar('email', e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">É por aqui que avisamos o andamento.</p>
            </div>
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">WhatsApp <span className="text-red-500">*</span></label>
              <input
                className="input-field"
                placeholder="(00) 00000-0000"
                value={form.whatsapp}
                onChange={(e) => alterar('whatsapp', mascararTelefone(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Descrição da demanda</p>
          <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">O que você precisa? <span className="text-red-500">*</span></label>
          <textarea
            className="input-field w-full h-40 resize-none"
            placeholder="Descreva com detalhes: em que tela acontece, o que você esperava e o que está acontecendo hoje."
            value={form.descricao}
            onChange={(e) => alterar('descricao', e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Quanto mais detalhe, mais rápido conseguimos analisar. {form.descricao.trim().length < 15 && 'Mínimo de 15 caracteres.'}
          </p>
        </div>

        {erro && (
          <div className="flex gap-2 items-start text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {erro}
          </div>
        )}

        <button className="btn-primary w-full justify-center py-3" disabled={!podeEnviar || enviando} onClick={enviar}>
          {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : 'Enviar solicitação'}
        </button>
        <p className="text-xs text-center text-slate-500">
          Ao enviar, você receberá atualizações por e-mail até a conclusão ou recusa da solicitação.
        </p>
      </div>
    </div>
  )
}
