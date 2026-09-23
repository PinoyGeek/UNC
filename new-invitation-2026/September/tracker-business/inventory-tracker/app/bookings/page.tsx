"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTracker, type BookingDraft } from "@/components/tracker-provider"
import { Field, ghostBtn, inputClass, primaryBtn } from "@/components/ui"
import {
  bookingBalance,
  bookingLines,
  bookingRentalFee,
  bookingSubtotal,
  bookingTotal,
  formatDate,
  itemById,
  lineDeposit,
  money,
  paidAmount,
  paymentStanding,
  statusLabel,
  type Booking,
  type BookingStatus,
  type Item,
  type Payment,
} from "@/lib/rental"

const statuses: BookingStatus[] = ["upcoming", "confirmed", "returned"]
const paymentTypes = ["Deposit", "Partial Payment", "Full Payment"]

type LineDraft = { itemId: string; quantity: string; rate: string }
type PaymentDraft = { id: string; date: string; type: string; amount: string; method: string; note: string }
type FormState = {
  id: string
  customer: string
  phone: string
  status: BookingStatus
  startDate: string
  endDate: string
  followUp: boolean
  discount: string
  notes: string
  lines: LineDraft[]
  refundDate: string
  refundAmount: string
  refundMethod: string
  refundNotes: string
  payments: PaymentDraft[]
}

export default function BookingsPage() {
  const { settings, items, bookings, payments, compose, setCompose, saveBooking, removeBooking, sheetSync } = useTracker()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all")
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "unpaid" | "partial">("all")
  const [open, setOpen] = useState(false)
  const [receipt, setReceipt] = useState<Booking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => blankForm(items))
  const symbol = settings.currencySymbol
  const methods = settings.paymentMethods.length ? settings.paymentMethods : ["Cash"]
  const openedEdit = useRef<string | null>(null)

  useEffect(() => {
    if (compose !== "booking") return
    const params = new URLSearchParams(window.location.search)
    const start = params.get("start") || ""
    const itemId = params.get("item") || ""
    const next = blankForm(items)
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      next.startDate = start
      next.endDate = start
    }
    const chosen = items.find((entry) => entry.id === itemId)
    if (chosen) next.lines = [{ itemId: chosen.id, quantity: "1", rate: String(chosen.dailyRate) }]
    setForm(next)
    setError(null)
    setOpen(true)
    setCompose(null)
    if (params.has("start") || params.has("item")) {
      params.delete("start")
      params.delete("item")
      const rest = params.toString()
      window.history.replaceState(null, "", rest ? `/bookings?${rest}` : "/bookings")
    }
  }, [compose, items, setCompose])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit")
    if (!id || openedEdit.current === id) return
    const booking = bookings.find((entry) => entry.id === id)
    if (!booking) return
    openedEdit.current = id
    setForm({
      id: booking.id,
      customer: booking.customer,
      phone: booking.phone,
      status: booking.status === "cancelled" ? "upcoming" : booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      followUp: booking.followUp,
      discount: String(booking.discount || 0),
      notes: booking.notes,
      lines: bookingLines(booking).map((line) => ({
        itemId: line.itemId,
        quantity: String(line.quantity),
        rate: String(line.rate),
      })),
      refundDate: booking.refundDate,
      refundAmount: String(booking.refundAmount || 0),
      refundMethod: booking.refundMethod,
      refundNotes: booking.refundNotes,
      payments: payments
        .filter((payment) => payment.bookingId === booking.id)
        .map((payment) => ({
          id: payment.id,
          date: payment.date,
          type: payment.type || "Full Payment",
          amount: String(payment.amount),
          method: payment.method,
          note: payment.note,
        })),
    })
    setError(null)
    setReceipt(null)
    setOpen(true)
    window.history.replaceState(null, "", "/bookings")
  }, [bookings, payments])

  useEffect(() => {
    if (!open && !receipt) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        setReceipt(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, receipt])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return bookings
      .filter((booking) => {
        if (statusFilter !== "all" && booking.status !== statusFilter) return false
        const standing = paymentStanding(bookingTotal(booking), paidAmount(payments, booking.id))
        if (paymentFilter !== "all" && standing !== paymentFilter) return false
        if (!needle) return true
        const names = bookingLines(booking)
          .map((line) => itemById(items, line.itemId)?.name || "")
          .join(" ")
        return (
          booking.customer.toLowerCase().includes(needle) ||
          booking.code.toLowerCase().includes(needle) ||
          booking.invoiceCode.toLowerCase().includes(needle) ||
          names.toLowerCase().includes(needle)
        )
      })
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.code.localeCompare(a.code))
  }, [bookings, payments, items, query, statusFilter, paymentFilter])

  const preview = useMemo(() => quote(form, items), [form, items])

  function edit(booking: Booking) {
    setForm({
      id: booking.id,
      customer: booking.customer,
      phone: booking.phone,
      status: booking.status === "cancelled" ? "upcoming" : booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      followUp: booking.followUp,
      discount: String(booking.discount || 0),
      notes: booking.notes,
      lines: bookingLines(booking).map((line) => ({
        itemId: line.itemId,
        quantity: String(line.quantity),
        rate: String(line.rate),
      })),
      refundDate: booking.refundDate,
      refundAmount: String(booking.refundAmount || 0),
      refundMethod: booking.refundMethod,
      refundNotes: booking.refundNotes,
      payments: payments
        .filter((payment) => payment.bookingId === booking.id)
        .map((payment) => ({
          id: payment.id,
          date: payment.date,
          type: payment.type || "Full Payment",
          amount: String(payment.amount),
          method: payment.method,
          note: payment.note,
        })),
    })
    setError(null)
    setOpen(true)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: BookingDraft = {
      id: form.id || undefined,
      customer: form.customer,
      phone: form.phone,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      followUp: form.followUp,
      discount: Number(form.discount) || 0,
      notes: form.notes,
      lines: form.lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      })),
      refundDate: form.refundDate,
      refundAmount: Number(form.refundAmount) || 0,
      refundMethod: form.refundMethod,
      refundNotes: form.refundNotes,
      payments: form.payments.map((payment) => ({
        id: payment.id || undefined,
        date: payment.date,
        type: payment.type,
        amount: Number(payment.amount) || 0,
        method: payment.method,
        note: payment.note,
      })),
    }
    const message = saveBooking(draft)
    setError(message)
    if (!message) setOpen(false)
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_10px_30px_rgba(90,50,40,0.05)] sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <h2 className="text-base font-semibold text-ink">All bookings</h2>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <input
              className={`${inputClass} sm:max-w-[220px]`}
              placeholder="Search client or item..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className={`${inputClass} sm:max-w-[160px]`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | BookingStatus)}>
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
            <select className={`${inputClass} sm:max-w-[190px]`} value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as "all" | "paid" | "unpaid" | "partial")}>
              <option value="all">All payment statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
            </select>
            <button
              type="button"
              className={`${primaryBtn} shrink-0`}
              onClick={() => {
                setForm(blankForm(items))
                setError(null)
                setOpen(true)
              }}
            >
              + New booking
            </button>
          </div>
        </div>
        {error && !open ? <p className="mt-3 text-sm text-[#9a403c]">{error}</p> : null}
        {sheetSync === "saving" ? <p className="mt-3 text-sm text-[#2f6b45]">Updating Google Sheets…</p> : null}
        {sheetSync === "saved" ? <p className="mt-3 text-sm text-[#2f6b45]">Google Sheets updated.</p> : null}
        {sheetSync === "error" ? <p className="mt-3 text-sm text-[#9a403c]">Google Sheets was not updated.</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-[11px] tracking-wide text-white uppercase">
                {["Booking / Invoice", "Client", "Items", "Rental period", "Status", "Grand Total", "Balance", "Payment", "Follow-up"].map((label, index) => (
                  <th key={label} className={`bg-[#5e7464] px-3 py-2.5 font-semibold whitespace-nowrap ${index === 0 ? "rounded-l-lg" : ""}`}>{label}</th>
                ))}
                <th className="w-28 rounded-r-lg bg-[#5e7464] px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-muted">No bookings match.</td>
                </tr>
              ) : (
                rows.map((booking) => {
                  const grand = bookingTotal(booking)
                  const paid = paidAmount(payments, booking.id)
                  const balance = grand - paid
                  const standing = paymentStanding(grand, paid)
                  return (
                    <tr key={booking.id}>
                      <td className="border-b border-line px-3 py-3 whitespace-nowrap">
                        <p className="font-semibold">{booking.code}</p>
                        <p className="text-xs text-muted">{booking.invoiceCode}</p>
                      </td>
                      <td className="border-b border-line px-3 py-3 font-semibold whitespace-nowrap">{booking.customer}</td>
                      <td className="border-b border-line px-3 py-3">{itemsLabel(booking, items)}</td>
                      <td className="border-b border-line px-3 py-3 whitespace-nowrap text-[13px]">
                        {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
                      </td>
                      <td className="border-b border-line px-3 py-3">
                        <BookingPill kind={booking.status} />
                      </td>
                      <td className="border-b border-line px-3 py-3 whitespace-nowrap">{money(symbol, grand)}</td>
                      <td className="border-b border-line px-3 py-3 whitespace-nowrap">{money(symbol, balance)}</td>
                      <td className="border-b border-line px-3 py-3">
                        <PayPill standing={standing} />
                      </td>
                      <td className="border-b border-line px-3 py-3">
                        {booking.followUp ? <span className="rounded-full bg-[#fde7ea] px-2.5 py-0.5 text-xs font-semibold text-[#c45c6c]">Yes</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="border-b border-line px-2 py-3 text-right whitespace-nowrap">
                        <IconButton label={`Receipt for ${booking.code}`} onClick={() => setReceipt(booking)}><EyeIcon /></IconButton>
                        <IconButton label={`Edit ${booking.code}`} onClick={() => edit(booking)}><PencilIcon /></IconButton>
                        <IconButton
                          label={`Remove ${booking.code}`}
                          danger
                          onClick={() => {
                            if (!window.confirm(`Remove ${booking.code}?`)) return
                            removeBooking(booking.id)
                          }}
                        >
                          <TrashIcon />
                        </IconButton>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-[#f8e3e0] px-4 py-3 text-sm text-[#8d5c58]">
        <HeartIcon />
        <span><span className="font-semibold">TIP:</span> Flag a booking for follow-up when a deposit or reply is still pending.</span>
      </p>

      {open ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#3c302d]/35 p-4" onMouseDown={() => setOpen(false)}>
          <form
            onSubmit={onSubmit}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(60,40,30,0.18)] sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? "Edit booking" : "New booking"}</h2>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-blush" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>

            <Section title="Client & rental details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client name">
                  <input className={inputClass} value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} />
                </Field>
                <Field label="Phone / contact">
                  <input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BookingStatus })}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </Field>
                <div />
                <Field label="Rental start">
                  <input className={inputClass} type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
                </Field>
                <Field label="Rental end">
                  <input className={inputClass} type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.followUp} onChange={(event) => setForm({ ...form, followUp: event.target.checked })} />
                Flag for follow-up
              </label>
            </Section>

            <Section title="Items">
              <div className="hidden grid-cols-[1fr_70px_90px_90px_32px] gap-2 text-xs font-semibold text-muted sm:grid">
                <span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span><span />
              </div>
              <div className="mt-2 space-y-2">
                {form.lines.map((line, index) => {
                  const amount = (Number(line.quantity) || 0) * (Number(line.rate) || 0)
                  return (
                    <div key={`${line.itemId}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_70px_90px_90px_32px] sm:items-center">
                      <select
                        className={inputClass}
                        value={line.itemId}
                        onChange={(event) => {
                          const item = itemById(items, event.target.value)
                          setForm({
                            ...form,
                            lines: form.lines.map((entry, lineIndex) => lineIndex === index ? { ...entry, itemId: event.target.value, rate: String(item?.dailyRate ?? entry.rate) } : entry),
                          })
                        }}
                      >
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ""}</option>
                        ))}
                      </select>
                      <input className={inputClass} inputMode="numeric" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                      <input className={inputClass} inputMode="decimal" value={line.rate} onChange={(event) => updateLine(index, { rate: event.target.value })} />
                      <p className="text-sm font-semibold sm:text-right">{money(symbol, amount)}</p>
                      <button type="button" className="text-muted hover:text-[#9a403c]" aria-label="Remove item" onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })} disabled={form.lines.length === 1}>×</button>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className={`${ghostBtn} mt-3 h-9`}
                onClick={() => {
                  const item = items[0]
                  setForm({ ...form, lines: [...form.lines, { itemId: item?.id ?? "", quantity: "1", rate: String(item?.dailyRate ?? 0) }] })
                }}
              >
                + Add item
              </button>
            </Section>

            <div className="mt-4 space-y-2 rounded-xl bg-[#f8ece9] px-4 py-3 text-sm">
              <MoneyRow label="Subtotal" value={money(symbol, preview.subtotal)} />
              <div className="flex items-center justify-between gap-3">
                <span>Discount</span>
                <input className={`${inputClass} h-9 max-w-[120px] text-right`} inputMode="decimal" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} />
              </div>
              <MoneyRow label="Rental fee" value={money(symbol, preview.fee)} />
              <MoneyRow label="Security deposit" value={money(symbol, preview.deposit)} />
              <div className="flex items-center justify-between border-t border-[#eadfdc] pt-2 font-semibold">
                <span>Grand total</span>
                <span>{money(symbol, preview.grand)}</span>
              </div>
            </div>

            <Section title="Security deposit refund">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Refund received date">
                  <input className={inputClass} type="date" value={form.refundDate} onChange={(event) => setForm({ ...form, refundDate: event.target.value })} />
                </Field>
                <Field label="Refund amount">
                  <input className={inputClass} inputMode="decimal" value={form.refundAmount} onChange={(event) => setForm({ ...form, refundAmount: event.target.value })} />
                </Field>
                <Field label="Mode of payment">
                  <select className={inputClass} value={form.refundMethod} onChange={(event) => setForm({ ...form, refundMethod: event.target.value })}>
                    <option value="">—</option>
                    {methods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Refund notes">
                  <input className={inputClass} placeholder="e.g. ₱200 deducted for minor stain" value={form.refundNotes} onChange={(event) => setForm({ ...form, refundNotes: event.target.value })} />
                </Field>
              </div>
            </Section>

            <Section title="Payments received">
              {form.payments.length === 0 ? <p className="text-sm text-muted">No payments recorded yet.</p> : null}
              <div className="space-y-2">
                {form.payments.map((payment, index) => (
                  <div key={payment.id || index} className="grid gap-2 sm:grid-cols-[130px_150px_100px_120px_1fr_32px] sm:items-center">
                    <input className={inputClass} type="date" value={payment.date} onChange={(event) => updatePayment(index, { date: event.target.value })} />
                    <select className={inputClass} value={payment.type} onChange={(event) => updatePayment(index, { type: event.target.value })}>
                      {paymentTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <input className={inputClass} inputMode="decimal" placeholder="Amount" value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} />
                    <select className={inputClass} value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value })}>
                      {methods.map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                    <input className={inputClass} placeholder="Notes" value={payment.note} onChange={(event) => updatePayment(index, { note: event.target.value })} />
                    <button type="button" className="text-muted hover:text-[#9a403c]" aria-label="Remove payment" onClick={() => setForm({ ...form, payments: form.payments.filter((_, paymentIndex) => paymentIndex !== index) })}>×</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${ghostBtn} mt-3 h-9`}
                onClick={() => setForm({
                  ...form,
                  payments: [...form.payments, { id: "", date: "", type: "Full Payment", amount: "", method: methods[0] || "Cash", note: "" }],
                })}
              >
                + Add payment
              </button>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f8ece9] px-4 py-3 text-sm">
                <div>
                  <p className="text-muted">Total paid</p>
                  <p className="font-semibold">{money(symbol, preview.paid)}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted">Balance</p>
                  {preview.balance > 0 ? (
                    <span className="mt-1 inline-flex rounded-full bg-[#fde0e4] px-2.5 py-0.5 text-xs font-semibold text-[#c4475c]">{money(symbol, preview.balance)} due</span>
                  ) : (
                    <p className="font-semibold">{money(symbol, preview.balance)}</p>
                  )}
                </div>
              </div>
            </Section>

            <div className="mt-4">
              <Field label="Notes">
                <textarea className="min-h-20 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
            </div>
            {error ? <p className="mt-3 text-sm text-[#9a403c]">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button className={ghostBtn} type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className={primaryBtn} type="submit">Save booking</button>
            </div>
          </form>
        </div>
      ) : null}

      {receipt ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#3c302d]/35 p-4" onMouseDown={() => setReceipt(null)}>
          <div className="mx-auto max-w-[760px]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button type="button" className={ghostBtn} onClick={() => setReceipt(null)}>Close</button>
              <button type="button" className={primaryBtn} onClick={() => window.print()}>Print receipt</button>
            </div>
            <Receipt booking={receipt} items={items} payments={payments.filter((payment) => payment.bookingId === receipt.id)} business={settings.businessName} brand={settings.brandName || settings.businessName} note={settings.invoiceNote} symbol={symbol} noun={settings.itemNoun} />
          </div>
        </div>
      ) : null}
    </div>
  )

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setForm({ ...form, lines: form.lines.map((entry, lineIndex) => lineIndex === index ? { ...entry, ...patch } : entry) })
  }

  function updatePayment(index: number, patch: Partial<PaymentDraft>) {
    setForm({ ...form, payments: form.payments.map((entry, paymentIndex) => paymentIndex === index ? { ...entry, ...patch } : entry) })
  }
}

function blankForm(items: Item[]): FormState {
  const item = items[0]
  return {
    id: "",
    customer: "",
    phone: "",
    status: "upcoming",
    startDate: "",
    endDate: "",
    followUp: false,
    discount: "0",
    notes: "",
    lines: [{ itemId: item?.id ?? "", quantity: "1", rate: String(item?.dailyRate ?? 0) }],
    refundDate: "",
    refundAmount: "0",
    refundMethod: "",
    refundNotes: "",
    payments: [],
  }
}

function quote(form: FormState, items: Item[]) {
  const lines = form.lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) || 0, rate: Number(line.rate) || 0 }))
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.rate, 0)
  const discount = Number(form.discount) || 0
  const fee = Math.max(0, subtotal - discount)
  const deposit = lineDeposit(items, lines.map((line) => ({ ...line, quantity: Math.max(0, line.quantity) })))
  const grand = fee + deposit
  const paid = form.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  return { subtotal, fee, deposit, grand, paid, balance: grand - paid }
}

function itemsLabel(booking: Booking, items: Item[]) {
  return bookingLines(booking).map((line) => {
    const item = itemById(items, line.itemId)
    const name = item?.name ?? "Removed item"
    return line.quantity > 1 ? `${name} ×${line.quantity}` : name
  }).join(", ")
}

function Receipt({
  booking,
  items,
  payments,
  business,
  brand,
  note,
  symbol,
  noun,
}: {
  booking: Booking
  items: Item[]
  payments: Payment[]
  business: string
  brand: string
  note: string
  symbol: string
  noun: string
}) {
  const subtotal = bookingSubtotal(booking)
  const fee = bookingRentalFee(booking)
  const grand = bookingTotal(booking)
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const balance = bookingBalance(booking, payments)
  return (
    <article className="print-receipt rounded-2xl bg-white px-6 py-7 text-ink shadow-[0_20px_50px_rgba(60,40,30,0.12)] sm:px-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-script text-4xl leading-none text-rose">{brand || business}</p>
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
      <h3 className="mt-6 text-xs font-semibold tracking-wide uppercase">Items</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
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
      <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <MoneyRow label="Subtotal" value={money(symbol, subtotal)} />
        <MoneyRow label="Discount" value={booking.discount ? `-${money(symbol, booking.discount)}` : money(symbol, 0)} />
        <MoneyRow label="Rental fee" value={money(symbol, fee)} />
        <MoneyRow label="Security deposit" value={money(symbol, booking.deposit)} />
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Grand total</span>
          <span>{money(symbol, grand)}</span>
        </div>
      </div>
      <h3 className="mt-6 text-xs font-semibold tracking-wide uppercase">Payments received</h3>
      {payments.length === 0 ? <p className="mt-2 text-sm text-muted">No payments recorded yet.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
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
      <div className="mt-3 flex items-end justify-between border-t border-line pt-3 text-sm">
        <div>
          <p className="text-muted">Total paid</p>
          <p className="font-semibold">{money(symbol, paid)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted">Balance</p>
          <p className="font-semibold">{balance > 0.5 ? money(symbol, balance) : balance < -0.5 ? money(symbol, balance) : "Fully paid"}</p>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-muted">{note || `Thank you for renting with ${brand || business}.`}</p>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{title}</h3>
      {children}
    </section>
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

function BookingPill({ kind }: { kind: BookingStatus }) {
  const tone = {
    upcoming: "bg-[#fde7ea] text-[#c45c6c]",
    confirmed: "bg-[#fde0e4] text-[#c4475c]",
    returned: "bg-[#f3eeec] text-[#8a7a74]",
    cancelled: "bg-[#fdeceb] text-[#9a403c]",
  }[kind]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(kind)}
    </span>
  )
}

function PayPill({ standing }: { standing: "paid" | "unpaid" | "partial" }) {
  const tone = {
    paid: "bg-[#e5f3e8] text-[#3c7a4e]",
    unpaid: "bg-[#fde0e4] text-[#c4475c]",
    partial: "bg-[#fbf3dc] text-[#a07d32]",
  }[standing]
  const label = standing === "paid" ? "Paid" : standing === "unpaid" ? "Unpaid" : "Partial"
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
}

function IconButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`mr-1 inline-grid h-8 w-8 place-items-center rounded-lg text-muted last:mr-0 ${danger ? "hover:bg-[#fdeceb] hover:text-[#9a403c]" : "hover:bg-blush hover:text-ink"}`}>
      {children}
    </button>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
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
