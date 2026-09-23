"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTracker } from "@/components/tracker-provider"
import { ghostBtn, primaryBtn } from "@/components/ui"
import {
  bookingBalance,
  bookingLines,
  bookingTotal,
  formatDate,
  itemById,
  money,
  paidAmount,
  todayISO,
  type Booking,
  type Item,
} from "@/lib/rental"

export default function ReturnsPage() {
  const router = useRouter()
  const { settings, items, bookings, payments, setBookingStatus } = useTracker()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Booking | null>(null)
  const [note, setNote] = useState("")
  const [payAmount, setPayAmount] = useState("")
  const [payMethod, setPayMethod] = useState("")
  const today = todayISO()
  const symbol = settings.currencySymbol

  const due = bookings
    .filter((booking) => booking.status === "confirmed" || booking.status === "upcoming")
    .slice()
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.customer.localeCompare(b.customer))

  const returned = bookings
    .filter((booking) => booking.status === "returned")
    .slice()
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || a.customer.localeCompare(b.customer))

  function openBooking(id: string) {
    router.push(`/bookings?edit=${id}`)
  }

  const pendingBalance = pending ? bookingBalance(pending, payments) : 0
  const methods = settings.paymentMethods.length ? settings.paymentMethods : ["Cash"]

  function openReturn(booking: Booking) {
    const balance = bookingBalance(booking, payments)
    setPending(booking)
    setNote(booking.notes)
    setPayAmount(balance > 0.5 ? String(Math.round(balance)) : "")
    setPayMethod(methods[0] || "Cash")
    setError(null)
  }

  function confirmReturn() {
    if (!pending) return
    const amount = Number(payAmount) || 0
    const balance = bookingBalance(pending, payments)
    if (amount > 0 && amount > balance + 0.001) {
      setError("That payment is more than the balance.")
      return
    }
    const payment = amount > 0
      ? {
          amount,
          method: payMethod || "Cash",
          date: today,
          type: amount + 0.001 >= balance ? "Full Payment" : "Partial Payment",
        }
      : undefined
    const message = setBookingStatus(pending.id, "returned", note, payment)
    setError(message)
    if (message) return
    setPending(null)
    setNote("")
    setPayAmount("")
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[#9a403c]">{error}</p> : null}
      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(90,50,40,0.05)]">
          <SectionTitle title="Due for return" count={due.length} />
          {due.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">Nothing is waiting to come back.</p>
          ) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {due.map((booking) => (
                  <DueCard key={booking.id} booking={booking} items={items} symbol={symbol} today={today} onOpen={openBooking} onReturn={openReturn} />
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold xl:px-5">Client</th>
                      <th className="px-3 py-2.5 font-semibold">Items</th>
                      <th className="px-3 py-2.5 font-semibold">Due date</th>
                      <th className="px-3 py-2.5 font-semibold">Deposit</th>
                      <th className="px-3 py-2.5 font-semibold xl:px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {due.map((booking) => {
                      const tone = dueTone(booking, today)
                      return (
                        <tr key={booking.id} className={`border-t border-[#f6eeeb] ${tone.row}`}>
                          <td className="px-4 py-3 align-top xl:px-5">
                            <ClientButton name={booking.customer} onClick={() => openBooking(booking.id)} />
                          </td>
                          <td className="max-w-[240px] px-3 py-3 align-top">{itemsLabel(booking, items)}</td>
                          <td className={`px-3 py-3 align-top whitespace-nowrap ${tone.text}`}>
                            {formatDate(booking.endDate)}
                            {tone.label ? ` · ${tone.label}` : ""}
                          </td>
                          <td className="px-3 py-3 align-top whitespace-nowrap">{money(symbol, booking.deposit)}</td>
                          <td className="px-3 py-3 text-right align-top xl:px-4">
                            <ReturnButton onClick={() => openReturn(booking)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(90,50,40,0.05)]">
          <SectionTitle title="Recently returned" count={returned.length} />
          {returned.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">No completed returns yet.</p>
          ) : (
            <>
              <ul className="space-y-3 p-3 md:hidden">
                {returned.map((booking) => (
                  <li key={booking.id} className="rounded-xl border border-[#f0e4df] px-3 py-3">
                    <ClientButton name={booking.customer} onClick={() => openBooking(booking.id)} />
                    <p className="mt-1 text-sm text-ink">{itemsLabel(booking, items)}</p>
                    <p className="mt-2 text-xs text-muted">Returned {formatDate(booking.endDate)}</p>
                    <p className="mt-1 text-sm text-muted">{booking.notes || "—"}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sage text-[11px] font-semibold tracking-wide text-white uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold xl:px-5">Client</th>
                      <th className="px-3 py-2.5 font-semibold">Items</th>
                      <th className="px-3 py-2.5 font-semibold">Returned</th>
                      <th className="px-4 py-2.5 font-semibold xl:px-5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returned.map((booking) => (
                      <tr key={booking.id} className="border-t border-[#f6eeeb]">
                        <td className="px-4 py-3 align-top xl:px-5">
                          <ClientButton name={booking.customer} onClick={() => openBooking(booking.id)} />
                        </td>
                        <td className="px-3 py-3 align-top">{itemsLabel(booking, items)}</td>
                        <td className="px-3 py-3 align-top whitespace-nowrap">{formatDate(booking.endDate)}</td>
                        <td className="px-4 py-3 align-top text-muted xl:px-5">{booking.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {pending ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/25 p-0 sm:place-items-center sm:p-4" onClick={() => setPending(null)}>
          <form
            className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-4 shadow-[0_20px_50px_rgba(60,40,30,0.16)] sm:max-w-md sm:rounded-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              confirmReturn()
            }}
          >
            <h2 className="text-base font-semibold">Mark returned</h2>
            <p className="mt-1 text-sm text-muted">
              {pending.customer} · {itemsLabel(pending, items)} · due {formatDate(pending.endDate)}
            </p>
            <dl className="mt-4 space-y-1 rounded-xl bg-[#fdf4f2] px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Grand total</dt>
                <dd>{money(symbol, bookingTotal(pending))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Paid</dt>
                <dd>{money(symbol, paidAmount(payments, pending.id))}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[#f0e0db] pt-2 font-semibold">
                <dt>Balance</dt>
                <dd>{Math.abs(pendingBalance) < 0.5 ? "Fully paid" : money(symbol, pendingBalance)}</dd>
              </div>
            </dl>
            {pendingBalance > 0.5 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Payment received
                  <input
                    className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] px-3 text-sm font-normal outline-none focus:border-sage"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(event) => setPayAmount(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Method
                  <select
                    className="mt-1.5 h-10 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm font-normal outline-none focus:border-sage"
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value)}
                  >
                    {methods.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <label className="mt-4 block text-sm font-semibold">
              Return note
              <textarea
                className="mt-1.5 h-24 w-full rounded-lg border border-[#e5d7d2] px-3 py-2 text-sm font-normal outline-none focus:border-sage"
                value={note}
                placeholder="On time, condition, damage, or deposit notes"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="submit" className={`${primaryBtn} w-full sm:order-2 sm:w-auto`}>Mark returned</button>
              <button type="button" className={`${ghostBtn} w-full sm:order-1 sm:w-auto`} onClick={() => setPending(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function DueCard({
  booking,
  items,
  symbol,
  today,
  onOpen,
  onReturn,
}: {
  booking: Booking
  items: Item[]
  symbol: string
  today: string
  onOpen: (id: string) => void
  onReturn: (booking: Booking) => void
}) {
  const tone = dueTone(booking, today)
  return (
    <li className={`rounded-xl border border-[#f0e4df] px-3 py-3 ${tone.row}`}>
      <div className="flex items-start justify-between gap-3">
        <ClientButton name={booking.customer} onClick={() => onOpen(booking.id)} />
        {tone.label ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.pill}`}>{tone.label}</span> : null}
      </div>
      <p className="mt-1 text-sm text-ink">{itemsLabel(booking, items)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Due date</dt>
          <dd className={tone.text}>{formatDate(booking.endDate)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Deposit</dt>
          <dd>{money(symbol, booking.deposit)}</dd>
        </div>
      </dl>
      <button type="button" className={`${primaryBtn} mt-3 w-full`} onClick={() => onReturn(booking)}>
        Mark returned
      </button>
    </li>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="rounded-full bg-blush px-2 py-0.5 text-xs font-semibold text-ink">{count}</span>
    </div>
  )
}

function ClientButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" className="text-left text-sm font-semibold break-words hover:underline" onClick={onClick}>
      {name}
    </button>
  )
}

function ReturnButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="rounded-lg border border-[#e4d5d0] bg-white px-2.5 py-1.5 text-xs leading-tight font-semibold whitespace-nowrap text-ink hover:bg-blush" onClick={onClick}>
      Mark<br />returned
    </button>
  )
}

function dueTone(booking: Booking, today: string) {
  if (booking.endDate < today) {
    return { row: "bg-[#f8ddd6]", text: "font-semibold text-[#c4475c]", label: "Overdue", pill: "bg-white text-[#c4475c]" }
  }
  if (booking.endDate === today) {
    return { row: "bg-[#f3f8f4]", text: "font-semibold text-[#3c7a4e]", label: "Due today", pill: "bg-white text-[#3c7a4e]" }
  }
  return { row: "", text: "", label: "", pill: "" }
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
