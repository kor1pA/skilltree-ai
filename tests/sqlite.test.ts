import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MaterialType, NodeStatus, PaymentStatus, SkillLevel } from '../src/domain/index.ts';
import { SkillTreeRepository } from '../src/repositories/SkillTreeRepository.ts';
import { TooManyRequestsError } from '../src/repositories/errors.ts';

describe('SkillTree AI — SQLite Persistence, Schema, Transactions & Auth Sessions', () => {
  it('creates all 11 normalized tables, 12 indexes, and seeds 3 verified initial mentors idempotently', async () => {
    const repo = new SkillTreeRepository({ dbPath: ':memory:' });
    await repo.init();
    await repo.init(); // idempotent

    const tables = await repo.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    const tableNames = new Set(tables.map((t) => String(t.name)));
    for (const expected of [
      'users',
      'auth_sessions',
      'auth_rate_limits',
      'skill_trees',
      'skill_nodes',
      'learning_materials',
      'chat_messages',
      'mentor_sessions',
      'payment_receipts',
      'teams',
      'team_members',
    ]) {
      assert.ok(tableNames.has(expected), `Missing table ${expected}`);
    }

    const indexes = await repo.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"
    );
    assert.equal(indexes.length, 12);

    const mentors = await repo.listPublicMentors();
    assert.equal(mentors.length, 3);
    // Initial mentors must have randomized credentials (no 'demo1234' backdoor)
    const firstRow = await repo.db.queryOne<{ email: string }>(
      "SELECT email FROM users WHERE role = 'MENTOR' ORDER BY id ASC LIMIT 1"
    );
    assert.ok(firstRow);
    await assert.rejects(
      () => repo.authenticateUser(String(firstRow.email), 'demo1234'),
      /Невірний email або пароль/
    );

    await repo.close();
  });

  it('persists learners, trees, materials, ratings, atomic receipts, teams & auth_sessions across full DB reopen', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'skilltree-sqlite-'));
    const dbFile = join(tmpDir, 'skilltree.db');

    try {
      const repo1 = new SkillTreeRepository({ dbPath: dbFile });
      await repo1.init();

      const learner = await repo1.registerUser({
        fullName: 'Олександр SQLite',
        email: 'olex.sqlite@skilltree.ai',
        password: 'StrongPassword1!',
        role: 'LEARNER',
        targetProfession: 'Full-Stack Developer',
        level: SkillLevel.INTERMEDIATE,
      });

      const mentor = await repo1.registerUser({
        fullName: 'Тарас Ментор',
        email: 'taras.mentor@skilltree.ai',
        password: 'StrongPassword2!',
        role: 'MENTOR',
        specialization: 'SQLite & Backend',
        hourlyRate: 1250,
      });

      const hr = await repo1.registerUser({
        fullName: 'Олена HR',
        email: 'olena.hr@skilltree.ai',
        password: 'StrongPassword3!',
        role: 'HR',
        company: 'CyberCorp UA',
      });

      const sessionCreated = await repo1.createAuthSession({
        userId: learner.id,
        tokenHash: 'hash-persist-token-1',
        deviceLabel: 'Google Chrome • Windows',
        userAgent: 'Mozilla/5.0 Chrome/130.0',
        ipAddress: '127.0.0.1',
        rememberMe: true,
      });

      const learnerFull = await repo1.findUserById(learner.id);
      assert.ok(learnerFull && learnerFull.role === 'LEARNER');
      const tree = learnerFull.skillTrees[0];
      const firstNode = tree.nodes[0];

      const publishedMat = await repo1.publishMaterial(mentor.id, firstNode.id, {
        title: 'WAL Mode & B-Trees',
        url: 'https://sqlite.org/wal.html',
        type: MaterialType.LINK,
        description: 'SQLite concurrency internals',
        content: 'PRAGMA journal_mode = WAL;',
      });

      await repo1.updateNodeStatus(learner.id, tree.id, firstNode.id, { action: 'complete' });
      const { message } = await repo1.askNodeAssistant(
        learner.id,
        tree.id,
        firstNode.id,
        'Поясни індекси у базах даних'
      );
      await repo1.rateChatMessage(learner.id, message.id, true);

      const { session, receipt } = await repo1.bookSession(learner.id, {
        mentorId: mentor.id,
        topic: 'SQLite Transactions',
        startAt: new Date(Date.now() + 86_400_000),
        durationMin: 60,
        payImmediately: true,
        paymentMethod: 'CARD',
      });
      assert.ok(receipt);
      await repo1.confirmSession(mentor.id, session.id);
      await repo1.leaveSessionFeedback(learner.id, session.id, 5, 'Ідеальна консультація!');

      const team = await repo1.createTeam(hr.id, 'Platform Engineering');
      await repo1.addTeamMember(hr.id, team.id, learner.id);
      await repo1.close();

      // Reopen completely fresh repository instance against the persisted disk file
      const repo2 = new SkillTreeRepository({ dbPath: dbFile });
      await repo2.init();

      const restoredSession = await repo2.findActiveSessionByTokenHash('hash-persist-token-1');
      assert.ok(restoredSession);
      assert.equal(restoredSession.session.id, sessionCreated.id);
      assert.equal(restoredSession.user.id, learner.id);

      const restoredState = await repo2.getScopedState(
        restoredSession.user,
        restoredSession.session.id
      );
      assert.equal(restoredState.currentUser?.points, 50);
      assert.equal(restoredState.learners[0].skillTrees[0].nodes[0].status, NodeStatus.DONE);
      assert.ok(
        restoredState.learners[0].skillTrees[0].nodes[0].materials.some(
          (m: any) => m.id === publishedMat.id
        )
      );
      assert.equal(
        restoredState.learners[0].skillTrees[0].nodes[0].messages[0].isHelpful,
        true
      );
      assert.equal(restoredState.receipts[0].transactionId, receipt.transactionId);
      assert.equal(restoredState.receipts[0].status, PaymentStatus.PAID);

      const restoredMentors = await repo2.listPublicMentors();
      const restoredMentor = restoredMentors.find((m) => m.id === mentor.id);
      assert.ok(restoredMentor);
      assert.equal(restoredMentor.publishedMaterialsCount, 1);
      assert.equal(restoredMentor.rating, 5);

      const restoredTeam = await repo2.getTeamDetailed(hr.id, team.id);
      assert.equal(restoredTeam.members.length, 1);
      assert.equal(restoredTeam.getDetailedMatrix().members[0].points, 50);

      await repo2.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rolls back transactions cleanly, handles concurrent writes safely, and enforces DB rate limits & FK cascades', async () => {
    const repo = new SkillTreeRepository({ dbPath: ':memory:' }, { skipSeed: true });
    await repo.init();

    const learner = await repo.registerUser({
      fullName: 'Транзакційний Юзер',
      email: 'tx@skilltree.ai',
      password: 'Password123',
      role: 'LEARNER',
    });

    // Simulate failed multi-statement transaction -> full rollback
    await assert.rejects(
      () =>
        repo.db.transaction(async (tx) => {
          await tx.execute('UPDATE users SET points = 999 WHERE id = ?', [learner.id]);
          throw new Error('Forced mid-transaction abort');
        }),
      /Forced mid-transaction abort/
    );
    const reloaded = await repo.findUserById(learner.id);
    assert.ok(reloaded && reloaded.role === 'LEARNER');
    assert.equal(reloaded.points, 0);

    // Concurrent serialized top-level transactions must succeed without "cannot start a transaction"
    await Promise.all([
      repo.db.transaction(async (tx) => {
        await tx.execute('UPDATE users SET points = points + 10 WHERE id = ?', [learner.id]);
      }),
      repo.db.transaction(async (tx) => {
        await tx.execute('UPDATE users SET points = points + 15 WHERE id = ?', [learner.id]);
      }),
    ]);
    const afterConcurrent = await repo.findUserById(learner.id);
    assert.ok(afterConcurrent && afterConcurrent.role === 'LEARNER');
    assert.equal(afterConcurrent.points, 25);

    // Auth rate throttle backed by SQLite
    const throttleKey = '127.0.0.1:tx@skilltree.ai';
    for (let i = 0; i < 3; i += 1) {
      await repo.recordAuthFailure(throttleKey, 3, 60_000, 60_000);
    }
    await assert.rejects(() => repo.checkAuthThrottle(throttleKey, 3, 60_000), TooManyRequestsError);
    await repo.clearAuthThrottle(throttleKey);
    await repo.checkAuthThrottle(throttleKey, 3, 60_000);

    // FK cascade removes owned trees/nodes on user delete
    await repo.db.execute('DELETE FROM users WHERE id = ?', [learner.id]);
    const remainingTrees = await repo.db.query('SELECT id FROM skill_trees');
    const remainingNodes = await repo.db.query('SELECT id FROM skill_nodes');
    assert.equal(remainingTrees.length, 0);
    assert.equal(remainingNodes.length, 0);

    await repo.close();
  });
});
