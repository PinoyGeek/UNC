"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { siteConfig } from "@/lib/site"
import { loadSheet, saveSheet } from "@/lib/sheets"
import {
  applySheetAssets,
  bookedQuantity,
  bookingLines,
  bookingTotal,
  checkWebAppUrl,
  defaultSettings,
  invoiceCodeFor,
  lineDeposit,
  loadState,
  nextBookingCode,
  paidAmount,
  sheetViewUrl,
  STORAGE_KEY,
  uid,
  type Booking,
  type BookingLine,
  type BookingStatus,
  type Item,
  type Payment,
  type Settings,
  type TrackerState,
} from "@/lib/rental"

type Compose = "item" | "booking" | null

export type BookingDraft = {
  id?: string
  customer: string
  phone: string
  startDate: string
  endDate: string
  status: BookingStatus
  followUp: boolean
  discount: number
  notes: string
  lines: BookingLine[]
  refundDate: string
  refundAmount: number
  refundMethod: string
  refundNotes: string
  payments: Array<Omit<Payment, "id" | "bookingId"> & { id?: string }>
}

type TrackerContextValue = {
  settings: Settings
  items: Item[]
  bookings: Booking[]
  payments: Payment[]
  compose: Compose
  setCompose: (value: Compose) => void
  notify: (message: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  replaceState: (next: TrackerState, message?: string) => void
  setLogo: (dataUrl: string, name: string) => void
  clearLogo: () => void
  addCategory: (name: string) => string | null
  removeCategory: (name: string) => void
  saveItem: (item: Omit<Item, "id"> & { id?: string }) => string | null
  sheetSync: "idle" | "loading" | "saving" | "saved" | "local" | "error"
  sheetSource: "local" | "loading" | "google"
  removeItem: (id: string) => string | null
  saveBooking: (booking: BookingDraft) => string | null
  removeBooking: (id: string) => void
  setBookingStatus: (
    id: string,
    status: BookingStatus,
    note?: string,
    payment?: { amount: number; method: string; date: string; type?: string },
  ) => string | null
  addPayment: (payment: Omit<Payment, "id" | "type"> & { type?: string }) => string | null
}

const TrackerContext = createContext<TrackerContextValue | null>(null)

function withSheetConfig(state: TrackerState): TrackerState {
  const url = siteConfig.webAppUrl.trim()
  return {
    ...state,
    settings: {
      ...state.settings,
      webAppUrl: url || state.settings.webAppUrl,
      sheetKey: siteConfig.sheetKey,
      sheetUrl: sheetViewUrl(siteConfig.googlelink) || state.settings.sheetUrl,
    },
  }
}

function mergeLoadedState(loaded: TrackerState, prev: TrackerState | null, url: string): TrackerState {
  return {
    ...loaded,
    settings: {
      ...loaded.settings,
      webAppUrl: url,
      sheetKey: siteConfig.sheetKey,
      sheetUrl: sheetViewUrl(loaded.settings.sheetUrl) || sheetViewUrl(siteConfig.googlelink) || "",
      logoDataUrl: prev?.settings.logoDataUrl || loaded.settings.logoDataUrl,
      logoName: prev?.settings.logoName || loaded.settings.logoName,
    },
  }
}

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TrackerState | null>(null)
  const [compose, setCompose] = useState<Compose>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sheetSync, setSheetSync] = useState<"idle" | "loading" | "saving" | "saved" | "local" | "error">("idle")
  const [sheetSource, setSheetSource] = useState<"local" | "loading" | "google">("local")
  const toastTimer = useRef<number | null>(null)
  const hydrated = useRef(false)
  const pendingSheet = useRef<TrackerState | null>(null)
  const sheetBusy = useRef(false)
  const sheetReady = useRef(false)
  const queuedSheet = useRef<TrackerState | null>(null)
  const sheetDebounce = useRef<number | null>(null)
  const sheetRefresh = useRef(false)

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const flushSheet = useCallback(async () => {
    const url = siteConfig.webAppUrl.trim()
    if (!checkWebAppUrl(url).ok || !sheetReady.current) return
    if (sheetBusy.current) {
      if (pendingSheet.current) window.setTimeout(() => void flushSheet(), 600)
      return
    }
    if (!pendingSheet.current) return
    sheetBusy.current = true
    setSheetSync("saving")
    let failed = false
    while (pendingSheet.current) {
      const snapshot = pendingSheet.current
      pendingSheet.current = null
      let saved = false
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        try {
          const result = await saveSheet(url, siteConfig.sheetKey, snapshot)
          if (result.assets) {
            setState((prev) => (prev ? applySheetAssets(prev, result.assets!) : prev))
          }
          saved = true
          failed = false
        } catch (error) {
          if (attempt >= 2) {
            failed = true
            setSheetSync("error")
            notify(error instanceof Error ? error.message : "Google Sheets update failed.")
          }
        }
      }
    }
    sheetBusy.current = false
    if (failed) {
      if (pendingSheet.current) window.setTimeout(() => void flushSheet(), 2000)
      return
    }
    if (pendingSheet.current) {
      void flushSheet()
      return
    }
    setSheetSync("saved")
    window.setTimeout(() => {
      setSheetSync((current) => (current === "saved" ? "idle" : current))
    }, 2500)
  }, [notify])

  const scheduleSheetFlush = useCallback(() => {
    if (sheetDebounce.current) window.clearTimeout(sheetDebounce.current)
    sheetDebounce.current = window.setTimeout(() => {
      sheetDebounce.current = null
      void flushSheet()
    }, 1400)
  }, [flushSheet])

  const pushWorkbook = useCallback(
    (next: TrackerState) => {
      const snapshot = withSheetConfig(next)
      const url = siteConfig.webAppUrl.trim()
      if (!checkWebAppUrl(url).ok) {
        setSheetSync("local")
        return
      }
      if (!sheetReady.current) {
        queuedSheet.current = snapshot
        return
      }
      pendingSheet.current = snapshot
      scheduleSheetFlush()
    },
    [scheduleSheetFlush],
  )

  useEffect(() => {
    hydrated.current = true
    const local = loadState()
    const url = siteConfig.webAppUrl.trim()
    setState(local)

    if (!checkWebAppUrl(url).ok) {
      sheetReady.current = true
      setSheetSource("local")
      setSheetSync("local")
      return
    }

    sheetReady.current = true
    setSheetSource("google")
    setSheetSync("idle")

    if (sheetRefresh.current) return
    sheetRefresh.current = true
    let cancel = false
    void (async () => {
      try {
        const result = await loadSheet(url, siteConfig.sheetKey)
        if (cancel) return
        if (!result.ok) {
          setSheetSync("idle")
          return
        }
        const loaded = result.state
        if (!loaded) return
        setState((prev) => mergeLoadedState(loaded, prev, url))
        setSheetSource("google")
        setSheetSync("idle")
        if (queuedSheet.current) pushWorkbook(queuedSheet.current)
      } catch {
        if (cancel) return
        setSheetSync("idle")
        if (queuedSheet.current) pushWorkbook(queuedSheet.current)
      }
    })()
    return () => {
      cancel = true
    }
  }, [pushWorkbook])

  useEffect(() => {
    if (sheetSync !== "error") return
    const timer = window.setTimeout(() => {
      setSheetSync((current) => (current === "error" ? "idle" : current))
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [sheetSync])

  useEffect(() => {
    return () => {
      if (sheetDebounce.current) window.clearTimeout(sheetDebounce.current)
    }
  }, [])

  useEffect(() => {
    if (!hydrated.current || !state) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        nextState = { ...prev, settings: { ...prev.settings, ...patch } }
        return nextState
      })
      if (nextState) pushWorkbook(nextState)
    },
    [pushWorkbook],
  )

  const replaceState = useCallback(
    (next: TrackerState, message = "Tracker updated") => {
      setState((prev) => ({
        ...next,
        settings: {
          ...defaultSettings,
          ...next.settings,
          logoDataUrl: next.settings.logoDataUrl || prev?.settings.logoDataUrl || null,
          logoName: next.settings.logoName || prev?.settings.logoName || null,
        },
      }))
      notify(message)
    },
    [notify],
  )

  const setLogo = useCallback(
    (dataUrl: string, name: string) => {
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        nextState = {
          ...prev,
          settings: { ...prev.settings, logoDataUrl: dataUrl, logoName: name, logoUrl: "" },
        }
        return nextState
      })
      if (nextState) pushWorkbook(nextState)
    },
    [pushWorkbook],
  )

  const clearLogo = useCallback(() => {
    let nextState: TrackerState | null = null
    setState((prev) => {
      if (!prev) return prev
      nextState = {
        ...prev,
        settings: { ...prev.settings, logoDataUrl: null, logoName: null, logoUrl: "" },
      }
      return nextState
    })
    if (nextState) pushWorkbook(nextState)
  }, [pushWorkbook])

  const addCategory = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return "Enter a category name."
      let error: string | null = null
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        const exists = prev.settings.categories.some(
          (category) => category.toLowerCase() === trimmed.toLowerCase(),
        )
        if (exists) {
          error = "That category is already listed."
          return prev
        }
        nextState = {
          ...prev,
          settings: {
            ...prev.settings,
            categories: [...prev.settings.categories, trimmed],
          },
        }
        return nextState
      })
      if (!error && nextState) pushWorkbook(nextState)
      return error
    },
    [pushWorkbook],
  )

  const removeCategory = useCallback((name: string) => {
    let nextState: TrackerState | null = null
    setState((prev) => {
      if (!prev) return prev
      nextState = {
        ...prev,
        settings: {
          ...prev.settings,
          categories: prev.settings.categories.filter((category) => category !== name),
        },
      }
      return nextState
    })
    if (nextState) pushWorkbook(nextState)
  }, [pushWorkbook])

  const saveItem = useCallback(
    (item: Omit<Item, "id"> & { id?: string }) => {
      const name = item.name.trim()
      const code = item.code.trim()
      if (!name) return "Enter an item name."
      if (!code) return "Enter an item code."
      if (!item.category) return "Choose a category."
      if (!Number.isFinite(item.dailyRate) || item.dailyRate < 0) {
        return "Enter a rental rate of zero or more."
      }
      if (!Number.isFinite(item.deposit) || item.deposit < 0) {
        return "Enter a deposit of zero or more."
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return "Quantity must be at least 1."
      }
      let nextState: TrackerState | null = null
      let duplicate = false
      setState((prev) => {
        if (!prev) return prev
        duplicate = prev.items.some(
          (existing) => existing.id !== item.id && existing.code.toLowerCase() === code.toLowerCase(),
        )
        if (duplicate) return prev
        const next: Item = {
          id: item.id ?? uid("item"),
          code,
          name,
          category: item.category,
          variant: item.variant.trim(),
          dailyRate: item.dailyRate,
          deposit: item.deposit,
          quantity: item.quantity,
          condition: item.condition,
          statusOverride: item.statusOverride,
          notes: item.notes.trim(),
          photoDataUrl: item.photoDataUrl,
          photoName: item.photoName.trim(),
        }
        const items = item.id
          ? prev.items.map((existing) => (existing.id === item.id ? next : existing))
          : [...prev.items, next]
        nextState = { ...prev, items }
        return nextState
      })
      if (duplicate) return "That code is already used."
      if (nextState) pushWorkbook(nextState)
      return null
    },
    [pushWorkbook],
  )

  const removeItem = useCallback((id: string) => {
    let error: string | null = null
    let nextState: TrackerState | null = null
    setState((prev) => {
      if (!prev) return prev
      const used = prev.bookings.some(
        (booking) =>
          booking.status !== "cancelled" &&
          bookingLines(booking).some((line) => line.itemId === id),
      )
      if (used) {
        error = "This item is still on a booking. Return or cancel it first."
        return prev
      }
      nextState = { ...prev, items: prev.items.filter((item) => item.id !== id) }
      return nextState
    })
    if (!error && nextState) pushWorkbook(nextState)
    return error
  }, [pushWorkbook])

  const saveBooking = useCallback(
    (booking: BookingDraft) => {
      const customer = booking.customer.trim()
      const lines = booking.lines.filter((line) => line.itemId)
      if (!customer) return "Enter the client name."
      if (!lines.length) return "Add at least one item."
      if (!booking.startDate || !booking.endDate) return "Choose rental start and end dates."
      if (booking.endDate < booking.startDate) return "Rental end is before the rental start."
      if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
        return "Each quantity must be at least 1."
      }
      if (lines.some((line) => !Number.isFinite(line.rate) || line.rate < 0)) {
        return "Each rate must be zero or more."
      }
      if (!Number.isFinite(booking.discount) || booking.discount < 0) return "Discount must be zero or more."
      if (!Number.isFinite(booking.refundAmount) || booking.refundAmount < 0) {
        return "Refund amount must be zero or more."
      }
      if (booking.payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount < 0)) {
        return "Payment amounts must be zero or more."
      }

      let error: string | null = null
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        const wanted = new Map<string, number>()
        for (const line of lines) wanted.set(line.itemId, (wanted.get(line.itemId) || 0) + line.quantity)
        for (const [itemId, quantity] of wanted) {
          const item = prev.items.find((entry) => entry.id === itemId)
          if (!item) {
            error = "One of the items is no longer in inventory."
            return prev
          }
          if (booking.status === "upcoming" || booking.status === "confirmed") {
            const taken = bookedQuantity(prev.bookings, item.id, booking.startDate, booking.endDate, booking.id)
            if (taken + quantity > item.quantity) {
              error = `Only ${Math.max(item.quantity - taken, 0)} ${item.name} available for those dates.`
              return prev
            }
          }
        }
        const existing = booking.id ? prev.bookings.find((entry) => entry.id === booking.id) : undefined
        const code = existing?.code ?? nextBookingCode(prev.bookings)
        const id = booking.id ?? uid("book")
        const first = lines[0]
        const next: Booking = {
          id,
          code,
          invoiceCode: existing?.invoiceCode || invoiceCodeFor(code),
          customer,
          phone: booking.phone.trim(),
          startDate: booking.startDate,
          endDate: booking.endDate,
          status: booking.status,
          followUp: booking.followUp,
          discount: booking.discount,
          deposit: lineDeposit(prev.items, lines),
          notes: booking.notes.trim(),
          lines,
          refundDate: booking.refundDate,
          refundAmount: booking.refundAmount,
          refundMethod: booking.refundMethod.trim(),
          refundNotes: booking.refundNotes.trim(),
          itemId: first.itemId,
          quantity: first.quantity,
          dailyRate: first.rate,
        }
        const bookings = booking.id
          ? prev.bookings.map((entry) => (entry.id === booking.id ? next : entry))
          : [next, ...prev.bookings]
        const kept = prev.payments.filter((payment) => payment.bookingId !== id)
        const added = booking.payments
          .filter((payment) => payment.amount > 0)
          .map((payment) => ({
            id: payment.id || uid("pay"),
            bookingId: id,
            amount: payment.amount,
            method: payment.method.trim() || "Cash",
            date: payment.date,
            note: payment.note.trim(),
            type: payment.type.trim() || "Full Payment",
          }))
        nextState = { ...prev, bookings, payments: [...added, ...kept] }
        return nextState
      })
      if (!error && nextState) pushWorkbook(nextState)
      return error
    },
    [pushWorkbook],
  )

  const removeBooking = useCallback((id: string) => {
    let nextState: TrackerState | null = null
    setState((prev) => {
      if (!prev) return prev
      nextState = {
        ...prev,
        bookings: prev.bookings.filter((booking) => booking.id !== id),
        payments: prev.payments.filter((payment) => payment.bookingId !== id),
      }
      return nextState
    })
    if (nextState) pushWorkbook(nextState)
  }, [pushWorkbook])

  const setBookingStatus = useCallback(
    (id: string, status: BookingStatus, note?: string, payment?: { amount: number; method: string; date: string; type?: string }) => {
      let error: string | null = null
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        const current = prev.bookings.find((booking) => booking.id === id)
        if (!current) return prev
        const written = note?.trim()
        let payments = prev.payments
        if (payment && payment.amount > 0) {
          const due = bookingTotal(current) - paidAmount(prev.payments, current.id)
          if (payment.amount > due + 0.001) {
            error = "That payment is more than the balance."
            return prev
          }
          const type = payment.type?.trim() || (payment.amount + 0.001 >= due ? "Full Payment" : "Partial Payment")
          payments = [
            {
              id: uid("pay"),
              bookingId: id,
              amount: payment.amount,
              method: payment.method.trim() || "Cash",
              date: payment.date,
              note: "",
              type,
            },
            ...prev.payments,
          ]
        }
        nextState = {
          ...prev,
          payments,
          bookings: prev.bookings.map((booking) =>
            booking.id === id ? { ...booking, status, notes: written || booking.notes } : booking,
          ),
        }
        return nextState
      })
      if (!error && nextState) {
        pushWorkbook(nextState)
        notify(status === "returned" ? "Marked returned" : "Booking updated")
      }
      return error
    },
    [notify, pushWorkbook],
  )

  const addPayment = useCallback(
    (payment: Omit<Payment, "id" | "type"> & { type?: string }) => {
      if (!payment.bookingId) return "Choose a booking."
      if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
        return "Enter an amount greater than zero."
      }
      let error: string | null = null
      let nextState: TrackerState | null = null
      setState((prev) => {
        if (!prev) return prev
        const booking = prev.bookings.find((entry) => entry.id === payment.bookingId)
        if (!booking || booking.status === "cancelled") {
          error = "Choose an open booking."
          return prev
        }
        const due = bookingTotal(booking) - paidAmount(prev.payments, booking.id)
        if (payment.amount > due + 0.001) {
          error = "That payment is more than the balance."
          return prev
        }
        nextState = {
          ...prev,
          payments: [
            {
              ...payment,
              id: uid("pay"),
              note: payment.note.trim(),
              method: payment.method || "Cash",
              type: payment.type?.trim() || "Partial Payment",
            },
            ...prev.payments,
          ],
        }
        return nextState
      })
      if (!error && nextState) {
        pushWorkbook(nextState)
        notify("Payment recorded")
      }
      return error
    },
    [notify, pushWorkbook],
  )

  const value = useMemo<TrackerContextValue | null>(() => {
    if (!state) return null
    return {
      settings: state.settings,
      items: state.items,
      bookings: state.bookings,
      payments: state.payments,
      compose,
      setCompose,
      notify,
      updateSettings,
      replaceState,
      setLogo,
      clearLogo,
      addCategory,
      removeCategory,
      saveItem,
      removeItem,
      sheetSync,
      sheetSource,
      saveBooking,
      removeBooking,
      setBookingStatus,
      addPayment,
    }
  }, [
    state,
    compose,
    notify,
    updateSettings,
    replaceState,
    setLogo,
    clearLogo,
    addCategory,
    removeCategory,
    saveItem,
    removeItem,
    sheetSync,
    sheetSource,
    saveBooking,
    removeBooking,
    setBookingStatus,
    addPayment,
  ])

  if (!value) {
    return <div className="min-h-screen bg-blush" />
  }

  return (
    <TrackerContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg md:bottom-8"
        >
          {toast}
        </div>
      ) : null}
    </TrackerContext.Provider>
  )
}

export function useTracker() {
  const value = useContext(TrackerContext)
  if (!value) throw new Error("useTracker must be used within TrackerProvider")
  return value
}
