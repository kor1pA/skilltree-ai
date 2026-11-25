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
  type UserRole,
} from '../domain/index.ts';
import type { PaymentMethod, PaymentReceipt } from '../adapters/PaymentAdapter.ts';

export interface UserRow {
  [key: string]: unknown;
  id: number;
  role: UserRole;
  full_name: string;
  email: string;
  password_hash: string;
  created_at: string;
  target_profession: string | null;
  skill_level: string | null;
  points: number;
  badges_json: string | null;
  bio: string | null;
  hourly_rate: number | null;
  rating: number | null;
  specialization: string | null;
  company: string | null;
}

export interface AuthSessionRow {
  [key: string]: unknown;
  id: string;
  user_id: number;
  token_hash: string;
  device_label: string;
  user_agent: string;
  ip_address: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SkillTreeRow {
  [key: string]: unknown;
  id: number;
  learner_id: number;
  title: string;
  target_profession: string;
  level: string;
  created_at: string;
}

export interface SkillNodeRow {
  [key: string]: unknown;
  id: number;
  tree_id: number;
  title: string;
  order_number: number;
  status: string;
  description: string;
}

export interface LearningMaterialRow {
  [key: string]: unknown;
  id: number;
  node_id: number;
  author_id: number | null;
  author_name?: string | null;
  title: string;
  type: string;
  url: string;
  description: string;
  content: string;
  published_at: string;
}

export interface ChatMessageRow {
  [key: string]: unknown;
  id: number;
  node_id: number;
  learner_id: number;
  question: string;
  answer: string;
  response_time_ms: number;
  is_helpful: number | null;
  created_at: string;
}

export interface MentorSessionRow {
  [key: string]: unknown;
  id: number;
  learner_id: number;
  mentor_id: number;
  topic: string;
  start_at: string;
  duration_min: number;
  price: number;
  status: string;
  payment_status: string;
  rating: number | null;
  feedback: string | null;
  created_at: string;
}

export interface PaymentReceiptRow {
  [key: string]: unknown;
  transaction_id: string;
  session_id: number;
  amount: number;
  currency: string;
  method: string;
  status: string;
  processed_at: string;
}

export interface TeamRow {
  [key: string]: unknown;
  id: number;
  name: string;
  hr_manager_id: number;
  created_at: string;
}

export interface TeamMemberRow {
  [key: string]: unknown;
  team_id: number;
  learner_id: number;
}

export function parseBadges(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function mapLearningMaterial(row: LearningMaterialRow): LearningMaterial {
  return new LearningMaterial({
    id: Number(row.id),
    title: String(row.title),
    type: row.type as MaterialType,
    url: String(row.url ?? ''),
    publishedAt: String(row.published_at),
    authorId: row.author_id !== null && row.author_id !== undefined ? Number(row.author_id) : undefined,
    description: String(row.description ?? ''),
    content: String(row.content ?? ''),
  });
}

export function mapChatMessage(row: ChatMessageRow): ChatMessage {
  const helpful =
    row.is_helpful === null || row.is_helpful === undefined ? null : Number(row.is_helpful) === 1;
  return new ChatMessage({
    id: Number(row.id),
    nodeId: Number(row.node_id),
    learnerId: Number(row.learner_id),
    question: String(row.question),
    answer: String(row.answer),
    responseTimeMs: Number(row.response_time_ms),
    isHelpful: helpful,
    createdAt: String(row.created_at),
  });
}

export function mapSkillNode(
  row: SkillNodeRow,
  materials: LearningMaterial[] = [],
  messages: ChatMessage[] = []
): SkillNode {
  return new SkillNode({
    id: Number(row.id),
    title: String(row.title),
    orderNumber: Number(row.order_number),
    status: row.status as NodeStatus,
    description: String(row.description ?? ''),
    materials,
    messages,
  });
}

export function mapSkillTree(row: SkillTreeRow, nodes: SkillNode[] = []): SkillTree {
  return new SkillTree({
    id: Number(row.id),
    learnerId: Number(row.learner_id),
    title: String(row.title),
    targetProfession: String(row.target_profession),
    level: row.level as SkillLevel,
    createdAt: String(row.created_at),
    nodes,
  });
}

export function mapMentorSession(row: MentorSessionRow): MentorSession {
  return new MentorSession({
    id: Number(row.id),
    learnerId: Number(row.learner_id),
    mentorId: Number(row.mentor_id),
    topic: String(row.topic),
    startAt: String(row.start_at),
    durationMin: Number(row.duration_min),
    price: Number(row.price),
    status: row.status as SessionStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
    feedback: row.feedback !== null && row.feedback !== undefined ? String(row.feedback) : null,
  });
}

export function mapPaymentReceipt(row: PaymentReceiptRow): PaymentReceipt {
  return {
    transactionId: String(row.transaction_id),
    sessionId: Number(row.session_id),
    amount: Number(row.amount),
    currency: String(row.currency),
    method: (row.method as PaymentMethod) || 'CARD',
    status: row.status as PaymentStatus,
    processedAt: String(row.processed_at),
  };
}

export function mapUserEntity(
  row: UserRow,
  extras?: {
    skillTrees?: SkillTree[];
    sessions?: MentorSession[];
    publishedMaterials?: LearningMaterial[];
    teams?: Team[];
  }
): Learner | Mentor | HRManager {
  if (row.role === 'MENTOR') {
    return new Mentor({
      id: Number(row.id),
      fullName: String(row.full_name),
      email: String(row.email),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
      bio: String(row.bio ?? ''),
      hourlyRate: Number(row.hourly_rate ?? 850),
      rating: Number(row.rating ?? 5.0),
      specialization: String(row.specialization ?? 'Full-Stack Development'),
      sessions: extras?.sessions ?? [],
      publishedMaterials: extras?.publishedMaterials ?? [],
    });
  }

  if (row.role === 'HR') {
    return new HRManager({
      id: Number(row.id),
      fullName: String(row.full_name),
      email: String(row.email),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
      company: String(row.company ?? 'IT Company Ukraine'),
      teams: extras?.teams ?? [],
    });
  }

  return new Learner({
    id: Number(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    targetProfession: String(row.target_profession ?? 'Full-Stack Developer'),
    level: (row.skill_level as SkillLevel) ?? SkillLevel.BEGINNER,
    points: Number(row.points ?? 0),
    badges: parseBadges(row.badges_json),
    skillTrees: extras?.skillTrees ?? [],
    sessions: extras?.sessions ?? [],
  });
}
