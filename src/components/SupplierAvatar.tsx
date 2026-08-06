/** Маленький логотип / заготовка для списков. */
export function SupplierAvatar({
  name,
  url,
  size = 36,
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
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 text-xs font-semibold text-slate-500"
      style={{ width: size, height: size }}
      title={name}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain p-0.5" />
      ) : (
        <span aria-hidden>{initials || '?'}</span>
      )}
    </div>
  )
}
