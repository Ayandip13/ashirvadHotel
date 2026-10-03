/**
 * API-level E2E test for the PRD-aligned hotel management update.
 * Run: bun scripts/e2e-test.ts
 */
const BASE = process.env.E2E_BASE || 'http://localhost:3000'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.log(`  ✗ FAIL: ${name} ${detail}`)
  }
}

async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function main() {
  console.log('=== 1. AUTH & PERMISSIONS ===')
  const users = (await req('GET', '/api/users')).data as { id: string; name: string; role: string }[]
  const admin = users.find((u) => u.role === 'ADMIN')!
  const reception = users.find((u) => u.role === 'RECEPTION')!
  const auth = await req('POST', '/api/auth', { userId: admin.id, pin: '1111' })
  check('admin login with pin 1111', auth.status === 200)
  const badAuth = await req('POST', '/api/auth', { userId: admin.id, pin: '0000' })
  check('wrong pin rejected', badAuth.status === 401)

  const H = { 'X-User-Id': admin.id, 'X-User-Name': 'Admin', 'X-User-Role': 'ADMIN' }
  const HR = { 'X-User-Id': reception.id, 'X-User-Name': 'Reception', 'X-User-Role': 'RECEPTION' }

  console.log('=== 2. CHECK-IN WITH AUTO-FILL ===')
  const rooms = (await req('GET', '/api/rooms')).data as { id: string; number: string; rate: number; status: string }[]
  const room = rooms.find((r) => r.status === 'VACANT')!
  // guest 9123456780 was seeded with company + GST — auto-fill source
  const checkin = await req(
    'POST',
    '/api/bookings',
    {
      roomId: room.id,
      phone: '9123456780',
      name: 'Arun Kumar Sharma',
      company: 'Sharma Traders Pvt Ltd',
      gst: '19AABCS1429B1ZX',
      // EXACTLY what the UI Check-In dialog sends (full ISO datetime) —
      // regression guard: server must parse datetime strings, not append 'T12:00:00'
      checkIn: new Date().toISOString(),
      checkOut: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      advance: '200',
      advanceMethod: 'CASH',
      guestCount: 2,
    },
    HR
  )
  check('check-in succeeds (reception user)', checkin.status === 200)
  const bookingId = (checkin.data as { id: string }).id
  const rooms2 = (await req('GET', '/api/rooms')).data as { id: string; number: string; status: string }[]
  check('room now OCCUPIED', rooms2.find((r) => r.id === room.id)!.status === 'OCCUPIED')

  console.log('=== 3. DOUBLE-BOOKING PREVENTION ===')
  const dbl = await req('POST', '/api/bookings', { roomId: room.id, phone: '9999999999', name: 'Other Guest' }, HR)
  check('double booking blocked', dbl.status === 400, JSON.stringify(dbl.data))
  const badDate = await req(
    'POST',
    '/api/bookings',
    { roomId: room.id, phone: '9999999999', name: 'Bad Date Guest', checkIn: 'not-a-date' },
    HR
  )
  check('invalid checkIn date → clean 400 (no Prisma crash)', badDate.status === 400, JSON.stringify(badDate.data))

  console.log('=== 4. FOOD ORDER TO ROOM ===')
  const menu = (await req('GET', '/api/menu')).data as { id: string; name: string; price: number }[]
  const chicken = menu.find((m) => m.name === 'Chicken Curry')!
  const order = await req(
    'POST',
    '/api/orders',
    { bookingId, roomId: room.id, items: [{ menuItemId: chicken.id, name: chicken.name, price: chicken.price, quantity: 2 }] },
    HR
  )
  check('food order created (320 expected)', order.status === 200 && (order.data as { total: number }).total === 320)
  check('order has createdBy', (order.data as { createdBy: string }).createdBy === 'Reception')

  console.log('=== 5. CUSTOM CORPORATE BILL (PERMISSION CONTROL) ===')
  // 5a: reception tries custom billing WITHOUT pin → must be blocked
  const blocked = await req(
    'POST',
    '/api/bills',
    { bookingId, billedRoomTotal: 1500, gstPercent: 12, payCash: 1800.4, checkout: false },
    HR
  )
  check('custom billing blocked without manager PIN', blocked.status === 403, JSON.stringify(blocked.data))

  // 5b: admin creates custom bill with pin
  // actual room 800x1 = 800, billed 1500, food 320, GST 12% on (1500+320)=218.4 → grand 2038.4
  // advance 200 applied → payable 1838.4; pay cash 1838.4
  const bill = await req(
    'POST',
    '/api/bills',
    {
      bookingId,
      billedRoomTotal: 1500,
      gstPercent: 12,
      payCash: 1838.4,
      managerPin: '1111',
      corporateName: 'Sharma Traders Pvt Ltd',
      checkout: false,
    },
    H
  )
  check('custom bill created by admin+pin', bill.status === 200, JSON.stringify(bill.data))
  const billData = bill.data as {
    id: string
    billNumber: string
    actualRoomTotal: number
    billedRoomTotal: number
    actualGst: number
    foodTotal: number
    advanceApplied: number
    grandTotal: number
    approvedBy: string
  }
  check('billNumber from settings (INV-0001)', billData.billNumber === 'INV-0001', billData.billNumber)
  check('actual room total = 800 (internal)', billData.actualRoomTotal === 800)
  check('billed room total = 1500 (customer)', billData.billedRoomTotal === 1500)
  check('GST on billed amount = 218.4', Math.abs(billData.actualGst - 218.4) < 0.01, String(billData.actualGst))
  check('advance applied = 200', billData.advanceApplied === 200)
  check('grand total = 1838.4', Math.abs(billData.grandTotal - 1838.4) < 0.01, String(billData.grandTotal))
  check('approvedBy recorded', billData.approvedBy === 'Admin')

  // 5c: ledger must credit ONLY actual tariff + food + billed GST
  const ledger = (await req('GET', '/api/ledger')).data as { entries: { category: string; amount: number; description: string; refId: string }[] }
  const billEntries = ledger.entries.filter((e) => e.refId === billData.id)
  const rent = billEntries.find((e) => e.category === 'ROOM_RENT')
  const food = billEntries.find((e) => e.category === 'FOOD')
  const gst = billEntries.find((e) => e.category === 'GST')
  check('ledger credits actual rent 800 (NOT 1500)', !!rent && rent.amount === 800, rent ? String(rent.amount) : 'missing')
  check('ledger credits food 320', !!food && food.amount === 320)
  check('ledger credits billed GST 218.4', !!gst && Math.abs(gst.amount - 218.4) < 0.01)
  const totalCredited = billEntries.reduce((s, e) => s + e.amount, 0)
  check('no off-book corruption (rent+food+gst = 1338.4)', Math.abs(totalCredited - 1338.4) < 0.01, String(totalCredited))

  console.log('=== 6. AUDIT TRAIL ===')
  const audit = (await req('GET', '/api/audit')).data as { action: string; userName: string; details: string }[]
  const customEntry = audit.find((a) => a.action === 'CUSTOM_BILL')
  check('CUSTOM_BILL audit exists with who+details', !!customEntry && customEntry.userName === 'Admin' && (customEntry.details || '').includes('1500'))

  console.log('=== 7. OUTSTANDING + PARTIAL PAYMENT ===')
  // checkout the guest manually now
  const co = await req('PATCH', '/api/bookings', { id: bookingId, action: 'checkout' }, H)
  check('manual checkout ok', co.status === 200)
  const rooms3 = (await req('GET', '/api/rooms')).data as { id: string; status: string; housekeeping: string }[]
  check('room VACANT + DIRTY after checkout', rooms3.find((r) => r.id === room.id)!.status === 'VACANT' && rooms3.find((r) => r.id === room.id)!.housekeeping === 'DIRTY')

  console.log('=== 8. HOUSEKEEPING ===')
  const cleanRes = await req('PATCH', '/api/rooms', { id: room.id, housekeeping: 'CLEAN' }, H)
  check('mark room clean', cleanRes.status === 200 && (cleanRes.data as { housekeeping: string }).housekeeping === 'CLEAN')

  console.log('=== 9. STATS DASHBOARD ===')
  const stats = (await req('GET', '/api/stats')).data as { outstanding: number; arrivals: unknown[]; departures: unknown[]; todayCash: number }
  check('stats include arrivals/departures', Array.isArray(stats.arrivals) && Array.isArray(stats.departures))

  console.log('=== 10. REPORTS ===')
  const today = new Date().toISOString().slice(0, 10)
  const rep = (await req('GET', `/api/reports?from=${today}&to=${today}`)).data as {
    occupancy: { roomNightsSold: number }
    collections: { cash: number }
    revenue: { actualRoomRevenue: number }
    invoices: { count: number; customCount: number }
    staff: { salaryTotal: number }
    outstanding: { total: number }
  }
  check('reports roomNightsSold >= 1', rep.occupancy.roomNightsSold >= 1)
  check('reports actual revenue includes 800', rep.revenue.actualRoomRevenue >= 800)
  check('reports invoice count >= 1 with custom', rep.invoices.count >= 1 && rep.invoices.customCount >= 1)
  check('reports cash collections > 0', rep.collections.cash > 0)

  console.log('=== 11. SEARCH ===')
  const search = (await req('GET', '/api/search?q=INV-0001')).data as { bills: unknown[] }
  check('global search finds invoice', (search.bills || []).length === 1)
  const search2 = (await req('GET', '/api/search?q=9123456780')).data as { guests: unknown[] }
  check('global search finds guest by phone', (search2.guests || []).length === 1)

  console.log('=== 12. SETTINGS ===')
  const settings = (await req('GET', '/api/settings')).data as Record<string, string>
  check('settings GST percent = 12', settings.gstPercent === '12')
  const settingsSave = await req('PATCH', '/api/settings', { hotelName: 'Ashirbad Hotel Test' }, H)
  check('settings update works', settingsSave.status === 200 && (settingsSave.data as { hotelName: string }).hotelName === 'Ashirbad Hotel Test')
  // restore
  await req('PATCH', '/api/settings', { hotelName: 'Ashirbad Hotel' }, H)

  console.log(failures === 0 ? '\n✅ ALL TESTS PASSED' : `\n❌ ${failures} TEST(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Test crashed:', e)
  process.exit(1)
})
