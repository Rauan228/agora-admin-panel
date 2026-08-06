import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'

export type SupplierOption = {
  id: number
  commercial_name: string
  legal_name?: string | null
  inn?: string | null
  logo_url?: string | null
  is_active?: boolean
}

type Props = {
  value: string
  onChange: (id: string) => void
  required?: boolean
  /** начальный список (опционально) */
  initialOptions?: SupplierOption[]
}

/**
 * Поиск + выбор поставщика с логотипом.
 * Ищет по commercial_name / legal_name / ИНН (сервер ?q=).
 */
export function SupplierPicker({ value, onChange, required, initialOptions = [] }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<SupplierOption[]>(initialOptions)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SupplierOption | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<number | null>(null)

  // синхронизация выбранльного списка
  useEffect(() => {
    if (initialOptions.length) setOptions(initialOptions)
  }, [initialOptions])

  // подтянуть выбранного поставщика, если value задан
  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    const fromList = options.find((s) => String(s.id) === String(value))
    if (fromList) {
      setSelected(fromList)
      return
    }
    // fallback: точечный запрос meta (поиск по id через полный список без q)
    api<{ data: SupplierOption[] }>(`/admin/meta/suppliers?limit=200`)
      .then((res) => {
        setOptions(res.data)
        const found = res.data.find((s) => String(s.id) === String(value))
        if (found) setSelected(found)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // debounce search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('limit', '50')
      api<{ data: SupplierOption[] }>(`/admin/meta/suppliers?${params}`)
        .then((res) => setOptions(res.data))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => options, [options])

  function pick(s: SupplierOption) {
    setSelected(s)
    onChange(String(s.id))
    setQuery('')
    setOpen(false)
  }

  function clear() {
    setSelected(null)
    onChange('')
    setQuery('')
    setOpen(true)
  }

  return (
    <div ref={wrapRef} className="block text-sm">
      <span className="mb-1 block font-medium">
        Поставщик {required ? '*' : ''}
      </span>

      {/* выбранный + лого */}
      {selected && !open ? (
        <div className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2">
          <LogoThumb name={selected.commercial_name} url={selected.logo_url} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{selected.commercial_name}</div>
            {selected.inn && (
              <div className="text-xs text-slate-500">ИНН {selected.inn}</div>
            )}
          </div>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-slate-50"
          >
            Сменить
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Поиск: название или ИНН…"
            className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900"
            autoComplete="off"
            required={required && !value}
          />
          {/* hidden input for HTML5 required when closed */}
          <input type="hidden" value={value} required={required} readOnly />

          {open && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-sm">
              {loading && (
                <div className="px-3 py-2 text-xs text-slate-400">Ищем…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-slate-400">
                  Никого не нашли. Добавьте поставщика во вкладке «Поставщики».
                </div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${
                    String(s.id) === String(value) ? 'bg-slate-50' : ''
                  }`}
                >
                  <LogoThumb name={s.commercial_name} url={s.logo_url} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.commercial_name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {s.inn ? `ИНН ${s.inn}` : s.legal_name || '—'}
                      {s.is_active === false ? ' · скрыт' : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* крупный превью-блок логотипа выбранного */}
      {selected && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
          <LogoThumb name={selected.commercial_name} url={selected.logo_url} size={56} />
          <div className="text-xs text-slate-500">
            {selected.logo_url ? (
              <>Логотип поставщика будет виден на витрине рядом с оффером.</>
            ) : (
              <>
                Логотипа нет — заготовка. Добавьте файл в карточке поставщика
                («Поставщики» → изменить).
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LogoThumb({
  name,
  url,
  size = 40,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white text-xs font-semibold text-slate-500"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain p-0.5" />
      ) : (
        <span>{initials || '?'}</span>
      )}
    </div>
  )
}
