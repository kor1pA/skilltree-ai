import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import type { SkillTreeRepository } from './repositories/SkillTreeRepository.ts';
import { mapErrorToHttp, NotFoundError, TooManyRequestsError } from './http/errors.ts';
import {
  type AppEnv,
  createAttachSession,
  createRateLimiter,
  csrfGuardMiddleware,
  securityHeadersMiddleware,
} from './http/security.ts';
import { createAuthRoutes } from './routes/authRoutes.ts';
import { createTreeRoutes } from './routes/treeRoutes.ts';
import { createMentorRoutes } from './routes/mentorRoutes.ts';
import { createB2bRoutes } from './routes/b2bRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SPA_ROUTES = new Set([
  '/',
  '/roadmap',
  '/mentors',
  '/mentor-cabinet',
  '/b2b',
  '/profile',
  '/auth',
  '/login',
]);

function resolvePublicDir(): string {
  const candidates = [
    resolve(__dirname, '..', 'public'),
    resolve(process.cwd(), 'public'),
    resolve(__dirname, 'public'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return dir;
    }
  }
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  return candidates[0];
}

export interface CreateAppOptions {
  disableRateLimit?: boolean;
  publicDir?: string;
}

export function createApp(
  repo: SkillTreeRepository,
  options: CreateAppOptions = {}
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const publicDir = resolve(options.publicDir ?? resolvePublicDir());

  app.use('*', compress());
  app.use('*', securityHeadersMiddleware);
  app.use('/api/*', createRateLimiter({ enabled: !options.disableRateLimit }));
  app.use('/api/*', csrfGuardMiddleware);
  app.use('/api/*', createAttachSession(repo));

  app.onError((err, c) => {
    const httpErr = mapErrorToHttp(err);
    if (httpErr instanceof TooManyRequestsError) {
      c.header('Retry-After', String(httpErr.retryAfterSeconds));
    }
    return c.json(
      {
        error: httpErr.message,
        code: httpErr.code,
      },
      httpErr.statusCode as 400
    );
  });

  // Healthcheck (доступний для Vercel моніторингу й діагностики)
  app.get('/api/health', (c) => {
    return c.json(
      {
        status: 'ok',
        dbDriver: repo.db.driverName,
        timestamp: new Date().toISOString(),
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  });

  // Знімок стану з мінімальними привілеями відповідно до ролі
  app.get('/api/state', async (c) => {
    const state = await repo.getScopedState(c.get('user'), c.get('sessionId'));
    return c.json(state, 200, { 'Cache-Control': 'no-store' });
  });

  // Модульні API-маршрути
  app.route('/api', createAuthRoutes(repo));
  app.route('/api', createTreeRoutes(repo));
  app.route('/api', createMentorRoutes(repo));
  app.route('/api', createB2bRoutes(repo));

  // Будь-який неіснуючий /api/* маршрут повертає JSON 404
  app.all('/api/*', (c) => {
    throw new NotFoundError(`API маршрут ${c.req.method} ${c.req.path} не знайдено.`);
  });

  // Обслуговування статичних файлів та SPA-маршрутів
  app.get('*', (c) => {
    const rawReqPath = c.req.path || '/';
    if (/(?:^|\/)\.\.(?:\/|$)|%2e%2e/i.test(c.req.url)) {
      return c.json({ error: 'Доступ заборонено.', code: 'FORBIDDEN' }, 404);
    }

    let decodedPath = rawReqPath;
    try {
      decodedPath = decodeURIComponent(rawReqPath);
    } catch {
      return c.json({ error: 'Некоректний шлях.', code: 'BAD_REQUEST' }, 400);
    }

    if (decodedPath.includes('..') || decodedPath.includes('\0')) {
      return c.json({ error: 'Доступ заборонено.', code: 'NOT_FOUND' }, 404);
    }

    const relative = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const safePath = resolve(publicDir, relative);
    const isInsidePublic = safePath === publicDir || safePath.startsWith(`${publicDir}${sep}`);
    const isFile = isInsidePublic && existsSync(safePath) && statSync(safePath).isFile();

    if (isFile) {
      const ext = extname(safePath).toLowerCase();
      const isHtml = ext === '.html';
      return c.body(readFileSync(safePath), 200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600, stale-while-revalidate=86400',
      });
    }

    const normalizedSpa =
      decodedPath.length > 1 ? decodedPath.replace(/\/+$/, '') : decodedPath;
    if (SPA_ROUTES.has(normalizedSpa)) {
      const indexFile = join(publicDir, 'index.html');
      if (existsSync(indexFile)) {
        return c.body(readFileSync(indexFile), 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
    }

    return c.json({ error: 'Ресурс не знайдено.', code: 'NOT_FOUND' }, 404);
  });

  return app;
}
