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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckinDialog } from './checkin-dialog'
import { RoomStatusBadge } from './status-badge'
import { TableControls } from './table-controls'
import { api, apiAs, formatINR, formatDate } from '@/lib/hotel-utils'
import { getCachedUser } from './user-context'
import { Loader2, Plus, BrushCleaning, Wrench, BedDouble, Printer, Wallet } from 'lucide-react'

interface Guest {
  id: string
  name: string
  phone: string
  company?: string | null
}

interface Booking {
  id: string
  checkIn: string
  checkOut?: string | null
  days: number
  guest: Guest
  advance: number
}

interface Room {
  id: string
  number: string
  type: string
  capacity: number
  rate: number
  status: string
  housekeeping: string
  notes?: string | null
  bookings: Booking[]
}

const TYPES = ['Non-AC', 'AC', 'Deluxe AC', 'Suite']

interface TabProps {
  refreshKey: number
  onDataChanged: () => void
  initialFilter?: string
  onNavigate?: (target: { tab: string; q?: string }) => void
}

export function RoomsTab({ refreshKey, onDataChanged, initialFilter, onNavigate }: TabProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [floor, setFloor] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [status, setStatus] = useState('ALL')

  const [checkinRoom, setCheckinRoom] = useState<Room | null>(null)
  const [viewRoom, setViewRoom] = useState<Room | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newType, setNewType] = useState('Non-AC')
  const [newRate, setNewRate] = useState('800')
  const [newCapacity, setNewCapacity] = useState('2')

  useEffect(() => {
    if (initialFilter) setSearch(initialFilter)
  }, [initialFilter])

  const load = useCallback(async () => {
    try {
      setRooms(await api<Room[]>('/api/rooms'))
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const floors = useMemo(() => [...new Set(rooms.map((r) => r.number.charAt(0)))].sort(), [rooms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rooms.filter((r) => {
      if (q && !`${r.number} ${r.type}`.toLowerCase().includes(q)) return false
      if (floor !== 'ALL' && !r.number.startsWith(floor)) return false
      if (type !== 'ALL' && r.type !== type) return false
      if (status !== 'ALL' && r.status !== status) return false
      return true
    })
  }, [rooms, search, floor, type, status])

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, Room[]>>((acc, room) => {
      const f = room.number.charAt(0)
      if (!acc[f]) acc[f] = []
      acc[f].push(room)
      return acc
    }, {})
  }, [filtered])

  function resetFilters() {
    setSearch('')
    setFloor('ALL')
    setType('ALL')
    setStatus('ALL')
  }

  async function patchRoom(room: Room, data: Record<string, unknown>) {
    setBusy(true)
    try {
      await apiAs('/api/rooms', getCachedUser(), { method: 'PATCH', body: JSON.stringify({ id: room.id, ...data }) })
      await load()
      onDataChanged()
    } finally {
      setBusy(false)
    }
  }

  async function addRoom() {
    if (!newNumber.trim()) return
    setBusy(true)
    try {
      await apiAs('/api/rooms', getCachedUser(), {
        method: 'POST',
        body: JSON.stringify({ number: newNumber.trim(), type: newType, rate: newRate, capacity: newCapacity }),
      })
      setAddOpen(false)
      setNewNumber('')
      await load()
      onDataChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not add room')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Rooms</h2>
          <p className="text-xs text-muted-foreground">
            {rooms.filter((r) => r.status === 'VACANT').length} vacant ·{' '}
            {rooms.filter((r) => r.status === 'OCCUPIED').length} occupied ·{' '}
            {rooms.filter((r) => r.housekeeping === 'DIRTY').length} to clean ·{' '}
            {rooms.filter((r) => r.status === 'MAINTENANCE').length} maintenance
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Room
        </Button>
      </div>

      <TableControls
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Room number, type…"
        filters={[
          { key: 'floor', label: 'Floor', options: floors.map((f) => ({ value: f, label: `Floor ${f}` })) },
          { key: 'type', label: 'Type', options: [...new Set(rooms.map((r) => r.type))].map((t) => ({ value: t, label: t })) },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'VACANT', label: 'Vacant' },
              { value: 'OCCUPIED', label: 'Occupied' },
              { value: 'MAINTENANCE', label: 'Maintenance' },
            ],
          },
        ]}
        filterValues={{ floor, type, status }}
        onFilterChange={(k, v) => {
          if (k === 'floor') setFloor(v)
          if (k === 'type') setType(v)
          if (k === 'status') setStatus(v)
        }}
        onReset={resetFilters}
      />

      {Object.entries(grouped).map(([f, floorRooms]) => (
        <div key={f}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Floor {f}</h3>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10">
            {floorRooms.map((room) => {
              const dirty = room.status === 'VACANT' && room.housekeeping === 'DIRTY'
              const borderCls = dirty
                ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
                : room.status === 'OCCUPIED'
                  ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
                  : room.status === 'MAINTENANCE'
                    ? 'border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/60'
                    : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
              return (
                <button
                  key={room.id}
                  onClick={() => (room.status === 'VACANT' && !dirty ? setCheckinRoom(room) : setViewRoom(room))}
                  className={`min-h-[92px] rounded-xl border-2 p-2.5 text-left transition-all active:scale-95 hover:shadow-md ${borderCls}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold">{room.number}</span>
                    <BedDouble className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{room.type}</p>
                  {room.status === 'OCCUPIED' && room.bookings?.[0] ? (
                    <p className="mt-1 truncate text-[10px] font-semibold text-red-700 dark:text-red-400">
                      {room.bookings[0].guest?.name || 'Guest'}
                    </p>
                  ) : dirty ? (
                    <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">To Clean</p>
                  ) : (
                    <p className="mt-1 text-[10px] font-medium">{formatINR(room.rate)}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <CheckinDialog
        open={!!checkinRoom}
        onOpenChange={(o) => !o && setCheckinRoom(null)}
        room={checkinRoom}
        onSuccess={() => {
          load()
          onDataChanged()
        }}
      />

      {/* Room detail */}
      <Dialog open={!!viewRoom} onOpenChange={(o) => !o && setViewRoom(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Room {viewRoom?.number}
              <RoomStatusBadge status={viewRoom?.status || ''} housekeeping={viewRoom?.housekeeping} />
            </DialogTitle>
            <DialogDescription>
              {viewRoom?.type} • Max {viewRoom?.capacity} guests • {formatINR(viewRoom?.rate)}/night
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {viewRoom?.status === 'OCCUPIED' && viewRoom.bookings?.[0] && (
              <div className="space-y-2">
                <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guest</span>
                    <span className="font-semibold">{viewRoom.bookings[0].guest?.name || 'Guest'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-semibold">{viewRoom.bookings[0].guest?.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check-In</span>
                    <span className="font-semibold">{formatDate(viewRoom.bookings[0].checkIn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected Out</span>
                    <span className="font-semibold">{formatDate(viewRoom.bookings[0].checkOut)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Advance</span>
                    <span className="font-semibold">{formatINR(viewRoom.bookings[0].advance)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      onNavigate?.({ tab: 'billing', q: viewRoom.number })
                      setViewRoom(null)
                    }}
                  >
                    <Printer className="mr-1.5 h-4 w-4" /> Print Bill
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      onNavigate?.({ tab: 'billing', q: viewRoom.number })
                      setViewRoom(null)
                    }}
                  >
                    <Wallet className="mr-1.5 h-4 w-4" /> Billing / Checkout
                  </Button>
                </div>
              </div>
            )}
            {viewRoom?.status === 'MAINTENANCE' && (
              <p className="text-sm text-muted-foreground">Room is under maintenance — book after marking vacant.</p>
            )}

            {viewRoom && viewRoom.status === 'VACANT' && viewRoom.housekeeping === 'DIRTY' && (
              <Button className="w-full" disabled={busy} onClick={() => patchRoom(viewRoom, { housekeeping: 'CLEAN' })}>
                <BrushCleaning className="mr-2 h-4 w-4" /> Mark Clean
              </Button>
            )}
            {viewRoom && viewRoom.status !== 'OCCUPIED' && (
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  patchRoom(viewRoom, {
                    status: viewRoom.status === 'MAINTENANCE' ? 'VACANT' : 'MAINTENANCE',
                    housekeeping: 'CLEAN',
                  })
                }
              >
                <Wrench className="mr-2 h-4 w-4" />
                {viewRoom.status === 'MAINTENANCE' ? 'Mark as Vacant' : 'Mark Under Maintenance'}
              </Button>
            )}
            {viewRoom && (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="room-rate" className="text-xs">
                    Rate / night
                  </Label>
                  <Input
                    id="room-rate"
                    type="number"
                    defaultValue={viewRoom.rate}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v > 0 && v !== viewRoom.rate) patchRoom(viewRoom, { rate: v })
                    }}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={viewRoom.type} onValueChange={(t) => t !== viewRoom.type && patchRoom(viewRoom, { type: t })}>
                    <SelectTrigger aria-label="Room type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add room */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Add Room</DialogTitle>
            <DialogDescription>Room structure is modular — add more rooms anytime.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-num">Room Number</Label>
              <Input id="add-num" placeholder="e.g. 401" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-rate">Rate (₹/night)</Label>
                <Input id="add-rate" type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-cap">Capacity</Label>
              <Input id="add-cap" type="number" min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
            </div>
            <Button className="w-full" disabled={busy || !newNumber.trim()} onClick={addRoom}>
              Add Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
