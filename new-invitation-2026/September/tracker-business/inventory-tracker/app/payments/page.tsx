"use client"

import { useMemo, useState } from "react"
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
  money,
  paidAmount,
  paymentStanding,
  statusLabel,
  todayISO,
  type Booking,
  type Item,
  type Payment,
} from "@/lib/rental"

type Standing = "paid" | "unpaid" | "partial"
type Filter = "all" | Standing | "overdue"

const payTone: Record<Standing, string> = {
  paid: "bg-[#e5f3e8] text-[#3c7a4e]",
  unpaid: "bg-[#fde8ea] text-[#c4475c]",
  partial: "bg-[#fbf3dc] text-[#a07d32]",
}

export default function PaymentsPage() {
  const router = useRouter()
  const { settings, items, bookings, payments, addPayment, removeBooking } = useTracker()
  const today = todayISO()
  const symbol = settings.currencySymbol
  const methods = settings.paymentMethods.length ? settings.paymentMethods : ["Cash"]
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [invoice, setInvoice] = useState<Booking | null>(null)
  const [recording, setRecording] = useState<Booking | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    return bookings
      .filter((booking) => booking.status !== "cancelled")
      .map((booking) => {
        const grand = bookingTotal(booking)
        const paid = paidAmount(payments, booking.id)
        const balance = grand - paid
        const standing = paymentStanding(grand, paid)
        const overdue = balance > 0.5 && booking.endDate < today
        return { booking, grand, paid, balance, standing, overdue }
      })
      .sort((a, b) => b.booking.startDate.localeCompare(a.booking.startDate) || b.booking.code.localeCompare(a.booking.code))
  }, [bookings, payments, today])

  const totals = useMemo(() => {
    const invoiced = rows.reduce((sum, row) => sum + row.grand, 0)
    const outstanding = rows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0)
    return {
      invoiced,
      collected: invoiced - outstanding,
      outstanding,
      overdue: rows.filter((row) => row.overdue).length,
    }
  }, [rows])

  const visible = rows.filter((row) => {
    if (filter === "overdue" && !row.overdue) return false
    if (filter !== "all" && filter !== "overdue" && row.standing !== filter) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const names = bookingLines(row.booking).map((line) => itemById(items, line.itemId)?.name || "").join(" ")
    return (
      row.booking.customer.toLowerCase().includes(needle) ||
      row.booking.invoiceCode.toLowerCase().includes(needle) ||
      row.booking.code.toLowerCase().includes(needle) ||
      names.toLowerCase().includes(needle)
    )
  })

  function edit(booking: Booking) {
    router.push(`/bookings?edit=${booking.id}`)
  }

  function remove(booking: Booking) {
    if (!window.confirm(`Remove ${booking.invoiceCode} for ${booking.customer}?`)) return
    removeBooking(booking.id)
    if (invoice?.id === booking.id) setInvoice(null)
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total invoiced" value={money(symbol, totals.invoiced)} tone="bg-[#e7f3ea] text-[#3c7a4e]" icon={<DocIcon />} />
        <Stat label="Collected" value={money(symbol, totals.collected)} tone="bg-[#fde8ea] text-[#c45c6c]" icon={<BagIcon />} />
        <Stat label="Outstanding" value={money(symbol, totals.outstanding)} tone="bg-[#f8f1e4] text-[#a07d32]" icon={<HourglassIcon />} />
        <Stat label="Overdue invoices" value={String(totals.overdue)} tone="bg-[#fdeceb] text-[#c4475c]" icon={<AlertIcon />} />
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(90,50,40,0.05)]">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 className="text-sm font-semibold">All invoices</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="h-10 w-full rounded-lg border border-[#e5d7d2] px-3 text-sm outline-none focus:border-sage sm:w-56"
              placeholder="Search client or invoice"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search client or invoice"
            />
            <select
              className="h-10 rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm outline-none"
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
              aria-label="Payment status"
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
            </select>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-coral px-3 text-sm font-semibold text-white hover:bg-[#e37c74]" onClick={() => {
              const owing = rows.find((row) => row.balance > 0.5)
              const booking = (owing ?? rows[0])?.booking
              if (!booking) return
              setRecording(booking)
              setError(null)
            }}>
              + Record payment
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No invoices match that search.</p>
        ) : (
          <>
            <ul className="space-y-3 p-3 lg:hidden">
              {visible.map((row) => (
                <li key={row.booking.id} className={`rounded-xl border border-[#f0e4df] px-3 py-3 ${row.overdue ? "bg-[#fdf6f4]" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.booking.invoiceCode}</p>
                      <button type="button" className="text-left text-sm font-semibold hover:underline" onClick={() => edit(row.booking)}>{row.booking.customer}</button>
                    </div>
                    <PayPill standing={row.standing} />
                  </div>
                  <p className="mt-1 text-sm">{itemsLabel(row.booking, items)}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(row.booking.startDate)} – {formatDate(row.booking.endDate)}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Total</dt>
                      <dd>{money(symbol, row.grand)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Paid</dt>
                      <dd>{money(symbol, row.paid)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Balance</dt>
                      <dd className={row.balance > 0.5 ? "font-semibold text-[#c4475c]" : ""}>{money(symbol, row.balance)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end">
                    <RowActions booking={row.booking} onView={() => setInvoice(row.booking)} onEdit={() => edit(row.booking)} onRemove={() => remove(row.booking)} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold xl:px-5">Invoice #</th>
                    <th className="px-3 py-2.5 font-semibold">Client</th>
                    <th className="px-3 py-2.5 font-semibold">Items</th>
                    <th className="px-3 py-2.5 font-semibold">Period</th>
                    <th className="px-3 py-2.5 font-semibold">Grand total</th>
                    <th className="px-3 py-2.5 font-semibold">Paid</th>
                    <th className="px-3 py-2.5 font-semibold">Balance</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold xl:px-4" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.booking.id} className={`border-t border-[#f6eeeb] ${row.overdue ? "bg-[#fdf6f4]" : ""}`}>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap xl:px-5">{row.booking.invoiceCode}</td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">{row.booking.customer}</td>
                      <td className="max-w-[220px] px-3 py-3">{itemsLabel(row.booking, items)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[13px]">{formatDate(row.booking.startDate)} – {formatDate(row.booking.endDate)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{money(symbol, row.grand)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{money(symbol, row.paid)}</td>
                      <td className={`px-3 py-3 whitespace-nowrap ${row.balance > 0.5 ? "font-semibold text-[#c4475c]" : ""}`}>{money(symbol, row.balance)}</td>
                      <td className="px-3 py-3"><PayPill standing={row.standing} /></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap xl:px-4">
                        <RowActions booking={row.booking} onView={() => setInvoice(row.booking)} onEdit={() => edit(row.booking)} onRemove={() => remove(row.booking)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-[#fdf4f2] px-3 py-2 text-xs text-[#a56d66]">
        <HeartIcon />
        <span>TIP: Every booking is its own invoice — edit it from either the Bookings or Payments tab, both stay in sync.</span>
      </p>

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
          onEdit={() => edit(invoice)}
          onPay={() => {
            setRecording(invoice)
            setInvoice(null)
            setError(null)
          }}
        />
      ) : null}

      {recording ? (
        <RecordDialog
          bookings={rows.map((row) => row.booking)}
          payments={payments}
          items={items}
          methods={methods}
          symbol={symbol}
          initialId={recording.id}
          today={today}
          error={error}
          onClose={() => { setRecording(null); setError(null) }}
          onSave={(draft) => {
            const message = addPayment(draft)
            setError(message)
            if (!message) setRecording(null)
          }}
        />
      ) : null}
    </div>
  )
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(90,50,40,0.04)]">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</p>
        <p className="truncate text-xl font-semibold text-ink">{value}</p>
      </div>
    </article>
  )
}

function PayPill({ standing }: { standing: Standing }) {
  const label = standing === "paid" ? "Paid" : standing === "partial" ? "Partial" : "Unpaid"
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${payTone[standing]}`}>{label}</span>
}

function RowActions({ booking, onView, onEdit, onRemove }: { booking: Booking; onView: () => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex">
      <IconButton label={`View ${booking.invoiceCode}`} onClick={onView}><EyeIcon /></IconButton>
      <IconButton label={`Edit ${booking.invoiceCode}`} onClick={onEdit}><PencilIcon /></IconButton>
      <IconButton label={`Remove ${booking.invoiceCode}`} onClick={onRemove} danger><TrashIcon /></IconButton>
    </span>
  )
}

function RecordDialog({
  bookings,
  payments,
  items,
  methods,
  symbol,
  initialId,
  today,
  error,
  onClose,
  onSave,
}: {
  bookings: Booking[]
  payments: Payment[]
  items: Item[]
  methods: string[]
  symbol: string
  initialId: string
  today: string
  error: string | null
  onClose: () => void
  onSave: (draft: { bookingId: string; amount: number; method: string; date: string; note: string; type?: string }) => void
}) {
  const [bookingId, setBookingId] = useState(initialId)
  const booking = bookings.find((entry) => entry.id === bookingId) ?? bookings[0]
  const balance = booking ? bookingBalance(booking, payments) : 0
  const [amount, setAmount] = useState(balance > 0.5 ? String(Math.round(balance)) : "")
  const [method, setMethod] = useState(methods[0] || "Cash")
  const [date, setDate] = useState(today)
  const [note, setNote] = useState("")

  function choose(id: string) {
    const next = bookings.find((entry) => entry.id === id)
    const due = next ? bookingBalance(next, payments) : 0
    setBookingId(id)
    setAmount(due > 0.5 ? String(Math.round(due)) : "")
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/25 sm:place-items-center sm:p-4" onClick={onClose}>
      <form
        className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-4 shadow-[0_20px_50px_rgba(60,40,30,0.16)] sm:max-w-lg sm:rounded-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!booking) return
          const value = Number(amount) || 0
          onSave({
            bookingId: booking.id,
            amount: value,
            method,
            date,
            note,
            type: value + 0.001 >= balance ? "Full Payment" : "Partial Payment",
          })
        }}
      >
        <h2 className="text-base font-semibold">Record payment</h2>
        <label className="mt-4 block text-sm font-semibold">
          Invoice
          <select className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm font-normal" value={booking?.id ?? ""} onChange={(event) => choose(event.target.value)}>
            {bookings.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.invoiceCode} · {entry.customer} · {itemsLabel(entry, items)}</option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-sm text-muted">Balance {balance > 0.5 ? money(symbol, balance) : balance < -0.5 ? money(symbol, balance) : "fully paid"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Amount
            <input className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] px-3 text-sm font-normal outline-none focus:border-sage" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Method
            <select className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm font-normal" value={method} onChange={(event) => setMethod(event.target.value)}>
              {methods.map((entry) => <option key={entry}>{entry}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Date
            <input className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] px-3 text-sm font-normal" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Note
            <input className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] px-3 text-sm font-normal" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-[#9a403c]">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="submit" className={`${primaryBtn} w-full sm:order-2 sm:w-auto`}>Save payment</button>
          <button type="button" className={`${ghostBtn} w-full sm:order-1 sm:w-auto`} onClick={onClose}>Cancel</button>
        </div>
      </form>
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
  onPay,
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
  onPay: () => void
}) {
  const grand = bookingTotal(booking)
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const balance = bookingBalance(booking, payments)
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-[0_24px_60px_rgba(60,40,30,0.18)] sm:max-w-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Invoice ${booking.invoiceCode}`}>
        <div className="flex items-center justify-between border-b border-[#f3e4df] px-5 py-3">
          <h2 className="text-sm font-semibold">Invoice {booking.invoiceCode}</h2>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-lg text-muted hover:bg-blush" onClick={onClose} aria-label="Close">×</button>
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
            <div><dt className="text-muted">Client</dt><dd>{booking.customer}</dd></div>
            <div><dt className="text-muted">Phone</dt><dd>{booking.phone || "—"}</dd></div>
            <div><dt className="text-muted">Rental period</dt><dd>{formatDate(booking.startDate)} – {formatDate(booking.endDate)}</dd></div>
            <div><dt className="text-muted">Status</dt><dd>{statusLabel(booking.status)}</dd></div>
          </dl>
          <table className="mt-4 w-full text-sm">
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
                    <td className="py-2">{item?.name ?? "Removed item"}</td>
                    <td className="py-2">{line.quantity}</td>
                    <td className="py-2">{money(symbol, line.rate)}</td>
                    <td className="py-2 text-right">{money(symbol, line.quantity * line.rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 rounded-xl bg-[#fdf4f2] px-4 py-3 text-sm">
            <MoneyRow label="Subtotal" value={money(symbol, bookingSubtotal(booking))} />
            <MoneyRow label="Discount" value={booking.discount ? `-${money(symbol, booking.discount)}` : money(symbol, 0)} />
            <MoneyRow label="Rental fee" value={money(symbol, bookingRentalFee(booking))} />
            <MoneyRow label="Security deposit" value={money(symbol, booking.deposit)} />
            <div className="flex justify-between border-t border-[#f0e0db] pt-2 font-semibold">
              <span>Grand total</span>
              <span>{money(symbol, grand)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fdf4f2] px-4 py-3 text-sm">
            <div>
              <p className="text-muted">Total paid</p>
              <p className="font-semibold">{money(symbol, paid)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted">Balance</p>
              {Math.abs(balance) < 0.5 ? (
                <span className="mt-1 inline-flex rounded-full bg-[#e5f3e8] px-2.5 py-0.5 text-xs font-semibold text-[#3c7a4e]">Fully paid</span>
              ) : (
                <p className="font-semibold">{money(symbol, balance)}</p>
              )}
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted">{note || `Thank you for renting with ${brand}.`}</p>
        </article>
        <div className="flex flex-col gap-2 border-t border-[#f3e4df] px-5 py-3 sm:flex-row sm:justify-end">
          {balance > 0.5 ? <button type="button" className={`${primaryBtn} w-full sm:order-3 sm:w-auto`} onClick={onPay}>Record payment</button> : null}
          <button type="button" className={`${ghostBtn} w-full sm:order-2 sm:w-auto`} onClick={() => window.print()}>Print</button>
          <button type="button" className={`${ghostBtn} w-full sm:order-1 sm:w-auto`} onClick={onEdit}>Edit</button>
          <button type="button" className={`${ghostBtn} w-full sm:w-auto`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span>{label}</span><span>{value}</span></div>
}

function IconButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`inline-grid h-8 w-8 place-items-center rounded-lg text-muted ${danger ? "hover:bg-[#fdeceb] hover:text-[#9a403c]" : "hover:bg-blush hover:text-ink"}`}>
      {children}
    </button>
  )
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></svg>
}
function PencilIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20z" /></svg>
}
function TrashIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" /></svg>
}
function DocIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>
}
function BagIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8h12v11H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
}
function HourglassIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8" /></svg>
}
function AlertIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
}
function HeartIcon() {
  return <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" /></svg>
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
