import { checkWebAppUrl } from "@/lib/rental"

export const maxDuration = 300

export async function POST(request: Request) {
  let body: { webAppUrl?: string; action?: string; key?: string; state?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: "The request could not be read." }, { status: 400 })
  }

  const webAppUrl = (body.webAppUrl || "").trim()
  const shape = checkWebAppUrl(webAppUrl)
  if (!shape.ok) return Response.json({ ok: false, error: shape.message }, { status: 400 })

  try {
    const text = await postToScript(
      webAppUrl,
      JSON.stringify({ action: body.action || "ping", key: body.key || "", state: body.state }),
    )
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "The web app did not answer."
    return Response.json({ ok: false, error: message }, { status: 502 })
  }
}

async function postToScript(url: string, payload: string) {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      signal: AbortSignal.timeout(280_000),
    })
  } catch {
    throw new Error("The web app URL did not answer. Redeploy it and set access to Anyone.")
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location")
    if (!location) throw new Error("The web app redirected without a result.")
    try {
      response = await fetch(new URL(location, url), { method: "GET", redirect: "follow" })
    } catch {
      throw new Error("The web app URL did not answer. Redeploy it and set access to Anyone.")
    }
  }

  const text = await response.text()
  const json = extractJson(text)
  if (!json) throw new Error(explainHtml(text))
  return json
}

function extractJson(text: string) {
  const trimmed = text.replace(/^\uFEFF/, "").trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  const slice = trimmed.slice(start, end + 1)
  try {
    const parsed = JSON.parse(slice) as { ok?: boolean }
    if (typeof parsed.ok === "boolean") return slice
  } catch {
    return null
  }
  return null
}

function explainHtml(text: string) {
  const lower = text.toLowerCase()
  if (
    lower.includes("accounts.google.com") ||
    lower.includes("sign in") ||
    lower.includes("authorization") ||
    lower.includes("unable to open")
  ) {
    return "Google Sheets asked for a sign-in. Redeploy the web app as yourself, with access set to Anyone."
  }
  return "Google Sheets did not return data. Redeploy the web app as yourself, with access set to Anyone."
}
