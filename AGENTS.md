# AGENTS.md

## Fluxo de comunicação e aprovação

- Antes de executar qualquer mudança, sempre informar **quais telas, componentes, rotas, serviços, queries, migrations e arquivos** serão impactados.
- Descrever de forma objetiva **o que será feito em cada parte**.
- Após o resumo de impacto, **aguardar o aval** antes de alterar código, banco ou configuração.
- Manter comunicação em **pt-BR**, prática e direta.

## Segurança de arquivos

- **Nunca alterar arquivo read-only.**
- Se qualquer arquivo estiver bloqueado, sem permissão de escrita ou protegido, interromper e informar exatamente qual arquivo está impedido.
- Não usar workaround forçado para burlar bloqueio.

## Encoding e integridade de texto

- Preservar o **encoding original** do arquivo ao ler/escrever.
- Não converter encoding sem pedido explícito.
- Ter atenção especial com acentuação, JSON, SQL, arquivos de configuração e textos persistidos em banco.
- Se houver risco de corromper encoding, parar e explicar o risco antes de salvar.

## Prioridades do projeto

- Projeto de produção contínua (frontend React + TypeScript + Vite; backend Fastify + Prisma + MySQL).
- Estabilidade, previsibilidade e compatibilidade têm prioridade sobre refatorações amplas.
- Integridade de dados e rastreabilidade de auditoria são prioridade.
- Preferir mudanças pequenas, claras e reversíveis.

## Continuidade de padrões existentes

Antes de implementar:

1. Analisar convenções de nomes.
2. Analisar padrão de páginas/componentes/hooks.
3. Analisar padrão de rotas e serviços backend.
4. Analisar padrão de queries SQL/Prisma e auditoria.
5. Reutilizar o padrão já existente no módulo.

- Evitar introduzir estilo arquitetural que conflite com o código atual.
- Consistência com a base existente > “melhor prática” teórica isolada.
- Só propor refatoração estrutural quando solicitado.

## Disciplina de implementação

- Primeiro procurar referência semelhante no próprio projeto.
- Reutilizar componentes/utilitários já existentes sempre que possível.
- Evitar lógica de negócio pesada no frontend; preferir backend/serviços.
- Ao alterar filtros, status e regras de negócio, garantir compatibilidade com dados legados.
- Mudanças em banco devem ser seguras para rollback.

## Gate de qualidade antes de finalizar

Validar internamente:

- consistência arquitetural com o módulo;
- segurança de permissão/read-only;
- preservação de encoding;
- impacto em fluxos existentes;
- efeitos colaterais em auditoria/logs;
- risco de regressão em telas relacionadas.
