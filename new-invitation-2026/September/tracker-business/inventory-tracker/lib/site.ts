/**
 * Creator config. Change the web app URL here after deploying Apps Script.
 * Visitors never enter this on the site.
 */
export const siteConfig = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbxwUXHSqDjMKI97M98sXtYy6CSY6qFlN0RmEzGIudO9jI5dyBv44ig0onl14HGgcjT3IQ/exec",
  googlelink:
    "https://docs.google.com/spreadsheets/d/1OeIFK9naH9rTIXA1Bqla_Ho_XiHC44mns3P9egujxds/edit?usp=sharing",
  sheetKey: "",
  brand: "Digital Aly",
  title: "Digital Aly Rental Tracker",
  description:
    "Track inventory, rentals, returns, and earnings. Manage bookings, payments, and availability for whatever you rent out.",
  /** Set this to the live site URL after deploy so shared cards use the real domain. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Replace public/linkPreview.jpg to change the image shown when this link is shared. */
  linkPreview: "/LinkPreview.png",
}
