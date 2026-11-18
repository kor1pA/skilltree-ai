import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/domain/index.ts';
import { AIServiceAdapter } from '../src/adapters/AIServiceAdapter.ts';
import { PaymentAdapter } from '../src/adapters/PaymentAdapter.ts';

describe('SkillTree AI — UML Domain Model (10 Classes & 5 Enums)', () => {
  it('UC1: User authentication, login, logout, and password reset', () => {
    const learner = new Learner({
      id: 1,
      fullName: 'Тест Студент',
      email: 'test@skilltree.ai',
      passwordHash: User.hashPassword('secret123'),
    });

    assert.equal(learner.login('wrong-pass'), false);
    assert.equal(learner.isLoggedIn, false);

    assert.equal(learner.login('secret123'), true);
    assert.equal(learner.isLoggedIn, true);

    learner.logout();
    assert.equal(learner.isLoggedIn, false);

    assert.throws(() => learner.resetPassword('12'), /щонайменше 4 символи/);
    learner.resetPassword('newpass99');
    assert.equal(learner.login('secret123'), false);
    assert.equal(learner.login('newpass99'), true);
  });

  it('UC2 & UC10: SkillTree generation, adding nodes, and composition 1:1..* invariant', () => {
    const ai = new AIServiceAdapter();
    let seq = 100;
    const nextId = () => ++seq;

    const learner = new Learner({
      id: 10,
      fullName: 'Олена',
      email: 'olena@test.ua',
      passwordHash: User.hashPassword('pass1234'),
    });

    const tree = learner.requestSkillTree('Full-Stack Developer', SkillLevel.BEGINNER, (id, p, l) =>
      ai.generateSkillTree(nextId, id, p, l)
    );

    assert.ok(tree.nodes.length >= 4);
    for (const node of tree.nodes) {
      assert.ok(node.materials.length >= 1, `Node ${node.title} must contain >= 1 material`);
    }

    const customNode = new SkillNode({
      id: nextId(),
      title: 'GraphQL API',
      orderNumber: tree.nodes.length + 1,
    });
    tree.addNode(customNode);
    assert.equal(tree.nodes.some((n) => n.id === customNode.id), true);

    // Видаляємо вузли доти, доки не залишиться 1
    while (tree.nodes.length > 1) {
      const lastId = tree.nodes[tree.nodes.length - 1].id;
      assert.equal(tree.removeNode(lastId), true);
    }

    // Негативний сценарій: останній вузол видалити не можна (композиція 1 : 1..*)
    const onlyNodeId = tree.nodes[0].id;
    assert.equal(tree.removeNode(onlyNodeId), false);
    assert.equal(tree.nodes.length, 1);
  });

  it('UC3: Progress calculation and regression test against duplicate points on DONE node', () => {
    const learner = new Learner({
      id: 20,
      fullName: 'Дмитро',
      email: 'dmytro@test.ua',
      passwordHash: User.hashPassword('pass1234'),
      points: 0,
    });

    const nodes = [1, 2, 3, 4].map(
      (n) => new SkillNode({ id: n, title: `Навичка ${n}`, orderNumber: n })
    );
    const tree = new SkillTree({
      id: 200,
      title: 'Backend Track',
      targetProfession: 'Backend Developer',
      learnerId: learner.id,
      nodes,
    });
    learner.skillTrees.push(tree);

    nodes[0].start();
    assert.equal(nodes[0].status, NodeStatus.IN_PROGRESS);
    assert.equal(tree.calculateProgress(), 0);

    // Завершуємо 2 з 4 вузлів -> прогрес 50%, бали 100
    learner.completeNode(tree.id, nodes[0].id);
    learner.completeNode(tree.id, nodes[1].id);
    assert.equal(tree.calculateProgress(), 50);
    assert.equal(learner.points, 100);
    assert.ok(learner.badges.includes('Перший крок'));

    // Регресійний тест: повторний виклик completeNode на вже DONE вузлі не дублює бали!
    learner.completeNode(tree.id, nodes[0].id);
    learner.completeNode(tree.id, nodes[1].id);
    assert.equal(learner.points, 100);

    // Завершуємо решту вузлів -> 100%, бали 200, бейдж Майстер дерева
    learner.completeNode(tree.id, nodes[2].id);
    learner.completeNode(tree.id, nodes[3].id);
    assert.equal(tree.calculateProgress(), 100);
    assert.equal(learner.points, 200);
    assert.ok(learner.badges.includes('Майстер дерева'));
  });

  it('UC4 & UC11: AI Assistant respects <= 5000ms SLA and ChatMessage rating works', () => {
    const ai = new AIServiceAdapter();
    let seq = 500;
    const learner = new Learner({
      id: 30,
      fullName: 'Максим',
      email: 'max@test.ua',
      passwordHash: User.hashPassword('pass1234'),
    });
    const tree = learner.requestSkillTree('QA Automation Engineer', SkillLevel.BEGINNER, (id, p, l) =>
      ai.generateSkillTree(() => ++seq, id, p, l)
    );
    const firstNode = tree.nodes[0];

    const message: ChatMessage = learner.askAssistant(
      firstNode.id,
      'Поясни простими словами техніки тест-дизайну',
      (node, q) => ai.generateAssistantAnswer(node, tree, q)
    );

    assert.ok(message.answer.length > 20);
    assert.ok(message.responseTimeMs <= 5000, `Expected <= 5000ms, got ${message.responseTimeMs}`);
    assert.equal(message.isHelpful, null);

    message.rate(true);
    assert.equal(message.isHelpful, true);
    message.rate(false);
    assert.equal(message.isHelpful, false);
  });

  it('UC5, UC6 & UC9: Material publishing, mandatory payment before confirm, feedback & rating', () => {
    const learner = new Learner({
      id: 40,
      fullName: 'Аліна',
      email: 'alina@test.ua',
      passwordHash: User.hashPassword('pass1234'),
    });
    const mentor = new Mentor({
      id: 41,
      fullName: 'Андрій Ментор',
      email: 'andriy@test.ua',
      passwordHash: User.hashPassword('pass1234'),
      hourlyRate: 1000,
    });
    const node = new SkillNode({ id: 400, title: 'TypeScript', orderNumber: 1 });
    const material = mentor.publishMaterial(
      node,
      'TS Deep Dive',
      'https://typescriptlang.org',
      MaterialType.LINK
    );
    assert.equal(node.materials.length, 1);
    assert.equal(material.title, 'TS Deep Dive');

    // Бронювання сесії
    const session: MentorSession = learner.bookSession(
      mentor,
      new Date(Date.now() + 86400000),
      'Розбір дженеріків',
      60
    );
    assert.equal(session.status, SessionStatus.BOOKED);
    assert.equal(session.paymentStatus, PaymentStatus.PENDING);

    // Регресійний тест: підтвердження БЕЗ оплати заборонено (UC6 -> include UC9)
    assert.throws(() => mentor.confirmSession(session), /оплат/i);
    assert.throws(() => session.leaveFeedback(5, 'Добре'), /після оплати/i);

    // Оплата через PaymentAdapter
    const paymentAdapter = new PaymentAdapter();
    const receipt = paymentAdapter.processPayment(session);
    assert.equal(receipt.status, PaymentStatus.PAID);
    assert.equal(session.paymentStatus, PaymentStatus.PAID);

    // Тепер підтвердження проходить
    mentor.confirmSession(session);
    assert.equal(session.status, SessionStatus.CONFIRMED);

    // Валідація діапазону оцінки 1..5
    assert.throws(() => session.leaveFeedback(6, 'Завелика оцінка'), /від 1 до 5/);
    assert.throws(() => session.leaveFeedback(0, 'Замала оцінка'), /від 1 до 5/);

    session.leaveFeedback(4, 'Корисна сесія!');
    assert.equal(session.status, SessionStatus.DONE);
    assert.equal(mentor.recalculateRating(), 4);

    // Друга сесія з оцінкою 5 -> середній рейтинг (4+5)/2 = 4.5
    const session2 = learner.bookSession(mentor, new Date(Date.now() + 172800000), 'Тести', 60);
    paymentAdapter.processPayment(session2);
    mentor.confirmSession(session2);
    session2.leaveFeedback(5, 'Супер!');
    assert.equal(mentor.recalculateRating(), 4.5);

    // Скасування оплаченої сесії повертає кошти (REFUNDED)
    const session3 = learner.bookSession(mentor, new Date(Date.now() + 259200000), 'Docker', 30);
    paymentAdapter.processPayment(session3);
    session3.cancel();
    assert.equal(session3.status, SessionStatus.CANCELLED);
    assert.equal(session3.paymentStatus, PaymentStatus.REFUNDED);
    assert.throws(() => mentor.confirmSession(session3), /скасовану/);
  });

  it('UC7, UC8 & UC12: B2B Skill Matrix calculation, tree assignment, and RFC-4180 CSV export', () => {
    const hr = new HRManager({
      id: 50,
      fullName: 'Марія HR',
      email: 'hr@technova.ua',
      passwordHash: User.hashPassword('pass1234'),
      company: 'TechNova',
    });
    const team: Team = hr.createTeam('Core, "Alpha" Team');

    const emp1 = new Learner({
      id: 51,
      fullName: 'Коваленко, Тарас',
      email: 'taras@technova.ua',
      passwordHash: User.hashPassword('pass1234'),
      targetProfession: 'Backend',
    });

    const templateTree = new SkillTree({
      id: 500,
      title: 'Backend Roadmap',
      targetProfession: 'Backend',
      level: SkillLevel.INTERMEDIATE,
      learnerId: 0,
      nodes: [
        new SkillNode({
          id: 501,
          title: 'Node.js',
          orderNumber: 1,
          status: NodeStatus.DONE, // у шаблоні DONE, при призначенні має скидатися на NOT_STARTED
          materials: [
            new LearningMaterial({
              id: 510,
              title: 'Node Docs',
              type: MaterialType.LINK,
              url: 'https://nodejs.org',
            }),
          ],
        }),
        new SkillNode({ id: 502, title: 'SQL', orderNumber: 2 }),
      ],
    });

    hr.assignSkillTree(emp1, templateTree);
    assert.equal(emp1.skillTrees.length, 1);
    assert.equal(emp1.skillTrees[0].nodes[0].status, NodeStatus.NOT_STARTED);

    emp1.completeNode(emp1.skillTrees[0].id, emp1.skillTrees[0].nodes[0].id);
    team.addMember(emp1);

    const matrix = team.getSkillMatrix();
    assert.equal(matrix['Backend'], 50);

    const csv = hr.exportReport(team, 'CSV');
    assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM');
    assert.ok(csv.includes('"Коваленко, Тарас"'), 'Comma in fullName must be RFC-4180 quoted');
    assert.ok(csv.includes('50.0'), 'Progress 50.0 must be present in CSV');
  });

  it('Edge Cases: MentorSession double payment, cancelling DONE session, non-integer rating, and invalid booking inputs', () => {
    const learner = new Learner({
      id: 60,
      fullName: 'Ігор',
      email: 'igor@test.ua',
      passwordHash: User.hashPassword('pass1234'),
    });
    const mentor = new Mentor({
      id: 61,
      fullName: 'Сергій',
      email: 'serhiy@test.ua',
      passwordHash: User.hashPassword('pass1234'),
      hourlyRate: 1200,
    });
    const paymentAdapter = new PaymentAdapter();

    // Невалідна тривалість і дата бронювання
    assert.throws(() => learner.bookSession(mentor, new Date(Date.now() + 3600000), 'Test', 0), /більшою за 0/);
    assert.throws(() => learner.bookSession(mentor, new Date(Date.now() + 3600000), 'Test', -30), /більшою за 0/);
    assert.throws(() => learner.bookSession(mentor, new Date('invalid-date'), 'Test', 60), /Некоректна дата/);

    // Подвійна оплата заборонена
    const session = learner.bookSession(mentor, new Date(Date.now() + 86400000), 'Code Review', 60);
    paymentAdapter.processPayment(session);
    assert.equal(session.pay(), false);
    assert.throws(() => paymentAdapter.processPayment(session), /вже оплачена/);

    // Дробова оцінка заборонена
    assert.throws(() => session.leaveFeedback(4.5, 'Добре'), /цілим числом/);

    // Завершену (DONE) сесію не можна скасувати
    mentor.confirmSession(session);
    session.leaveFeedback(5, 'Відмінно');
    assert.throws(() => session.cancel(), /завершену сесію/);
  });

  it('Edge Cases: SkillNode.start() does not downgrade DONE node and empty SkillTree progress is 0%', () => {
    const emptyTree = new SkillTree({
      id: 700,
      title: 'Empty',
      targetProfession: 'QA',
      learnerId: 1,
      nodes: [],
    });
    assert.equal(emptyTree.calculateProgress(), 0);

    const node = new SkillNode({ id: 701, title: 'Unit Tests', orderNumber: 1 });
    const tree = new SkillTree({
      id: 702,
      title: 'QA',
      targetProfession: 'QA',
      learnerId: 1,
      nodes: [node],
    });
    node.complete();
    assert.equal(tree.calculateProgress(), 100);

    // Повторний виклик start() не повинен понижувати статус DONE назад у IN_PROGRESS
    node.start();
    assert.equal(node.status, NodeStatus.DONE);
    assert.equal(tree.calculateProgress(), 100);
  });
});
