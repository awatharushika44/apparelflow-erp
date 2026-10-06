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