import { useEffect, useRef, useState } from 'react'
import { Search, Plus, RefreshCw, UserCheck, UserX, User, Shield, Edit2, Send, Unlink, MessageCircle, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { api } from '../../services/api'
import type { Usuario, Departamento } from '../../types'
import clsx from 'clsx'

const DEPARTAMENTOS = ['Suporte', 'Fiscal', 'Financeiro', 'Comercial', 'Certificado', 'CS', 'Instalação', 'Treinamento', 'Técnico']

type UsuarioForm = {
  nome: string
  nomeUsu: string
  email: string
  senha: string
  cargo: string
  departamento: Departamento
  idTelegram: string
}

function TelegramVinculo({ usuarioId, idTelegram, onChange }: { usuarioId: number; idTelegram: string; onChange: (v: string) => void }) {
  const [gerando, setGerando] = useState(false)
  const [codigo, setCodigo] = useState<{ codigo: string; botUsername: string | null; expiraEm: number } | null>(null)
  const [erro, setErro] = useState('')
  const [testando, setTestando] = useState(false)
  const [mensagemTeste, setMensagemTeste] = useState('Mensagem de teste do Command Analytics.')
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [testeResultado, setTesteResultado] = useState('')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [])

  async function gerarCodigo() {
    setErro('')
    setGerando(true)
    try {
      const res = await api.gerarCodigoTelegramUsuario(usuarioId)
      setCodigo(res)
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await api.statusTelegramUsuario(usuarioId)
          if (status.idTelegram) {
            onChange(status.idTelegram)
            setCodigo(null)
            if (pollRef.current) window.clearInterval(pollRef.current)
          } else if (Date.now() > res.expiraEm) {
            setCodigo(null)
            if (pollRef.current) window.clearInterval(pollRef.current)
          }
        } catch { /* ignora erro pontual de polling */ }
      }, 3000)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gerar código.')
    } finally {
      setGerando(false)
    }
  }

  async function desconectar() {
    if (!window.confirm('Desvincular o Telegram desse usuário?')) return
    try {
      await api.desconectarTelegramUsuario(usuarioId)
      onChange('')
    } catch (e: any) {
      setErro(e?.message || 'Falha ao desvincular.')
    }
  }

  async function enviarTeste() {
    setEnviandoTeste(true)
    setTesteResultado('')
    try {
      await api.sendTelegramMessage({ userId: idTelegram, mensagem: mensagemTeste })
      setTesteResultado('Mensagem enviada!')
    } catch (e: any) {
      setTesteResultado(e?.message || 'Falha ao enviar.')
    } finally {
      setEnviandoTeste(false)
    }
  }

  return (
    <div>
      <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Telegram</label>
      {idTelegram ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
              <MessageCircle size={14} /> Conectado (ID: {idTelegram})
            </span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setTestando(t => !t)} className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1">
                <Send size={12} /> Testar
              </button>
              <button type="button" onClick={desconectar} className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1">
                <Unlink size={12} /> Desconectar
              </button>
            </div>
          </div>
          {testando && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <textarea
                className="input-field resize-none h-16 text-sm w-full"
                value={mensagemTeste}
                onChange={e => setMensagemTeste(e.target.value)}
                placeholder="Digite a mensagem de teste..."
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" disabled={enviandoTeste} onClick={enviarTeste}>
                  {enviandoTeste ? 'Enviando...' : 'Enviar Teste'}
                </Button>
                {testeResultado && <span className="text-xs text-slate-500">{testeResultado}</span>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          {!codigo ? (
            <Button type="button" variant="secondary" size="sm" disabled={gerando} onClick={gerarCodigo}>
              {gerando ? 'Gerando...' : 'Conectar Telegram'}
            </Button>
          ) : (
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <p>
                Abra o Telegram, procure{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">@{codigo.botUsername}</span>{' '}
                e envie o código:
              </p>
              <p className="text-lg font-bold tracking-widest text-blue-500">{codigo.codigo}</p>
              <p className="flex items-center gap-1 text-slate-500"><Loader2 size={12} className="animate-spin" /> Aguardando confirmação... (expira em 10 min)</p>
            </div>
          )}
          {erro && <p className="text-xs text-red-400">{erro}</p>}
        </div>
      )}
    </div>
  )
}

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('ativos')

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Modal State
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<UsuarioForm>({
    nome: '',
    nomeUsu: '',
    email: '',
    senha: '',
    cargo: '',
    departamento: 'Suporte',
    idTelegram: '',
  })

  useEffect(() => {
    loadUsuarios()
  }, [])

  async function loadUsuarios() {
    setLoading(true)
    try {
      const data = await api.getUsuariosTodos()
      setUsuarios(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = usuarios.filter(u => {
    if (filtroStatus === 'ativos' && !u.ativo) return false
    if (filtroStatus === 'inativos' && u.ativo) return false
    
    if (search) {
      const q = search.toLowerCase()
      const n = (u.nome || '').toLowerCase()
      const nu = (u.nomeUsu || '').toLowerCase()
      const e = (u.email || '').toLowerCase()
      if (!n.includes(q) && !nu.includes(q) && !e.includes(q)) return false
    }
    
    return true
  })

  async function handleToggleStatus(u: Usuario) {
    try {
      await api.toggleUsuario(u.id)
      await loadUsuarios()
    } catch (e: any) {
      alert(e?.message || 'Erro ao alterar status')
    }
  }

  function openNew() {
    setEditId(null)
    setForm({
      nome: '',
      nomeUsu: '',
      email: '',
      senha: '',
      cargo: '',
      departamento: 'Suporte',
      idTelegram: '',
    })
    setShowModal(true)
  }

  function openEdit(u: Usuario) {
    setEditId(u.id)
    setForm({
      nome: u.nome || '',
      nomeUsu: u.nomeUsu || '',
      email: u.email || '',
      senha: '', // don't load password
      cargo: u.cargo || '',
      departamento: u.departamento || 'Suporte',
      idTelegram: u.idTelegram || '',
    })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) {
        // Only send password if it was filled
        const dataToSave = { ...form }
        if (!dataToSave.senha) delete (dataToSave as any).senha
        
        await api.updateUsuario(editId, dataToSave)
      } else {
        await api.createUsuario(form)
      }
      setShowModal(false)
      loadUsuarios()
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-lg">
            <User className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Usuários</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Gestão de acessos e perfis</p>
          </div>
        </div>
        <Button onClick={openNew} icon={<Plus className="w-4 h-4" />}>
          Novo Usuário
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <Input
              icon={<Search className="w-4 h-4" />}
              placeholder="Buscar por nome, usuário ou e-mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              options={[
                { value: 'todos', label: 'Todos os status' },
                { value: 'ativos', label: 'Apenas Ativos' },
                { value: 'inativos', label: 'Apenas Inativos' },
              ]}
            />
          </div>
          <Button variant="secondary" onClick={loadUsuarios} icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}>
            Atualizar
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-600 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 font-medium rounded-tl-lg">Usuário</th>
                <th className="px-4 py-3 font-medium">Nome Completo</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Cargo / Depto</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {u.nomeUsu || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {u.nome || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {u.email || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-700 dark:text-slate-300">{u.cargo || '—'}</span>
                        <span className="text-xs text-slate-500">{u.departamento || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx(
                        'px-2 py-1 text-xs font-medium rounded-full',
                        u.ativo ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      )}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-blue-400 transition-colors rounded"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={clsx(
                            'p-1.5 transition-colors rounded',
                            u.ativo ? 'text-red-400 hover:bg-red-400/10' : 'text-emerald-400 hover:bg-emerald-400/10'
                          )}
                          title={u.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                        >
                          {u.ativo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-xl shadow-xl w-full max-w-lg border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editId ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 dark:text-slate-300">
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nome Completo"
                  value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  required
                />
                <Input
                  label="Nome de Usuário (Login)"
                  value={form.nomeUsu}
                  onChange={e => setForm({ ...form, nomeUsu: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="E-mail"
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  label={editId ? "Nova Senha (deixe em branco para não alterar)" : "Senha"}
                  type="password"
                  value={form.senha}
                  onChange={e => setForm({ ...form, senha: e.target.value })}
                  required={!editId}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Cargo"
                  value={form.cargo}
                  onChange={e => setForm({ ...form, cargo: e.target.value })}
                />
                <Select
                  label="Departamento"
                  value={form.departamento}
                  onChange={e => setForm({ ...form, departamento: e.target.value as Departamento })}
                  options={DEPARTAMENTOS.map(d => ({ value: d, label: d }))}
                />
              </div>

              <div>
                {editId ? (
                  <TelegramVinculo
                    usuarioId={editId}
                    idTelegram={form.idTelegram}
                    onChange={(v) => setForm(f => ({ ...f, idTelegram: v }))}
                  />
                ) : (
                  <p className="text-xs text-slate-500">Salve o usuário primeiro pra poder conectar o Telegram.</p>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 mt-6">
                <Button variant="secondary" onClick={() => setShowModal(false)} type="button">
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
