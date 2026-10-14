# Agente de IA no ERP Delphi — especificação para implementação

Documento para ser entregue a quem vai implementar o assistente de IA dentro do ERP Delphi.
A IA não é chamada diretamente pelo ERP: o ERP chama o Command Analytics, que chama a IA.

---

## 1. Objetivo

Um assistente dentro do ERP que **explica os relatórios** para o cliente final em linguagem
simples e responde perguntas sobre o relatório que está aberto na tela.

## 2. Arquitetura — por que não chamar a IA direto

```
ERP Delphi  ──HTTPS──>  Command Analytics  ──>  Provedor de IA
```

O ERP **nunca** fala com o provedor de IA. Motivos:

- a chave do provedor ficaria dentro do executável instalado na máquina do cliente;
- trocar de provedor exigiria atualizar o ERP em todos os clientes;
- não haveria como medir consumo nem cortar o acesso de um cliente específico.

## 3. Endpoint

### Explicar / perguntar

```
POST https://controle.cilos.com.br/api/ia-externa/explicar
Content-Type: application/json; charset=utf-8
X-API-Key: ca_xxxxxxxxxxxxxxxxxxxxxxxx
```

Corpo:

```json
{
  "relatorio": "Faturamento por forma de pagamento",
  "periodo": "01/09/2026 a 30/09/2026",
  "cnpj": "40581011000127",
  "clienteNome": "Padaria do Zé",
  "usuario": "joao",
  "publico": "cliente",
  "pergunta": "Por que o cartão caiu em relação ao mês passado?",
  "dados": { }
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `relatorio` | sim | Nome do relatório como aparece na tela |
| `dados` | sim | Conteúdo do relatório: objeto JSON, array, CSV ou texto. Máx. **60.000 caracteres** |
| `cnpj` **ou** `clienteNome` | sim | Identifica o cliente final. `cnpj` é o preferido (só dígitos) |
| `periodo` | não | Texto livre |
| `usuario` | não | Login de quem perguntou, para o histórico |
| `pergunta` | não | Sem ela, a IA devolve um resumo do relatório |
| `publico` | não | `"cliente"` (padrão, linguagem simples) ou `"tecnico"` |

Resposta `200`:

```json
{
  "resposta": "texto em português",
  "modelo": "deepseek-chat",
  "cliente": "ERP Delphi",
  "tokens": { "entrada": 1234, "saida": 567, "total": 1801 }
}
```

Erros — todos com `{ "error": "mensagem" }`:

| Código | Significado | O que o ERP faz |
|---|---|---|
| 400 | Falta `relatorio`, `dados` ou a identificação do cliente | Corrigir a chamada (bug) |
| 401 | Chave ausente ou inválida | Avisar que a IA não está liberada |
| 403 | Chave desativada | Mesma coisa |
| 413 | `dados` acima de 60.000 caracteres | Enviar o relatório resumido ou em partes |
| 429 | Limite diário da chave atingido | Mensagem clara, tentar no dia seguinte |
| 502 / 503 / 504 | IA indisponível ou lenta | Oferecer "tentar novamente" |

Tempo de resposta típico: 3 a 15 segundos. **Timeout do cliente: 120 s.**

### Status (não gasta IA)

```
GET https://controle.cilos.com.br/api/ia-externa/status
X-API-Key: ca_xxxx
```

```json
{ "cliente": "ERP Delphi", "ativo": true, "iaDisponivel": true, "usoHoje": 12, "limiteDia": 500 }
```

Use na abertura do sistema para decidir se mostra ou esconde o botão da IA.

## 4. Chave de acesso — uma por cliente

A chave fica dentro da instalação do cliente, então **não distribua uma chave única no
instalador**. Gere **uma chave por cliente** em *Command Analytics › Configurações ›
Assistente IA › Acesso de sistemas externos* e grave na configuração local daquela instalação.

Assim, se uma chave vazar, o estrago é de um cliente só, o limite diário dele já limita o abuso,
e dá para revogar sem afetar ninguém.

Guarde a chave de forma que não fique legível em texto puro no `.ini`.

## 5. O que enviar em `dados`

- **Só o relatório que está aberto na tela**, já filtrado e agregado como o usuário está vendo.
- Nunca a base inteira, nunca varredura de tabelas.
- Prefira JSON com nomes de campo legíveis: `{"formaPagamento":"PIX","valor":1234.56}` explica
  mais à IA do que `{"f1":"PIX","v":1234.56}`.
- Inclua os totais que aparecem na tela; sem eles a IA tende a recalcular e pode divergir do
  relatório impresso.
- Se o relatório tiver milhares de linhas, envie o agregado, não o analítico.

O Command Analytics **não guarda o conteúdo de `dados`**. Registra apenas: cliente, CNPJ,
relatório, período, a pergunta, o tamanho dos dados, os tokens e o tempo de resposta.

## 6. Interface — mesmo padrão visual do Analytics

### Botão flutuante ("bolinha")

- Círculo de **56×56 px**, cantos totalmente arredondados, sombra forte.
- Fundo em gradiente diagonal (135°): `#0668E1` → `#0084FF` (55%) → `#00C6FF`.
- Ícone branco de brilho/estrela (✨) quando fechado; **X** quando aberto.
- Posição inicial: **canto inferior direito**, 20 px da borda de baixo e da direita.
- Efeito de leve aumento ao passar o mouse.
- **Arrastável:** o usuário pode mover a bolinha para qualquer canto da tela.

### Comportamento do arrastar

- Arrasta com o botão esquerdo pressionado; o painel acompanha a nova posição.
- Diferenciar clique de arrasto: movimento menor que ~5 px é clique (abre/fecha), acima disso é
  arrasto e **não** deve abrir o painel ao soltar.
- Manter a bolinha dentro da área visível ao soltar e ao redimensionar a janela.
- **Gravar a posição** na configuração do usuário e restaurar na próxima abertura.
- O painel abre do lado que couber: se a bolinha estiver à direita, o painel abre alinhado à
  direita; se estiver à esquerda, alinhado à esquerda; acima ou abaixo conforme o espaço.

### Painel do chat

- **380 px de largura** (ou a largura da janela menos 40 px, o que for menor).
- **560 px de altura** (ou a altura da janela menos 128 px, o que for menor).
- Cantos arredondados (16 px), sombra forte, borda cinza-clara.
- Posicionado a ~96 px acima da borda inferior, alinhado com a bolinha.

**Cabeçalho** — mesmo gradiente da bolinha, texto branco, com ícone de brilho:

- Título: **Assistente Command Analytics** (ou o nome do ERP), 14 px, negrito.
- Subtítulo: *Explica os relatórios do sistema para você*, 11 px, branco a 80 %.

**Corpo** — rolagem vertical, 12 px de espaçamento.

Com a conversa vazia, mostrar *Experimente perguntar:* e 3 sugestões clicáveis em botões de
largura total, fundo cinza-claro, cantos arredondados, texto 12 px alinhado à esquerda.
Sugestões conforme o relatório aberto, por exemplo:

- "Resuma este relatório para mim"
- "O que mais chama atenção aqui?"
- "Como isso se compara com o período anterior?"

**Balões de mensagem** — largura máxima de 85 %, cantos arredondados (12 px), texto 14 px:

- do usuário: fundo **azul `#3B82F6`**, texto branco, alinhado à direita, canto inferior
  direito reto;
- da IA: fundo **cinza-claro `#F1F5F9`**, texto escuro, alinhado à esquerda, canto inferior
  esquerdo reto.

**Enquanto aguarda:** balão da IA com três pontos pulsando. Bloquear o envio nesse período.

**Rodapé** — campo de texto com placeholder *Digite sua pergunta…*, borda cinza, cantos
arredondados, e botão quadrado de 36×36 px com ícone de avião de papel, fundo azul `#3B82F6`,
desabilitado (50 % de opacidade) quando o campo está vazio ou há resposta em andamento.
**Enter** envia.

### Regras de uso

- O botão só aparece quando há um relatório na tela.
- A conversa pertence ao relatório aberto: ao trocar de relatório, começar conversa nova.
- Manter o histórico na memória durante a sessão; não é preciso persistir.
- O Analytics não guarda contexto entre chamadas — se quiser que a IA considere a pergunta
  anterior, inclua esse texto na nova `pergunta`.

## 7. Implementação em Delphi

- `TNetHTTPClient` + `TNetHTTPRequest`, ou `TIdHTTP` (Indy) com SSL.
- `Content-Type: application/json; charset=utf-8`; enviar o corpo em **UTF-8** — acento errado
  aqui estraga a resposta.
- Header customizado `X-API-Key`.
- **Chamar em thread separada**, nunca na thread da interface: são segundos de espera e a
  janela não pode congelar.
- Montar o JSON com `System.JSON` (`TJSONObject`), não por concatenação de strings — nome de
  cliente com aspas ou barra invertida quebra o JSON montado à mão.
- Tratar cada código de erro da tabela acima com mensagem própria; nada de "erro desconhecido".
- Registrar no log local: relatório, tempo de resposta e código HTTP, para dar suporte depois.

## 8. Critérios de aceite

1. Chamada com `cnpj`, `relatorio` e `dados` devolve explicação em português em até 15 s.
2. Sem `cnpj` nem `clienteNome`, retorna 400 — e o ERP nunca cai nesse caso.
3. Chave inválida ou limite atingido mostram mensagens distintas e compreensíveis.
4. A interface não congela durante a espera.
5. A bolinha é arrastável, respeita os limites da janela e **mantém a posição** entre sessões.
6. O painel abre do lado correto conforme a posição da bolinha.
7. Trocar de relatório limpa a conversa.
8. Acentuação correta no envio e na exibição.
