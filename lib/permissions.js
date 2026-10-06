export const PERMISSIONS = {
  'GET /api/health': 'public',

  'POST /api/auth/login': 'public',

  'POST /api/auth/logout': 'authenticated',

  'GET /api/auth/me': 'authenticated',

  'GET /api/recipes': ['cutting_supervisor', 'cutting_verifier'],

  'POST /api/orders': ['cutting_supervisor'],
  
};