import { useState } from 'react'
import { Calculator, DollarSign } from 'lucide-react'

export function Orcamento() {
  const [form, setForm] = useState({
    valorPlano: 499.90,
    qtdCarros: 1,
    distanciaKm: 0,
    custoKm: 1.5,
    qtdTecnicos: 1,
    qtdHorasTreinamento: 8,
    custoHoraTecnica: 80,
    diasHospedagem: 0,
    custoHospedagem: 150,
    qtdAlimentacao: 0,
    custoAlimentacao: 45,
    valorMigracao: 0,
    desconto: 0,
  })

  const set = (k: string, v: number) => setForm(f => ({ ...f, [k]: v }))

  const custoDeslocamento = form.qtdCarros * form.distanciaKm * 2 * form.custoKm
  const custoTreinamento = form.qtdTecnicos * form.qtdHorasTreinamento * form.custoHoraTecnica
  const custoHospedagem = form.diasHospedagem * form.custoHospedagem * form.qtdTecnicos
  const custoAlimentacao = form.qtdAlimentacao * form.custoAlimentacao
  const subtotal = custoDeslocamento + custoTreinamento + custoHospedagem + custoAlimentacao + form.valorMigracao
  const descontoValor = subtotal * (form.desconto / 100)
  const total = subtotal - descontoValor

  const Field = ({ label, field, prefix = '', step = 1 }: { label: string; field: string; prefix?: string; step?: number }) => (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{prefix}</span>}
        <input
          type="number" step={step} min={0}
          className={`input-field ${prefix ? 'pl-10' : ''}`}
          value={(form as Record<string, number>)[field]}
          onChange={e => set(field, parseFloat(e.target.value) || 0)}
        />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="text-blue-400" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Orçamento de Implantação</h1>
          <p className="text-slate-400 text-sm mt-0.5">Calcule o custo total de implantação para um cliente</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><DollarSign size={16} className="text-blue-400" /> Plano</h3>
            <Field label="Valor do Plano (R$)" field="valorPlano" prefix="R$" step={0.01} />
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">🚗 Deslocamento</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Qtd. Carros" field="qtdCarros" />
              <Field label="Distância (km)" field="distanciaKm" />
              <Field label="Custo por km (R$)" field="custoKm" prefix="R$" step={0.01} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">🎓 Treinamento</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Qtd. Técnicos" field="qtdTecnicos" />
              <Field label="Horas de Treinamento" field="qtdHorasTreinamento" />
              <Field label="Custo/hora técnica (R$)" field="custoHoraTecnica" prefix="R$" step={0.01} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">🏨 Hospedagem e Alimentação</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dias de Hospedagem" field="diasHospedagem" />
              <Field label="Custo/dia hospedagem (R$)" field="custoHospedagem" prefix="R$" step={0.01} />
              <Field label="Qtd. Refeições" field="qtdAlimentacao" />
              <Field label="Custo por refeição (R$)" field="custoAlimentacao" prefix="R$" step={0.01} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">💾 Migração e Desconto</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor da Migração (R$)" field="valorMigracao" prefix="R$" step={0.01} />
              <Field label="Desconto (%)" field="desconto" step={0.5} />
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div className="space-y-4">
          <div className="card sticky top-6">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">💰 Resumo do Orçamento</h3>
            <div className="space-y-3">
              {[
                { label: 'Deslocamento', val: custoDeslocamento },
                { label: 'Treinamento', val: custoTreinamento },
                { label: 'Hospedagem', val: custoHospedagem },
                { label: 'Alimentação', val: custoAlimentacao },
                { label: 'Migração', val: form.valorMigracao },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-slate-400">{item.label}</span>
                  <span className="text-slate-200">R$ {item.val.toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-3 flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-slate-200">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              {form.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">Desconto ({form.desconto}%)</span>
                  <span className="text-red-400">- R$ {descontoValor.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="border-t border-blue-500 pt-3 flex justify-between">
                <span className="text-blue-300 font-semibold">TOTAL IMPLANTAÇÃO</span>
                <span className="text-blue-400 font-bold text-lg">R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="border-t border-slate-700 pt-3 flex justify-between text-sm">
                <span className="text-slate-400">Mensalidade do Plano</span>
                <span className="text-emerald-400 font-semibold">R$ {form.valorPlano.toFixed(2).replace('.', ',')}/mês</span>
              </div>
            </div>
            <button className="btn-primary w-full mt-5 justify-center">Gerar Proposta</button>
          </div>
        </div>
      </div>
    </div>
  )
}
