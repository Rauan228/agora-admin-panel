import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

type Row = {
  id: string
  status: string
  created_at: string | null
  updated_at: string | null
  messages_count: number
  tokens_in: number
  tokens_out: number
  llm_calls: number
  cost_usd: number
  cost_rub: number
  last_user_message: string | null
  query_preview: string
}

type Meta = { current_page: number; last_page: number; total: number }

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AiSessionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<Meta>({ current_page: 1, last_page: 1, total: 0 })
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (page = 1, st = status) => {
    setLoading(true)
    setErr(null)
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: '30' })
      if (st) qs.set('status', st)
      const res = await api<{ data: Row[]; meta: Meta }>(`/admin/ai/sessions?${qs}`)
      setRows(res.data)
      setMeta(res.meta)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить сессии')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load(1, status)
  }, [load, status])

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="dash-eyebrow">ИИ</p>
          <h1 className="dash-h1">Чаты и сессии</h1>
          <p className="dash-sub">Все диалоги подбора. Откройте строку, чтобы прочитать переписку.</p>
        </div>
        <Link to="/ai" className="dash-refresh">
          Новый тест
        </Link>
      </header>

      {err ? <div className="dash-banner dash-banner-err">{err}</div> : null}

      <div className="dash-period" style={{ marginBottom: '0.75rem' }}>
        {['', 'active', 'closed'].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={status === s ? 'is-on' : ''}
            onClick={() => setStatus(s)}
          >
            {s === '' ? 'все' : s}
          </button>
        ))}
      </div>

      <div className="dash-panel dash-panel-table">
        <table className="dash-table dash-table-wide">
          <thead>
            <tr>
              <th>Обновлён</th>
              <th>Статус</th>
              <th>Последняя реплика</th>
              <th>Запрос</th>
              <th>Msg</th>
              <th>₽</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmt(r.updated_at)}</td>
                <td>
                  <span className={`dash-st dash-st-${r.status}`}>{r.status}</span>
                </td>
                <td className="dash-clip" title={r.last_user_message ?? ''}>
                  <Link to={`/ai/sessions/${r.id}`} className="sess-link">
                    {r.last_user_message || '— пустой чат'}
                  </Link>
                </td>
                <td className="dash-clip" title={r.query_preview}>
                  {r.query_preview}
                </td>
                <td>{r.messages_count}</td>
                <td className="nowrap">{r.cost_rub ? `${r.cost_rub.toFixed(2)} ₽` : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="dash-empty">
                  Сессий пока нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="dash-pager">
          <span>
            {meta.total} сессий · стр. {meta.current_page}/{meta.last_page}
          </span>
          <div>
            <button
              type="button"
              disabled={meta.current_page <= 1}
              onClick={() => void load(meta.current_page - 1)}
            >
              ←
            </button>
            <button
              type="button"
              disabled={meta.current_page >= meta.last_page}
              onClick={() => void load(meta.current_page + 1)}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
