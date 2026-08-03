const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://127.0.0.1:8000'

const TOKEN_KEY = 'agora_admin_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  errors: Record<string, string[]>

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

type RequestOptions = {
  method?: string
  body?: BodyInit | null
  json?: unknown
  formData?: FormData
  auth?: boolean
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.auth !== false) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let body = options.body ?? null
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  } else if (options.formData) {
    body = options.formData
  }

  const res = await fetch(`${API_URL}/api${path}`, {
    method: options.method || 'GET',
    headers,
    body,
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401 && options.auth !== false) {
      setToken(null)
    }
    throw new ApiError(
      res.status,
      data.message || data.error || `Ошибка ${res.status}`,
      data.errors || {},
    )
  }

  return data as T
}

export { API_URL }
