import { randomUUID } from 'node:crypto';
import {
  ChatMessage,
  HRManager,
  Learner,
  LearningMaterial,
  MaterialType,
  Mentor,
  MentorSession,
  NodeStatus,
  PaymentStatus,
  SkillLevel,
  SkillNode,
  SkillTree,
  Team,
  User,
  type UserRole,
} from '../domain/index.ts';
import { AIServiceAdapter } from '../adapters/AIServiceAdapter.ts';
import {
  PaymentAdapter,
  type PaymentMethod,
  type PaymentReceipt,
} from '../adapters/PaymentAdapter.ts';
import {
  type SqlExecutor,
  type SqlExecutorOptions,
  createSqlExecutor,
} from '../db/SqlExecutor.ts';
import { initializeSchema } from '../db/schema.ts';
import { seedInitialCatalogIfEmpty } from '../db/seed.ts';
import {
  type AuthSessionRow,
  type ChatMessageRow,
  type LearningMaterialRow,
  type MentorSessionRow,
  type PaymentReceiptRow,
  type SkillNodeRow,
  type SkillTreeRow,
  type TeamMemberRow,
  type TeamRow,
  type UserRow,
  mapChatMessage,
  mapLearningMaterial,
  mapMentorSession,
  mapPaymentReceipt,
  mapSkillNode,
  mapSkillTree,
  mapUserEntity,
} from '../db/mappers.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from './errors.ts';

const DUMMY_SCRYPT_HASH = User.hashPassword('timing-equalization-placeholder-secret');

export interface RepositoryOptions {
  skipSeed?: boolean;
}

export interface RegisterUserParams {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  targetProfession?: string;
  level?: SkillLevel;
  bio?: string;
  hourlyRate?: number;
  specialization?: string;
  company?: string;
}

export interface UpdateProfileParams {
  fullName?: string;
  targetProfession?: string;
  level?: SkillLevel;
  specialization?: string;
  bio?: string;
  hourlyRate?: number;
  company?: string;
}

export interface CreateSessionParams {
  userId: number;
  tokenHash: string;
  deviceLabel: string;
  userAgent: string;
  ipAddress: string;
  rememberMe: boolean;
}

export interface PublicAuthSession {
  id: string;
  deviceLabel: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface PublicMentorDTO {
  id: number;
  fullName: string;
  role: 'MENTOR';
  bio: string;
  hourlyRate: number;
  rating: number;
  specialization: string;
  publishedMaterialsCount: number;
  activeBookingsCount: number;
  availabilityStatus: string;
  createdAt: string;
}

export interface CatalogNodeDTO {
  nodeId: number;
  nodeTitle: string;
  treeId: number;
  treeTitle: string;
  profession: string;
  ownerName: string;
}

/**
 * Центральний репозиторій збереження та завантаження доменних сутностей у SQLite / Turso libSQL.
 */
export class SkillTreeRepository {
  readonly db: SqlExecutor;
  readonly aiAdapter = new AIServiceAdapter();
  readonly paymentAdapter = new PaymentAdapter();
  private readonly skipSeed: boolean;
  private initPromise: Promise<void> | null = null;
  private domainIdSeq = 0;

  constructor(
    dbOrOptions?: SqlExecutor | SqlExecutorOptions,
    repoOptions: RepositoryOptions = {}
  ) {
    if (
      dbOrOptions &&
      typeof (dbOrOptions as SqlExecutor).query === 'function' &&
      typeof (dbOrOptions as SqlExecutor).execute === 'function'
    ) {
      this.db = dbOrOptions as SqlExecutor;
    } else {
      this.db = createSqlExecutor(dbOrOptions as SqlExecutorOptions | undefined);
    }
    this.skipSeed = Boolean(repoOptions.skipSeed);
  }

  private nextTempId = (): number => {
    this.domainIdSeq += 1;
    return this.domainIdSeq;
  };

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await initializeSchema(this.db);
        if (!this.skipSeed) {
          await seedInitialCatalogIfEmpty(this.db);
        }
      })().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  // ===========================================================================
  // AUTH RATE LIMITING (DB-BACKED)
  // ===========================================================================
  async checkAuthThrottle(key: string, maxAttempts = 12, windowMs = 15 * 60_000): Promise<void> {
    const row = await this.db.queryOne<{
      attempts: number;
      window_started_at: number;
      blocked_until: number | null;
    }>('SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE key = ?', [
      key,
    ]);

    if (!row) return;
    const now = Date.now();
    if (row.blocked_until && Number(row.blocked_until) > now) {
      const retrySec = Math.ceil((Number(row.blocked_until) - now) / 1000);
      throw new TooManyRequestsError(
        `Забагато невдалих спроб входу. Повторіть через ${retrySec} с.`,
        retrySec
      );
    }
    if (now - Number(row.window_started_at) <= windowMs && Number(row.attempts) >= maxAttempts) {
      const retrySec = Math.ceil((Number(row.window_started_at) + windowMs - now) / 1000);
      throw new TooManyRequestsError(
        `Перевищено ліміт спроб входу. Повторіть через ${retrySec} с.`,
        retrySec
      );
    }
  }

  async recordAuthFailure(
    key: string,
    maxAttempts = 12,
    windowMs = 15 * 60_000,
    blockMs = 15 * 60_000
  ): Promise<void> {
    const now = Date.now();
    await this.db.transaction(async (tx) => {
      const row = await tx.queryOne<{
        attempts: number;
        window_started_at: number;
        blocked_until: number | null;
      }>('SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE key = ?', [
        key,
      ]);

      if (!row || now - Number(row.window_started_at) > windowMs) {
        await tx.execute(
          `INSERT INTO auth_rate_limits (key, attempts, window_started_at, blocked_until)
           VALUES (?, 1, ?, NULL)
           ON CONFLICT(key) DO UPDATE SET attempts = 1, window_started_at = ?, blocked_until = NULL`,
          [key, now, now]
        );
        return;
      }

      const nextAttempts = Number(row.attempts) + 1;
      const blockedUntil = nextAttempts >= maxAttempts ? now + blockMs : null;
      await tx.execute(
        'UPDATE auth_rate_limits SET attempts = ?, blocked_until = ? WHERE key = ?',
        [nextAttempts, blockedUntil, key]
      );
    });
  }

  async clearAuthThrottle(key: string): Promise<void> {
    await this.db.execute('DELETE FROM auth_rate_limits WHERE key = ?', [key]);
  }

  // ===========================================================================
  // USERS, AUTH & SESSIONS
  // ===========================================================================
  async registerUser(params: RegisterUserParams): Promise<Learner | Mentor | HRManager> {
    const email = params.email.trim().toLowerCase();
    const existing = await this.db.queryOne<{ id: number }>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing) {
      throw new ConflictError('Користувач із таким email вже зареєстрований.');
    }

    const passwordHash = User.hashPassword(params.password);
    const createdAt = new Date().toISOString();

    const userId = await this.db.transaction(async (tx) => {
      if (params.role === 'MENTOR') {
        const res = await tx.execute(
          `INSERT INTO users (
            role, full_name, email, password_hash, created_at,
            bio, hourly_rate, rating, specialization
          ) VALUES ('MENTOR', ?, ?, ?, ?, ?, ?, 5.0, ?)`,
          [
            params.fullName.trim(),
            email,
            passwordHash,
            createdAt,
            (params.bio ?? 'Практикуючий ментор на платформі SkillTree AI').trim(),
            params.hourlyRate ?? 900,
            (params.specialization ?? 'Full-Stack Development').trim(),
          ]
        );
        return res.lastInsertRowid;
      }

      if (params.role === 'HR') {
        const res = await tx.execute(
          `INSERT INTO users (
            role, full_name, email, password_hash, created_at, company
          ) VALUES ('HR', ?, ?, ?, ?, ?)`,
          [
            params.fullName.trim(),
            email,
            passwordHash,
            createdAt,
            (params.company ?? 'IT Company Ukraine').trim(),
          ]
        );
        return res.lastInsertRowid;
      }

      const profession = (params.targetProfession ?? 'Full-Stack Developer').trim();
      const level = params.level ?? SkillLevel.BEGINNER;
      const res = await tx.execute(
        `INSERT INTO users (
          role, full_name, email, password_hash, created_at,
          target_profession, skill_level, points, badges_json
        ) VALUES ('LEARNER', ?, ?, ?, ?, ?, ?, 0, '[]')`,
        [params.fullName.trim(), email, passwordHash, createdAt, profession, level]
      );
      const newLearnerId = res.lastInsertRowid;
      const starterTree = this.aiAdapter.generateSkillTree(
        this.nextTempId,
        newLearnerId,
        profession,
        level
      );
      await this.insertSkillTreeGraph(tx, newLearnerId, starterTree);
      return newLearnerId;
    });

    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('Не вдалося завантажити створеного користувача.');
    }
    return user;
  }

  async authenticateUser(
    email: string,
    password: string,
    throttleKey?: string
  ): Promise<Learner | Mentor | HRManager> {
    if (throttleKey) {
      await this.checkAuthThrottle(throttleKey);
    }

    const row = await this.db.queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [
      email.trim().toLowerCase(),
    ]);

    const hashToCheck = row ? String(row.password_hash) : DUMMY_SCRYPT_HASH;
    const isPasswordValid = User.verifyPassword(password, hashToCheck);

    if (!row || !isPasswordValid) {
      if (throttleKey) {
        await this.recordAuthFailure(throttleKey);
      }
      throw new UnauthorizedError('Невірний email або пароль.');
    }

    if (throttleKey) {
      await this.clearAuthThrottle(throttleKey);
    }

    const user = await this.hydrateUser(row);
    user.isLoggedIn = true;
    return user;
  }

  async findUserById(id: number): Promise<Learner | Mentor | HRManager | null> {
    const row = await this.db.queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
    if (!row) return null;
    return this.hydrateUser(row);
  }

  async findUserByEmail(email: string): Promise<Learner | Mentor | HRManager | null> {
    const row = await this.db.queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [
      email.trim().toLowerCase(),
    ]);
    if (!row) return null;
    return this.hydrateUser(row);
  }

  async updateUserProfile(
    userId: number,
    patch: UpdateProfileParams
  ): Promise<Learner | Mentor | HRManager> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('Користувача не знайдено.');
    }

    if (patch.fullName) {
      user.fullName = patch.fullName;
    }

    if (user instanceof Learner) {
      if (patch.targetProfession) user.targetProfession = patch.targetProfession;
      if (patch.level) user.level = patch.level;
      await this.db.execute(
        'UPDATE users SET full_name = ?, target_profession = ?, skill_level = ? WHERE id = ?',
        [user.fullName, user.targetProfession, user.level, user.id]
      );
    } else if (user instanceof Mentor) {
      if (patch.specialization) user.specialization = patch.specialization;
      if (patch.bio) user.bio = patch.bio;
      if (patch.hourlyRate !== undefined) user.hourlyRate = patch.hourlyRate;
      await this.db.execute(
        'UPDATE users SET full_name = ?, specialization = ?, bio = ?, hourly_rate = ? WHERE id = ?',
        [user.fullName, user.specialization, user.bio, user.hourlyRate, user.id]
      );
    } else if (user instanceof HRManager) {
      if (patch.company) user.company = patch.company;
      await this.db.execute('UPDATE users SET full_name = ?, company = ? WHERE id = ?', [
        user.fullName,
        user.company,
        user.id,
      ]);
    }

    const updated = await this.findUserById(user.id);
    if (!updated) throw new NotFoundError('Користувача не знайдено.');
    return updated;
  }

  async changeUserPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string | null
  ): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('Користувача не знайдено.');
    }
    if (!User.verifyPassword(currentPassword, user.getPasswordHash())) {
      throw new UnauthorizedError('Поточний пароль введено невірно.');
    }

    user.resetPassword(newPassword);
    const now = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      await tx.execute('UPDATE users SET password_hash = ? WHERE id = ?', [
        user.getPasswordHash(),
        user.id,
      ]);
      if (currentSessionId) {
        await tx.execute(
          'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL',
          [now, user.id, currentSessionId]
        );
      } else {
        await tx.execute(
          'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
          [now, user.id]
        );
      }
    });
  }

  async createAuthSession(
    params: CreateSessionParams
  ): Promise<{ id: string; expiresAt: string }> {
    const id = randomUUID();
    const now = new Date();
    const ttlMs = (params.rememberMe ? 7 : 1) * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const nowIso = now.toISOString();

    await this.db.execute(
      `INSERT INTO auth_sessions (
        id, user_id, token_hash, device_label, user_agent, ip_address,
        created_at, last_seen_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.userId,
        params.tokenHash,
        params.deviceLabel,
        params.userAgent,
        params.ipAddress,
        nowIso,
        nowIso,
        expiresAt,
      ]
    );

    return { id, expiresAt };
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<{
    session: AuthSessionRow;
    user: Learner | Mentor | HRManager;
  } | null> {
    const row = await this.db.queryOne<AuthSessionRow>(
      'SELECT * FROM auth_sessions WHERE token_hash = ?',
      [tokenHash]
    );
    if (!row || row.revoked_at !== null) {
      return null;
    }

    const nowMs = Date.now();
    if (new Date(String(row.expires_at)).getTime() <= nowMs) {
      return null;
    }

    const user = await this.findUserById(Number(row.user_id));
    if (!user) {
      return null;
    }
    user.isLoggedIn = true;

    const lastSeenMs = new Date(String(row.last_seen_at)).getTime();
    if (nowMs - lastSeenMs > 60_000) {
      const nowIso = new Date(nowMs).toISOString();
      await this.db.execute('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?', [
        nowIso,
        row.id,
      ]);
      row.last_seen_at = nowIso;
    }

    return { session: row, user };
  }

  async listUserAuthSessions(
    userId: number,
    currentSessionId: string | null
  ): Promise<PublicAuthSession[]> {
    const nowIso = new Date().toISOString();
    const rows = await this.db.query<AuthSessionRow>(
      `SELECT id, device_label, user_agent, ip_address, created_at, last_seen_at, expires_at
       FROM auth_sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY last_seen_at DESC`,
      [userId, nowIso]
    );

    return rows.map((row) => ({
      id: String(row.id),
      deviceLabel: String(row.device_label),
      userAgent: String(row.user_agent),
      ipAddress: String(row.ip_address),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      expiresAt: String(row.expires_at),
      isCurrent: currentSessionId !== null && String(row.id) === currentSessionId,
    }));
  }

  async revokeAuthSession(userId: number, sessionId: string): Promise<void> {
    const row = await this.db.queryOne<{ id: string; user_id: number; revoked_at: string | null }>(
      'SELECT id, user_id, revoked_at FROM auth_sessions WHERE id = ?',
      [sessionId]
    );
    if (!row) {
      throw new NotFoundError('Сесію не знайдено.');
    }
    if (Number(row.user_id) !== userId) {
      throw new ForbiddenError('Заборонено відкликати сесію іншого користувача.');
    }
    if (row.revoked_at === null) {
      await this.db.execute('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?', [
        new Date().toISOString(),
        sessionId,
      ]);
    }
  }

  async revokeOtherAuthSessions(userId: number, currentSessionId: string): Promise<number> {
    const res = await this.db.execute(
      'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL',
      [new Date().toISOString(), userId, currentSessionId]
    );
    return res.changes;
  }

  // ===========================================================================
  // SKILL TREES, NODES & AI CHAT
  // ===========================================================================
  async generateSkillTreeForLearner(
    learnerId: number,
    profession: string,
    level: SkillLevel
  ): Promise<SkillTree> {
    const user = await this.findUserById(learnerId);
    if (!(user instanceof Learner)) {
      throw new NotFoundError('Студента не знайдено.');
    }

    const generated = user.requestSkillTree(profession, level, (id, prof, lvl) =>
      this.aiAdapter.generateSkillTree(this.nextTempId, id, prof, lvl)
    );

    const newTreeId = await this.db.transaction(async (tx) => {
      await tx.execute('UPDATE users SET target_profession = ?, skill_level = ? WHERE id = ?', [
        profession,
        level,
        learnerId,
      ]);
      return this.insertSkillTreeGraph(tx, learnerId, generated);
    });

    const loaded = await this.loadSingleTree(newTreeId);
    if (!loaded) throw new Error('Не вдалося завантажити створену карту.');
    return loaded;
  }

  async addNodeToTree(
    actorId: number,
    treeId: number,
    input: {
      title: string;
      description: string;
      materialTitle?: string;
      materialUrl?: string;
    }
  ): Promise<SkillNode> {
    const treeRow = await this.db.queryOne<SkillTreeRow>('SELECT * FROM skill_trees WHERE id = ?', [
      treeId,
    ]);
    if (!treeRow) {
      throw new NotFoundError('Карту розвитку не знайдено.');
    }
    if (Number(treeRow.learner_id) !== actorId) {
      throw new ForbiddenError('Ви можете змінювати лише власну карту розвитку.');
    }

    const nodeId = await this.db.transaction(async (tx) => {
      const orderRow = await tx.queryOne<{ max_order: number | null }>(
        'SELECT MAX(order_number) AS max_order FROM skill_nodes WHERE tree_id = ?',
        [treeId]
      );
      const nextOrder = Number(orderRow?.max_order ?? 0) + 1;
      const nodeRes = await tx.execute(
        'INSERT INTO skill_nodes (tree_id, title, order_number, status, description) VALUES (?, ?, ?, ?, ?)',
        [treeId, input.title, nextOrder, NodeStatus.NOT_STARTED, input.description]
      );
      const createdNodeId = nodeRes.lastInsertRowid;

      if (input.materialTitle || input.materialUrl) {
        await tx.execute(
          `INSERT INTO learning_materials (node_id, author_id, title, type, url, description, content, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            createdNodeId,
            actorId,
            input.materialTitle || `Матеріал: ${input.title}`,
            input.materialUrl ? MaterialType.LINK : MaterialType.TEXT,
            input.materialUrl ?? '',
            `Навчальний ресурс до вузла «${input.title}»`,
            input.materialUrl
              ? `Зовнішній ресурс: ${input.materialUrl}`
              : `Конспект модуля «${input.title}»`,
            new Date().toISOString(),
          ]
        );
      }

      return createdNodeId;
    });

    const node = await this.loadSingleNode(nodeId);
    if (!node) throw new Error('Не вдалося завантажити створений вузол.');
    return node;
  }

  async updateNodeStatus(
    actorId: number,
    treeId: number,
    nodeId: number,
    input: { status?: NodeStatus; action?: 'start' | 'complete' }
  ): Promise<{
    node: SkillNode;
    treeProgress: number;
    learnerPoints: number;
    badges: string[];
  }> {
    return this.db.transaction(async (tx) => {
      const treeRow = await tx.queryOne<SkillTreeRow>('SELECT * FROM skill_trees WHERE id = ?', [
        treeId,
      ]);
      if (!treeRow) {
        throw new NotFoundError('Карту розвитку не знайдено.');
      }
      if (Number(treeRow.learner_id) !== actorId) {
        throw new ForbiddenError('Заборонено змінювати статус вузла у чужій карті.');
      }

      const learnerRow = await tx.queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [actorId]);
      if (!learnerRow || learnerRow.role !== 'LEARNER') {
        throw new NotFoundError('Студента не знайдено.');
      }

      const treeMap = await this.loadTreesForLearners([actorId], tx);
      const trees = treeMap.get(actorId) ?? [];
      const learner = mapUserEntity(learnerRow, { skillTrees: trees }) as Learner;
      const tree = learner.skillTrees.find((t) => t.id === treeId);
      if (!tree) {
        throw new NotFoundError('Карту розвитку не знайдено.');
      }
      const node = tree.nodes.find((n) => n.id === nodeId);
      if (!node) {
        throw new NotFoundError('Вузол карти не знайдено.');
      }

      const prevPoints = learner.points;
      const prevBadgesJson = JSON.stringify(learner.badges);

      if (input.action === 'complete' || input.status === NodeStatus.DONE) {
        learner.completeNode(tree.id, node.id);
      } else if (input.action === 'start' || input.status === NodeStatus.IN_PROGRESS) {
        node.start();
      } else {
        throw new BadRequestError(
          'Некоректна дія або статус вузла. Допустимі значення: IN_PROGRESS / DONE або action: start / complete.'
        );
      }

      await tx.execute('UPDATE skill_nodes SET status = ? WHERE id = ?', [node.status, node.id]);

      const nextBadgesJson = JSON.stringify(learner.badges);
      if (learner.points !== prevPoints || nextBadgesJson !== prevBadgesJson) {
        await tx.execute('UPDATE users SET points = ?, badges_json = ? WHERE id = ?', [
          learner.points,
          nextBadgesJson,
          learner.id,
        ]);
      }

      return {
        node,
        treeProgress: tree.calculateProgress(),
        learnerPoints: learner.points,
        badges: [...learner.badges],
      };
    });
  }

  async deleteNodeFromTree(actorId: number, treeId: number, nodeId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const treeRow = await tx.queryOne<SkillTreeRow>('SELECT * FROM skill_trees WHERE id = ?', [
        treeId,
      ]);
      if (!treeRow) {
        throw new NotFoundError('Карту розвитку не знайдено.');
      }
      if (Number(treeRow.learner_id) !== actorId) {
        throw new ForbiddenError('Заборонено видаляти вузли з чужої карти.');
      }

      const treeMap = await this.loadTreesForLearners([actorId], tx);
      const tree = (treeMap.get(actorId) ?? []).find((t) => t.id === treeId);
      if (!tree) {
        throw new NotFoundError('Карту розвитку не знайдено.');
      }

      const hasNode = tree.nodes.some((n) => n.id === nodeId);
      if (!hasNode) {
        throw new NotFoundError('Вузол карти не знайдено.');
      }

      const removed = tree.removeNode(nodeId);
      if (!removed) {
        throw new BadRequestError(
          'Неможливо видалити останній вузол карти розвитку (композиція 1 : 1..*).'
        );
      }

      await tx.execute('DELETE FROM skill_nodes WHERE id = ?', [nodeId]);
      for (const remainingNode of tree.nodes) {
        await tx.execute('UPDATE skill_nodes SET order_number = ? WHERE id = ?', [
          remainingNode.orderNumber,
          remainingNode.id,
        ]);
      }
    });
  }

  async askNodeAssistant(
    actorId: number,
    treeId: number,
    nodeId: number,
    question: string
  ): Promise<{ message: ChatMessage; source: 'gemini' | 'openai' | 'local' }> {
    const treeRow = await this.db.queryOne<SkillTreeRow>('SELECT * FROM skill_trees WHERE id = ?', [
      treeId,
    ]);
    if (!treeRow) {
      throw new NotFoundError('Карту розвитку не знайдено.');
    }
    if (Number(treeRow.learner_id) !== actorId) {
      throw new ForbiddenError('Заборонено звертатися до ШІ в контексті чужої карти.');
    }

    const treeMap = await this.loadTreesForLearners([actorId]);
    const tree = (treeMap.get(actorId) ?? []).find((t) => t.id === treeId);
    const node = tree?.nodes.find((n) => n.id === nodeId);
    if (!tree || !node) {
      throw new NotFoundError('Вузол карти не знайдено.');
    }

    const aiReply = await this.aiAdapter.generateAssistantAnswerAsync(node, tree, question);
    const createdAt = new Date().toISOString();

    const res = await this.db.execute(
      `INSERT INTO chat_messages (node_id, learner_id, question, answer, response_time_ms, is_helpful, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [node.id, actorId, question, aiReply.answer, aiReply.responseTimeMs, createdAt]
    );

    const message = new ChatMessage({
      id: res.lastInsertRowid,
      nodeId: node.id,
      learnerId: actorId,
      question,
      answer: aiReply.answer,
      responseTimeMs: aiReply.responseTimeMs,
      isHelpful: null,
      createdAt,
    });

    return { message, source: aiReply.source };
  }

  async rateChatMessage(
    actorId: number,
    messageId: number,
    helpful: boolean
  ): Promise<ChatMessage> {
    const row = await this.db.queryOne<ChatMessageRow>('SELECT * FROM chat_messages WHERE id = ?', [
      messageId,
    ]);
    if (!row) {
      throw new NotFoundError('Повідомлення ШІ-асистента не знайдено.');
    }
    if (Number(row.learner_id) !== actorId) {
      throw new ForbiddenError('Заборонено оцінювати чуже повідомлення ШІ.');
    }

    const message = mapChatMessage(row);
    message.rate(helpful);

    await this.db.execute('UPDATE chat_messages SET is_helpful = ? WHERE id = ?', [
      message.isHelpful ? 1 : 0,
      message.id,
    ]);

    return message;
  }

  // ===========================================================================
  // MENTORS, MATERIALS, SESSIONS & PAYMENTS
  // ===========================================================================
  async listPublicMentors(): Promise<PublicMentorDTO[]> {
    const rows = await this.db.query<
      UserRow & { published_count: number; active_bookings_count: number }
    >(
      `SELECT u.*,
        (SELECT COUNT(*) FROM learning_materials lm WHERE lm.author_id = u.id) AS published_count,
        (SELECT COUNT(*) FROM mentor_sessions ms WHERE ms.mentor_id = u.id AND ms.status IN ('BOOKED', 'CONFIRMED')) AS active_bookings_count
       FROM users u
       WHERE u.role = 'MENTOR'
       ORDER BY u.rating DESC, u.id ASC`
    );

    return rows.map((row) => {
      const activeBookings = Number(row.active_bookings_count ?? 0);
      return {
        id: Number(row.id),
        fullName: String(row.full_name),
        role: 'MENTOR',
        bio: String(row.bio ?? ''),
        hourlyRate: Number(row.hourly_rate ?? 850),
        rating: Number(row.rating ?? 5.0),
        specialization: String(row.specialization ?? 'Full-Stack Development'),
        publishedMaterialsCount: Number(row.published_count ?? 0),
        activeBookingsCount: activeBookings,
        availabilityStatus: activeBookings >= 3 ? 'Обмежені слоти' : 'Вільний слот',
        createdAt: String(row.created_at),
      };
    });
  }

  async publishMaterial(
    mentorId: number,
    nodeId: number,
    input: {
      title: string;
      url: string;
      type: MaterialType;
      description: string;
      content: string;
    }
  ): Promise<LearningMaterial> {
    const mentor = await this.findUserById(mentorId);
    if (!(mentor instanceof Mentor)) {
      throw new ForbiddenError('Лише ментор може публікувати матеріали.');
    }

    const nodeRow = await this.db.queryOne<SkillNodeRow>('SELECT * FROM skill_nodes WHERE id = ?', [
      nodeId,
    ]);
    if (!nodeRow) {
      throw new NotFoundError('Вузол карти не знайдено.');
    }

    const domainNode = mapSkillNode(nodeRow);
    const material = mentor.publishMaterial(
      domainNode,
      input.title,
      input.url,
      input.type,
      input.description,
      input.content,
      this.nextTempId
    );
    const publishedAt = material.publishedAt.toISOString();

    const res = await this.db.execute(
      `INSERT INTO learning_materials (node_id, author_id, title, type, url, description, content, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        mentor.id,
        material.title,
        material.type,
        material.url,
        material.description ?? '',
        material.content ?? '',
        publishedAt,
      ]
    );

    material.id = res.lastInsertRowid;
    return material;
  }

  async bookSession(
    learnerId: number,
    input: {
      mentorId: number;
      topic: string;
      startAt: Date;
      durationMin: number;
      payImmediately?: boolean;
      paymentMethod?: PaymentMethod;
    }
  ): Promise<{ session: MentorSession; receipt: PaymentReceipt | null }> {
    return this.db.transaction(async (tx) => {
      const learnerRow = await tx.queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [
        learnerId,
      ]);
      const mentorRow = await tx.queryOne<UserRow>(
        "SELECT * FROM users WHERE id = ? AND role = 'MENTOR'",
        [input.mentorId]
      );

      if (!learnerRow || learnerRow.role !== 'LEARNER') {
        throw new ForbiddenError('Бронювати консультацію може лише студент.');
      }
      if (!mentorRow) {
        throw new NotFoundError('Ментора не знайдено.');
      }

      const learner = mapUserEntity(learnerRow) as Learner;
      const mentor = mapUserEntity(mentorRow) as Mentor;
      const session = learner.bookSession(
        mentor,
        input.startAt,
        input.topic,
        input.durationMin,
        this.nextTempId
      );

      const createdAt = new Date().toISOString();
      const insertRes = await tx.execute(
        `INSERT INTO mentor_sessions (
          learner_id, mentor_id, topic, start_at, duration_min, price,
          status, payment_status, rating, feedback, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        [
          learner.id,
          mentor.id,
          session.topic,
          session.startAt.toISOString(),
          session.durationMin,
          session.price,
          session.status,
          session.paymentStatus,
          createdAt,
        ]
      );
      session.id = insertRes.lastInsertRowid;

      let receipt: PaymentReceipt | null = null;
      if (input.payImmediately) {
        receipt = this.paymentAdapter.processPayment(session, input.paymentMethod ?? 'CARD');
        await tx.execute('UPDATE mentor_sessions SET payment_status = ? WHERE id = ?', [
          session.paymentStatus,
          session.id,
        ]);
        await tx.execute(
          `INSERT INTO payment_receipts (transaction_id, session_id, amount, currency, method, status, processed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            receipt.transactionId,
            receipt.sessionId,
            receipt.amount,
            receipt.currency,
            receipt.method,
            receipt.status,
            receipt.processedAt,
          ]
        );
      }

      return { session, receipt };
    });
  }

  async paySession(
    learnerId: number,
    sessionId: number,
    paymentMethod: PaymentMethod = 'CARD'
  ): Promise<{ session: MentorSession; receipt: PaymentReceipt }> {
    return this.db.transaction(async (tx) => {
      const row = await tx.queryOne<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE id = ?',
        [sessionId]
      );
      if (!row) {
        throw new NotFoundError('Сесію не знайдено.');
      }
      if (Number(row.learner_id) !== learnerId) {
        throw new ForbiddenError('Заборонено оплачувати чужу менторську сесію.');
      }

      const session = mapMentorSession(row);
      const receipt = this.paymentAdapter.processPayment(session, paymentMethod);

      await tx.execute('UPDATE mentor_sessions SET payment_status = ? WHERE id = ?', [
        session.paymentStatus,
        session.id,
      ]);
      await tx.execute(
        `INSERT INTO payment_receipts (transaction_id, session_id, amount, currency, method, status, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          receipt.transactionId,
          receipt.sessionId,
          receipt.amount,
          receipt.currency,
          receipt.method,
          receipt.status,
          receipt.processedAt,
        ]
      );

      return { session, receipt };
    });
  }

  async confirmSession(mentorId: number, sessionId: number): Promise<MentorSession> {
    return this.db.transaction(async (tx) => {
      const row = await tx.queryOne<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE id = ?',
        [sessionId]
      );
      if (!row) {
        throw new NotFoundError('Сесію не знайдено.');
      }
      if (Number(row.mentor_id) !== mentorId) {
        throw new ForbiddenError('Підтверджувати сесію може лише призначений ментор.');
      }

      const mentorRow = await tx.queryOne<UserRow>(
        "SELECT * FROM users WHERE id = ? AND role = 'MENTOR'",
        [mentorId]
      );
      if (!mentorRow) {
        throw new NotFoundError('Ментора не знайдено.');
      }

      const mentor = mapUserEntity(mentorRow) as Mentor;
      const session = mapMentorSession(row);
      mentor.confirmSession(session);

      await tx.execute('UPDATE mentor_sessions SET status = ? WHERE id = ?', [
        session.status,
        session.id,
      ]);
      return session;
    });
  }

  async cancelSession(actorId: number, sessionId: number): Promise<MentorSession> {
    return this.db.transaction(async (tx) => {
      const row = await tx.queryOne<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE id = ?',
        [sessionId]
      );
      if (!row) {
        throw new NotFoundError('Сесію не знайдено.');
      }
      if (Number(row.learner_id) !== actorId && Number(row.mentor_id) !== actorId) {
        throw new ForbiddenError('Заборонено скасовувати чужу сесію.');
      }

      const session = mapMentorSession(row);
      const wasPaid = session.paymentStatus === PaymentStatus.PAID;
      session.cancel();

      await tx.execute('UPDATE mentor_sessions SET status = ?, payment_status = ? WHERE id = ?', [
        session.status,
        session.paymentStatus,
        session.id,
      ]);

      if (wasPaid && session.paymentStatus === PaymentStatus.REFUNDED) {
        await tx.execute('UPDATE payment_receipts SET status = ? WHERE session_id = ?', [
          PaymentStatus.REFUNDED,
          session.id,
        ]);
      }

      return session;
    });
  }

  async leaveSessionFeedback(
    learnerId: number,
    sessionId: number,
    rating: number,
    feedback: string
  ): Promise<{ session: MentorSession; mentorRating: number }> {
    return this.db.transaction(async (tx) => {
      const row = await tx.queryOne<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE id = ?',
        [sessionId]
      );
      if (!row) {
        throw new NotFoundError('Сесію не знайдено.');
      }
      if (Number(row.learner_id) !== learnerId) {
        throw new ForbiddenError('Залишити відгук може лише студент цієї сесії.');
      }

      const mentorRow = await tx.queryOne<UserRow>(
        "SELECT * FROM users WHERE id = ? AND role = 'MENTOR'",
        [row.mentor_id]
      );
      if (!mentorRow) {
        throw new NotFoundError('Ментора не знайдено.');
      }

      const sessionRows = await tx.query<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE mentor_id = ?',
        [mentorRow.id]
      );
      const mentorSessions = sessionRows.map((s) => mapMentorSession(s));
      const targetSession = mentorSessions.find((s) => s.id === sessionId);
      if (!targetSession) {
        throw new NotFoundError('Сесію не знайдено.');
      }

      const mentor = mapUserEntity(mentorRow, { sessions: mentorSessions }) as Mentor;
      targetSession.leaveFeedback(rating, feedback);
      const mentorRating = mentor.recalculateRating();

      await tx.execute(
        'UPDATE mentor_sessions SET rating = ?, feedback = ?, status = ? WHERE id = ?',
        [targetSession.rating, targetSession.feedback, targetSession.status, targetSession.id]
      );
      await tx.execute('UPDATE users SET rating = ? WHERE id = ?', [mentorRating, mentor.id]);

      return { session: targetSession, mentorRating };
    });
  }

  // ===========================================================================
  // B2B HR TEAMS & SKILL MATRIX
  // ===========================================================================
  async createTeam(hrId: number, name: string): Promise<Team> {
    const hr = await this.findUserById(hrId);
    if (!(hr instanceof HRManager)) {
      throw new ForbiddenError('Створювати команди може лише HR-менеджер.');
    }

    const team = hr.createTeam(name, this.nextTempId);
    const createdAt = new Date().toISOString();
    const res = await this.db.execute(
      'INSERT INTO teams (name, hr_manager_id, created_at) VALUES (?, ?, ?)',
      [team.name, hr.id, createdAt]
    );
    team.id = res.lastInsertRowid;
    return team;
  }

  async addTeamMember(hrId: number, teamId: number, learnerId: number): Promise<Team> {
    const teamRow = await this.db.queryOne<TeamRow>('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!teamRow) {
      throw new NotFoundError('Команду не знайдено.');
    }
    if (Number(teamRow.hr_manager_id) !== hrId) {
      throw new ForbiddenError('Заборонено змінювати склад чужої команди.');
    }

    const learner = await this.findUserById(learnerId);
    if (!(learner instanceof Learner)) {
      throw new NotFoundError('Працівника не знайдено.');
    }

    await this.db.execute(
      'INSERT OR IGNORE INTO team_members (team_id, learner_id, added_at) VALUES (?, ?, ?)',
      [teamId, learnerId, new Date().toISOString()]
    );

    return this.getTeamDetailed(hrId, teamId);
  }

  async getTeamDetailed(hrId: number, teamId: number): Promise<Team> {
    const teamRow = await this.db.queryOne<TeamRow>('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!teamRow) {
      throw new NotFoundError('Команду не знайдено.');
    }
    if (Number(teamRow.hr_manager_id) !== hrId) {
      throw new ForbiddenError('Доступ до аналітики цієї команди обмежено її HR-власником.');
    }

    const hydrated = await this.hydrateTeams([teamRow]);
    return hydrated[0];
  }

  async assignTreeToLearner(
    hrId: number,
    input: {
      teamId?: number;
      learnerId: number;
      sourceTreeId?: number;
      profession?: string;
      level?: SkillLevel;
    }
  ): Promise<SkillTree> {
    const hr = await this.findUserById(hrId);
    if (!(hr instanceof HRManager)) {
      throw new ForbiddenError('Призначати карти розвитку може лише HR-менеджер.');
    }

    if (input.teamId !== undefined) {
      const teamRow = await this.db.queryOne<TeamRow>('SELECT * FROM teams WHERE id = ?', [
        input.teamId,
      ]);
      if (!teamRow) throw new NotFoundError('Команду не знайдено.');
      if (Number(teamRow.hr_manager_id) !== hrId) {
        throw new ForbiddenError('Заборонено призначати карти в чужій команді.');
      }
    }

    const learner = await this.findUserById(input.learnerId);
    if (!(learner instanceof Learner)) {
      throw new NotFoundError('Співробітника не знайдено.');
    }

    let templateTree: SkillTree | null = null;
    if (input.sourceTreeId !== undefined) {
      templateTree = await this.loadSingleTree(input.sourceTreeId);
      if (!templateTree) {
        throw new NotFoundError('Шаблонну карту розвитку не знайдено.');
      }
    } else {
      const profession = (input.profession ?? 'Full-Stack Developer').trim();
      const level = input.level ?? SkillLevel.INTERMEDIATE;
      templateTree = this.aiAdapter.generateSkillTree(
        this.nextTempId,
        learner.id,
        profession,
        level
      );
    }

    const clonedTree = hr.assignSkillTree(learner, templateTree, this.nextTempId);
    const createdTreeId = await this.db.transaction(async (tx) => {
      return this.insertSkillTreeGraph(tx, learner.id, clonedTree);
    });

    const persisted = await this.loadSingleTree(createdTreeId);
    if (!persisted) throw new Error('Не вдалося завантажити призначену карту.');
    return persisted;
  }

  async exportTeamReport(hrId: number, teamId: number, format = 'CSV'): Promise<string> {
    const hr = await this.findUserById(hrId);
    if (!(hr instanceof HRManager)) {
      throw new ForbiddenError('Експорт звітів доступний лише HR-менеджеру.');
    }
    const team = await this.getTeamDetailed(hrId, teamId);
    return hr.exportReport(team, format);
  }

  // ===========================================================================
  // SCOPED STATE (LEAST PRIVILEGE PER ROLE)
  // ===========================================================================
  async getScopedState(
    currentUser: Learner | Mentor | HRManager | null,
    currentSessionId: string | null
  ) {
    const mentors = await this.listPublicMentors();
    const professions = this.aiAdapter.getSupportedProfessions();

    if (!currentUser) {
      return {
        currentUser: null,
        mentors,
        learners: [],
        teams: [],
        sessions: [],
        receipts: [],
        authSessions: [],
        catalogNodes: [],
        authorNames: {},
        professions,
      };
    }

    const authSessions = await this.listUserAuthSessions(currentUser.id, currentSessionId);

    if (currentUser instanceof Learner) {
      const learner = (await this.findUserById(currentUser.id)) as Learner;
      learner.isLoggedIn = true;

      const sessionRows = await this.db.query<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE learner_id = ? ORDER BY id DESC',
        [learner.id]
      );
      const sessions = sessionRows.map((r) => mapMentorSession(r));

      const sessionIds = sessions.map((s) => s.id);
      const receipts = await this.loadReceiptsBySessionIds(sessionIds);
      const authorNames = await this.collectAuthorNamesForLearner(learner);

      return {
        currentUser: learner.toJSON(),
        mentors,
        learners: [learner.toJSON()],
        teams: [],
        sessions: sessions.map((s) => s.toJSON()),
        receipts,
        authSessions,
        catalogNodes: [],
        authorNames,
        professions,
      };
    }

    if (currentUser instanceof Mentor) {
      const mentor = (await this.findUserById(currentUser.id)) as Mentor;
      mentor.isLoggedIn = true;

      const sessionRows = await this.db.query<
        MentorSessionRow & { learner_name: string; learner_level: string | null }
      >(
        `SELECT ms.*, u.full_name AS learner_name, u.skill_level AS learner_level
         FROM mentor_sessions ms
         JOIN users u ON u.id = ms.learner_id
         WHERE ms.mentor_id = ?
         ORDER BY ms.id DESC`,
        [mentor.id]
      );

      const sessions = sessionRows.map((row) => ({
        ...mapMentorSession(row).toJSON(),
        learnerName: String(row.learner_name),
        learnerLevel: String(row.learner_level ?? 'BEGINNER'),
      }));

      const publishedMaterialsRows = await this.db.query<
        LearningMaterialRow & { node_title: string; tree_title: string }
      >(
        `SELECT lm.*, sn.title AS node_title, st.title AS tree_title
         FROM learning_materials lm
         JOIN skill_nodes sn ON sn.id = lm.node_id
         JOIN skill_trees st ON st.id = sn.tree_id
         WHERE lm.author_id = ?
         ORDER BY lm.id DESC`,
        [mentor.id]
      );

      const publishedMaterials = publishedMaterialsRows.map((row) => ({
        ...mapLearningMaterial(row).toJSON(),
        nodeId: Number(row.node_id),
        nodeTitle: String(row.node_title),
        treeTitle: String(row.tree_title),
      }));

      const catalogNodeRows = await this.db.query<{
        node_id: number;
        node_title: string;
        tree_id: number;
        tree_title: string;
        profession: string;
        owner_name: string;
      }>(
        `SELECT sn.id AS node_id, sn.title AS node_title,
                st.id AS tree_id, st.title AS tree_title, st.target_profession AS profession,
                u.full_name AS owner_name
         FROM skill_nodes sn
         JOIN skill_trees st ON st.id = sn.tree_id
         JOIN users u ON u.id = st.learner_id
         ORDER BY st.id DESC, sn.order_number ASC
         LIMIT 200`
      );

      const catalogNodes: CatalogNodeDTO[] = catalogNodeRows.map((r) => ({
        nodeId: Number(r.node_id),
        nodeTitle: String(r.node_title),
        treeId: Number(r.tree_id),
        treeTitle: String(r.tree_title),
        profession: String(r.profession),
        ownerName: String(r.owner_name),
      }));

      return {
        currentUser: {
          ...mentor.toJSON(),
          publishedMaterials,
        },
        mentors,
        learners: [],
        teams: [],
        sessions,
        receipts: [],
        authSessions,
        catalogNodes,
        authorNames: { [mentor.id]: mentor.fullName },
        professions,
      };
    }

    // HRManager
    const hr = (await this.findUserById(currentUser.id)) as HRManager;
    hr.isLoggedIn = true;

    const learnerRows = await this.db.query<UserRow>(
      "SELECT * FROM users WHERE role = 'LEARNER' ORDER BY id ASC"
    );
    const learnerIds = learnerRows.map((r) => Number(r.id));
    const treesMap = await this.loadTreesForLearners(learnerIds);
    const hydratedLearners = learnerRows.map((r) =>
      mapUserEntity(r, { skillTrees: treesMap.get(Number(r.id)) ?? [] }) as Learner
    );

    const teamRows = await this.db.query<TeamRow>(
      'SELECT * FROM teams WHERE hr_manager_id = ? ORDER BY id ASC',
      [hr.id]
    );
    const hydratedTeams = await this.hydrateTeams(teamRows, hydratedLearners);

    return {
      currentUser: hr.toJSON(),
      mentors,
      learners: hydratedLearners.map((l) => l.toJSON()),
      teams: hydratedTeams.map((t) => t.toJSON()),
      sessions: [],
      receipts: [],
      authSessions,
      catalogNodes: [],
      authorNames: {},
      professions,
    };
  }

  // ===========================================================================
  // INTERNAL BATCH HYDRATION & GRAPH PERSISTENCE HELPERS
  // ===========================================================================
  private async hydrateUser(row: UserRow): Promise<Learner | Mentor | HRManager> {
    const id = Number(row.id);
    if (row.role === 'LEARNER') {
      const treesMap = await this.loadTreesForLearners([id]);
      return mapUserEntity(row, { skillTrees: treesMap.get(id) ?? [] });
    }

    if (row.role === 'MENTOR') {
      const sessionRows = await this.db.query<MentorSessionRow>(
        'SELECT * FROM mentor_sessions WHERE mentor_id = ? ORDER BY id DESC',
        [id]
      );
      const materialRows = await this.db.query<LearningMaterialRow>(
        'SELECT * FROM learning_materials WHERE author_id = ? ORDER BY id DESC',
        [id]
      );
      return mapUserEntity(row, {
        sessions: sessionRows.map((r) => mapMentorSession(r)),
        publishedMaterials: materialRows.map((r) => mapLearningMaterial(r)),
      });
    }

    const teamRows = await this.db.query<TeamRow>(
      'SELECT * FROM teams WHERE hr_manager_id = ? ORDER BY id ASC',
      [id]
    );
    const teams = teamRows.map((t) => new Team({ id: Number(t.id), name: String(t.name), hrManagerId: id }));
    return mapUserEntity(row, { teams });
  }

  private async insertSkillTreeGraph(
    tx: SqlExecutor,
    learnerId: number,
    tree: SkillTree
  ): Promise<number> {
    const treeRes = await tx.execute(
      `INSERT INTO skill_trees (learner_id, title, target_profession, level, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [learnerId, tree.title, tree.targetProfession, tree.level, tree.createdAt.toISOString()]
    );
    const treeId = treeRes.lastInsertRowid;

    for (const node of tree.nodes) {
      const nodeRes = await tx.execute(
        `INSERT INTO skill_nodes (tree_id, title, order_number, status, description)
         VALUES (?, ?, ?, ?, ?)`,
        [treeId, node.title, node.orderNumber, node.status, node.description]
      );
      const nodeId = nodeRes.lastInsertRowid;

      for (const material of node.materials) {
        await tx.execute(
          `INSERT INTO learning_materials (node_id, author_id, title, type, url, description, content, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nodeId,
            material.authorId ?? null,
            material.title,
            material.type,
            material.url,
            material.description ?? '',
            material.content ?? '',
            material.publishedAt.toISOString(),
          ]
        );
      }
    }

    return treeId;
  }

  private async loadSingleTree(treeId: number): Promise<SkillTree | null> {
    const treeRow = await this.db.queryOne<SkillTreeRow>('SELECT * FROM skill_trees WHERE id = ?', [
      treeId,
    ]);
    if (!treeRow) return null;
    const treesMap = await this.loadTreesForLearners([Number(treeRow.learner_id)]);
    return (treesMap.get(Number(treeRow.learner_id)) ?? []).find((t) => t.id === treeId) ?? null;
  }

  private async loadSingleNode(nodeId: number): Promise<SkillNode | null> {
    const nodeRow = await this.db.queryOne<SkillNodeRow>('SELECT * FROM skill_nodes WHERE id = ?', [
      nodeId,
    ]);
    if (!nodeRow) return null;
    const materialRows = await this.db.query<LearningMaterialRow>(
      'SELECT * FROM learning_materials WHERE node_id = ? ORDER BY id ASC',
      [nodeId]
    );
    const messageRows = await this.db.query<ChatMessageRow>(
      'SELECT * FROM chat_messages WHERE node_id = ? ORDER BY id ASC',
      [nodeId]
    );
    return mapSkillNode(
      nodeRow,
      materialRows.map((m) => mapLearningMaterial(m)),
      messageRows.map((msg) => mapChatMessage(msg))
    );
  }

  private async loadTreesForLearners(
    learnerIds: number[],
    executor: SqlExecutor = this.db
  ): Promise<Map<number, SkillTree[]>> {
    const result = new Map<number, SkillTree[]>();
    if (learnerIds.length === 0) return result;

    const placeholders = learnerIds.map(() => '?').join(', ');
    const treeRows = await executor.query<SkillTreeRow>(
      `SELECT * FROM skill_trees WHERE learner_id IN (${placeholders}) ORDER BY id ASC`,
      learnerIds
    );
    if (treeRows.length === 0) return result;

    const treeIds = treeRows.map((t) => Number(t.id));
    const treePh = treeIds.map(() => '?').join(', ');
    const nodeRows = await executor.query<SkillNodeRow>(
      `SELECT * FROM skill_nodes WHERE tree_id IN (${treePh}) ORDER BY order_number ASC, id ASC`,
      treeIds
    );

    const nodeIds = nodeRows.map((n) => Number(n.id));
    let materialRows: LearningMaterialRow[] = [];
    let messageRows: ChatMessageRow[] = [];

    if (nodeIds.length > 0) {
      const nodePh = nodeIds.map(() => '?').join(', ');
      materialRows = await executor.query<LearningMaterialRow>(
        `SELECT * FROM learning_materials WHERE node_id IN (${nodePh}) ORDER BY id ASC`,
        nodeIds
      );
      messageRows = await executor.query<ChatMessageRow>(
        `SELECT * FROM chat_messages WHERE node_id IN (${nodePh}) ORDER BY id ASC`,
        nodeIds
      );
    }

    const materialsByNode = new Map<number, LearningMaterial[]>();
    for (const mRow of materialRows) {
      const nId = Number(mRow.node_id);
      if (!materialsByNode.has(nId)) materialsByNode.set(nId, []);
      materialsByNode.get(nId)!.push(mapLearningMaterial(mRow));
    }

    const messagesByNode = new Map<number, ChatMessage[]>();
    for (const msgRow of messageRows) {
      const nId = Number(msgRow.node_id);
      if (!messagesByNode.has(nId)) messagesByNode.set(nId, []);
      messagesByNode.get(nId)!.push(mapChatMessage(msgRow));
    }

    const nodesByTree = new Map<number, SkillNode[]>();
    for (const nRow of nodeRows) {
      const tId = Number(nRow.tree_id);
      const nId = Number(nRow.id);
      if (!nodesByTree.has(tId)) nodesByTree.set(tId, []);
      nodesByTree
        .get(tId)!
        .push(mapSkillNode(nRow, materialsByNode.get(nId) ?? [], messagesByNode.get(nId) ?? []));
    }

    for (const tRow of treeRows) {
      const lId = Number(tRow.learner_id);
      const tId = Number(tRow.id);
      if (!result.has(lId)) result.set(lId, []);
      result.get(lId)!.push(mapSkillTree(tRow, nodesByTree.get(tId) ?? []));
    }

    return result;
  }

  private async loadReceiptsBySessionIds(sessionIds: number[]): Promise<PaymentReceipt[]> {
    if (sessionIds.length === 0) return [];
    const ph = sessionIds.map(() => '?').join(', ');
    const rows = await this.db.query<PaymentReceiptRow>(
      `SELECT * FROM payment_receipts WHERE session_id IN (${ph}) ORDER BY processed_at DESC`,
      sessionIds
    );
    return rows.map((r) => mapPaymentReceipt(r));
  }

  private async collectAuthorNamesForLearner(learner: Learner): Promise<Record<string, string>> {
    const authorIds = new Set<number>();
    for (const tree of learner.skillTrees) {
      for (const node of tree.nodes) {
        for (const mat of node.materials) {
          if (mat.authorId !== undefined) {
            authorIds.add(mat.authorId);
          }
        }
      }
    }
    if (authorIds.size === 0) return {};

    const ids = Array.from(authorIds);
    const ph = ids.map(() => '?').join(', ');
    const rows = await this.db.query<{ id: number; full_name: string }>(
      `SELECT id, full_name FROM users WHERE id IN (${ph})`,
      ids
    );
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[String(row.id)] = String(row.full_name);
    }
    return map;
  }

  private async hydrateTeams(
    teamRows: TeamRow[],
    preloadedLearners?: Learner[]
  ): Promise<Team[]> {
    if (teamRows.length === 0) return [];

    const teamIds = teamRows.map((t) => Number(t.id));
    const teamPh = teamIds.map(() => '?').join(', ');
    const memberLinks = await this.db.query<TeamMemberRow>(
      `SELECT team_id, learner_id FROM team_members WHERE team_id IN (${teamPh})`,
      teamIds
    );

    const learnerById = new Map<number, Learner>();
    if (preloadedLearners) {
      for (const learner of preloadedLearners) {
        learnerById.set(learner.id, learner);
      }
    } else if (memberLinks.length > 0) {
      const memberIds = Array.from(new Set(memberLinks.map((m) => Number(m.learner_id))));
      const lPh = memberIds.map(() => '?').join(', ');
      const lRows = await this.db.query<UserRow>(
        `SELECT * FROM users WHERE id IN (${lPh})`,
        memberIds
      );
      const treesMap = await this.loadTreesForLearners(memberIds);
      for (const row of lRows) {
        const lId = Number(row.id);
        learnerById.set(
          lId,
          mapUserEntity(row, { skillTrees: treesMap.get(lId) ?? [] }) as Learner
        );
      }
    }

    const membersByTeam = new Map<number, Learner[]>();
    for (const link of memberLinks) {
      const tId = Number(link.team_id);
      const learner = learnerById.get(Number(link.learner_id));
      if (!learner) continue;
      if (!membersByTeam.has(tId)) membersByTeam.set(tId, []);
      membersByTeam.get(tId)!.push(learner);
    }

    return teamRows.map(
      (row) =>
        new Team({
          id: Number(row.id),
          name: String(row.name),
          hrManagerId: Number(row.hr_manager_id),
          members: membersByTeam.get(Number(row.id)) ?? [],
        })
    );
  }
}
