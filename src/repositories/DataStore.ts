import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  SessionStatus,
  SkillLevel,
  SkillNode,
  SkillTree,
  Team,
  User,
} from '../domain/index.ts';
import { AIServiceAdapter } from '../adapters/AIServiceAdapter.ts';
import { PaymentAdapter, type PaymentReceipt } from '../adapters/PaymentAdapter.ts';

const CURRENT_SEED_VERSION = 2;

interface PersistedState {
  seedVersion?: number;
  nextId: number;
  currentUserId: number;
  learners: ReturnType<Learner['toJSON']>[];
  mentors: ReturnType<Mentor['toJSON']>[];
  hrManagers: ReturnType<HRManager['toJSON']>[];
  passwords: Record<number, string>;
  sessions: ReturnType<MentorSession['toJSON']>[];
  teams: Array<{ id: number; name: string; hrManagerId: number; memberIds: number[] }>;
  receipts: PaymentReceipt[];
}

export class DataStore {
  private nextIdCounter = 1000;
  private storagePath: string | null;
  readonly aiAdapter = new AIServiceAdapter();
  readonly paymentAdapter = new PaymentAdapter();

  learners: Learner[] = [];
  mentors: Mentor[] = [];
  hrManagers: HRManager[] = [];
  teams: Team[] = [];
  sessions: MentorSession[] = [];
  receipts: PaymentReceipt[] = [];
  currentUserId = 1;

  constructor(storagePath: string | null = resolve(process.cwd(), 'data/store.json')) {
    this.storagePath = storagePath;
    if (this.storagePath && existsSync(this.storagePath)) {
      try {
        this.loadFromDisk();
        return;
      } catch {
        // Якщо файл пошкоджено — відновлюємо з демонстраційних даних
      }
    }
    this.seed();
    this.saveToDisk();
  }

  nextId = (): number => {
    this.nextIdCounter += 1;
    return this.nextIdCounter;
  };

  resetToSeed(): void {
    this.nextIdCounter = 1000;
    this.seed();
    this.saveToDisk();
  }

  getAllUsers(): Array<Learner | Mentor | HRManager> {
    return [...this.learners, ...this.mentors, ...this.hrManagers];
  }

  findUserById(id: number): Learner | Mentor | HRManager | undefined {
    return this.getAllUsers().find((u) => u.id === id);
  }

  findUserByEmail(email: string): Learner | Mentor | HRManager | undefined {
    const lower = email.trim().toLowerCase();
    return this.getAllUsers().find((u) => u.email.toLowerCase() === lower);
  }

  findTreeById(treeId: number): { tree: SkillTree; owner: Learner } | undefined {
    for (const learner of this.learners) {
      const tree = learner.skillTrees.find((t) => t.id === treeId);
      if (tree) {
        return { tree, owner: learner };
      }
    }
    return undefined;
  }

  findNodeById(nodeId: number): { node: SkillNode; tree: SkillTree; owner: Learner } | undefined {
    for (const learner of this.learners) {
      for (const tree of learner.skillTrees) {
        const node = tree.nodes.find((n) => n.id === nodeId);
        if (node) {
          return { node, tree, owner: learner };
        }
      }
    }
    return undefined;
  }

  findChatMessageById(messageId: number): ChatMessage | undefined {
    for (const learner of this.learners) {
      for (const tree of learner.skillTrees) {
        for (const node of tree.nodes) {
          const msg = node.messages.find((m) => m.id === messageId);
          if (msg) return msg;
        }
      }
    }
    return undefined;
  }

  getKpiMetrics() {
    const allMessages: ChatMessage[] = [];
    let totalNodes = 0;
    let doneNodes = 0;
    let totalTrees = 0;

    for (const learner of this.learners) {
      totalTrees += learner.skillTrees.length;
      for (const tree of learner.skillTrees) {
        totalNodes += tree.nodes.length;
        for (const node of tree.nodes) {
          if (node.status === NodeStatus.DONE) doneNodes += 1;
          allMessages.push(...node.messages);
        }
      }
    }

    const avgAiResponseMs =
      allMessages.length > 0
        ? Math.round(
            allMessages.reduce((sum, m) => sum + m.responseTimeMs, 0) / allMessages.length
          )
        : 0;

    const ratedMessages = allMessages.filter((m) => m.isHelpful !== null);
    const helpfulCount = ratedMessages.filter((m) => m.isHelpful === true).length;
    const aiHelpfulnessPct =
      ratedMessages.length > 0
        ? Number(((helpfulCount / ratedMessages.length) * 100).toFixed(1))
        : 100;

    return {
      totalTrees,
      totalNodes,
      doneNodes,
      overallCompletionPct: totalNodes > 0 ? Number(((doneNodes / totalNodes) * 100).toFixed(1)) : 0,
      avgAiResponseMs,
      aiSlaCompliant: avgAiResponseMs <= 5000,
      aiMessagesCount: allMessages.length,
      aiRatedCount: ratedMessages.length,
      aiHelpfulnessPct,
      sessionsCount: this.sessions.length,
    };
  }

  getSnapshot() {
    const currentUser = this.findUserById(this.currentUserId) ?? this.learners[0];
    return {
      currentUser: currentUser ? currentUser.toJSON() : null,
      users: this.getAllUsers().map((u) => u.toJSON()),
      learners: this.learners.map((l) => l.toJSON()),
      mentors: this.mentors.map((m) => m.toJSON()),
      hrManagers: this.hrManagers.map((h) => h.toJSON()),
      teams: this.teams.map((t) => t.toJSON()),
      sessions: this.sessions.map((s) => s.toJSON()),
      receipts: this.receipts,
      professions: this.aiAdapter.getSupportedProfessions(),
      kpi: this.getKpiMetrics(),
    };
  }

  saveToDisk(): void {
    if (!this.storagePath) return;
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const passwords: Record<number, string> = {};
    for (const user of this.getAllUsers()) {
      passwords[user.id] = user.getPasswordHash();
    }

    const state: PersistedState = {
      seedVersion: CURRENT_SEED_VERSION,
      nextId: this.nextIdCounter,
      currentUserId: this.currentUserId,
      learners: this.learners.map((l) => l.toJSON()),
      mentors: this.mentors.map((m) => m.toJSON()),
      hrManagers: this.hrManagers.map((h) => h.toJSON()),
      passwords,
      sessions: this.sessions.map((s) => s.toJSON()),
      teams: this.teams.map((t) => ({
        id: t.id,
        name: t.name,
        hrManagerId: t.hrManagerId,
        memberIds: t.members.map((m) => m.id),
      })),
      receipts: this.receipts,
    };

    writeFileSync(this.storagePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private loadFromDisk(): void {
    if (!this.storagePath) return;
    const raw = readFileSync(this.storagePath, 'utf-8');
    const data = JSON.parse(raw) as PersistedState;
    if ((data.seedVersion ?? 1) < CURRENT_SEED_VERSION) {
      throw new Error('Stale seed version, migrating to v2');
    }
    this.nextIdCounter = data.nextId;
    this.currentUserId = data.currentUserId;
    this.receipts = data.receipts ?? [];

    this.learners = data.learners.map((lData) => {
      const trees = lData.skillTrees.map(
        (tData) =>
          new SkillTree({
            id: tData.id,
            title: tData.title,
            targetProfession: tData.targetProfession,
            level: tData.level,
            learnerId: tData.learnerId,
            createdAt: tData.createdAt,
            nodes: tData.nodes.map(
              (nData) =>
                new SkillNode({
                  id: nData.id,
                  title: nData.title,
                  orderNumber: nData.orderNumber,
                  status: nData.status,
                  description: nData.description,
                  materials: nData.materials.map((m) => new LearningMaterial(m)),
                  messages: nData.messages.map((msg) => new ChatMessage(msg)),
                })
            ),
          })
      );

      return new Learner({
        id: lData.id,
        fullName: lData.fullName,
        email: lData.email,
        passwordHash: data.passwords[lData.id] ?? User.hashPassword('demo1234'),
        createdAt: lData.createdAt,
        targetProfession: lData.targetProfession,
        level: lData.level,
        points: lData.points,
        badges: lData.badges ?? [],
        skillTrees: trees,
      });
    });

    this.mentors = data.mentors.map(
      (mData) =>
        new Mentor({
          id: mData.id,
          fullName: mData.fullName,
          email: mData.email,
          passwordHash: data.passwords[mData.id] ?? User.hashPassword('demo1234'),
          createdAt: mData.createdAt,
          bio: mData.bio,
          hourlyRate: mData.hourlyRate,
          rating: mData.rating,
          specialization: mData.specialization,
        })
    );

    this.hrManagers = data.hrManagers.map(
      (hData) =>
        new HRManager({
          id: hData.id,
          fullName: hData.fullName,
          email: hData.email,
          passwordHash: data.passwords[hData.id] ?? User.hashPassword('demo1234'),
          createdAt: hData.createdAt,
          company: hData.company,
        })
    );

    this.sessions = data.sessions.map((sData) => new MentorSession(sData));
    for (const s of this.sessions) {
      const learner = this.learners.find((l) => l.id === s.learnerId);
      const mentor = this.mentors.find((m) => m.id === s.mentorId);
      if (learner) learner.sessions.push(s);
      if (mentor) mentor.sessions.push(s);
    }

    this.teams = data.teams.map((tData) => {
      const members = tData.memberIds
        .map((id) => this.learners.find((l) => l.id === id))
        .filter((l): l is Learner => Boolean(l));
      const team = new Team({
        id: tData.id,
        name: tData.name,
        hrManagerId: tData.hrManagerId,
        members,
      });
      const hr = this.hrManagers.find((h) => h.id === tData.hrManagerId);
      if (hr) hr.teams.push(team);
      return team;
    });
  }

  private seed(): void {
    const defaultHash = User.hashPassword('demo1234');

    const learner1 = new Learner({
      id: 1,
      fullName: 'Вячеслав Гой',
      email: 'slava@skilltree.ai',
      passwordHash: defaultHash,
      targetProfession: 'Full-Stack Developer',
      level: SkillLevel.BEGINNER,
      points: 100,
      badges: ['Перший крок'],
    });
    learner1.isLoggedIn = true;

    const learner2 = new Learner({
      id: 2,
      fullName: 'Олена Ковальчук',
      email: 'olena@skilltree.ai',
      passwordHash: defaultHash,
      targetProfession: 'Data Analyst / AI Engineer',
      level: SkillLevel.INTERMEDIATE,
      points: 150,
      badges: ['Перший крок', 'Активний дослідник'],
    });

    const learner3 = new Learner({
      id: 3,
      fullName: 'Дмитро Мельник',
      email: 'dmytro@skilltree.ai',
      passwordHash: defaultHash,
      targetProfession: 'QA Automation Engineer',
      level: SkillLevel.BEGINNER,
      points: 50,
      badges: ['Перший крок'],
    });

    const mentor1 = new Mentor({
      id: 4,
      fullName: 'Андрій Савченко',
      email: 'andriy.mentor@skilltree.ai',
      passwordHash: defaultHash,
      bio: 'Senior Full-Stack Architect із 8-річним досвідом у Node.js, TypeScript та високонавантажених системах.',
      hourlyRate: 900,
      rating: 4.9,
      specialization: 'Full-Stack & TypeScript',
    });

    const mentor2 = new Mentor({
      id: 5,
      fullName: 'Ірина Бондаренко',
      email: 'iryna.mentor@skilltree.ai',
      passwordHash: defaultHash,
      bio: 'Lead Data / AI Engineer. Допомагаю опанувати SQL, Python та інтеграцію LLM API у продакшн.',
      hourlyRate: 1100,
      rating: 5.0,
      specialization: 'Data Science & LLM',
    });

    const hr1 = new HRManager({
      id: 6,
      fullName: 'Марія Ткаченко',
      email: 'maria.hr@technova.ua',
      passwordHash: defaultHash,
      company: 'TechNova Ukraine',
    });

    // Генеруємо карти для всіх 3 студентів
    const tree1 = this.aiAdapter.generateSkillTree(
      this.nextId,
      learner1.id,
      'Full-Stack Developer',
      SkillLevel.BEGINNER
    );
    tree1.nodes[0].complete();
    tree1.nodes[1].complete();
    tree1.nodes[2].start();
    // Стартове повідомлення ШІ у 3-му вузлі
    tree1.nodes[2].addMessage(
      new ChatMessage({
        id: this.nextId(),
        nodeId: tree1.nodes[2].id,
        learnerId: learner1.id,
        question: 'Чим відрізняється PATCH від PUT у REST API?',
        answer:
          'PUT повністю замінює ресурс, а PATCH виконує часткове оновлення окремих полів (наприклад, зміну статусу вузла SkillNode на DONE). Для оновлення прогресу краще використовувати PATCH.',
        responseTimeMs: 215,
        isHelpful: true,
      })
    );
    learner1.skillTrees.push(tree1);

    const tree2 = this.aiAdapter.generateSkillTree(
      this.nextId,
      learner2.id,
      'Data Analyst / AI Engineer',
      SkillLevel.INTERMEDIATE
    );
    tree2.nodes[0].complete();
    tree2.nodes[1].complete();
    tree2.nodes[2].complete();
    learner2.skillTrees.push(tree2);

    const tree3 = this.aiAdapter.generateSkillTree(
      this.nextId,
      learner3.id,
      'QA Automation Engineer',
      SkillLevel.BEGINNER
    );
    tree3.nodes[0].complete();
    tree3.nodes[1].start();
    learner3.skillTrees.push(tree3);

    // Завершена та оцінена сесія для коректної історії рейтингу ментора
    const pastSession = new MentorSession({
      id: this.nextId(),
      learnerId: learner2.id,
      mentorId: mentor1.id,
      topic: 'Код-рев’ю архітектури REST API',
      startAt: new Date(Date.now() - 86400000 * 3),
      durationMin: 60,
      price: 900,
      status: SessionStatus.DONE,
      paymentStatus: PaymentStatus.PAID,
      rating: 5,
      feedback: 'Дуже структуроване пояснення шарів архітектури та тестування.',
    });
    learner2.sessions.push(pastSession);
    mentor1.sessions.push(pastSession);

    const upcomingSession = new MentorSession({
      id: this.nextId(),
      learnerId: learner1.id,
      mentorId: mentor1.id,
      topic: 'Розбір типізації та патерну Adapter у TypeScript',
      startAt: new Date(Date.now() + 86400000 * 2),
      durationMin: 60,
      price: 900,
      status: SessionStatus.BOOKED,
      paymentStatus: PaymentStatus.PENDING,
    });
    learner1.sessions.push(upcomingSession);
    mentor1.sessions.push(upcomingSession);

    const team1 = new Team({
      id: this.nextId(),
      name: 'Product Engineering Team',
      hrManagerId: hr1.id,
      members: [learner1, learner2, learner3],
    });
    hr1.teams.push(team1);

    this.learners = [learner1, learner2, learner3];
    this.mentors = [mentor1, mentor2];
    this.hrManagers = [hr1];
    this.teams = [team1];
    this.sessions = [pastSession, upcomingSession];
    this.receipts = [
      {
        transactionId: `TXN-${pastSession.id}-SEED`,
        sessionId: pastSession.id,
        amount: 900,
        currency: 'UAH',
        status: PaymentStatus.PAID,
        processedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ];
    this.currentUserId = learner1.id;
  }
}
