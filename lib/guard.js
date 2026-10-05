import { PERMISSIONS } from './permissions.js';
import { getSessionUser } from './auth/session.js';
import { HttpError, errorResponse } from './http.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function checkMutationRequest(request) {
  const origin = request.headers.get('origin');

  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, 'BAD_ORIGIN', 'Cross-site request refused.');
  }

  const type = request.headers.get('content-type');

  if (type && !type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Use Content-Type: application/json.',
    );
  }
}

export function withGuard(routeKey, handler) {
  const rule = PERMISSIONS[routeKey];

  const valid =
    rule === 'public' ||
    rule === 'authenticated' ||
    Array.isArray(rule);

  if (!valid) {
    throw new Error(`No valid permission rule for "${routeKey}"`);
  }

  return async function guarded(request, ctx) {
    try {
      if (MUTATING.has(request.method)) {
        checkMutationRequest(request);
      }

      let user = null;

      if (rule !== 'public') {
        user = await getSessionUser(request);

        if (!user) {
          throw new HttpError(
            401,
            'UNAUTHENTICATED',
            'Please log in.',
          );
        }

        if (Array.isArray(rule) && !rule.includes(user.role)) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Your role may not do this.',
          );
        }
      }

      const params = ctx?.params ? await ctx.params : {};

      return await handler(request, { user, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}