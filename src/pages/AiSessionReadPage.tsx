import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'

type Msg = {
  id: number
  role: 'user' | 'assistant' | 'system' | string
  content: string
  created_at: string | null
}

type Understood = { key: string; label: string; value: string }

type SessionRead = {
  session_id: string
  status: string
  understood?: Understood[]
  messages: Msg[]
  session_cost?: { cost_usd?: number; cost_rub_approx?: number; llm_calls?: number }
  order_plan?: { pack?: { label?: string | null; saves_rfqs?: boolean }; recommended?: { supplier_name?: string } }
}

export function AiSessionReadPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<SessionRead | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancel = false
    api<SessionRead>(`/admin/ai/sessions/${id}`)
      .then((res) => {
        if (!cancel) setData(res)
      })
      .catch((e) => {
        if (!cancel) setErr(e instanceof ApiError ? e.message : 'Сессия не найдена')
      })
    return () => {
      cancel = true
    }
  }, [id])

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="dash-eyebrow">
            <Link to="/ai/sessions" className="sess-link">
              ← все чаты
            </Link>
          </p>
          <h1 className="dash-h1">Переписка</h1>
          <p className="dash-sub">
            {data ? (
              <>
                статус <strong>{data.status}</strong>
                {data.session_cost?.cost_rub_approx != null
                  ? ` · ≈ ${data.session_cost.cost_rub_approx} ₽`
                  : ''}
                {data.session_cost?.llm_calls != null ? ` · ${data.session_cost.llm_calls} LLM` : ''}
              </>
            ) : (
              'загружаю…'
            )}
          </p>
        </div>
      </header>

      {err ? <div className="dash-banner dash-banner-err">{err}</div> : null}

      {data?.understood && data.understood.length > 0 ? (
        <div className="ai-understood" style={{ marginBottom: '1rem' }}>
          <div className="ai-understood-head">
            <span className="ai-understood-title">Контекст сессии</span>
          </div>
          <div className="ai-understood-tags">
            {data.understood.map((u) => (
              <span key={u.key} className="ai-tag">
                <span className="ai-tag-label">{u.label}</span>
                <span className="ai-tag-value">{u.value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sess-thread">
        {(data?.messages ?? []).map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'ai-bubble ai-bubble-user'
                : m.role === 'system'
                  ? 'ai-bubble ai-bubble-system'
                  : 'ai-bubble ai-bubble-assistant'
            }
          >
            <div className="ai-bubble-role">
              {m.role === 'user' ? 'Покупатель' : m.role === 'assistant' ? 'Agora AI' : 'Система'}
              {m.created_at ? (
                <span className="sess-time">
                  {' '}
                  {new Date(m.created_at).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
            <div className="ai-bubble-body">{m.content}</div>
          </div>
        ))}
        {data && data.messages.length === 0 ? <p className="dash-empty">В этой сессии ещё нет сообщений.</p> : null}
      </div>
    </div>
  )
}
