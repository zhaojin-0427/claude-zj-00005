import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gym_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // 客户端本地墙钟时间(无时区后缀), 供后端做开课/结课时间校验
  config.headers['X-Client-Time'] = localNowIso()
  return config
})

/** 本地时区的 naive ISO 串(不带 Z), 与后端墙钟时间存储口径一致。 */
export function localNowIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('gym_token')
      if (!location.pathname.endsWith('/login')) location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export function errText(e: unknown): string {
  const detail = (e as any)?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg).join('；')
  return '请求失败，请稍后重试'
}
