import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Client, InValue, Transaction } from '@libsql/client/web';

export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface ExecuteResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * Єдиний асинхронний контракт виконання SQL для локального SQLite (`node:sqlite`)
 * та хмарного Turso / libSQL (`@libsql/client/web`) — патерн Strategy.
 */
export interface SqlExecutor {
  readonly driverName: 'node:sqlite' | 'libsql';
  query<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
  queryOne<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): Promise<T | null>;
  execute(sql: string, params?: SqlValue[]): Promise<ExecuteResult>;
  execScript(sql: string): Promise<void>;
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface NodeSqliteStatement {
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface NodeSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

function normalizeParams(params: SqlValue[] = []): SqlValue[] {
  return params.map((value) => (value === undefined ? null : value));
}

function toPlainRow<T extends SqlRow>(row: unknown): T {
  return Object.assign({}, row) as T;
}

/**
 * Реалізація SqlExecutor поверх вбудованого в Node.js 22+ рушія `node:sqlite`.
 */
export class NodeSqliteExecutor implements SqlExecutor {
  readonly driverName = 'node:sqlite' as const;
  private readonly filePath: string;
  private db: NodeSqliteDatabase | null = null;
  private txDepth = 0;
  private savepointSeq = 0;
  private mutexQueue: Promise<unknown> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async getDb(): Promise<NodeSqliteDatabase> {
    if (this.db) {
      return this.db;
    }
    if (this.filePath !== ':memory:') {
      mkdirSync(dirname(this.filePath), { recursive: true });
    }
    const moduleSpecifier = 'node:sqlite';
    const sqlite = (await import(moduleSpecifier)) as {
      DatabaseSync: new (path: string) => NodeSqliteDatabase;
    };
    const db = new sqlite.DatabaseSync(this.filePath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    if (this.filePath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db = db;
    return db;
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const db = await this.getDb();
    const rows = db.prepare(sql).all(...normalizeParams(params));
    return rows.map((row) => toPlainRow<T>(row));
  }

  async queryOne<T extends SqlRow = SqlRow>(
    sql: string,
    params: SqlValue[] = []
  ): Promise<T | null> {
    const db = await this.getDb();
    const row = db.prepare(sql).get(...normalizeParams(params));
    return row ? toPlainRow<T>(row) : null;
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecuteResult> {
    const db = await this.getDb();
    const res = db.prepare(sql).run(...normalizeParams(params));
    return {
      changes: Number(res.changes ?? 0),
      lastInsertRowid: Number(res.lastInsertRowid ?? 0),
    };
  }

  async execScript(sql: string): Promise<void> {
    const db = await this.getDb();
    db.exec(sql);
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    if (this.txDepth > 0) {
      return this.runNestedSavepoint(fn);
    }

    const runOuter = async (): Promise<T> => {
      const db = await this.getDb();
      this.txDepth += 1;
      db.exec('BEGIN IMMEDIATE;');
      try {
        const result = await fn(this);
        db.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Транзакція могла бути вже відкочена драйвером
        }
        throw err;
      } finally {
        this.txDepth -= 1;
      }
    };

    const next = this.mutexQueue.then(runOuter, runOuter);
    this.mutexQueue = next.catch(() => undefined);
    return next;
  }

  private async runNestedSavepoint<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    this.savepointSeq += 1;
    const spName = `sp_${this.savepointSeq}`;
    this.txDepth += 1;
    db.exec(`SAVEPOINT ${spName};`);
    try {
      const result = await fn(this);
      db.exec(`RELEASE SAVEPOINT ${spName};`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
      db.exec(`RELEASE SAVEPOINT ${spName};`);
      throw err;
    } finally {
      this.txDepth -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

class LibsqlTransactionExecutor implements SqlExecutor {
  readonly driverName = 'libsql' as const;
  private readonly tx: Transaction;

  constructor(tx: Transaction) {
    this.tx = tx;
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const rs = await this.tx.execute({
      sql,
      args: normalizeParams(params) as InValue[],
    });
    return rs.rows.map((row) => toPlainRow<T>(row));
  }

  async queryOne<T extends SqlRow = SqlRow>(
    sql: string,
    params: SqlValue[] = []
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecuteResult> {
    const rs = await this.tx.execute({
      sql,
      args: normalizeParams(params) as InValue[],
    });
    return {
      changes: Number(rs.rowsAffected ?? 0),
      lastInsertRowid: Number(rs.lastInsertRowid ?? 0),
    };
  }

  async execScript(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await this.tx.execute(stmt);
    }
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async close(): Promise<void> {
    // Керується зовнішньою транзакцією
  }
}

/**
 * Реалізація SqlExecutor для хмарного SQLite (Turso / libSQL) поверх чистого HTTP Web-клієнта.
 */
export class LibsqlExecutor implements SqlExecutor {
  readonly driverName = 'libsql' as const;
  private readonly url: string;
  private readonly authToken?: string;
  private client: Client | null = null;

  constructor(url: string, authToken?: string) {
    this.url = url;
    this.authToken = authToken;
  }

  private async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }
    const { createClient } = await import('@libsql/client/web');
    this.client = createClient({
      url: this.url,
      authToken: this.authToken,
    });
    return this.client;
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const client = await this.getClient();
    const rs = await client.execute({
      sql,
      args: normalizeParams(params) as InValue[],
    });
    return rs.rows.map((row) => toPlainRow<T>(row));
  }

  async queryOne<T extends SqlRow = SqlRow>(
    sql: string,
    params: SqlValue[] = []
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecuteResult> {
    const client = await this.getClient();
    const rs = await client.execute({
      sql,
      args: normalizeParams(params) as InValue[],
    });
    return {
      changes: Number(rs.rowsAffected ?? 0),
      lastInsertRowid: Number(rs.lastInsertRowid ?? 0),
    };
  }

  async execScript(sql: string): Promise<void> {
    const client = await this.getClient();
    await client.executeMultiple(sql);
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    const tx = await client.transaction('write');
    const proxy = new LibsqlTransactionExecutor(tx);
    try {
      const result = await fn(proxy);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // Ігноруємо повторний rollback
      }
      throw err;
    } finally {
      tx.close();
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}

export interface SqlExecutorOptions {
  dbPath?: string;
  tursoUrl?: string;
  tursoAuthToken?: string;
}

let vercelWarningLogged = false;

export function createSqlExecutor(options: SqlExecutorOptions = {}): SqlExecutor {
  const tursoUrl = (
    options.tursoUrl ??
    process.env.TURSO_DATABASE_URL ??
    process.env.LIBSQL_URL ??
    ''
  ).trim();
  const tursoToken = (
    options.tursoAuthToken ??
    process.env.TURSO_AUTH_TOKEN ??
    process.env.LIBSQL_AUTH_TOKEN ??
    ''
  ).trim();

  if (tursoUrl && options.dbPath !== ':memory:') {
    return new LibsqlExecutor(tursoUrl, tursoToken || undefined);
  }

  if (options.dbPath) {
    return new NodeSqliteExecutor(options.dbPath);
  }

  if (process.env.SQLITE_PATH) {
    return new NodeSqliteExecutor(resolve(process.env.SQLITE_PATH));
  }

  if (process.env.VERCEL === '1') {
    if (!vercelWarningLogged) {
      vercelWarningLogged = true;
      console.warn(
        '[SkillTree AI] TURSO_DATABASE_URL не задано — використано тимчасову SQLite БД /tmp/skilltree.db. Підключіть Turso для постійного збереження між cold start.'
      );
    }
    return new NodeSqliteExecutor('/tmp/skilltree.db');
  }

  return new NodeSqliteExecutor(resolve(process.cwd(), 'data/skilltree.db'));
}
