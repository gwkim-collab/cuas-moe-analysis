// Trigger a client-side file download of a text blob.
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Filesystem-safe timestamp like 2026-07-16T13-20-05. */
export function fileStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}
