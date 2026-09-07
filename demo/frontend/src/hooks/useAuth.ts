import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { api } from '../api/client'

export interface AuthUser { id: number; username: string; nombre: string; rol: string }

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  loginUser: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  loginUser: async () => {},
  logout: async () => {},
})

export function useAuth() { return useContext(AuthContext) }

export function useAuthProvider(): AuthCtx {
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Verificar sesión activa al montar
  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Login: llama a la API y actualiza el estado directamente — sin recargar la página
  const loginUser = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password) as AuthUser
    setUser(data)
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  return { user, loading, loginUser, logout }
}
