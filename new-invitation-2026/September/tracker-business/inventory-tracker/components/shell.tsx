"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { StaggeredMenu } from "@/components/StaggeredMenu"
import { BrandMark } from "@/components/ui"
import { useTracker } from "@/components/tracker-provider"
import { brandMonogram, safeColor } from "@/lib/rental"

const links = [
  { href: "/", key: "dashboard", label: "Dashboard", title: "Dashboard", subtitle: "Track your inventory, rentals, returns, and earnings with ease." },
  { href: "/inventory", key: "inventory", label: "inventory", title: "inventory", subtitle: "Manage your items inventory with ease." },
  { href: "/bookings", key: "bookings", label: "Rental Bookings", title: "Rental Bookings", subtitle: "Every reservation, past and upcoming — each one is its own invoice." },
  { href: "/calendar", key: "calendar", label: "Booking Calendar", title: "Booking Calendar", subtitle: "See every booking’s status and payment at a glance." },
  { href: "/timeline", key: "timeline", label: "Booking Timeline", title: "Booking Timeline", subtitle: "Check availability and status of your items." },
  { href: "/returns", key: "returns", label: "Returns", title: "Returns", subtitle: "Items due back and items already checked in." },
  { href: "/payments", key: "payments", label: "Payments", title: "Payments", subtitle: "Track what's billed, what's paid, and what's overdue." },
  { href: "/setup", key: "setup", label: "Setup", title: "Setup", subtitle: "Adapt the tracker to whatever you rent out." },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function labelFor(key: string, fallback: string, noun: string) {
  if (key === "inventory") return `${noun} inventory`
  return fallback
}

function pageHeading(key: string, title: string, noun: string) {
  if (key === "inventory") return `${noun} inventory`
  if (key === "dashboard") return `${noun} Rental Tracker`
  return title
}

function NavGlyph({ name, active }: { name: string; active: boolean }) {
  const tone = active
    ? "text-white"
    : {
        dashboard: "text-[#c47b73]",
        inventory: "text-sage",
        bookings: "text-[#6d8fbf]",
        calendar: "text-[#d4656a]",
        timeline: "text-[#6f967a]",
        returns: "text-[#5b8fbf]",
        payments: "text-[#c4a15a]",
        setup: "text-sage",
      }[name]
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {name === "dashboard" && <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />}
      {name === "inventory" && (
        <>
          <path d="M4 8l8-4 8 4-8 4-8-4z" />
          <path d="M4 8v8l8 4 8-4V8" />
          <path d="M12 12v8" />
        </>
      )}
      {name === "bookings" && (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 3v3M16 3v3M8 11h8M8 15h5" />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      )}
      {name === "timeline" && (
        <>
          <path d="M5 6h10M5 12h14M5 18h8" />
          <circle cx="5" cy="6" r="1.2" fill="currentColor" />
          <circle cx="5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="5" cy="18" r="1.2" fill="currentColor" />
        </>
      )}
      {name === "returns" && (
        <>
          <path d="M4 12h12" />
          <path d="M12 7l5 5-5 5" />
          <path d="M19 5v14" />
        </>
      )}
      {name === "payments" && (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </>
      )}
      {name === "setup" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
        </>
      )}
    </svg>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { settings, setLogo, notify, sheetSync } = useTracker()
  const current = links.find((link) => isActive(pathname, link.href)) ?? links[0]
  const noun = settings.itemNoun.trim() || "Items"
  const brand = (settings.brandName || "Digital Aly").trim() || "Digital Aly"
  const monogram = brandMonogram(brand)
  const wide = pathname === "/" || pathname === "/inventory" || pathname === "/bookings" || pathname === "/calendar" || pathname === "/timeline" || pathname === "/returns" || pathname === "/payments" || pathname === "/setup"
  const heading = pageHeading(current.key, current.title, noun)

  useEffect(() => {
    document.documentElement.style.setProperty("--page", safeColor(settings.pageColor))
    document.title = `${heading} · ${brand}`
  }, [heading, brand, settings.pageColor])

  const menuItems = links.map((link) => {
    const label = labelFor(link.key, link.label, noun)
    return { label, ariaLabel: `Go to ${label}`, link: link.href }
  })

  return (
    <div className="flex min-h-screen flex-col">
      <header className={`mx-auto w-full px-4 py-6 md:px-6 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>
        <div className="flex items-start justify-between gap-3 pr-24 md:pr-0">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <label className="cursor-pointer" title="Upload a logo">
              <BrandMark src={settings.logoDataUrl} mark={monogram} />
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > 500 * 1024) {
                    notify("Keep the logo under 500KB.")
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    if (typeof reader.result === "string") setLogo(reader.result, file.name)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-wide text-ink uppercase sm:text-2xl sm:tracking-[0.14em]">
                {heading}
              </h1>
              <p className="text-sm text-muted">{current.subtitle}</p>
            </div>
          </div>
          <div className="hidden shrink-0 pt-1 text-right md:block">
            <p className="font-script text-[2.1rem] leading-none text-rose">{brand}</p>
            <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-rose uppercase">Rental Tracker</p>
          </div>
        </div>
        <div className="mt-4 md:hidden">
          <p className="font-script text-[1.7rem] leading-none text-rose">{brand}</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-rose uppercase">Rental Tracker</p>
        </div>
        <nav className="mt-5 hidden flex-wrap gap-2 md:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isActive(pathname, link.href)
            const label = labelFor(link.key, link.label, noun)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-sm shadow-sm transition ${
                  active
                    ? "border-sage bg-sage text-white"
                    : "border-[#efe4e0] bg-white text-ink hover:border-[#e4d4cf]"
                }`}
              >
                <NavGlyph name={link.key} active={active} />
                {label}
              </Link>
            )
          })}
        </nav>
        <SheetStatus sync={sheetSync} />
      </header>

      <StaggeredMenu
        className="tracker-menu md:hidden"
        isFixed
        position="right"
        items={menuItems}
        displaySocials={false}
        displayItemNumbering
        menuButtonColor="#3c302d"
        openMenuButtonColor="#3c302d"
        changeMenuColorOnOpen={false}
        colors={["#f6ece8", "#f08b83", "#6f967a"]}
        accentColor="#e07a72"
        closeOnClickAway
      />

      <main className={`mx-auto w-full flex-1 px-4 py-4 sm:px-6 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>
        {wide ? (
          children
        ) : (
          <div className="rounded-2xl bg-white px-4 py-5 shadow-[0_10px_30px_rgba(90,50,40,0.05)] sm:px-7 sm:py-6">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}

function SheetStatus({ sync }: { sync: "idle" | "loading" | "saving" | "saved" | "local" | "error" }) {
  if (sync === "idle" || sync === "local" || sync === "saved" || sync === "loading") return null
  const text = {
    saving: "Syncing to Google Sheets…",
    error: "Google Sheets sync failed. Your changes are still saved on this device.",
  }[sync]
  const tone = sync === "error" ? "text-[#9a403c]" : "text-[#3c7a4e]"
  return <p className={`mt-3 text-xs ${tone}`}>{text}</p>
}
