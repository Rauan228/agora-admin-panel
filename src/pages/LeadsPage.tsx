import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, API_URL, getToken } from '../api/client'
import type { Paginated } from '../types'

type Lead = {
  id: number
  company_name: string
  phone: string | null
  email: string | null
  website: string | null
  city: string | null
  region: string | null
  inn: string | null
  contact_person: string | null
  category_slug: string | null
  source: string
  source_url: string | null
  call_status: string
  notes: string | null
  call_notes: string | null
  updated_at?: string
}

type Stats = {
  total: number
  by_status: Record<string, number>
  to_call_queue: number
  sources: string[]
  call_statuses: string[]
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Новый',
  to_call: 'К обзвону',
  no_answer: 'Не взяли',
  callback: 'Перезвонить',
  interested: 'Интерес',
  sent_kp: 'КП отправлено',
  onboarded: 'В каталоге',
  rejected: 'Отказ',
  wrong_number: 'Неверный номер',
  duplicate: 'Дубль',
}

export function LeadsPage() {
  const [data, setData] = useState<Paginated<Lead> | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load(page = 1) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (status) params.set('call_status', status)
      if (source) params.set('source', source)
      params.set('page', String(page))
      params.set('per_page', '30')
      const [list, st] = await Promise.all([
        api<Paginated<Lead>>(`/admin/leads?${params}`),
        api<Stats>('/admin/leads/stats'),
      ])
      setData(list)
      setStats(st)
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

  async function setCallStatus(id: number, call_status: string) {
    await api(`/admin/leads/${id}`, {
      method: 'PATCH',
      json: { call_status },
    })
    load(data?.meta.current_page || 1)
  }

  async function onImport(file: File | null) {
    if (!file) return
    setImportMsg(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('default_source', 'csv')
    fd.append('default_category_slug', 'corrugated-boxes')
    fd.append('default_region', 'Москва')
    fd.append('skip_duplicates', '1')
    try {
      const res = await api<{ created: number; skipped: number; errors: string[] }>(
        '/admin/leads/import',
        { method: 'POST', formData: fd },
      )
      setImportMsg(
        `Импорт: создано ${res.created}, пропущено ${res.skipped}` +
          (res.errors?.length ? `. Ошибки: ${res.errors.slice(0, 3).join('; ')}` : ''),
      )
      load(1)
    } catch {
      setImportMsg('Ошибка импорта. Проверь CSV (нужен заголовок company_name).')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadTemplate() {
    const token = getToken()
    fetch(`${API_URL}/api/admin/leads/import-template`, {
      headers: { Authorization: `Bearer ${token || ''}`, Accept: 'text/csv' },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'leads_import_template.csv'
        a.click()
      })
      .catch(() => {})
  }


  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Лиды / обзвон</h1>
          <p className="text-sm text-slate-500">
            Источник → карточка → статусы звонка. Импорт CSV (Контур/Excel), без парсинга карт.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          >
            Шаблон CSV
          </button>
          <label className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50">
            Импорт CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => onImport(e.target.files?.[0] || null)}
            />
          </label>
          <Link
            to="/leads/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            + Лид
          </Link>
        </div>
      </div>

      {stats && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-white">
            Всего {stats.total}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
            В очереди {stats.to_call_queue}
          </span>
          {Object.entries(stats.by_status || {}).map(([k, v]) => (
            <span key={k} className="rounded-full border bg-white px-3 py-1 text-slate-600">
              {STATUS_LABEL[k] || k}: {v}
            </span>
          ))}
        </div>
      )}

      {importMsg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {importMsg}
        </div>
      )}

      <form onSubmit={onSearch} className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск: компания, телефон, ИНН…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Все статусы</option>
          {(stats?.call_statuses || Object.keys(STATUS_LABEL)).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] || s}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Все источники</option>
          {(stats?.sources || []).map((s) => (
            <option key={s} value={s}>
              {s}
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
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Компания</th>
                <th className="px-3 py-3 font-medium">Телефон</th>
                <th className="px-3 py-3 font-medium">Регион</th>
                <th className="px-3 py-3 font-medium">Источник</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">Быстрый статус</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td className="px-3 py-3">
                    <div className="font-medium">{lead.company_name}</div>
                    {lead.contact_person && (
                      <div className="text-xs text-slate-500">{lead.contact_person}</div>
                    )}
                    {lead.website && (
                      <a
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-500 underline"
                      >
                        сайт
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="font-medium underline">
                        {lead.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                    {lead.inn && <div className="text-xs text-slate-400">ИНН {lead.inn}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {lead.city || lead.region || '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-slate-500">{lead.source}</span>
                    {lead.source_url && (
                      <div>
                        <a
                          href={lead.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          ссылка
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {STATUS_LABEL[lead.call_status] || lead.call_status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="max-w-[140px] rounded border px-1 py-1 text-xs"
                      value={lead.call_status}
                      onChange={(e) => setCallStatus(lead.id, e.target.value)}
                    >
                      {Object.keys(STATUS_LABEL).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link to={`/leads/${lead.id}`} className="underline">
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Лидов нет — добавь вручную или импортируй CSV
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
