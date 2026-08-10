import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'

const SOURCES = [
  'manual',
  'csv',
  'kontur',
  'website',
  'maps_manual',
  'ads_manual',
  'other',
] as const

const STATUSES = [
  'new',
  'to_call',
  'no_answer',
  'callback',
  'interested',
  'sent_kp',
  'onboarded',
  'rejected',
  'wrong_number',
  'duplicate',
] as const

const empty = {
  company_name: '',
  phone: '',
  phone_extra: '',
  email: '',
  website: '',
  city: '',
  region: 'Москва',
  inn: '',
  contact_person: '',
  category_slug: 'corrugated-boxes',
  source: 'manual',
  source_url: '',
  source_query: '',
  call_status: 'new',
  notes: '',
  call_notes: '',
}

export function LeadFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    api<{ data: typeof empty & { id: number } }>(`/admin/leads/${id}`)
      .then((res) => {
        const L = res.data as Record<string, unknown>
        setForm({
          company_name: String(L.company_name || ''),
          phone: String(L.phone || ''),
          phone_extra: String(L.phone_extra || ''),
          email: String(L.email || ''),
          website: String(L.website || ''),
          city: String(L.city || ''),
          region: String(L.region || 'Москва'),
          inn: String(L.inn || ''),
          contact_person: String(L.contact_person || ''),
          category_slug: String(L.category_slug || 'corrugated-boxes'),
          source: String(L.source || 'manual'),
          source_url: String(L.source_url || ''),
          source_query: String(L.source_query || ''),
          call_status: String(L.call_status || 'new'),
          notes: String(L.notes || ''),
          call_notes: String(L.call_notes || ''),
        })
      })
      .finally(() => setLoading(false))
  }, [id])

  function setField(key: keyof typeof empty, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const body = { ...form }
      if (isEdit) {
        await api(`/admin/leads/${id}`, { method: 'PATCH', json: body })
      } else {
        await api('/admin/leads', { method: 'POST', json: body })
      }
      navigate('/leads')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Загрузка…</div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/leads" className="text-sm text-slate-500 hover:underline">
          ← К списку
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {isEdit ? 'Карточка лида' : 'Новый лид'}
        </h1>
        <p className="text-sm text-slate-500">
          Нашёл в картах/на сайте — вставь ссылку в source_url, source = maps_manual или ads_manual.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-6">
        {Object.keys(errors).length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <ul className="list-inside list-disc">
              {Object.entries(errors).flatMap(([k, msgs]) =>
                msgs.map((m) => (
                  <li key={`${k}-${m}`}>
                    {k}: {m}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Компания *</span>
            <input
              required
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Телефон</span>
            <input
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="+7 …"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Телефон доп.</span>
            <input
              value={form.phone_extra}
              onChange={(e) => setField('phone_extra', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Сайт</span>
            <input
              value={form.website}
              onChange={(e) => setField('website', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Город</span>
            <input
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Регион</span>
            <input
              value={form.region}
              onChange={(e) => setField('region', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">ИНН</span>
            <input
              value={form.inn}
              onChange={(e) => setField('inn', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Контакт</span>
            <input
              value={form.contact_person}
              onChange={(e) => setField('contact_person', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Категория (slug)</span>
            <input
              value={form.category_slug}
              onChange={(e) => setField('category_slug', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Источник</span>
            <select
              value={form.source}
              onChange={(e) => setField('source', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Статус обзвона</span>
            <select
              value={form.call_status}
              onChange={(e) => setField('call_status', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Ссылка на источник</span>
            <input
              value={form.source_url}
              onChange={(e) => setField('source_url', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="https://… 2gis / yandex / сайт"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Поисковый запрос</span>
            <input
              value={form.source_query}
              onChange={(e) => setField('source_query', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="купить гофрокоробки оптом Москва"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Заметки</span>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={2}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Заметки по звонку</span>
            <textarea
              value={form.call_notes}
              onChange={(e) => setField('call_notes', e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Что сказали, когда перезвонить…"
            />
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <Link to="/leads" className="rounded-lg border px-4 py-2 text-sm">
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
