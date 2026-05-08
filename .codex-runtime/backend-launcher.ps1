$ErrorActionPreference = 'Continue'
Set-Location 'C:/Projetos/dev/Command_Analytics/backend'
npm.cmd run dev 1>> 'C:/Projetos/dev/Command_Analytics/.codex-runtime/backend.out.log' 2>> 'C:/Projetos/dev/Command_Analytics/.codex-runtime/backend.err.log'