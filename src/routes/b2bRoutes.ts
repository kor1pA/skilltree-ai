import { Hono } from 'hono';
import { SkillLevel } from '../domain/index.ts';
import type { SkillTreeRepository } from '../repositories/SkillTreeRepository.ts';
import { BadRequestError } from '../http/errors.ts';
import { type AppEnv, requireRole } from '../http/security.ts';
import {
  optionalString,
  parseJsonBody,
  requireEnum,
  requirePositiveInt,
  requireString,
} from '../http/validation.ts';

export function createB2bRoutes(repo: SkillTreeRepository): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Захист усіх B2B маршрутів: лише роль HR
  routes.use('/teams/*', requireRole('HR'));
  routes.use('/teams', requireRole('HR'));
  routes.use('/hr/*', requireRole('HR'));

  // UC7: Отримання детальної матриці навичок команди
  routes.get('/teams/:teamId/matrix', async (c) => {
    const user = c.get('user')!;
    const teamId = requirePositiveInt(c.req.param('teamId'), 'ID команди');
    const team = await repo.getTeamDetailed(user.id, teamId);
    return c.json(
      {
        skillMatrix: team.getSkillMatrix(),
        detailedMatrix: team.getDetailedMatrix(),
      },
      200
    );
  });

  // UC7: Створення нової команди
  routes.post('/teams', async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);
    const name = requireString(body.name, 'назва команди', { min: 2, max: 120 });

    const team = await repo.createTeam(user.id, name);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ team: team.toJSON(), state }, 201);
  });

  // UC7: Додавання співробітника до команди
  routes.post('/teams/:teamId/members', async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const teamId = requirePositiveInt(c.req.param('teamId'), 'ID команди');
    const body = await parseJsonBody(c);
    const learnerId = requirePositiveInt(body.learnerId, 'ID співробітника');

    const team = await repo.addTeamMember(user.id, teamId, learnerId);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ team: team.toJSON(), state }, 200);
  });

  // UC8: Призначення карти розвитку співробітнику
  routes.post('/hr/assign-tree', async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);

    const learnerId = requirePositiveInt(body.learnerId, 'ID співробітника');
    const teamId =
      body.teamId !== undefined ? requirePositiveInt(body.teamId, 'ID команди') : undefined;
    const sourceTreeId =
      body.sourceTreeId !== undefined
        ? requirePositiveInt(body.sourceTreeId, 'ID шаблонної карти')
        : undefined;
    const profession =
      optionalString(body.profession, 'професія', { max: 120 }) || 'Full-Stack Developer';
    const level = requireEnum(body.level, SkillLevel, 'рівень', SkillLevel.INTERMEDIATE);

    const tree = await repo.assignTreeToLearner(user.id, {
      teamId,
      learnerId,
      sourceTreeId,
      profession,
      level,
    });
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ tree: tree.toJSON(), state }, 201);
  });

  // UC12: Експорт звіту команди (RFC-4180 CSV із UTF-8 BOM або JSON)
  routes.get('/teams/:teamId/export', async (c) => {
    const user = c.get('user')!;
    const teamId = requirePositiveInt(c.req.param('teamId'), 'ID команди');
    const format = (c.req.query('format') ?? 'CSV').trim().toUpperCase();
    if (format !== 'CSV' && format !== 'JSON') {
      throw new BadRequestError('Формат експорту має бути CSV або JSON.');
    }

    const content = await repo.exportTeamReport(user.id, teamId, format);
    if (format === 'CSV') {
      return c.body(content, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="skill-matrix-team-${teamId}.csv"`,
        'Cache-Control': 'no-store',
      });
    }

    return c.body(content, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  });

  return routes;
}
