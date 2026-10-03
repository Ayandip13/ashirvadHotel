import { z } from 'zod'

export const GenerateBillSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  billedRoomTotal: z.number().nonnegative().optional(),
  gstPercent: z.number().nonnegative().optional(),
  extraCharges: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  payCash: z.number().nonnegative().optional(),
  payUpi: z.number().nonnegative().optional(),
  payCard: z.number().nonnegative().optional(),
  isCorporate: z.boolean().optional(),
  corporateName: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type GenerateBillInput = z.infer<typeof GenerateBillSchema>
