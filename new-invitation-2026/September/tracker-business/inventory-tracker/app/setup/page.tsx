"use client"

import { useMemo, useState } from "react"
import { BrandMark, Field, ghostBtn, inputClass, primaryBtn } from "@/components/ui"
import { useTracker } from "@/components/tracker-provider"
import { brandMonogram, safeColor, type Settings } from "@/lib/rental"

const pageColors = [
  { name: "Blush", value: "#f6ece8" },
  { name: "Ivory", value: "#f6f1e6" },
  { name: "Mist", value: "#e7f0ec" },
  { name: "Sky", value: "#e8eef6" },
  { name: "Sand", value: "#f3eee6" },
  { name: "Lilac", value: "#f3eaf2" },
]

const adaptations = [
  {
    icon: "dress",
    tone: "bg-[#fde8ea] text-[#c45c6c]",
    title: "Gown / costume rental",
    text: "Size is the variant. Long gowns and two-piece sets stay grouped.",
    noun: "Gowns",
    variant: "Size",
    categories: ["Long Gown", "Midi Gown", "Two Piece"],
  },
  {
    icon: "camera",
    tone: "bg-[#e8eef6] text-[#6d8fbf]",
    title: "Equipment rental",
    text: "Model is the variant. Cameras and lighting share one inventory.",
    noun: "Equipment",
    variant: "Model",
    categories: ["Cameras", "Lighting"],
  },
  {
    icon: "chair",
    tone: "bg-[#f8f1e4] text-[#a07d32]",
    title: "Furniture & event styling",
    text: "Finish is the variant. Tables and backdrops stay easy to filter.",
    noun: "Pieces",
    variant: "Finish",
    categories: ["Tables", "Backdrops"],
  },
  {
    icon: "car",
    tone: "bg-[#fdeceb] text-[#c4475c]",
    title: "Vehicle rental",
    text: "Plate or model is the variant. Sedans and vans are their own groups.",
    noun: "Vehicles",
    variant: "Plate / Model",
    categories: ["Sedan", "Van"],
  },
]

const panel = "overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(90,50,40,0.04)]"
const textAreaClass =
  "min-h-24 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage"

export default function SetupPage() {
  const { settings, items, payments, updateSettings, setLogo, clearLogo, addCategory, removeCategory } = useTracker()
  const [business, setBusiness] = useState({
    businessName: settings.businessName,
    currencySymbol: settings.currencySymbol,
    itemNoun: settings.itemNoun,
    variantLabel: settings.variantLabel,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    invoiceNote: settings.invoiceNote,
    returnNote: settings.returnNote,
  })
  const [look, setLook] = useState({
    brandName: settings.brandName || "Digital Aly",
    pageColor: safeColor(settings.pageColor),
  })
  const [categoryName, setCategoryName] = useState("")
  const [methodName, setMethodName] = useState("")
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [methodError, setMethodError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const nounPreview = business.itemNoun.trim() || "Items"
  const colorName = pageColors.find((swatch) => swatch.value === safeColor(look.pageColor).toLowerCase())?.name ?? "Custom"
  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.category, (counts.get(item.category) || 0) + 1)
    return counts
  }, [items])
  const methodCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const payment of payments) counts.set(payment.method, (counts.get(payment.method) || 0) + 1)
    return counts
  }, [payments])

  function draftedSettings(): Settings {
    return {
      ...settings,
      businessName: business.businessName.trim() || "Digital Aly",
      currencySymbol: business.currencySymbol.trim() || "₱",
      itemNoun: business.itemNoun.trim() || "Items",
      variantLabel: business.variantLabel.trim() || "Variant",
      phone: business.phone.trim(),
      email: business.email.trim(),
      address: business.address.trim(),
      invoiceNote: business.invoiceNote.trim(),
      returnNote: business.returnNote.trim(),
      brandName: look.brandName.trim() || "Digital Aly",
      pageColor: safeColor(look.pageColor),
    }
  }

  function saveBusiness(event: React.FormEvent) {
    event.preventDefault()
    const next = draftedSettings()
    updateSettings({
      businessName: next.businessName,
      currencySymbol: next.currencySymbol,
      itemNoun: next.itemNoun,
      variantLabel: next.variantLabel,
      phone: next.phone,
      email: next.email,
      address: next.address,
      invoiceNote: next.invoiceNote,
      returnNote: next.returnNote,
    })
  }

  function saveLook(event: React.FormEvent) {
    event.preventDefault()
    const next = draftedSettings()
    updateSettings({ brandName: next.brandName, pageColor: next.pageColor })
  }

  function onLogo(file: File | undefined) {
    setLogoError(null)
    if (!file) return
    if (file.size > 500 * 1024) {
      setLogoError("Keep the logo under 500KB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") setLogo(reader.result, file.name)
    }
    reader.readAsDataURL(file)
  }

  function onAddCategory(event: React.FormEvent) {
    event.preventDefault()
    const error = addCategory(categoryName)
    setCategoryError(error)
    if (!error) setCategoryName("")
  }

  function onRemoveCategory(name: string) {
    const count = itemCounts.get(name) || 0
    if (count > 0 && !window.confirm(`${count} ${count === 1 ? "item uses" : "items use"} ${name}. Remove the category anyway?`)) return
    removeCategory(name)
  }

  function onAddMethod(event: React.FormEvent) {
    event.preventDefault()
    const name = methodName.trim()
    if (!name) {
      setMethodError("Enter a payment method.")
      return
    }
    if (settings.paymentMethods.some((method) => method.toLowerCase() === name.toLowerCase())) {
      setMethodError("That method is already listed.")
      return
    }
    updateSettings({ paymentMethods: [...settings.paymentMethods, name] })
    setMethodName("")
    setMethodError(null)
  }

  function onRemoveMethod(name: string) {
    if (settings.paymentMethods.length <= 1) {
      setMethodError("Keep at least one payment method.")
      return
    }
    updateSettings({ paymentMethods: settings.paymentMethods.filter((entry) => entry !== name) })
    setMethodError(null)
  }

  function applyAdaptation(row: (typeof adaptations)[number]) {
    setBusiness((current) => ({ ...current, itemNoun: row.noun, variantLabel: row.variant }))
    const categories = [...settings.categories]
    for (const name of row.categories) {
      if (!categories.some((category) => category.toLowerCase() === name.toLowerCase())) categories.push(name)
    }
    updateSettings({ itemNoun: row.noun, variantLabel: row.variant, categories })
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Categories" value={String(settings.categories.length)} hint={`${items.length} ${items.length === 1 ? "item" : "items"} in inventory`} icon="list" />
        <Stat label="Payment methods" value={String(settings.paymentMethods.length)} hint={`${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded`} icon="card" />
        <Stat label="Brand" value={look.brandName.trim() || "Digital Aly"} hint="Script in the header" icon="mark" />
        <Stat label="Page color" value={colorName} hint="Background on every screen" icon="color" swatch={safeColor(look.pageColor)} />
      </section>

      <form onSubmit={saveBusiness} className={panel}>
        <PanelHead title="Business details" note="Printed on invoices and booking details" />
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
          <Field label="Business name">
            <input className={inputClass} value={business.businessName} onChange={(event) => setBusiness((current) => ({ ...current, businessName: event.target.value }))} />
          </Field>
          <Field label={`What you rent out (plural) — currently “${nounPreview}”`}>
            <input className={inputClass} value={business.itemNoun} onChange={(event) => setBusiness((current) => ({ ...current, itemNoun: event.target.value }))} />
          </Field>
          <Field label="Currency symbol">
            <input className={inputClass} value={business.currencySymbol} onChange={(event) => setBusiness((current) => ({ ...current, currencySymbol: event.target.value }))} />
          </Field>
          <Field label="Variant field label">
            <input className={inputClass} value={business.variantLabel} onChange={(event) => setBusiness((current) => ({ ...current, variantLabel: event.target.value }))} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} inputMode="tel" value={business.phone} onChange={(event) => setBusiness((current) => ({ ...current, phone: event.target.value }))} />
          </Field>
          <Field label="Email">
            <input className={inputClass} inputMode="email" value={business.email} onChange={(event) => setBusiness((current) => ({ ...current, email: event.target.value }))} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address">
              <textarea className={textAreaClass} value={business.address} onChange={(event) => setBusiness((current) => ({ ...current, address: event.target.value }))} />
            </Field>
          </div>
          <Field label="Invoice note">
            <textarea className={textAreaClass} value={business.invoiceNote} onChange={(event) => setBusiness((current) => ({ ...current, invoiceNote: event.target.value }))} />
          </Field>
          <Field label="Return note">
            <textarea className={textAreaClass} value={business.returnNote} onChange={(event) => setBusiness((current) => ({ ...current, returnNote: event.target.value }))} />
          </Field>
          <div className="md:col-span-2">
            <button className={primaryBtn} type="submit">Save business details</button>
          </div>
        </div>
      </form>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <form onSubmit={saveLook} className={panel}>
          <PanelHead title="Brand and page color" note="The script and the background behind every tab" />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Brand name">
              <input className={inputClass} value={look.brandName} onChange={(event) => setLook((current) => ({ ...current, brandName: event.target.value }))} />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink">Page color</span>
              <div className="flex flex-wrap items-center gap-2">
                {pageColors.map((swatch) => {
                  const selected = safeColor(look.pageColor).toLowerCase() === swatch.value
                  return (
                    <button
                      key={swatch.value}
                      type="button"
                      aria-label={swatch.name}
                      aria-pressed={selected}
                      title={swatch.name}
                      className={`h-11 w-11 rounded-full border-2 shadow-sm ${selected ? "border-ink" : "border-white"}`}
                      style={{ backgroundColor: swatch.value }}
                      onClick={() => setLook((current) => ({ ...current, pageColor: swatch.value }))}
                    />
                  )
                })}
                <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#e5d7d2] bg-white px-2 text-sm">
                  <input
                    type="color"
                    aria-label="Custom page color"
                    className="h-8 w-8 cursor-pointer border-0 bg-transparent p-0"
                    value={safeColor(look.pageColor)}
                    onChange={(event) => setLook((current) => ({ ...current, pageColor: event.target.value }))}
                  />
                  Custom
                </label>
              </div>
            </div>
            <button className={primaryBtn} type="submit">Save brand</button>
          </div>
        </form>

        <section className={panel}>
          <PanelHead title="Logo and preview" note="Stays in this browser" />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-3 rounded-xl border border-[#f0e4df] px-3 py-3" style={{ backgroundColor: safeColor(look.pageColor) }}>
              <BrandMark src={settings.logoDataUrl} mark={brandMonogram(look.brandName || "Digital Aly")} className="h-12 w-12" />
              <div className="min-w-0">
                <p className="truncate font-script text-3xl leading-none text-rose">{look.brandName.trim() || "Digital Aly"}</p>
                <p className="text-[10px] font-semibold tracking-[0.22em] text-rose uppercase">Rental Tracker</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className={`${ghostBtn} cursor-pointer`}>
                Choose logo
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onLogo(event.target.files?.[0])} />
              </label>
              <button
                type="button"
                className={ghostBtn}
                disabled={!settings.logoDataUrl}
                onClick={() => {
                  clearLogo()
                  setLogoError(null)
                }}
              >
                Remove logo
              </button>
            </div>
            <p className="text-xs text-muted">{settings.logoName || "A square PNG under 500KB works best. Saves to Google Drive and links in Setup."}</p>
            {logoError ? <p className="text-sm text-[#9a403c]">{logoError}</p> : null}
          </div>
        </section>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <section className={panel}>
          <PanelHead title="Categories" note={`Groups ${nounPreview.toLowerCase()} in inventory`} />
          <form onSubmit={onAddCategory} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <input className={inputClass} placeholder="New category" aria-label="New category" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            <button className={`${primaryBtn} shrink-0`} type="submit">Add category</button>
          </form>
          {categoryError ? <p className="px-4 pb-2 text-sm text-[#9a403c] sm:px-5">{categoryError}</p> : null}
          {settings.categories.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No categories yet.</p>
          ) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {settings.categories.map((category) => (
                  <li key={category} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0e4df] px-3 py-3">
                    <span>
                      <span className="block font-semibold">{category}</span>
                      <span className="text-xs text-muted">{itemCounts.get(category) || 0} items</span>
                    </span>
                    <button type="button" className="text-sm font-semibold text-[#c4475c]" aria-label={`Remove ${category}`} onClick={() => onRemoveCategory(category)}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Items</th>
                      <th className="px-4 py-2 text-right font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.categories.map((category) => (
                      <tr key={category} className="border-t border-[#f6eeeb]">
                        <td className="px-4 py-2.5 font-semibold">{category}</td>
                        <td className="px-3 py-2.5">{itemCounts.get(category) || 0}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button type="button" className="text-sm font-semibold text-[#c4475c]" aria-label={`Remove ${category}`} onClick={() => onRemoveCategory(category)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className={panel}>
          <PanelHead title="Payment methods" note="Shown when a payment is recorded" />
          <form onSubmit={onAddMethod} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <input className={inputClass} placeholder="New method" aria-label="New payment method" value={methodName} onChange={(event) => setMethodName(event.target.value)} />
            <button className={`${primaryBtn} shrink-0`} type="submit">Add method</button>
          </form>
          {methodError ? <p className="px-4 pb-2 text-sm text-[#9a403c] sm:px-5">{methodError}</p> : null}
          {settings.paymentMethods.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Add a method so payments can be recorded.</p>
          ) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {settings.paymentMethods.map((method) => (
                  <li key={method} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0e4df] px-3 py-3">
                    <span>
                      <span className="block font-semibold">{method}</span>
                      <span className="text-xs text-muted">{methodCounts.get(method) || 0} payments</span>
                    </span>
                    <button type="button" className="text-sm font-semibold text-[#c4475c]" aria-label={`Remove ${method}`} onClick={() => onRemoveMethod(method)}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Method</th>
                      <th className="px-3 py-2 font-semibold">Payments</th>
                      <th className="px-4 py-2 text-right font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.paymentMethods.map((method) => (
                      <tr key={method} className="border-t border-[#f6eeeb]">
                        <td className="px-4 py-2.5 font-semibold">{method}</td>
                        <td className="px-3 py-2.5">{methodCounts.get(method) || 0}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button type="button" className="text-sm font-semibold text-[#c4475c]" aria-label={`Remove ${method}`} onClick={() => onRemoveMethod(method)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </section>

      <section className={panel}>
        <PanelHead title="How this adapts" note="Apply a preset to set the noun, variant label, and any missing categories" />
        <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
          {adaptations.map((row) => (
            <li key={row.title} className="flex flex-col rounded-xl border border-[#f0e4df] p-3">
              <span className={`grid h-9 w-9 place-items-center rounded-full ${row.tone}`}>
                <AdaptIcon name={row.icon} />
              </span>
              <p className="mt-3 text-sm font-semibold">{row.title}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{row.text}</p>
              <button type="button" className={`${ghostBtn} mt-3 w-full`} onClick={() => applyAdaptation(row)}>
                Use this setup
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-[#fdf4f2] px-3 py-2 text-xs text-[#a56d66]">
        <HeartIcon />
        <span>TIP: The business name, phone, and address print on every invoice. Categories and the variant label shape the inventory form.</span>
      </p>
    </div>
  )
}

function PanelHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:px-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted">{note}</p>
    </div>
  )
}

function Stat({ label, value, hint, icon, swatch }: { label: string; value: string; hint: string; icon: string; swatch?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${icon === "list" ? "bg-[#e7f3ea] text-[#3c7a4e]" : icon === "card" ? "bg-[#f8f1e4] text-[#a07d32]" : icon === "mark" ? "bg-[#fde8ea] text-[#c45c6c]" : "bg-[#f3e4df] text-[#c47b73]"}`} aria-hidden>
        {swatch ? <span className="h-5 w-5 rounded-full border border-white" style={{ backgroundColor: swatch }} /> : <SetupIcon name={icon} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</span>
        <span className="block truncate text-2xl font-semibold text-ink">{value}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </div>
  )
}

function SetupIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {name === "list" && <path d="M8 7h11M8 12h11M8 17h11M5 7h.01M5 12h.01M5 17h.01" />}
      {name === "card" && (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </>
      )}
      {name === "mark" && <path d="M12 19c4-3 6-6 6-8.5a3.5 3.5 0 0 0-6-2.4 3.5 3.5 0 0 0-6 2.4C6 13 8 16 12 19z" />}
    </svg>
  )
}

function AdaptIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      {name === "dress" && <path d="M9 4l3 3 3-3 3 4-3 2v11H9V10L6 8l3-4z" />}
      {name === "camera" && (
        <>
          <path d="M4 8h4l2-2h4l2 2h4v10H4z" />
          <circle cx="12" cy="13" r="3" />
        </>
      )}
      {name === "chair" && <path d="M7 4h10v7H7zM6 11h12v2H6zM8 13v7M16 13v7" />}
      {name === "car" && <path d="M4 14l2-5h12l2 5v4h-2a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0H4v-4z" />}
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
    </svg>
  )
}
