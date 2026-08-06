import { useEffect, useId, useState } from 'react'

const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
const MAX_BYTES = 5 * 1024 * 1024

type Props = {
  label?: string
  /** текущий URL с сервера */
  existingUrl?: string | null
  /** выбранный файл */
  file: File | null
  onFileChange: (file: File | null) => void
  /** пометить удаление текущего логотипа */
  onRemoveExisting?: () => void
  removed?: boolean
  hint?: string
}

/**
 * Загрузка логотипа: плейсхолдер → превью после выбора.
 * Форматы: PNG, JPG, WebP. До 5 МБ. Рекомендуется квадрат 200–1024 px.
 */
export function LogoUpload({
  label = 'Логотип',
  existingUrl,
  file,
  onFileChange,
  onRemoveExisting,
  removed = false,
  hint,
}: Props) {
  const inputId = useId()
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setLocalPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setLocalPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shownUrl = localPreview || (!removed ? existingUrl : null)

  function onPick(f: File | null) {
    setError(null)
    if (!f) {
      onFileChange(null)
      return
    }
    const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(f.type)
    if (!okType) {
      setError('Только PNG, JPG или WebP')
      onFileChange(null)
      return
    }
    if (f.size > MAX_BYTES) {
      setError('Файл больше 5 МБ')
      onFileChange(null)
      return
    }
    onFileChange(f)
  }

  return (
    <div className="block text-sm">
      <span className="mb-2 block font-medium">{label}</span>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="logo-box flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50"
          title={shownUrl ? 'Логотип' : 'Заготовка логотипа'}
        >
          {shownUrl ? (
            <img src={shownUrl} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <div className="px-2 text-center text-xs text-slate-400">
              <div className="mb-1 text-2xl leading-none">▣</div>
              нет лого
            </div>
          )}
        </div>

        <div className="min-w-[200px] flex-1 space-y-2">
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            {shownUrl ? 'Заменить файл' : 'Выбрать файл'}
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
          {(file || (existingUrl && !removed)) && (
            <button
              type="button"
              className="ml-2 text-sm text-red-600 underline"
              onClick={() => {
                onFileChange(null)
                onRemoveExisting?.()
              }}
            >
              Убрать
            </button>
          )}
          <p className="text-xs text-slate-500">
            {hint ||
              'PNG, JPG или WebP · до 5 МБ · лучше квадрат 200–1024 px (прозрачный PNG ок)'}
          </p>
          {file && (
            <p className="text-xs text-slate-600">
              Выбрано: {file.name} ({(file.size / 1024).toFixed(0)} КБ)
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
