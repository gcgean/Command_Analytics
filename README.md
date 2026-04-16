# Command Analytics

Sistema web de operação interna com:

- Frontend: React + TypeScript + Vite
- Backend: Fastify + Prisma + MySQL

## Regras operacionais do projeto

As instruções permanentes para comportamento de implementação e segurança estão em:

- [AGENTS.md](/C:/Projetos%20Web/Command_Analytics/AGENTS.md)

Esse arquivo define, entre outros pontos:

- fluxo de comunicação com resumo de impacto antes da execução;
- bloqueio de alteração em arquivo read-only;
- preservação obrigatória de encoding;
- prioridade de estabilidade e mudanças incrementais;
- validação de consistência antes de concluir.

## Observação

Se você usar skills locais, mantenha-as em `.agents/skills` para especializações por contexto, e deixe regras globais em `AGENTS.md`.
