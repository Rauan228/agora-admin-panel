import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { LogoUpload } from '../components/LogoUpload'
import { SupplierPicker } from '../components/SupplierPicker'
import type { Category, Dictionaries, Offer } from '../types'

export function OfferFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [categories, setCategories] = useState<Category[]>([])
  const [dicts, setDicts] = useState<Dictionaries | null>(null)

  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [offerTitle, setOfferTitle] = useState('')
  const [priceValue, setPriceValue] = useState('')
  const [currency, setCurrency] = useState('RUB')
  const [priceBasis, setPriceBasis] = useState('шт')
  const [moqValue, setMoqValue] = useState('1')
  const [stockStatus, setStockStatus] = useState('В наличии')
  const [productionLead, setProductionLead] = useState('')
  const [deliveryLead, setDeliveryLead] = useState('')
  const [regions, setRegions] = useState<string[]>(['Москва'])
  const [pickup, setPickup] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState('Безнал')
  const [vatRate, setVatRate] = useState('20')
  const [branding, setBranding] = useState(false)
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [specs, setSpecs] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(categoryId)),
    [categories, categoryId],
  )

  useEffect(() => {
    Promise.all([
      api<{ data: Category[] }>('/admin/meta/categories'),
      api<Dictionaries>('/admin/meta/dictionaries'),
    ])
      .then(([cats, d]) => {
        setCategories(cats.data)
        setDicts(d)
        if (!isEdit && cats.data[0]) setCategoryId(String(cats.data[0].id))
        if (!isEdit && d.dictionaries.price_basis?.[0]) setPriceBasis(d.dictionaries.price_basis[0])
      })
      .finally(() => {
        if (!isEdit) setLoading(false)
      })
  }, [isEdit])


  useEffect(() => {
    if (!id) return
    api<{ data: Offer }>(`/admin/offers/${id}`)
      .then((res) => {
        const o = res.data
        setCategoryId(String(o.category_id))
        setSupplierId(String(o.supplier_id))
        setOfferTitle(o.offer_title)
        setPriceValue(String(o.price_value))
        setCurrency(o.currency)
        setPriceBasis(o.price_basis)
        setMoqValue(String(o.moq_value))
        setStockStatus(o.stock_status)
        setProductionLead(o.production_lead_days != null ? String(o.production_lead_days) : '')
        setDeliveryLead(o.delivery_lead_days != null ? String(o.delivery_lead_days) : '')
        setRegions(o.delivery_regions || [])
        setPickup(o.pickup_available)
        setPaymentTerms(o.payment_terms)
        setVatRate(o.vat_rate)
        setBranding(o.branding_available)
        setDescription(o.description_short || '')
        setIsActive(o.is_active)
        setPhotoUrl(o.photo_url)
        const s: Record<string, string> = {}
        Object.entries(o.specs || {}).forEach(([k, v]) => {
          s[k] = String(v)
        })
        setSpecs(s)
      })
      .finally(() => setLoading(false))
  }, [id])

  function toggleRegion(region: string) {
    setRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region],
    )
  }

  function setSpec(key: string, value: string) {
    setSpecs((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const fd = new FormData()
      fd.append('category_id', categoryId)
      fd.append('supplier_id', supplierId)
      fd.append('offer_title', offerTitle)
      fd.append('price_value', priceValue)
      fd.append('currency', currency)
      fd.append('price_basis', priceBasis)
      fd.append('moq_value', moqValue)
      fd.append('stock_status', stockStatus)
      if (productionLead !== '') fd.append('production_lead_days', productionLead)
      if (deliveryLead !== '') fd.append('delivery_lead_days', deliveryLead)
      regions.forEach((r) => fd.append('delivery_regions[]', r))
      fd.append('pickup_available', pickup ? '1' : '0')
      fd.append('payment_terms', paymentTerms)
      fd.append('vat_rate', vatRate)
      fd.append('branding_available', branding ? '1' : '0')
      fd.append('is_active', isActive ? '1' : '0')
      if (description) fd.append('description_short', description)
      if (photo) fd.append('photo', photo)

      // specs as nested FormData keys
      Object.entries(specs).forEach(([k, v]) => {
        if (v !== '') fd.append(`specs[${k}]`, v)
      })
      // also send JSON for reliability
      fd.append('specs', JSON.stringify(specs))

      if (isEdit) {
        await api(`/admin/offers/${id}`, { method: 'POST', formData: fd })
      } else {
        await api('/admin/offers', { method: 'POST', formData: fd })
      }
      navigate('/offers')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !dicts) return <div className="text-sm text-slate-500">Загрузка…</div>

  const d = dicts.dictionaries

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/offers" className="text-sm text-slate-500 hover:underline">
          ← К списку
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{isEdit ? 'Редактировать оффер' : 'Новый оффер'}</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 rounded-xl border bg-white p-6">
        {Object.keys(errors).length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <ul className="list-inside list-disc">
              {Object.entries(errors).flatMap(([k, msgs]) =>
                msgs.map((m) => (
                  <li key={`${k}-${m}`}>
                    {k}: {m}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Общие поля
          </h2>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Название оффера *</span>
            <input
              required
              minLength={5}
              maxLength={180}
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Гофрокороб Т-23 B 400x300x200"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Категория *</span>
              <select
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setSpecs({})
                }}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="" disabled>
                  Выберите…
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="md:col-span-2">
              <SupplierPicker
                value={supplierId}
                onChange={setSupplierId}
                required
              />
            </div>


            <label className="block text-sm">
              <span className="mb-1 block font-medium">Цена *</span>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Валюта *</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {(dicts.currencies || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Единица продажи *</span>
              <select
                value={priceBasis}
                onChange={(e) => setPriceBasis(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {(d.price_basis || []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">MOQ *</span>
              <input
                required
                type="number"
                min={1}
                value={moqValue}
                onChange={(e) => setMoqValue(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Наличие *</span>
              <select
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {(d.stock_status || []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Условия оплаты *</span>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {(d.payment_terms || []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">НДС *</span>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {(d.vat_rate || []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Срок производства (дн.)</span>
              <input
                type="number"
                min={0}
                max={180}
                value={productionLead}
                onChange={(e) => setProductionLead(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Срок доставки (дн.)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={deliveryLead}
                onChange={(e) => setDeliveryLead(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>

          <div className="text-sm">
            <span className="mb-2 block font-medium">Регионы поставки *</span>
            <div className="flex flex-wrap gap-3">
              {(d.delivery_region || []).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={regions.includes(r)}
                    onChange={() => toggleRegion(r)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
              Самовывоз
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={branding}
                onChange={(e) => setBranding(e.target.checked)}
              />
              Брендирование
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Опубликован
            </label>
          </div>

          <LogoUpload
            label="Фото оффера"
            existingUrl={photoUrl}
            file={photo}
            onFileChange={setPhoto}
            hint="PNG, JPG или WebP · до 5 МБ · лучше горизонтальное 800–1200 px"
          />


          <label className="block text-sm">
            <span className="mb-1 block font-medium">Описание</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
        </section>

        {selectedCategory && selectedCategory.fields.length > 0 && (
          <section className="space-y-4 border-t pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Характеристики: {selectedCategory.name}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {selectedCategory.fields.map((field) => {
                const options = field.dictionary ? d[field.dictionary] || [] : []
                return (
                  <label key={field.key} className="block text-sm">
                    <span className="mb-1 block font-medium">
                      {field.label}
                      {field.required ? ' *' : ''}
                      {field.unit ? ` (${field.unit})` : ''}
                    </span>
                    {field.type === 'enum' ? (
                      <select
                        required={field.required}
                        value={specs[field.key] || ''}
                        onChange={(e) => setSpec(field.key, e.target.value)}
                        className="w-full rounded-lg border px-3 py-2"
                      >
                        <option value="">—</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        required={field.required}
                        min={field.min}
                        max={field.max}
                        step="any"
                        value={specs[field.key] || ''}
                        onChange={(e) => setSpec(field.key, e.target.value)}
                        className="w-full rounded-lg border px-3 py-2"
                      />
                    )}
                  </label>
                )
              })}
            </div>
          </section>
        )}

        <div className="flex gap-2 border-t pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <Link to="/offers" className="rounded-lg border px-4 py-2 text-sm">
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
