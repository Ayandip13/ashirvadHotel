import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed 30 rooms only if empty
  const roomCount = await prisma.room.count()
  if (roomCount === 0) {
    const roomData: { number: string; type: string; capacity: number; rate: number }[] = []
    // Floors 1-3, rooms 101-110, 201-210, 301-310
    for (let floor = 1; floor <= 3; floor++) {
      for (let i = 1; i <= 10; i++) {
        const num = `${floor}${String(i).padStart(2, '0')}`
        let type = 'Non-AC'
        let rate = 800
        let capacity = 2
        if (i >= 9) {
          type = 'Deluxe AC'
          rate = 1500
          capacity = 3
        } else if (i >= 6) {
          type = 'AC'
          rate = 1200
          capacity = 2
        }
        roomData.push({ number: num, type, capacity, rate })
      }
    }
    await prisma.room.createMany({ data: roomData })
    console.log(`Seeded ${roomData.length} rooms`)
  }

  // Seed menu items only if empty
  const menuCount = await prisma.menuItem.count()
  if (menuCount === 0) {
    const menu = [
      { name: 'Rice (Plate)', category: 'Rice & Bread', price: 60 },
      { name: 'Roti', category: 'Rice & Bread', price: 12 },
      { name: 'Paratha', category: 'Rice & Bread', price: 25 },
      { name: 'Dal (Bowl)', category: 'Main Course', price: 50 },
      { name: 'Chicken Curry', category: 'Main Course', price: 160 },
      { name: 'Fish Curry (Katla)', category: 'Main Course', price: 140 },
      { name: 'Mutton Kosha', category: 'Main Course', price: 220 },
      { name: 'Egg Curry', category: 'Main Course', price: 80 },
      { name: 'Paneer Butter Masala', category: 'Main Course', price: 170 },
      { name: 'Mixed Veg', category: 'Main Course', price: 110 },
      { name: 'Chicken Fried Rice', category: 'Main Course', price: 130 },
      { name: 'Omelette', category: 'Breakfast', price: 40 },
      { name: 'Bread Butter', category: 'Breakfast', price: 50 },
      { name: 'Poha', category: 'Breakfast', price: 40 },
      { name: 'Puri Sabji', category: 'Breakfast', price: 60 },
      { name: 'Samosa', category: 'Snacks', price: 20 },
      { name: 'French Fries', category: 'Snacks', price: 90 },
      { name: 'Chicken Pakora', category: 'Snacks', price: 110 },
      { name: 'Tea', category: 'Beverages', price: 15 },
      { name: 'Coffee', category: 'Beverages', price: 30 },
      { name: 'Cold Drink (250ml)', category: 'Beverages', price: 25 },
      { name: 'Mineral Water (1L)', category: 'Beverages', price: 20 },
    ]
    await prisma.menuItem.createMany({ data: menu })
    console.log(`Seeded ${menu.length} menu items`)
  }

  // Seed staff only if empty
  const staffCount = await prisma.staff.count()
  if (staffCount === 0) {
    await prisma.staff.createMany({
      data: [
        { name: 'Ramesh Das', role: 'Manager', salary: 18000, phone: '9830011122' },
        { name: 'Sunita Halder', role: 'Reception', salary: 9000, phone: '9830033344' },
        { name: 'Mohan Roy', role: 'Housekeeping', salary: 7000 },
        { name: 'Sabitri Mardi', role: 'Housekeeping', salary: 7000 },
        { name: 'Chef Abdul Karim', role: 'Chef', salary: 14000, phone: '9830055566' },
        { name: 'Bikram Singh', role: 'Guard', salary: 8000 },
      ],
    })
    console.log('Seeded 6 staff members')
  }

  // Seed a couple of guests for demo auto-fill (only if empty)
  const guestCount = await prisma.guest.count()
  if (guestCount === 0) {
    await prisma.guest.createMany({
      data: [
        { phone: '9123456780', name: 'Arun Kumar Sharma', company: 'Sharma Traders Pvt Ltd', gst: '19AABCS1429B1ZX' },
        { phone: '9123456781', name: 'Priya Sen', company: 'Sen Enterprises', gst: '19AACFS8291K1Z2' },
      ],
    })
    console.log('Seeded demo guests')
  }

  // Seed app users (role-based permissions) only if empty
  const userCount = await prisma.user.count()
  if (userCount === 0) {
    await prisma.user.createMany({
      data: [
        { name: 'Admin', role: 'ADMIN', pin: '1111' },
        { name: 'Manager', role: 'MANAGER', pin: '2222' },
        { name: 'Reception', role: 'RECEPTION', pin: '3333' },
      ],
    })
    console.log('Seeded 3 app users (Admin/1111, Manager/2222, Reception/3333)')
  }

  // Seed settings only if empty
  const settingCount = await prisma.setting.count()
  if (settingCount === 0) {
    const settings = [
      { key: 'hotelName', value: 'Grand Hotel' },
      { key: 'hotelAddress', value: 'Station Road, Kolkata' },
      { key: 'hotelPhone', value: '+91 90000 00000' },
      { key: 'hotelGstin', value: '' },
      { key: 'gstPercent', value: '12' },
      { key: 'invoicePrefix', value: 'INV' },
      { key: 'invoiceCounter', value: '1' },
    ]
    await prisma.setting.createMany({ data: settings })
    console.log('Seeded settings')
  }

  // Seed expense categories only if empty
  const catCount = await prisma.expenseCategory.count()
  if (catCount === 0) {
    await prisma.expenseCategory.createMany({
      data: [
        { name: 'Salary' },
        { name: 'Staff Advance' },
        { name: 'Groceries / Purchase' },
        { name: 'Utilities (EB/Water)' },
        { name: 'Repairs & Maintenance' },
        { name: 'Housekeeping Supplies' },
        { name: 'Transport' },
        { name: 'Marketing' },
        { name: 'Petty Cash' },
        { name: 'Other' },
      ],
    })
    console.log('Seeded 10 expense categories')
  }

  console.log('Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
