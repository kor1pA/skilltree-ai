import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { SkillTreeRepository } from '../src/repositories/SkillTreeRepository.ts';
import { createApp } from '../src/app.ts';

class CookieClient {
  private readonly baseUrl: string;
  cookie = '';

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'SkillTreeUI',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = getSetCookie ? getSetCookie.call(res.headers) : [];
    const singleCookie = res.headers.get('set-cookie');
    const rawCookies = setCookies.length > 0 ? setCookies : singleCookie ? [singleCookie] : [];

    for (const raw of rawCookies) {
      const pair = raw.split(';')[0]?.trim();
      if (!pair) continue;
      if (pair.endsWith('=')) {
        this.cookie = '';
      } else {
        this.cookie = pair;
      }
    }

    return res;
  }
}

let server: ServerType;
let baseUrl: string;
let repo: SkillTreeRepository;

describe('SkillTree AI — Production Hono REST API, SQLite, RBAC & Security Suite', () => {
  before(async () => {
    repo = new SkillTreeRepository({ dbPath: ':memory:' });
    await repo.init();
    const app = createApp(repo, { disableRateLimit: true });

    await new Promise<void>((resolvePromise) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        baseUrl = `http://127.0.0.1:${info.port}`;
        resolvePromise();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolvePromise, reject) => {
      server.close((err) => (err ? reject(err) : resolvePromise()));
    });
    await repo.close();
  });

  it('Healthcheck, security headers, and guest least-privilege GET /api/state', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.dbDriver, 'node:sqlite');

    // Security headers check
    assert.ok((healthRes.headers.get('content-security-policy') || '').includes("script-src 'self'"));
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

    // Guest state must NOT leak learners, teams, sessions, receipts, or private mentor emails
    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    const guestState = await stateRes.json();
    assert.equal(guestState.currentUser, null);
    assert.equal(guestState.mentors.length, 3);
    assert.equal(guestState.mentors[0].email, undefined);
    assert.deepEqual(guestState.learners, []);
    assert.deepEqual(guestState.teams, []);
    assert.deepEqual(guestState.sessions, []);
    assert.deepEqual(guestState.receipts, []);
    assert.deepEqual(guestState.authSessions, []);
  });

  it('UC1–UC12 Full Multi-Role Lifecycle with real HttpOnly cookies, atomic booking+payment & RFC-4180 CSV', async () => {
    const learnerClient = new CookieClient(baseUrl);
    const mentorClient = new CookieClient(baseUrl);
    const hrClient = new CookieClient(baseUrl);

    // 1. Register Learner, Mentor, HR separately
    const regLearner = await learnerClient.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Коваленко, Олександр',
        email: 'olex.uc@skilltree.ai',
        password: 'Password123!',
        role: 'LEARNER',
        targetProfession: 'Full-Stack Developer',
      }),
    });
    assert.equal(regLearner.status, 201);
    const setCookieHeader = regLearner.headers.get('set-cookie') || '';
    assert.ok(setCookieHeader.includes('HttpOnly'));
    assert.ok(setCookieHeader.includes('SameSite=Lax'));
    const learnerData = await regLearner.json();
    const learnerId = learnerData.user.id;

    const regMentor = await mentorClient.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Андрій Архітектор',
        email: 'andriy.uc@skilltree.ai',
        password: 'Password123!',
        role: 'MENTOR',
        hourlyRate: 1200,
        specialization: 'Node.js & SQLite',
      }),
    });
    assert.equal(regMentor.status, 201);
    const mentorData = await regMentor.json();
    const mentorId = mentorData.user.id;

    const regHr = await hrClient.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Олена HR Lead',
        email: 'olena.uc@skilltree.ai',
        password: 'Password123!',
        role: 'HR',
        company: 'TechUA',
      }),
    });
    assert.equal(regHr.status, 201);

    // 2. UC2: Learner generates a new SkillTree
    const genRes = await learnerClient.request('/api/trees/generate', {
      method: 'POST',
      body: JSON.stringify({ profession: 'DevOps & Cloud Engineer', level: 'INTERMEDIATE' }),
    });
    assert.equal(genRes.status, 201);
    const { tree } = await genRes.json();
    assert.ok(tree.nodes.length >= 4);

    // 3. UC10: Learner adds custom node
    const addNodeRes = await learnerClient.request(`/api/trees/${tree.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Terraform Modules',
        description: 'Інфраструктура як код',
        materialTitle: 'Terraform Docs',
        materialUrl: 'https://developer.hashicorp.com/terraform',
      }),
    });
    assert.equal(addNodeRes.status, 201);
    const { node: customNode } = await addNodeRes.json();

    // 4. UC3: Start node (IN_PROGRESS, 0 XP) -> Complete node (DONE, +50 XP) -> Duplicate DONE (no duplicate XP)
    const startRes = await learnerClient.request(
      `/api/trees/${tree.id}/nodes/${customNode.id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS' }) }
    );
    assert.equal(startRes.status, 200);
    assert.equal((await startRes.json()).learnerPoints, 0);

    const completeRes = await learnerClient.request(
      `/api/trees/${tree.id}/nodes/${customNode.id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) }
    );
    assert.equal(completeRes.status, 200);
    assert.equal((await completeRes.json()).learnerPoints, 50);

    const dupCompleteRes = await learnerClient.request(
      `/api/trees/${tree.id}/nodes/${customNode.id}/status`,
      { method: 'PATCH', body: JSON.stringify({ action: 'complete' }) }
    );
    assert.equal((await dupCompleteRes.json()).learnerPoints, 50);

    // 5. UC4 & UC11: AI Chat + rating
    const chatRes = await learnerClient.request(`/api/trees/${tree.id}/nodes/${customNode.id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ question: 'Як структурувати модулі Terraform?' }),
    });
    assert.equal(chatRes.status, 201);
    const { message } = await chatRes.json();
    assert.ok(message.responseTimeMs <= 5000);

    const rateRes = await learnerClient.request(`/api/chat/${message.id}/rate`, {
      method: 'PATCH',
      body: JSON.stringify({ helpful: true }),
    });
    assert.equal(rateRes.status, 200);
    assert.equal((await rateRes.json()).message.isHelpful, true);

    // 6. UC5: Mentor publishes material into learner's node
    const matRes = await mentorClient.request(`/api/nodes/${customNode.id}/materials`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Terraform Best Practices',
        type: 'LINK',
        url: 'https://www.terraform-best-practices.com/',
        description: 'Практичні патерни модулів',
      }),
    });
    assert.equal(matRes.status, 201);

    // 7. UC6 & UC9: Separate book -> confirm guard (400) -> pay -> confirm -> feedback
    const bookUnpaidRes = await learnerClient.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        mentorId,
        topic: 'Code Review Terraform',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMin: 60,
        payImmediately: false,
      }),
    });
    assert.equal(bookUnpaidRes.status, 201);
    const { session: s1 } = await bookUnpaidRes.json();

    const unpaidConfirm = await mentorClient.request(`/api/sessions/${s1.id}/confirm`, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(unpaidConfirm.status, 400);

    const payRes = await learnerClient.request(`/api/sessions/${s1.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod: 'APPLE_PAY' }),
    });
    assert.equal(payRes.status, 200);
    const payData = await payRes.json();
    assert.equal(payData.receipt.method, 'APPLE_PAY');

    // Double payment rejected with 400
    const payAgain = await learnerClient.request(`/api/sessions/${s1.id}/pay`, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(payAgain.status, 400);

    const confirmRes = await mentorClient.request(`/api/sessions/${s1.id}/confirm`, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(confirmRes.status, 200);

    const fbRes = await learnerClient.request(`/api/sessions/${s1.id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating: 5, feedback: 'Супер розбір!' }),
    });
    assert.equal(fbRes.status, 200);
    assert.equal((await fbRes.json()).mentorRating, 5);

    // DONE session cannot be cancelled or re-confirmed
    assert.equal(
      (await learnerClient.request(`/api/sessions/${s1.id}/cancel`, { method: 'POST', body: '{}' }))
        .status,
      400
    );
    assert.equal(
      (await mentorClient.request(`/api/sessions/${s1.id}/confirm`, { method: 'POST', body: '{}' }))
        .status,
      400
    );

    // Atomic booking + immediate payment
    const atomicBookRes = await learnerClient.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        mentorId,
        topic: 'Atomic Booking + Payment',
        startAt: new Date(Date.now() + 172_800_000).toISOString(),
        durationMin: 30,
        payImmediately: true,
        paymentMethod: 'INVOICE',
      }),
    });
    assert.equal(atomicBookRes.status, 201);
    const atomicData = await atomicBookRes.json();
    assert.equal(atomicData.session.paymentStatus, 'PAID');
    assert.equal(atomicData.receipt.method, 'INVOICE');
    assert.equal(atomicData.session.price, 600);

    // 8. UC10: Delete added node, verify last remaining node cannot be deleted
    const delAdded = await learnerClient.request(`/api/trees/${tree.id}/nodes/${customNode.id}`, {
      method: 'DELETE',
      body: '{}',
    });
    assert.equal(delAdded.status, 200);

    // 9. UC7, UC8, UC12: HR creates team, adds learner, assigns tree, exports RFC-4180 CSV & JSON
    const teamRes = await hrClient.request('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'Platform Squad' }),
    });
    assert.equal(teamRes.status, 201);
    const { team } = await teamRes.json();

    const addMemberRes = await hrClient.request(`/api/teams/${team.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ learnerId }),
    });
    assert.equal(addMemberRes.status, 200);

    const assignRes = await hrClient.request('/api/hr/assign-tree', {
      method: 'POST',
      body: JSON.stringify({
        teamId: team.id,
        learnerId,
        profession: 'Backend Node.js Engineer',
        level: 'ADVANCED',
      }),
    });
    assert.equal(assignRes.status, 201);

    const matrixRes = await hrClient.request(`/api/teams/${team.id}/matrix`);
    assert.equal(matrixRes.status, 200);
    const matrixJson = await matrixRes.json();
    assert.equal(matrixJson.detailedMatrix.members.length, 1);

    const csvRes = await hrClient.request(`/api/teams/${team.id}/export?format=CSV`);
    assert.equal(csvRes.status, 200);
    assert.ok((csvRes.headers.get('content-type') || '').includes('text/csv'));
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    assert.deepEqual(Array.from(csvBuf.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
    const csvText = csvBuf.toString('utf8');
    assert.ok(csvText.includes('"Коваленко, Олександр"'));
  });

  it('Security: 401 unauthenticated, 403 RBAC & cross-user ownership, CSRF, XSS URLs, 413 payload, and removed backdoors', async () => {
    // Removed demo/backdoor endpoints MUST return 404
    const resetRes = await fetch(`${baseUrl}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SkillTreeUI' },
      body: '{}',
    });
    assert.equal(resetRes.status, 404);

    const blindResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SkillTreeUI' },
      body: JSON.stringify({ email: 'olex.uc@skilltree.ai', newPassword: 'hacked' }),
    });
    assert.equal(blindResetRes.status, 404);

    // Unauthenticated protected mutation -> 401
    const unauthTeam = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SkillTreeUI' },
      body: JSON.stringify({ name: 'Anon Team' }),
    });
    assert.equal(unauthTeam.status, 401);

    // CSRF Guard: Mismatched Origin -> 403
    const evilOriginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.example',
      },
      body: JSON.stringify({ email: 'a@b.com', password: 'Password123!' }),
    });
    assert.equal(evilOriginRes.status, 403);

    // CSRF Guard: missing X-Requested-With AND missing application/json -> 403
    const formPostRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=a@b.com&password=123',
    });
    assert.equal(formPostRes.status, 403);

    // Oversized JSON > 128 KB -> 413
    const hugeBody = JSON.stringify({ email: 'a@b.com', padding: 'x'.repeat(140_000) });
    const hugeRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SkillTreeUI' },
      body: hugeBody,
    });
    assert.equal(hugeRes.status, 413);

    // Register two learners and a mentor to verify RBAC, IDOR ownership, and XSS URL rejection
    const l1 = new CookieClient(baseUrl);
    const l2 = new CookieClient(baseUrl);
    const m1 = new CookieClient(baseUrl);

    const l1Reg = await (
      await l1.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Owner Learner',
          email: 'owner.sec@skilltree.ai',
          password: 'Password123!',
          role: 'LEARNER',
        }),
      })
    ).json();
    const l1TreeId = l1Reg.user.skillTrees[0].id;
    const l1NodeId = l1Reg.user.skillTrees[0].nodes[0].id;

    await l2.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Attacker Learner',
        email: 'attacker.sec@skilltree.ai',
        password: 'Password123!',
        role: 'LEARNER',
      }),
    });

    await m1.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Sec Mentor',
        email: 'mentor.sec@skilltree.ai',
        password: 'Password123!',
        role: 'MENTOR',
      }),
    });

    // Cross-role RBAC -> 403
    assert.equal(
      (await l1.request('/api/teams', { method: 'POST', body: JSON.stringify({ name: 'X' }) })).status,
      403
    );
    assert.equal(
      (
        await l1.request(`/api/nodes/${l1NodeId}/materials`, {
          method: 'POST',
          body: JSON.stringify({ title: 'T', type: 'TEXT' }),
        })
      ).status,
      403
    );
    assert.equal(
      (
        await m1.request('/api/trees/generate', {
          method: 'POST',
          body: JSON.stringify({ profession: 'QA' }),
        })
      ).status,
      403
    );

    // Cross-user IDOR ownership -> 403
    assert.equal(
      (
        await l2.request(`/api/trees/${l1TreeId}/nodes/${l1NodeId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'DONE' }),
        })
      ).status,
      403
    );
    assert.equal(
      (
        await l2.request(`/api/trees/${l1TreeId}/nodes/${l1NodeId}`, {
          method: 'DELETE',
          body: '{}',
        })
      ).status,
      403
    );

    // XSS javascript: URL blocked -> 400
    const xssMatRes = await m1.request(`/api/nodes/${l1NodeId}/materials`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Malicious Link',
        type: 'LINK',
        url: 'javascript:alert(document.cookie)',
      }),
    });
    assert.equal(xssMatRes.status, 400);
  });

  it('AuthSessions & Password Change: real multi-session revocation and invalidation on password change', async () => {
    const clientA = new CookieClient(baseUrl);
    const clientB = new CookieClient(baseUrl);

    await clientA.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Session Tester',
        email: 'sessions@skilltree.ai',
        password: 'InitialPass123!',
        role: 'LEARNER',
      }),
    });

    const loginB = await clientB.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sessions@skilltree.ai', password: 'InitialPass123!' }),
    });
    assert.equal(loginB.status, 200);

    // Client A lists real active sessions -> sees 2 sessions (A current, B other)
    const listRes = await clientA.request('/api/auth/sessions');
    assert.equal(listRes.status, 200);
    const { sessions } = await listRes.json();
    assert.equal(sessions.length, 2);
    const otherSession = sessions.find((s: any) => !s.isCurrent);
    assert.ok(otherSession);

    // Client A revokes Client B's session -> Client B is immediately kicked out!
    const revokeRes = await clientA.request(`/api/auth/sessions/${otherSession.id}`, {
      method: 'DELETE',
      body: '{}',
    });
    assert.equal(revokeRes.status, 200);

    const clientBProfile = await clientB.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: 'Should Fail' }),
    });
    assert.equal(clientBProfile.status, 401);

    // Re-login Client B, then Client A changes password with wrong current password (401) -> valid (200)
    await clientB.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sessions@skilltree.ai', password: 'InitialPass123!' }),
    });

    const wrongPwdRes = await clientA.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'WrongPassword', newPassword: 'UpdatedPass999!' }),
    });
    assert.equal(wrongPwdRes.status, 401);

    const changePwdRes = await clientA.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'InitialPass123!',
        newPassword: 'UpdatedPass999!',
      }),
    });
    assert.equal(changePwdRes.status, 200);

    // Password change must revoke Client B while keeping Client A alive
    assert.equal(
      (
        await clientB.request('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ fullName: 'Kicked After Password Change' }),
        })
      ).status,
      401
    );
    assert.equal(
      (
        await clientA.request('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ fullName: 'Session Tester Updated' }),
        })
      ).status,
      200
    );
  });

  it('Static frontend, SPA routes, compiled Tailwind CSS, traversal block, and zero stubs in public/index.html', async () => {
    for (const route of ['/', '/roadmap', '/mentors', '/mentor-cabinet', '/b2b', '/profile', '/auth']) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, `Expected 200 for ${route}`);
      assert.ok((res.headers.get('content-type') || '').includes('text/html'));
    }

    const twRes = await fetch(`${baseUrl}/tailwind.css`);
    assert.equal(twRes.status, 200);
    assert.ok((twRes.headers.get('content-type') || '').includes('text/css'));

    const jsRes = await fetch(`${baseUrl}/js/app.js`);
    assert.equal(jsRes.status, 200);
    assert.ok((jsRes.headers.get('content-type') || '').includes('application/javascript'));

    const traversalRes = await fetch(`${baseUrl}/%2e%2e/package.json`);
    assert.equal(traversalRes.status, 404);
    const traversalBody = await traversalRes.text();
    assert.equal(traversalBody.includes('"name": "skilltree-ai"'), false);

    const html = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf-8');
    assert.equal(html.includes('cdn.tailwindcss.com'), false);
    assert.equal(html.includes('demo1234'), false);
    assert.equal(html.includes('resetPasswordModal'), false);
    for (const id of [
      'page-auth',
      'page-roadmap',
      'page-mentors',
      'page-mentor-cabinet',
      'page-b2b',
      'page-profile',
      'constellation-canvas',
      'bookingDrawer',
      'assignModalBackdrop',
      'addMaterialModal',
    ]) {
      assert.ok(html.includes(id), `Expected #${id} in public/index.html`);
    }
  });
});
