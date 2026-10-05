// Single source of truth for demo data. The seed and the seed check both import this,
// and the README demo-credentials table is copied from DEMO_USERS.
// These passwords are PUBLIC demo credentials. Never reuse a real password here.

export const DEMO_USERS = [
  { email: 'supervisor@apparelflow.demo', password: 'Cutting@2026', role: 'cutting_supervisor', name: 'Demo Cutting Supervisor' },
  { email: 'verifier@apparelflow.demo',   password: 'Verify@2026',  role: 'cutting_verifier',   name: 'Demo Cutting Verifier' },
  { email: 'sewing@apparelflow.demo',     password: 'Sewing@2026',  role: 'sewing_supervisor',  name: 'Demo Sewing Supervisor' },
];

// PDF section 7.1, exactly.
export const RECIPES = [
  {
    code: 'REC-BL01', name: 'Casual Blouse', category: 'Blouse', yards: '1.8', cap: '5.0',
    components: [
      ['Front Body Panel', 1],
      ['Back Body Panel', 1],
      ['Sleeves (Left & Right)', 2],
      ['Collar & Stand', 1],
      ['Sleeve Cuffs', 2],
    ],
  },
  {
    code: 'REC-CT02', name: 'Crop Top', category: 'Crop Top', yards: '1.1', cap: '8.0',
    components: [
      ['Front Chest Panel', 1],
      ['Back Support Panel', 1],
      ['Neck Binding Strip', 1],
      ['Hem Elastic Casing', 1],
      ['Side Strap Accents', 2],
    ],
  },
];

// counts follow the recipe's component order. No counts means "not counted yet".
export const ORDERS = [
  { recipe: 'REC-BL01', qty: 50, roll: 'FAB-ROLL-882', yds: 94, state: 'CUTTING_IN_PROGRESS' },
  { recipe: 'REC-CT02', qty: 40, roll: 'FAB-ROLL-901', yds: 46, state: 'PENDING_VERIFICATION' },
  { recipe: 'REC-BL01', qty: 30, roll: 'FAB-ROLL-903', yds: 55, state: 'PENDING_VERIFICATION', counts: [30, 30, 58, 30, 61] },
  { recipe: 'REC-BL01', qty: 20, roll: 'FAB-ROLL-904', yds: 37, state: 'PENDING_VERIFICATION' },
  { recipe: 'REC-CT02', qty: 60, roll: 'FAB-ROLL-905', yds: 68, state: 'VERIFIED',
    counts: [60, 60, 60, 60, 121], note: 'All bundles counted twice. One surplus strap returned to store.' },
  { recipe: 'REC-BL01', qty: 40, roll: 'FAB-ROLL-906', yds: 75, state: 'REJECTED',
    counts: [40, 40, 77, 40, 80], reason: 'Sleeves short by 3 pieces. Re-cut required.' },
  { recipe: 'REC-BL01', qty: 25, roll: 'FAB-ROLL-907', yds: 46, state: 'SEWING_STARTED',
    counts: [25, 25, 50, 25, 50], note: 'Counts matched the cut sheet.' },
  { recipe: 'REC-BL01', qty: 35, roll: 'FAB-ROLL-908', yds: 63, state: 'VERIFIED',
    counts: [35, 35, 70, 35, 70] },
];