import {
  blankTrackerState,
  checkWebAppUrl,
  normalizeState,
  sheetViewUrl,
  type TrackerState,
} from "@/lib/rental"

type SheetResult = {
  ok: boolean
  blank?: boolean
  error?: string
  title?: string
  sheetUrl?: string
  savedAt?: string
  counts?: { items: number; bookings: number; payments: number }
  assets?: { logoUrl?: string; items?: { id: string; photoDataUrl: string }[] }
  state?: unknown
}

function remoteOrDataUrl(value: string | null | undefined) {
  const text = (value || "").trim()
  if (!text) return null
  if (text.startsWith("data:image/")) return text
  if (text.startsWith("http://") || text.startsWith("https://")) return text
  return null
}

export function sheetPayload(state: TrackerState) {
  const settings = { ...state.settings }
  const logo = remoteOrDataUrl(settings.logoDataUrl) || remoteOrDataUrl(settings.logoUrl)
  if (logo?.startsWith("http")) {
    settings.logoUrl = logo
    settings.logoDataUrl = null
  } else if (logo?.startsWith("data:")) {
    settings.logoDataUrl = logo
  } else {
    settings.logoDataUrl = null
    settings.logoUrl = settings.logoUrl || ""
  }
  const items = state.items.map((item) => ({
    ...item,
    photoDataUrl: remoteOrDataUrl(item.photoDataUrl),
  }))
  return {
    settings,
    items,
    bookings: state.bookings,
    payments: state.payments,
  }
}

export async function pingSheet(webAppUrl: string) {
  const shape = checkWebAppUrl(webAppUrl)
  if (!shape.ok) return { ok: false, message: shape.message, sheetUrl: "" }
  const result = await callSheet(webAppUrl, { action: "ping" })
  return {
    ok: true,
    blank: Boolean(result.blank),
    message: result.blank
      ? "Connected. The sheets are blank."
      : result.title
        ? `Connected to “${result.title}”.`
        : "The web app answered.",
    sheetUrl: sheetViewUrl(result.sheetUrl) || "",
  }
}

export async function saveSheet(webAppUrl: string, key: string, state: TrackerState) {
  const shape = checkWebAppUrl(webAppUrl)
  if (!shape.ok) return { ok: false, message: shape.message, sheetUrl: "" }
  const result = await callSheet(webAppUrl, {
    action: "save",
    key,
    state: sheetPayload(state),
  })
  const counts = result.counts
  const summary = counts
    ? `${counts.items} items, ${counts.bookings} bookings, ${counts.payments} payments.`
    : "Dashboard, inventory, bookings, calendar, timeline, returns, payments, and setup were updated."
  return {
    ok: true,
    message: `Saved all 8 sheets. ${summary}`,
    sheetUrl: sheetViewUrl(result.sheetUrl) || "",
    assets: result.assets,
  }
}

export async function loadSheet(webAppUrl: string, key: string) {
  const shape = checkWebAppUrl(webAppUrl)
  if (!shape.ok) return { ok: false as const, message: shape.message }
  const result = await callSheet(webAppUrl, { action: "load", key })
  if (result.blank) {
    return {
      ok: true as const,
      blank: true as const,
      message: "The spreadsheet is blank.",
      state: blankTrackerState({
        webAppUrl,
        sheetKey: key,
        sheetUrl: sheetViewUrl(result.sheetUrl) || "",
        shareSheet: true,
      }),
    }
  }
  const state = normalizeState(result.state)
  state.settings.webAppUrl = webAppUrl.trim()
  state.settings.sheetKey = key.trim()
  state.settings.sheetUrl = sheetViewUrl(result.sheetUrl) || state.settings.sheetUrl
  return {
    ok: true as const,
    message: `Loaded ${state.items.length} items, ${state.bookings.length} bookings, and ${state.payments.length} payments.`,
    state,
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callSheet(webAppUrl: string, body: Record<string, unknown>) {
  const action = String(body.action || "ping")
  const attempts = action === "save" ? 3 : 2
  const timeoutMs = action === "save" ? 180_000 : 45_000
  let lastError: Error | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webAppUrl: webAppUrl.trim(), ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await response.text()
      const parsed = parseSheet(text)
      if (!parsed.ok) throw new Error(parsed.error || "Google Sheets refused the request.")
      return parsed
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Google Sheets request failed.")
      if (attempt < attempts - 1) await wait(900 * (attempt + 1))
    }
  }

  throw lastError ?? new Error("This tracker could not reach its sheet connection. Try again in a moment.")
}

function parseSheet(text: string): SheetResult {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) {
    throw new Error("The web app did not return JSON. Deploy it as a web app, execute as yourself, and set access to Anyone.")
  }
  try {
    return JSON.parse(trimmed) as SheetResult
  } catch {
    throw new Error("The web app returned a response this tracker could not read.")
  }
}
