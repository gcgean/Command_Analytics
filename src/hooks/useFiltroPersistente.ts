import { useEffect, useState } from 'react'

/**
 * useState que lembra o valor no localStorage — pra filtro de tela sobreviver quando o usuário
 * navega pra outro lugar e volta. Se o localStorage estiver indisponível (aba anônima, storage
 * bloqueado), cai no valor inicial e a tela continua funcionando, só sem persistir.
 */
export function useFiltroPersistente<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const salvo = localStorage.getItem(chave)
      return salvo === null ? inicial : (JSON.parse(salvo) as T)
    } catch {
      return inicial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      /* ignora — só deixa de persistir */
    }
  }, [chave, valor])

  return [valor, setValor] as const
}
