'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { BookingDialog } from './booking-dialog'
import { PaymentStatusBadge } from './status-badge'
import { TableControls, SortableTh, useSort, usePagination } from './table-controls'
import { api, apiAs, formatINR, formatDate, exportCSV } from '@/lib/hotel-utils'
import { getCachedUser } from './user-context'
import { Loader2, UserPlus, LogIn, CalendarClock, XCircle, ArrowLeftRight, Wallet } from 'lucide-react'

interface Guest {
  id: string
  name: string
  phone: string
  company?: string | null
}

interface Room {
  id: string
  number: string
  type?: string
  rate?: number
  status?: string
}

interface Bill {
  id: string
  billNumber: string
  grandTotal: number
  payCash: number
  payUpi: number
  payCard: number
}

interface Booking {
  id: string
  checkIn: string
  checkOut?: string | null
  days: number
  guestCount: number
  ratePerDay: number
  advance: number
  status: string
  paymentStatus: string
  isCorporate: boolean
  guest: Guest
  room: Room
  bills: Bill[]
  foodOrders: { total: number }[]
}

interface TabProps {
  refreshKey: number
  onDataChanged: () => void
  initialFilter?: string
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active (in-house)' },
  { value: 'BOOKED', label: 'Booked (future)' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function BookingsTab({ refreshKey, onDataChanged, initialFilter }: TabProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [paymentStatus, setPaymentStatus] = useState('ALL')
  const [roomFilter, setRoomFilter] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [newOpen, setNewOpen] = useState(false)
  const [extendBooking, setExtendBooking] = useState<Booking | null>(null)
  const [newDate, setNewDate] = useState('')
  const [changeBooking, setChangeBooking] = useState<Booking | null>(null)
  const [newRoomId, setNewRoomId] = useState('')

  useEffect(() => {
    if (initialFilter) setSearch(initialFilter)
  }, [initialFilter])

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([api<Booking[]>('/api/bookings'), api<Room[]>('/api/rooms')])
      setBookings(b)
      setRooms(r)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bookings.filter((b) => {
      if (q && !(`${b.guest?.name || ''} ${b.guest?.phone || ''} ${b.room?.number || ''}`.toLowerCase().includes(q))) return false
      if (status !== 'ALL' && b.status !== status) return false
      if (paymentStatus !== 'ALL' && b.paymentStatus !== paymentStatus) return false
      if (roomFilter !== 'ALL' && b.room?.id !== roomFilter) return false
      const created = new Date(b.checkIn).toISOString().slice(0, 10)
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [bookings, search, status, paymentStatus, roomFilter, from, to])

  const { sorted, sort, toggle } = useSort<Record<string, unknown>>(filtered as unknown as Record<string, unknown>[], 'checkIn')
  const { paged, controls } = usePagination(sorted as unknown as Booking[], 10)

  function resetFilters() {
    setSearch('')
    setStatus('ALL')
    setPaymentStatus('ALL')
    setRoomFilter('ALL')
    setFrom('')
    setTo('')
  }

  function doExport() {
    exportCSV(
      'bookings.csv',
      ['Guest', 'Phone', 'Room', 'Check-in', 'Check-out', 'Nights', 'Rate/Night', 'Advance', 'Status', 'Payment', 'Corporate'],
      (filtered as unknown as Booking[]).map((b) => [
        b.guest?.name || '', b.guest?.phone || '', b.room?.number || '', formatDate(b.checkIn), formatDate(b.checkOut),
        b.days, b.ratePerDay, b.advance, b.status, b.paymentStatus, b.isCorporate ? 'Yes' : 'No',
      ])
    )
  }

  async function action(booking: Booking, act: string, extra: Record<string, unknown> = {}) {
    setBusyId(booking.id + act)
    try {
      await apiAs('/api/bookings', getCachedUser(), {
        method: 'PATCH',
        body: JSON.stringify({ id: booking.id, action: act, ...extra }),
      })
      await load()
      onDataChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  function paidAmount(b: Booking): number {
    const bill = b.bills[0]
    return bill ? bill.payCash + bill.payUpi + bill.payCard : 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const vacantRooms = rooms.filter((r) => r.status !== 'OCCUPIED')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Bookings</h2>
          <p className="text-xs text-muted-foreground">
            {bookings.filter((b) => b.status === 'ACTIVE').length} in-house ·{' '}
            {bookings.filter((b) => b.status === 'BOOKED').length} upcoming ·{' '}
            {bookings.filter((b) => b.paymentStatus !== 'PAID' && (b.status === 'ACTIVE' || b.status === 'COMPLETED')).length} with balance
          </p>
        </div>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setNewOpen(true)}>
          <UserPlus className="h-4 w-4" /> New Booking
        </Button>
      </div>

      <TableControls
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Guest name, phone, room…"
        filters={[
          { key: 'status', label: 'Status', options: STATUS_OPTIONS },
          {
            key: 'payment',
            label: 'Payment',
            options: [
              { value: 'PAID', label: 'Paid' },
              { value: 'PARTIAL', label: 'Partial' },
              { value: 'UNPAID', label: 'Unpaid' },
            ],
          },
          {
            key: 'room',
            label: 'Room',
            options: rooms.map((r) => ({ value: r.id, label: `Room ${r.number}` })),
          },
        ]}
        filterValues={{ status, payment: paymentStatus, room: roomFilter }}
        onFilterChange={(k, v) => {
          if (k === 'status') setStatus(v)
          if (k === 'payment') setPaymentStatus(v)
          if (k === 'room') setRoomFilter(v)
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
              <SortableTh label="Guest" sortKey="guest" sort={sort} onToggle={toggle} />
              <TableHead>Room</TableHead>
              <SortableTh label="Check-In" sortKey="checkIn" sort={sort} onToggle={toggle} />
              <TableHead>Nights</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Advance</TableHead>
              <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No bookings match the filters.
                </TableCell>
              </TableRow>
            )}
            {(paged as unknown as Booking[]).map((b) => {
              const busy = busyId === b.id
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.guest?.name || 'Guest'}</div>
                    <div className="text-xs text-muted-foreground">{b.guest?.phone}</div>
                  </TableCell>
                  <TableCell className="font-medium">Room {b.room?.number}</TableCell>
                  <TableCell>
                    <div className="text-sm">{formatDate(b.checkIn)}</div>
                    <div className="text-xs text-muted-foreground">out: {formatDate(b.checkOut)}</div>
                  </TableCell>
                  <TableCell>{b.days}</TableCell>
                  <TableCell>{formatINR(b.ratePerDay)}</TableCell>
                  <TableCell>{b.advance > 0 ? formatINR(b.advance) : '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        b.status === 'ACTIVE'
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
                          : b.status === 'BOOKED'
                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : b.status === 'COMPLETED'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                      }
                    >
                      {b.status === 'ACTIVE' ? 'In-house' : b.status === 'BOOKED' ? 'Booked' : b.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={b.paymentStatus} />
                    {b.bills[0] && paidAmount(b) < b.bills[0].grandTotal && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        due {formatINR(b.bills[0].grandTotal - paidAmount(b))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.status === 'BOOKED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={busy}
                          onClick={() => action(b, 'checkin')}
                        >
                          <LogIn className="h-3 w-3" /> Check-in
                        </Button>
                      )}
                      {b.status === 'ACTIVE' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              setChangeBooking(b)
                              setNewRoomId('')
                            }}
                          >
                            <ArrowLeftRight className="h-3 w-3" /> Move
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              setExtendBooking(b)
                              setNewDate(b.checkOut ? new Date(b.checkOut).toISOString().slice(0, 10) : '')
                            }}
                          >
                            <CalendarClock className="h-3 w-3" /> Extend
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Check out ${b.guest?.name || 'Guest'} from Room ${b.room?.number}?`)) action(b, 'checkout')
                            }}
                          >
                            <Wallet className="h-3 w-3" /> Checkout
                          </Button>
                        </>
                      )}
                      {(b.status === 'ACTIVE' || b.status === 'BOOKED') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs text-destructive"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Cancel booking of ${b.guest?.name || 'Guest'} (Room ${b.room?.number})?`)) action(b, 'cancel')
                          }}
                        >
                          <XCircle className="h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {controls}

      <BookingDialog open={newOpen} onOpenChange={setNewOpen} onSuccess={() => { load(); onDataChanged() }} />

      {/* Extend stay dialog */}
      <Dialog open={!!extendBooking} onOpenChange={(o) => !o && setExtendBooking(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Extend Stay</DialogTitle>
            <DialogDescription>
              {extendBooking?.guest?.name} · Room {extendBooking?.room?.number} · current out:{' '}
              {formatDate(extendBooking?.checkOut)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ext-date">New Check-Out Date</Label>
              <Input
                id="ext-date"
                type="date"
                value={newDate}
                min={extendBooking ? new Date(extendBooking.checkIn).toISOString().slice(0, 10) : ''}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!newDate || busyId !== null}
              onClick={() => {
                if (extendBooking) {
                  action(extendBooking, 'extend', { checkOut: newDate })
                  setExtendBooking(null)
                }
              }}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change room dialog */}
      <Dialog open={!!changeBooking} onOpenChange={(o) => !o && setChangeBooking(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Change Room</DialogTitle>
            <DialogDescription>
              Move {changeBooking?.guest?.name} out of Room {changeBooking?.room?.number}. Old room is marked for cleaning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={newRoomId} onValueChange={setNewRoomId}>
              <SelectTrigger aria-label="New room">
                <SelectValue placeholder="Select new room" />
              </SelectTrigger>
              <SelectContent>
                {vacantRooms
                  .filter((r) => r.id !== changeBooking?.room.id)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.number} — {formatINR(r.rate)}/night
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!newRoomId || busyId !== null}
              onClick={() => {
                if (changeBooking) {
                  action(changeBooking, 'change-room', { newRoomId })
                  setChangeBooking(null)
                }
              }}
            >
              Move Guest
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
