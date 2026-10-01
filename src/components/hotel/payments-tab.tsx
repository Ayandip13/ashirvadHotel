'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableControls, SortableTh, useSort, usePagination } from './table-controls'
import { api, apiList, formatINR, formatDate, formatDateTime, exportCSV } from '@/lib/hotel-utils'
import { Banknote, Smartphone, CreditCard, Loader2, Wallet } from 'lucide-react'

interface PaymentRow {
  id: string
  source: 'BILL' | 'ORDER' | 'ADVANCE'
  ref: string
  date: string
  guest: string
  detail: string
  amount: number
  cash: number
  upi: number
  card: number
}

interface Bill {
  id: string
  billNumber: string
  createdAt: string
  payCash: number
  payUpi: number
  payCard: number
  booking: { guest: { name: string }; room: { number: string } }
}

interface Order {
  id: string
  createdAt: string
  total: number
  bookingId?: string | null
  tableNo?: string | null
  room?: { number: string } | null
  items: { id: string; name: string; quantity: number; price: number }[]
}

interface LedgerEntry {
  id: string
  date: string
  description: string
  amount: number
  method: string
  category: string
  refId?: string | null
}

interface TabProps {
  refreshKey: number
  onDataChanged: () => void
  initialFilter?: string
}

export function PaymentsTab({ refreshKey }: TabProps) {
  const [bills, setBills] = useState<Bill[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('ALL')
  const [source, setSource] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    try {
      const [b, o, l] = await Promise.all([
        apiList<Bill>('/api/bills'),
        apiList<Order>('/api/orders'),
        apiList<LedgerEntry>('/api/ledger?type=INCOME'),
      ])
      setBills(b)
      setOrders(o)
      setLedger(l)
    } catch {
      // silent — keep previous data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const rows = useMemo<PaymentRow[]>(() => {
    const out: PaymentRow[] = []
    for (const b of bills) {
      const paid = b.payCash + b.payUpi + b.payCard
      if (paid > 0) {
        out.push({
          id: `bill-${b.id}`,
          source: 'BILL',
          ref: b.billNumber,
          date: b.createdAt,
          guest: b.booking?.guest?.name || 'Guest',
          detail: `Room ${b.booking?.room?.number ?? '-'} — room + food bill`,
          amount: paid,
          cash: b.payCash,
          upi: b.payUpi,
          card: b.payCard,
        })
      }
    }
    for (const o of orders) {
      // direct restaurant payments only (orders not merged into a room bill)
      if (o.bookingId) continue
      out.push({
        id: `order-${o.id}`,
        source: 'ORDER',
        ref: o.tableNo ? `Table ${o.tableNo}` : 'Restaurant',
        date: o.createdAt,
        guest: '—',
        detail: o.items.map((i) => `${i.name} ×${i.quantity}`).join(', '),
        amount: o.total,
        cash: o.total,
        upi: 0,
        card: 0,
      })
    }
    for (const l of ledger.filter((e) => e.category === 'ADVANCE')) {
      out.push({
        id: `adv-${l.id}`,
        source: 'ADVANCE',
        ref: 'Guest Advance',
        date: l.date,
        guest: l.description.replace('Advance from ', '').split(' (')[0],
        detail: l.description,
        amount: l.amount,
        cash: l.method === 'CASH' ? l.amount : 0,
        upi: l.method === 'UPI' ? l.amount : 0,
        card: l.method === 'CARD' ? l.amount : 0,
      })
    }
    return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [bills, orders, ledger])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !`${r.ref} ${r.guest} ${r.detail}`.toLowerCase().includes(q)) return false
      const d = new Date(r.date).toISOString().slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      if (source !== 'ALL' && r.source !== source) return false
      if (channel === 'CASH' && r.cash === 0) return false
      if (channel === 'UPI' && r.upi === 0) return false
      if (channel === 'CARD' && r.card === 0) return false
      return true
    })
  }, [rows, search, from, to, source, channel])

  const totals = useMemo(() => {
    return {
      cash: filtered.reduce((s, r) => s + r.cash, 0),
      upi: filtered.reduce((s, r) => s + r.upi, 0),
      card: filtered.reduce((s, r) => s + r.card, 0),
      total: filtered.reduce((s, r) => s + r.amount, 0),
    }
  }, [filtered])

  const { sorted, sort, toggle } = useSort<Record<string, unknown>>(filtered as unknown as Record<string, unknown>[], 'date')
  const { paged, controls } = usePagination(sorted as unknown as PaymentRow[], 10)

  function doExport() {
    exportCSV(
      'payments.csv',
      ['Date', 'Source', 'Reference', 'Guest', 'Detail', 'Cash', 'UPI', 'Card', 'Total'],
      (filtered as unknown as PaymentRow[]).map((r) => [
        formatDateTime(r.date), r.source, r.ref, r.guest, r.detail, r.cash, r.upi, r.card, r.amount,
      ])
    )
  }

  function resetFilters() {
    setSearch('')
    setChannel('ALL')
    setSource('ALL')
    setFrom('')
    setTo('')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Payments — Collections Ledger</h2>
        <p className="text-xs text-muted-foreground">Every collection categorized by Cash, UPI and Card channel</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-emerald-100 p-2.5 dark:bg-emerald-900">
              <Banknote className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-lg font-bold">{formatINR(totals.cash)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-violet-100 p-2.5 dark:bg-violet-900">
              <Smartphone className="h-5 w-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">UPI</p>
              <p className="text-lg font-bold">{formatINR(totals.upi)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-orange-100 p-2.5 dark:bg-orange-900">
              <CreditCard className="h-5 w-5 text-orange-700 dark:text-orange-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Card</p>
              <p className="text-lg font-bold">{formatINR(totals.card)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-emerald-100 p-2.5 dark:bg-emerald-900">
              <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-lg font-bold">{formatINR(totals.total)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <TableControls
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Reference, guest, detail…"
        filters={[
          {
            key: 'channel',
            label: 'Channel',
            options: [
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'CARD', label: 'Card' },
            ],
          },
          {
            key: 'source',
            label: 'Source',
            options: [
              { value: 'BILL', label: 'Room bill' },
              { value: 'ORDER', label: 'Restaurant' },
              { value: 'ADVANCE', label: 'Advance' },
            ],
          },
        ]}
        filterValues={{ channel, source }}
        onFilterChange={(k, v) => {
          if (k === 'channel') setChannel(v)
          if (k === 'source') setSource(v)
        }}
        onReset={resetFilters}
        onExport={doExport}
      >
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[130px] text-xs" aria-label="From date" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[130px] text-xs" aria-label="To date" />
        </div>
      </TableControls>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTh label="Date" sortKey="date" sort={sort} onToggle={toggle} />
              <TableHead>Source</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">UPI</TableHead>
              <TableHead className="text-right">Card</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(paged as unknown as PaymentRow[]).length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No payments match the filters.
                </TableCell>
              </TableRow>
            )}
            {(paged as unknown as PaymentRow[]).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.date)}</TableCell>
                <TableCell className="text-xs">
                  {r.source === 'BILL' ? 'Room Bill' : r.source === 'ORDER' ? 'Restaurant' : 'Advance'}
                </TableCell>
                <TableCell className="text-xs font-medium">{r.ref}</TableCell>
                <TableCell className="text-xs">{r.guest}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{r.detail}</TableCell>
                <TableCell className="text-right text-xs">{r.cash > 0 ? formatINR(r.cash) : '—'}</TableCell>
                <TableCell className="text-right text-xs">{r.upi > 0 ? formatINR(r.upi) : '—'}</TableCell>
                <TableCell className="text-right text-xs">{r.card > 0 ? formatINR(r.card) : '—'}</TableCell>
                <TableCell className="text-right text-sm font-bold">{formatINR(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {controls}
      <p className="text-[11px] text-muted-foreground">
        Date range covers {rows.length > 0 ? formatDate(rows[rows.length - 1].date) : '—'} →{' '}
        {rows.length > 0 ? formatDate(rows[0].date) : '—'}. Use filters above to narrow down.
      </p>
    </div>
  )
}
