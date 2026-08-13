import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'

type CategoryRow = {
  id: number
  slug: string
  name: string
  offers: number
  active: number
}

type Catalog = {
  offers_total: number
  offers_active: number
  offers_inactive: number
  offers_with_photo: number
  offers_without_photo: number
  offers_price_hidden: number
  offers_in_stock: number
  suppliers_total: number
  suppliers_active: number
  suppliers_inactive: number
  categories: CategoryRow[]
  is_thin: boolean
  completeness: {
    sample: number
    with_size: number
    with_photo: number
    with_description: number
    pct_size: number
    pct_photo: number
    pct_description: number
  }
}

type CallRow = {
  label: string
  label_ru?: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  cost_rub?: number
}

type Daily = {
  date: string
  sessions: number
  cost_usd: number
  cost_rub: number
  tokens: number
  llm_calls: number
}

type AiBlock = {
  period_days: number
  sessions: {
    all_time: number
    period: number
    today: number
    last_7_days: number
    by_status: { active: number; handed_off: number; closed: number }
  }
  handoffs: { period: number; all_time: number }
  messages: {
    period_total: number
    period_user: number
    period_assistant: number
    all_time: number
    all_time_user: number
  }
  tokens: {
    period_in: number
    period_out: number
    period_total: number
    all_time_in: number
    all_time_out: number
    all_time_total: number
  }
  cost: {
    period_usd: number
    period_rub: number
    all_time_usd: number
    all_time_rub: number
    avg_per_session_usd: number
    avg_per_session_rub: number
    avg_per_user_message_usd: number
    avg_per_user_message_rub: number
    match_search_usd: number
  }
  llm_calls: { period: number; all_time: number; breakdown: CallRow[] }
  averages: { tokens_per_session: number; user_messages_per_session: number }
  daily: Daily[]
}

type Dash = {
  generated_at: string
  days: number
  catalog: Catalog
  ai: AiBlock
  rates: {
    input_per_mtok: number
    output_per_mtok: number
    model: string
    currency: string
    usd_to_rub: number
  }
}

type LedgerRow = {
  id: string
  status: string
  created_at: string | null
  handed_off_at: string | null
  handoff_contact: string | null
  messages_count: number
  tokens_in: number
  tokens_out: number
  tokens_total: number
  llm_calls: number
  cost_usd: number
  cost_rub: number
  query_preview: string
}

/** Catalog size below which the AI shortlist is inherently thin. */
const HEALTHY_CATALOG = 200

function moneyUsd(n: number) {
  if (!n) return '$0'
  if (n < 0.0001) return `$${n.toFixed(6)}`
  if (n < 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

function moneyRub(n: number) {
  if (!n) return '0 ₽'
  if (n < 0.01) return `${n.toFixed(3)} ₽`
  if (n < 1) return `${n.toFixed(2)} ₽`
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
}

function num(n: number) {
  return n.toLocaleString('ru-RU')
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Russian plural: 1 оффер / 2 оффера / 5 офферов. */
function plural(n: number, one: string, few: string, many: string) {
  const m100 = n % 100
  const m10 = n % 10
  if (m100 >= 11 && m100 <= 14) return many
  if (m10 === 1) return one
  if (m10 >= 2 && m10 <= 4) return few
  return many
}

function Bar({ value, max, tone = 'kraft' }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="dash-bar">
      <i className={`dash-bar-fill dash-bar-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Ring({ pct, label, tone }: { pct: number; label: string; tone?: string }) {
  const r = 28
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, Math.round(pct)))
  const dash = (clamped / 100) * c
  const stroke = tone === 'ok' ? '#15803d' : tone === 'warn' ? '#b45309' : tone === 'crit' ? '#be123c' : '#8a5a34'
  return (
    <div className="dash-ring">
      <div className="dash-ring-dial">
        <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#f0eee9" strokeWidth="7" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform="rotate(-90 36 36)"
          />
        </svg>
        <em style={{ color: stroke }}>{clamped}%</em>
      </div>
      <span>{label}</span>
    </div>
  )
}

/**
 * Sessions as bars, cost as a line on its own scale. A real chart with a grid
 * and readable date ticks — a 30-day series is unreadable as raw divs.
 */
function ActivityChart({ daily }: { daily: Daily[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const W = 760
  const H = 210
  const padL = 34
  const padR = 40
  const padT = 14
  const padB = 26
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const maxSess = Math.max(1, ...daily.map((d) => d.sessions))
  const maxCost = Math.max(0.0000001, ...daily.map((d) => d.cost_usd))
  const n = daily.length || 1
  const step = innerW / n
  const barW = Math.max(2, Math.min(22, step * 0.58))

  const yS = (v: number) => padT + innerH - (v / maxSess) * innerH
  const yC = (v: number) => padT + innerH - (v / maxCost) * innerH
  const xC = (i: number) => padL + step * i + step / 2

  const costPts = daily.map((d, i) => `${xC(i)},${yC(d.cost_usd)}`).join(' ')
  const hasCost = daily.some((d) => d.cost_usd > 0)

  // Show at most ~8 date ticks so labels never collide.
  const tickEvery = Math.max(1, Math.ceil(n / 8))
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxSess * f))

  const hovered = hover != null ? daily[hover] : null

  return (
    <div className="dash-chart-wrap">
      <div className="dash-chart-legend">
        <span>
          <i className="is-sess" /> Сессии {maxSess > 0 ? `(макс. ${maxSess}/день)` : ''}
        </span>
        <span>
          <i className="is-cost" /> Расход, $ {hasCost ? '' : '— пока нулевой'}
        </span>
      </div>

      <svg
        className="dash-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Сессии и расход по дням"
        onMouseLeave={() => setHover(null)}
      >
        {/* horizontal grid + left axis (sessions) */}
        {ticks.map((t, i) => (
          <g key={`g${i}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yS(t)}
              y2={yS(t)}
              stroke="#f0eee9"
              strokeWidth="1"
            />
            <text x={padL - 8} y={yS(t) + 3.5} textAnchor="end" fontSize="9" fill="#a2a7b0">
              {t}
            </text>
          </g>
        ))}

        {/* bars: sessions */}
        {daily.map((d, i) => {
          const h = d.sessions > 0 ? Math.max(2, padT + innerH - yS(d.sessions)) : 0
          return (
            <g key={d.date}>
              <rect
                x={xC(i) - step / 2}
                y={padT}
                width={step}
                height={innerH}
                fill={hover === i ? 'rgba(138,90,52,0.06)' : 'transparent'}
                onMouseEnter={() => setHover(i)}
              />
              {h > 0 ? (
                <rect
                  x={xC(i) - barW / 2}
                  y={padT + innerH - h}
                  width={barW}
                  height={h}
                  rx={Math.min(3, barW / 2)}
                  fill={hover === i ? '#6f4526' : '#8a5a34'}
                  pointerEvents="none"
                />
              ) : null}
            </g>
          )
        })}

        {/* line: cost on its own scale */}
        {hasCost ? (
          <>
            <polyline
              points={costPts}
              fill="none"
              stroke="#15803d"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
            {daily.map((d, i) =>
              d.cost_usd > 0 ? (
                <circle
                  key={`c${d.date}`}
                  cx={xC(i)}
                  cy={yC(d.cost_usd)}
                  r={hover === i ? 3.6 : 2.1}
                  fill="#15803d"
                  pointerEvents="none"
                />
              ) : null,
            )}
          </>
        ) : null}

        {/* x ticks */}
        {daily.map((d, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={`t${d.date}`}
              x={xC(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#a2a7b0"
            >
              {d.date.slice(8)}.{d.date.slice(5, 7)}
            </text>
          ) : null,
        )}

        {/* hover guide */}
        {hover != null ? (
          <line
            x1={xC(hover)}
            x2={xC(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="#16181d"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.28"
            pointerEvents="none"
          />
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="dash-chart-tip"
          style={{ left: `${((xC(hover!) ) / W) * 100}%`, top: `${(yS(hovered.sessions) / H) * 100}%` }}
        >
          <b>{new Date(hovered.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}</b>
          {hovered.sessions} {plural(hovered.sessions, 'сессия', 'сессии', 'сессий')}
          {hovered.cost_usd > 0 ? (
            <>
              {' · '}
              {moneyRub(hovered.cost_rub)}
            </>
          ) : null}
          {hovered.tokens > 0 ? (
            <>
              <br />
              <em>
                {num(hovered.tokens)} ток. · {hovered.llm_calls} выз.
              </em>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function DashboardPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Dash | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerMeta, setLedgerMeta] = useState({ page: 1, last: 1, total: 0 })
  const [ledgerStatus, setLedgerStatus] = useState('')

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setErr(null)
    try {
      setData(await api<Dash>(`/admin/dashboard?days=${d}`))
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Не удалось загрузить сводку')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLedger = useCallback(
    async (page: number, d: number, status: string) => {
      try {
        const qs = new URLSearchParams({ days: String(d), page: String(page), per_page: '15' })
        if (status) qs.set('status', status)
        const res = await api<{
          data: LedgerRow[]
          meta: { current_page: number; last_page: number; total: number }
        }>(`/admin/ai/ledger?${qs}`)
        setLedger(res.data)
        setLedgerMeta({ page: res.meta.current_page, last: res.meta.last_page, total: res.meta.total })
      } catch {
        /* keep previous rows */
      }
    },
    [],
  )

  useEffect(() => {
    void load(days)
    void loadLedger(1, days, ledgerStatus)
  }, [days, ledgerStatus, load, loadLedger])

  const cat = data?.catalog
  const ai = data?.ai

  /**
   * The numbers alone don't tell the operator what to do — this turns them into
   * a short, honest diagnosis at the top of the page.
   */
  const verdicts = useMemo(() => {
    if (!cat || !ai) return []
    const out: { tone: string; tag: string; title: string; body: React.ReactNode }[] = []

    // 1. Catalog depth — the single thing that limits matching quality today.
    if (cat.offers_active === 0) {
      out.push({
        tone: 'crit',
        tag: 'Блокирует',
        title: 'Каталог пуст',
        body: (
          <>
            Подбор не может работать — нет активных офферов.{' '}
            <Link to="/offers/new">Добавить оффер</Link>
          </>
        ),
      })
    } else if (cat.offers_active < HEALTHY_CATALOG) {
      out.push({
        tone: cat.offers_active < 30 ? 'crit' : 'warn',
        tag: cat.offers_active < 30 ? 'Блокирует' : 'Узко',
        title: `${num(cat.offers_active)} ${plural(cat.offers_active, 'активный оффер', 'активных оффера', 'активных офферов')} — мало для подбора`,
        body: (
          <>
            ИИ ищет только по каталогу. На запрос выпадает 1–3 варианта, сравнивать нечего.
            Ориентир — {HEALTHY_CATALOG}+ в ключевых категориях.{' '}
            <Link to="/offers">Пополнить</Link>
          </>
        ),
      })
    } else {
      out.push({
        tone: 'ok',
        tag: 'Норма',
        title: `${num(cat.offers_active)} активных офферов`,
        body: <>Глубины каталога достаточно, чтобы подбор давал выбор из нескольких вариантов.</>,
      })
    }

    // 2. Card completeness — drives the match percentage directly.
    const pctSize = cat.completeness.pct_size
    if (cat.completeness.sample > 0 && pctSize < 80) {
      const missing = cat.completeness.sample - cat.completeness.with_size
      out.push({
        tone: pctSize < 50 ? 'crit' : 'warn',
        tag: pctSize < 50 ? 'Точность' : 'Доработать',
        title: `Размеры заполнены у ${pctSize}% карточек`,
        body: (
          <>
            {num(missing)} {plural(missing, 'оффер', 'оффера', 'офферов')} без размеров в specs — по ним
            ИИ не сможет подтвердить совпадение и честно снизит процент.
          </>
        ),
      })
    } else if (cat.completeness.sample > 0) {
      out.push({
        tone: 'ok',
        tag: 'Норма',
        title: `Размеры у ${pctSize}% карточек`,
        body:
          cat.completeness.sample < 10 ? (
            <>
              Считано всего по {num(cat.completeness.sample)}{' '}
              {plural(cat.completeness.sample, 'карточке', 'карточкам', 'карточкам')} — показатель станет
              значимым, когда каталог наполнится.
            </>
          ) : (
            <>Данных достаточно для точного скоринга по габаритам.</>
          ),
      })
    }

    // 3. Spend — put it in context instead of showing a bare number.
    const rub = ai.cost.period_rub
    const perMsg = ai.cost.avg_per_user_message_rub
    if (ai.messages.period_user === 0) {
      out.push({
        tone: 'ok',
        tag: 'Расход',
        title: 'Диалогов за период не было',
        body: (
          <>
            Расход нулевой. <Link to="/ai">Открыть ИИ-подбор</Link> и проверить работу.
          </>
        ),
      })
    } else if (ai.llm_calls.period === 0) {
      // Dialogues happened but no LLM was called — the rules-based fallback ran.
      // Reporting "0 ₽" without this note would look like free magic.
      out.push({
        tone: 'warn',
        tag: 'Модель',
        title: `${num(ai.messages.period_user)} ${plural(ai.messages.period_user, 'сообщение', 'сообщения', 'сообщений')} без вызовов модели`,
        body: (
          <>
            Работал разбор на правилах — расход нулевой, но формулировки шаблонные. Похоже, не задан
            ключ WaveSpeed на сервере.
          </>
        ),
      })
    } else {
      out.push({
        tone: 'ok',
        tag: 'Расход',
        title: `${moneyRub(rub)} за ${days} дн.`,
        body: (
          <>
            {moneyRub(perMsg)} за сообщение · при 500 диалогах в месяц это около{' '}
            {moneyRub(perMsg * 5 * 500)}. Поиск по каталогу — бесплатно.
          </>
        ),
      })
    }

    return out
  }, [cat, ai, days])

  const handoffRate =
    ai && ai.sessions.period > 0 ? Math.round((ai.handoffs.period / ai.sessions.period) * 100) : 0
  const catalogFill = cat ? Math.min(100, (cat.offers_active / HEALTHY_CATALOG) * 100) : 0
  const maxCatActive = Math.max(1, ...(cat?.categories.map((c) => c.active) ?? [1]))

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="dash-eyebrow">Agora Admin</p>
          <h1 className="dash-h1">Сводка</h1>
          <p className="dash-sub">
            Состояние каталога и расход ИИ. Каталог — снимок базы прямо сейчас, цифры ИИ — за
            выбранный период.
          </p>
        </div>
        <div className="dash-head-right">
          <span className="dash-live-dot">
            <i />
            {data ? `обновлено ${new Date(data.generated_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'загрузка'}
          </span>
          <button type="button" className="dash-refresh" onClick={() => void load(days)} disabled={loading}>
            {loading ? 'Обновляю…' : 'Обновить'}
          </button>
        </div>
      </header>

      {err ? <div className="dash-banner dash-banner-err">{err}</div> : null}

      {/* Diagnosis — what the numbers mean, before the numbers themselves */}
      {loading && !data ? (
        <div className="dash-verdict">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dash-sk dash-sk-kpi" />
          ))}
        </div>
      ) : verdicts.length > 0 ? (
        <div className="dash-verdict">
          {verdicts.map((v) => (
            <article key={v.title} className={`dash-vc dash-vc-${v.tone}`}>
              <span className="dash-vc-ico">{v.tag}</span>
              <div className="dash-vc-body">
                <span className="dash-vc-t">{v.title}</span>
                <span className="dash-vc-d">{v.body}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <nav className="dash-jump">
        <Link to="/offers" className="dash-jump-card">
          <span className="dash-jump-k">Каталог</span>
          <strong>Офферы</strong>
          <em>{cat ? `${num(cat.offers_active)} активных из ${num(cat.offers_total)}` : '—'}</em>
        </Link>
        <Link to="/suppliers" className="dash-jump-card">
          <span className="dash-jump-k">Компании</span>
          <strong>Поставщики</strong>
          <em>{cat ? `${num(cat.suppliers_active)} активных из ${num(cat.suppliers_total)}` : '—'}</em>
        </Link>
        <Link to="/ai" className="dash-jump-card dash-jump-ai">
          <span className="dash-jump-k">Проверить</span>
          <strong>ИИ-подбор</strong>
          <em>открыть чат и протестировать</em>
        </Link>
      </nav>

      {/* ---------------- Catalog ---------------- */}
      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>Каталог сейчас</h2>
          <span className="dash-chip">снимок базы</span>
          {cat?.is_thin ? <span className="dash-chip dash-chip-warn">мало для ИИ</span> : null}
        </div>

        {loading && !data ? (
          <div className="dash-live">
            <div className="dash-sk dash-sk-hero" />
            <div className="dash-sk dash-sk-hero" />
          </div>
        ) : (
          <div className="dash-live">
            <article className="dash-hero">
              <div className="dash-hero-num">
                <span>Активные офферы</span>
                <b>{cat ? num(cat.offers_active) : '—'}</b>
              </div>

              <div className="dash-meters" style={{ marginBottom: '1.1rem' }}>
                <div>
                  <div className="dash-meters-row">
                    <span>Путь до рабочего каталога ({HEALTHY_CATALOG} офферов)</span>
                    <b>{Math.round(catalogFill)}%</b>
                  </div>
                  <Bar
                    value={catalogFill}
                    max={100}
                    tone={catalogFill < 15 ? 'crit' : catalogFill < 60 ? 'warn' : 'ok'}
                  />
                </div>
              </div>

              <div className="dash-rings">
                <Ring
                  pct={cat && cat.offers_total ? (cat.offers_active / cat.offers_total) * 100 : 0}
                  label="включено"
                />
                <Ring
                  pct={cat?.completeness.pct_size ?? 0}
                  label="размеры"
                  tone={(cat?.completeness.pct_size ?? 0) < 50 ? 'crit' : (cat?.completeness.pct_size ?? 0) < 80 ? 'warn' : 'ok'}
                />
                <Ring
                  pct={cat?.completeness.pct_photo ?? 0}
                  label="фото"
                  tone={(cat?.completeness.pct_photo ?? 0) < 50 ? 'warn' : 'ok'}
                />
                <Ring
                  pct={cat && cat.offers_total ? (cat.offers_in_stock / cat.offers_total) * 100 : 0}
                  label="в наличии"
                  tone="ok"
                />
              </div>

              <p className="dash-hero-meta">
                Всего в базе <b>{cat ? num(cat.offers_total) : '—'}</b> · выключено{' '}
                <b>{cat ? num(cat.offers_inactive) : '—'}</b> · в наличии{' '}
                <b>{cat ? num(cat.offers_in_stock) : '—'}</b> · цена по запросу{' '}
                <b>{cat ? num(cat.offers_price_hidden) : '—'}</b>
              </p>
            </article>

            <article className="dash-hero dash-hero-sup">
              <div className="dash-hero-num">
                <span>Активные поставщики</span>
                <b>{cat ? num(cat.suppliers_active) : '—'}</b>
              </div>
              <div className="dash-mix">
                <div className="dash-mix-track">
                  <i
                    style={{
                      width:
                        cat && cat.suppliers_total
                          ? `${(cat.suppliers_active / cat.suppliers_total) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
                <small>
                  {cat ? num(cat.suppliers_active) : 0} работают · {cat ? num(cat.suppliers_inactive) : 0}{' '}
                  выключено · всего {cat ? num(cat.suppliers_total) : 0}
                </small>
              </div>

              <p className="dash-hero-meta">
                В среднем{' '}
                <b>
                  {cat && cat.suppliers_active
                    ? (cat.offers_active / cat.suppliers_active).toFixed(1)
                    : '—'}
                </b>{' '}
                {plural(
                  cat && cat.suppliers_active ? Math.round(cat.offers_active / cat.suppliers_active) : 0,
                  'оффер',
                  'оффера',
                  'офферов',
                )}{' '}
                на поставщика. Чем шире ассортимент у каждого, тем точнее подбор.
              </p>
              <Link to="/suppliers" className="dash-hero-link">
                Открыть поставщиков →
              </Link>
            </article>
          </div>
        )}

        <div className="dash-split">
          <div className="dash-panel">
            <h3>Готовность карточек к ИИ</h3>
            {cat && cat.completeness.sample > 0 ? (
              <ul className="dash-meters">
                {(
                  [
                    ['Размеры в specs', cat.completeness.pct_size, cat.completeness.with_size, true],
                    ['Фото', cat.completeness.pct_photo, cat.completeness.with_photo, false],
                    ['Описание', cat.completeness.pct_description, cat.completeness.with_description, false],
                  ] as const
                ).map(([label, pct, count, critical]) => (
                  <li key={label}>
                    <div className="dash-meters-row">
                      <span>
                        {label}
                        {critical ? <span className="dash-chip dash-chip-warn" style={{ marginLeft: '0.4rem' }}>влияет на матч</span> : null}
                      </span>
                      <b>{pct}%</b>
                    </div>
                    <Bar value={pct} max={100} tone={critical && pct < 80 ? (pct < 50 ? 'crit' : 'warn') : 'kraft'} />
                    <small>
                      {num(count)} из {num(cat.completeness.sample)} активных
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-empty">Нет активных офферов — нечего измерять</p>
            )}
            <p className="dash-note">
              Процент соответствия в подборе считается по заполненным полям. Пустые размеры → оффер
              получает пометку «размеры не заполнены» и низкий балл.
            </p>
          </div>

          <div className="dash-panel">
            <h3>Склад по категориям</h3>
            {cat && cat.categories.length > 0 ? (
              <ul className="dash-cats">
                {cat.categories.map((c) => (
                  <li key={c.id}>
                    <div className="dash-cats-row">
                      <span>{c.name}</span>
                      <span>
                        <b>{c.active}</b>
                        {c.offers !== c.active ? <i> из {c.offers}</i> : null}
                      </span>
                    </div>
                    <Bar value={c.active} max={maxCatActive} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-empty">Пока нет офферов в категориях</p>
            )}
            <Link to="/offers" className="dash-hero-link">
              Открыть офферы →
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- AI ---------------- */}
      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>ИИ-подбор · расход и активность</h2>
          <div className="dash-period">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} type="button" className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>
                {d} дн.
              </button>
            ))}
          </div>
          <span className="dash-spacer" />
          <span className="dash-chip">{data?.rates.model ?? '—'}</span>
        </div>

        <div className="dash-kpis dash-kpis-money">
          <article className="dash-kpi dash-kpi-money">
            <span>Расход за {days} дн.</span>
            <b>{ai ? moneyRub(ai.cost.period_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.period_usd) : ''}</small>
          </article>
          <article className="dash-kpi dash-kpi-money">
            <span>За всё время</span>
            <b>{ai ? moneyRub(ai.cost.all_time_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.all_time_usd) : ''}</small>
          </article>
          <article className="dash-kpi">
            <span>Цена сообщения</span>
            <b>{ai ? moneyRub(ai.cost.avg_per_user_message_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.avg_per_user_message_usd) : ''}</small>
          </article>
          <article className="dash-kpi">
            <span>Цена диалога</span>
            <b>{ai ? moneyRub(ai.cost.avg_per_session_rub) : '—'}</b>
            <small>
              ср. {ai ? ai.averages.user_messages_per_session : '—'} сообщ. на диалог
            </small>
          </article>
        </div>

        <div className="dash-kpis">
          <article className="dash-kpi">
            <span>Диалоги</span>
            <b>{ai ? num(ai.sessions.period) : '—'}</b>
            <small>
              сегодня {ai ? ai.sessions.today : '—'} · за 7 дн. {ai ? ai.sessions.last_7_days : '—'}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Сообщений от людей</span>
            <b>{ai ? num(ai.messages.period_user) : '—'}</b>
            <small>ответов ИИ {ai ? num(ai.messages.period_assistant) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>Заявок менеджеру</span>
            <b>{ai ? num(ai.handoffs.period) : '—'}</b>
            <small>
              {ai && ai.sessions.period > 0 ? `конверсия ${handoffRate}%` : 'всего ' + (ai ? num(ai.handoffs.all_time) : '—')}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Токены</span>
            <b>{ai ? num(ai.tokens.period_total) : '—'}</b>
            <small>
              вход {ai ? num(ai.tokens.period_in) : '—'} · выход {ai ? num(ai.tokens.period_out) : '—'}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Вызовов модели</span>
            <b>{ai ? num(ai.llm_calls.period) : '—'}</b>
            <small>2 на сообщение: разбор + ответ</small>
          </article>
          <article className="dash-kpi dash-kpi-free">
            <span>Поиск по каталогу</span>
            <b>0 ₽</b>
            <small>SQL на нашем сервере</small>
          </article>
        </div>

        <div className="dash-panel">
          <h3>Динамика по дням</h3>
          {ai && ai.daily.length > 0 ? (
            <>
              <ActivityChart daily={ai.daily} />
              {(() => {
                const activeDays = ai.daily.filter((d) => d.sessions > 0).length
                if (activeDays === 0) {
                  return (
                    <p className="dash-note">
                      За {days} дн. диалогов не было. <Link to="/ai">Открыть ИИ-подбор</Link>, чтобы
                      проверить работу.
                    </p>
                  )
                }
                if (activeDays <= 2) {
                  return (
                    <p className="dash-note">
                      Активность пока в {activeDays}{' '}
                      {plural(activeDays, 'дне', 'днях', 'днях')} из {ai.daily.length} — график
                      наполнится, когда пойдёт живой трафик.
                    </p>
                  )
                }
                return (
                  <p className="dash-note">
                    Активных дней: {activeDays} из {ai.daily.length}. Наведите на столбик, чтобы
                    увидеть детали дня.
                  </p>
                )
              })()}
            </>
          ) : (
            <p className="dash-empty">Нет данных за период</p>
          )}
        </div>

        <div className="dash-split">
          <div className="dash-panel">
            <h3>Статусы диалогов</h3>
            {ai ? (
              <ul className="dash-status">
                <li>
                  <i className="dot dot-on" /> В работе <b>{ai.sessions.by_status.active}</b>
                </li>
                <li>
                  <i className="dot dot-go" /> Передано менеджеру <b>{ai.sessions.by_status.handed_off}</b>
                </li>
                <li>
                  <i className="dot" /> Закрыто <b>{ai.sessions.by_status.closed}</b>
                </li>
              </ul>
            ) : null}
            <p className="dash-note">
              В среднем {ai ? num(ai.averages.tokens_per_session) : '—'} токенов на диалог. Тариф:{' '}
              ${data?.rates.input_per_mtok}/млн вход, ${data?.rates.output_per_mtok}/млн выход, курс{' '}
              {data?.rates.usd_to_rub} ₽/$.
            </p>
          </div>

          <div className="dash-panel">
            <h3>На что уходят деньги</h3>
            {ai && ai.llm_calls.breakdown.length > 0 ? (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Вызов</th>
                      <th>Раз</th>
                      <th>Токены</th>
                      <th>Рубли</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.llm_calls.breakdown.map((r) => (
                      <tr key={r.label}>
                        <td>{r.label_ru || r.label}</td>
                        <td className="n">{num(r.calls)}</td>
                        <td className="n">
                          {num(r.prompt_tokens)} + {num(r.completion_tokens)}
                        </td>
                        <td className="n n-hi">{moneyRub(r.cost_rub ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-empty">Разметка появится после новых диалогов</p>
            )}
            <p className="dash-note">
              «Разбор запроса» превращает фразу в параметры, «текст ответа» — формулирует
              объяснение. Сам подбор офферов не тратит токены.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Ledger ---------------- */}
      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>Журнал диалогов</h2>
          <div className="dash-period">
            {(
              [
                ['', 'все'],
                ['active', 'в работе'],
                ['handed_off', 'заявки'],
                ['closed', 'закрытые'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v || 'all'}
                type="button"
                className={ledgerStatus === v ? 'is-on' : ''}
                onClick={() => setLedgerStatus(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="dash-spacer" />
          <span className="dash-chip">{num(ledgerMeta.total)} за период</span>
        </div>

        <div className="dash-panel dash-panel-table">
          <div className="dash-scroll">
            <table className="dash-table dash-table-wide">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Статус</th>
                  <th>Что искали</th>
                  <th>Сообщ.</th>
                  <th>Токены</th>
                  <th>Выз.</th>
                  <th>Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDate(r.created_at)}</td>
                    <td>
                      <span className={`dash-st dash-st-${r.status}`}>
                        {r.status === 'handed_off' ? 'заявка' : r.status === 'active' ? 'в работе' : 'закрыт'}
                      </span>
                    </td>
                    <td className="dash-clip" title={r.query_preview}>
                      {r.query_preview}
                    </td>
                    <td className="n">{r.messages_count}</td>
                    <td className="n">
                      {num(r.tokens_in)} / {num(r.tokens_out)}
                    </td>
                    <td className="n">{r.llm_calls}</td>
                    <td className="n n-hi">{moneyRub(r.cost_rub)}</td>
                  </tr>
                ))}
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="dash-empty">
                      Диалогов за период нет
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="dash-pager">
            <span>
              страница {ledgerMeta.page} из {ledgerMeta.last}
            </span>
            <div>
              <button
                type="button"
                disabled={ledgerMeta.page <= 1}
                onClick={() => void loadLedger(ledgerMeta.page - 1, days, ledgerStatus)}
              >
                ←
              </button>
              <button
                type="button"
                disabled={ledgerMeta.page >= ledgerMeta.last}
                onClick={() => void loadLedger(ledgerMeta.page + 1, days, ledgerStatus)}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </section>

      <p className="dash-foot">
        Обновлено {data?.generated_at ? new Date(data.generated_at).toLocaleString('ru-RU') : '—'} · цифры
        по расходу ИИ видны только в админке и на витрину не отдаются.
      </p>
    </div>
  )
}
