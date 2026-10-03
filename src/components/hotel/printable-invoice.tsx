'use client'

import { formatINR, formatDate, formatDateTime } from '@/lib/hotel-utils'
import { Building2, Phone, MapPin, Receipt } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

export interface PrintableInvoiceProps {
  bill: {
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
    createdAt: string
    booking: {
      checkIn: string
      checkOut?: string | null
      actualCheckOut?: string | null
      days: number
      ratePerDay: number
      advance: number
      guest: {
        name: string
        phone: string
        company?: string | null
        gst?: string | null
      }
      room: {
        number: string
        type?: string
      }
    }
  }
  settings?: Record<string, string>
}

export function PrintableInvoice({ bill, settings = {} }: PrintableInvoiceProps) {
  if (!bill) return null

  const hotelName = settings.hotelName || 'Ashirbad Lodge'
  const hotelAddress = settings.hotelAddress || 'Station Road, Kolkata'
  const hotelPhone = settings.hotelPhone || '+91 90000 00000'
  const hotelGstin = settings.hotelGstin || ''

  const guest = bill.booking?.guest
  const room = bill.booking?.room
  const corporateName = bill.corporateName || guest?.company
  const gstNumber = bill.gstNumber || guest?.gst

  const paidTotal = (bill.payCash || 0) + (bill.payUpi || 0) + (bill.payCard || 0)
  const balance = Math.max(0, Math.round((bill.grandTotal - paidTotal) * 100) / 100)
  const roomRatePerNight = bill.days > 0 ? Math.round((bill.billedRoomTotal / bill.days) * 100) / 100 : bill.billedRoomTotal

  return (
    <div className="print-area w-full rounded-lg border border-slate-300 bg-white p-5 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <div className="mb-4 text-center">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{hotelName}</h2>
        {hotelAddress && <p className="text-xs text-slate-600 dark:text-slate-400">{hotelAddress}</p>}
        {hotelPhone && <p className="text-xs text-slate-600 dark:text-slate-400">Ph: {hotelPhone}</p>}
        {hotelGstin && <p className="text-xs font-medium text-slate-700 dark:text-slate-300">GSTIN: {hotelGstin}</p>}

        <div className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {bill.actualGst > 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">GST TAX INVOICE</span>
          ) : (
            <span>NON-GST INVOICE / CASH MEMO</span>
          )}
        </div>
      </div>

      <Separator className="my-3" />

      {/* Meta Grid */}
      <div className="mb-4 grid grid-cols-2 gap-4 text-xs">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Invoice No: {bill.billNumber}</p>
          <p className="text-slate-600 dark:text-slate-400">Date: {formatDateTime(bill.createdAt)}</p>
          <p className="text-slate-600 dark:text-slate-400">
            Room: <span className="font-semibold text-slate-900 dark:text-white">{room?.number || 'N/A'}</span> {room?.type ? `(${room.type})` : ''}
          </p>
          <p className="text-slate-600 dark:text-slate-400">
            Stay: {bill.days} night(s) • {formatDate(bill.booking?.checkIn)} → {formatDate(bill.booking?.actualCheckOut || bill.booking?.checkOut)}
          </p>
        </div>

        <div className="space-y-1 text-right">
          <p className="font-semibold text-slate-900 dark:text-white">Guest: {guest?.name || 'Guest'}</p>
          <p className="text-slate-600 dark:text-slate-400">Phone: {guest?.phone || 'N/A'}</p>
          {corporateName && (
            <p className="font-medium text-slate-800 dark:text-slate-200">
              Company: {corporateName}
            </p>
          )}
          {gstNumber && (
            <p className="font-medium text-slate-800 dark:text-slate-200">
              Guest GSTIN: {gstNumber}
            </p>
          )}
        </div>
      </div>

      <Separator className="my-3" />

      {/* Itemized charges table */}
      <div className="space-y-2 text-xs">
        <div className="flex justify-between py-1">
          <span className="text-slate-700 dark:text-slate-300">
            Room Charge ({bill.days} night{bill.days > 1 ? 's' : ''} @ {formatINR(roomRatePerNight)})
          </span>
          <span className="font-semibold">{formatINR(bill.billedRoomTotal)}</span>
        </div>

        {bill.foodTotal > 0 && (
          <div className="flex justify-between py-1">
            <span className="text-slate-700 dark:text-slate-300">Food / Restaurant Charges</span>
            <span className="font-semibold">{formatINR(bill.foodTotal)}</span>
          </div>
        )}

        {bill.extraCharges > 0 && (
          <div className="flex justify-between py-1">
            <span className="text-slate-700 dark:text-slate-300">Extra Charges</span>
            <span className="font-semibold">{formatINR(bill.extraCharges)}</span>
          </div>
        )}

        {bill.discount > 0 && (
          <div className="flex justify-between py-1 text-emerald-700 dark:text-emerald-400">
            <span>Discount</span>
            <span className="font-semibold">-{formatINR(bill.discount)}</span>
          </div>
        )}

        {bill.actualGst > 0 && (
          <div className="flex justify-between py-1 font-medium text-slate-800 dark:text-slate-200">
            <span>GST ({bill.gstPercent}%)</span>
            <span className="font-semibold">{formatINR(bill.actualGst)}</span>
          </div>
        )}

        {bill.advanceApplied > 0 && (
          <div className="flex justify-between py-1 text-emerald-700 dark:text-emerald-400">
            <span>Advance Adjusted</span>
            <span className="font-semibold">-{formatINR(bill.advanceApplied)}</span>
          </div>
        )}

        <Separator className="my-2" />

        <div className="flex justify-between py-1 text-sm font-bold text-slate-900 dark:text-white">
          <span>Grand Total Payable</span>
          <span className="text-emerald-700 dark:text-emerald-400">{formatINR(bill.grandTotal)}</span>
        </div>

        {/* Payments breakdown */}
        <div className="mt-3 rounded bg-slate-50 p-2 text-[11px] space-y-0.5 dark:bg-slate-900">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Paid via Cash</span>
            <span>{formatINR(bill.payCash)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Paid via UPI</span>
            <span>{formatINR(bill.payUpi)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Paid via Card</span>
            <span>{formatINR(bill.payCard)}</span>
          </div>

          {balance > 0.01 ? (
            <div className="flex justify-between font-bold text-red-600 dark:text-red-400 pt-1">
              <span>Outstanding Balance Due</span>
              <span>{formatINR(balance)}</span>
            </div>
          ) : (
            <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-400 pt-1">
              <span>Payment Status</span>
              <span>Fully Paid ✓</span>
            </div>
          )}
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Thank you for staying with us! Please visit again.
      </p>
    </div>
  )
}
