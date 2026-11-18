import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { DataStore } from '../src/repositories/DataStore.ts';
import { createAppServer } from '../src/server.ts';

let server: Server;
let baseUrl: string;
let store: DataStore;

describe('SkillTree AI — REST API Integration Tests (UC1–UC12)', () => {
  before(async () => {
    store = new DataStore(null); // ізольоване in-memory сховище для тестів
    server = createAppServer(store);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('GET / and GET /api/state return 200 and seeded data', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('SkillTree AI'));

    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.equal(state.learners.length, 3);
    assert.equal(state.mentors.length, 2);
    assert.equal(state.teams.length, 1);
  });

  it('UC1: register new user and login with credentials', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'API Тестер',
        email: 'api.tester@skilltree.ai',
        password: 'password123',
        role: 'LEARNER',
        targetProfession: 'DevOps & Cloud Engineer',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.user.fullName, 'API Тестер');
    assert.equal(regData.user.skillTrees.length, 1);

    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'api.tester@skilltree.ai', password: 'wrong' }),
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'api.tester@skilltree.ai', password: 'password123' }),
    });
    assert.equal(goodLogin.status, 200);
  });

  it('UC2, UC3, UC4, UC10, UC11: generate tree, add/delete node, complete node, ask AI & rate', async () => {
    // UC2: Generate tree for learner 1
    const genRes = await fetch(`${baseUrl}/api/trees/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerId: 1,
        profession: 'UI/UX Product Designer',
        level: 'INTERMEDIATE',
      }),
    });
    assert.equal(genRes.status, 201);
    const { tree } = await genRes.json();
    assert.ok(tree.nodes.length >= 4);

    // UC10: Add node
    const addRes = await fetch(`${baseUrl}/api/trees/${tree.id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Motion Design у Figma',
        description: 'Мікровзаємодії та прототипи',
      }),
    });
    assert.equal(addRes.status, 201);
    const { node: addedNode } = await addRes.json();

    // UC3: Complete added node
    const statusRes = await fetch(`${baseUrl}/api/trees/${tree.id}/nodes/${addedNode.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.node.status, 'DONE');
    const pointsAfterComplete = statusData.learnerPoints;

    // Duplicate complete check via HTTP
    const dupRes = await fetch(`${baseUrl}/api/trees/${tree.id}/nodes/${addedNode.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    });
    const dupData = await dupRes.json();
    assert.equal(dupData.learnerPoints, pointsAfterComplete);

    // UC4: Ask AI Assistant
    const chatRes = await fetch(`${baseUrl}/api/trees/${tree.id}/nodes/${addedNode.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'З чого почати вивчення анімацій?' }),
    });
    assert.equal(chatRes.status, 201);
    const { message } = await chatRes.json();
    assert.ok(message.responseTimeMs <= 5000);

    // UC11: Rate AI answer
    const rateRes = await fetch(`${baseUrl}/api/chat/${message.id}/rate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ helpful: true }),
    });
    assert.equal(rateRes.status, 200);
    const rateData = await rateRes.json();
    assert.equal(rateData.message.isHelpful, true);

    // UC10: Delete added node
    const delRes = await fetch(`${baseUrl}/api/trees/${tree.id}/nodes/${addedNode.id}`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 200);
  });

  it('UC5, UC6, UC9: Mentor material, session booking, payment guard, and rating recalculation', async () => {
    const stateRes = await fetch(`${baseUrl}/api/state`);
    const state = await stateRes.json();
    const firstNodeId = state.learners[0].skillTrees[0].nodes[0].id;
    const mentorId = state.mentors[1].id;

    // UC5: Mentor publishes material
    const matRes = await fetch(`${baseUrl}/api/nodes/${firstNodeId}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mentorId,
        title: 'Чекліст Clean Code',
        type: 'TEXT',
        url: '#clean-code',
      }),
    });
    assert.equal(matRes.status, 201);

    // UC6: Book session
    const bookRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerId: 1,
        mentorId,
        topic: 'Архітектура застосунку',
        startAt: new Date(Date.now() + 86400000).toISOString(),
        durationMin: 60,
      }),
    });
    assert.equal(bookRes.status, 201);
    const { session } = await bookRes.json();

    // Confirm before payment MUST fail with 400
    const unpaidConfirm = await fetch(`${baseUrl}/api/sessions/${session.id}/confirm`, {
      method: 'POST',
    });
    assert.equal(unpaidConfirm.status, 400);

    // UC9: Pay session
    const payRes = await fetch(`${baseUrl}/api/sessions/${session.id}/pay`, { method: 'POST' });
    assert.equal(payRes.status, 200);

    // Confirm after payment succeeds
    const paidConfirm = await fetch(`${baseUrl}/api/sessions/${session.id}/confirm`, {
      method: 'POST',
    });
    assert.equal(paidConfirm.status, 200);

    // Leave feedback
    const fbRes = await fetch(`${baseUrl}/api/sessions/${session.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, feedback: 'Чудова консультація!' }),
    });
    assert.equal(fbRes.status, 200);
    const fbData = await fbRes.json();
    assert.equal(fbData.session.status, 'DONE');
    assert.equal(fbData.mentorRating, 5);
  });

  it('UC7, UC8, UC12: HR Skill Matrix, assign tree, and CSV export', async () => {
    const stateRes = await fetch(`${baseUrl}/api/state`);
    const state = await stateRes.json();
    const teamId = state.teams[0].id;

    // UC7: Matrix
    const matrixRes = await fetch(`${baseUrl}/api/teams/${teamId}/matrix`);
    assert.equal(matrixRes.status, 200);
    const matrixData = await matrixRes.json();
    assert.ok(matrixData.detailedMatrix.members.length >= 3);

    // UC8: Assign tree
    const assignRes = await fetch(`${baseUrl}/api/hr/assign-tree`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerId: 3,
        profession: 'Full-Stack Developer',
        level: 'INTERMEDIATE',
      }),
    });
    assert.equal(assignRes.status, 201);

    // UC12: Export CSV
    const exportRes = await fetch(`${baseUrl}/api/teams/${teamId}/export?format=CSV`);
    assert.equal(exportRes.status, 200);
    assert.ok((exportRes.headers.get('content-type') || '').includes('text/csv'));
    const csv = await exportRes.text();
    assert.ok(csv.includes('ПІБ співробітника'));
    assert.ok(csv.includes('Дмитро Мельник'));
  });
});
