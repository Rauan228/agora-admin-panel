import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { SupplierAvatar } from '../components/SupplierAvatar'
import type { Paginated, Supplier } from '../types'

export function SuppliersPage() {
  const [data, setData] = useState<Paginated<Supplier> | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(page = 1) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (status) params.set('status', status)
      params.set('page', String(page))
      const res = await api<Paginated<Supplier>>(`/admin/suppliers?${params}`)
      setData(res)
    } catch {
      setError('Не удалось загрузить поставщиков')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    load(1)
  }

  async function onDelete(id: number, name: string) {
    if (!confirm(`Удалить поставщика «${name}»?`)) return
    await api(`/admin/suppliers/${id}`, { method: 'DELETE' })
    load(data?.meta.current_page || 1)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Поставщики</h1>
          <p className="text-sm text-slate-500">Справочник компаний</p>
        </div>
        <Link
          to="/suppliers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Добавить
        </Link>
      </div>

      <form onSubmit={onSearch} className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
        </select>
        <button type="submit" className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">
          Найти
        </button>
      </form>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {loading && <div className="text-sm text-slate-500">Загрузка…</div>}

      {!loading && data && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Лого</th>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">ИНН</th>
                <th className="px-4 py-3 font-medium">Города</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">
                    <SupplierAvatar name={s.commercial_name} url={s.logo_url} size={40} />
                  </td>
                  <td className="px-4 py-3 font-medium">{s.commercial_name}</td>
                  <td className="px-4 py-3">{s.inn}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {(s.shipping_cities || []).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {s.is_active ? 'Активен' : 'Скрыт'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/suppliers/${s.id}`} className="mr-3 text-slate-700 underline">
                      Изменить
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id, s.commercial_name)}
                      className="text-red-600 underline"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Пока нет поставщиков
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.last_page > 1 && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={data.meta.current_page <= 1}
            onClick={() => load(data.meta.current_page - 1)}
            className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-40"
          >
            Назад
          </button>
          <span className="px-2 py-1 text-sm text-slate-500">
            {data.meta.current_page} / {data.meta.last_page}
          </span>
          <button
            type="button"
            disabled={data.meta.current_page >= data.meta.last_page}
            onClick={() => load(data.meta.current_page + 1)}
            className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}
