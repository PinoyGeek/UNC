import type { Metadata, Viewport } from "next"
import { DM_Sans, Great_Vibes } from "next/font/google"
import { Shell } from "@/components/shell"
import { TrackerProvider } from "@/components/tracker-provider"
import { siteConfig } from "@/lib/site"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
})

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
})

const canonicalUrl = siteConfig.siteUrl.replace(/\/$/, "")
const previewPath = siteConfig.linkPreview.startsWith("/") ? siteConfig.linkPreview : `/${siteConfig.linkPreview}`
const previewImageUrl = `${canonicalUrl}${previewPath}`

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.title,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: canonicalUrl,
  image: [previewImageUrl],
  description: siteConfig.description,
  author: {
    "@type": "Organization",
    name: siteConfig.brand,
  },
}

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.brand}`,
  },
  description: siteConfig.description,
  keywords: [
    "Digital Aly",
    "rental tracker",
    "inventory tracker",
    "rental bookings",
    "booking calendar",
    "returns",
    "payments",
    "rental inventory",
  ],
  applicationName: siteConfig.title,
  authors: [{ name: siteConfig.brand }],
  creator: siteConfig.brand,
  publisher: siteConfig.brand,
  category: "Business",
  formatDetection: {
    email: false,
    address: false,
    telephone: true,
  },
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    url: canonicalUrl,
    siteName: siteConfig.title,
    locale: "en_PH",
    type: "website",
    images: [
      {
        url: previewImageUrl,
        secureUrl: previewImageUrl,
        width: 1280,
        height: 720,
        type: "image/jpeg",
        alt: "Digital Aly Rental Tracker — track inventory, rentals, returns, and earnings.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [previewImageUrl],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    title: siteConfig.brand,
    statusBarStyle: "default",
    capable: true,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#f6ece8",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${greatVibes.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <TrackerProvider>
          <Shell>{children}</Shell>
        </TrackerProvider>
      </body>
    </html>
  )
}
