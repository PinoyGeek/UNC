const driveIdPattern = /^[a-zA-Z0-9_-]{10,}$/

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id || !driveIdPattern.test(id)) {
    return Response.json({ error: "Invalid file id." }, { status: 400 })
  }

  const sources = [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://drive.usercontent.google.com/download?id=${id}&export=download`,
  ]

  for (const url of sources) {
    try {
      const response = await fetch(url, { redirect: "follow" })
      if (!response.ok) continue
      const type = response.headers.get("content-type") || ""
      if (type.includes("text/html")) continue
      const data = await response.arrayBuffer()
      if (data.byteLength < 200) continue
      const contentType = type.includes("image") ? type.split(";")[0].trim() : "image/jpeg"
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      })
    } catch {
      continue
    }
  }

  return Response.json({ error: "Image not available." }, { status: 404 })
}
