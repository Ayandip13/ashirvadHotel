import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting test data cleanup...')
  
  // 1. OrderItem & FoodOrder
  const deletedOrderItems = await prisma.orderItem.deleteMany({})
  console.log(`Deleted ${deletedOrderItems.count} OrderItem records.`)
  
  const deletedFoodOrders = await prisma.foodOrder.deleteMany({})
  console.log(`Deleted ${deletedFoodOrders.count} FoodOrder records.`)

  // 2. Bill
  const deletedBills = await prisma.bill.deleteMany({})
  console.log(`Deleted ${deletedBills.count} Bill records.`)

  // 3. LedgerEntry
  const deletedLedger = await prisma.ledgerEntry.deleteMany({})
  console.log(`Deleted ${deletedLedger.count} LedgerEntry records.`)

  // 4. Booking
  const deletedBookings = await prisma.booking.deleteMany({})
  console.log(`Deleted ${deletedBookings.count} Booking records.`)

  // 5. Guest
  const deletedGuests = await prisma.guest.deleteMany({})
  console.log(`Deleted ${deletedGuests.count} Guest records.`)

  // 6. Room
  const deletedRooms = await prisma.room.deleteMany({})
  console.log(`Deleted ${deletedRooms.count} Room records.`)

  // 7. StaffPayment
  const deletedStaffPayments = await prisma.staffPayment.deleteMany({})
  console.log(`Deleted ${deletedStaffPayments.count} StaffPayment records.`)

  // 8. AuditLog
  const deletedAuditLogs = await prisma.auditLog.deleteMany({})
  console.log(`Deleted ${deletedAuditLogs.count} AuditLog records.`)

  // Reset invoice counter setting back to 1
  await prisma.setting.upsert({
    where: { key: 'invoiceCounter' },
    update: { value: '1' },
    create: { key: 'invoiceCounter', value: '1' },
  })

  console.log('Test data successfully wiped! All revenue, rooms, bookings and bills are cleared.')
}

main()
  .catch((e) => {
    console.error('Error wiping test data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
