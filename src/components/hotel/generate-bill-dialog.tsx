'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { apiAs, formatINR, formatDate } from '@/lib/hotel-utils'
import { getCachedUser } from './user-context'
import { Loader2, Info, ShieldCheck } from 'lucide-react'

interface Guest {
  id: string
  name: string
  phone: string
  company?: string | null
  gst?: string | null
}

interface Room {
  id: string
  number: string
  type?: string
}

interface Booking {
  id: string
  checkIn: string
  days: number
  ratePerDay: number
  advance: number
  isCorporate?: boolean
  guest: Guest
  room: Room
  foodOrders?: { id: string; total: number }[]
}

export interface Bill {
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

interface GenerateBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: Booking | null
  defaultGstPercent?: string
  onSuccess: (bill: Bill) => void
}

export function GenerateBillDialog({
  open,
  onOpenChange,
  booking,
  defaultGstPercent = '12',
  onSuccess,
}: GenerateBillDialogProps) {
  const [days, setDays] = useState('1')
  const [customMode, setCustomMode] = useState(false)
  const [customTotal, setCustomTotal] = useState('')
  const [gstPercent, setGstPercent] = useState(defaultGstPercent)
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

  useEffect(() => {
    if (open && booking) {
      setDays(String(booking.days || 1))
      setCustomMode(false)
      setCustomTotal('')
      setGstPercent(defaultGstPercent)
      setExtraCharges('0')
      setDiscount('0')
      setIncludeFood(false)
      setPayCash('0')
      setPayUpi('0')
      setPayCard('0')
      setCorporateName(booking.guest?.company || '')
      setGstNumber(booking.guest?.gst || '')
      setManagerPin('')
      setError('')
    }
  }, [open, booking, defaultGstPercent])

  const num = (v: string) => parseFloat(v) || 0

  const calc = useMemo(() => {
    if (!booking) return null
    const billDays = num(days) || 1
    const actualRoomTotal = booking.ratePerDay * billDays
    const billedRoom = customMode && num(customTotal) > 0 ? num(customTotal) : actualRoomTotal
    const foodTotal = includeFood && booking.foodOrders ? booking.foodOrders.reduce((s, o) => s + o.total, 0) : 0
    const taxable = Math.max(0, billedRoom + foodTotal + num(extraCharges) - num(discount))
    const gstAmount = Math.round(taxable * num(gstPercent)) / 100
    const advanceApplied = Math.min(booking.advance || 0, taxable + gstAmount)
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
  }, [booking, days, customMode, customTotal, includeFood, extraCharges, discount, gstPercent, payCash, payUpi, payCard])

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
    if (!booking || !calc) return
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
          bookingId: booking.id,
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
      onSuccess(bill)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Bill — Room {booking?.room?.number}</DialogTitle>
          <DialogDescription>
            {booking?.guest?.name} • {booking?.guest?.phone} • In: {formatDate(booking?.checkIn)}
          </DialogDescription>
        </DialogHeader>

        {booking && calc && (
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
                  <span className="text-xs font-normal text-muted-foreground">({num(days)}n × {formatINR(booking.ratePerDay)})</span>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Food {calc.foodTotal > 0 && `(${formatINR(calc.foodTotal)})`}</Label>
                <div className="flex items-center justify-between rounded-md border px-2.5 py-2">
                  <span className="text-xs">Add to bill</span>
                  <Switch checked={includeFood} onCheckedChange={setIncludeFood} className="scale-75" />
                </div>
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
  )
}
