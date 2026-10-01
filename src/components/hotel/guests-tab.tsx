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
import { PaymentStatusBadge } from './status-badge'
import { TableControls, SortableTh, useSort, usePagination } from './table-controls'
import { api, apiAs, formatINR, formatDate, exportCSV } from '@/lib/hotel-utils'
import { getCachedUser } from './user-context'
import { Loader2, History, Pencil } from 'lucide-react'

interface Booking {
  id: string
  checkIn: string
  checkOut?: string | null
  days: number
  ratePerDay: number
  status: string
  paymentStatus: string
  room: { number: string }
}

interface GuestRow {
  id: string
  phone: string
  name: string
  company?: string | null
  gst?: string | null
  address?: string | null
  createdAt: string
  bookings: Booking[]
}

interface TabProps {
  refreshKey: number
  onDataChanged: () => void
  initialFilter?: string
}

export function GuestsTab({ refreshKey, initialFilter }: TabProps) {
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [viewGuest, setViewGuest] = useState<GuestRow | null>(null)
  const [editGuest, setEditGuest] = useState<GuestRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editGst, setEditGst] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialFilter) setSearch(initialFilter)
  }, [initialFilter])

  const load = useCallback(async () => {
    try {
      setGuests(await api<GuestRow[]>('/api/guests'))
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
    if (!q) return guests
    return guests.filter((g) =>
      `${g.name} ${g.phone} ${g.company || ''} ${g.gst || ''}`.toLowerCase().includes(q)
    )
  }, [guests, search])

  const { sorted, sort, toggle } = useSort<Record<string, unknown>>(filtered as unknown as Record<string, unknown>[], 'createdAt')
  const { paged, controls } = usePagination(sorted as unknown as GuestRow[], 10)

  function doExport() {
    exportCSV(
      'guests.csv',
      ['Name', 'Phone', 'Company', 'GST', 'Address', 'Total Stays', 'First Seen'],
      (filtered as unknown as GuestRow[]).map((g) => [
        g.name, g.phone, g.company || '', g.gst || '', g.address || '', g.bookings.length, formatDate(g.createdAt),
      ])
    )
  }

  function openEdit(g: GuestRow) {
    setEditGuest(g)
    setEditName(g.name)
    setEditCompany(g.company || '')
    setEditGst(g.gst || '')
    setEditAddress(g.address || '')
  }

  async function saveEdit() {
    if (!editGuest) return
    setBusy(true)
    try {
      await apiAs('/api/guests', getCachedUser(), {
        method: 'POST',
        body: JSON.stringify({
          phone: editGuest.phone,
          name: editName,
          company: editCompany || undefined,
          gst: editGst || undefined,
          address: editAddress || undefined,
        }),
      })
      setEditGuest(null)
      await load()
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

  const returningGuests = guests.filter((g) => g.bookings.length > 1).length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Guests</h2>
        <p className="text-xs text-muted-foreground">
          {guests.length} guests saved · {returningGuests} returning · phone auto-fill active at check-in
        </p>
      </div>

      <TableControls
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Name, phone, company, GST…"
        onReset={() => setSearch('')}
        onExport={doExport}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTh label="Name" sortKey="name" sort={sort} onToggle={toggle} />
              <TableHead>Phone</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>GST</TableHead>
              <SortableTh label="Stays" sortKey="bookings" sort={sort} onToggle={toggle} className="text-center" />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(paged as unknown as GuestRow[]).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No guests found.
                </TableCell>
              </TableRow>
            )}
            {(paged as unknown as GuestRow[]).map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">
                  {g.name}
                  {g.bookings.length > 1 && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      returning
                    </span>
                  )}
                </TableCell>
                <TableCell>{g.phone}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.company || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.gst || '—'}</TableCell>
                <TableCell className="text-center">{g.bookings.length}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setViewGuest(g)}
                    >
                      <History className="h-3 w-3" /> History
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(g)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {controls}

      {/* History dialog */}
      <Dialog open={!!viewGuest} onOpenChange={(o) => !o && setViewGuest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewGuest?.name}</DialogTitle>
            <DialogDescription>
              {viewGuest?.phone}
              {viewGuest?.company ? ` · ${viewGuest.company}` : ''}
              {viewGuest?.gst ? ` · GST ${viewGuest.gst}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(viewGuest?.bookings.length || 0) === 0 && (
              <p className="text-sm text-muted-foreground">No stays recorded yet.</p>
            )}
            {viewGuest?.bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    Room {b.room.number} · {b.days} night{b.days > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">{b.status}</div>
                  <PaymentStatusBadge status={b.paymentStatus} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editGuest} onOpenChange={(o) => !o && setEditGuest(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Guest Profile</DialogTitle>
            <DialogDescription>Phone {editGuest?.phone} — used for auto-fill on next visit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-name">Name</Label>
              <Input id="g-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-company">Company</Label>
              <Input id="g-company" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-gst">GST Number</Label>
              <Input id="g-gst" value={editGst} onChange={(e) => setEditGst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-addr">Address</Label>
              <Input id="g-addr" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
            <Button className="w-full" disabled={busy || !editName.trim()} onClick={saveEdit}>
              Save Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
