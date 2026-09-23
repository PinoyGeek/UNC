"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTracker } from "@/components/tracker-provider"
import { StatusPill } from "@/components/ui"
import {
  bookingLines,
  bookingTotal,
  formatDate,
  localISO,
  mediaUrl,
  paidAmount,
  paymentStanding,
  statusLabel,
  todayISO,
  type Booking,
  type BookingStatus,
  type Item,
} from "@/lib/rental"

type View = "day" | "week" | "month" | "year"
type DayKind = "available" | "booked" | "maintenance"

const views: { id: View; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
]

const barTone: Record<BookingStatus, string> = {
  confirmed: "bg-[#e5f4e8] text-[#2f6a40]",
  upcoming: "bg-[#fde8ea] text-[#c45c6c]",
  returned: "bg-[#f4eee9] text-[#8d756c]",
  cancelled: "bg-[#fdeceb] text-[#9a403c]",
}

const dotTone: Record<DayKind, string> = {
  available: "bg-[#3c9a55]",
  booked: "bg-[#e25b55]",
  maintenance: "bg-[#e2b23a]",
}

const payTone = {
  paid: "bg-[#e5f3e8] text-[#3c7a4e]",
  partial: "bg-[#fbf3dc] text-[#a07d32]",
  unpaid: "bg-[#fde8ea] text-[#c45c6c]",
}

export default function TimelinePage() {
  const router = useRouter()
  const { settings, items, bookings, payments, setCompose } = useTracker()
  const today = todayISO()
  const [itemId, setItemId] = useState(items[0]?.id ?? "")
  const [focus, setFocus] = useState(today)
  const [view, setView] = useState<View>("month")
  const item = items.find((entry) => entry.id === itemId) ?? items[0]
  const range = useMemo(() => periodFor(view, focus), [view, focus])
  const days = useMemo(() => eachDay(range.start, range.end), [range])

  const related = useMemo(() => {
    if (!item) return []
    return bookings
      .filter((booking) => coversItem(booking, item.id) && rangesOverlap(booking.startDate, booking.endDate, range.start, range.end))
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code))
  }, [bookings, item, range])

  const kinds = useMemo(() => {
    if (!item) return []
    return days.map((iso) => dayKind(item, bookings, iso))
  }, [item, bookings, days])

  const available = kinds.filter((kind) => kind === "available").length

  function createBooking(date: string) {
    if (!item) return
    setCompose("booking")
    router.push(`/bookings?start=${date}&item=${item.id}`)
  }

  function openBooking(booking: Booking) {
    router.push(`/bookings?edit=${booking.id}`)
  }

  function shift(direction: number) {
    if (view === "year") setFocus(addMonths(focus, direction * 12))
    else if (view === "month") setFocus(addMonths(focus, direction))
    else if (view === "week") setFocus(addDays(focus, direction * 7))
    else setFocus(addDays(focus, direction))
  }

  function newBookingDate() {
    if (today >= range.start && today <= range.end) return today
    return range.start
  }

  if (!item) {
    return <p className="rounded-2xl bg-white px-5 py-10 text-center text-sm text-muted">Add an item before checking the timeline.</p>
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(250px,1.35fr)_1fr_0.8fr_0.9fr_0.95fr]">
        <article className="rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Select item</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f8e8e4]">
              {mediaUrl(item.photoDataUrl) ? (
                <img src={mediaUrl(item.photoDataUrl)!} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <ItemMark />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <select
                aria-label="Select item"
                className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                value={item.id}
                onChange={(event) => setItemId(event.target.value)}
              >
                {items.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
              <p className="truncate text-xs text-muted">
                Code: {item.code || "—"} · {settings.variantLabel}: {item.variant || "—"}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Date range</p>
          <p className="mt-3 text-sm font-semibold text-ink">
            {formatDate(range.start)} – {formatDate(range.end)}
          </p>
        </article>

        <article className="rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">View</p>
          <select
            aria-label="Timeline view"
            className="mt-2 h-10 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm text-ink outline-none"
            value={view}
            onChange={(event) => setView(event.target.value as View)}
          >
            {views.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </article>

        <article className="rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Legend</p>
          <ul className="mt-2 space-y-1 text-xs text-ink">
            <LegendRow className="bg-[#3c9a55]" label="Confirmed" />
            <LegendRow className="bg-[#e07a86]" label="Upcoming" />
            <LegendRow className="bg-[#c4b2aa]" label="Returned" />
            <LegendRow className="bg-[#e2b23a]" label="Maintenance" />
          </ul>
        </article>

        <article className="rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Availability (selected period)</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-ink">{available}</p>
          <p className="text-sm text-muted">{available === 1 ? "day available" : "days available"}</p>
        </article>
      </section>

      <section className="rounded-2xl bg-white px-3 py-4 shadow-[0_10px_30px_rgba(90,50,40,0.05)] sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className={navBtn} aria-label="Previous" onClick={() => shift(-1)}>
              <Chevron direction="left" />
            </button>
            <h2 className="min-w-40 text-center text-base font-semibold sm:min-w-52">{heading(view, focus)}</h2>
            <button type="button" className={navBtn} aria-label="Next" onClick={() => shift(1)}>
              <Chevron direction="right" />
            </button>
            <button type="button" className={todayBtn} onClick={() => setFocus(today)}>Today</button>
          </div>
          <button type="button" className="inline-flex h-9 items-center rounded-lg bg-coral px-3 text-sm font-semibold text-white hover:bg-[#e37c74]" onClick={() => createBooking(newBookingDate())}>
            + New booking
          </button>
        </div>

        {view === "year" ? (
          <YearGrid
            focus={focus}
            item={item}
            bookings={bookings}
            onMonth={(iso) => {
              setFocus(iso)
              setView("month")
            }}
          />
        ) : (
          <DayStrip
            days={days}
            kinds={kinds}
            bookings={related}
            range={range}
            today={today}
            onDay={createBooking}
            onBooking={openBooking}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dotTone.available}`} />Available</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dotTone.booked}`} />Not available</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${dotTone.maintenance}`} />Maintenance</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(90,50,40,0.05)]">
        <h2 className="px-4 py-3 text-sm font-semibold sm:px-5">Booking list (for selected item & period)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sage text-xs font-semibold tracking-wide text-white uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Booking</th>
                <th className="px-3 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold">Date from</th>
                <th className="px-3 py-2.5 font-semibold">Date to</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Payment</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {related.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted">Nothing booked for this item in the selected period.</td>
                </tr>
              ) : (
                related.map((booking) => {
                  const standing = paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id))
                  return (
                    <tr key={booking.id} className="cursor-pointer border-t border-[#f3ebe8] hover:bg-[#fbf8f7]" onClick={() => openBooking(booking)}>
                      <td className="px-4 py-3 font-medium sm:px-5">{booking.code}</td>
                      <td className="px-3 py-3 font-semibold">{booking.customer}</td>
                      <td className="px-3 py-3">{formatDate(booking.startDate)}</td>
                      <td className="px-3 py-3">{formatDate(booking.endDate)}</td>
                      <td className="px-3 py-3"><StatusPill status={booking.status}>{statusLabel(booking.status)}</StatusPill></td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${payTone[standing]}`}>
                          {standing === "paid" ? "Paid" : standing === "partial" ? "Partial" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted sm:px-5">{booking.notes || "—"}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-[#fdf4f2] px-3 py-2 text-xs text-[#a56d66]">
        <HeartIcon />
        <span>TIP: Click a bar or a row to open that booking. Click a date to add a booking for this item on that day.</span>
      </p>
    </div>
  )
}

function DayStrip({
  days,
  kinds,
  bookings,
  range,
  today,
  onDay,
  onBooking,
}: {
  days: string[]
  kinds: DayKind[]
  bookings: Booking[]
  range: { start: string; end: string }
  today: string
  onDay: (iso: string) => void
  onBooking: (booking: Booking) => void
}) {
  const laid = layoutBars(bookings, range.start, range.end)
  const rows = laid.reduce((max, bar) => Math.max(max, bar.row + 1), 1)
  return (
    <div className="mt-5 overflow-x-auto">
      <div className="min-w-[720px]" style={{ minWidth: Math.max(720, days.length * 36) }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((iso, index) => {
            const kind = kinds[index]
            const label = kind === "booked" ? "Not available" : kind === "maintenance" ? "Maintenance" : "Available"
            return (
              <button
                key={iso}
                type="button"
                title={`${formatDate(iso)} · ${label}. Add a booking on this date.`}
                onClick={() => onDay(iso)}
                className="flex flex-col items-center gap-1 py-1 hover:bg-blush/70"
              >
                <span className={`text-[11px] font-semibold ${iso === today ? "grid h-5 w-5 place-items-center rounded-full bg-coral text-white" : "text-muted"}`}>
                  {parseISO(iso).getDate()}
                </span>
                <span className={`h-2 w-2 rounded-full ${dotTone[kind]}`} />
              </button>
            )
          })}
        </div>
        <div className="relative mt-3" style={{ height: rows * 52 }}>
          {laid.map((bar) => {
            const startIndex = days.indexOf(bar.clipStart)
            const span = days.indexOf(bar.clipEnd) - startIndex + 1
            const left = (startIndex / days.length) * 100
            const width = (span / days.length) * 100
            const pinRight = startIndex / days.length > 0.55
            const right = ((days.length - (startIndex + span)) / days.length) * 100
            return (
              <button
                key={bar.booking.id}
                type="button"
                onClick={() => onBooking(bar.booking)}
                className={`absolute overflow-hidden rounded-lg px-2 py-1 text-left leading-tight ${barTone[bar.booking.status]}`}
                style={pinRight
                  ? { right: `${right}%`, width: `${width}%`, minWidth: 210, top: bar.row * 52, height: 46 }
                  : { left: `${left}%`, width: `${width}%`, minWidth: 210, top: bar.row * 52, height: 46 }}
              >
                <span className="block truncate text-[11px] font-semibold">
                  {formatDate(bar.booking.startDate)} – {formatDate(bar.booking.endDate)}
                </span>
                <span className="block truncate text-[11px]">
                  {bar.booking.customer} · {statusLabel(bar.booking.status)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function YearGrid({
  focus,
  item,
  bookings,
  onMonth,
}: {
  focus: string
  item: Item
  bookings: Booking[]
  onMonth: (iso: string) => void
}) {
  const year = parseISO(focus).getFullYear()
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, month) => {
        const start = localISO(new Date(year, month, 1))
        const end = localISO(new Date(year, month + 1, 0))
        const days = eachDay(start, end)
        const free = days.filter((iso) => dayKind(item, bookings, iso) === "available").length
        return (
          <button key={start} type="button" onClick={() => onMonth(start)} className="rounded-xl border border-[#efe4e0] px-3 py-3 text-left hover:border-sage">
            <p className="text-sm font-semibold">{new Date(year, month, 1).toLocaleDateString("en-PH", { month: "long" })}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{free}</p>
            <p className="text-xs text-muted">{free === 1 ? "day available" : "days available"}</p>
          </button>
        )
      })}
    </div>
  )
}

function LegendRow({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </li>
  )
}

function ItemMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#e7a39a]" fill="currentColor" aria-hidden>
      <path d="M12 3.2c.8 1.4 1.2 2.6 1.2 3.6 0 1.2-.7 2.2-1.2 2.8-.5-.6-1.2-1.6-1.2-2.8 0-1 .4-2.2 1.2-3.6z" />
      <path d="M8.2 10.2h7.6l1.8 9.2a1 1 0 0 1-1 .1.2L12 17.2l-4.6 2.3a1 1 0 0 1-1-.2l1.8-9.1z" />
    </svg>
  )
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {direction === "left" ? <path d="M14 6l-6 6 6 6" /> : <path d="M10 6l6 6-6 6" />}
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

const navBtn = "inline-grid h-8 w-8 place-items-center rounded-lg border border-[#e5d7d2] bg-white text-ink hover:bg-blush"
const todayBtn = "inline-flex h-8 items-center rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm font-medium text-ink hover:bg-blush"

function coversItem(booking: Booking, itemId: string) {
  return booking.status !== "cancelled" && bookingLines(booking).some((line) => line.itemId === itemId)
}

function dayKind(item: Item, bookings: Booking[], iso: string): DayKind {
  if (item.statusOverride === "maintenance") return "maintenance"
  const booked = bookings.reduce((sum, booking) => {
    if (!coversItem(booking, item.id) || iso < booking.startDate || iso > booking.endDate) return sum
    return sum + bookingLines(booking).filter((line) => line.itemId === item.id).reduce((lineSum, line) => lineSum + line.quantity, 0)
  }, 0)
  return booked >= item.quantity ? "booked" : "available"
}

function layoutBars(bookings: Booking[], start: string, end: string) {
  const rowEnds: string[] = []
  return bookings.map((booking) => {
    const clipStart = booking.startDate < start ? start : booking.startDate
    const clipEnd = booking.endDate > end ? end : booking.endDate
    let row = rowEnds.findIndex((last) => last < clipStart)
    if (row < 0) {
      row = rowEnds.length
      rowEnds.push(clipEnd)
    } else rowEnds[row] = clipEnd
    return { booking, row, clipStart, clipEnd }
  })
}

function periodFor(view: View, focus: string) {
  const date = parseISO(focus)
  if (view === "day") {
    const iso = localISO(date)
    return { start: iso, end: iso }
  }
  if (view === "week") {
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: localISO(start), end: localISO(end) }
  }
  if (view === "year") {
    const year = date.getFullYear()
    return { start: `${year}-01-01`, end: `${year}-12-31` }
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start: localISO(start), end: localISO(end) }
}

function heading(view: View, focus: string) {
  const date = parseISO(focus)
  if (view === "year") return String(date.getFullYear())
  if (view === "month") return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  if (view === "week") {
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const left = `${months[start.getMonth()]} ${start.getDate()}`
    const same = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    const right = same ? `${end.getDate()}, ${end.getFullYear()}` : `${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
    return `${left} – ${right}`
  }
  return date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function eachDay(start: string, end: string) {
  const days: string[] = []
  const cursor = parseISO(start)
  const last = parseISO(end)
  while (cursor <= last) {
    days.push(localISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
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

function rangesOverlap(start: string, end: string, rangeStart: string, rangeEnd: string) {
  return start <= rangeEnd && rangeStart <= end
}
