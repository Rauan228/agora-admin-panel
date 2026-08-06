import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { LogoUpload } from '../components/LogoUpload'
import type { Supplier } from '../types'

const empty = {
  commercial_name: '',
  legal_name: '',
  inn: '',
  legal_address: '',
  contact_person: '',
  phone: '',
  email: '',
  website: '',
  telegram: '',
  cities_csv: '',
  is_active: true,
}

export function SupplierFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [logo, setLogo] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    api<{ data: Supplier }>(`/admin/suppliers/${id}`)
      .then((res) => {
        const s = res.data
        setForm({
          commercial_name: s.commercial_name || '',
          legal_name: s.legal_name || '',
          inn: s.inn || '',
          legal_address: s.legal_address || '',
          contact_person: s.contact_person || '',
          phone: s.phone || '',
          email: s.email || '',
          website: s.website || '',
          telegram: s.telegram || '',
          cities_csv: (s.shipping_cities || []).join(', '),
          is_active: s.is_active,
        })
        setLogoUrl(s.logo_url)
        setRemoveLogo(false)
      })
      .finally(() => setLoading(false))
  }, [id])


  function setField(key: keyof typeof empty, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const fd = new FormData()
      fd.append('commercial_name', form.commercial_name)
      fd.append('legal_name', form.legal_name)
      fd.append('inn', form.inn)
      fd.append('legal_address', form.legal_address)
      fd.append('contact_person', form.contact_person)
      fd.append('phone', form.phone)
      fd.append('email', form.email)
      fd.append('website', form.website)
      fd.append('telegram', form.telegram)
      fd.append('is_active', form.is_active ? '1' : '0')
      form.cities_csv
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => fd.append('cities[]', c))
      if (logo) fd.append('logo', logo)
      if (isEdit && removeLogo && !logo) fd.append('remove_logo', '1')

      if (isEdit) {
        await api(`/admin/suppliers/${id}`, { method: 'POST', formData: fd })
      } else {
        await api('/admin/suppliers', { method: 'POST', formData: fd })
      }

      navigate('/suppliers')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Загрузка…</div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/suppliers" className="text-sm text-slate-500 hover:underline">
          ← К списку
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {isEdit ? 'Редактировать поставщика' : 'Новый поставщик'}
        </h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-6">
        {Object.keys(errors).length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <ul className="list-inside list-disc">
              {Object.entries(errors).flatMap(([k, msgs]) =>
                msgs.map((m) => <li key={`${k}-${m}`}>{m}</li>),
              )}
            </ul>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['commercial_name', 'Коммерческое название *', 'text'],
              ['legal_name', 'Юридическое название', 'text'],
              ['inn', 'ИНН *', 'text'],
              ['legal_address', 'Адрес регистрации', 'text'],
              ['contact_person', 'Контактное лицо', 'text'],
              ['phone', 'Телефон', 'text'],
              ['email', 'Email', 'email'],
              ['website', 'Сайт', 'url'],
              ['telegram', 'Telegram', 'text'],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block font-medium">{label}</span>
              <input
                type={type}
                value={String(form[key] ?? '')}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Города отгрузки</span>
          <input
            value={form.cities_csv}
            onChange={(e) => setField('cities_csv', e.target.value)}
            placeholder="Москва, Санкт-Петербург"
            className="w-full rounded-lg border px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">Через запятую</span>
        </label>

        <LogoUpload
          label="Логотип поставщика"
          existingUrl={logoUrl}
          file={logo}
          removed={removeLogo}
          onFileChange={(f) => {
            setLogo(f)
            if (f) setRemoveLogo(false)
          }}
          onRemoveExisting={() => {
            setLogo(null)
            setRemoveLogo(true)
          }}
        />


        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setField('is_active', e.target.checked)}
          />
          Активен (виден на витрине)
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <Link to="/suppliers" className="rounded-lg border px-4 py-2 text-sm">
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
