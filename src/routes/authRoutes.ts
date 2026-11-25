import { Hono } from 'hono';
import { Learner, Mentor, HRManager, SkillLevel, type UserRole } from '../domain/index.ts';
import type { SkillTreeRepository } from '../repositories/SkillTreeRepository.ts';
import { BadRequestError } from '../http/errors.ts';
import {
  type AppEnv,
  clearSessionCookie,
  generateSessionToken,
  getClientIp,
  hashSessionToken,
  parseDeviceLabel,
  requireAuth,
  setSessionCookie,
} from '../http/security.ts';
import {
  optionalString,
  parseJsonBody,
  requireEmail,
  requireEnum,
  requirePassword,
  requirePositiveNumber,
  requireString,
} from '../http/validation.ts';

const ALLOWED_ROLES: Record<string, UserRole> = {
  LEARNER: 'LEARNER',
  MENTOR: 'MENTOR',
  HR: 'HR',
};

export function createAuthRoutes(repo: SkillTreeRepository): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // UC1: Реєстрація нового користувача
  routes.post('/auth/register', async (c) => {
    const body = await parseJsonBody(c);
    const fullName = requireString(body.fullName, 'повне ім’я (ПІБ)', { min: 2, max: 120 });
    const email = requireEmail(body.email);
    const password = requirePassword(body.password, 8);
    const rawRole = typeof body.role === 'string' ? body.role.trim().toUpperCase() : 'LEARNER';
    const role = requireEnum(rawRole, ALLOWED_ROLES, 'роль');

    let hourlyRate: number | undefined;
    if (role === 'MENTOR' && body.hourlyRate !== undefined) {
      hourlyRate = requirePositiveNumber(body.hourlyRate, 'ставка ментора', 50_000);
    }

    const level = requireEnum(body.level, SkillLevel, 'рівень підготовки', SkillLevel.BEGINNER);
    const targetProfession =
      optionalString(body.targetProfession, 'цільова професія', { max: 120 }) ||
      'Full-Stack Developer';
    const bio = optionalString(body.bio, 'про себе', { max: 600 }) || undefined;
    const specialization =
      optionalString(body.specialization, 'спеціалізація', { max: 120 }) || undefined;
    const company = optionalString(body.company, 'компанія', { max: 120 }) || undefined;

    const createdUser = await repo.registerUser({
      fullName,
      email,
      password,
      role,
      targetProfession,
      level,
      hourlyRate,
      bio,
      specialization,
      company,
    });

    const rawToken = generateSessionToken();
    const userAgent = c.req.header('user-agent') ?? 'Unknown Client';
    const session = await repo.createAuthSession({
      userId: createdUser.id,
      tokenHash: hashSessionToken(rawToken),
      deviceLabel: parseDeviceLabel(userAgent),
      userAgent: userAgent.slice(0, 200),
      ipAddress: getClientIp(c),
      rememberMe: true,
    });

    setSessionCookie(c, rawToken, true);
    createdUser.isLoggedIn = true;

    const state = await repo.getScopedState(createdUser, session.id);
    return c.json({ user: state.currentUser, state }, 201);
  });

  // UC1: Вхід в акаунт
  routes.post('/auth/login', async (c) => {
    const body = await parseJsonBody(c);
    const email = requireEmail(body.email);
    if (typeof body.password !== 'string' || !body.password) {
      throw new BadRequestError('Вкажіть пароль.');
    }
    const rememberMe = body.rememberMe !== false;
    const ip = getClientIp(c);
    const throttleKey = `${ip}:${email}`;

    const user = await repo.authenticateUser(email, body.password, throttleKey);

    const prevSessionId = c.get('sessionId');
    const prevUser = c.get('user');
    if (prevUser && prevSessionId) {
      await repo.revokeAuthSession(prevUser.id, prevSessionId).catch(() => undefined);
    }

    const rawToken = generateSessionToken();
    const userAgent = c.req.header('user-agent') ?? 'Unknown Client';
    const session = await repo.createAuthSession({
      userId: user.id,
      tokenHash: hashSessionToken(rawToken),
      deviceLabel: parseDeviceLabel(userAgent),
      userAgent: userAgent.slice(0, 200),
      ipAddress: ip,
      rememberMe,
    });

    setSessionCookie(c, rawToken, rememberMe);
    const state = await repo.getScopedState(user, session.id);
    return c.json({ user: state.currentUser, state }, 200);
  });

  // UC1: Вихід із поточної сесії
  routes.post('/auth/logout', async (c) => {
    const user = c.get('user');
    const sessionId = c.get('sessionId');
    if (user && sessionId) {
      await repo.revokeAuthSession(user.id, sessionId).catch(() => undefined);
    }
    clearSessionCookie(c);
    c.set('user', null);
    c.set('sessionId', null);

    const state = await repo.getScopedState(null, null);
    return c.json({ currentUser: null, state }, 200);
  });

  // Оновлення власного профілю поточного користувача
  routes.put('/profile', requireAuth, async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);

    const fullName =
      body.fullName !== undefined
        ? requireString(body.fullName, 'повне ім’я', { min: 2, max: 120 })
        : undefined;

    let targetProfession: string | undefined;
    let level: SkillLevel | undefined;
    let specialization: string | undefined;
    let bio: string | undefined;
    let hourlyRate: number | undefined;
    let company: string | undefined;

    if (user instanceof Learner) {
      if (body.targetProfession !== undefined) {
        targetProfession = requireString(body.targetProfession, 'цільова професія', {
          min: 2,
          max: 120,
        });
      }
      if (body.level !== undefined) {
        level = requireEnum(body.level, SkillLevel, 'рівень');
      }
    } else if (user instanceof Mentor) {
      if (body.specialization !== undefined) {
        specialization = requireString(body.specialization, 'спеціалізація', { min: 2, max: 120 });
      }
      if (body.bio !== undefined) {
        bio = requireString(body.bio, 'біографія', { min: 5, max: 800 });
      }
      if (body.hourlyRate !== undefined) {
        hourlyRate = requirePositiveNumber(body.hourlyRate, 'ставка ментора', 50_000);
      }
    } else if (user instanceof HRManager) {
      if (body.company !== undefined) {
        company = requireString(body.company, 'компанія', { min: 2, max: 120 });
      }
    }

    const updated = await repo.updateUserProfile(user.id, {
      fullName,
      targetProfession,
      level,
      specialization,
      bio,
      hourlyRate,
      company,
    });
    const state = await repo.getScopedState(updated, sessionId);
    return c.json({ user: state.currentUser, state }, 200);
  });

  // Безпечна зміна пароля (лише авторизовано + підтвердження поточного пароля)
  routes.post('/auth/change-password', requireAuth, async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);

    if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
      throw new BadRequestError('Вкажіть поточний пароль.');
    }
    const newPassword = requirePassword(body.newPassword, 8);
    if (body.currentPassword === newPassword) {
      throw new BadRequestError('Новий пароль повинен відрізнятися від поточного.');
    }

    await repo.changeUserPassword(user.id, body.currentPassword, newPassword, sessionId);
    const state = await repo.getScopedState(user, sessionId);
    return c.json(
      {
        message: 'Пароль успішно оновлено. Інші активні сесії завершено.',
        state,
      },
      200
    );
  });

  // Журнал активних сесій поточного користувача
  routes.get('/auth/sessions', requireAuth, async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const sessions = await repo.listUserAuthSessions(user.id, sessionId);
    return c.json({ sessions }, 200);
  });

  routes.delete('/auth/sessions/:sessionId', requireAuth, async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const targetSessionId = requireString(c.req.param('sessionId'), 'ID сесії', {
      min: 8,
      max: 80,
    });

    await repo.revokeAuthSession(user.id, targetSessionId);
    if (currentSessionId && targetSessionId === currentSessionId) {
      clearSessionCookie(c);
      const state = await repo.getScopedState(null, null);
      return c.json({ message: 'Поточну сесію завершено.', state }, 200);
    }

    const state = await repo.getScopedState(user, currentSessionId);
    return c.json({ message: 'Сесію відкликано.', state }, 200);
  });

  routes.post('/auth/sessions/revoke-others', requireAuth, async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const revokedCount = currentSessionId
      ? await repo.revokeOtherAuthSessions(user.id, currentSessionId)
      : 0;
    const state = await repo.getScopedState(user, currentSessionId);
    return c.json({ revokedCount, state }, 200);
  });

  return routes;
}
