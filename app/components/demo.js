// Public demo accounts (same as db/demo-data.mjs). The PDF requires them in the README too.
export const DEMO_ACCOUNTS = [
  {
    role: 'cutting_supervisor',
    label: 'Cutting Supervisor',
    duty: 'Creates cutting orders and logs fabric used.',
    email: 'supervisor@apparelflow.demo',
    password: 'Cutting@2026',
  },
  {
    role: 'cutting_verifier',
    label: 'Cutting Verifier',
    duty: 'Counts every part. Approves or rejects the batch.',
    email: 'verifier@apparelflow.demo',
    password: 'Verify@2026',
  },
  {
    role: 'sewing_supervisor',
    label: 'Sewing Supervisor',
    duty: 'Receives only verified batches and starts assembly.',
    email: 'sewing@apparelflow.demo',
    password: 'Sewing@2026',
  },
];