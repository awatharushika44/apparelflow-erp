import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required').max(200),
});

// Whole numbers only.
// Strings like "50" and decimals like 94.5 are rejected.
const whole = (label, max) =>
  z
    .number({ error: `${label} must be a whole number` })
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`)
    .max(max, `${label} must be at most ${max}`);

// Zod drops keys that are not listed here.
// Therefore forged "status" or "createdBy" fields never reach the service.
export const createOrderSchema = z.object({
  recipeCode: z
    .string({ error: 'Recipe is required' })
    .trim()
    .min(1, 'Recipe is required')
    .max(50),

  targetQty: whole('Target quantity', 100000),

  fabricRollId: z
    .string({ error: 'Fabric roll ID is required' })
    .trim()
    .min(1, 'Fabric roll ID is required')
    .max(60),

  actualFabricYards: whole('Actual fabric yards', 1000000),
});
// Zod drops unknown keys, so a forged "status" inside a count never reaches the service.
export const saveCountsSchema = z.object({
  counts: z
    .array(
      z.object({
        componentId: z
          .string({ error: 'componentId is required' })
          .regex(/^\d{1,18}$/, 'componentId must be a numeric id'),

        actualQty: z
          .number({ error: 'Count must be a whole number' })
          .int('Count must be a whole number')
          .min(0, 'Count cannot be negative')
          .max(10000000, 'Count is too large'),
      }),
    )
    .min(1, 'Send at least one count')
    .max(50),
});
export const approveSchema = z.object({
  auditNote: z
    .string({ error: 'Note must be text' })
    .trim()
    .max(500, 'Note is too long (500 characters max)')
    .optional(),

  acknowledgedOverCap: z
    .boolean({
      error: 'acknowledgedOverCap must be true or false',
    })
    .optional(),
});
export const rejectSchema = z.object({
  rejectionNote: z
    .string({ error: 'A rejection note is required' })
    .trim()
    .min(1, 'A rejection note is required')
    .max(500, 'Note is too long (500 characters max)'),
});

export const resubmitSchema = z.object({
  fabricRollId: z
    .string({ error: 'Fabric roll ID must be text' })
    .trim()
    .min(1, 'Fabric roll ID cannot be empty')
    .max(60, 'Fabric roll ID is too long (60 characters max)')
    .optional(),

  actualFabricYards: z
    .number({ error: 'Fabric yards must be a whole number' })
    .int('Fabric yards must be a whole number')
    .positive('Fabric yards must be greater than zero')
    .max(1000000, 'Fabric yards is too large')
    .optional(),
});