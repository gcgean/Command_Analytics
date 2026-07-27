import { createSigner } from 'fast-jwt'
console.log(createSigner({key:process.env.JWT_SECRET||'command-analytics-secret-2026-troque-em-producao',expiresIn:3600000})({id:1}))
