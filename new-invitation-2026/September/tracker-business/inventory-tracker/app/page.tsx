"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTracker } from "@/components/tracker-provider"
import { StatusPill } from "@/components/ui"
import {
  bookingBalance,
  bookingLines,
  bookingTotal,
  formatDate,
  inventoryStatus,
  isConfirmed,
  itemById,
  localISO,
  mediaUrl,
  money,
  paidAmount,
  paymentStanding,
  rangesOverlap,
  statusLabel,
  todayISO,
  type Booking,
  type InventoryStatus,
  type Item,
  type Payment,
} from "@/lib/rental"

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const views = [
  { id: "all", label: "All" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
] as const

type View = (typeof views)[number]["id"]
type Bucket = { key: string; label: string; amount: number; start: string; end: string }

const statusColor: Record<InventoryStatus, string> = {
  rented: "#e07a72",
  upcoming: "#e7b2a4",
  available: "#7d9a6a",
  maintenance: "#e2b23a",
}

const selectClass = "h-10 rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm font-medium text-ink outline-none"

export default function DashboardPage() {
  const router = useRouter()
  const { settings, items, bookings, payments, sheetSource } = useTracker()
  const fromSheet = sheetSource === "google"
  const today = todayISO()
  const [view, setView] = useState<View>("month")
  const [focus, setFocus] = useState(today)
  const symbol = settings.currencySymbol
  const noun = settings.itemNoun.trim() || "Items"
  const focusDate = parseISO(focus)
  const focusMonth = focusDate.getMonth()
  const focusYear = focusDate.getFullYear()

  const years = useMemo(() => {
    const found = new Set<number>([new Date().getFullYear()])
    for (const booking of bookings) found.add(Number(booking.startDate.slice(0, 4)))
    for (const payment of payments) if (payment.date) found.add(Number(payment.date.slice(0, 4)))
    return [...found].filter((value) => Number.isFinite(value)).sort((a, b) => b - a)
  }, [bookings, payments])

  const period = useMemo(() => boundsFor(view, focus), [view, focus])
  const periodBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.status !== "cancelled" && overlapsPeriod(booking, period.start, period.end))
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code))
  }, [bookings, period])

  const itemStats = useMemo(() => {
    const counts: Record<InventoryStatus, number> = { rented: 0, upcoming: 0, available: 0, maintenance: 0 }
    const snapshot = view === "all" || view === "day"
    const day = view === "day" ? focus : today
    for (const item of items) {
      counts[itemStatusForPeriod(item, bookings, snapshot ? day : period.start, snapshot ? day : period.end, snapshot)] += 1
    }
    return counts
  }, [items, bookings, view, focus, today, period])

  const buckets = useMemo(() => revenueBuckets(view, focus, payments, years), [view, focus, payments, years])
  const periodCollected = useMemo(
    () => payments.reduce((sum, payment) => (paymentInPeriod(payment, period.start, period.end) ? sum + payment.amount : sum), 0),
    [payments, period],
  )
  const activeBucket = buckets.findIndex((bucket) => focus >= bucket.start && focus <= bucket.end)
  const upcomingCount = periodBookings.filter((booking) => booking.status === "upcoming").length

  const popular = useMemo(() => {
    return items
      .map((item) => {
        const related = periodBookings.filter((booking) => bookingLines(booking).some((line) => line.itemId === item.id))
        const latest = related.reduce((max, booking) => (booking.startDate > max ? booking.startDate : max), "")
        return { item, count: related.length, latest }
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
      .slice(0, 3)
  }, [items, periodBookings])

  const pending = periodBookings
    .map((booking) => ({ booking, balance: bookingBalance(booking, payments), standing: paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id)) }))
    .filter((row) => row.balance > 0.5)
    .sort((a, b) => b.balance - a.balance)

  const due = periodBookings
    .filter((booking) => (booking.status === "confirmed" || booking.status === "upcoming") && dueInPeriod(booking, period.start, period.end))
    .slice()
    .sort((a, b) => a.endDate.localeCompare(b.endDate))

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const booking of periodBookings) {
      for (const line of bookingLines(booking)) {
        const name = itemById(items, line.itemId)?.category.trim() || "Uncategorized"
        counts.set(name, (counts.get(name) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items, periodBookings])

  const statusSlices = (["rented", "upcoming", "available", "maintenance"] as InventoryStatus[]).filter((key) => itemStats[key] > 0)
  const gridClass = buckets.length > 16 ? "grid-cols-3 sm:grid-cols-7" : buckets.length > 7 ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7"

  function move(direction: -1 | 1) {
    if (view === "day") setFocus(addDays(focus, direction))
    if (view === "week") setFocus(addDays(focus, direction * 7))
    if (view === "month") setFocus(addMonths(focus, direction))
    if (view === "year") setFocus(addMonths(focus, direction * 12))
  }

  function openBucket(bucket: Bucket) {
    if (view === "all") {
      setView("year")
      setFocus(bucket.start)
      return
    }
    if (view === "year") {
      setView("month")
      setFocus(bucket.start)
      return
    }
    setView("day")
    setFocus(bucket.start)
  }

  function setFocusMonth(month: number) {
    const last = new Date(focusYear, month + 1, 0).getDate()
    setFocus(localISO(new Date(focusYear, month, Math.min(focusDate.getDate(), last))))
  }

  function setFocusYear(year: number) {
    const last = new Date(year, focusMonth + 1, 0).getDate()
    setFocus(localISO(new Date(year, focusMonth, Math.min(focusDate.getDate(), last))))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dashboard period">
          {views.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              className={`h-10 rounded-lg px-3 text-sm font-semibold ${view === option.id ? "bg-sage text-white" : "border border-[#efe4e0] bg-white text-ink"}`}
              onClick={() => setView(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {view === "all" ? (
          <p className="text-sm text-muted">Showing every booking and payment</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${selectClass} w-10 px-0`} aria-label="Previous period" onClick={() => move(-1)}>‹</button>
            {view === "day" || view === "week" ? (
              <input className={selectClass} type="date" aria-label="Date" value={focus} onChange={(event) => event.target.value && setFocus(event.target.value)} />
            ) : null}
            {view === "month" ? (
              <select className={selectClass} aria-label="Month" value={focusMonth} onChange={(event) => setFocusMonth(Number(event.target.value))}>
                {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            ) : null}
            {view === "month" || view === "year" ? (
              <select className={selectClass} aria-label="Year" value={focusYear} onChange={(event) => setFocusYear(Number(event.target.value))}>
                {years.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            ) : null}
            <button type="button" className={`${selectClass} w-10 px-0`} aria-label="Next period" onClick={() => move(1)}>›</button>
            <button type="button" className={`${selectClass} px-3`} onClick={() => setFocus(today)}>Today</button>
          </div>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat href="/inventory" label={`Total ${noun.toLowerCase()}`} value={String(items.length)} hint={`All ${noun.toLowerCase()} in inventory`} icon="items" />
        <Stat href="/inventory" label="Rented out" value={String(itemStats.rented)} hint={view === "day" ? "On this day" : view === "all" ? "Currently rented" : "Booked out in this period"} icon="rented" />
        <Stat href="/bookings" label="Upcoming bookings" value={String(upcomingCount)} hint={view === "all" ? "Awaiting rental start" : "In this period"} icon="upcoming" />
        <Stat href="/inventory" label="Available" value={String(itemStats.available)} hint={view === "week" || view === "month" || view === "year" ? "Free in this period" : "Ready to rent"} icon="available" />
        <Stat href="/payments" label="Revenue collected" value={money(symbol, periodCollected)} hint={view === "all" ? "All payments" : "For selected period"} icon="revenue" />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Revenue trend — {period.label}</h2>
          <RevenueChart values={buckets.map((bucket) => bucket.amount)} labels={buckets.map((bucket) => bucket.label)} active={activeBucket} />
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Rental status — {period.label}</h2>
          <Donut total={items.length} slices={statusSlices.map((key) => ({ key, count: itemStats[key], color: statusColor[key] }))} />
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Bookings by category</h2>
          <CategoryBars rows={categories} fromSheet={fromSheet} />
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
        <h2 className="px-4 py-3 text-sm font-semibold sm:px-5">Revenue — {period.label}</h2>
        <div className={`grid ${gridClass}`}>
          {buckets.map((bucket, index) => (
            <button key={bucket.key} type="button" onClick={() => openBucket(bucket)} className={`border-t border-[#f3ebe8] px-2 py-3 text-center ${index === activeBucket ? "bg-[#f3f8f4]" : "hover:bg-blush/60"}`}>
              <span className="block rounded-sm bg-sage py-1 text-[11px] font-semibold text-white">{bucket.label}</span>
              <span className="mt-2 block text-[11px] font-semibold text-ink sm:text-sm">{money(symbol, bucket.amount)}</span>
            </button>
          ))}
        </div>
        <p className="border-t border-[#f3ebe8] px-4 py-2 text-sm font-semibold sm:px-5">Total for {period.label}: {money(symbol, periodCollected)}</p>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
        <Panel title={view === "all" ? "All bookings" : "Bookings"} href="/bookings" action="Open bookings">
          {periodBookings.length === 0 ? (fromSheet ? null : <Empty>{view === "all" ? "No rentals yet." : `No rentals in ${period.label}.`}</Empty>) : (
            <>
              <ul className="space-y-3 p-3 lg:hidden">
                {periodBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} items={items} payments={payments} today={today} onOpen={() => router.push(`/bookings?edit=${booking.id}`)} />
                ))}
              </ul>
              <div className="hidden lg:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Booking ID</th>
                      <th className="px-3 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Items</th>
                      <th className="px-3 py-2 font-semibold">Dates</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodBookings.map((booking) => {
                      const standing = paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id))
                      return (
                        <tr key={booking.id} className="cursor-pointer border-t border-[#f6eeeb] hover:bg-[#fbf8f7]" onClick={() => router.push(`/bookings?edit=${booking.id}`)}>
                          <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{booking.code}</td>
                          <td className="px-3 py-2.5 font-semibold">{booking.customer}</td>
                          <td className="px-3 py-2.5">{itemsLabel(booking, items)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-[13px]">{formatDate(booking.startDate)} – {formatDate(booking.endDate)}</td>
                          <td className="px-3 py-2.5"><StatusPill status={booking.status}>{statusLabel(booking.status)}</StatusPill></td>
                          <td className="px-3 py-2.5"><PayPill standing={standing} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
        <Panel title="Popular items" href="/timeline" action="Open timeline">
          {popular.length === 0 ? (fromSheet ? null : <Empty>{view === "all" ? "No bookings yet." : `No bookings in ${period.label}.`}</Empty>) : (
            <ol className="space-y-3 p-4">
              {popular.map((entry, index) => {
                const photo = mediaUrl(entry.item.photoDataUrl)
                return (
                <li key={entry.item.id}>
                  <Link href="/timeline" className="flex items-center gap-3 rounded-xl hover:bg-blush/50">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ${index === 0 ? "bg-coral" : index === 1 ? "bg-sage" : "bg-[#c4a15a]"}`}>{index + 1}</span>
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#f8e8e4]">
                      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-xs font-semibold text-[#c47b73]">{entry.item.name.slice(0, 1)}</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{entry.item.name}</span>
                      <span className="text-xs text-muted">{entry.count} {entry.count === 1 ? "booking" : "bookings"}</span>
                    </span>
                  </Link>
                </li>
              )})}
            </ol>
          )}
        </Panel>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="Pending payments" href="/payments" action="Open payments">
          {pending.length === 0 ? (fromSheet ? null : <Empty>{view === "all" ? "Every invoice is paid." : `No outstanding invoices in ${period.label}.`}</Empty>) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {pending.map((row) => (
                  <li key={row.booking.id}>
                    <Link href="/payments" className="block rounded-xl border border-[#f0e4df] px-3 py-3">
                      <span className="font-semibold">{row.booking.customer}</span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted">{row.booking.invoiceCode}</span>
                        <span className="font-semibold text-[#c4475c]">{money(symbol, row.balance)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Invoice</th>
                      <th className="px-3 py-2 font-semibold">Balance</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row) => (
                      <tr key={row.booking.id} className="cursor-pointer border-t border-[#f6eeeb] hover:bg-[#fbf8f7]" onClick={() => router.push("/payments")}>
                        <td className="px-4 py-2.5 font-semibold">{row.booking.customer}</td>
                        <td className="px-3 py-2.5">{row.booking.invoiceCode}</td>
                        <td className="px-3 py-2.5 font-semibold">{money(symbol, row.balance)}</td>
                        <td className="px-4 py-2.5"><PayPill standing={row.standing} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
        <Panel title="Returns due" href="/returns" action="Open returns">
          {due.length === 0 ? (fromSheet ? null : <Empty>{view === "all" ? "Nothing is out for return." : `No returns due in ${period.label}.`}</Empty>) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {due.map((booking) => (
                  <li key={booking.id}>
                    <Link href="/returns" className="block rounded-xl border border-[#f0e4df] px-3 py-3">
                      <span className="font-semibold">{booking.customer}</span>
                      <span className="mt-1 block text-sm">{itemsLabel(booking, items)}</span>
                      <span className={`mt-1 block text-sm ${booking.endDate < today ? "font-semibold text-[#c4475c]" : "text-muted"}`}>{formatDate(booking.endDate)}{booking.endDate < today ? " · Overdue" : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Items</th>
                      <th className="px-4 py-2 font-semibold">Due date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {due.map((booking) => (
                      <tr key={booking.id} className="cursor-pointer border-t border-[#f6eeeb] hover:bg-[#fbf8f7]" onClick={() => router.push("/returns")}>
                        <td className="px-4 py-2.5 font-semibold">{booking.customer}</td>
                        <td className="px-3 py-2.5">{itemsLabel(booking, items)}</td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${booking.endDate < today ? "font-semibold text-[#c4475c]" : ""}`}>{formatDate(booking.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </section>

      {!fromSheet ? (
        <p className="flex items-start gap-2 rounded-xl bg-[#fdf4f2] px-3 py-2 text-xs text-[#a56d66]">
          <HeartIcon />
          <span>TIP: Pick All, a day, a week, a month, or a year. Click a revenue cell to open that slice.</span>
        </p>
      ) : null}
    </div>
  )
}

function Stat({ href, label, value, hint, icon }: { href: string; label: string; value: string; hint: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)] hover:ring-1 hover:ring-sage/40">
      <StatIcon name={icon} />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</span>
        <span className="block truncate text-2xl font-semibold text-ink">{value}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </Link>
  )
}

function Panel({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href} className="text-xs font-semibold text-sage hover:underline">{action}</Link>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{children}</p>
}

function BookingCard({ booking, items, payments, today, onOpen }: { booking: Booking; items: Item[]; payments: Payment[]; today: string; onOpen: () => void }) {
  const standing = paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id))
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full rounded-xl border border-[#f0e4df] px-3 py-3 text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">{booking.code}</span>
          <StatusPill status={booking.status}>{statusLabel(booking.status)}</StatusPill>
        </span>
        <span className="mt-1 block text-sm font-semibold">{booking.customer}</span>
        <span className="mt-1 block text-sm">{itemsLabel(booking, items)}</span>
        <span className={`mt-1 block text-xs ${booking.endDate < today && booking.status !== "returned" ? "font-semibold text-[#c4475c]" : "text-muted"}`}>{formatDate(booking.startDate)} – {formatDate(booking.endDate)}</span>
        <span className="mt-2 inline-flex"><PayPill standing={standing} /></span>
      </button>
    </li>
  )
}

function RevenueChart({ values, labels, active }: { values: number[]; labels: string[]; active: number }) {
  const width = 320
  const height = 120
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width
    const y = height - 12 - (value / max) * (height - 24)
    return { x, y }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(" ")
  const area = `0,${height} ${line} ${width},${height}`
  const step = labels.length > 16 ? 5 : labels.length > 12 ? 2 : 1
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Revenue trend">
        {points.length > 1 ? <polygon points={area} fill="#e7f0e4" /> : null}
        {points.length > 1 ? <polyline points={line} fill="none" stroke="#7d9a6a" strokeWidth="2.5" /> : null}
        {points.map((point, index) => <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r={index === active ? 4 : 2.5} fill={index === active ? "#3c7a4e" : "#6f967a"} />)}
      </svg>
      <div className="grid text-center text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${Math.max(labels.length, 1)}, minmax(0, 1fr))` }}>
        {labels.map((label, index) => <span key={`${label}-${index}`} className="truncate">{index % step === 0 || index === labels.length - 1 ? label : ""}</span>)}
      </div>
    </div>
  )
}

function Donut({ total, slices }: { total: number; slices: { key: InventoryStatus; count: number; color: string }[] }) {
  const radius = 42
  const circ = 2 * Math.PI * radius
  let offset = 0
  const labels: Record<InventoryStatus, string> = { rented: "Rented out", upcoming: "Upcoming", available: "Available", maintenance: "Maintenance" }
  const rings = total > 0 ? slices.map((slice) => {
    const length = (slice.count / total) * circ
    const circle = (
      <circle key={slice.key} cx="60" cy="60" r={radius} fill="none" stroke={slice.color} strokeWidth="14" strokeDasharray={`${length} ${circ - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
    )
    offset += length
    return circle
  }) : null
  return (
    <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
      <svg viewBox="0 0 120 120" className="h-36 w-36" role="img" aria-label="Rental status">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f3ebe8" strokeWidth="14" />
        {rings}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="#3c302d">{total}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" fill="#8d756c">total</text>
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
            {labels[slice.key]} {slice.count}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoryBars({ rows, fromSheet }: { rows: [string, number][]; fromSheet: boolean }) {
  const max = Math.max(...rows.map((row) => row[1]), 1)
  if (rows.length === 0) return fromSheet ? null : <p className="mt-6 text-sm text-muted">No bookings in this period.</p>
  return (
    <ul className="mt-4 space-y-3">
      {rows.map(([name, count]) => (
        <li key={name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{name}</span>
            <span className="font-semibold">{count}</span>
          </div>
          <div className="h-3 rounded-full bg-[#f3ebe8]">
            <div className="h-3 rounded-full bg-sage" style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function PayPill({ standing }: { standing: "paid" | "unpaid" | "partial" }) {
  const tone = {
    paid: "bg-[#e5f3e8] text-[#3c7a4e]",
    unpaid: "bg-[#fde8ea] text-[#c4475c]",
    partial: "bg-[#fbf3dc] text-[#a07d32]",
  }[standing]
  const label = standing === "paid" ? "Paid" : standing === "unpaid" ? "Unpaid" : "Partial"
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
}

function StatIcon({ name }: { name: string }) {
  const tone = {
    items: "bg-[#f3e4df] text-[#c47b73]",
    rented: "bg-[#fde8ea] text-[#c45c6c]",
    upcoming: "bg-[#f8f1e4] text-[#a07d32]",
    available: "bg-[#e7f3ea] text-[#3c7a4e]",
    revenue: "bg-[#fde8ea] text-[#c45c6c]",
  }[name] || "bg-blush text-ink"
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone}`} aria-hidden><span className="text-lg">{name === "revenue" ? "₱" : name === "available" ? "✓" : name === "upcoming" ? "◷" : name === "rented" ? "↗" : "▣"}</span></span>
}

function HeartIcon() {
  return <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" /></svg>
}

function itemsLabel(booking: Booking, items: Item[]) {
  return bookingLines(booking).map((line) => {
    const item = itemById(items, line.itemId)
    const name = item?.name ?? "Removed item"
    return line.quantity > 1 ? `${name} ×${line.quantity}` : name
  }).join(", ")
}

function parseISO(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function addDays(iso: string, days: number) {
  const date = parseISO(iso)
  date.setDate(date.getDate() + days)
  return localISO(date)
}

function addMonths(iso: string, months: number) {
  const date = parseISO(iso)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, last))
  return localISO(date)
}

function boundsFor(view: View, focus: string) {
  if (view === "all") return { start: null as string | null, end: null as string | null, label: "All time" }
  if (view === "day") return { start: focus, end: focus, label: formatDate(focus) }
  if (view === "week") {
    const startDate = parseISO(focus)
    startDate.setDate(startDate.getDate() - startDate.getDay())
    const start = localISO(startDate)
    const end = addDays(start, 6)
    return { start, end, label: weekLabel(start, end) }
  }
  if (view === "year") {
    const year = parseISO(focus).getFullYear()
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) }
  }
  const date = parseISO(focus)
  const year = date.getFullYear()
  const month = date.getMonth()
  const last = new Date(year, month + 1, 0).getDate()
  return {
    start: localISO(new Date(year, month, 1)),
    end: localISO(new Date(year, month, last)),
    label: `${monthNames[month]} ${year}`,
  }
}

function weekLabel(start: string, end: string) {
  const startDate = parseISO(start)
  const endDate = parseISO(end)
  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()
  const left = `${monthShort[startDate.getMonth()]} ${startDate.getDate()}`
  if (sameMonth) return `${left} – ${endDate.getDate()}, ${endDate.getFullYear()}`
  return `${left} – ${monthShort[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`
}

function overlapsPeriod(booking: Booking, start: string | null, end: string | null) {
  if (!start || !end) return true
  return rangesOverlap(booking.startDate, booking.endDate, start, end)
}

function dueInPeriod(booking: Booking, start: string | null, end: string | null) {
  if (!start || !end) return true
  return booking.endDate >= start && booking.endDate <= end
}

function paymentInPeriod(payment: Payment, start: string | null, end: string | null) {
  if (!payment.date) return false
  if (!start || !end) return true
  return payment.date >= start && payment.date <= end
}

function itemStatusForPeriod(item: Item, bookings: Booking[], start: string | null, end: string | null, snapshot: boolean): InventoryStatus {
  if (item.statusOverride && item.statusOverride !== "none") return item.statusOverride
  if (snapshot || !start || !end) return inventoryStatus(item, bookings, start || todayISO())
  const related = bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "returned" && bookingLines(booking).some((line) => line.itemId === item.id) && rangesOverlap(booking.startDate, booking.endDate, start, end))
  if (related.some((booking) => isConfirmed(booking.status))) return "rented"
  if (related.length > 0) return "upcoming"
  return "available"
}

function collectedBetween(payments: Payment[], start: string, end: string) {
  return payments.reduce((sum, payment) => (paymentInPeriod(payment, start, end) ? sum + payment.amount : sum), 0)
}

function revenueBuckets(view: View, focus: string, payments: Payment[], years: number[]): Bucket[] {
  if (view === "all") {
    const list = years.length ? [...years].sort((a, b) => a - b) : [parseISO(focus).getFullYear()]
    return list.map((year) => ({
      key: String(year),
      label: String(year),
      amount: collectedBetween(payments, `${year}-01-01`, `${year}-12-31`),
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    }))
  }
  if (view === "year") {
    const year = parseISO(focus).getFullYear()
    return monthShort.map((label, index) => {
      const start = localISO(new Date(year, index, 1))
      const end = localISO(new Date(year, index + 1, 0))
      return { key: start, label, amount: collectedBetween(payments, start, end), start, end }
    })
  }
  if (view === "day") {
    return [{ key: focus, label: formatDate(focus), amount: collectedBetween(payments, focus, focus), start: focus, end: focus }]
  }
  const range = boundsFor(view, focus)
  const start = range.start || focus
  const end = range.end || focus
  const buckets: Bucket[] = []
  let cursor = start
  while (cursor <= end) {
    const date = parseISO(cursor)
    const label = view === "week" ? `${weekdays[date.getDay()]} ${date.getDate()}` : String(date.getDate())
    buckets.push({ key: cursor, label, amount: collectedBetween(payments, cursor, cursor), start: cursor, end: cursor })
    cursor = addDays(cursor, 1)
  }
  return buckets
}
