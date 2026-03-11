/**
 * lib/api.ts — Cliente HTTP centralizado (Axios)
 *
 * Por que centralizar?
 * - Adiciona automaticamente o token JWT em todas as requisições
 * - Trata erros 401 (token expirado) em um só lugar
 * - Define a URL base da API uma vez (via variável de ambiente)
 *
 * Como usar:
 *   import api from '@/lib/api'
 *   const data = await api.get('/findings')
 */
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor de REQUEST — adiciona o JWT em todo request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de RESPONSE — 401 ignorado (auth desativado temporariamente)
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
)

export default api
