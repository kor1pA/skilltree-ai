import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  MaterialType,
  NodeStatus,
  PaymentStatus,
  SessionStatus,
  SkillLevel,
} from './enums.ts';
import { LearningMaterial } from './LearningMaterial.ts';
import { ChatMessage } from './ChatMessage.ts';
import { SkillNode } from './SkillNode.ts';
import { SkillTree } from './SkillTree.ts';
import { MentorSession } from './MentorSession.ts';
import { Team } from './Team.ts';
import { SkillMatrixService } from '../services/SkillMatrixService.ts';

export type UserRole = 'LEARNER' | 'MENTOR' | 'HR';

let domainIdSequence = Date.now() * 100;

function nextDomainId(): number {
  domainIdSequence += 1;
  return domainIdSequence;
}

export interface UserParams {
  id: number;
  fullName: string;
  email: string;
  passwordHash: string;
  createdAt?: Date | string;
}

/**
 * Абстрактний базовий клас користувача платформи (UC1).
 */
export abstract class User {
  id: number;
  fullName: string;
  email: string;
  protected passwordHash: string;
  createdAt: Date;
  abstract readonly role: UserRole;
  isLoggedIn: boolean;

  constructor(params: UserParams) {
    this.id = params.id;
    this.fullName = params.fullName;
    this.email = params.email;
    this.passwordHash = params.passwordHash;
    this.createdAt = params.createdAt ? new Date(params.createdAt) : new Date();
    this.isLoggedIn = false;
  }

  static hashPassword(rawPassword: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(rawPassword, salt, 64).toString('hex');
    return `scrypt$${salt}$${derivedKey}`;
  }

  static verifyPassword(rawPassword: string, storedHash: string): boolean {
    if (typeof rawPassword !== 'string' || typeof storedHash !== 'string') {
      return false;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex || expectedHex.length % 2 !== 0) {
      return false;
    }
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const derivedBuf = scryptSync(rawPassword, salt, expectedBuf.length);
      if (derivedBuf.length !== expectedBuf.length) {
        return false;
      }
      return timingSafeEqual(derivedBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  login(password: string): boolean {
    const valid = User.verifyPassword(password, this.passwordHash);
    if (valid) {
      this.isLoggedIn = true;
    }
    return valid;
  }

  logout(): void {
    this.isLoggedIn = false;
  }

  resetPassword(newPassword: string): void {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Новий пароль має містити щонайменше 8 символів.');
    }
    this.passwordHash = User.hashPassword(newPassword);
  }

  getPasswordHash(): string {
    return this.passwordHash;
  }

  toBaseJSON() {
    return {
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      role: this.role,
      createdAt: this.createdAt.toISOString(),
      isLoggedIn: this.isLoggedIn,
    };
  }
}

export interface LearnerParams extends UserParams {
  targetProfession?: string;
  level?: SkillLevel;
  points?: number;
  badges?: string[];
  skillTrees?: SkillTree[];
  sessions?: MentorSession[];
}

/**
 * Студент / фахівець: будує карти, вивчає вузли, ставить питання ШІ, бронює сесії (UC2, UC3, UC4, UC6).
 */
export class Learner extends User {
  readonly role: UserRole = 'LEARNER';
  targetProfession: string;
  level: SkillLevel;
  points: number;
  badges: string[];
  skillTrees: SkillTree[];
  sessions: MentorSession[];

  constructor(params: LearnerParams) {
    super(params);
    this.targetProfession = params.targetProfession ?? 'Full-Stack Developer';
    this.level = params.level ?? SkillLevel.BEGINNER;
    this.points = params.points ?? 0;
    this.badges = params.badges ?? [];
    this.skillTrees = params.skillTrees ?? [];
    this.sessions = params.sessions ?? [];
  }

  requestSkillTree(
    profession: string,
    level: SkillLevel,
    treeFactory?: (learnerId: number, profession: string, level: SkillLevel) => SkillTree,
    idGenerator: () => number = nextDomainId
  ): SkillTree {
    this.targetProfession = profession;
    this.level = level;

    const tree = treeFactory
      ? treeFactory(this.id, profession, level)
      : new SkillTree({
          id: idGenerator(),
          title: `Шлях: ${profession}`,
          targetProfession: profession,
          level,
          learnerId: this.id,
          nodes: [
            new SkillNode({
              id: idGenerator(),
              title: `Основи ${profession}`,
              orderNumber: 1,
              status: NodeStatus.NOT_STARTED,
              description: `Стартовий модуль напряму ${profession}`,
              materials: [
                new LearningMaterial({
                  id: idGenerator(),
                  title: `Вступний конспект: ${profession}`,
                  type: MaterialType.TEXT,
                  url: '',
                  description: `Ключові поняття та початкові кроки опанування напряму ${profession}.`,
                  content: `1. Ознайомтеся з базовою термінологією напряму «${profession}».\n2. Створіть робоче середовище та виконайте перше практичне завдання.\n3. Використовуйте ШІ-асистента праворуч для розбору складних питань.`,
                }),
              ],
            }),
          ],
        });

    this.skillTrees.push(tree);
    return tree;
  }

  askAssistant(
    nodeId: number,
    text: string,
    answerGenerator?: (node: SkillNode, question: string) => { answer: string; responseTimeMs: number },
    idGenerator: () => number = nextDomainId
  ): ChatMessage {
    let targetNode: SkillNode | undefined;
    for (const tree of this.skillTrees) {
      targetNode = tree.nodes.find((n) => n.id === nodeId);
      if (targetNode) break;
    }

    if (!targetNode) {
      throw new Error(`Вузол з ID ${nodeId} не знайдено у картах студента.`);
    }

    const generated = answerGenerator
      ? answerGenerator(targetNode, text)
      : {
          answer: `Підказка для вузла «${targetNode.title}»: розбийте тему на 2 практичні кроки та перевірте прикріплені матеріали.`,
          responseTimeMs: 180,
        };

    const message = new ChatMessage({
      id: idGenerator(),
      nodeId,
      learnerId: this.id,
      question: text,
      answer: generated.answer,
      responseTimeMs: generated.responseTimeMs,
    });

    targetNode.addMessage(message);
    return message;
  }

  bookSession(
    mentor: Mentor,
    startAt: Date,
    topic?: string,
    durationMin = 60,
    idGenerator: () => number = nextDomainId
  ): MentorSession {
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      throw new Error('Тривалість сесії має бути більшою за 0 хвилин.');
    }
    if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
      throw new Error('Некоректна дата початку сесії.');
    }
    const price = Number(((mentor.hourlyRate * durationMin) / 60).toFixed(2));
    const session = new MentorSession({
      id: idGenerator(),
      learnerId: this.id,
      mentorId: mentor.id,
      topic: topic || `Консультація з ${mentor.specialization}`,
      startAt,
      durationMin,
      price,
    });
    this.sessions.push(session);
    mentor.sessions.push(session);
    return session;
  }

  addPoints(value: number): void {
    if (value > 0) {
      this.points += value;
    }
  }

  /**
   * Завершує вузол карти та нараховує бали лише при першому переході у DONE (UC3).
   */
  completeNode(treeId: number, nodeId: number): number {
    const tree = this.skillTrees.find((t) => t.id === treeId);
    if (!tree) {
      throw new Error(`Карту з ID ${treeId} не знайдено.`);
    }
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Вузол з ID ${nodeId} не знайдено.`);
    }

    if (node.status === NodeStatus.DONE) {
      return this.points;
    }

    node.complete();
    this.addPoints(50);
    this.awardMilestoneBadges(tree);
    return this.points;
  }

  private awardMilestoneBadges(tree: SkillTree): void {
    const grant = (badge: string) => {
      if (!this.badges.includes(badge)) {
        this.badges.push(badge);
      }
    };

    if (this.points >= 50) {
      grant('Перший крок');
    }
    if (this.points >= 150) {
      grant('Активний дослідник');
    }
    if (tree.calculateProgress() === 100) {
      grant('Майстер дерева');
    }
  }

  toJSON() {
    return {
      ...this.toBaseJSON(),
      targetProfession: this.targetProfession,
      level: this.level,
      points: this.points,
      badges: this.badges,
      skillTrees: this.skillTrees.map((t) => t.toJSON()),
    };
  }
}

export interface MentorParams extends UserParams {
  bio?: string;
  hourlyRate?: number;
  rating?: number;
  specialization?: string;
  sessions?: MentorSession[];
  publishedMaterials?: LearningMaterial[];
}

/**
 * Ментор / експерт: публікує матеріали, проводить та підтверджує сесії, має рейтинг (UC5, UC6).
 */
export class Mentor extends User {
  readonly role: UserRole = 'MENTOR';
  bio: string;
  hourlyRate: number;
  rating: number;
  specialization: string;
  sessions: MentorSession[];
  publishedMaterials: LearningMaterial[];

  constructor(params: MentorParams) {
    super(params);
    this.bio = params.bio ?? 'Досвідчений ментор платформи SkillTree AI';
    this.hourlyRate = params.hourlyRate ?? 800;
    this.rating = params.rating ?? 5.0;
    this.specialization = params.specialization ?? 'Software Engineering';
    this.sessions = params.sessions ?? [];
    this.publishedMaterials = params.publishedMaterials ?? [];
  }

  publishMaterial(
    node: SkillNode,
    title: string,
    url: string,
    type: MaterialType = MaterialType.LINK,
    description?: string,
    content?: string,
    idGenerator: () => number = nextDomainId
  ): LearningMaterial {
    const material = new LearningMaterial({
      id: idGenerator(),
      title,
      type,
      url,
      authorId: this.id,
      description,
      content,
    });
    node.addMaterial(material);
    this.publishedMaterials.push(material);
    return material;
  }

  confirmSession(session: MentorSession): void {
    if (session.status === SessionStatus.CANCELLED) {
      throw new Error('Неможливо підтвердити скасовану сесію.');
    }
    if (session.status === SessionStatus.DONE) {
      throw new Error('Неможливо підтвердити вже завершену сесію.');
    }
    if (session.paymentStatus !== PaymentStatus.PAID) {
      throw new Error('Неможливо підтвердити неоплачену сесію: оплата є обов’язковою.');
    }
    session.status = SessionStatus.CONFIRMED;
  }

  recalculateRating(): number {
    const rated = this.sessions.filter((s) => s.rating !== null);
    if (rated.length === 0) {
      return this.rating;
    }
    const sum = rated.reduce((acc, s) => acc + (s.rating ?? 0), 0);
    this.rating = Number((sum / rated.length).toFixed(2));
    return this.rating;
  }

  toJSON() {
    return {
      ...this.toBaseJSON(),
      bio: this.bio,
      hourlyRate: this.hourlyRate,
      rating: this.rating,
      specialization: this.specialization,
      publishedMaterialsCount: this.publishedMaterials.length,
    };
  }
}

export interface HRManagerParams extends UserParams {
  company?: string;
  teams?: Team[];
}

/**
 * HR-менеджер / TeamLead: керує командами, призначає карти, формує звіти (UC7, UC8, UC12).
 */
export class HRManager extends User {
  readonly role: UserRole = 'HR';
  company: string;
  teams: Team[];

  constructor(params: HRManagerParams) {
    super(params);
    this.company = params.company ?? 'TechCorp Ukraine';
    this.teams = params.teams ?? [];
  }

  createTeam(name: string, idGenerator: () => number = nextDomainId): Team {
    const team = new Team({
      id: idGenerator(),
      name,
      hrManagerId: this.id,
    });
    this.teams.push(team);
    return team;
  }

  assignSkillTree(
    learner: Learner,
    tree: SkillTree,
    idGenerator: () => number = nextDomainId
  ): SkillTree {
    const clonedTree = new SkillTree({
      id: idGenerator(),
      title: tree.title,
      targetProfession: tree.targetProfession,
      level: tree.level,
      learnerId: learner.id,
      nodes: tree.nodes.map(
        (n) =>
          new SkillNode({
            id: idGenerator(),
            title: n.title,
            orderNumber: n.orderNumber,
            status: NodeStatus.NOT_STARTED,
            description: n.description,
            materials: n.materials.map(
              (m) =>
                new LearningMaterial({
                  id: idGenerator(),
                  title: m.title,
                  type: m.type,
                  url: m.url,
                  authorId: m.authorId,
                  description: m.description,
                  content: m.content,
                })
            ),
          })
      ),
    });
    learner.skillTrees.push(clonedTree);
    return clonedTree;
  }

  exportReport(team: Team, format = 'CSV'): string {
    if (format.toUpperCase() !== 'CSV') {
      return JSON.stringify(team.getDetailedMatrix(), null, 2);
    }
    return SkillMatrixService.exportCsv(team);
  }

  toJSON() {
    return {
      ...this.toBaseJSON(),
      company: this.company,
      teamIds: this.teams.map((t) => t.id),
    };
  }
}
