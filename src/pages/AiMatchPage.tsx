import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, API_URL } from '../api/client'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

type MatchedOffer = {
  id: number
  offer_title: string
  sku?: string | null
  price_value: number | null
  price_hidden?: boolean
  currency: string
  price_basis: string
  moq_value: number
  stock_status: string
  match_score?: number
  match_reasons?: string[]
  photo_url?: string | null
  supplier?: { id: number; commercial_name: string; logo_url?: string | null }
  category?: { id: number; slug: string; name: string }
  specs?: Record<string, string | number | boolean>
}

type ComparisonRow = {
  offer_id: number
  title: string
  supplier?: string
  price: number | null
  currency: string
  moq: number
  lead_days?: number
  box_type?: string | null
  size_mm?: string | null
  board_grade?: string | null
  match_score: number
}

type SessionCreate = {
  session_id: string
  welcome: string
  suggested_replies: string[]
}

type MessageResponse = {
  session_id: string
  assistant_message: string
  structured_query: Record<string, unknown>
  intent_source?: string
  offers: MatchedOffer[]
  suppliers: { id: number; commercial_name: string; logo_url?: string | null; best_match_score?: number }[]
  comparison: { dimensions: string[]; rows: ComparisonRow[] }
  suggested_replies: string[]
  cta?: { type: string; label: string; prefill?: { brief?: string } }
}

const PRESETS = [
  'Самосбор 400×300×200, бурый, Москва, 5000 шт',
  'Гофрокороб 400x300x200 четырёхклапанный Т-23',
  'Гофролист Т-23 оптом Москва',
  'Стрейч плёнка 500 мм',
  'Сравни топ-3',
  'Покажи дешевле',
]

function formatPrice(o: MatchedOffer): string {
  if (o.price_hidden || o.price_value == null) return 'по запросу'
  return `${o.price_value} ${o.currency}/${o.price_basis}`
}

function renderMdLite(text: string) {
  // very light **bold** + newlines
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

export function AiMatchPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [chips, setChips] = useState<string[]>(PRESETS)
  const [offers, setOffers] = useState<MatchedOffer[]>([])
  const [comparison, setComparison] = useState<ComparisonRow[]>([])
  const [query, setQuery] = useState<Record<string, unknown> | null>(null)
  const [intentSource, setIntentSource] = useState<string | null>(null)
  const [brief, setBrief] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [handoffContact, setHandoffContact] = useState('')
  const [handoffNote, setHandoffNote] = useState('')
  const [handoffOk, setHandoffOk] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function boot() {
    setBooting(true)
    setError(null)
    setHandoffOk(null)
    setOffers([])
    setComparison([])
    setQuery(null)
    setBrief(null)
    setIntentSource(null)
    try {
      const res = await api<SessionCreate>('/ai/sessions', {
        method: 'POST',
        json: {},
        auth: false,
      })
      setSessionId(res.session_id)
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: res.welcome || 'Опишите задачу по упаковке — подберу офферы из каталога.',
        },
      ])
      setChips(res.suggested_replies?.length ? res.suggested_replies : PRESETS)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать AI-сессию')
    } finally {
      setBooting(false)
    }
  }

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || !sessionId || loading) return
    setError(null)
    setHandoffOk(null)
    setInput('')
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await api<MessageResponse>(`/ai/sessions/${sessionId}/messages`, {
        method: 'POST',
        json: { message: msg },
        auth: false,
      })
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'assistant', content: res.assistant_message },
      ])
      setOffers(res.offers || [])
      setComparison(res.comparison?.rows || [])
      setQuery(res.structured_query || null)
      setIntentSource(res.intent_source || null)
      setBrief(res.cta?.prefill?.brief || null)
      if (res.suggested_replies?.length) setChips(res.suggested_replies)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка AI-запроса')
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: 'system',
          content: 'Не удалось получить ответ. Проверьте API и наличие офферов в каталоге.',
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  async function handoff() {
    if (!sessionId) return
    setError(null)
    try {
      const res = await api<{ ok: boolean; brief?: string; status: string }>(
        `/ai/sessions/${sessionId}/handoff`,
        {
          method: 'POST',
          json: { contact: handoffContact || null, note: handoffNote || null },
          auth: false,
        },
      )
      setHandoffOk(`Статус: ${res.status}. Бриф сохранён в сессии.`)
      if (res.brief) setBrief(res.brief)
      setMessages((m) => [
        ...m,
        {
          id: `h-${Date.now()}`,
          role: 'system',
          content: 'Заявка передана менеджеру (handoff).',
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Handoff failed')
    }
  }

  return (
    <div className="ai-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI-подбор (тест)</h1>
          <p className="text-sm text-slate-500">
            Каталог-заземлённый чат. API: <code className="text-xs">{API_URL}/api/ai/…</code>
            {sessionId ? (
              <>
                {' '}
                · session <code className="text-xs">{sessionId.slice(0, 8)}…</code>
              </>
            ) : null}
            {intentSource ? <> · intent: <strong>{intentSource}</strong></> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void boot()}
          disabled={booting || loading}
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Новая сессия
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {handoffOk ? (
        <div className="mb-4 rounded-lg border bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {handoffOk}
        </div>
      ) : null}

      <div className="ai-grid">
        {/* Chat */}
        <section className="ai-panel flex flex-col">
          <div className="border-b px-4 py-3 text-sm font-semibold">Чат</div>
          <div className="ai-chat-scroll flex-1 space-y-3 p-4">
            {booting ? (
              <p className="text-sm text-slate-500">Создаём сессию…</p>
            ) : (
              messages.map((m) => (
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
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    {m.role === 'user' ? 'вы' : m.role === 'assistant' ? 'agora ai' : 'system'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{renderMdLite(m.content)}</div>
                </div>
              ))
            )}
            {loading ? (
              <div className="ai-bubble ai-bubble-assistant text-sm text-slate-500">Думаю…</div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t p-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={loading || !sessionId}
                  onClick={() => void send(c)}
                  className="rounded-full border bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {c}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Опишите задачу… Enter — отправить, Shift+Enter — новая строка"
                className="flex-1 resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                disabled={!sessionId || loading}
              />
              <button
                type="submit"
                disabled={!sessionId || loading || !input.trim()}
                className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Отправить
              </button>
            </form>
          </div>
        </section>

        {/* Results */}
        <section className="ai-panel flex flex-col min-w-0">
          <div className="border-b px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Shortlist ({offers.length})</span>
            {offers.length > 0 ? (
              <span className="text-xs text-slate-500">score ↓</span>
            ) : null}
          </div>

          <div className="ai-chat-scroll flex-1 p-4 space-y-3">
            {offers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Здесь появятся офферы после сообщения. Попробуйте чип «Самосбор 400×300×200…».
              </p>
            ) : (
              offers.map((o) => (
                <article key={o.id} className="rounded-xl border bg-white p-3 shadow-sm">
                  <div className="flex gap-3">
                    <div className="ai-thumb shrink-0">
                      {o.photo_url ? (
                        <img src={o.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-slate-400">no photo</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug">{o.offer_title}</h3>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {o.match_score ?? '—'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {o.supplier?.commercial_name || 'Поставщик'}
                        {o.category ? ` · ${o.category.name}` : ''}
                        {o.sku ? ` · ${o.sku}` : ''}
                      </p>
                      <p className="mt-1 text-sm">
                        <strong>{formatPrice(o)}</strong>
                        <span className="text-slate-500"> · MOQ {o.moq_value}</span>
                        <span className="text-slate-500"> · {o.stock_status}</span>
                      </p>
                      {o.match_reasons && o.match_reasons.length > 0 ? (
                        <ul className="mt-2 text-xs text-slate-600 list-disc list-inside">
                          {o.match_reasons.slice(0, 4).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}

            {comparison.length > 0 ? (
              <div className="mt-2">
                <h3 className="mb-2 text-sm font-semibold">Сравнение</h3>
                <div className="overflow-x-auto rounded-lg border bg-white">
                  <table className="ai-table text-xs">
                    <thead>
                      <tr>
                        <th>Оффер</th>
                        <th>Поставщик</th>
                        <th>Цена</th>
                        <th>MOQ</th>
                        <th>Размер</th>
                        <th>Тип</th>
                        <th>Марка</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((r) => (
                        <tr key={r.offer_id}>
                          <td className="max-w-[160px] truncate" title={r.title}>
                            {r.title}
                          </td>
                          <td>{r.supplier || '—'}</td>
                          <td>
                            {r.price == null ? 'запрос' : `${r.price} ${r.currency}`}
                          </td>
                          <td>{r.moq}</td>
                          <td>{r.size_mm || '—'}</td>
                          <td>{r.box_type || '—'}</td>
                          <td>{r.board_grade || '—'}</td>
                          <td>
                            <strong>{r.match_score}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {query ? (
              <details className="rounded-lg border bg-slate-50 p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  StructuredQuery (debug)
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">
                  {JSON.stringify(query, null, 2)}
                </pre>
              </details>
            ) : null}

            {brief ? (
              <details className="rounded-lg border bg-amber-50 p-3 text-xs" open>
                <summary className="cursor-pointer font-semibold text-amber-800">
                  Бриф для менеджера
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-amber-800">{brief}</pre>
              </details>
            ) : null}

            <div className="rounded-xl border bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold">Handoff менеджеру</h3>
              <div className="flex flex-col gap-2">
                <input
                  value={handoffContact}
                  onChange={(e) => setHandoffContact(e.target.value)}
                  placeholder="Контакт (телефон / email)"
                  className="rounded-lg border px-3 py-2 text-sm"
                />
                <input
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="Заметка"
                  className="rounded-lg border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handoff()}
                  disabled={!sessionId || loading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Передать менеджеру
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
