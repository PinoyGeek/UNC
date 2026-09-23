"use client"

import { useEffect, useMemo, useState } from "react"
import { useTracker } from "@/components/tracker-provider"
import { Field, ghostBtn, inputClass, primaryBtn } from "@/components/ui"
import {
  inventoryNote,
  inventoryStatus,
  inventoryStatusLabel,
  isLowStock,
  mediaUrl,
  money,
  nextItemCode,
  todayISO,
  type InventoryStatus,
  type Item,
  type ItemCondition,
  type ItemStatusOverride,
  itemConditions,
} from "@/lib/rental"

const overrides: { value: ItemStatusOverride; label: string }[] = [
  { value: "none", label: "None — auto-managed" },
  { value: "available", label: "Available" },
  { value: "upcoming", label: "Upcoming" },
  { value: "rented", label: "Rented Out" },
  { value: "maintenance", label: "Maintenance" },
]

const statusFilters: { value: "All" | InventoryStatus; label: string }[] = [
  { value: "All", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "upcoming", label: "Upcoming" },
  { value: "rented", label: "Rented Out" },
  { value: "maintenance", label: "Maintenance" },
]

type FormState = {
  id: string
  code: string
  name: string
  category: string
  variant: string
  dailyRate: string
  deposit: string
  quantity: string
  condition: ItemCondition
  statusOverride: ItemStatusOverride
  notes: string
  photoDataUrl: string | null
  photoName: string
}

const emptyForm: FormState = {
  id: "",
  code: "",
  name: "",
  category: "",
  variant: "",
  dailyRate: "",
  deposit: "",
  quantity: "1",
  condition: "Excellent",
  statusOverride: "none",
  notes: "",
  photoDataUrl: null,
  photoName: "",
}

export default function InventoryPage() {
  const { settings, items, bookings, compose, setCompose, saveItem, removeItem, sheetSync } = useTracker()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [statusFilter, setStatusFilter] = useState<"All" | InventoryStatus>("All")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const today = todayISO()

  function blankForm(): FormState {
    return {
      ...emptyForm,
      code: nextItemCode(items),
      category: settings.categories[0] ?? "",
    }
  }

  useEffect(() => {
    if (compose === "item") {
      setOpen(true)
      setForm(blankForm())
      setError(null)
      setPhotoError(null)
      setCompose(null)
    }
    // Open once when another page asks for a new item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose, setCompose])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const counted = useMemo(() => {
    return items.map((item) => ({
      item,
      status: inventoryStatus(item, bookings, today),
      note: inventoryNote(item, bookings),
      low: isLowStock(item, bookings, today),
    }))
  }, [items, bookings, today])

  const stats = useMemo(() => {
    return {
      total: counted.length,
      available: counted.filter((row) => row.status === "available").length,
      rented: counted.filter((row) => row.status === "rented").length,
      maintenance: counted.filter((row) => row.status === "maintenance").length,
      low: counted.filter((row) => row.low).length,
    }
  }, [counted])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return counted.filter(({ item, status }) => {
      const matchesCategory = category === "All" || item.category === category
      const matchesStatus = statusFilter === "All" || status === statusFilter
      const matchesQuery =
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.code.toLowerCase().includes(needle) ||
        item.variant.toLowerCase().includes(needle)
      return matchesCategory && matchesStatus && matchesQuery
    })
  }, [counted, query, category, statusFilter])

  const draftItem = useMemo<Item>(() => {
    return {
      id: form.id || "draft",
      code: form.code,
      name: form.name,
      category: form.category,
      variant: form.variant,
      dailyRate: Number(form.dailyRate) || 0,
      deposit: Number(form.deposit) || 0,
      quantity: Number(form.quantity) || 1,
      condition: form.condition,
      statusOverride: form.statusOverride,
      notes: form.notes,
      photoDataUrl: form.photoDataUrl,
      photoName: form.photoName,
    }
  }, [form])

  const draftStatus = inventoryStatus(draftItem, bookings, today)
  const categoryOptions = form.category && !settings.categories.includes(form.category)
    ? [form.category, ...settings.categories]
    : settings.categories

  function edit(id: string) {
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      variant: item.variant,
      dailyRate: String(item.dailyRate),
      deposit: String(item.deposit),
      quantity: String(item.quantity),
      condition: item.condition,
      statusOverride: item.statusOverride,
      notes: item.notes,
      photoDataUrl: item.photoDataUrl,
      photoName: item.photoName,
    })
    setError(null)
    setPhotoError(null)
    setOpen(true)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const message = saveItem({
      id: form.id || undefined,
      code: form.code,
      name: form.name,
      category: form.category || settings.categories[0] || "",
      variant: form.variant,
      dailyRate: Number(form.dailyRate),
      deposit: form.deposit.trim() === "" ? 0 : Number(form.deposit),
      quantity: Number(form.quantity) || 1,
      condition: form.condition,
      statusOverride: form.statusOverride,
      notes: form.notes,
      photoDataUrl: form.photoDataUrl,
      photoName: form.photoName,
    })
    setError(message)
    if (!message) {
      setOpen(false)
      setForm(emptyForm)
    }
  }

  async function onPhoto(file: File | undefined) {
    setPhotoError(null)
    if (!file) return
    try {
      const photo = await compressPhoto(file)
      setForm((current) => ({ ...current, photoDataUrl: photo.dataUrl, photoName: photo.name }))
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : "Could not use that photo.")
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total items" value={stats.total} hint="All items in inventory" icon={<DressIcon />} />
        <StatCard label="Available" value={stats.available} hint="Ready to rent" icon={<PinIcon />} />
        <StatCard label="Rented out" value={stats.rented} hint="Currently rented" icon={<BoxIcon />} />
        <StatCard label="In maintenance" value={stats.maintenance} hint="Being cleaned / checked" icon={<CapsuleIcon />} />
        <StatCard label="Low stock" value={stats.low} hint="Needs attention" icon={<AlertIcon />} />
      </section>

      <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_10px_30px_rgba(90,50,40,0.05)] sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <h2 className="text-base font-semibold text-ink">All items</h2>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <input
              className={`${inputClass} sm:max-w-[220px]`}
              placeholder="Search name or code..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className={`${inputClass} sm:max-w-[180px]`} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="All">All categories</option>
              {settings.categories.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
            <select
              className={`${inputClass} sm:max-w-[170px]`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "All" | InventoryStatus)}
            >
              {statusFilters.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={`${primaryBtn} shrink-0`}
              onClick={() => {
                setForm(blankForm())
                setError(null)
                setPhotoError(null)
                setOpen(true)
              }}
            >
              + Add new item
            </button>
          </div>
        </div>

        {error && !open ? <p className="mt-3 text-sm text-[#9a403c]">{error}</p> : null}
        <SheetLine sync={sheetSync} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-[11px] tracking-wide text-white uppercase">
                {["Photo", "Code", "Name", "Category", "Variant", "Rate", "Deposit", "Status", "Condition", "Notes"].map((label, index) => (
                  <th key={label} className={`bg-[#5e7464] px-3 py-2.5 font-semibold ${index === 0 ? "rounded-l-lg" : ""}`}>{label}</th>
                ))}
                <th className="w-16 rounded-r-lg bg-[#5e7464] px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-muted">No items match.</td>
                </tr>
              ) : (
                rows.map(({ item, status, note }) => (
                  <tr key={item.id} className="border-b border-line">
                    <td className="border-b border-line px-3 py-3">
                      <PhotoThumb src={item.photoDataUrl} alt={item.name} />
                    </td>
                    <td className="border-b border-line px-3 py-3 text-[13px] whitespace-nowrap text-ink">{item.code}</td>
                    <td className="border-b border-line px-3 py-3 font-semibold whitespace-nowrap">{item.name}</td>
                    <td className="border-b border-line px-3 py-3">{item.category}</td>
                    <td className="border-b border-line px-3 py-3">{item.variant || "—"}</td>
                    <td className="border-b border-line px-3 py-3">{money(settings.currencySymbol, item.dailyRate)}</td>
                    <td className="border-b border-line px-3 py-3">{money(settings.currencySymbol, item.deposit)}</td>
                    <td className="border-b border-line px-3 py-3">
                      <ItemStatusPill status={status} />
                    </td>
                    <td className="border-b border-line px-3 py-3">{item.condition}</td>
                    <td className="border-b border-line px-3 py-3 text-muted">{note || "—"}</td>
                    <td className="border-b border-line px-2 py-3 text-right whitespace-nowrap">
                      <button type="button" className="mr-1 inline-grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-blush hover:text-ink" aria-label={`Edit ${item.name}`} onClick={() => edit(item.id)}>
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fdeceb] hover:text-[#9a403c]"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => {
                          if (!window.confirm(`Remove ${item.name}?`)) return
                          const message = removeItem(item.id)
                          setError(message)
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs font-bold tracking-wide text-ink uppercase">Total items: {rows.length}</p>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-[#f8e3e0] px-4 py-3 text-sm text-[#8d5c58]">
        <HeartIcon />
        <span><span className="font-semibold">TIP:</span> Update inventory status regularly to avoid double bookings and keep your data accurate.</span>
      </p>

      {open ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#3c302d]/35 p-4" onMouseDown={() => setOpen(false)}>
          <form
            onSubmit={onSubmit}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(60,40,30,0.18)] sm:p-6"
            aria-labelledby="item-dialog-title"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="item-dialog-title" className="text-lg font-semibold">{form.id ? "Edit item" : "Add new item"}</h2>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-blush" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <PhotoThumb src={form.photoDataUrl} alt={form.name || "Item photo"} large />
              <div className="min-w-0">
                <p className="mb-1 text-[13px] font-semibold">Photo</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="block max-w-full text-sm text-transparent file:mr-3 file:rounded-md file:border file:border-[#ddd0cb] file:bg-white file:px-2.5 file:py-1 file:text-sm file:text-ink"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      void onPhoto(file)
                      event.target.value = ""
                    }}
                  />
                  <span className="text-sm text-muted">{form.photoName || "No file chosen"}</span>
                </div>
                {form.photoDataUrl ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted underline"
                    onClick={() => setForm({ ...form, photoDataUrl: null, photoName: "" })}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Item name">
                <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Code">
                <input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
              </Field>
              <Field label="Category">
                {categoryOptions.length ? (
                  <select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {categoryOptions.map((entry) => (
                      <option key={entry}>{entry}</option>
                    ))}
                  </select>
                ) : (
                  <input className={inputClass} value={form.category} placeholder="Category" onChange={(event) => setForm({ ...form, category: event.target.value })} />
                )}
              </Field>
              <Field label={settings.variantLabel}>
                <input className={inputClass} value={form.variant} onChange={(event) => setForm({ ...form, variant: event.target.value })} />
              </Field>
              <Field label="Rental rate">
                <input className={inputClass} inputMode="decimal" value={form.dailyRate} onChange={(event) => setForm({ ...form, dailyRate: event.target.value })} />
              </Field>
              <Field label="Deposit">
                <input className={inputClass} inputMode="decimal" value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />
              </Field>
              <Field label="Condition">
                <select className={inputClass} value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value as ItemCondition })}>
                  {itemConditions.map((entry) => (
                    <option key={entry}>{entry}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manual override">
                <select className={inputClass} value={form.statusOverride} onChange={(event) => setForm({ ...form, statusOverride: event.target.value as ItemStatusOverride })}>
                  {overrides.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="mt-3 rounded-lg bg-[#f8e8e6] px-3 py-2.5 text-sm text-ink">
              Current status: <span className="font-semibold">{inventoryStatusLabel(draftStatus)}</span>
              {" — "}
              {form.statusOverride === "none" ? "calculated automatically from bookings." : "set manually. Bookings still block double rentals."}
            </p>

            <div className="mt-3">
              <Field label="Notes">
                <textarea
                  className="min-h-20 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </Field>
            </div>

            {photoError ? <p className="mt-3 text-sm text-[#9a403c]">{photoError}</p> : null}
            {error ? <p className="mt-3 text-sm text-[#9a403c]">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className={ghostBtn} type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className={primaryBtn} type="submit">Save item</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function SheetLine({ sync }: { sync: "idle" | "loading" | "saving" | "saved" | "local" | "error" }) {
  if (sync === "idle" || sync === "loading") return null
  const text = {
    saving: "Updating Google Sheets…",
    saved: "Google Sheets updated.",
    local: "Saved on this device.",
    error: "Google Sheets sync failed. Your changes are still saved on this device.",
  }[sync]
  const tone = sync === "error" || sync === "local" ? "text-[#9a403c]" : "text-[#2f6b45]"
  return <p className={`mt-3 text-sm ${tone}`}>{text}</p>
}

function PhotoThumb({ src, alt, large = false }: { src: string | null; alt: string; large?: boolean }) {
  const size = large ? "h-16 w-14" : "h-11 w-10"
  const image = mediaUrl(src)
  return (
    <div className={`${size} overflow-hidden rounded-lg bg-[#f3e7e3]`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={alt} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[#c9b2ac]" aria-hidden>
          <DressIcon />
        </div>
      )}
    </div>
  )
}

function ItemStatusPill({ status }: { status: InventoryStatus }) {
  const tone = {
    available: "bg-[#e5f3e8] text-[#3c7a4e]",
    upcoming: "bg-[#fde7ea] text-[#c45c6c]",
    rented: "bg-[#fde0e4] text-[#c4475c]",
    maintenance: "bg-[#fbf3dc] text-[#a07d32]",
  }[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {inventoryStatusLabel(status)}
    </span>
  )
}

function StatCard({ label, value, hint, icon }: { label: string; value: number; hint: string; icon: React.ReactNode }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(90,50,40,0.05)]">
      <div className="grid h-10 w-10 shrink-0 place-items-center">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
        <p className="text-[1.65rem] leading-none font-semibold text-ink">{value}</p>
        <p className="mt-1 text-xs whitespace-nowrap text-muted">{hint}</p>
      </div>
    </article>
  )
}

function compressPhoto(file: File) {
  return new Promise<{ dataUrl: string; name: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read that photo."))
    reader.onload = () => {
      const source = typeof reader.result === "string" ? reader.result : ""
      const image = new Image()
      image.onload = () => {
        const max = 280
        const scale = Math.min(1, max / Math.max(image.width, image.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext("2d")
        if (!context) {
          reject(new Error("Could not prepare that photo."))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let quality = 0.72
        let dataUrl = canvas.toDataURL("image/jpeg", quality)
        while (dataUrl.length > 42000 && quality > 0.35) {
          quality -= 0.08
          dataUrl = canvas.toDataURL("image/jpeg", quality)
        }
        if (dataUrl.length > 48000) {
          reject(new Error("That photo is still too large. Try a smaller image."))
          return
        }
        resolve({ dataUrl, name: file.name })
      }
      image.onerror = () => reject(new Error("Could not read that photo."))
      image.src = source
    }
    reader.readAsDataURL(file)
  })
}

function DressIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#e7a0b4]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M9 4l3 3 3-3 2 3-2 2v2l4 10H5l4-10V9L7 7l2-3z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#e7a0b4]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8 4h8l-1 7h1l-4 9-4-9h1L8 4z" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#c4a15a]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </svg>
  )
}

function CapsuleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#6f967a]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M7 12h10" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#e0b15a]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 4l8 14H4L12 4z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20z" />
      <path d="M13.5 7.2l3.3 3.3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 12h6l1-12" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[#e07a72]" fill="currentColor" aria-hidden>
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
    </svg>
  )
}
