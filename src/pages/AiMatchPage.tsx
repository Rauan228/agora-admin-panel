import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, API_URL, ApiError, getToken } from '../api/client'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
}

type MatchTier = 'exact' | 'close' | 'weak' | 'fallback' | 'unknown'

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
  production_lead_days?: number | null
  delivery_lead_days?: number | null
  match_score?: number
  match_tier?: MatchTier
  match_reasons?: string[]
  match_gaps?: string[]
  line_slug?: string
  in_recommended_bundle?: boolean
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
  price_basis?: string
  moq: number
  lead_days?: number | null
  box_type?: string | null
  size_mm?: string | null
  board_grade?: string | null
  match_score: number
  match_tier?: MatchTier
}

type Understood = {
  key: string
  label: string
  value: string
  /** Query keys to clear when this chip is removed. */
  fields?: string[]
  removable?: boolean
}

type TurnInfo = {
  kind?: string | null
  added_fields?: string[]
  dropped_fields?: string[]
  switched_from?: string[]
  searched?: boolean
}

type CatalogStats = {
  active_offers: number
  active_suppliers: number
  categories?: Record<string, number>
  is_thin?: boolean
  llm_enabled?: boolean
}

type MatchStats = {
  active_offers_total?: number
  offers_in_requested_category?: number
  scored_candidates?: number
  returned?: number
  relaxed?: string | null
  exact_count?: number
  top_score?: number
  sorted_by?: string
}

type CostCall = {
  label: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  estimated?: boolean
  model?: string
}

type TurnCost = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
  cost_rub_approx?: number
  estimated?: boolean
  llm_calls?: number
  calls?: CostCall[]
  match_search_usd?: number
  match_search_note?: string
  rates?: { input_per_mtok: number; output_per_mtok: number; usd_to_rub?: number }
}

type SessionCost = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
  cost_rub_approx?: number
  llm_calls: number
  user_messages?: number
  messages_with_llm?: number
}

type BundleLine = {
  slug: string
  name: string
  covered: boolean
  offer: MatchedOffer | null
}

type Bundle = {
  kind: 'full_cover' | 'partial' | string
  supplier_id: number
  supplier_name: string
  logo_url?: string | null
  covers: number
  needed: number
  coverage_pct: number
  min_score: number
  avg_score: number
  weak_line?: boolean
  label: string
  reason: string
  lines: BundleLine[]
}

type OrderPlan = {
  multi: boolean
  needed?: number
  full_cover_count?: number
  recommended?: Bundle | null
  bundles?: Bundle[]
  split?: {
    supplier_count: number
    extra_rfqs: number
    lines: { slug: string; name: string; supplier_name?: string | null; score?: number | null }[]
  } | null
}

type SessionCreate = {
  session_id: string
  welcome: string
  catalog?: CatalogStats
  suggested_replies: string[]
  session_cost?: SessionCost
  cost_rates?: { input_per_mtok: number; output_per_mtok: number; model?: string; usd_to_rub?: number }
}

type MessageResponse = {
  session_id: string
  assistant_message: string
  structured_query: Record<string, unknown>
  understood?: Understood[]
  intent_source?: string
  catalog_stats?: MatchStats
  offers: MatchedOffer[]
  suppliers: { id: number; commercial_name: string; logo_url?: string | null; best_match_score?: number }[]
  comparison: { dimensions: string[]; rows: ComparisonRow[] }
  suggested_replies: string[]
  turn?: TurnInfo
  cta?: { type: string; label: string; prefill?: { brief?: string } }
  /** Admin-only — never on public storefront API */
  cost?: TurnCost
  session_cost?: SessionCost
  order_plan?: OrderPlan
}

const AI_BASE = '/admin/ai'
const SESSION_KEY = 'agora_admin_ai_session'

/** Entry scenarios — always available, never overwritten by the model. */
const SCENARIOS = [
  { label: 'Короба для e-com', text: 'Нужны гофрокороба для отправок на маркетплейсы, Москва' },
  { label: 'Самосбор 400×300×200', text: 'Самосборные короба 400×300×200 мм, бурые, 5000 шт/мес, Москва' },
  { label: 'Гофролист оптом', text: 'Гофролист Т-23 оптом, Москва' },
  { label: 'Короб и лист', text: 'Мне нужен гофрокороб и гофролист, Москва' },
  { label: 'Срочно 1000 шт', text: 'Срочно нужно 1000 коробок в Москву, за 5 дней' },
  { label: 'С печатью логотипа', text: 'Короба с печатью логотипа в 1 цвет, 3000 шт' },
]

const TIER_META: Record<MatchTier, { label: string; className: string }> = {
  exact: { label: 'точное совпадение', className: 'ai-tier ai-tier-exact' },
  close: { label: 'близкий вариант', className: 'ai-tier ai-tier-close' },
  weak: { label: 'слабое совпадение', className: 'ai-tier ai-tier-weak' },
  fallback: { label: 'ближайшее из каталога', className: 'ai-tier ai-tier-weak' },
  unknown: { label: '—', className: 'ai-tier ai-tier-weak' },
}

const STAGE_LABELS: Record<string, string> = {
  intent: 'Разбираю запрос',
  match: 'Ищу в каталоге',
  compose: 'Готовлю объяснение',
}

function formatPrice(o: MatchedOffer): string {
  if (o.price_hidden || o.price_value == null) return 'цена по запросу'
  return `${o.price_value} ${o.currency}/${o.price_basis}`
}

function formatUsd(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n === 0) return '$0'
  if (n < 0.0001) return `$${n.toFixed(6)}`
  if (n < 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

function formatRub(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 0.01) return `≈ ${n.toFixed(3)} ₽`
  return `≈ ${n.toFixed(2)} ₽`
}

function callLabel(label: string): string {
  if (label === 'intent_parse') return 'Разбор запроса (intent)'
  if (label === 'answer_compose') return 'Текст ответа'
  if (label === 'answer_stream') return 'Текст ответа (stream)'
  return label
}

function leadLabel(o: MatchedOffer): string | null {
  const lead = (o.production_lead_days ?? 0) + (o.delivery_lead_days ?? 0)
  return lead > 0 ? `~${lead} дн.` : null
}

/** Minimal markdown: **bold**, _italic_, paragraphs. */
function renderMdLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2)
      return (
        <em key={i} className="ai-muted-em">
          {p.slice(1, -1)}
        </em>
      )
    return <span key={i}>{p}</span>
  })
}

export function AiMatchPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [chips, setChips] = useState<string[]>([])
  const [offers, setOffers] = useState<MatchedOffer[]>([])
  const [comparison, setComparison] = useState<ComparisonRow[]>([])
  const [understood, setUnderstood] = useState<Understood[]>([])
  const [orderPlan, setOrderPlan] = useState<OrderPlan | null>(null)
  const [query, setQuery] = useState<Record<string, unknown> | null>(null)
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null)
  const [catalog, setCatalog] = useState<CatalogStats | null>(null)
  const [intentSource, setIntentSource] = useState<string | null>(null)
  const [brief, setBrief] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoffContact, setHandoffContact] = useState('')
  const [handoffNote, setHandoffNote] = useState('')
  const [handoffOk, setHandoffOk] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<number[]>([])
  const [lastTurnCost, setLastTurnCost] = useState<TurnCost | null>(null)
  const [sessionCost, setSessionCost] = useState<SessionCost | null>(null)
  const [costRates, setCostRates] = useState<{
    input_per_mtok: number
    output_per_mtok: number
    model?: string
    usd_to_rub?: number
  } | null>(null)
  const [turnHistory, setTurnHistory] = useState<
    { n: number; cost_usd: number; tokens: number; calls: number; estimated?: boolean }[]
  >([])
  const [turn, setTurn] = useState<TurnInfo | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const resetPanels = () => {
    setOffers([])
    setComparison([])
    setUnderstood([])
    setOrderPlan(null)
    setQuery(null)
    setMatchStats(null)
    setBrief(null)
    setIntentSource(null)
    setCompareIds([])
    setStage(null)
    setLastTurnCost(null)
    setSessionCost(null)
    setTurnHistory([])
  }

  const boot = useCallback(async (fresh = false) => {
    abortRef.current?.abort()
    setBooting(true)
    setError(null)
    setHandoffOk(null)
    setHandoffOpen(false)
    resetPanels()
    try {
      const saved = !fresh ? window.localStorage.getItem(SESSION_KEY) : null
      if (saved) {
        try {
          const restored = await api<MessageResponse & {
            messages?: { id: number; role: ChatMsg['role']; content: string }[]
            catalog?: CatalogStats
            session_cost?: SessionCost
          }>(`${AI_BASE}/sessions/${saved}`)
          setSessionId(restored.session_id)
          applyResults(restored)
          if (restored.catalog) setCatalog(restored.catalog)
          if (restored.session_cost) setSessionCost(restored.session_cost)
          const hist = (restored.messages ?? []).filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
          setMessages(
            hist.length
              ? hist.map((m) => ({ id: String(m.id), role: m.role, content: m.content }))
              : [{ id: 'welcome', role: 'assistant', content: 'Продолжаем этот подбор. Можно уточнять запрос.' }],
          )
          if (restored.suggested_replies?.length) setChips(restored.suggested_replies)
          return
        } catch {
          window.localStorage.removeItem(SESSION_KEY)
        }
      }

      // Admin-only AI endpoints (cost meter). Public /api/ai/* has no cost fields.
      const res = await api<SessionCreate>(`${AI_BASE}/sessions`, { method: 'POST', json: {} })
      setSessionId(res.session_id)
      window.localStorage.setItem(SESSION_KEY, res.session_id)
      setCatalog(res.catalog ?? null)
      setSessionCost(res.session_cost ?? null)
      if (res.cost_rates) setCostRates(res.cost_rates)
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: res.welcome || 'Опишите задачу по упаковке — подберу офферы из каталога.',
        },
      ])
      setChips(res.suggested_replies ?? [])
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Слишком много запросов. Подождите минуту.'
          : e instanceof Error
            ? e.message
            : 'Не удалось создать AI-сессию',
      )
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => {
    void boot()
    return () => abortRef.current?.abort()
  }, [boot])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function applyResults(res: {
    offers?: MatchedOffer[]
    comparison?: { rows: ComparisonRow[] }
    understood?: Understood[]
    structured_query?: Record<string, unknown>
    intent_source?: string
    catalog_stats?: MatchStats
    turn?: TurnInfo
    cost?: TurnCost
    session_cost?: SessionCost
    order_plan?: OrderPlan
  }) {
    // A conversational turn (greeting, meta question) ran no search — keep the
    // shortlist on screen instead of blanking the panel.
    const searched = res.turn?.searched !== false
    const isReset = res.turn?.kind === 'reset'

    // `understood` is authoritative even when empty — a reset clears the chips.
    if (res.understood !== undefined) setUnderstood(res.understood)
    if (searched || isReset) {
      if (res.offers) setOffers(res.offers)
      if (res.comparison?.rows) setComparison(res.comparison.rows)
      if (res.order_plan !== undefined) setOrderPlan(res.order_plan)
      if (isReset) {
        setOffers([])
        setComparison([])
        setCompareIds([])
        setOrderPlan(null)
      }
    }
    if (res.structured_query) setQuery(res.structured_query)
    if (res.intent_source) setIntentSource(res.intent_source)
    if (res.catalog_stats) setMatchStats(res.catalog_stats)
    if (res.turn) setTurn(res.turn)
    if (res.cost) {
      setLastTurnCost(res.cost)
      setTurnHistory((h) => [
        ...h,
        {
          n: h.length + 1,
          cost_usd: res.cost!.cost_usd,
          tokens: res.cost!.total_tokens,
          calls: res.cost!.llm_calls ?? res.cost!.calls?.length ?? 0,
          estimated: res.cost!.estimated,
        },
      ])
    }
    if (res.session_cost) setSessionCost(res.session_cost)
  }

  /** Streams the reply; falls back to the blocking endpoint on any failure. */
  async function sendStreaming(msg: string, assistantId: string): Promise<boolean> {
    const controller = new AbortController()
    abortRef.current = controller

    let res: Response
    try {
      const token = getToken()
      res = await fetch(`${API_URL}/api${AI_BASE}/sessions/${sessionId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
        signal: controller.signal,
      })
    } catch {
      return false
    }

    if (!res.ok || !res.body) return false

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawDelta = false
    let finished = false

    const handleFrame = (raw: string) => {
      const lines = raw.split('\n')
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) return
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(data)
      } catch {
        return
      }

      if (event === 'stage') {
        setStage(String(payload.stage ?? ''))
      } else if (event === 'understood') {
        applyResults(payload as never)
      } else if (event === 'results') {
        applyResults(payload as never)
      } else if (event === 'delta') {
        const text = String(payload.text ?? '')
        const replace = payload.replace === true
        sawDelta = true
        setMessages((m) =>
          m.map((x) =>
            x.id === assistantId
              ? { ...x, content: replace ? text : x.content + text, streaming: true }
              : x,
          ),
        )
      } else if (event === 'done') {
        const final = payload as unknown as MessageResponse
        applyResults(final as never)
        setBrief(final.cta?.prefill?.brief || null)
        if (final.suggested_replies?.length) setChips(final.suggested_replies)
        setMessages((m) =>
          m.map((x) =>
            x.id === assistantId
              ? { ...x, content: final.assistant_message || x.content, streaming: false }
              : x,
          ),
        )
        finished = true
      } else if (event === 'error') {
        throw new Error(String(payload.message ?? 'stream error'))
      }
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          handleFrame(frame)
        }
      }
      if (buffer.trim()) handleFrame(buffer)
    } catch (e) {
      if (controller.signal.aborted) return true
      // Partial stream is still useful — keep it rather than restarting.
      if (sawDelta || finished) {
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, streaming: false } : x)))
        if (!finished) setError(e instanceof Error ? e.message : 'Поток прервался')
        return true
      }
      return false
    }

    return finished || sawDelta
  }

  async function sendBlocking(msg: string, assistantId: string) {
    const res = await api<MessageResponse>(`${AI_BASE}/sessions/${sessionId}/messages`, {
      method: 'POST',
      json: { message: msg },
    })
    applyResults(res as never)
    setBrief(res.cta?.prefill?.brief || null)
    if (res.suggested_replies?.length) setChips(res.suggested_replies)
    setMessages((m) =>
      m.map((x) => (x.id === assistantId ? { ...x, content: res.assistant_message, streaming: false } : x)),
    )
  }

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || !sessionId || loading) return
    setError(null)
    setHandoffOk(null)
    setInput('')
    setLoading(true)
    setStage('intent')

    const assistantId = `a-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: 'user', content: msg },
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ])

    try {
      const streamed = await sendStreaming(msg, assistantId)
      if (!streamed) await sendBlocking(msg, assistantId)
    } catch (e) {
      const text =
        e instanceof ApiError && e.status === 429
          ? 'Слишком много запросов — подождите минуту.'
          : e instanceof Error
            ? e.message
            : 'Ошибка AI-запроса'
      setError(text)
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? { ...x, role: 'system', content: 'Не удалось получить ответ. Попробуйте ещё раз.', streaming: false }
            : x,
        ),
      )
    } finally {
      setLoading(false)
      setStage(null)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  /**
   * Removes a constraint chip. Deterministic server-side edit — no LLM call,
   * so it feels instant and can't drift from what the chat believes.
   */
  async function removeConstraint(item: Understood) {
    if (!sessionId || loading || removing) return
    const fields = item.fields?.length ? item.fields : [item.key]
    setRemoving(item.key)
    setError(null)
    try {
      const res = await api<MessageResponse>(`${AI_BASE}/sessions/${sessionId}/refine`, {
        method: 'POST',
        json: { remove: fields },
      })
      applyResults(res as never)
      setBrief(res.cta?.prefill?.brief || null)
      if (res.suggested_replies?.length) setChips(res.suggested_replies)
      setMessages((m) => [
        ...m,
        { id: `u-${Date.now()}`, role: 'user', content: `Убрать: ${item.label.toLowerCase()}` },
        { id: `a-${Date.now()}`, role: 'assistant', content: res.assistant_message },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить фильтр')
    } finally {
      setRemoving(null)
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
      const res = await api<{ ok: boolean; brief?: string; status: string; session_cost?: SessionCost }>(
        `${AI_BASE}/sessions/${sessionId}/handoff`,
        {
          method: 'POST',
          json: { contact: handoffContact || null, note: handoffNote || null },
        },
      )
      if (res.session_cost) setSessionCost(res.session_cost)
      setHandoffOk('Заявка передана менеджеру — бриф сохранён в сессии.')
      if (res.brief) setBrief(res.brief)
      setHandoffOpen(false)
      setMessages((m) => [
        ...m,
        { id: `h-${Date.now()}`, role: 'system', content: 'Заявка передана менеджеру вместе с брифом.' },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось передать заявку')
    }
  }

  function toggleCompare(id: number) {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  const shownComparison = useMemo(
    () => (compareIds.length >= 2 ? comparison.filter((r) => compareIds.includes(r.offer_id)) : comparison),
    [comparison, compareIds],
  )

  const thinCatalog = catalog?.is_thin === true && (catalog?.active_offers ?? 0) > 0
  const emptyCatalog = (catalog?.active_offers ?? 0) === 0
  const relaxed = matchStats?.relaxed

  return (
    <div className="ai-page">
      {/* Header */}
      <header className="ai-head">
        <div>
          <h1 className="ai-h1">Подбор упаковки</h1>
          <p className="ai-sub">
            Admin-тест AI. Cost meter только здесь — на публичный API витрины не отдаётся.
          </p>
        </div>
        <div className="ai-head-actions">
          {catalog ? (
            <span className="ai-catalog-pill" title="Область поиска — только активные офферы каталога">
              каталог: <strong>{catalog.active_offers}</strong> офферов ·{' '}
              <strong>{catalog.active_suppliers}</strong> поставщиков
            </span>
          ) : null}
          {sessionCost ? (
            <span className="ai-cost-pill" title="Сумма LLM за текущую сессию">
              сессия: <strong>{formatUsd(sessionCost.cost_usd)}</strong>
              {sessionCost.cost_rub_approx != null ? (
                <span className="ai-cost-muted"> ({formatRub(sessionCost.cost_rub_approx)})</span>
              ) : null}
            </span>
          ) : null}
          <button type="button" onClick={() => void boot(true)} disabled={booting || loading} className="ai-btn-ghost">
            Новый запрос
          </button>
        </div>
      </header>

      {/* Admin cost meter */}
      {(lastTurnCost || sessionCost) && (
        <div className="ai-cost-panel">
          <div className="ai-cost-grid">
            <div className="ai-cost-card">
              <div className="ai-cost-label">Последний ответ</div>
              <div className="ai-cost-value">{formatUsd(lastTurnCost?.cost_usd)}</div>
              <div className="ai-cost-sub">
                {lastTurnCost ? (
                  <>
                    {lastTurnCost.total_tokens} tok · in {lastTurnCost.prompt_tokens} / out{' '}
                    {lastTurnCost.completion_tokens}
                    {lastTurnCost.estimated ? ' · оценка' : ''}
                    {lastTurnCost.cost_rub_approx != null
                      ? ` · ${formatRub(lastTurnCost.cost_rub_approx)}`
                      : ''}
                  </>
                ) : (
                  'ещё не было LLM-вызовов'
                )}
              </div>
            </div>
            <div className="ai-cost-card">
              <div className="ai-cost-label">Вся сессия</div>
              <div className="ai-cost-value">{formatUsd(sessionCost?.cost_usd)}</div>
              <div className="ai-cost-sub">
                {sessionCost
                  ? `${sessionCost.total_tokens} tok · ${sessionCost.llm_calls} LLM · ${sessionCost.user_messages ?? turnHistory.length} msg`
                  : '—'}
                {sessionCost?.cost_rub_approx != null
                  ? ` · ${formatRub(sessionCost.cost_rub_approx)}`
                  : ''}
              </div>
            </div>
            <div className="ai-cost-card">
              <div className="ai-cost-label">Поиск в каталоге</div>
              <div className="ai-cost-value">$0</div>
              <div className="ai-cost-sub">SQL scoring на VPS — без LLM</div>
            </div>
            <div className="ai-cost-card">
              <div className="ai-cost-label">Тариф WaveSpeed</div>
              <div className="ai-cost-value ai-cost-value-sm">
                {costRates
                  ? `$${costRates.input_per_mtok}/$${costRates.output_per_mtok}`
                  : lastTurnCost?.rates
                    ? `$${lastTurnCost.rates.input_per_mtok}/$${lastTurnCost.rates.output_per_mtok}`
                    : '—'}
              </div>
              <div className="ai-cost-sub">
                in/out за 1M tok
                {costRates?.model ? ` · ${costRates.model}` : ''}
              </div>
            </div>
          </div>
          {lastTurnCost?.calls && lastTurnCost.calls.length > 0 ? (
            <div className="ai-cost-calls">
              <div className="ai-cost-label">Разбивка последнего ответа</div>
              <ul>
                {lastTurnCost.calls.map((c) => (
                  <li key={c.label}>
                    <strong>{callLabel(c.label)}</strong>
                    {': '}
                    {formatUsd(c.cost_usd)} · {c.prompt_tokens}+{c.completion_tokens} tok
                    {c.estimated ? ' (оценка)' : ''}
                  </li>
                ))}
                <li>
                  <strong>Поиск офферов</strong>: $0 (детерминированный матч)
                </li>
              </ul>
            </div>
          ) : null}
          {turnHistory.length > 1 ? (
            <div className="ai-cost-history">
              {turnHistory.map((t) => (
                <span key={t.n} className="ai-cost-chip" title={`${t.tokens} tokens, ${t.calls} LLM`}>
                  #{t.n} {formatUsd(t.cost_usd)}
                  {t.estimated ? '~' : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Honest banners */}
      {emptyCatalog ? (
        <div className="ai-banner ai-banner-warn">
          <strong>В каталоге нет активных офферов.</strong> Подбор ищет только по заведённым товарам,
          поэтому сейчас результатов не будет. Добавьте поставщиков и офферы в админке.
        </div>
      ) : thinCatalog ? (
        <div className="ai-banner ai-banner-info">
          Каталог пока небольшой — <strong>{catalog?.active_offers}</strong> офферов. Если точного
          совпадения не найдётся, покажу ближайшее и честно отмечу расхождения.
        </div>
      ) : null}

      {catalog?.llm_enabled === false ? (
        <div className="ai-banner ai-banner-info">
          LLM отключён — работает разбор запроса на правилах. Матчинг и объяснения при этом
          полноценные, только формулировки шаблонные.
        </div>
      ) : null}

      {error ? <div className="ai-banner ai-banner-error">{error}</div> : null}
      {handoffOk ? <div className="ai-banner ai-banner-ok">{handoffOk}</div> : null}

      <div className="ai-grid">
        {/* ---------------- Chat ---------------- */}
        <section className="ai-panel ai-panel-chat">
          <div className="ai-panel-head">
            <span>Диалог</span>
            {intentSource ? (
              <button
                type="button"
                className="ai-link-btn"
                onClick={() => setShowDebug((v) => !v)}
                title="Технические детали разбора"
              >
                {showDebug ? 'скрыть детали' : 'детали'}
              </button>
            ) : null}
          </div>

          <div className="ai-chat-scroll">
            {booting ? (
              <div className="ai-skeleton-group">
                <div className="ai-skeleton ai-skeleton-line" />
                <div className="ai-skeleton ai-skeleton-line short" />
              </div>
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
                  <div className="ai-bubble-role">
                    {m.role === 'user' ? 'Вы' : m.role === 'assistant' ? 'Agora AI' : 'Система'}
                  </div>
                  <div className="ai-bubble-body">
                    {m.content ? renderMdLite(m.content) : null}
                    {m.streaming ? <span className="ai-caret" /> : null}
                  </div>
                </div>
              ))
            )}

            {loading && stage ? (
              <div className="ai-stages">
                {(['intent', 'match', 'compose'] as const).map((s, i) => {
                  const order = ['intent', 'match', 'compose']
                  const current = order.indexOf(stage)
                  const state = i < current ? 'done' : i === current ? 'active' : 'idle'
                  return (
                    <span key={s} className={`ai-stage ai-stage-${state}`}>
                      {state === 'done' ? '✓' : state === 'active' ? <span className="ai-dot" /> : '·'}{' '}
                      {STAGE_LABELS[s]}
                    </span>
                  )
                })}
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="ai-composer">
            {/* Scenario chips — persistent entry points */}
            <div className="ai-chip-row">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={loading || !sessionId}
                  onClick={() => void send(s.text)}
                  className="ai-chip ai-chip-scenario"
                  title={s.text}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Model-suggested follow-ups */}
            {chips.length > 0 ? (
              <div className="ai-chip-row">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={loading || !sessionId}
                    onClick={() => void send(c)}
                    className="ai-chip"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="ai-form">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Например: самосбор 400×300×200, бурый, 5000 шт/мес, Москва, с логотипом"
                className="ai-input"
                disabled={!sessionId || loading}
              />
              <button type="submit" disabled={!sessionId || loading || !input.trim()} className="ai-btn-primary">
                {loading ? '…' : 'Найти'}
              </button>
            </form>
            <p className="ai-hint">Enter — отправить, Shift+Enter — новая строка</p>
          </div>
        </section>

        {/* ---------------- Results ---------------- */}
        <section className="ai-panel ai-panel-results">
          <div className="ai-panel-head">
            <span>
              {orderPlan?.multi
                ? `Комплект · ${orderPlan.needed ?? 0} позиции`
                : `Подборка${offers.length > 0 ? ` · ${offers.length}` : ''}`}
            </span>
            {matchStats?.sorted_by ? (
              <span className="ai-panel-note">
                сортировка: {matchStats.sorted_by === 'price' ? 'по цене' : matchStats.sorted_by === 'lead' ? 'по сроку' : 'по соответствию'}
              </span>
            ) : offers.length > 0 ? (
              <span className="ai-panel-note">по соответствию запросу</span>
            ) : null}
          </div>

          <div className="ai-results-scroll">
            {/* Running context — the memory of the conversation, editable */}
            {understood.length > 0 ? (
              <div className="ai-understood">
                <div className="ai-understood-head">
                  <span className="ai-understood-title">Ищу с учётом</span>
                  <span className="ai-understood-count">
                    {understood.length} парам.
                  </span>
                </div>
                <div className="ai-understood-tags">
                  {understood.map((u) => {
                    const justAdded = (turn?.added_fields ?? []).some((f) =>
                      (u.fields ?? [u.key]).includes(f),
                    )
                    return (
                      <span
                        key={u.key}
                        className={`ai-tag${justAdded ? ' ai-tag-new' : ''}${
                          removing === u.key ? ' ai-tag-removing' : ''
                        }`}
                      >
                        <span className="ai-tag-label">{u.label}</span>
                        <span className="ai-tag-value">{u.value}</span>
                        {u.removable !== false ? (
                          <button
                            type="button"
                            className="ai-tag-x"
                            title={`Убрать ${u.label.toLowerCase()} из запроса`}
                            aria-label={`Убрать ${u.label}`}
                            disabled={loading || removing !== null}
                            onClick={() => void removeConstraint(u)}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    )
                  })}
                </div>
                <p className="ai-understood-hint">
                  Помню контекст — дописывайте уточнения по ходу («нужен бурый», «высота 250»).
                  Крестик снимает требование.
                </p>
              </div>
            ) : null}

            {orderPlan?.multi && orderPlan.recommended?.kind === 'full_cover' ? (
              <article className="ai-bundle">
                <div className="ai-bundle-head">
                  <span className="ai-bundle-badge">Одна заявка</span>
                  <div className="ai-bundle-titleblock">
                    <h3 className="ai-bundle-title">{orderPlan.recommended.supplier_name}</h3>
                    <p className="ai-bundle-sub">
                      закрывает {orderPlan.recommended.covers} из {orderPlan.recommended.needed} позиций
                      {orderPlan.recommended.weak_line ? ' · есть слабое совпадение' : ''}
                    </p>
                  </div>
                  <div className="ai-bundle-score">
                    <em>{orderPlan.recommended.min_score}%</em>
                    <span>мин. по линиям</span>
                  </div>
                </div>
                <p className="ai-bundle-reason">{orderPlan.recommended.reason}</p>
                <div className="ai-bundle-lines">
                  {orderPlan.recommended.lines.map((line) => (
                    <div key={line.slug} className={`ai-bundle-line${line.covered ? '' : ' is-gap'}`}>
                      <div className="ai-bundle-line-cat">{line.name}</div>
                      {line.offer ? (
                        <>
                          <div className="ai-bundle-line-title">{line.offer.offer_title}</div>
                          <div className="ai-bundle-line-meta">
                            {formatPrice(line.offer)} · {line.offer.match_score}%
                          </div>
                        </>
                      ) : (
                        <div className="ai-bundle-line-title">нет оффера у этого поставщика</div>
                      )}
                    </div>
                  ))}
                </div>
                {orderPlan.split && orderPlan.split.extra_rfqs > 0 ? (
                  <p className="ai-bundle-split">
                    Если брать лучших по каждой позиции по отдельности — {orderPlan.split.supplier_count}{' '}
                    поставщика, +{orderPlan.split.extra_rfqs} заявка.
                  </p>
                ) : (
                  <p className="ai-bundle-split">Лучшие по каждой линии уже у этого поставщика.</p>
                )}
              </article>
            ) : orderPlan?.multi ? (
              <div className="ai-banner ai-banner-warn compact">
                Одним поставщиком комплект не закрывается — позиции придётся разнести по заявкам.
              </div>
            ) : null}

            {relaxed === 'category' ? (
              <div className="ai-banner ai-banner-info compact">
                В запрошенной категории совпадений не было — расширил поиск на весь каталог.
              </div>
            ) : relaxed === 'all_criteria' ? (
              <div className="ai-banner ai-banner-warn compact">
                Точного совпадения нет. Ниже — ближайшее, что есть в каталоге, с отметками расхождений.
              </div>
            ) : null}

            {/* Loading skeletons */}
            {loading && offers.length === 0 ? (
              <div className="ai-skeleton-group">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ai-skeleton ai-skeleton-card" />
                ))}
              </div>
            ) : null}

            {/* Empty state */}
            {!loading && offers.length === 0 ? (
              <div className="ai-empty">
                <p className="ai-empty-title">Пока ничего не подобрано</p>
                <p className="ai-empty-text">
                  {emptyCatalog
                    ? 'В каталоге нет активных офферов — подбирать не из чего.'
                    : 'Опишите задачу в диалоге или начните с готового сценария слева.'}
                </p>
              </div>
            ) : null}

            {/* Offer cards */}
            {offers.map((o) => {
              const tier = TIER_META[o.match_tier ?? 'unknown']
              const lead = leadLabel(o)
              const selected = compareIds.includes(o.id)
              const inKit = o.in_recommended_bundle === true
              return (
                <article
                  key={o.id}
                  className={`ai-card${selected ? ' ai-card-selected' : ''}${inKit ? ' ai-card-kit' : ''}`}
                >
                  <div className="ai-card-top">
                    <div className="ai-thumb">
                      {o.photo_url ? (
                        <img src={o.photo_url} alt="" loading="lazy" />
                      ) : (
                        <span className="ai-thumb-empty">нет фото</span>
                      )}
                    </div>

                    <div className="ai-card-main">
                      <div className="ai-card-titlerow">
                        <h3 className="ai-card-title">{o.offer_title}</h3>
                        <div className="ai-score-block">
                          <span className="ai-score">{o.match_score ?? '—'}%</span>
                          <span className={tier.className}>{tier.label}</span>
                        </div>
                      </div>

                      <p className="ai-card-meta">
                        {o.supplier?.commercial_name || 'Поставщик'}
                        {o.category ? ` · ${o.category.name}` : ''}
                        {o.sku ? ` · ${o.sku}` : ''}
                        {inKit ? ' · в комплекте' : ''}
                      </p>

                      <p className="ai-card-terms">
                        <strong>{formatPrice(o)}</strong>
                        <span className="ai-sep">·</span> MOQ {o.moq_value}
                        <span className="ai-sep">·</span> {o.stock_status}
                        {lead ? (
                          <>
                            <span className="ai-sep">·</span> {lead}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {/* Why / gaps — the explainability payload */}
                  {(o.match_reasons?.length || o.match_gaps?.length) ? (
                    <div className="ai-why">
                      {o.match_reasons?.length ? (
                        <ul className="ai-why-list ai-why-good">
                          {o.match_reasons.slice(0, 4).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                      {o.match_gaps?.length ? (
                        <ul className="ai-why-list ai-why-bad">
                          {o.match_gaps.slice(0, 3).map((g) => (
                            <li key={g}>{g}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="ai-card-actions">
                    <button type="button" className="ai-btn-mini" onClick={() => toggleCompare(o.id)}>
                      {selected ? '✓ в сравнении' : 'В сравнение'}
                    </button>
                    <button
                      type="button"
                      className="ai-btn-mini"
                      disabled={loading}
                      onClick={() => void send(`Найди похожие на «${o.offer_title}», но дешевле`)}
                    >
                      Похожие дешевле
                    </button>
                  </div>
                </article>
              )
            })}

            {/* Comparison */}
            {shownComparison.length > 1 ? (
              <div className="ai-compare">
                <div className="ai-compare-head">
                  <h3>Сравнение{compareIds.length >= 2 ? ` (${shownComparison.length} выбрано)` : ''}</h3>
                  {compareIds.length > 0 ? (
                    <button type="button" className="ai-link-btn" onClick={() => setCompareIds([])}>
                      сбросить выбор
                    </button>
                  ) : null}
                </div>
                <div className="ai-table-wrap">
                  <table className="ai-table">
                    <thead>
                      <tr>
                        <th>Оффер</th>
                        <th>Поставщик</th>
                        <th>Цена</th>
                        <th>MOQ</th>
                        <th>Размер</th>
                        <th>Тип</th>
                        <th>Марка</th>
                        <th>Срок</th>
                        <th>Матч</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownComparison.map((r) => (
                        <tr key={r.offer_id}>
                          <td className="ai-td-title" title={r.title}>
                            {r.title}
                          </td>
                          <td>{r.supplier || '—'}</td>
                          <td>{r.price == null ? 'по запросу' : `${r.price} ${r.currency}`}</td>
                          <td>{r.moq}</td>
                          <td>{r.size_mm || '—'}</td>
                          <td>{r.box_type || '—'}</td>
                          <td>{r.board_grade || '—'}</td>
                          <td>{r.lead_days ? `${r.lead_days} дн.` : '—'}</td>
                          <td>
                            <strong>{r.match_score}%</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Debug — opt-in only */}
            {showDebug ? (
              <div className="ai-debug">
                <div className="ai-debug-row">
                  <span>intent: <strong>{intentSource ?? '—'}</strong></span>
                  {matchStats ? (
                    <span>
                      кандидатов: <strong>{matchStats.scored_candidates ?? 0}</strong> · точных:{' '}
                      <strong>{matchStats.exact_count ?? 0}</strong>
                    </span>
                  ) : null}
                  <span className="ai-debug-api">{API_URL}/api/ai/…</span>
                </div>
                {query ? <pre className="ai-debug-pre">{JSON.stringify(query, null, 2)}</pre> : null}
              </div>
            ) : null}
          </div>

          {/* Sticky CTA — always reachable */}
          <div className="ai-cta-bar">
            {handoffOpen ? (
              <div className="ai-handoff">
                <div className="ai-handoff-head">
                  <strong>Заявка менеджеру</strong>
                  <button type="button" className="ai-link-btn" onClick={() => setHandoffOpen(false)}>
                    отмена
                  </button>
                </div>
                <input
                  value={handoffContact}
                  onChange={(e) => setHandoffContact(e.target.value)}
                  placeholder="Телефон или email"
                  className="ai-input-sm"
                />
                <input
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  className="ai-input-sm"
                />
                {brief ? (
                  <details className="ai-brief">
                    <summary>Что уйдёт менеджеру</summary>
                    <pre>{brief}</pre>
                  </details>
                ) : null}
                <button type="button" onClick={() => void handoff()} className="ai-btn-primary full">
                  Отправить заявку
                </button>
              </div>
            ) : (
              <div className="ai-cta-row">
                <button
                  type="button"
                  className="ai-btn-primary"
                  disabled={!sessionId}
                  onClick={() => setHandoffOpen(true)}
                >
                  {orderPlan?.recommended?.kind === 'full_cover'
                    ? `Одна заявка · ${orderPlan.recommended.supplier_name}`
                    : 'Передать менеджеру'}
                </button>
                <button
                  type="button"
                  className="ai-btn-ghost"
                  disabled={loading || offers.length < 2}
                  onClick={() => void send('Сравни топ-3')}
                >
                  Сравнить топ-3
                </button>
                <button
                  type="button"
                  className="ai-btn-ghost"
                  disabled={loading || offers.length < 2}
                  onClick={() => void send('Покажи дешевле')}
                >
                  Дешевле
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
