'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PaymentStatusBadge } from './status-badge'
import { TableControls, SortableTh, useSort, usePagination } from './table-controls'
import { api, apiAs, formatINR, formatDate, formatDateTime, exportCSV } from '@/lib/hotel-utils'
import { getCachedUser } from './user-context'
import {
  Loader2,
  Receipt,
  Building2,
  Printer,
  Info,
  FileText,
  Wallet,
  ShieldCheck,
  AlertCircle,
  Trash2,
} from 'lucide-react'

interface Guest {
  id: string
  name: string
  phone: string
  company?: string
  gst?: string
}

interface Room {
  id: string
  number: string
  type: string
}

interface Booking {
  id: string
  checkIn: string
  checkOut?: string | null
  actualCheckOut?: string | null
  days: number
  ratePerDay: number
  advance: number
  status: string
  paymentStatus: string
  isCorporate: boolean
  room: Room
  guest: Guest
  foodOrders: { id: string; total: number }[]
  bills: { id: string; grandTotal: number; payCash: number; payUpi: number; payCard: number }[]
}

interface Bill {
  id: string
  billNumber: string
  days: number
  actualRoomTotal: number
  billedRoomTotal: number
  gstPercent: number
  actualGst: number
  foodTotal: number
  extraCharges: number
  discount: number
  grandTotal: number
  payCash: number
  payUpi: number
  payCard: number
  advanceApplied: number
  isCorporate: boolean
  corporateName?: string | null
  gstNumber?: string | null
  createdBy?: string | null
  approvedBy?: string | null
  notes?: string | null
  createdAt: string
  booking: Booking
}

interface TabProps {
  refreshKey: number
  onDataChanged: () => void
  initialFilter?: string
}

export function BillingTab({ refreshKey, onDataChanged, initialFilter }: TabProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)

  // Bill form state
  const [days, setDays] = useState('1')
  const [customMode, setCustomMode] = useState(false)
  const [customTotal, setCustomTotal] = useState('')
  const [gstPercent, setGstPercent] = useState('12')
  const [extraCharges, setExtraCharges] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [includeFood, setIncludeFood] = useState(false)
  const [payCash, setPayCash] = useState('0')
  const [payUpi, setPayUpi] = useState('0')
  const [payCard, setPayCard] = useState('0')
  const [corporateName, setCorporateName] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [managerPin, setManagerPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastBill, setLastBill] = useState<Bill | null>(null)

  // List filters
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kind, setKind] = useState('ALL') // ALL | CUSTOM | PAID | UNPAID

  // Collect payment dialog
  const [collectBill, setCollectBill] = useState<Bill | null>(null)
  const [cCash, setCCash] = useState('0')
  const [cUpi, setCUpi] = useState('0')
  const [cCard, setCCard] = useState('0')

  useEffect(() => {
    if (initialFilter) setSearch(initialFilter)
  }, [initialFilter])

  const load = useCallback(async () => {
    try {
      const [bData, billData, s] = await Promise.all([
        api<Booking[]>('/api/bookings?status=ACTIVE'),
        api<Bill[]>('/api/bills'),
        api<Record<string, string>>('/api/settings'),
      ])
      setBookings(bData)
      setBills(billData)
      setSettings(s)
      setGstPercent((prev) => (prev === '' ? s.gstPercent || '12' : prev))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const num = (v: string) => parseFloat(v) || 0
  const paidOf = (b: Bill) => b.payCash + b.payUpi + b.payCard
  const balanceOf = (b: Bill) => Math.max(0, Math.round((b.grandTotal - paidOf(b)) * 100) / 100)
  const outstandingBills = useMemo(() => bills.filter((b) => balanceOf(b) > 0.01), [bills])

  const calc = useMemo(() => {
    if (!selected) return null
    const billDays = num(days) || 1
    const actualRoomTotal = selected.ratePerDay * billDays
    const billedRoom = customMode && num(customTotal) > 0 ? num(customTotal) : actualRoomTotal
    const foodTotal = includeFood ? selected.foodOrders.reduce((s, o) => s + o.total, 0) : 0
    const taxable = Math.max(0, billedRoom + foodTotal + num(extraCharges) - num(discount))
    const gstAmount = Math.round(taxable * num(gstPercent)) / 100
    const advanceApplied = Math.min(selected.advance, taxable + gstAmount)
    const grandTotal = Math.max(0, Math.round((taxable + gstAmount - advanceApplied) * 100) / 100)
    const paid = num(payCash) + num(payUpi) + num(payCard)
    return {
      billDays,
      actualRoomTotal,
      billedRoom,
      foodTotal,
      gstAmount,
      advanceApplied,
      grandTotal,
      paid,
      balance: Math.round((grandTotal - paid) * 100) / 100,
      adjustment: billedRoom - actualRoomTotal,
    }
  }, [selected, days, customMode, customTotal, includeFood, extraCharges, discount, gstPercent, payCash, payUpi, payCard])

  function openBilling(b: Booking) {
    setSelected(b)
    setDays(String(b.days))
    setCustomMode(false)
    setCustomTotal('')
    setGstPercent(settings.gstPercent || '12')
    setExtraCharges('0')
    setDiscount('0')
    setIncludeFood(false)
    setPayCash('0')
    setPayUpi('0')
    setPayCard('0')
    setCorporateName(b.guest?.company || '')
    setGstNumber(b.guest?.gst || '')
    setManagerPin('')
    setError('')
  }

  function autoBalance(method: 'CASH' | 'UPI' | 'CARD') {
    if (!calc) return
    const zero = '0'
    setPayCash(zero)
    setPayUpi(zero)
    setPayCard(zero)
    const v = String(calc.grandTotal)
    if (method === 'CASH') setPayCash(v)
    if (method === 'UPI') setPayUpi(v)
    if (method === 'CARD') setPayCard(v)
  }

  async function generateBill() {
    if (!selected || !calc) return
    if (calc.balance < -0.01) {
      setError(`Payment split (₹${calc.paid}) cannot exceed total ₹${calc.grandTotal}`)
      return
    }
    if (customMode && calc.adjustment !== 0 && managerPin.length < 3) {
      setError('Custom billing needs a manager PIN for approval')
      return
    }
    setSaving(true)
    setError('')
    try {
      const user = getCachedUser()
      const bill = await apiAs<Bill>('/api/bills', user, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: selected.id,
          days: num(days),
          billedRoomTotal: customMode ? num(customTotal) : undefined,
          gstPercent: num(gstPercent),
          extraCharges: num(extraCharges),
          discount: num(discount),
          payCash: num(payCash),
          payUpi: num(payUpi),
          payCard: num(payCard),
          includeFood,
          corporateName: corporateName || undefined,
          gstNumber: gstNumber || undefined,
          managerPin: customMode ? managerPin : undefined,
          checkout: true,
        }),
      })
      setLastBill(bill)
      setSelected(null)
      await load()
      onDataChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing failed')
    } finally {
      setSaving(false)
    }
  }

  async function collectPayment() {
    if (!collectBill) return
    const amount = num(cCash) + num(cUpi) + num(cCard)
    if (amount <= 0) {
      setError('Enter a payment amount')
      return
    }
    setBusy(true)
    setError('')
    try {
      await apiAs('/api/bills', getCachedUser(), {
        method: 'POST',
        body: JSON.stringify({
          action: 'payment',
          id: collectBill.id,
          payCash: num(cCash),
          payUpi: num(cUpi),
          payCard: num(cCard),
        }),
      })
      setCollectBill(null)
      setCCash('0')
      setCUpi('0')
      setCCard('0')
      await load()
      onDataChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteBill(bill: Bill) {
    if (!confirm(`Are you sure you want to delete Invoice ${bill.billNumber} (${formatINR(bill.grandTotal)})?`)) return
    setBusy(true)
    try {
      const res = await apiAs<{ success?: boolean; error?: string }>(
        `/api/bills?id=${bill.id}`,
        getCachedUser(),
        { method: 'DELETE' }
      )
      if (res && res.error) {
        alert(res.error)
      } else {
        if (lastBill?.id === bill.id) setLastBill(null)
        await load()
        onDataChanged()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete invoice')
    } finally {
      setBusy(false)
    }
  }

  const filteredBills = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bills.filter((b) => {
      if (q) {
        const hay = `${b.billNumber} ${b.booking?.guest?.name || ''} ${b.booking?.guest?.phone || ''} ${b.booking?.room?.number || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (from && new Date(b.createdAt).toISOString().slice(0, 10) < from) return false
      if (to && new Date(b.createdAt).toISOString().slice(0, 10) > to) return false
      if (kind === 'CUSTOM' && !b.isCorporate) return false
      if (kind === 'GST' && (!b.actualGst || b.actualGst <= 0)) return false
      if (kind === 'NON_GST' && b.actualGst > 0) return false
      if (kind === 'PAID' && balanceOf(b) > 0.01) return false
      if (kind === 'UNPAID' && balanceOf(b) <= 0.01) return false
      return true
    })
  }, [bills, search, from, to, kind])

  const { sorted, sort, toggle } = useSort<Record<string, unknown>>(filteredBills as unknown as Record<string, unknown>[], 'createdAt')
  const { paged, controls } = usePagination(sorted as unknown as Bill[], 10)

  function doExport() {
    exportCSV(
      'invoices.csv',
      ['Invoice', 'Date', 'Guest', 'Room', 'Actual Room', 'Billed Room', 'Food', 'GST', 'Grand Total', 'Paid', 'Balance', 'Custom', 'Approved By'],
      (filteredBills as unknown as Bill[]).map((b) => [
        b.billNumber, formatDateTime(b.createdAt), b.booking?.guest?.name || '', b.booking?.room?.number || '',
        b.actualRoomTotal, b.billedRoomTotal, b.foodTotal, b.actualGst, b.grandTotal,
        paidOf(b), balanceOf(b), b.billedRoomTotal !== b.actualRoomTotal ? 'Yes' : 'No', b.approvedBy || '',
      ])
    )
  }

  function resetFilters() {
    setSearch('')
    setFrom('')
    setTo('')
    setKind('ALL')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* In-house guests to bill */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">In-House Guests — Checkout &amp; Combined Billing</h3>
        {bookings.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
            No in-house guests to bill.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {bookings.map((b) => (
              <button
                key={b.id}
                onClick={() => openBilling(b)}
                className="flex items-center justify-between rounded-xl border bg-card p-3.5 text-left transition-all hover:border-emerald-500 hover:shadow-md active:scale-[0.99]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-bold text-white dark:bg-zinc-600">
                      R-{b.room?.number}
                    </span>
                    <span className="font-semibold">{b.guest?.name || 'Guest'}</span>
                    {b.isCorporate && (
                      <Badge variant="outline" className="h-4 border-violet-400 px-1 text-[9px] text-violet-700 dark:text-violet-300">
                        CORP
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {b.days} night{b.days > 1 ? 's' : ''} × {formatINR(b.ratePerDay)}
                    {(b.foodOrders?.length || 0) > 0 && ` • Food: ${formatINR(b.foodOrders.reduce((s, o) => s + o.total, 0))}`}
                    {b.advance > 0 && ` • Advance: ${formatINR(b.advance)}`}
                  </p>
                </div>
                <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Outstanding balances */}
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm font-semibold">
                Outstanding Balances — {formatINR(outstandingBills.reduce((s, b) => s + balanceOf(b), 0))}
              </p>
            </div>
            <Badge variant="outline" className="text-red-600 border-red-300 dark:border-red-800">
              {outstandingBills.length} bill(s)
            </Badge>
          </div>
          {outstandingBills.length === 0 ? (
            <p className="text-xs text-muted-foreground">All bills fully paid. Nothing pending.</p>
          ) : (
            <ul className="max-h-52 space-y-1.5 overflow-y-auto">
              {outstandingBills.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{b.billNumber}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {b.booking?.guest?.name || 'Guest'} · Room {b.booking?.room?.number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentStatusBadge status={balanceOf(b) >= b.grandTotal ? 'UNPAID' : 'PARTIAL'} />
                    <span className="font-bold text-red-600">{formatINR(balanceOf(b))}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => {
                        setCollectBill(b)
                        setCCash(String(balanceOf(b)))
                        setCUpi('0')
                        setCCard('0')
                        setError('')
                      }}
                    >
                      <Wallet className="h-3 w-3" /> Collect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete Invoice"
                      onClick={() => deleteBill(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Invoice history */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Invoice History</h3>
        <TableControls
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Invoice no, guest, room…"
          filters={[
            {
              key: 'kind',
              label: 'Type',
              options: [
                { value: 'GST', label: 'GST Tax Invoices' },
                { value: 'NON_GST', label: 'Non-GST Bills' },
                { value: 'CUSTOM', label: 'Custom / Corp' },
                { value: 'PAID', label: 'Fully paid' },
                { value: 'UNPAID', label: 'With balance' },
              ],
            },
          ]}
          filterValues={{ kind }}
          onFilterChange={(k, v) => k === 'kind' && setKind(v)}
          onReset={resetFilters}
          onExport={doExport}
        >
          <div className="flex items-center gap-1">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[130px] text-xs" aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[130px] text-xs" aria-label="To date" />
          </div>
        </TableControls>

        <div className="mt-2 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTh label="Invoice" sortKey="billNumber" sort={sort} onToggle={toggle} />
                <SortableTh label="Date" sortKey="createdAt" sort={sort} onToggle={toggle} />
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Billed</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(paged as unknown as Bill[]).length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    No invoices match.
                  </TableCell>
                </TableRow>
              )}
              {(paged as unknown as Bill[]).map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    {b.billNumber}
                    {b.billedRoomTotal !== b.actualRoomTotal && (
                      <Badge variant="outline" className="ml-1.5 h-4 border-violet-400 px-1 text-[9px] text-violet-700 dark:text-violet-300">
                        CUSTOM
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(b.createdAt)}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{b.booking?.guest?.name || 'Guest'}</div>
                    <div className="text-xs text-muted-foreground">{b.booking?.guest?.phone}</div>
                  </TableCell>
                  <TableCell>{b.booking?.room?.number}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatINR(b.actualRoomTotal)}</TableCell>
                  <TableCell className={b.billedRoomTotal !== b.actualRoomTotal ? 'font-semibold text-violet-700 dark:text-violet-300' : ''}>
                    {formatINR(b.billedRoomTotal)}
                  </TableCell>
                  <TableCell className="font-bold">{formatINR(b.grandTotal)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={balanceOf(b) <= 0.01 ? 'PAID' : paidOf(b) > 0 ? 'PARTIAL' : 'UNPAID'} />
                    {balanceOf(b) > 0.01 && (
                      <div className="text-[10px] text-red-600">due {formatINR(balanceOf(b))}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="text-xs font-medium text-emerald-700 underline dark:text-emerald-400 hover:text-emerald-800" onClick={() => setLastBill(b)}>
                        View Bill
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete Invoice"
                        onClick={() => deleteBill(b)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {controls}
      </div>

      {/* ============ Billing form dialog ============ */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Bill — Room {selected?.room.number}</DialogTitle>
            <DialogDescription>
              {selected?.guest?.name} • {selected?.guest?.phone} • In: {formatDate(selected?.checkIn)}
            </DialogDescription>
          </DialogHeader>

          {selected && calc && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Corporate Custom Billing</p>
                  <p className="text-xs text-muted-foreground">Bill a custom amount (actual rate credited internally)</p>
                </div>
                <Switch checked={customMode} onCheckedChange={setCustomMode} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Room Charge (Actual)</Label>
                  <div className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">
                    {formatINR(calc.actualRoomTotal)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">({num(days)}n × {formatINR(selected.ratePerDay)})</span>
                  </div>
                </div>
                {customMode ? (
                  <div className="space-y-1.5">
                    <Label className="text-violet-700 dark:text-violet-300">Billed Amount (Custom) *</Label>
                    <Input type="number" value={customTotal} onChange={(e) => setCustomTotal(e.target.value)} placeholder="e.g. 1500" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Billed Amount</Label>
                    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold dark:bg-emerald-950">
                      {formatINR(calc.billedRoom)}
                    </div>
                  </div>
                )}
              </div>

              {customMode && calc.adjustment !== 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-violet-50 p-2.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Bill shows <b>{formatINR(calc.billedRoom)}</b> but internal accounts credit only the actual{' '}
                    <b>{formatINR(calc.actualRoomTotal)}</b> room rent + billed GST. This action is permission-controlled &amp; audited.
                  </span>
                </div>
              )}

              {customMode && (
                <div className="space-y-1.5 rounded-lg border border-violet-300 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                    <Label htmlFor="mgr-pin" className="text-sm font-medium text-violet-800 dark:text-violet-200">
                      Manager / Admin PIN (approval) *
                    </Label>
                  </div>
                  <Input
                    id="mgr-pin"
                    type="password"
                    inputMode="numeric"
                    placeholder="Enter your PIN to approve custom billing"
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Login name: {getCachedUser()?.name || 'not signed in'} — must be ADMIN or MANAGER role.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Food {calc.foodTotal > 0 && `(${formatINR(calc.foodTotal)})`}</Label>
                  <div className="flex items-center justify-between rounded-md border px-2.5 py-2">
                    <span className="text-xs">Add to bill</span>
                    <Switch checked={includeFood} onCheckedChange={setIncludeFood} className="scale-75" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Extra (₹)</Label>
                  <Input type="number" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Discount (₹)</Label>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>GST %</Label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setGstPercent('0')}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                          num(gstPercent) === 0 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        Non-GST (0%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGstPercent('12')}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                          num(gstPercent) === 12 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        12%
                      </button>
                      <button
                        type="button"
                        onClick={() => setGstPercent('18')}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                          num(gstPercent) === 18 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        18%
                      </button>
                    </div>
                  </div>
                  <Input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Billable Days</Label>
                  <Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
                </div>
              </div>

              {(corporateName || gstNumber || num(gstPercent) > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Bill To (Company)</Label>
                    <Input value={corporateName} onChange={(e) => setCorporateName(e.target.value)} placeholder="Company name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>GSTIN</Label>
                    <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="GST number" />
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room ({customMode ? 'custom billed' : 'actual'})</span>
                  <span className="font-medium">{formatINR(calc.billedRoom)}</span>
                </div>
                {calc.foodTotal > 0 && includeFood && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Food charges</span>
                    <span className="font-medium">{formatINR(calc.foodTotal)}</span>
                  </div>
                )}
                {num(extraCharges) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extra charges</span>
                    <span className="font-medium">{formatINR(num(extraCharges))}</span>
                  </div>
                )}
                {num(discount) > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-medium">-{formatINR(num(discount))}</span>
                  </div>
                )}
                {calc.gstAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST ({num(gstPercent)}%)</span>
                    <span className="font-medium">{formatINR(calc.gstAmount)}</span>
                  </div>
                )}
                {calc.advanceApplied > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Advance adjustment</span>
                    <span className="font-medium">-{formatINR(calc.advanceApplied)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Grand Total (payable)</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{formatINR(calc.grandTotal)}</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Payment Split</p>
                  <span className="text-[11px] text-muted-foreground">Pay less than total to leave an outstanding balance</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Cash</Label>
                    <Input type="number" value={payCash} onChange={(e) => setPayCash(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">UPI</Label>
                    <Input type="number" value={payUpi} onChange={(e) => setPayUpi(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Card</Label>
                    <Input type="number" value={payCard} onChange={(e) => setPayCard(e.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => autoBalance('CASH')}>
                      All Cash
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => autoBalance('UPI')}>
                      All UPI
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => autoBalance('CARD')}>
                      All Card
                    </Button>
                  </div>
                  <span className={calc.balance > 0.01 ? 'font-bold text-amber-600' : 'font-bold text-emerald-700 dark:text-emerald-400'}>
                    {calc.balance > 0.01 ? `Outstanding: ${formatINR(calc.balance)}` : '✓ Fully paid'}
                  </span>
                </div>
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={generateBill} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Bill &amp; Check Out
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Collect outstanding payment ============ */}
      <Dialog open={!!collectBill} onOpenChange={(o) => !o && setCollectBill(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Payment — {collectBill?.billNumber}</DialogTitle>
            <DialogDescription>
              {collectBill?.booking?.guest?.name} · Room {collectBill?.booking?.room?.number} · Outstanding{' '}
              <b>{formatINR(collectBill ? balanceOf(collectBill) : 0)}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Cash</Label>
                <Input type="number" value={cCash} onChange={(e) => setCCash(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">UPI</Label>
                <Input type="number" value={cUpi} onChange={(e) => setCUpi(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Card</Label>
                <Input type="number" value={cCard} onChange={(e) => setCCard(e.target.value)} className="h-9" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recording {formatINR(num(cCash) + num(cUpi) + num(cCard))} against {formatINR(collectBill ? balanceOf(collectBill) : 0)} due.
            </p>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button className="w-full" onClick={collectPayment} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ Invoice preview (printable) ============ */}
      <Dialog open={!!lastBill} onOpenChange={(o) => !o && setLastBill(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Bill {lastBill?.billNumber}
            </DialogTitle>
            <DialogDescription>{formatDateTime(lastBill?.createdAt)}</DialogDescription>
          </DialogHeader>
          {lastBill && (
            <div className="space-y-3">
              <div className="print-area rounded-lg border p-4 text-sm">
                <div className="mb-3 text-center">
                  <p className="text-lg font-bold">{settings.hotelName || 'Hotel'}</p>
                  {settings.hotelAddress && <p className="text-xs text-muted-foreground">{settings.hotelAddress}</p>}
                  {settings.hotelPhone && <p className="text-xs text-muted-foreground">Ph: {settings.hotelPhone}</p>}
                  {settings.hotelGstin && <p className="text-xs text-muted-foreground">Hotel GSTIN: {settings.hotelGstin}</p>}
                  <p className="mt-1 text-sm font-semibold uppercase tracking-wide">
                    {lastBill.actualGst > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">GST TAX INVOICE</span>
                    ) : (
                      <span>NON-GST INVOICE / CASH MEMO</span>
                    )}
                  </p>
                </div>
                <div className="mb-3 space-y-0.5 border-y py-2 text-xs text-muted-foreground">
                  <p>Invoice: {lastBill.billNumber} · {formatDateTime(lastBill.createdAt)}</p>
                  <p>Guest: {lastBill.booking?.guest?.name || 'Guest'} ({lastBill.booking?.guest?.phone})</p>
                  {lastBill.corporateName && (
                    <p className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {lastBill.corporateName}
                    </p>
                  )}
                  {lastBill.gstNumber && <p>Guest GSTIN: {lastBill.gstNumber}</p>}
                  <p>
                    Room: {lastBill.booking?.room?.number} ({lastBill.booking?.room?.type})
                  </p>
                  <p>
                    Stay: {lastBill.days} night(s) • {formatDate(lastBill.booking?.checkIn)} →{' '}
                    {formatDate(lastBill.booking?.actualCheckOut || lastBill.booking?.checkOut)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Room Charge ({lastBill.days} × {formatINR(Math.round((lastBill.billedRoomTotal / lastBill.days) * 100) / 100)})
                    </span>
                    <span className="font-medium">{formatINR(lastBill.billedRoomTotal)}</span>
                  </div>
                  {lastBill.foodTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Food / Restaurant ({settings.restaurantName || 'Restaurant'})
                      </span>
                      <span className="font-medium">{formatINR(lastBill.foodTotal)}</span>
                    </div>
                  )}
                  {lastBill.extraCharges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Extra Charges</span>
                      <span className="font-medium">{formatINR(lastBill.extraCharges)}</span>
                    </div>
                  )}
                  {lastBill.discount > 0 && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                      <span>Discount</span>
                      <span className="font-medium">-{formatINR(lastBill.discount)}</span>
                    </div>
                  )}
                  {lastBill.actualGst > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST ({lastBill.gstPercent}%)</span>
                      <span className="font-medium">{formatINR(lastBill.actualGst)}</span>
                    </div>
                  )}
                  {lastBill.advanceApplied > 0 && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                      <span>Advance Received</span>
                      <span className="font-medium">-{formatINR(lastBill.advanceApplied)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Grand Total</span>
                    <span>{formatINR(lastBill.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                    <span>Paid — Cash</span>
                    <span>{formatINR(lastBill.payCash)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Paid — UPI</span>
                    <span>{formatINR(lastBill.payUpi)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Paid — Card</span>
                    <span>{formatINR(lastBill.payCard)}</span>
                  </div>
                  {balanceOf(lastBill) > 0.01 && (
                    <div className="flex justify-between font-semibold text-red-600">
                      <span>Outstanding Balance</span>
                      <span>{formatINR(balanceOf(lastBill))}</span>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-center text-[10px] text-muted-foreground">Thank you — please visit again!</p>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button className="flex-1" variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
                </Button>
                <Button variant="destructive" onClick={() => deleteBill(lastBill)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
