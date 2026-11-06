# API de Agendamento — Command Analytics

Documento para quem vai programar a aplicação externa.

Permite consultar procedimentos, técnicos e horários livres e criar um agendamento na agenda
do Command Analytics. O agendamento criado é idêntico a um feito pela tela: aparece na Lista
de Agendamentos, notifica o técnico pelo Telegram e entra na auditoria.

---

## 1. Endereço e autenticação

**Base:** `https://controle.cilos.com.br/api/integracao/agenda`

Toda chamada leva a chave de API no cabeçalho:

```
X-API-Key: ca_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Também é aceito `Authorization: Bearer ca_...`, se for mais conveniente.

A chave é gerada no Command Analytics em **Infraestrutura → Chaves de API** e aparece uma
única vez. Não é login de usuário: não expira por sessão, não tem senha e só dá acesso aos
endpoints deste documento.

**Limite:** 120 requisições por minuto por chave. Acima disso vem `429`.

Teste a configuração com:

```
GET /ping
→ 200 { "ok": true, "chave": "Site de agendamento", "agora": "2026-11-06T12:34:56.000Z" }
```

---

## 2. O fluxo

```
1. GET  /procedimentos          → o que pode ser agendado
2. GET  /horarios?...           → quando e com quem há vaga
3. POST /agendamentos           → agenda
4. GET  /agendamentos/:id       → confere depois (opcional)
5. DEL  /agendamentos/:id       → cancela (opcional)
```

---

## 3. Endpoints

### 3.1 `GET /procedimentos`

Procedimentos ativos.

```json
[
  { "id": 22, "nome": "ATENDIMENTO", "duracaoMin": 60, "tecnicoIds": [] },
  { "id": 6,  "nome": "COMPARTILHAR IMPRESSORAS", "duracaoMin": 30,
    "tecnicoIds": [14, 19, 25, 37, 46, 49] }
]
```

`duracaoMin` é quanto tempo o procedimento ocupa na agenda.

`tecnicoIds` **vazio significa "qualquer técnico"**, não "nenhum". Quando vem preenchido, só
aqueles técnicos atendem aquele procedimento.

### 3.2 `GET /tecnicos`

Técnicos ativos com agenda configurada.

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `procedimentoId` | não | filtra só quem atende o procedimento |

```json
[ { "id": 18, "nome": "BRUNA" }, { "id": 49, "nome": "Gustavo" } ]
```

### 3.3 `GET /horarios`

**O endpoint principal.** Devolve os horários em que dá para agendar.

| Parâmetro | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `procedimentoId` | **sim** | número | define a duração usada no cálculo |
| `dataInicio` | **sim** | `AAAA-MM-DD` | primeiro dia |
| `dataFim` | não | `AAAA-MM-DD` | último dia; sem ele, só o dia inicial |
| `tecnicoId` | não | número | restringe a um técnico |

Intervalo máximo: **31 dias**. Pedir mais devolve só os 31 primeiros.

```
GET /horarios?procedimentoId=22&dataInicio=2026-11-09&dataFim=2026-11-10
```

```json
{
  "duracaoMin": 60,
  "disponibilidade": [
    { "data": "2026-11-09", "tecnicoId": 18, "tecnicoNome": "BRUNA",
      "horarios": ["08:00", "09:00"] },
    { "data": "2026-11-09", "tecnicoId": 49, "tecnicoNome": "Gustavo",
      "horarios": ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00"] }
  ]
}
```

Cada item é **um técnico num dia**. Técnico sem vaga naquele dia não aparece, e lista vazia
significa que não há horário no período — não é erro.

O que já vem descontado: a agenda do técnico, outros agendamentos programados, bloqueios,
horário de almoço e os dias da semana em que ele não trabalha. Um horário só aparece se o
procedimento **inteiro** couber nele — um procedimento de 60 min não aparece às 17:30 se o
expediente termina às 18:00 e o intervalo da agenda é de 30 min.

### 3.4 `POST /agendamentos`

Cria o agendamento.

| Campo | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `tecnicoId` | **sim** | número | de `/tecnicos` ou `/horarios` |
| `procedimentoId` | **sim** | número | de `/procedimentos` |
| `data` | **sim** | `AAAA-MM-DD` | |
| `horaInicio` | **sim** | `HH:MM` | exatamente um dos valores de `horarios` |
| `clienteId` | não¹ | número | código do cliente no sistema |
| `documento` | não¹ | texto | CNPJ ou CPF, com ou sem pontuação |
| `duracao` | não | número | minutos; o padrão é a duração do procedimento |
| `descricao` | não | texto | até 500 caracteres |
| `tipo` | não | texto | `Instalação`, `Treinamento`, `Visita`, `Retorno` ou `Outros` |

¹ Os dois são opcionais, mas informe um deles quando souber de quem é o atendimento. Com
`documento`, o cliente é procurado pelo CNPJ/CPF cadastrado; não achando, a resposta é `404`
e nada é agendado.

```json
{
  "tecnicoId": 49,
  "procedimentoId": 22,
  "data": "2026-11-09",
  "horaInicio": "14:00",
  "documento": "21.842.540/0001-92",
  "descricao": "Treinamento de PDV",
  "tipo": "Treinamento"
}
```

Resposta `201`:

```json
{ "id": 1234, "tecnicoId": 49, "clienteId": 2, "procedimentoId": 22,
  "data": "2026-11-09", "horaInicio": "14:00", "duracaoMin": 60 }
```

Guarde o `id`: é por ele que se consulta e se cancela.

> **O horário é conferido de novo aqui.** A validação não usa o que você viu em `/horarios`,
> e sim o estado do banco no instante da gravação. Se alguém ocupou a vaga nesse meio-tempo,
> a resposta é `409` e **nada é criado** — é o comportamento esperado, não uma falha.
> Trate o `409` pedindo os horários de novo e oferecendo as opções atualizadas.

### 3.5 `GET /agendamentos/:id`

```json
{ "id": 1234, "tecnicoId": 49, "tecnicoNome": "Gustavo", "clienteId": 2,
  "procedimentoId": 22, "procedimentoNome": "ATENDIMENTO",
  "data": "2026-11-09", "horaInicio": "14:00", "duracaoMin": 60,
  "status": "ativo", "descricao": "Treinamento de PDV [Site de agendamento]" }
```

`status` é `ativo` ou `cancelado`.

### 3.6 `DELETE /agendamentos/:id`

Cancela. Devolve `{ "ok": true }`, ou `404` se já estava cancelado.

O registro não é apagado, só marcado como cancelado — o técnico já foi avisado e o histórico
precisa continuar existindo.

---

## 4. Erros

Todos vêm como `{ "error": "mensagem em português" }`.

| Código | Quando | O que fazer |
|---|---|---|
| `400` | campo faltando ou em formato errado; procedimento inativo; técnico que não atende o procedimento | corrigir a requisição |
| `401` | chave ausente, inválida ou revogada | conferir o cabeçalho e a chave |
| `404` | cliente ou agendamento não encontrado | conferir o documento/id |
| `409` | horário ocupado, fora da janela do técnico, ou técnico sem agenda | **reconsultar `/horarios`** e oferecer outro horário |
| `429` | mais de 120 chamadas no minuto | esperar e repetir |

As mensagens de `409` distinguem os casos: *"Já existe um agendamento nesse horário"*,
*"Horário ocupado na agenda principal do técnico"*, *"Técnico sem disponibilidade
configurada"*, *"Data fora do período de validade da disponibilidade"*.

---

## 5. Exemplo completo

```bash
CHAVE="ca_sua_chave_aqui"
BASE="https://controle.cilos.com.br/api/integracao/agenda"

# 1. O que dá para agendar
curl -s -H "X-API-Key: $CHAVE" "$BASE/procedimentos"

# 2. Onde há vaga na próxima semana
curl -s -H "X-API-Key: $CHAVE" \
  "$BASE/horarios?procedimentoId=22&dataInicio=2026-11-09&dataFim=2026-11-13"

# 3. Agendar
curl -s -X POST -H "X-API-Key: $CHAVE" -H "Content-Type: application/json" \
  -d '{"tecnicoId":49,"procedimentoId":22,"data":"2026-11-09","horaInicio":"14:00",
       "documento":"21842540000192","descricao":"Treinamento de PDV","tipo":"Treinamento"}' \
  "$BASE/agendamentos"
```

```javascript
const BASE = 'https://controle.cilos.com.br/api/integracao/agenda'
const cabecalhos = { 'X-API-Key': process.env.COMMAND_API_KEY, 'Content-Type': 'application/json' }

async function agendar(dados) {
  const r = await fetch(`${BASE}/agendamentos`, {
    method: 'POST', headers: cabecalhos, body: JSON.stringify(dados),
  })
  const corpo = await r.json()
  if (r.status === 409) {
    // A vaga foi ocupada entre a consulta e o envio: reconsultar antes de insistir.
    throw new Error(`Horário indisponível: ${corpo.error}`)
  }
  if (!r.ok) throw new Error(corpo.error ?? `Erro ${r.status}`)
  return corpo
}
```

---

## 6. Recomendações

- **Não guarde a lista de horários.** Ela muda a cada agendamento feito por qualquer
  caminho — pela tela, por outra integração ou por esta. Consulte na hora de mostrar.
- **Trate o `409` como caminho normal**, não como erro de sistema. Em agenda concorrente ele
  acontece.
- **Não repita um POST que deu timeout** sem antes consultar: pode ter sido criado. Procure
  pelo técnico, data e hora em `/horarios` — se o horário sumiu, foi criado.
- **Guarde a chave fora do código** (variável de ambiente). Se vazar, revogue no Command
  Analytics e gere outra; nada mais precisa mudar.
- **Mande a `descricao`** com o contexto que o técnico precisa. O nome da aplicação é anexado
  automaticamente, então dá para saber de onde veio cada agendamento.
