import type { BookingStatus } from "@/lib/rental"
import { mediaUrl } from "@/lib/rental"

export const inputClass =
  "h-10 w-full rounded-lg border border-[#e5d7d2] bg-white px-3 text-sm text-ink outline-none transition focus:border-sage"

export const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-lg bg-coral px-4 text-sm font-semibold text-white transition hover:bg-[#e37c74] disabled:cursor-not-allowed disabled:opacity-50"

export const ghostBtn =
  "inline-flex h-11 items-center justify-center rounded-lg border border-[#ddd0cb] bg-white px-3 text-sm font-medium text-ink transition hover:bg-blush disabled:cursor-not-allowed disabled:opacity-50"

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  )
}

const statusTone: Record<BookingStatus, string> = {
  upcoming: "bg-[#fde7ea] text-[#c45c6c]",
  confirmed: "bg-[#fde0e4] text-[#c4475c]",
  returned: "bg-[#f3eeec] text-[#8a7a74]",
  cancelled: "bg-[#fdeceb] text-[#9a403c]",
}

export function StatusPill({
  status,
  children,
}: {
  status: BookingStatus
  children?: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status]}`}
    >
      {children}
    </span>
  )
}

export function BrandMark({
  src,
  mark = "aly",
  className = "h-12 w-12 sm:h-14 sm:w-14",
}: {
  src: string | null
  mark?: string
  className?: string
}) {
  const image = mediaUrl(src)
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-rose/40 bg-[#fffaf8] shadow-sm ${className}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="Business logo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-script text-[1.45rem] leading-none text-rose sm:text-[1.7rem]">{mark}</span>
      )}
    </div>
  )
}
