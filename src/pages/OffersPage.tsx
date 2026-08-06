import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { SupplierAvatar } from '../components/SupplierAvatar'
import type { Category, Offer, Paginated } from '../types'

export function OffersPage() {
  const [data, setData] = useState<Paginated<Offer> | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(page = 1) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (categoryId) params.set('category_id', categoryId)
      params.set('page', String(page))
      const res = await api<Paginated<Offer>>(`/admin/offers?${params}`)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api<{ data: Category[] }>('/admin/meta/categories').then((r) => setCategories(r.data))
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    load(1)
  }

  async function onDelete(id: number, title: string) {
    if (!confirm(`Удалить оффер «${title}»?`)) return
    await api(`/admin/offers/${id}`, { method: 'DELETE' })
    load(data?.meta.current_page || 1)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Офферы</h1>
          <p className="text-sm text-slate-500">SKU поставщиков — сравнение по цене, MOQ, наличию</p>
        </div>
        <Link
          to="/offers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Новый оффер
        </Link>
      </div>

      <form onSubmit={onSearch} className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border bg-white px-4 py-2 text-sm">
          Найти
        </button>
      </form>

      {loading && <div className="text-sm text-slate-500">Загрузка…</div>}

      {!loading && data && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Оффер</th>
                <th className="px-4 py-3 font-medium">Категория</th>
                <th className="px-4 py-3 font-medium">Поставщик</th>
                <th className="px-4 py-3 font-medium">Цена</th>
                <th className="px-4 py-3 font-medium">MOQ</th>
                <th className="px-4 py-3 font-medium">Наличие</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{o.offer_title}</td>
                  <td className="px-4 py-3 text-slate-600">{o.category?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-2">
                      <SupplierAvatar
                        name={o.supplier?.commercial_name || '?'}
                        url={o.supplier?.logo_url}
                        size={28}
                      />
                      <span>{o.supplier?.commercial_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {o.price_value} {o.currency}
                    <span className="text-slate-400"> / {o.price_basis}</span>
                  </td>
                  <td className="px-4 py-3">{o.moq_value}</td>
                  <td className="px-4 py-3">{o.stock_status}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link to={`/offers/${o.id}`} className="mr-3 underline">
                      Изменить
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDelete(o.id, o.offer_title)}
                      className="text-red-600 underline"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Офферов пока нет — создайте первый
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
