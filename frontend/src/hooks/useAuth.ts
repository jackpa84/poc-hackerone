'use client'
/**
 * hooks/useAuth.ts — Estado global de autenticação
 *
 * Gerencia login, registro, logout e o usuário atual.
 * Usa localStorage para persistir o token entre recargas de página.
 */
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { User, TokenResponse } from '@/types/api'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const register = async (email: string, username: string, password: string) => {
    const { data } = await api.post<TokenResponse>('/auth/register', { email, username, password })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    window.location.href = '/login'
  }

  return { user, loading, login, register, logout }
}
