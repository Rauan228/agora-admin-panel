export type User = { id: number; name: string; email: string }

export type Supplier = {
  id: number
  commercial_name: string
  legal_name: string | null
  inn: string
  legal_address: string | null
  logo_url: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  website: string | null
  telegram: string | null
  is_active: boolean
  shipping_cities: string[]
}

export type CategoryField = {
  key: string
  label: string
  type: 'string' | 'number' | 'enum' | 'boolean'
  dictionary?: string
  unit?: string
  min?: number
  max?: number
  required?: boolean
}

export type Category = {
  id: number
  slug: string
  name: string
  priority: string
  sort_order: number
  fields: CategoryField[]
}

export type Offer = {
  id: number
  offer_title: string
  supplier_id: number
  supplier?: { id: number; commercial_name: string }
  category_id: number
  category?: { id: number; slug: string; name: string }
  price_value: number
  currency: string
  price_basis: string
  moq_value: number
  stock_status: string
  production_lead_days: number | null
  delivery_lead_days: number | null
  delivery_regions: string[]
  pickup_available: boolean
  payment_terms: string
  vat_rate: string
  branding_available: boolean
  photo_url: string | null
  description_short: string | null
  specs: Record<string, string | number | boolean>
  is_active: boolean
}

export type Paginated<T> = {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type Dictionaries = {
  currencies: string[]
  dictionaries: Record<string, string[]>
}
