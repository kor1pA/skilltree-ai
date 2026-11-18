import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  HRManager,
  Learner,
  LearningMaterial,
  MaterialType,
  Mentor,
  SkillLevel,
  SkillNode,
  User,
} from './domain/index.ts';
import { DataStore } from './repositories/DataStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const PUBLIC_DIR = resolve(__dirname, 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    throw new Error('Невалідний формат JSON у тілі запиту.');
  }
}

export function createAppServer(store: DataStore): Server {
  return createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const pathname = parsedUrl.pathname;

      // === API ROUTES ===
      if (pathname.startsWith('/api/')) {
        // GET /api/state
        if (method === 'GET' && pathname === '/api/state') {
          sendJson(res, 200, store.getSnapshot());
          return;
        }

        // POST /api/reset
        if (method === 'POST' && pathname === '/api/reset') {
          store.resetToSeed();
          sendJson(res, 200, store.getSnapshot());
          return;
        }

        // UC1: Login
        if (method === 'POST' && pathname === '/api/auth/login') {
          const body = await readJsonBody(req);
          const email = String(body.email ?? '').trim();
          const password = String(body.password ?? '');
          const user = store.findUserByEmail(email);
          if (!user || !user.login(password)) {
            sendError(res, 401, 'Невірний email або пароль.');
            return;
          }
          store.currentUserId = user.id;
          store.saveToDisk();
          sendJson(res, 200, { user: user.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC1: Register
        if (method === 'POST' && pathname === '/api/auth/register') {
          const body = await readJsonBody(req);
          const fullName = String(body.fullName ?? '').trim();
          const email = String(body.email ?? '').trim();
          const password = String(body.password ?? '');
          const role = String(body.role ?? 'LEARNER').toUpperCase();

          if (!fullName || !email || password.length < 4) {
            sendError(
              res,
              400,
              'Вкажіть ім’я, коректний email та пароль (від 4 символів).'
            );
            return;
          }
          if (store.findUserByEmail(email)) {
            sendError(res, 409, 'Користувач із таким email вже зареєстрований.');
            return;
          }

          const passwordHash = User.hashPassword(password);
          let createdUser: Learner | Mentor | HRManager;

          if (role === 'MENTOR') {
            createdUser = new Mentor({
              id: store.nextId(),
              fullName,
              email,
              passwordHash,
              bio: String(body.bio ?? 'Практикуючий ментор на платформі SkillTree AI'),
              hourlyRate: Number(body.hourlyRate ?? 850),
              specialization: String(body.specialization ?? 'Full-Stack Development'),
            });
            store.mentors.push(createdUser);
          } else if (role === 'HR') {
            createdUser = new HRManager({
              id: store.nextId(),
              fullName,
              email,
              passwordHash,
              company: String(body.company ?? 'IT Company Ukraine'),
            });
            store.hrManagers.push(createdUser);
          } else {
            const profession = String(body.targetProfession ?? 'Full-Stack Developer').trim();
            const level = (Object.values(SkillLevel).includes(body.level)
              ? body.level
              : SkillLevel.BEGINNER) as SkillLevel;

            const learner = new Learner({
              id: store.nextId(),
              fullName,
              email,
              passwordHash,
              targetProfession: profession,
              level,
            });
            learner.requestSkillTree(profession, level, (id, prof, lvl) =>
              store.aiAdapter.generateSkillTree(store.nextId, id, prof, lvl)
            );
            store.learners.push(learner);
            if (store.teams[0]) {
              store.teams[0].addMember(learner);
            }
            createdUser = learner;
          }

          createdUser.isLoggedIn = true;
          store.currentUserId = createdUser.id;
          store.saveToDisk();
          sendJson(res, 201, { user: createdUser.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC1: Quick switch user
        if (method === 'POST' && pathname === '/api/auth/switch-user') {
          const body = await readJsonBody(req);
          const userId = Number(body.userId);
          const user = store.findUserById(userId);
          if (!user) {
            sendError(res, 404, 'Користувача не знайдено.');
            return;
          }
          for (const u of store.getAllUsers()) {
            u.logout();
          }
          user.isLoggedIn = true;
          store.currentUserId = user.id;
          store.saveToDisk();
          sendJson(res, 200, { user: user.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC1: Reset password
        if (method === 'POST' && pathname === '/api/auth/reset-password') {
          const body = await readJsonBody(req);
          const email = String(body.email ?? '').trim();
          const newPassword = String(body.newPassword ?? '');
          const user = store.findUserByEmail(email);
          if (!user) {
            sendError(res, 404, 'Користувача з таким email не знайдено.');
            return;
          }
          user.resetPassword(newPassword);
          store.saveToDisk();
          sendJson(res, 200, { message: 'Пароль успішно оновлено.' });
          return;
        }

        // UC2: Generate SkillTree
        if (method === 'POST' && pathname === '/api/trees/generate') {
          const body = await readJsonBody(req);
          const learnerId = Number(body.learnerId || store.currentUserId);
          const learner =
            store.learners.find((l) => l.id === learnerId) ?? store.learners[0];
          if (!learner) {
            sendError(res, 404, 'Студента не знайдено.');
            return;
          }
          const profession = String(body.profession ?? learner.targetProfession).trim();
          const level = (Object.values(SkillLevel).includes(body.level)
            ? body.level
            : SkillLevel.BEGINNER) as SkillLevel;

          const tree = learner.requestSkillTree(profession, level, (id, prof, lvl) =>
            store.aiAdapter.generateSkillTree(store.nextId, id, prof, lvl)
          );
          store.saveToDisk();
          sendJson(res, 201, { tree: tree.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC10: Add node to SkillTree
        const addNodeMatch = pathname.match(/^\/api\/trees\/(\d+)\/nodes$/);
        if (method === 'POST' && addNodeMatch) {
          const treeId = Number(addNodeMatch[1]);
          const found = store.findTreeById(treeId);
          if (!found) {
            sendError(res, 404, 'Карту розвитку не знайдено.');
            return;
          }
          const body = await readJsonBody(req);
          const title = String(body.title ?? '').trim();
          if (!title) {
            sendError(res, 400, 'Вкажіть назву вузла навички.');
            return;
          }

          const materials: LearningMaterial[] = [];
          if (body.materialTitle) {
            materials.push(
              new LearningMaterial({
                id: store.nextId(),
                title: String(body.materialTitle).trim(),
                type: (Object.values(MaterialType).includes(body.materialType)
                  ? body.materialType
                  : MaterialType.TEXT) as MaterialType,
                url: String(body.materialUrl ?? '').trim(),
                description: String(body.description ?? ''),
                content: String(body.materialContent ?? body.description ?? ''),
              })
            );
          }

          const node = new SkillNode({
            id: store.nextId(),
            title,
            orderNumber: found.tree.nodes.length + 1,
            description: String(body.description ?? 'Користувацький вузол карти розвитку.'),
            materials,
          });
          found.tree.addNode(node);
          store.saveToDisk();
          sendJson(res, 201, { node: node.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC10: Remove node from SkillTree
        const deleteNodeMatch = pathname.match(/^\/api\/trees\/(\d+)\/nodes\/(\d+)$/);
        if (method === 'DELETE' && deleteNodeMatch) {
          const treeId = Number(deleteNodeMatch[1]);
          const nodeId = Number(deleteNodeMatch[2]);
          const found = store.findTreeById(treeId);
          if (!found) {
            sendError(res, 404, 'Карту розвитку не знайдено.');
            return;
          }
          const removed = found.tree.removeNode(nodeId);
          if (!removed) {
            sendError(
              res,
              400,
              'Неможливо видалити вузол: карта повинна містити щонайменше 1 вузол (композиція 1 : 1..*).'
            );
            return;
          }
          store.saveToDisk();
          sendJson(res, 200, { removed: true, state: store.getSnapshot() });
          return;
        }

        // UC3: Update node status (start / complete)
        const statusNodeMatch = pathname.match(/^\/api\/trees\/(\d+)\/nodes\/(\d+)\/status$/);
        if (method === 'PATCH' && statusNodeMatch) {
          const treeId = Number(statusNodeMatch[1]);
          const nodeId = Number(statusNodeMatch[2]);
          const found = store.findTreeById(treeId);
          if (!found) {
            sendError(res, 404, 'Карту розвитку не знайдено.');
            return;
          }
          const node = found.tree.nodes.find((n) => n.id === nodeId);
          if (!node) {
            sendError(res, 404, 'Вузол карти не знайдено.');
            return;
          }

          const body = await readJsonBody(req);
          const action = String(body.action ?? 'complete').toLowerCase();

          if (action === 'start') {
            node.start();
          } else if (action === 'complete') {
            found.owner.completeNode(treeId, nodeId);
          } else {
            sendError(res, 400, 'Невідома дія статусу. Очікується start або complete.');
            return;
          }

          store.saveToDisk();
          sendJson(res, 200, {
            node: node.toJSON(),
            treeProgress: found.tree.calculateProgress(),
            learnerPoints: found.owner.points,
            badges: found.owner.badges,
            state: store.getSnapshot(),
          });
          return;
        }

        // UC4: Ask AI Assistant on a SkillNode
        const chatNodeMatch = pathname.match(/^\/api\/trees\/(\d+)\/nodes\/(\d+)\/chat$/);
        if (method === 'POST' && chatNodeMatch) {
          const treeId = Number(chatNodeMatch[1]);
          const nodeId = Number(chatNodeMatch[2]);
          const found = store.findTreeById(treeId);
          if (!found) {
            sendError(res, 404, 'Карту розвитку не знайдено.');
            return;
          }

          const body = await readJsonBody(req);
          const question = String(body.question ?? '').trim();
          if (!question) {
            sendError(res, 400, 'Запитання до ШІ-асистента не може бути порожнім.');
            return;
          }

          const targetNode = found.tree.nodes.find((n) => n.id === nodeId);
          if (!targetNode) {
            sendError(res, 404, 'Вузол карти не знайдено.');
            return;
          }

          const generated = await store.aiAdapter.generateAssistantAnswerAsync(
            targetNode,
            found.tree,
            question,
            typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined
          );

          const message = found.owner.askAssistant(nodeId, question, () => ({
            answer: generated.answer,
            responseTimeMs: generated.responseTimeMs,
          }));
          message.id = store.nextId();
          store.saveToDisk();
          sendJson(res, 201, {
            message: message.toJSON(),
            source: generated.source,
            state: store.getSnapshot(),
          });
          return;
        }

        // UC11: Rate AI Assistant message
        const rateChatMatch = pathname.match(/^\/api\/chat\/(\d+)\/rate$/);
        if (method === 'PATCH' && rateChatMatch) {
          const messageId = Number(rateChatMatch[1]);
          const msg = store.findChatMessageById(messageId);
          if (!msg) {
            sendError(res, 404, 'Повідомлення чату не знайдено.');
            return;
          }
          const body = await readJsonBody(req);
          msg.rate(Boolean(body.helpful));
          store.saveToDisk();
          sendJson(res, 200, { message: msg.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC5: Mentor publishes LearningMaterial to node
        const publishMaterialMatch = pathname.match(/^\/api\/nodes\/(\d+)\/materials$/);
        if (method === 'POST' && publishMaterialMatch) {
          const nodeId = Number(publishMaterialMatch[1]);
          const foundNode = store.findNodeById(nodeId);
          if (!foundNode) {
            sendError(res, 404, 'Вузол карти не знайдено.');
            return;
          }
          const body = await readJsonBody(req);
          const mentorId = Number(body.mentorId || store.currentUserId);
          const mentor =
            store.mentors.find((m) => m.id === mentorId) ?? store.mentors[0];
          if (!mentor) {
            sendError(res, 404, 'Ментора не знайдено.');
            return;
          }
          const title = String(body.title ?? '').trim();
          const url = String(body.url ?? '').trim();
          if (!title) {
            sendError(res, 400, 'Вкажіть назву навчального матеріалу.');
            return;
          }
          const type = (Object.values(MaterialType).includes(body.type)
            ? body.type
            : MaterialType.LINK) as MaterialType;

          const material = mentor.publishMaterial(
            foundNode.node,
            title,
            url,
            type,
            String(body.description ?? ''),
            String(body.content ?? body.description ?? '')
          );
          material.id = store.nextId();
          store.saveToDisk();
          sendJson(res, 201, { material: material.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC6: Book MentorSession
        if (method === 'POST' && pathname === '/api/sessions') {
          const body = await readJsonBody(req);
          const learnerId = Number(body.learnerId || store.currentUserId);
          const learner =
            store.learners.find((l) => l.id === learnerId) ?? store.learners[0];
          const mentor = store.mentors.find((m) => m.id === Number(body.mentorId));
          if (!learner || !mentor) {
            sendError(res, 404, 'Студента або ментора не знайдено.');
            return;
          }

          const startAt = body.startAt ? new Date(body.startAt) : new Date(Date.now() + 86400000);
          const durationMin = Number(body.durationMin ?? 60);
          const topic = String(body.topic ?? '').trim();

          const session = learner.bookSession(mentor, startAt, topic, durationMin);
          session.id = store.nextId();
          store.sessions.push(session);
          store.saveToDisk();
          sendJson(res, 201, { session: session.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC9: Pay MentorSession (include)
        const paySessionMatch = pathname.match(/^\/api\/sessions\/(\d+)\/pay$/);
        if (method === 'POST' && paySessionMatch) {
          const sessionId = Number(paySessionMatch[1]);
          const session = store.sessions.find((s) => s.id === sessionId);
          if (!session) {
            sendError(res, 404, 'Сесію не знайдено.');
            return;
          }
          const receipt = store.paymentAdapter.processPayment(session);
          store.receipts.push(receipt);
          store.saveToDisk();
          sendJson(res, 200, { session: session.toJSON(), receipt, state: store.getSnapshot() });
          return;
        }

        // UC6: Confirm MentorSession
        const confirmSessionMatch = pathname.match(/^\/api\/sessions\/(\d+)\/confirm$/);
        if (method === 'POST' && confirmSessionMatch) {
          const sessionId = Number(confirmSessionMatch[1]);
          const session = store.sessions.find((s) => s.id === sessionId);
          if (!session) {
            sendError(res, 404, 'Сесію не знайдено.');
            return;
          }
          const mentor = store.mentors.find((m) => m.id === session.mentorId);
          if (!mentor) {
            sendError(res, 404, 'Ментора не знайдено.');
            return;
          }
          mentor.confirmSession(session);
          store.saveToDisk();
          sendJson(res, 200, { session: session.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC6: Cancel MentorSession
        const cancelSessionMatch = pathname.match(/^\/api\/sessions\/(\d+)\/cancel$/);
        if (method === 'POST' && cancelSessionMatch) {
          const sessionId = Number(cancelSessionMatch[1]);
          const session = store.sessions.find((s) => s.id === sessionId);
          if (!session) {
            sendError(res, 404, 'Сесію не знайдено.');
            return;
          }
          session.cancel();
          store.saveToDisk();
          sendJson(res, 200, { session: session.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC6: Leave feedback & recalculate mentor rating
        const feedbackSessionMatch = pathname.match(/^\/api\/sessions\/(\d+)\/feedback$/);
        if (method === 'POST' && feedbackSessionMatch) {
          const sessionId = Number(feedbackSessionMatch[1]);
          const session = store.sessions.find((s) => s.id === sessionId);
          if (!session) {
            sendError(res, 404, 'Сесію не знайдено.');
            return;
          }
          const mentor = store.mentors.find((m) => m.id === session.mentorId);
          if (!mentor) {
            sendError(res, 404, 'Ментора не знайдено.');
            return;
          }
          const body = await readJsonBody(req);
          session.leaveFeedback(Number(body.rating), String(body.feedback ?? ''));
          const mentorRating = mentor.recalculateRating();
          store.saveToDisk();
          sendJson(res, 200, {
            session: session.toJSON(),
            mentorRating,
            state: store.getSnapshot(),
          });
          return;
        }

        // UC7: Get Team Skill Matrix
        const matrixMatch = pathname.match(/^\/api\/teams\/(\d+)\/matrix$/);
        if (method === 'GET' && matrixMatch) {
          const teamId = Number(matrixMatch[1]);
          const team = store.teams.find((t) => t.id === teamId);
          if (!team) {
            sendError(res, 404, 'Команду не знайдено.');
            return;
          }
          sendJson(res, 200, {
            skillMatrix: team.getSkillMatrix(),
            detailedMatrix: team.getDetailedMatrix(),
          });
          return;
        }

        // UC7: Create Team
        if (method === 'POST' && pathname === '/api/teams') {
          const body = await readJsonBody(req);
          const hr =
            store.hrManagers.find((h) => h.id === Number(body.hrId || store.currentUserId)) ??
            store.hrManagers[0];
          if (!hr) {
            sendError(res, 404, 'HR-менеджера не знайдено.');
            return;
          }
          const name = String(body.name ?? '').trim();
          if (!name) {
            sendError(res, 400, 'Вкажіть назву команди.');
            return;
          }
          const team = hr.createTeam(name);
          team.id = store.nextId();
          store.teams.push(team);
          store.saveToDisk();
          sendJson(res, 201, { team: team.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC7: Add Member to Team
        const addMemberMatch = pathname.match(/^\/api\/teams\/(\d+)\/members$/);
        if (method === 'POST' && addMemberMatch) {
          const teamId = Number(addMemberMatch[1]);
          const team = store.teams.find((t) => t.id === teamId);
          if (!team) {
            sendError(res, 404, 'Команду не знайдено.');
            return;
          }
          const body = await readJsonBody(req);
          const learner = store.learners.find((l) => l.id === Number(body.learnerId));
          if (!learner) {
            sendError(res, 404, 'Працівника не знайдено.');
            return;
          }
          team.addMember(learner);
          store.saveToDisk();
          sendJson(res, 200, { team: team.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC8: HR assigns SkillTree to employee
        if (method === 'POST' && pathname === '/api/hr/assign-tree') {
          const body = await readJsonBody(req);
          const hr =
            store.hrManagers.find((h) => h.id === Number(body.hrId || store.currentUserId)) ??
            store.hrManagers[0];
          const learner = store.learners.find((l) => l.id === Number(body.learnerId));
          if (!hr || !learner) {
            sendError(res, 404, 'HR-менеджера або співробітника не знайдено.');
            return;
          }

          let templateTree = body.sourceTreeId
            ? store.findTreeById(Number(body.sourceTreeId))?.tree
            : undefined;

          if (!templateTree) {
            const profession = String(body.profession ?? 'Full-Stack Developer').trim();
            const level = (Object.values(SkillLevel).includes(body.level)
              ? body.level
              : SkillLevel.INTERMEDIATE) as SkillLevel;
            templateTree = store.aiAdapter.generateSkillTree(
              store.nextId,
              learner.id,
              profession,
              level
            );
          }

          hr.assignSkillTree(learner, templateTree);
          const assignedTree = learner.skillTrees[learner.skillTrees.length - 1];
          assignedTree.id = store.nextId();
          assignedTree.nodes.forEach((n) => {
            n.id = store.nextId();
            n.materials.forEach((m) => {
              m.id = store.nextId();
            });
          });

          store.saveToDisk();
          sendJson(res, 201, { tree: assignedTree.toJSON(), state: store.getSnapshot() });
          return;
        }

        // UC12: Export Team CSV Report
        const exportMatch = pathname.match(/^\/api\/teams\/(\d+)\/export$/);
        if (method === 'GET' && exportMatch) {
          const teamId = Number(exportMatch[1]);
          const team = store.teams.find((t) => t.id === teamId);
          const hr = store.hrManagers[0];
          if (!team || !hr) {
            sendError(res, 404, 'Команду або HR-менеджера не знайдено.');
            return;
          }
          const format = parsedUrl.searchParams.get('format') ?? 'CSV';
          const content = hr.exportReport(team, format);
          if (format.toUpperCase() === 'CSV') {
            res.writeHead(200, {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="skill-matrix-team-${team.id}.csv"`,
            });
            res.end(content);
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(content);
          }
          return;
        }

        sendError(res, 404, `API маршрут ${method} ${pathname} не знайдено.`);
        return;
      }

      // === STATIC FRONTEND FILES ===
      const requestedFile = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = resolve(PUBLIC_DIR, requestedFile);
      if (!safePath.startsWith(PUBLIC_DIR) || !existsSync(safePath)) {
        const fallbackIndex = join(PUBLIC_DIR, 'index.html');
        if (existsSync(fallbackIndex)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(readFileSync(fallbackIndex));
          return;
        }
        sendError(res, 404, 'Файл не знайдено.');
        return;
      }

      const ext = extname(safePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(safePath));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Внутрішня помилка сервера.';
      sendError(res, 400, message);
    }
  });
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 3000);
  const store = new DataStore();
  const server = createAppServer(store);
  server.listen(port, () => {
    console.log(`SkillTree AI running at http://localhost:${port}`);
  });
}
