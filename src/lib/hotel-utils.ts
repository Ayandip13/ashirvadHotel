export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-'
  const date = new Date(d)
  return (
    date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ', ' +
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  )
}

export function todayStr(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Something went wrong')
  }
  return data as T
}

/**
 * Fetch wrapper for list endpoints. Guarantees an array is returned even if
 * the endpoint wraps rows (e.g. { entries: [...] }) — prevents
 * "x.filter is not a function" client crashes from shape mismatches.
 */
export async function apiList<T = unknown>(url: string, options?: RequestInit): Promise<T[]> {
  const data = await api<T[] | { entries?: T[] }>(url, options)
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as { entries?: T[] }).entries)) {
    return (data as { entries?: T[] }).entries as T[]
  }
  return []
}

/** Fetch wrapper that attaches the logged-in user identity for audit trails */
export function apiAs<T = unknown>(
  url: string,
  user: { id: string; name: string; role: string } | null,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }
  if (user) {
    headers['X-User-Id'] = user.id
    headers['X-User-Name'] = encodeURIComponent(user.name)
    headers['X-User-Role'] = user.role
  }
  return fetch(url, { ...options, headers }).then(async (res) => {
    const data = await res.json()
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || 'Something went wrong')
    }
    return data as T
  })
}

/** Client-side CSV export */
export function exportCSV(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

export function dateOnly(d: string | Date | null | undefined): string {
  if (!d) return '-'
  return new Date(d).toISOString().slice(0, 10)
}

/** Sum values in an object array by a key */
export function sumBy<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((s, x) => s + (fn(x) || 0), 0)
}
