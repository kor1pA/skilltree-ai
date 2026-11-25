import { Hono } from 'hono';
import { Learner, NodeStatus, SkillLevel } from '../domain/index.ts';
import type { SkillTreeRepository } from '../repositories/SkillTreeRepository.ts';
import { BadRequestError } from '../http/errors.ts';
import { type AppEnv, requireRole } from '../http/security.ts';
import {
  optionalString,
  parseJsonBody,
  requireEnum,
  requirePositiveInt,
  requireString,
  validateSafeUrl,
} from '../http/validation.ts';

export function createTreeRoutes(repo: SkillTreeRepository): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // UC2: Згенерувати нову карту розвитку через ШІ
  routes.post('/trees/generate', requireRole('LEARNER'), async (c) => {
    const user = c.get('user') as Learner;
    const sessionId = c.get('sessionId');
    const body = await parseJsonBody(c);

    const profession =
      body.profession !== undefined
        ? requireString(body.profession, 'цільова професія', { min: 2, max: 120 })
        : user.targetProfession;
    const level = requireEnum(body.level, SkillLevel, 'рівень', SkillLevel.BEGINNER);

    const tree = await repo.generateSkillTreeForLearner(user.id, profession, level);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ tree: tree.toJSON(), state }, 201);
  });

  // UC10: Додати кастомний вузол до карти розвитку
  routes.post('/trees/:treeId/nodes', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const treeId = requirePositiveInt(c.req.param('treeId'), 'ID карти');
    const body = await parseJsonBody(c);

    const title = requireString(body.title, 'назва вузла', { min: 2, max: 150 });
    const description =
      optionalString(body.description, 'опис вузла', { max: 1000 }) ||
      'Практичний вузол карти навичок.';
    const materialTitle =
      optionalString(body.materialTitle, 'назва матеріалу', { max: 180 }) || undefined;
    const materialUrl = validateSafeUrl(body.materialUrl, { allowEmpty: true });

    const node = await repo.addNodeToTree(user.id, treeId, {
      title,
      description,
      materialTitle,
      materialUrl,
    });
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ node: node.toJSON(), state }, 201);
  });

  // UC3: Оновити статус вузла (IN_PROGRESS / DONE)
  routes.patch('/trees/:treeId/nodes/:nodeId/status', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const treeId = requirePositiveInt(c.req.param('treeId'), 'ID карти');
    const nodeId = requirePositiveInt(c.req.param('nodeId'), 'ID вузла');
    const body = await parseJsonBody(c);

    let action: 'start' | 'complete' | undefined;
    let status: NodeStatus | undefined;

    if (body.action === 'start' || body.action === 'complete') {
      action = body.action;
    } else if (body.status === NodeStatus.IN_PROGRESS || body.status === NodeStatus.DONE) {
      status = body.status;
    } else {
      throw new BadRequestError(
        'Вкажіть action ("start" | "complete") або status ("IN_PROGRESS" | "DONE").'
      );
    }

    const result = await repo.updateNodeStatus(user.id, treeId, nodeId, { action, status });
    const state = await repo.getScopedState(user, sessionId);

    return c.json(
      {
        node: result.node.toJSON(),
        treeProgress: result.treeProgress,
        learnerPoints: result.learnerPoints,
        badges: result.badges,
        state,
      },
      200
    );
  });

  // UC10: Видалити вузол (із захистом інваріанта композиції 1 : 1..*)
  routes.delete('/trees/:treeId/nodes/:nodeId', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const treeId = requirePositiveInt(c.req.param('treeId'), 'ID карти');
    const nodeId = requirePositiveInt(c.req.param('nodeId'), 'ID вузла');

    await repo.deleteNodeFromTree(user.id, treeId, nodeId);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ message: 'Вузол видалено.', state }, 200);
  });

  // UC4: Контекстний ШІ-асистент у межах вузла (SLA <= 5000 мс)
  routes.post('/trees/:treeId/nodes/:nodeId/chat', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const treeId = requirePositiveInt(c.req.param('treeId'), 'ID карти');
    const nodeId = requirePositiveInt(c.req.param('nodeId'), 'ID вузла');
    const body = await parseJsonBody(c);

    const question = requireString(body.question, 'запитання до ШІ-асистента', {
      min: 2,
      max: 2000,
    });

    const { message, source } = await repo.askNodeAssistant(user.id, treeId, nodeId, question);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ message: message.toJSON(), aiSource: source, state }, 201);
  });

  // UC11: Оцінити корисність відповіді ШІ
  routes.patch('/chat/:messageId/rate', requireRole('LEARNER'), async (c) => {
    const user = c.get('user')!;
    const sessionId = c.get('sessionId');
    const messageId = requirePositiveInt(c.req.param('messageId'), 'ID повідомлення');
    const body = await parseJsonBody(c);

    if (typeof body.helpful !== 'boolean') {
      throw new BadRequestError('Поле «helpful» має бути булевим значенням (true/false).');
    }

    const message = await repo.rateChatMessage(user.id, messageId, body.helpful);
    const state = await repo.getScopedState(user, sessionId);
    return c.json({ message: message.toJSON(), state }, 200);
  });

  return routes;
}
