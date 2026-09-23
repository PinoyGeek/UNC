export type Settings = {
  businessName: string
  currencySymbol: string
  itemNoun: string
  variantLabel: string
  phone: string
  email: string
  address: string
  invoiceNote: string
  returnNote: string
  paymentMethods: string[]
  webAppUrl: string
  sheetUrl: string
  sheetKey: string
  shareSheet: boolean
  logoDataUrl: string | null
  logoName: string | null
  logoUrl: string
  brandName: string
  pageColor: string
  categories: string[]
}

export const itemConditions = ["Excellent", "Good", "Fair", "Damaged"] as const
export type ItemCondition = (typeof itemConditions)[number]

export const itemStatusOverrides = ["none", "available", "upcoming", "rented", "maintenance"] as const
export type ItemStatusOverride = (typeof itemStatusOverrides)[number]

export type InventoryStatus = "available" | "upcoming" | "rented" | "maintenance"

export type Item = {
  id: string
  code: string
  name: string
  category: string
  variant: string
  dailyRate: number
  deposit: number
  quantity: number
  condition: ItemCondition
  statusOverride: ItemStatusOverride
  notes: string
  photoDataUrl: string | null
  photoName: string
}

export type BookingStatus = "upcoming" | "confirmed" | "returned" | "cancelled"

export type BookingLine = {
  itemId: string
  quantity: number
  rate: number
}

export type Booking = {
  id: string
  code: string
  invoiceCode: string
  customer: string
  phone: string
  startDate: string
  endDate: string
  status: BookingStatus
  followUp: boolean
  discount: number
  deposit: number
  notes: string
  lines: BookingLine[]
  refundDate: string
  refundAmount: number
  refundMethod: string
  refundNotes: string
  itemId: string
  quantity: number
  dailyRate: number
}

export type Payment = {
  id: string
  bookingId: string
  amount: number
  method: string
  date: string
  note: string
  type: string
}

export type TrackerState = {
  settings: Settings
  items: Item[]
  bookings: Booking[]
  payments: Payment[]
}

export const STORAGE_KEY = "aly-rental-tracker-v1"

export const defaultSettings: Settings = {
  businessName: "Digital Aly",
  currencySymbol: "₱",
  itemNoun: "Items",
  variantLabel: "Variant",
  phone: "",
  email: "",
  address: "",
  invoiceNote: "Thank you for renting with us.",
  returnNote: "Please return each piece clean and on the agreed date.",
  paymentMethods: ["Cash", "GCash", "Bank transfer", "Card"],
  webAppUrl: "",
  sheetUrl: "",
  sheetKey: "",
  shareSheet: true,
  logoDataUrl: null,
  logoName: null,
  logoUrl: "",
  brandName: "Digital Aly",
  pageColor: "#f6ece8",
  categories: [
    "Long Gown",
    "Midi Gown",
    "Two Piece",
    "Photography Equipment",
    "Event Decor",
  ],
}

export function blankTrackerState(connection: {
  webAppUrl: string
  sheetUrl: string
  sheetKey: string
  shareSheet: boolean
}): TrackerState {
  return {
    settings: {
      ...defaultSettings,
      businessName: "",
      brandName: "",
      phone: "",
      email: "",
      address: "",
      invoiceNote: "",
      returnNote: "",
      paymentMethods: [],
      categories: [],
      webAppUrl: connection.webAppUrl.trim(),
      sheetUrl: connection.sheetUrl.trim(),
      sheetKey: connection.sheetKey.trim(),
      shareSheet: connection.shareSheet,
      logoDataUrl: null,
      logoName: null,
      logoUrl: "",
    },
    items: [],
    bookings: [],
    payments: [],
  }
}

export function safeColor(value: string | null | undefined, fallback = "#f6ece8") {
  const next = (value || "").trim()
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next) ? next : fallback
}

export function brandMonogram(name: string) {
  const word = name.trim().split(/\s+/).filter(Boolean).pop() || "aly"
  return word.slice(0, 6)
}

export function localISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function shiftDate(days: number) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return localISO(date)
}

export function todayISO() {
  return localISO(new Date())
}

export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function shortDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
  })
}

export function nextItemCode(items: Pick<Item, "code">[]) {
  const numbers = items
    .map((item) => Number(String(item.code).replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value))
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1
  return `NEW-${String(next).padStart(4, "0")}`
}

export function inventoryStatus(item: Item, bookings: Booking[], today = todayISO()): InventoryStatus {
  if (item.statusOverride && item.statusOverride !== "none") return item.statusOverride
  const related = bookings.filter((booking) => bookingLines(booking).some((line) => line.itemId === item.id) && booking.status !== "cancelled" && booking.status !== "returned")
  if (related.some((booking) => isConfirmed(booking.status) && booking.startDate <= today && booking.endDate >= today)) return "rented"
  if (related.some((booking) => booking.endDate >= today)) return "upcoming"
  return "available"
}

export function inventoryStatusLabel(status: InventoryStatus) {
  if (status === "rented") return "Rented Out"
  if (status === "upcoming") return "Upcoming"
  if (status === "maintenance") return "Maintenance"
  return "Available"
}

export function inventoryNote(item: Item, bookings: Booking[]) {
  const written = item.notes.trim()
  if (written) return written
  const out = bookings
    .filter((booking) => bookingLines(booking).some((line) => line.itemId === item.id) && isConfirmed(booking.status))
    .slice()
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0]
  if (out) return `Due ${shortDate(out.endDate)}`
  return ""
}

export function isLowStock(item: Item, bookings: Booking[], today = todayISO()) {
  const status = inventoryStatus(item, bookings, today)
  if (status === "rented" || status === "maintenance") return false
  return item.quantity - bookedQuantity(bookings, item.id, today, today) <= 0
}

export function rentalDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
  return Math.max(1, diff)
}

export function money(symbol: string, amount: number) {
  const formatted = amount.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return `${symbol}${formatted}`
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aStart <= bEnd && bStart <= aEnd
}

export function isConfirmed(status: string) {
  return status === "confirmed" || status === "out"
}

export function isUpcomingStatus(status: string) {
  return status === "upcoming" || status === "reserved"
}

export function activeOnDates(booking: Booking) {
  return isUpcomingStatus(booking.status) || isConfirmed(booking.status)
}

export function bookingLines(booking: Pick<Booking, "lines" | "itemId" | "quantity" | "dailyRate">): BookingLine[] {
  if (booking.lines?.length) return booking.lines
  if (booking.itemId) {
    return [{ itemId: booking.itemId, quantity: booking.quantity || 1, rate: booking.dailyRate || 0 }]
  }
  return []
}

export function bookedQuantity(
  bookings: Booking[],
  itemId: string,
  start: string,
  end: string,
  exceptId?: string,
) {
  return bookings.reduce((sum, booking) => {
    if (booking.id === exceptId || !activeOnDates(booking)) return sum
    if (!rangesOverlap(start, end, booking.startDate, booking.endDate)) return sum
    const qty = bookingLines(booking)
      .filter((line) => line.itemId === itemId)
      .reduce((lineSum, line) => lineSum + line.quantity, 0)
    return sum + qty
  }, 0)
}

export function bookingSubtotal(booking: Booking) {
  return bookingLines(booking).reduce((sum, line) => sum + line.quantity * line.rate, 0)
}

export function bookingRentalFee(booking: Booking) {
  return Math.max(0, bookingSubtotal(booking) - (booking.discount || 0))
}

export function bookingTotal(booking: Booking) {
  return bookingRentalFee(booking) + (booking.deposit || 0)
}

export function bookingBalance(booking: Booking, payments: Payment[]) {
  return bookingTotal(booking) - paidAmount(payments, booking.id)
}

export function paymentStanding(grand: number, paid: number): "paid" | "unpaid" | "partial" {
  if (paid <= 0) return "unpaid"
  if (paid + 0.001 < grand) return "partial"
  return "paid"
}

export function invoiceCodeFor(code: string) {
  const number = Number(String(code).replace(/\D/g, ""))
  if (!Number.isFinite(number)) return "INV-1000"
  return `INV-${String(number + 1000).padStart(4, "0")}`
}

export function lineDeposit(items: Item[], lines: BookingLine[]) {
  return lines.reduce((sum, line) => {
    const item = items.find((entry) => entry.id === line.itemId)
    return sum + (item?.deposit || 0) * line.quantity
  }, 0)
}

export function paidAmount(payments: Payment[], bookingId: string) {
  return payments
    .filter((payment) => payment.bookingId === bookingId)
    .reduce((sum, payment) => sum + payment.amount, 0)
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function nextBookingCode(bookings: Pick<Booking, "code">[]) {
  const numbers = bookings
    .map((booking) => Number(String(booking.code).replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value))
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1
  return `BKG-${String(next).padStart(4, "0")}`
}

export function sheetViewUrl(url: string | null | undefined) {
  const trimmed = (url || "").trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname === "docs.google.com" || parsed.hostname === "drive.google.com"
    if (parsed.protocol === "https:" && host && parsed.pathname.includes("/spreadsheets/")) {
      return parsed.toString()
    }
  } catch {
    return null
  }
  return null
}

export function extractDriveFileId(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (text.startsWith("drive:")) return text.slice(6).trim() || null
  const query = text.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (query) return query[1]
  const path = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (path) return path[1]
  const open = text.match(/\/open\?id=([a-zA-Z0-9_-]+)/)
  if (open) return open[1]
  return null
}

/** Use in img src so Google Drive files load through /api/media (fixes corrupt hotlinks). */
export function mediaUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const text = value.trim()
  if (text.startsWith("data:image/")) return text
  const id = extractDriveFileId(text)
  if (id) return `/api/media?id=${encodeURIComponent(id)}`
  if (text.startsWith("http://") || text.startsWith("https://")) return text
  return null
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  const next = typeof value === "number" ? value : Number(value)
  return Number.isFinite(next) ? next : fallback
}

function asStringList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const list = value.map((entry) => String(entry).trim()).filter(Boolean)
    return list.length ? list : fallback
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return asStringList(JSON.parse(value), fallback)
    } catch {
      const list = value.split("|").map((entry) => entry.trim()).filter(Boolean)
      return list.length ? list : fallback
    }
  }
  return fallback
}

export function normalizeSettings(input: unknown): Settings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const share = source.shareSheet
  return {
    ...defaultSettings,
    businessName: asString(source.businessName, defaultSettings.businessName).trim() || defaultSettings.businessName,
    currencySymbol: asString(source.currencySymbol, defaultSettings.currencySymbol).trim() || defaultSettings.currencySymbol,
    itemNoun: asString(source.itemNoun, defaultSettings.itemNoun).trim() || defaultSettings.itemNoun,
    variantLabel: asString(source.variantLabel, defaultSettings.variantLabel).trim() || defaultSettings.variantLabel,
    phone: asString(source.phone).trim(),
    email: asString(source.email).trim(),
    address: asString(source.address).trim(),
    invoiceNote: asString(source.invoiceNote, defaultSettings.invoiceNote),
    returnNote: asString(source.returnNote, defaultSettings.returnNote),
    paymentMethods: asStringList(source.paymentMethods, defaultSettings.paymentMethods),
    webAppUrl: asString(source.webAppUrl).trim(),
    sheetUrl: sheetViewUrl(asString(source.sheetUrl)) || "",
    sheetKey: asString(source.sheetKey).trim(),
    shareSheet: share === false || share === "false" ? false : true,
    logoUrl: asString(source.logoUrl).trim(),
    logoDataUrl: (() => {
      const remote = asString(source.logoUrl).trim()
      if (remote.startsWith("http://") || remote.startsWith("https://")) return remote
      return typeof source.logoDataUrl === "string" ? source.logoDataUrl : null
    })(),
    logoName: typeof source.logoName === "string" ? source.logoName : null,
    brandName: asString(source.brandName, defaultSettings.brandName).trim() || defaultSettings.brandName,
    pageColor: safeColor(asString(source.pageColor, defaultSettings.pageColor)),
    categories: asStringList(source.categories, defaultSettings.categories),
  }
}

export function normalizeState(input: unknown): TrackerState {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const items = normalizeItems(source.items)
  const bookings = Array.isArray(source.bookings)
    ? source.bookings.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []
        const booking = entry as Record<string, unknown>
        const id = asString(booking.id).trim()
        const status = asBookingStatus(booking.status)
        if (!id || !status) return []
        const legacy: BookingLine = {
          itemId: asString(booking.itemId).trim(),
          quantity: Math.max(1, Math.round(asNumber(booking.quantity, 1))),
          rate: asNumber(booking.dailyRate),
        }
        const lines = asLines(booking.lines, legacy)
        const first = lines[0] || legacy
        const code = asString(booking.code).trim() || "BKG-0001"
        return [{
          id,
          code,
          invoiceCode: asString(booking.invoiceCode).trim() || invoiceCodeFor(code),
          customer: asString(booking.customer).trim(),
          phone: asString(booking.phone).trim(),
          startDate: asString(booking.startDate).trim(),
          endDate: asString(booking.endDate).trim(),
          status,
          followUp: booking.followUp === true || booking.followUp === "true" || booking.followUp === "Yes",
          discount: Math.max(0, asNumber(booking.discount)),
          deposit: Math.max(0, asNumber(booking.deposit)),
          notes: asString(booking.notes),
          lines,
          refundDate: asString(booking.refundDate).trim(),
          refundAmount: Math.max(0, asNumber(booking.refundAmount)),
          refundMethod: asString(booking.refundMethod).trim(),
          refundNotes: asString(booking.refundNotes),
          itemId: first.itemId,
          quantity: first.quantity,
          dailyRate: first.rate,
        } satisfies Booking]
      })
    : []
  const payments = Array.isArray(source.payments)
    ? source.payments.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []
        const payment = entry as Record<string, unknown>
        const id = asString(payment.id).trim()
        if (!id) return []
        return [{
          id,
          bookingId: asString(payment.bookingId).trim(),
          amount: asNumber(payment.amount),
          method: asString(payment.method).trim() || "Cash",
          date: asString(payment.date).trim(),
          note: asString(payment.note),
          type: asString(payment.type).trim() || "Full Payment",
        } satisfies Payment]
      })
    : []
  return { settings: normalizeSettings(source.settings), items, bookings, payments }
}

export function checkWebAppUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) {
    return { ok: false, message: "Paste the web app URL first." }
  }
  try {
    const parsed = new URL(trimmed)
    const valid =
      parsed.protocol === "https:" &&
      parsed.hostname === "script.google.com" &&
      parsed.pathname.includes("/macros/")
    if (!valid) {
      return {
        ok: false,
        message:
          "Use the HTTPS web app URL from Apps Script (script.google.com/macros/…/exec).",
      }
    }
    return {
      ok: true,
      message:
        "That URL has the right shape and can be saved in this browser. Live sheet calls work after the Apps Script is deployed as a web app.",
    }
  } catch {
    return { ok: false, message: "That is not a valid URL." }
  }
}

function asBookingStatus(value: unknown): BookingStatus | null {
  const text = asString(value).trim().toLowerCase()
  if (text === "upcoming" || text === "reserved") return "upcoming"
  if (text === "confirmed" || text === "out") return "confirmed"
  if (text === "returned") return "returned"
  if (text === "cancelled" || text === "canceled") return "cancelled"
  return null
}

function asLines(value: unknown, fallback: BookingLine): BookingLine[] {
  let source = value
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      source = JSON.parse(value) as unknown
    } catch {
      source = []
    }
  }
  if (Array.isArray(source)) {
    const lines = source.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const line = entry as Record<string, unknown>
      const itemId = asString(line.itemId).trim()
      if (!itemId) return []
      return [{
        itemId,
        quantity: Math.max(1, Math.round(asNumber(line.quantity, 1))),
        rate: Math.max(0, asNumber(line.rate ?? line.dailyRate)),
      } satisfies BookingLine]
    })
    if (lines.length) return lines
  }
  return fallback.itemId ? [fallback] : []
}

function asCondition(value: unknown): ItemCondition {
  const text = asString(value).trim()
  return itemConditions.includes(text as ItemCondition) ? (text as ItemCondition) : "Excellent"
}

function asOverride(value: unknown): ItemStatusOverride {
  const text = asString(value).trim()
  return itemStatusOverrides.includes(text as ItemStatusOverride) ? (text as ItemStatusOverride) : "none"
}

function asPhoto(value: unknown) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  if (text.startsWith("http://") || text.startsWith("https://")) return text
  if (!text.startsWith("data:image/")) return null
  return text.length > 48000 ? null : text
}

export function applySheetAssets(
  state: TrackerState,
  assets: { logoUrl?: string; items?: { id: string; photoDataUrl: string }[] },
): TrackerState {
  let settings = state.settings
  if (assets.logoUrl !== undefined) {
    const url = assets.logoUrl.trim()
    settings = {
      ...settings,
      logoUrl: url,
      logoDataUrl: url || null,
      logoName: url ? settings.logoName : null,
    }
  }
  const patches = new Map((assets.items ?? []).map((row) => [row.id, row.photoDataUrl]))
  const items = !patches.size
    ? state.items
    : state.items.map((item) => {
        if (!patches.has(item.id)) return item
        const photo = patches.get(item.id)?.trim()
        return photo ? { ...item, photoDataUrl: photo } : { ...item, photoDataUrl: null, photoName: "" }
      })
  return { ...state, settings, items }
}

function normalizeItems(input: unknown): Item[] {
  if (!Array.isArray(input)) return []
  const items: Item[] = []
  const used = new Set<string>()
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue
    const item = entry as Record<string, unknown>
    const id = asString(item.id).trim()
    const name = asString(item.name).trim()
    if (!id || !name) continue
    let code = asString(item.code).trim()
    if (!code || used.has(code.toLowerCase())) code = nextItemCode(items)
    while (used.has(code.toLowerCase())) code = nextItemCode([...items, { code }])
    used.add(code.toLowerCase())
    items.push({
      id,
      code,
      name,
      category: asString(item.category).trim(),
      variant: asString(item.variant).trim(),
      dailyRate: Math.max(0, asNumber(item.dailyRate)),
      deposit: Math.max(0, asNumber(item.deposit)),
      quantity: Math.max(1, Math.round(asNumber(item.quantity, 1))),
      condition: asCondition(item.condition),
      statusOverride: asOverride(item.statusOverride),
      notes: asString(item.notes).trim(),
      photoDataUrl: asPhoto(item.photoDataUrl),
      photoName: asString(item.photoName).trim(),
    })
  }
  return items
}

function seed(): TrackerState {
  const returnedOn = shiftDate(-22)
  const items: Item[] = [
    {
      id: "item_aurora",
      code: "GWN-0001",
      name: "Seraphina Tulle Gown",
      category: "Long Gown",
      variant: "Size M",
      dailyRate: 2800,
      deposit: 2000,
      quantity: 1,
      condition: "Excellent",
      statusOverride: "none",
      notes: "",
      photoDataUrl: null,
      photoName: "",
    },
    {
      id: "item_ivory",
      code: "GWN-0002",
      name: "Luna Satin Gown",
      category: "Long Gown",
      variant: "Size S",
      dailyRate: 2500,
      deposit: 2000,
      quantity: 1,
      condition: "Excellent",
      statusOverride: "none",
      notes: "",
      photoDataUrl: null,
      photoName: "",
    },
    {
      id: "item_blush",
      code: "GWN-0003",
      name: "Elira Sequin Gown",
      category: "Long Gown",
      variant: "Size M",
      dailyRate: 2800,
      deposit: 2000,
      quantity: 1,
      condition: "Good",
      statusOverride: "maintenance",
      notes: `Returned ${shortDate(returnedOn)}`,
      photoDataUrl: null,
      photoName: "",
    },
    {
      id: "item_softbox",
      code: "CAM-0004",
      name: "Canon R6 Camera Kit",
      category: "Photography Equipment",
      variant: "Kit A",
      dailyRate: 3200,
      deposit: 5000,
      quantity: 1,
      condition: "Excellent",
      statusOverride: "none",
      notes: "",
      photoDataUrl: null,
      photoName: "",
    },
    {
      id: "item_set",
      code: "LGT-0005",
      name: "Godox Lighting Set",
      category: "Photography Equipment",
      variant: "2-light kit",
      dailyRate: 1500,
      deposit: 1500,
      quantity: 1,
      condition: "Excellent",
      statusOverride: "none",
      notes: "",
      photoDataUrl: null,
      photoName: "",
    },
    {
      id: "item_arch",
      code: "TBL-0006",
      name: "Round Table (8-seater)",
      category: "Event Decor",
      variant: "White",
      dailyRate: 450,
      deposit: 500,
      quantity: 8,
      condition: "Good",
      statusOverride: "none",
      notes: "",
      photoDataUrl: null,
      photoName: "",
    },
  ]

  function draft(
    input: Omit<Booking, "invoiceCode" | "deposit" | "itemId" | "quantity" | "dailyRate" | "refundDate" | "refundAmount" | "refundMethod" | "refundNotes" | "discount" | "followUp" | "notes"> &
      Partial<Pick<Booking, "discount" | "followUp" | "notes" | "refundDate" | "refundAmount" | "refundMethod" | "refundNotes">>,
  ): Booking {
    const first = input.lines[0]
    return {
      ...input,
      invoiceCode: invoiceCodeFor(input.code),
      deposit: lineDeposit(items, input.lines),
      discount: input.discount ?? 0,
      followUp: input.followUp ?? false,
      notes: input.notes ?? "",
      refundDate: input.refundDate ?? "",
      refundAmount: input.refundAmount ?? 0,
      refundMethod: input.refundMethod ?? "",
      refundNotes: input.refundNotes ?? "",
      itemId: first.itemId,
      quantity: first.quantity,
      dailyRate: first.rate,
    }
  }

  const bookings: Booking[] = [
    draft({
      id: "book_janine",
      code: "BKG-0057",
      customer: "Janine Cruz",
      phone: "0917 333 4444",
      startDate: "2026-09-24",
      endDate: "2026-09-27",
      status: "upcoming",
      lines: [{ itemId: "item_aurora", quantity: 1, rate: 2800 }],
    }),
    draft({
      id: "book_bea",
      code: "BKG-0056",
      customer: "Bea Mendoza",
      phone: "0918 555 0190",
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      status: "upcoming",
      followUp: true,
      lines: [{ itemId: "item_set", quantity: 1, rate: 1500 }],
    }),
    draft({
      id: "book_patricia",
      code: "BKG-0054",
      customer: "Patricia Lim",
      phone: "0915 444 2211",
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      status: "upcoming",
      followUp: true,
      discount: 1500,
      lines: [
        { itemId: "item_softbox", quantity: 1, rate: 3200 },
        { itemId: "item_set", quantity: 1, rate: 1500 },
      ],
    }),
    draft({
      id: "book_angela",
      code: "BKG-0051",
      customer: "Angela Reyes",
      phone: "0920 555 0118",
      startDate: "2026-09-08",
      endDate: "2026-09-11",
      status: "upcoming",
      followUp: true,
      lines: [{ itemId: "item_aurora", quantity: 1, rate: 2800 }],
    }),
    draft({
      id: "book_chiara",
      code: "BKG-0052",
      customer: "Chiara Dela Cruz",
      phone: "0916 555 0177",
      startDate: "2026-09-03",
      endDate: "2026-09-09",
      status: "confirmed",
      lines: [{ itemId: "item_ivory", quantity: 1, rate: 2500 }],
    }),
    draft({
      id: "book_nicole",
      code: "BKG-0053",
      customer: "Nicole Garcia",
      phone: "0999 555 0133",
      startDate: "2026-08-29",
      endDate: "2026-09-02",
      status: "confirmed",
      lines: [{ itemId: "item_arch", quantity: 4, rate: 450 }],
    }),
    draft({
      id: "book_mikaela",
      code: "BKG-0055",
      customer: "Mikaela Santos",
      phone: "0917 222 8890",
      startDate: "2026-08-28",
      endDate: "2026-09-01",
      status: "returned",
      notes: "Returned on time, excellent condition",
      lines: [{ itemId: "item_blush", quantity: 1, rate: 2800 }],
    }),
    draft({
      id: "book_mikaela_aug",
      code: "BKG-0042",
      customer: "Mikaela Santos",
      phone: "0917 222 8890",
      startDate: "2026-08-01",
      endDate: "2026-08-04",
      status: "returned",
      lines: [{ itemId: "item_blush", quantity: 1, rate: 2800 }],
      refundAmount: 4100,
      refundNotes: "Deposit refund pending",
    }),
    draft({
      id: "book_nicole_jul",
      code: "BKG-0041",
      customer: "Nicole Garcia",
      phone: "0999 555 0133",
      startDate: "2026-07-03",
      endDate: "2026-07-06",
      status: "returned",
      lines: [{ itemId: "item_arch", quantity: 2, rate: 450 }],
    }),
    draft({
      id: "book_chiara_jun",
      code: "BKG-0040",
      customer: "Chiara Dela Cruz",
      phone: "0916 555 0177",
      startDate: "2026-06-08",
      endDate: "2026-06-12",
      status: "returned",
      lines: [{ itemId: "item_ivory", quantity: 1, rate: 2000 }],
    }),
  ]

  const payments: Payment[] = [
    { id: "pay_janine", bookingId: "book_janine", amount: 4800, method: "Cash", date: "2026-09-04", note: "", type: "Full Payment" },
    { id: "pay_angela", bookingId: "book_angela", amount: 2000, method: "GCash", date: "2026-09-01", note: "Deposit", type: "Deposit" },
    { id: "pay_chiara", bookingId: "book_chiara", amount: 4500, method: "Cash", date: "2026-09-03", note: "", type: "Full Payment" },
    { id: "pay_nicole", bookingId: "book_nicole", amount: 3800, method: "Bank transfer", date: "2026-08-29", note: "", type: "Full Payment" },
    { id: "pay_mikaela", bookingId: "book_mikaela", amount: 4800, method: "Cash", date: "2026-08-28", note: "", type: "Full Payment" },
    { id: "pay_mikaela_aug", bookingId: "book_mikaela_aug", amount: 8900, method: "Cash", date: "2026-08-01", note: "Includes deposit held", type: "Full Payment" },
    { id: "pay_nicole_jul", bookingId: "book_nicole_jul", amount: 7950, method: "GCash", date: "2026-07-03", note: "", type: "Full Payment" },
    { id: "pay_chiara_jun", bookingId: "book_chiara_jun", amount: 6200, method: "Cash", date: "2026-06-08", note: "", type: "Full Payment" },
  ]

  return { settings: defaultSettings, items, bookings, payments }
}

export function loadState(): TrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    return normalizeState(JSON.parse(raw))
  } catch {
    return seed()
  }
}

export function itemById(items: Item[], id: string) {
  return items.find((item) => item.id === id)
}

export function statusLabel(status: BookingStatus) {
  if (status === "upcoming") return "Upcoming"
  if (status === "confirmed") return "Confirmed"
  if (status === "returned") return "Returned"
  return "Cancelled"
}
