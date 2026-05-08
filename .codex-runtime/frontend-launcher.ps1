$ErrorActionPreference = 'Continue'
Set-Location 'C:/Projetos/dev/Command_Analytics'
npm.cmd run dev 1>> 'C:/Projetos/dev/Command_Analytics/.codex-runtime/frontend.out.log' 2>> 'C:/Projetos/dev/Command_Analytics/.codex-runtime/frontend.err.log'