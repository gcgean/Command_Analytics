import path from 'node:path'
import dotenv from 'dotenv'

// Carrega o .env por caminho absoluto (relativo a este arquivo), não pelo diretório de execução
// do processo — PM2 pode rodar o script com um cwd diferente de backend/, e nesse caso
// dotenv.config() sem "path" simplesmente não encontra o arquivo e falha em silêncio.
dotenv.config({ path: path.join(__dirname, '..', '.env') })
