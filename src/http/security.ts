import { createHash, randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { HRManager, Learner, Mentor, UserRole } from '../domain/index.ts';
import type { SkillTreeRepository } from '../repositories/SkillTreeRepository.ts';
import { ForbiddenError, TooManyRequestsError, UnauthorizedError } from './errors.ts';

export const SESSION_COOKIE_NAME = 'skilltree_sid';

export type AppVariables = {
  user: Learner | Mentor | HRManager | null;
  sessionId: string | null;
};

export type AppEnv = {
  Variables: AppVariables;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseDeviceLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  let browser = 'Вебклієнт';
  if (ua.includes('edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('chrome/')) browser = 'Google Chrome';
  else if (ua.includes('firefox/')) browser = 'Mozilla Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('node')) browser = 'Node.js HTTP Client';

  let os = '';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';

  return os ? `${browser} • ${os}` : browser;
}

export function getClientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header('x-real-ip')?.trim();
  return realIp || '127.0.0.1';
}

function isSecureRequest(c: Context): boolean {
  const proto = c.req.header('x-forwarded-proto');
  if (proto) {
    return proto.split(',')[0]?.trim().toLowerCase() === 'https';
  }
  return c.req.url.startsWith('https://');
}

export function setSessionCookie(c: Context, rawToken: string, rememberMe: boolean): void {
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isSecureRequest(c),
    maxAge: rememberMe ? 7 * 86_400 : 86_400,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
  });
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const securityHeadersMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('Content-Security-Policy', CSP_DIRECTIVES);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  if (isSecureRequest(c)) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};

function getExpectedHost(c: Context): string {
  const fwdHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = fwdHost || c.req.header('host')?.trim();
  if (host) return host.toLowerCase();
  try {
    return new URL(c.req.url).host.toLowerCase();
  } catch {
    return '';
  }
}

export const csrfGuardMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  const isStateChanging =
    method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (isStateChanging && c.req.path.startsWith('/api/')) {
    const expectedHost = getExpectedHost(c);
    const origin = c.req.header('origin');

    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        throw new ForbiddenError('Запит відхилено системою безпеки.');
      }
      if (expectedHost && originHost !== expectedHost) {
        throw new ForbiddenError('Запит відхилено системою безпеки.');
      }
    } else {
      const referer = c.req.header('referer');
      if (referer) {
        let refHost = '';
        try {
          refHost = new URL(referer).host.toLowerCase();
        } catch {
          throw new ForbiddenError('Запит відхилено системою безпеки.');
        }
        if (expectedHost && refHost !== expectedHost) {
          throw new ForbiddenError('Запит відхилено системою безпеки.');
        }
      }
    }

    const xRequestedWith = c.req.header('x-requested-with');
    const contentType = (c.req.header('content-type') ?? '').toLowerCase();
    const hasCustomHeader = xRequestedWith === 'SkillTreeUI';
    const hasJsonContentType = contentType.includes('application/json');

    if (!hasCustomHeader && !hasJsonContentType) {
      throw new ForbiddenError('Запит відхилено системою безпеки.');
    }
  }

  await next();
};

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  enabled?: boolean;
}

export function createRateLimiter(options: RateLimiterOptions = {}): MiddlewareHandler<AppEnv> {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 180;
  const enabled = options.enabled ?? true;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    if (!enabled || !c.req.path.startsWith('/api/')) {
      await next();
      return;
    }

    const now = Date.now();
    if (buckets.size > 2000) {
      for (const [k, v] of buckets.entries()) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    const key = getClientIp(c);
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (current.count >= maxRequests) {
      const retrySec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      c.header('Retry-After', String(retrySec));
      throw new TooManyRequestsError(
        `Перевищено ліміт запитів. Повторіть через ${retrySec} с.`,
        retrySec
      );
    }

    current.count += 1;
    await next();
  };
}

export function createAttachSession(repo: SkillTreeRepository): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const rawToken = getCookie(c, SESSION_COOKIE_NAME);
    if (!rawToken) {
      c.set('user', null);
      c.set('sessionId', null);
      await next();
      return;
    }

    const found = await repo.findActiveSessionByTokenHash(hashSessionToken(rawToken));
    if (!found) {
      clearSessionCookie(c);
      c.set('user', null);
      c.set('sessionId', null);
    } else {
      c.set('user', found.user);
      c.set('sessionId', String(found.session.id));
    }

    await next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) {
    throw new UnauthorizedError('Для виконання цієї дії необхідно увійти в акаунт.');
  }
  await next();
};

export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new UnauthorizedError('Для виконання цієї дії необхідно увійти в акаунт.');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenError(
        `Доступ дозволено лише для ролей: ${roles.join(', ')}. Ваша роль: ${user.role}.`
      );
    }
    await next();
  };
}
