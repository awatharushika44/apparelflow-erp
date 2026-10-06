export const PERMISSIONS = {

  'GET /api/health': 'public',

  'POST /api/auth/login': 'public',

  'POST /api/auth/logout': 'authenticated',

  'GET /api/auth/me': 'authenticated',

  'GET /api/recipes': ['cutting_supervisor', 'cutting_verifier'],

  'POST /api/orders': ['cutting_supervisor'],

  'GET /api/orders': ['cutting_supervisor'],

  'POST /api/orders/[id]/submit': ['cutting_supervisor'],
  'GET /api/verification/orders': ['cutting_verifier'],
  'GET /api/verification/orders/[id]': ['cutting_verifier'],
  'PUT /api/verification/orders/[id]/counts': ['cutting_verifier'],
  'POST /api/verification/orders/[id]/approve': ['cutting_verifier'],
};