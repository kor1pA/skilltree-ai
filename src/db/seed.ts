import { randomBytes } from 'node:crypto';
import { User } from '../domain/index.ts';
import type { SqlExecutor } from './SqlExecutor.ts';

interface InitialMentorSeed {
  fullName: string;
  email: string;
  specialization: string;
  hourlyRate: number;
  rating: number;
  bio: string;
}

const INITIAL_MENTORS: InitialMentorSeed[] = [
  {
    fullName: 'Андрій Савченко',
    email: 'andriy.savchenko@skilltree.ai',
    specialization: 'Full-Stack & TypeScript',
    hourlyRate: 1100,
    rating: 4.95,
    bio: 'Senior Full-Stack Architect (9+ років досвіду). Спеціалізація: TypeScript, Node.js, PostgreSQL/SQLite, чиста архітектура та System Design.',
  },
  {
    fullName: 'Олена Ковальчук',
    email: 'olena.kovalchuk@skilltree.ai',
    specialization: 'Data & AI Engineering',
    hourlyRate: 1300,
    rating: 4.98,
    bio: 'Lead AI & Data Engineer (8 років досвіду). Побудова LLM-пайплайнів, SQL-аналітика, MLOps та оцінка якості моделей.',
  },
  {
    fullName: 'Михайло Бондар',
    email: 'mykhaylo.bondar@skilltree.ai',
    specialization: 'DevOps & Cloud Architecture',
    hourlyRate: 1200,
    rating: 4.88,
    bio: 'Principal Cloud / DevOps Engineer. Kubernetes, Terraform, CI/CD, спостережуваність та відмовостійкість продакшн-систем.',
  },
];

/**
 * Ідемпотентне заповнення початкового каталогу менторів при першому запуску порожньої БД.
 * Без фіктивних студентів/HR чи відкритих паролів — усі користувачі реєструються самостійно.
 */
export async function seedInitialCatalogIfEmpty(db: SqlExecutor): Promise<void> {
  const countRow = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM users');
  if (Number(countRow?.cnt ?? 0) > 0) {
    return;
  }

  await db.transaction(async (tx) => {
    const insideCount = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM users');
    if (Number(insideCount?.cnt ?? 0) > 0) {
      return;
    }

    const now = new Date().toISOString();
    for (const mentor of INITIAL_MENTORS) {
      const randomSecret = randomBytes(24).toString('base64url');
      const passwordHash = User.hashPassword(randomSecret);
      await tx.execute(
        `INSERT INTO users (
          role, full_name, email, password_hash, created_at,
          bio, hourly_rate, rating, specialization
        ) VALUES ('MENTOR', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mentor.fullName,
          mentor.email,
          passwordHash,
          now,
          mentor.bio,
          mentor.hourlyRate,
          mentor.rating,
          mentor.specialization,
        ]
      );
    }
  });
}
