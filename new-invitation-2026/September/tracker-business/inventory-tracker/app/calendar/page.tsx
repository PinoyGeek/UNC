"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTracker } from "@/components/tracker-provider"
import { ghostBtn, primaryBtn } from "@/components/ui"
import {
  bookingBalance,
  bookingLines,
  bookingRentalFee,
  bookingSubtotal,
  bookingTotal,
  formatDate,
  itemById,
  localISO,
  money,
  paidAmount,
  paymentStanding,
  statusLabel,
  todayISO,
  type Booking,
  type BookingStatus,
  type Item,
  type Payment,
} from "@/lib/rental"

type View = "time" | "day" | "week" | "month" | "year"
type PayKind = "paid" | "partial" | "unpaid"

const views: { id: View; label: string }[] = [
  { id: "time", label: "Time" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
]

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const hours = Array.from({ length: 16 }, (_, index) => index + 6)

const chipTone: Record<BookingStatus, string> = {
  confirmed: "bg-[#e5f4e8] text-[#2f6a40]",
  upcoming: "bg-[#fde8ea] text-[#c45c6c]",
  returned: "bg-[#f4eee9] text-[#8d756c]",
  cancelled: "bg-[#fdeceb] text-[#9a403c]",
}

const dotTone: Record<PayKind, string> = {
  paid: "bg-[#3c9a55]",
  partial: "bg-[#e2b23a]",
  unpaid: "bg-[#e25b55]",
}

export default function CalendarPage() {
  const router = useRouter()
  const { settings, items, bookings, payments, setCompose } = useTracker()
  const today = todayISO()
  const [focus, setFocus] = useState(today)
  const [view, setView] = useState<View>("month")
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<Booking | null>(null)
  const symbol = settings.currencySymbol

  const onDate = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const booking of bookings) {
      const cursor = parseISO(booking.startDate)
      const end = parseISO(booking.endDate)
      if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) continue
      while (cursor <= end) {
        const iso = localISO(cursor)
        const list = map.get(iso)
        if (list) list.push(booking)
        else map.set(iso, [booking])
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    for (const list of map.values()) list.sort(byCustomer)
    return map
  }, [bookings])

  function bookingsFor(iso: string) {
    return onDate.get(iso) ?? []
  }

  function openInvoice(booking: Booking) {
    setDayOpen(null)
    setInvoice(booking)
  }

  function openDay(iso: string) {
    setFocus(iso)
    setDayOpen(iso)
  }

  function createBooking(date = focus) {
    setCompose("booking")
    router.push(`/bookings?start=${date}`)
  }

  function shift(direction: number) {
    if (view === "year") setFocus(addMonths(focus, direction * 12))
    else if (view === "month") setFocus(addMonths(focus, direction))
    else if (view === "week") setFocus(addDays(focus, direction * 7))
    else setFocus(addDays(focus, direction))
  }

  const dayBookings = dayOpen ? bookingsFor(dayOpen) : []

  useEffect(() => {
    if (!dayOpen && !invoice) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (invoice) setInvoice(null)
      else setDayOpen(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dayOpen, invoice])

  return (
    <div className="rounded-2xl bg-white px-3 py-4 shadow-[0_10px_30px_rgba(90,50,40,0.05)] sm:px-5 sm:py-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={navBtn} aria-label="Previous" onClick={() => shift(-1)}>
            <Chevron direction="left" />
          </button>
          <h2 className="min-w-40 text-center text-base font-semibold text-ink sm:min-w-56 sm:text-lg">{heading(view, focus)}</h2>
          <button type="button" className={navBtn} aria-label="Next" onClick={() => shift(1)}>
            <Chevron direction="right" />
          </button>
          <button type="button" className={todayBtn} onClick={() => setFocus(today)}>
            Today
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#e5d7d2] bg-[#fbf8f7] p-0.5" role="tablist" aria-label="Calendar view">
            {views.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={view === entry.id}
                onClick={() => setView(entry.id)}
                className={`rounded-md px-2.5 py-1 text-sm font-medium ${view === entry.id ? "bg-sage text-white" : "text-ink hover:bg-white"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button type="button" className="inline-flex h-9 items-center rounded-lg bg-coral px-3 text-sm font-semibold text-white hover:bg-[#e37c74]" onClick={() => createBooking()}>
            + New booking
          </button>
        </div>
      </div>

      <div className="mt-4">
        {view === "month" ? (
          <MonthView focus={focus} today={today} bookingsFor={bookingsFor} items={items} payments={payments} onDay={openDay} onBooking={openInvoice} />
        ) : null}
        {view === "week" ? (
          <WeekView focus={focus} today={today} bookingsFor={bookingsFor} items={items} payments={payments} onDay={openDay} onBooking={openInvoice} />
        ) : null}
        {view === "day" ? (
          <DayView iso={focus} bookings={bookingsFor(focus)} items={items} payments={payments} symbol={symbol} onBooking={openInvoice} onCreate={() => createBooking(focus)} />
        ) : null}
        {view === "time" ? (
          <TimeView iso={focus} bookings={bookingsFor(focus)} items={items} payments={payments} today={today} onBooking={openInvoice} onCreate={() => createBooking(focus)} />
        ) : null}
        {view === "year" ? (
          <YearView focus={focus} today={today} bookingsFor={bookingsFor} onMonth={(iso) => { setFocus(iso); setView("month") }} onDay={openDay} />
        ) : null}
      </div>

      <Legend />

      {dayOpen ? (
        <DayDialog
          iso={dayOpen}
          bookings={dayBookings}
          items={items}
          payments={payments}
          today={today}
          onClose={() => setDayOpen(null)}
          onBooking={openInvoice}
          onCreate={() => createBooking(dayOpen)}
        />
      ) : null}

      {invoice ? (
        <InvoiceDialog
          booking={invoice}
          items={items}
          payments={payments.filter((payment) => payment.bookingId === invoice.id)}
          brand={settings.brandName || settings.businessName}
          noun={settings.itemNoun}
          note={settings.invoiceNote}
          symbol={symbol}
          onClose={() => setInvoice(null)}
          onEdit={() => router.push(`/bookings?edit=${invoice.id}`)}
        />
      ) : null}
    </div>
  )
}

function MonthView({
  focus,
  today,
  bookingsFor,
  items,
  payments,
  onDay,
  onBooking,
}: {
  focus: string
  today: string
  bookingsFor: (iso: string) => Booking[]
  items: Item[]
  payments: Payment[]
  onDay: (iso: string) => void
  onBooking: (booking: Booking) => void
}) {
  const cells = monthCells(focus)
  return (
    <div>
      <WeekdayRow />
      <div className="grid grid-cols-7 border-l border-t border-[#efe4e0]">
        {cells.map((cell) => (
          <DayCell
            key={cell.iso}
            iso={cell.iso}
            day={cell.day}
            muted={!cell.inMonth}
            today={today}
            bookings={bookingsFor(cell.iso)}
            items={items}
            payments={payments}
            limit={2}
            tall={false}
            onDay={onDay}
            onBooking={onBooking}
          />
        ))}
      </div>
    </div>
  )
}

function WeekView({
  focus,
  today,
  bookingsFor,
  items,
  payments,
  onDay,
  onBooking,
}: {
  focus: string
  today: string
  bookingsFor: (iso: string) => Booking[]
  items: Item[]
  payments: Payment[]
  onDay: (iso: string) => void
  onBooking: (booking: Booking) => void
}) {
  const start = startOfWeek(focus)
  const days = Array.from({ length: 7 }, (_, index) => addDays(localISO(start), index))
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <WeekdayRow />
        <div className="grid grid-cols-7 border-l border-t border-[#efe4e0]">
          {days.map((iso) => (
            <DayCell
              key={iso}
              iso={iso}
              day={parseISO(iso).getDate()}
              muted={false}
              today={today}
              bookings={bookingsFor(iso)}
              items={items}
              payments={payments}
              limit={8}
              tall
              onDay={onDay}
              onBooking={onBooking}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayView({
  iso,
  bookings,
  items,
  payments,
  symbol,
  onBooking,
  onCreate,
}: {
  iso: string
  bookings: Booking[]
  items: Item[]
  payments: Payment[]
  symbol: string
  onBooking: (booking: Booking) => void
  onCreate: () => void
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Rental start and end use {formatDate(iso)}.</p>
        <button type="button" className="inline-flex h-9 items-center rounded-lg bg-coral px-3 text-sm font-semibold text-white hover:bg-[#e37c74]" onClick={onCreate}>
          + Add booking
        </button>
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-xl bg-blush/60 px-4 py-10 text-center text-sm text-muted">Nothing booked on {formatDate(iso)}.</p>
      ) : (
        <ul className="space-y-2">
      {bookings.map((booking) => {
        const pay = payKind(booking, payments, iso)
        const grand = bookingTotal(booking)
        const paid = paidAmount(payments, booking.id)
        return (
          <li key={booking.id}>
            <button type="button" onClick={() => onBooking(booking)} className="flex w-full items-start gap-3 rounded-xl border border-[#efe4e0] bg-white px-4 py-3 text-left hover:border-sage">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotTone[pay]}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{booking.customer}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipTone[booking.status]}`}>{statusLabel(booking.status)}</span>
                </span>
                <span className="mt-1 block text-sm text-muted">{itemsLabel(booking, items)}</span>
                <span className="mt-1 block text-xs text-muted">
                  {formatDate(booking.startDate)} – {formatDate(booking.endDate)} · {booking.invoiceCode} · {money(symbol, grand)} · {payLabel(pay, paid, grand)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
        </ul>
      )}
    </div>
  )
}

function TimeView({
  iso,
  bookings,
  items,
  payments,
  today,
  onBooking,
  onCreate,
}: {
  iso: string
  bookings: Booking[]
  items: Item[]
  payments: Payment[]
  today: string
  onBooking: (booking: Booking) => void
  onCreate: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#efe4e0]">
      <div className="flex items-center justify-between gap-2 border-b border-[#efe4e0] px-3 py-2">
        <p className="text-sm text-muted">Rental start and end use {formatDate(iso)}.</p>
        <button type="button" className="inline-flex h-9 items-center rounded-lg bg-coral px-3 text-sm font-semibold text-white hover:bg-[#e37c74]" onClick={onCreate}>
          + Add booking
        </button>
      </div>
      <div className="grid grid-cols-[72px_1fr] border-b border-[#efe4e0] bg-[#fbf8f7]">
        <div className="px-2 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase">All day</div>
        <div className="space-y-1 px-2 py-2">
          {bookings.length === 0 ? (
            <p className="py-1 text-sm text-muted">Nothing booked on {formatDate(iso)}.</p>
          ) : (
            bookings.map((booking) => (
              <BookingChip key={booking.id} booking={booking} items={items} payments={payments} today={today} onOpen={onBooking} roomy />
            ))
          )}
        </div>
      </div>
      <div className="max-h-[540px] overflow-auto">
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[72px_1fr] border-b border-[#f3ebe8] last:border-b-0">
            <div className="px-2 py-3 text-right text-[11px] text-muted">{hourLabel(hour)}</div>
            <div className="min-h-12 border-l border-[#f3ebe8]" />
          </div>
        ))}
      </div>
      <p className="border-t border-[#efe4e0] px-3 py-2 text-xs text-muted">Rentals are booked by the day, so each one sits in All day for every date it covers.</p>
    </div>
  )
}

function YearView({
  focus,
  today,
  bookingsFor,
  onMonth,
  onDay,
}: {
  focus: string
  today: string
  bookingsFor: (iso: string) => Booking[]
  onMonth: (iso: string) => void
  onDay: (iso: string) => void
}) {
  const year = parseISO(focus).getFullYear()
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, month) => {
        const iso = localISO(new Date(year, month, 1))
        const cells = monthCells(iso)
        return (
          <section key={iso} className="rounded-xl border border-[#efe4e0] p-3">
            <button type="button" onClick={() => onMonth(iso)} className="text-sm font-semibold text-ink hover:text-sage">
              {new Date(year, month, 1).toLocaleDateString("en-PH", { month: "long" })}
            </button>
            <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold text-muted">
              {weekdays.map((day) => (
                <span key={day}>{day.slice(0, 1)}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1">
              {cells.map((cell) => {
                const count = cell.inMonth ? bookingsFor(cell.iso).length : 0
                const isToday = cell.iso === today
                return (
                  <button
                    key={`${iso}-${cell.iso}`}
                    type="button"
                    disabled={!cell.inMonth}
                    onClick={() => onDay(cell.iso)}
                    className={`mx-auto flex h-8 w-7 flex-col items-center justify-center rounded-full text-[11px] leading-none ${
                      !cell.inMonth ? "text-transparent" : isToday ? "bg-coral font-semibold text-white" : count ? "font-semibold text-ink hover:bg-blush" : "text-muted hover:bg-blush"
                    }`}
                  >
                    <span>{cell.inMonth ? cell.day : ""}</span>
                    {count > 0 ? <span className={`mt-0.5 h-1 w-1 rounded-full ${isToday ? "bg-white" : "bg-sage"}`} /> : <span className="mt-0.5 h-1 w-1" />}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function DayCell({
  iso,
  day,
  muted,
  today,
  bookings,
  items,
  payments,
  limit,
  tall,
  onDay,
  onBooking,
}: {
  iso: string
  day: number
  muted: boolean
  today: string
  bookings: Booking[]
  items: Item[]
  payments: Payment[]
  limit: number
  tall: boolean
  onDay: (iso: string) => void
  onBooking: (booking: Booking) => void
}) {
  const shown = bookings.slice(0, limit)
  const extra = bookings.length - shown.length
  const isToday = iso === today
  return (
    <div
      role="presentation"
      onClick={() => onDay(iso)}
      className={`min-h-16 cursor-pointer border-r border-b border-[#efe4e0] p-1 text-left sm:p-1.5 ${tall ? "min-h-64" : "sm:min-h-[118px]"} ${muted ? "bg-[#fbf8f7]" : "bg-white"}`}
    >
      <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-coral text-white" : muted ? "text-[#c9bbb6]" : "text-ink"}`}>
        {day}
      </span>
      <div className="mt-1 flex gap-0.5 sm:hidden">
        {bookings.slice(0, 4).map((booking) => (
          <span key={booking.id} className={`h-1.5 w-1.5 rounded-full ${dotTone[payKind(booking, payments, today)]}`} />
        ))}
      </div>
      <div className="mt-1 hidden space-y-1 sm:block">
        {shown.map((booking) => (
          <BookingChip key={booking.id} booking={booking} items={items} payments={payments} today={today} onOpen={onBooking} />
        ))}
        {extra > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDay(iso)
            }}
            className="px-1 text-[10px] font-semibold text-muted hover:text-ink"
          >
            +{extra} more
          </button>
        ) : null}
      </div>
    </div>
  )
}

function BookingChip({
  booking,
  items,
  payments,
  today,
  onOpen,
  roomy = false,
}: {
  booking: Booking
  items: Item[]
  payments: Payment[]
  today: string
  onOpen: (booking: Booking) => void
  roomy?: boolean
}) {
  const lines = bookingLines(booking)
  const first = lines[0]
  const item = first ? itemById(items, first.itemId) : undefined
  const who = booking.customer.split(" ")[0] || booking.customer
  const piece = item?.name ?? "Item"
  const qty = first && first.quantity > 1 ? ` ×${first.quantity}` : ""
  const extra = Math.max(0, lines.length - 1)
  const pay = payKind(booking, payments, today)
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen(booking)
      }}
      title={`${booking.customer} · ${piece}${qty}`}
      className={`flex w-full items-start gap-1 rounded-md text-left ${roomy ? "px-2 py-1.5 text-sm" : "px-1.5 py-0.5 text-[11px] leading-snug"} ${chipTone[booking.status]}`}
    >
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${dotTone[pay]}`} />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {who} · {piece}
          {qty}
        </span>
        {extra > 0 ? <span className="block text-[10px] opacity-75">+{extra} more</span> : null}
      </span>
    </button>
  )
}

function DayDialog({
  iso,
  bookings,
  items,
  payments,
  today,
  onClose,
  onBooking,
  onCreate,
}: {
  iso: string
  bookings: Booking[]
  items: Item[]
  payments: Payment[]
  today: string
  onClose: () => void
  onBooking: (booking: Booking) => void
  onCreate: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/25 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-[0_20px_50px_rgba(60,40,30,0.16)]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={longDate(iso)}>
        <div className="flex items-center justify-between border-b border-[#efe4e0] px-5 py-3">
          <h3 className="text-sm font-semibold">{longDate(iso)}</h3>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-blush" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="px-5 pt-3 text-xs text-muted">Add a booking and the rental start and end dates use {formatDate(iso)}. You can change either date before saving.</p>
        <ul className="space-y-2 px-4 py-4">
          {bookings.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">Nothing booked this day.</li>
          ) : (
            bookings.map((booking) => (
              <li key={booking.id}>
                <button type="button" onClick={() => onBooking(booking)} className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-blush">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotTone[payKind(booking, payments, today)]}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{booking.customer}</span>
                    <span className="block truncate text-sm text-muted">{itemsLabel(booking, items)}</span>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipTone[booking.status]}`}>{statusLabel(booking.status)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end border-t border-[#efe4e0] px-4 py-3">
          <button type="button" className={primaryBtn} onClick={onCreate}>+ Add booking</button>
        </div>
      </div>
    </div>
  )
}

function InvoiceDialog({
  booking,
  items,
  payments,
  brand,
  noun,
  note,
  symbol,
  onClose,
  onEdit,
}: {
  booking: Booking
  items: Item[]
  payments: Payment[]
  brand: string
  noun: string
  note: string
  symbol: string
  onClose: () => void
  onEdit: () => void
}) {
  const subtotal = bookingSubtotal(booking)
  const fee = bookingRentalFee(booking)
  const grand = bookingTotal(booking)
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const balance = bookingBalance(booking, payments)
  const settled = Math.abs(balance) < 0.5
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-[0_24px_60px_rgba(60,40,30,0.18)]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Invoice ${booking.invoiceCode}`}>
        <div className="flex items-center justify-between border-b border-[#f3e4df] px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Invoice {booking.invoiceCode}</h2>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-lg text-muted hover:bg-blush" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <article className="print-receipt px-5 py-5 sm:px-8">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-script text-4xl leading-none text-rose">{brand}</p>
              <p className="mt-1 text-xs text-muted">{noun.toLowerCase()} rental invoice</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{booking.invoiceCode}</p>
              <p className="text-muted">{booking.code}</p>
            </div>
          </header>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Client</dt>
              <dd>{booking.customer}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>{booking.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Rental period</dt>
              <dd>{formatDate(booking.startDate)} – {formatDate(booking.endDate)}</dd>
            </div>
            <div>
              <dt className="text-muted">Status</dt>
              <dd>{statusLabel(booking.status)}</dd>
            </div>
          </dl>
          <h3 className="mt-6 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Items</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-[#f0e4df] text-left text-xs text-muted">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">Qty</th>
                <th className="py-2 font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bookingLines(booking).map((line) => {
                const item = itemById(items, line.itemId)
                return (
                  <tr key={`${line.itemId}-${line.rate}`}>
                    <td className="py-2">{item ? `${item.name}${item.code ? ` (${item.code})` : ""}` : "Removed item"}</td>
                    <td className="py-2">{line.quantity}</td>
                    <td className="py-2">{money(symbol, line.rate)}</td>
                    <td className="py-2 text-right">{money(symbol, line.quantity * line.rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 rounded-xl bg-[#fdf4f2] px-4 py-3 text-sm">
            <MoneyRow label="Subtotal" value={money(symbol, subtotal)} />
            <MoneyRow label="Discount" value={booking.discount ? `-${money(symbol, booking.discount)}` : money(symbol, 0)} />
            <MoneyRow label="Rental fee" value={money(symbol, fee)} />
            <MoneyRow label="Security deposit" value={money(symbol, booking.deposit)} />
            <div className="flex justify-between border-t border-[#f0e0db] pt-2 text-base font-semibold">
              <span>Grand total</span>
              <span>{money(symbol, grand)}</span>
            </div>
          </div>
          <h3 className="mt-6 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Payments received</h3>
          {payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No payments recorded yet.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0e4df] text-left text-xs text-muted">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">MOP</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-2">{payment.date ? formatDate(payment.date) : "—"}</td>
                    <td className="py-2">{payment.type || "Payment"}</td>
                    <td className="py-2">{money(symbol, payment.amount)}</td>
                    <td className="py-2">{payment.method}</td>
                    <td className="py-2">{payment.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fdf4f2] px-4 py-3 text-sm">
            <div>
              <p className="text-muted">Total paid</p>
              <p className="font-semibold">{money(symbol, paid)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted">Balance</p>
              {settled ? (
                <span className="mt-1 inline-flex rounded-full bg-[#e5f3e8] px-2.5 py-0.5 text-xs font-semibold text-[#3c7a4e]">Fully paid</span>
              ) : (
                <p className="font-semibold">{money(symbol, balance)}</p>
              )}
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted">{note || `Thank you for renting with ${brand}.`}</p>
        </article>
        <div className="flex justify-end gap-2 border-t border-[#f3e4df] px-5 py-3">
          <button type="button" className={ghostBtn} onClick={onClose}>Close</button>
          <button type="button" className={ghostBtn} onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button type="button" className={primaryBtn} onClick={onEdit}>Edit</button>
        </div>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>Booking status:</span>
        <LegendChip className={chipTone.confirmed} label="Confirmed" />
        <LegendChip className={chipTone.upcoming} label="Upcoming" />
        <LegendChip className={chipTone.returned} label="Returned" />
        <LegendChip className={chipTone.cancelled} label="Cancelled" />
        <span className="ml-1">Payment (dot):</span>
        <Dot label="Paid" className={dotTone.paid} />
        <Dot label="Partial" className={dotTone.partial} />
        <Dot label="Unpaid / Overdue" className={dotTone.unpaid} />
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-[#fdf4f2] px-3 py-2 text-xs text-[#a56d66]">
        <HeartIcon />
        <span>TIP: Click a booking to open its full invoice. Click a date to see that day and add a booking. Rental start and end use the date you picked.</span>
      </p>
    </div>
  )
}

function WeekdayRow() {
  return (
    <div className="grid grid-cols-7 border-b border-[#efe4e0] text-center text-[11px] font-semibold tracking-wide text-muted uppercase">
      {weekdays.map((day) => (
        <div key={day} className="py-2">
          <span className="sm:hidden">{day.slice(0, 1)}</span>
          <span className="hidden sm:inline">{day}</span>
        </div>
      ))}
    </div>
  )
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${className}`}>{label}</span>
}

function Dot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {direction === "left" ? <path d="M14 6l-6 6 6 6" /> : <path d="M10 6l6 6-6 6" />}
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v6H7z" />
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

function heading(view: View, focus: string) {
  const date = parseISO(focus)
  if (view === "year") return String(date.getFullYear())
  if (view === "month") return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  if (view === "week") {
    const start = startOfWeek(focus)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const left = `${months[start.getMonth()]} ${start.getDate()}`
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    const right = sameMonth
      ? `${end.getDate()}, ${end.getFullYear()}`
      : `${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
    return `${left} – ${right}`
  }
  return date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function longDate(iso: string) {
  return parseISO(iso).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function itemsLabel(booking: Booking, items: Item[]) {
  return bookingLines(booking)
    .map((line) => {
      const item = itemById(items, line.itemId)
      const name = item?.name ?? "Removed item"
      return line.quantity > 1 ? `${name} ×${line.quantity}` : name
    })
    .join(", ")
}

function payKind(booking: Booking, payments: Payment[], today: string): PayKind {
  const standing = paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id))
  if (standing === "paid") return "paid"
  if (booking.endDate < today) return "unpaid"
  return standing
}

function payLabel(kind: PayKind, paid: number, grand: number) {
  if (kind === "paid") return "Paid"
  if (paid > 0 && paid < grand) return "Partial"
  return "Unpaid"
}

function byCustomer(a: Booking, b: Booking) {
  return a.customer.localeCompare(b.customer) || a.code.localeCompare(b.code)
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

function startOfWeek(iso: string) {
  const date = parseISO(iso)
  date.setDate(date.getDate() - date.getDay())
  return date
}

function monthCells(iso: string) {
  const date = parseISO(iso)
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(start)
    cell.setDate(start.getDate() + index)
    return { iso: localISO(cell), inMonth: cell.getMonth() === month && cell.getFullYear() === year, day: cell.getDate() }
  })
  while (cells.length > 7 && cells.slice(-7).every((cell) => !cell.inMonth)) cells.splice(-7, 7)
  return cells
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM"
  const value = hour % 12 || 12
  return `${value} ${suffix}`
}
