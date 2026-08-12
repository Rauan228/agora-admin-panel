import { useCallback, useEffect, useState } from 'react'
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
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Bar({ value, max, tone = 'kraft' }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="dash-bar">
      <i className={`dash-bar-fill dash-bar-${tone}`} style={{ width: `${pct}%` }} />
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

  const load = useCallback(async (d = days) => {
    setLoading(true)
    setErr(null)
    try {
      const res = await api<Dash>(`/admin/dashboard?days=${d}`)
      setData(res)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Не удалось загрузить дашборд')
    } finally {
      setLoading(false)
    }
  }, [days])

  const loadLedger = useCallback(
    async (page = 1, d = days, status = ledgerStatus) => {
      try {
        const qs = new URLSearchParams({
          days: String(d),
          page: String(page),
          per_page: '15',
        })
        if (status) qs.set('status', status)
        const res = await api<{ data: LedgerRow[]; meta: { current_page: number; last_page: number; total: number } }>(
          `/admin/ai/ledger?${qs}`,
        )
        setLedger(res.data)
        setLedgerMeta({ page: res.meta.current_page, last: res.meta.last_page, total: res.meta.total })
      } catch {
        /* keep previous */
      }
    },
    [days, ledgerStatus],
  )

  useEffect(() => {
    void load(days)
    void loadLedger(1, days, ledgerStatus)
  }, [days, ledgerStatus, load, loadLedger])

  const cat = data?.catalog
  const ai = data?.ai
  const maxDailySess = Math.max(1, ...(ai?.daily.map((d) => d.sessions) ?? [1]))
  const maxDailyCost = Math.max(0.000001, ...(ai?.daily.map((d) => d.cost_usd) ?? [0]))

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="dash-eyebrow">Agora Admin</p>
          <h1 className="dash-h1">Сводка</h1>
          <p className="dash-sub">Каталог, поставщики и полный учёт ИИ-подбора — расходы, токены, сессии.</p>
        </div>
        <div className="dash-head-right">
          <div className="dash-period">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={days === d ? 'is-on' : ''}
                onClick={() => setDays(d)}
              >
                {d} дн.
              </button>
            ))}
          </div>
          <button type="button" className="dash-refresh" onClick={() => void load(days)} disabled={loading}>
            {loading ? 'Обновляю…' : 'Обновить'}
          </button>
        </div>
      </header>

      {err ? <div className="dash-banner dash-banner-err">{err}</div> : null}

      <nav className="dash-jump">
        <Link to="/offers" className="dash-jump-card">
          <span className="dash-jump-k">Каталог</span>
          <strong>Офферы</strong>
          <em>{cat ? `${cat.offers_active} акт. / ${cat.offers_total}` : '—'}</em>
        </Link>
        <Link to="/suppliers" className="dash-jump-card">
          <span className="dash-jump-k">Компании</span>
          <strong>Поставщики</strong>
          <em>{cat ? `${cat.suppliers_active} акт. / ${cat.suppliers_total}` : '—'}</em>
        </Link>
        <Link to="/ai" className="dash-jump-card dash-jump-ai">
          <span className="dash-jump-k">Тест</span>
          <strong>ИИ-подбор</strong>
          <em>открыть чат</em>
        </Link>
      </nav>

      {/* Catalog */}
      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>Каталог</h2>
          {cat?.is_thin ? <span className="dash-chip dash-chip-warn">мало офферов — ИИ ищет по узкому складу</span> : null}
        </div>
        <div className="dash-kpis">
          <article className="dash-kpi">
            <span>Офферы активные</span>
            <b>{cat ? num(cat.offers_active) : '—'}</b>
            <small>всего {cat ? num(cat.offers_total) : '—'} · выкл. {cat ? num(cat.offers_inactive) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>Поставщики активные</span>
            <b>{cat ? num(cat.suppliers_active) : '—'}</b>
            <small>всего {cat ? num(cat.suppliers_total) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>В наличии</span>
            <b>{cat ? num(cat.offers_in_stock) : '—'}</b>
            <small>цена скрыта: {cat ? num(cat.offers_price_hidden) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>С фото</span>
            <b>{cat ? `${cat.completeness.pct_photo}%` : '—'}</b>
            <small>
              {cat ? `${cat.offers_with_photo} из ${cat.offers_total}` : '—'}
            </small>
          </article>
        </div>

        <div className="dash-split">
          <div className="dash-panel">
            <h3>Полнота активных карточек</h3>
            {cat ? (
              <ul className="dash-meters">
                <li>
                  <div className="dash-meters-row">
                    <span>Размеры в specs</span>
                    <b>{cat.completeness.pct_size}%</b>
                  </div>
                  <Bar value={cat.completeness.pct_size} max={100} />
                  <small>
                    {cat.completeness.with_size} / {cat.completeness.sample}
                  </small>
                </li>
                <li>
                  <div className="dash-meters-row">
                    <span>Фото</span>
                    <b>{cat.completeness.pct_photo}%</b>
                  </div>
                  <Bar value={cat.completeness.pct_photo} max={100} />
                </li>
                <li>
                  <div className="dash-meters-row">
                    <span>Короткое описание</span>
                    <b>{cat.completeness.pct_description}%</b>
                  </div>
                  <Bar value={cat.completeness.pct_description} max={100} />
                </li>
              </ul>
            ) : (
              <p className="dash-empty">Нет данных</p>
            )}
          </div>
          <div className="dash-panel">
            <h3>Категории с товарами</h3>
            {cat && cat.categories.length > 0 ? (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Категория</th>
                    <th>Акт.</th>
                    <th>Всего</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.active}</td>
                      <td>{c.offers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="dash-empty">Пока нет офферов в категориях</p>
            )}
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>ИИ-подбор · полная статистика</h2>
          <span className="dash-chip">период {days} дн. · модель {data?.rates.model ?? '—'}</span>
        </div>

        <div className="dash-kpis dash-kpis-money">
          <article className="dash-kpi dash-kpi-money">
            <span>Расход за период</span>
            <b>{ai ? moneyRub(ai.cost.period_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.period_usd) : ''}</small>
          </article>
          <article className="dash-kpi dash-kpi-money">
            <span>Расход за всё время</span>
            <b>{ai ? moneyRub(ai.cost.all_time_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.all_time_usd) : ''}</small>
          </article>
          <article className="dash-kpi">
            <span>Среднее / сессия</span>
            <b>{ai ? moneyRub(ai.cost.avg_per_session_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.avg_per_session_usd) : ''}</small>
          </article>
          <article className="dash-kpi">
            <span>Среднее / сообщение</span>
            <b>{ai ? moneyRub(ai.cost.avg_per_user_message_rub) : '—'}</b>
            <small>{ai ? moneyUsd(ai.cost.avg_per_user_message_usd) : ''}</small>
          </article>
        </div>

        <div className="dash-kpis">
          <article className="dash-kpi">
            <span>Сессии за период</span>
            <b>{ai ? num(ai.sessions.period) : '—'}</b>
            <small>
              сегодня {ai ? ai.sessions.today : '—'} · 7 дн. {ai ? ai.sessions.last_7_days : '—'} · всего{' '}
              {ai ? num(ai.sessions.all_time) : '—'}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Сообщения покупателя</span>
            <b>{ai ? num(ai.messages.period_user) : '—'}</b>
            <small>
              ассистент {ai ? num(ai.messages.period_assistant) : '—'} · всего реплик {ai ? num(ai.messages.period_total) : '—'}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Токены за период</span>
            <b>{ai ? num(ai.tokens.period_total) : '—'}</b>
            <small>
              in {ai ? num(ai.tokens.period_in) : '—'} · out {ai ? num(ai.tokens.period_out) : '—'}
            </small>
          </article>
          <article className="dash-kpi">
            <span>Вызовы LLM</span>
            <b>{ai ? num(ai.llm_calls.period) : '—'}</b>
            <small>за всё время {ai ? num(ai.llm_calls.all_time) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>Handoff менеджеру</span>
            <b>{ai ? num(ai.handoffs.period) : '—'}</b>
            <small>всего {ai ? num(ai.handoffs.all_time) : '—'}</small>
          </article>
          <article className="dash-kpi">
            <span>Поиск в каталоге</span>
            <b>$0</b>
            <small>SQL scoring, без модели</small>
          </article>
        </div>

        <div className="dash-split">
          <div className="dash-panel">
            <h3>Статусы сессий (период)</h3>
            {ai ? (
              <ul className="dash-status">
                <li>
                  <i className="dot dot-on" /> Активные <b>{ai.sessions.by_status.active}</b>
                </li>
                <li>
                  <i className="dot dot-go" /> Переданы менеджеру <b>{ai.sessions.by_status.handed_off}</b>
                </li>
                <li>
                  <i className="dot" /> Закрыты <b>{ai.sessions.by_status.closed}</b>
                </li>
              </ul>
            ) : null}
            <p className="dash-note">
              Ср. {ai ? ai.averages.user_messages_per_session : '—'} сообщ./сессия ·{' '}
              {ai ? num(ai.averages.tokens_per_session) : '—'} ток./сессия
            </p>
            <p className="dash-note">
              Тариф: ${data?.rates.input_per_mtok}/млн in · ${data?.rates.output_per_mtok}/млн out · курс{' '}
              {data?.rates.usd_to_rub} ₽/$
            </p>
          </div>
          <div className="dash-panel">
            <h3>Расход по типу вызова LLM</h3>
            {ai && ai.llm_calls.breakdown.length > 0 ? (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Вызов</th>
                    <th>Раз</th>
                    <th>Токены</th>
                    <th>₽</th>
                    <th>$</th>
                  </tr>
                </thead>
                <tbody>
                  {ai.llm_calls.breakdown.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label_ru || r.label}</td>
                      <td>{r.calls}</td>
                      <td>
                        {num(r.prompt_tokens)}+{num(r.completion_tokens)}
                      </td>
                      <td>{moneyRub(r.cost_rub ?? 0)}</td>
                      <td>{moneyUsd(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="dash-empty">Пока нет размеченных вызовов (появятся после новых диалогов)</p>
            )}
          </div>
        </div>

        <div className="dash-panel">
          <h3>По дням — сессии и расход</h3>
          <div className="dash-daily">
            {ai?.daily.map((d) => (
              <div key={d.date} className="dash-daily-col" title={`${d.date}: ${d.sessions} сессий, ${moneyRub(d.cost_rub)}`}>
                <div className="dash-daily-stack">
                  <div
                    className="dash-daily-sess"
                    style={{ height: `${Math.max(4, (d.sessions / maxDailySess) * 72)}px` }}
                  />
                  <div
                    className="dash-daily-cost"
                    style={{ height: `${Math.max(3, (d.cost_usd / maxDailyCost) * 36)}px` }}
                  />
                </div>
                <span>{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="dash-note">Столбик сверху — сессии, снизу — расход $</p>
        </div>
      </section>

      <section className="dash-sec">
        <div className="dash-sec-h">
          <h2>Журнал сессий ИИ</h2>
          <div className="dash-period">
            {['', 'active', 'handed_off', 'closed'].map((s) => (
              <button
                key={s || 'all'}
                type="button"
                className={ledgerStatus === s ? 'is-on' : ''}
                onClick={() => setLedgerStatus(s)}
              >
                {s === '' ? 'все' : s === 'handed_off' ? 'handoff' : s}
              </button>
            ))}
          </div>
        </div>
        <div className="dash-panel dash-panel-table">
          <table className="dash-table dash-table-wide">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Статус</th>
                <th>Запрос</th>
                <th>Msg</th>
                <th>Токены</th>
                <th>LLM</th>
                <th>₽</th>
                <th>$</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{fmtDate(r.created_at)}</td>
                  <td>
                    <span className={`dash-st dash-st-${r.status}`}>{r.status}</span>
                  </td>
                  <td className="dash-clip" title={r.query_preview}>
                    {r.query_preview}
                  </td>
                  <td>{r.messages_count}</td>
                  <td>
                    {num(r.tokens_in)}/{num(r.tokens_out)}
                  </td>
                  <td>{r.llm_calls}</td>
                  <td className="nowrap">{moneyRub(r.cost_rub)}</td>
                  <td className="nowrap">{moneyUsd(r.cost_usd)}</td>
                </tr>
              ))}
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dash-empty">
                    Сессий за период нет
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="dash-pager">
            <span>
              {ledgerMeta.total} сессий · стр. {ledgerMeta.page}/{ledgerMeta.last}
            </span>
            <div>
              <button
                type="button"
                disabled={ledgerMeta.page <= 1}
                onClick={() => void loadLedger(ledgerMeta.page - 1)}
              >
                ←
              </button>
              <button
                type="button"
                disabled={ledgerMeta.page >= ledgerMeta.last}
                onClick={() => void loadLedger(ledgerMeta.page + 1)}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </section>

      <p className="dash-foot">
        Обновлено {data?.generated_at ? new Date(data.generated_at).toLocaleString('ru-RU') : '—'} · цифры ИИ только
        внутри админки, на витрину не отдаются
      </p>
    </div>
  )
}
