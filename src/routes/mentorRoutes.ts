import { Hono } from 'hono';
import { MaterialType } from '../domain/index.ts';
import type { PaymentMethod } from '../adapters/PaymentAdapter.ts';
import type { SkillTreeRepository } from '../repositories/SkillTreeRepository.ts';
import { BadRequestError } from '../http/errors.ts';
import { type AppEnv, requireRole } from '../http/security.ts';
import {
  optionalString,
  parseJsonBody,
  requireEnum,
  requirePositiveInt,
  requireString,
  requireValidDate,
  validateSafeUrl,
} from '../http/validation.ts';

const PAYMENT_METHODS: Record<PaymentMethod, PaymentMethod> = {
  CARD: 'CARD',
  APPLE_PAY: 'APPLE_PAY',
  GOOGLE_PAY: 'GOOGLE_PAY',
  INVOICE: 'INVOICE',
};

export function createMentorRoutes(repo: SkillTreeRepository): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Публічний каталог менторів без приватних даних
  routes.get('/mentors', async (c) => {
    const mentors = await repo.listPublicMentors();
    return c.json({ mentors }, 200);
  });

  // UC5: Ментор публікує навчальний матеріал у вузол карти
  routes.post('/nodes/:nodeId/materials', requireRole('MENTOR'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const nodeId = requirePositiveInt(c.req.param('nodeId'), 'ID вузла');
    const body = await parseJsonBody(c);

    const title = requireString(body.title, 'назва матеріалу', { min: 2, max: 180 });
    const url = validateSafeUrl(body.url, { allowEmpty: true });
    const type = requireEnum(body.type, MaterialType, 'тип матеріалу', MaterialType.LINK);
    const description = optionalString(body.description, 'опис матеріалу', { max: 800 });
    const content =
      optionalString(body.content, 'контент матеріалу', { max: 8000 }) || description;

    const material = await repo.publishMaterial(user.id, nodeId, {
      title,
      url,
      type,
      description,
      content,
    });
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ material: material.toJSON(), state }, 201);
  });

  // UC6 (+ опціонально атомарна оплата UC9): Бронювання сесії з ментором
  routes.post('/sessions', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);

    const mentorId = requirePositiveInt(body.mentorId, 'ID ментора');
    const startAt = body.startAt
      ? requireValidDate(body.startAt, 'дата початку сесії')
      : new Date(Date.now() + 86_400_000);
    const durationRaw = body.durationMin ?? body.durationMinutes ?? 60;
    const durationMin = requirePositiveInt(durationRaw, 'тривалість (хв)', 480);
    const topic =
      optionalString(body.topic, 'тема сесії', { max: 200 }) ||
      'Індивідуальна менторська сесія';
    const payImmediately = Boolean(body.payImmediately);
    const paymentMethod = requireEnum(
      body.paymentMethod ?? body.method,
      PAYMENT_METHODS,
      'спосіб оплати',
      'CARD'
    );

    const result = await repo.bookSession(user.id, {
      mentorId,
      topic,
      startAt,
      durationMin,
      payImmediately,
      paymentMethod,
    });
    const state = await repo.getScopedState(user, sessionId);
    return c.json(
      {
        session: result.session.toJSON(),
        receipt: result.receipt,
        state,
      },
      201
    );
  });

  // UC9: Оплата заброньованої сесії
  routes.post('/sessions/:sessionId/pay', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const targetSessionId = requirePositiveInt(c.req.param('sessionId'), 'ID сесії');
    const body = await parseJsonBody(c);
    const paymentMethod = requireEnum(
      body.paymentMethod ?? body.method,
      PAYMENT_METHODS,
      'спосіб оплати',
      'CARD'
    );

    const result = await repo.paySession(user.id, targetSessionId, paymentMethod);
    const state = await repo.getScopedState(user, currentSessionId);
    return c.json(
      {
        session: result.session.toJSON(),
        receipt: result.receipt,
        state,
      },
      200
    );
  });

  // UC6: Підтвердження оплаченої сесії ментором
  routes.post('/sessions/:sessionId/confirm', requireRole('MENTOR'), async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const targetSessionId = requirePositiveInt(c.req.param('sessionId'), 'ID сесії');

    const session = await repo.confirmSession(user.id, targetSessionId);
    const state = await repo.getScopedState(user, currentSessionId);
    return c.json({ session: session.toJSON(), state }, 200);
  });

  // UC6: Скасування сесії (студентом або ментором) із поверненням оплати
  routes.post('/sessions/:sessionId/cancel', requireRole('LEARNER', 'MENTOR'), async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const targetSessionId = requirePositiveInt(c.req.param('sessionId'), 'ID сесії');

    const session = await repo.cancelSession(user.id, targetSessionId);
    const state = await repo.getScopedState(user, currentSessionId);
    return c.json({ session: session.toJSON(), state }, 200);
  });

  // UC6: Оцінка та відгук після сесії -> перерахунок рейтингу ментора
  routes.post('/sessions/:sessionId/feedback', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const currentSessionId = c.get('sessionId');
    const targetSessionId = requirePositiveInt(c.req.param('sessionId'), 'ID сесії');
    const body = await parseJsonBody(c);

    if (body.rating === undefined || body.rating === null || body.rating === '') {
      throw new BadRequestError('Вкажіть оцінку менторської сесії від 1 до 5.');
    }
    const rating = Number(body.rating);
    const feedback = optionalString(body.feedback ?? body.comment, 'відгук', { max: 1000 });

    const { session, mentorRating } = await repo.leaveSessionFeedback(
      user.id,
      targetSessionId,
      rating,
      feedback
    );
    const state = await repo.getScopedState(user, currentSessionId);
    return c.json({ session: session.toJSON(), mentorRating, state }, 200);
  });

  return routes;
}
