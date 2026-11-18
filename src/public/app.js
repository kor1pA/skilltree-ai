const state = {
  data: null,
  activeView: 'learner-tree',
  selectedTreeId: null,
  selectedNodeId: null,
  selectedTeamId: null,
  checkoutSessionId: null,
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LABELS = {
  nodeStatus: {
    NOT_STARTED: 'Не розпочато',
    IN_PROGRESS: 'У процесі',
    DONE: 'Завершено',
  },
  skillLevel: {
    BEGINNER: 'Початковий',
    INTERMEDIATE: 'Середній',
    ADVANCED: 'Просунутий',
  },
  sessionStatus: {
    BOOKED: 'Заброньовано',
    CONFIRMED: 'Підтверджено',
    DONE: 'Завершено',
    CANCELLED: 'Скасовано',
  },
  paymentStatus: {
    PENDING: 'Очікує оплати',
    PAID: 'Оплачено',
    REFUNDED: 'Кошти повернено',
  },
  materialType: {
    TEXT: '📖 Урок / Конспект',
    LINK: '🔗 Документація',
    VIDEO: '🎬 Відеоурок',
  },
  role: {
    LEARNER: 'Студент / Фахівець',
    MENTOR: 'Ментор / Експерт',
    HR: 'HR / TeamLead',
  },
};

const VIEW_META = {
  'learner-tree': {
    title: 'Мої карти розвитку',
    subtitle: 'Проходьте навички покроково, читайте вбудовані уроки та вирішуйте питання з ШІ.',
  },
  'learner-create': {
    title: 'Створити нову карту розвитку',
    subtitle: 'Оберіть професію та рівень — ШІ згенерує покроковий план навчання з матеріалами.',
  },
  'learner-mentors': {
    title: 'Ментори та консультації',
    subtitle: 'Оберіть експерта для 1-на-1 розбору коду, оплатіть сесію та залиште відгук.',
  },
  'mentor-dashboard': {
    title: 'Кабінет ментора',
    subtitle: 'Публікуйте авторські уроки у вузли карт та підтверджуйте оплачені сесії.',
  },
  'hr-dashboard': {
    title: 'B2B Кабінет: Skill Matrix команди',
    subtitle: 'Аналізуйте рівень компетенцій співробітників, призначайте карти та експортуйте CSV-звіти.',
  },
};

function getInitials(name) {
  return String(name || 'ST')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function formatRichText(raw) {
  const parts = String(raw ?? '').split(/```(\w*)\n?([\s\S]*?)```/g);
  let html = '';
  for (let i = 0; i < parts.length; i += 3) {
    const textPart = parts[i] || '';
    const formatted = esc(textPart)
      .replace(/^### (.+)$/gm, '<strong style="font-size:1rem;display:block;margin:0.4rem 0 0.2rem;">$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    html += formatted;
    if (i + 2 < parts.length) {
      const code = parts[i + 2] || '';
      html += `<pre><code>${esc(code.trim())}</code></pre>`;
    }
  }
  return html;
}

function showToast(message, isError = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4200);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Помилка виконання запиту.');
    }
    return json;
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || 'Помилка виконання запиту.');
  }
  return text;
}

function getCurrentUser() {
  return state.data?.currentUser || null;
}

function getActiveLearner() {
  const user = getCurrentUser();
  if (!user || user.role !== 'LEARNER') return null;
  return state.data.learners.find((l) => l.id === user.id) || user;
}

function getActiveMentor() {
  const user = getCurrentUser();
  if (!user || user.role !== 'MENTOR') return null;
  return state.data.mentors.find((m) => m.id === user.id) || user;
}

function getActiveTree(learner) {
  if (!learner?.skillTrees?.length) return null;
  return learner.skillTrees.find((t) => t.id === state.selectedTreeId) || learner.skillTrees[0];
}

function getActiveNode(tree) {
  if (!tree?.nodes?.length) return null;
  return tree.nodes.find((n) => n.id === state.selectedNodeId) || tree.nodes[0];
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });
  const meta = VIEW_META[viewName] || VIEW_META['learner-tree'];
  $('pageTitle').textContent = meta.title;
  $('pageSubtitle').textContent = meta.subtitle;
}

function syncSelectionsFromData(data) {
  state.data = data;
  const current = getCurrentUser();
  if (!current) {
    state.selectedTreeId = null;
    state.selectedNodeId = null;
    return;
  }

  if (current.role === 'LEARNER') {
    const learner = getActiveLearner();
    if (learner) {
      if (!learner.skillTrees.some((t) => t.id === state.selectedTreeId)) {
        state.selectedTreeId = learner.skillTrees[0]?.id ?? null;
      }
      const tree = getActiveTree(learner);
      if (tree && !tree.nodes.some((n) => n.id === state.selectedNodeId)) {
        state.selectedNodeId = tree.nodes[0]?.id ?? null;
      }
    }
    if (!['learner-tree', 'learner-create', 'learner-mentors'].includes(state.activeView)) {
      state.activeView = 'learner-tree';
    }
  } else if (current.role === 'MENTOR') {
    state.activeView = 'mentor-dashboard';
  } else if (current.role === 'HR') {
    if (!state.selectedTeamId && data.teams[0]) {
      state.selectedTeamId = data.teams[0].id;
    }
    state.activeView = 'hr-dashboard';
  }
}

function renderKpis() {
  const user = getCurrentUser();
  const { kpi, sessions, teams, learners } = state.data;
  const kpiRow = $('kpiRow');

  if (!user) {
    kpiRow.innerHTML = '';
    return;
  }

  if (user.role === 'LEARNER') {
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    kpiRow.innerHTML = `
      <div class="kpi-pill"><span class="kpi-pill-label">Прогрес карти</span><strong>${tree ? tree.progress : 0}%</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Досвід студента</span><strong>${learner ? learner.points : 0} XP</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Швидкість ШІ</span><strong>${kpi.avgAiResponseMs} мс</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Корисність ШІ</span><strong>${kpi.aiHelpfulnessPct}%</strong></div>
    `;
  } else if (user.role === 'MENTOR') {
    const mentor = getActiveMentor();
    const mySessions = sessions.filter((s) => s.mentorId === mentor.id);
    kpiRow.innerHTML = `
      <div class="kpi-pill"><span class="kpi-pill-label">Рейтинг ментора</span><strong>★ ${mentor.rating}</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Ставка</span><strong>${mentor.hourlyRate} ₴/год</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Сесій у черзі</span><strong>${mySessions.length}</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Публікацій</span><strong>${mentor.publishedMaterialsCount ?? 0}</strong></div>
    `;
  } else {
    const activeTeam = teams.find((t) => t.id === state.selectedTeamId) || teams[0];
    const avgProgress = activeTeam?.detailedMatrix?.teamAverageProgress ?? 0;
    kpiRow.innerHTML = `
      <div class="kpi-pill"><span class="kpi-pill-label">Команд</span><strong>${teams.length}</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Співробітників</span><strong>${learners.length}</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Середній прогрес</span><strong>${avgProgress}%</strong></div>
      <div class="kpi-pill"><span class="kpi-pill-label">Швидкість ШІ</span><strong>${kpi.avgAiResponseMs} мс</strong></div>
    `;
  }
}

function renderSidebarAndHeader() {
  const user = getCurrentUser();
  if (!user) return;

  $('sidebarAvatar').textContent = getInitials(user.fullName);
  $('sidebarUserName').textContent = user.fullName;
  $('sidebarUserEmail').textContent = user.email;
  $('sidebarUserRole').textContent = LABELS.role[user.role] || user.role;

  // Strict RBAC navigation visibility
  $('navGroupLearner').classList.toggle('hidden', user.role !== 'LEARNER');
  $('navGroupMentor').classList.toggle('hidden', user.role !== 'MENTOR');
  $('navGroupHr').classList.toggle('hidden', user.role !== 'HR');

  $('professionList').innerHTML = (state.data.professions || [])
    .map((p) => `<option value="${esc(p)}"></option>`)
    .join('');

  switchView(state.activeView);
  renderKpis();
}

function renderLearnerTreeView() {
  const learner = getActiveLearner();
  if (!learner) return;

  $('treeSelect').innerHTML = learner.skillTrees
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === state.selectedTreeId ? 'selected' : ''}>${esc(t.targetProfession)} (${LABELS.skillLevel[t.level] || t.level}) — ${t.progress}%</option>`
    )
    .join('');

  const tree = getActiveTree(learner);
  $('badgesRow').innerHTML =
    learner.badges.length > 0
      ? learner.badges.map((b) => `<span class="badge-chip">🏆 ${esc(b)}</span>`).join('')
      : '<span class="muted">Завершіть першу навичку, щоб отримати бейдж!</span>';

  if (!tree) {
    $('treeTitle').textContent = 'Карта відсутня';
    $('nodesList').innerHTML = '<div class="muted">Створіть свою першу карту розвитку!</div>';
    renderNodeStudyPanel(null);
    return;
  }

  $('treeTitle').textContent = tree.targetProfession;
  $('treeMeta').textContent = `Рівень: ${LABELS.skillLevel[tree.level] || tree.level} • Вузлів: ${tree.nodes.length}`;
  $('treePercentBadge').textContent = `${tree.progress}%`;
  $('treeProgressFill').style.width = `${tree.progress}%`;

  const activeNode = getActiveNode(tree);
  $('nodesList').innerHTML = tree.nodes
    .map(
      (node) => `
      <div class="timeline-item ${activeNode?.id === node.id ? 'selected' : ''}" data-node-id="${node.id}">
        <div class="timeline-left">
          <span class="node-circle ${node.status}">${node.status === 'DONE' ? '✓' : node.orderNumber}</span>
          <div>
            <span class="timeline-title">${esc(node.title)}</span>
            <span class="timeline-sub">${node.materials.length} матеріал(ів) • ${node.messages.length} запитань ШІ</span>
          </div>
        </div>
        <div class="timeline-right">
          <span class="status-pill ${node.status}">${LABELS.nodeStatus[node.status] || node.status}</span>
          <button type="button" class="btn btn-danger btn-sm delete-node-btn" data-delete-node="${node.id}" title="Видалити навичку">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  renderNodeStudyPanel(activeNode);
}

function renderNodeStudyPanel(node) {
  if (!node) {
    $('nodeInspectorEmpty').classList.remove('hidden');
    $('nodeInspectorContent').classList.add('hidden');
    return;
  }

  $('nodeInspectorEmpty').classList.add('hidden');
  $('nodeInspectorContent').classList.remove('hidden');

  const badge = $('activeNodeBadge');
  badge.textContent = LABELS.nodeStatus[node.status] || node.status;
  badge.className = `status-pill ${node.status}`;

  $('activeNodeTitle').textContent = `${node.orderNumber}. ${node.title}`;
  $('activeNodeDesc').textContent = node.description || 'Опис відсутній.';

  const actionsEl = $('nodeActionButtons');
  if (node.status === 'DONE') {
    actionsEl.innerHTML = '<span class="status-pill DONE">✓ Навичку засвоєно (+50 XP)</span>';
  } else if (node.status === 'IN_PROGRESS') {
    actionsEl.innerHTML =
      '<button type="button" id="completeNodeBtn" class="btn btn-success btn-sm">✓ Завершити навичку (+50 XP)</button>';
  } else {
    actionsEl.innerHTML = `
      <button type="button" id="startNodeBtn" class="btn btn-secondary btn-sm">▶ Почати вивчення</button>
      <button type="button" id="completeNodeBtn" class="btn btn-success btn-sm">✓ Завершити (+50 XP)</button>
    `;
  }

  $('materialsCount').textContent = `${node.materials.length} матеріал(ів)`;
  const materialsEl = $('nodeMaterialsList');
  if (node.materials.length === 0) {
    materialsEl.innerHTML = '<div class="muted">Матеріалів поки немає. Ментор може додати урок до цього вузла.</div>';
  } else {
    materialsEl.innerHTML = node.materials
      .map((m) => {
        const hasValidUrl = m.url && /^https?:\/\//i.test(m.url);
        return `
        <div class="material-card">
          <div class="material-meta">
            <span class="muted" style="font-size:0.75rem;">${LABELS.materialType[m.type] || m.type}</span>
            <strong>${esc(m.title)}</strong>
            ${m.description ? `<span class="muted">${esc(m.description)}</span>` : ''}
          </div>
          <div class="material-actions">
            <button type="button" class="btn btn-primary btn-sm open-lesson-btn" data-material-id="${m.id}">📖 Читати урок</button>
            ${
              hasValidUrl
                ? `<a href="${esc(m.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Джерело ↗</a>`
                : ''
            }
          </div>
        </div>
      `;
      })
      .join('');
  }

  const chatEl = $('chatMessages');
  if (node.messages.length === 0) {
    chatEl.innerHTML =
      '<div class="muted">Історія діалогу порожня. Натисніть швидку підказку вище або запитайте будь-що по темі!</div>';
  } else {
    chatEl.innerHTML = node.messages
      .map(
        (msg) => `
      <div class="chat-turn">
        <div class="bubble-user">${esc(msg.question)}</div>
        <div class="bubble-ai">
          <div class="bubble-ai-body">${formatRichText(msg.answer)}</div>
          <div class="bubble-footer">
            <span>⏱ Час відповіді: ${msg.responseTimeMs} мс</span>
            <div class="rate-group">
              <button type="button" class="rate-btn ${msg.isHelpful === true ? 'active-good' : ''}" data-rate-msg="${msg.id}" data-helpful="true">👍 Корисно</button>
              <button type="button" class="rate-btn ${msg.isHelpful === false ? 'active-bad' : ''}" data-rate-msg="${msg.id}" data-helpful="false">👎 Некорисно</button>
            </div>
          </div>
        </div>
      </div>
    `
      )
      .join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

function renderCreateWizard() {
  const { professions } = state.data;
  const currentProf = $('genProfession').value.trim();
  $('professionCardsGrid').innerHTML = professions
    .map(
      (p) => `
      <button type="button" class="preset-card ${p.toLowerCase() === currentProf.toLowerCase() ? 'selected' : ''}" data-preset-prof="${esc(p)}">
        <strong>${esc(p)}</strong>
        <span>Готовий трек навичок + уроки</span>
      </button>
    `
    )
    .join('');
}

function renderMentorsView() {
  const learner = getActiveLearner();
  if (!learner) return;
  const { mentors, sessions, receipts } = state.data;

  $('mentorsDirectoryGrid').innerHTML = mentors
    .map(
      (m) => `
      <div class="mentor-card">
        <div class="mentor-card-top">
          <div class="avatar-circle">${getInitials(m.fullName)}</div>
          <div>
            <strong>${esc(m.fullName)}</strong>
            <div class="muted">${esc(m.specialization)} • ★ ${m.rating} • ${m.hourlyRate} ₴/год</div>
          </div>
        </div>
        <p class="muted">${esc(m.bio)}</p>
        <button type="button" class="btn btn-secondary btn-sm select-mentor-book-btn" data-mentor-id="${m.id}">Обрати для бронювання</button>
      </div>
    `
    )
    .join('');

  $('bookingMentorSelect').innerHTML = mentors
    .map(
      (m) =>
        `<option value="${m.id}">${esc(m.fullName)} — ${esc(m.specialization)} (${m.hourlyRate} ₴/год, ★ ${m.rating})</option>`
    )
    .join('');

  const learnerSessions = sessions.filter((s) => s.learnerId === learner.id);
  const el = $('learnerSessionsList');
  if (learnerSessions.length === 0) {
    el.innerHTML = '<div class="muted">У вас ще немає заброньованих сесій.</div>';
    return;
  }

  el.innerHTML = learnerSessions
    .map((s) => {
      const mentor = mentors.find((m) => m.id === s.mentorId);
      const receipt = receipts.find((r) => r.sessionId === s.id);
      const dateStr = new Date(s.startAt).toLocaleString('uk-UA');
      const canPay = s.paymentStatus === 'PENDING' && s.status !== 'CANCELLED';
      const canFeedback = s.paymentStatus === 'PAID' && s.status !== 'CANCELLED' && s.rating === null;
      const canCancel = s.status !== 'CANCELLED' && s.status !== 'DONE';

      return `
        <div class="session-item">
          <div class="session-item-top">
            <div>
              <strong>${esc(s.topic)}</strong>
              <div class="muted">Ментор: ${esc(mentor?.fullName ?? s.mentorId)} • ${esc(dateStr)} • ${s.durationMin} хв • <strong>${s.price} ₴</strong></div>
            </div>
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
              <span class="status-pill ${s.status}">${LABELS.sessionStatus[s.status] || s.status}</span>
              <span class="status-pill ${s.paymentStatus}">${LABELS.paymentStatus[s.paymentStatus] || s.paymentStatus}</span>
            </div>
          </div>
          ${s.rating !== null ? `<div class="muted">Ваш відгук: ★ ${s.rating}/5 — «${esc(s.feedback)}»</div>` : ''}
          <div class="session-item-actions">
            ${canPay ? `<button type="button" class="btn btn-primary btn-sm open-checkout-btn" data-session-id="${s.id}">💳 Оплатити сесію</button>` : ''}
            ${receipt ? `<button type="button" class="btn btn-secondary btn-sm view-receipt-btn" data-session-id="${s.id}">🧾 Квитанція</button>` : ''}
            ${canCancel ? `<button type="button" class="btn btn-danger btn-sm cancel-session-btn" data-session-id="${s.id}">Скасувати</button>` : ''}
            ${
              canFeedback
                ? `
              <form class="inline-form feedback-form" data-session-id="${s.id}" style="width:100%;margin-top:0.35rem;">
                <select name="rating" style="max-width:90px;">
                  <option value="5">★ 5</option>
                  <option value="4">★ 4</option>
                  <option value="3">★ 3</option>
                  <option value="2">★ 2</option>
                  <option value="1">★ 1</option>
                </select>
                <input name="feedback" type="text" placeholder="Залиште враження від консультації..." required />
                <button type="submit" class="btn btn-success btn-sm">Надіслати відгук</button>
              </form>
            `
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function renderMentorDashboard() {
  const mentor = getActiveMentor();
  if (!mentor) return;
  const { learners, sessions } = state.data;

  $('mentorProfileSummary').innerHTML = `
    <span><strong>Ментор:</strong> ${esc(mentor.fullName)}</span>
    <span><strong>Спеціалізація:</strong> ${esc(mentor.specialization)}</span>
    <span><strong>Ставка:</strong> ${mentor.hourlyRate} ₴/год</span>
    <span><strong>Рейтинг:</strong> ★ ${mentor.rating}</span>
  `;

  const nodeOptions = [];
  for (const l of learners) {
    for (const t of l.skillTrees) {
      for (const n of t.nodes) {
        nodeOptions.push(
          `<option value="${n.id}">${esc(l.fullName)} → ${esc(t.targetProfession)} → ${n.orderNumber}. ${esc(n.title)}</option>`
        );
      }
    }
  }
  $('mentorNodeSelect').innerHTML = nodeOptions.join('');

  const mentorSessions = sessions.filter((s) => s.mentorId === mentor.id);
  const el = $('mentorSessionsList');
  if (mentorSessions.length === 0) {
    el.innerHTML = '<div class="muted">У вас поки немає запланованих сесій.</div>';
    return;
  }

  el.innerHTML = mentorSessions
    .map((s) => {
      const learner = learners.find((l) => l.id === s.learnerId);
      const dateStr = new Date(s.startAt).toLocaleString('uk-UA');
      const canConfirm = s.status === 'BOOKED';

      return `
        <div class="session-item">
          <div class="session-item-top">
            <div>
              <strong>${esc(s.topic)}</strong>
              <div class="muted">Студент: ${esc(learner?.fullName ?? s.learnerId)} • ${esc(dateStr)} • ${s.price} ₴</div>
            </div>
            <div style="display:flex;gap:0.35rem;">
              <span class="status-pill ${s.status}">${LABELS.sessionStatus[s.status] || s.status}</span>
              <span class="status-pill ${s.paymentStatus}">${LABELS.paymentStatus[s.paymentStatus] || s.paymentStatus}</span>
            </div>
          </div>
          ${s.feedback ? `<div class="muted">Відгук студента (★ ${s.rating}/5): «${esc(s.feedback)}»</div>` : ''}
          ${
            canConfirm
              ? `<div class="session-item-actions"><button type="button" class="btn btn-primary btn-sm confirm-session-btn" data-session-id="${s.id}">✓ Підтвердити сесію</button></div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function renderHrDashboard() {
  const user = getCurrentUser();
  if (!user || user.role !== 'HR') return;
  const { teams, learners } = state.data;

  $('teamSelect').innerHTML = teams
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === state.selectedTeamId ? 'selected' : ''}>${esc(t.name)}</option>`
    )
    .join('');

  $('hrLearnerSelect').innerHTML = learners
    .map((l) => `<option value="${l.id}">${esc(l.fullName)} (${esc(l.targetProfession)})</option>`)
    .join('');
  $('addMemberLearnerSelect').innerHTML = learners
    .map((l) => `<option value="${l.id}">${esc(l.fullName)}</option>`)
    .join('');

  const team = teams.find((t) => t.id === state.selectedTeamId) || teams[0];
  if (!team) return;

  const matrix = team.detailedMatrix;
  const profEntries = Object.entries(matrix.professionAverages || {});
  $('skillMatrixBars').innerHTML =
    profEntries.length === 0
      ? '<div class="muted">Немає даних для побудови матриці.</div>'
      : profEntries
          .map(
            ([prof, pct]) => `
        <div>
          <div class="matrix-item-head"><strong>${esc(prof)}</strong><span>${pct}%</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      `
          )
          .join('');

  const nodeEntries = Object.entries(matrix.skillNodeAverages || {}).slice(0, 8);
  $('nodeMatrixBars').innerHTML = nodeEntries
    .map(
      ([skill, pct]) => `
      <div>
        <div class="matrix-item-head"><span>${esc(skill)}</span><span>${pct}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `
    )
    .join('');

  $('hrMembersTableBody').innerHTML = (matrix.members || [])
    .map(
      (m) => `
      <tr>
        <td>${m.learnerId}</td>
        <td><strong>${esc(m.fullName)}</strong></td>
        <td>${esc(m.email)}</td>
        <td>${esc(m.targetProfession)}</td>
        <td><span class="status-pill">${esc(LABELS.skillLevel[m.level] || m.level)}</span></td>
        <td>${m.treesCount}</td>
        <td>${m.doneNodes}/${m.totalNodes}</td>
        <td><strong>${m.progressPct}%</strong></td>
        <td>${m.points} XP</td>
      </tr>
    `
    )
    .join('');
}

function renderAll() {
  if (!state.data) return;
  const user = getCurrentUser();
  if (!user) {
    $('authScreen').classList.remove('hidden');
    $('appLayout').classList.add('hidden');
    return;
  }

  $('authScreen').classList.add('hidden');
  $('appLayout').classList.remove('hidden');

  renderSidebarAndHeader();
  if (user.role === 'LEARNER') {
    renderLearnerTreeView();
    renderCreateWizard();
    renderMentorsView();
  } else if (user.role === 'MENTOR') {
    renderMentorDashboard();
  } else if (user.role === 'HR') {
    renderHrDashboard();
  }
}

async function refreshState() {
  const data = await api('/api/state');
  syncSelectionsFromData(data);
  renderAll();
}

function openMaterialModal(materialId) {
  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  const node = getActiveNode(tree);
  const material = node?.materials.find((m) => m.id === materialId);
  if (!material) return;

  $('modalMaterialType').textContent = LABELS.materialType[material.type] || material.type;
  $('modalMaterialTitle').textContent = material.title;
  $('modalMaterialDesc').textContent = material.description || '';

  const bodyText =
    material.content && material.content.trim()
      ? material.content
      : `Матеріал «${material.title}» прикріплений до навички «${node.title}».\n\n${material.description || 'Скористайтеся кнопкою нижче або поставте запитання ШІ-асистенту.'}`;
  $('modalMaterialBody').innerHTML = formatRichText(bodyText);

  const extBtn = $('modalMaterialExternalLink');
  if (material.url && /^https?:\/\//i.test(material.url)) {
    extBtn.href = material.url;
    extBtn.classList.remove('hidden');
  } else {
    extBtn.classList.add('hidden');
  }

  $('materialModal').classList.remove('hidden');
}

function openCheckoutModal(sessionId) {
  const session = state.data.sessions.find((s) => s.id === sessionId);
  const mentor = state.data.mentors.find((m) => m.id === session?.mentorId);
  if (!session) return;
  state.checkoutSessionId = sessionId;

  $('checkoutSummary').innerHTML = `
    <div><strong>Послуга:</strong> ${esc(session.topic)}</div>
    <div><strong>Ментор:</strong> ${esc(mentor?.fullName || session.mentorId)}</div>
    <div><strong>Тривалість:</strong> ${session.durationMin} хвилин</div>
    <div><strong>Сума до сплати:</strong> <span style="color:var(--primary);font-weight:700;">${session.price} UAH</span></div>
  `;
  $('paymentModal').classList.remove('hidden');
}

function openReceiptModal(sessionId) {
  const receipt = state.data.receipts.find((r) => r.sessionId === sessionId);
  const session = state.data.sessions.find((s) => s.id === sessionId);
  if (!receipt || !session) return;

  $('receiptDetails').innerHTML = `
    <div><strong>Номер транзакції:</strong> <code>${esc(receipt.transactionId)}</code></div>
    <div><strong>Призначення:</strong> ${esc(session.topic)}</div>
    <div><strong>Сума:</strong> ${receipt.amount} ${esc(receipt.currency)}</div>
    <div><strong>Статус платежу:</strong> ${LABELS.paymentStatus[receipt.status] || receipt.status}</div>
    <div><strong>Дата оплати:</strong> ${esc(new Date(receipt.processedAt).toLocaleString('uk-UA'))}</div>
  `;
  $('receiptModal').classList.remove('hidden');
}

function openProfileModal() {
  const user = getCurrentUser();
  if (!user) return;
  $('profFullName').value = user.fullName;

  const extraContainer = $('profRoleFields');
  if (user.role === 'LEARNER') {
    extraContainer.innerHTML = `
      <label class="field-stack">
        <span>Цільова професія</span>
        <input id="profTargetProfession" type="text" value="${esc(user.targetProfession)}" required />
      </label>
      <label class="field-stack">
        <span>Рівень</span>
        <select id="profLevel">
          <option value="BEGINNER" ${user.level === 'BEGINNER' ? 'selected' : ''}>Початковий</option>
          <option value="INTERMEDIATE" ${user.level === 'INTERMEDIATE' ? 'selected' : ''}>Середній</option>
          <option value="ADVANCED" ${user.level === 'ADVANCED' ? 'selected' : ''}>Просунутий</option>
        </select>
      </label>
    `;
  } else if (user.role === 'MENTOR') {
    extraContainer.innerHTML = `
      <label class="field-stack">
        <span>Спеціалізація</span>
        <input id="profSpecialization" type="text" value="${esc(user.specialization)}" required />
      </label>
      <label class="field-stack">
        <span>Годинна ставка (₴)</span>
        <input id="profHourlyRate" type="number" min="100" value="${user.hourlyRate}" required />
      </label>
      <label class="field-stack">
        <span>Про себе (біо)</span>
        <textarea id="profBio" rows="3">${esc(user.bio)}</textarea>
      </label>
    `;
  } else {
    extraContainer.innerHTML = `
      <label class="field-stack">
        <span>Назва компанії</span>
        <input id="profCompany" type="text" value="${esc(user.company)}" required />
      </label>
    `;
  }
  $('profileModal').classList.remove('hidden');
}

async function updateActiveNodeStatus(action) {
  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  const node = getActiveNode(tree);
  if (!tree || !node) return;
  try {
    const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    syncSelectionsFromData(res.state);
    renderAll();
    showToast(
      action === 'complete'
        ? `Навичку завершено! Прогрес: ${res.treeProgress}%, досвід: ${res.learnerPoints} XP`
        : 'Навичку переведено у статус «У процесі»'
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('skilltree_theme', theme);
  const label = theme === 'light' ? '🌙 Темна тема' : '☀️ Світла тема';
  $('themeToggleBtn').textContent = label;
  $('authThemeToggleBtn').textContent = label;
}

function setupEventListeners() {
  const savedTheme = localStorage.getItem('skilltree_theme') || 'dark';
  applyTheme(savedTheme);
  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  };
  $('themeToggleBtn').addEventListener('click', toggleTheme);
  $('authThemeToggleBtn').addEventListener('click', toggleTheme);

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $('goToCreateBtn').addEventListener('click', () => switchView('learner-create'));

  // Close modals
  document.querySelectorAll('.close-modal-btn').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.close)?.classList.add('hidden'));
  });

  // Auth Tabs & Forms
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.auth-pane').forEach((p) => p.classList.toggle('active', p.dataset.authPane === tab.dataset.authTab));
    });
  });

  $('regRole').addEventListener('change', (e) => {
    const role = e.target.value;
    if (role === 'MENTOR') {
      $('regExtraLabel').textContent = 'Спеціалізація ментора';
      $('regExtra').placeholder = 'Full-Stack & Architecture';
    } else if (role === 'HR') {
      $('regExtraLabel').textContent = 'Назва компанії';
      $('regExtra').placeholder = 'TechNova Ukraine';
    } else {
      $('regExtraLabel').textContent = 'Цільова професія';
      $('regExtra').placeholder = 'Full-Stack Developer';
    }
  });

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }),
      });
      $('loginPassword').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Вітаємо, ${res.user.fullName}!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const role = $('regRole').value;
      const extra = $('regExtra').value.trim();
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: $('regName').value,
          email: $('regEmail').value,
          password: $('regPassword').value,
          role,
          targetProfession: role === 'LEARNER' ? extra || 'Full-Stack Developer' : undefined,
          specialization: role === 'MENTOR' ? extra || 'Software Engineering' : undefined,
          company: role === 'HR' ? extra || 'TechNova Ukraine' : undefined,
        }),
      });
      $('regPassword').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Обліковий запис ${res.user.fullName} створено!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: $('resetEmail').value, newPassword: $('resetNewPassword').value }),
      });
      $('resetNewPassword').value = '';
      showToast(res.message || 'Пароль оновлено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Real Logout (UC1)
  $('logoutBtn').addEventListener('click', async () => {
    try {
      const res = await api('/api/auth/logout', { method: 'POST' });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Ви вийшли з облікового запису.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Profile Edit Modal
  $('openProfileBtn').addEventListener('click', openProfileModal);
  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    try {
      const payload = { fullName: $('profFullName').value };
      if (user.role === 'LEARNER') {
        payload.targetProfession = $('profTargetProfession').value;
        payload.level = $('profLevel').value;
      } else if (user.role === 'MENTOR') {
        payload.specialization = $('profSpecialization').value;
        payload.hourlyRate = Number($('profHourlyRate').value);
        payload.bio = $('profBio').value;
      } else {
        payload.company = $('profCompany').value;
      }
      const res = await api('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      $('profileModal').classList.add('hidden');
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Профіль оновлено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // AI Settings Modal
  $('openAiSettingsBtn').addEventListener('click', () => {
    $('customApiKeyInput').value = localStorage.getItem('skilltree_api_key') || '';
    $('aiSettingsModal').classList.remove('hidden');
  });
  $('aiSettingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('skilltree_api_key', $('customApiKeyInput').value.trim());
    $('aiSettingsModal').classList.add('hidden');
    showToast('Ключ LLM API збережено у браузері.');
  });
  $('clearApiKeyBtn').addEventListener('click', () => {
    localStorage.removeItem('skilltree_api_key');
    $('customApiKeyInput').value = '';
    $('aiSettingsModal').classList.add('hidden');
    showToast('Ключ очищено, використовується вбудований ШІ-двигун.');
  });

  // Tree selection
  $('treeSelect').addEventListener('change', (e) => {
    state.selectedTreeId = Number(e.target.value);
    state.selectedNodeId = null;
    syncSelectionsFromData(state.data);
    renderAll();
  });

  // Preset cards & generate tree
  $('professionCardsGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    $('genProfession').value = card.dataset.presetProf;
    renderCreateWizard();
  });

  $('generateTreeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const learner = getActiveLearner();
      const res = await api('/api/trees/generate', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: learner.id,
          profession: $('genProfession').value,
          level: $('genLevel').value,
        }),
      });
      state.selectedTreeId = res.tree.id;
      state.selectedNodeId = res.tree.nodes[0]?.id ?? null;
      syncSelectionsFromData(res.state);
      renderAll();
      switchView('learner-tree');
      showToast(`Карту «${res.tree.targetProfession}» згенеровано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Node timeline clicks & Add Node modal
  $('nodesList').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-node-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const learner = getActiveLearner();
      const tree = getActiveTree(learner);
      try {
        const res = await api(`/api/trees/${tree.id}/nodes/${Number(deleteBtn.dataset.deleteNode)}`, {
          method: 'DELETE',
        });
        syncSelectionsFromData(res.state);
        renderAll();
        showToast('Навичку видалено з карти.');
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const card = e.target.closest('.timeline-item');
    if (card) {
      state.selectedNodeId = Number(card.dataset.nodeId);
      renderAll();
    }
  });

  $('openAddNodeBtn').addEventListener('click', () => $('addNodeModal').classList.remove('hidden'));
  $('addNodeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    try {
      const res = await api(`/api/trees/${tree.id}/nodes`, {
        method: 'POST',
        body: JSON.stringify({
          title: $('newNodeTitle').value,
          description: $('newNodeDesc').value,
          materialTitle: $('newNodeMaterialTitle').value,
          materialUrl: $('newNodeMaterialUrl').value,
        }),
      });
      $('newNodeTitle').value = '';
      $('newNodeDesc').value = '';
      $('newNodeMaterialTitle').value = '';
      $('newNodeMaterialUrl').value = '';
      $('addNodeModal').classList.add('hidden');
      state.selectedNodeId = res.node.id;
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Додано навичку «${res.node.title}»`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Study Card handlers
  $('nodeActionButtons').addEventListener('click', (e) => {
    if (e.target.closest('#startNodeBtn')) updateActiveNodeStatus('start');
    if (e.target.closest('#completeNodeBtn')) updateActiveNodeStatus('complete');
  });

  $('nodeMaterialsList').addEventListener('click', (e) => {
    const lessonBtn = e.target.closest('.open-lesson-btn');
    if (lessonBtn) {
      openMaterialModal(Number(lessonBtn.dataset.materialId));
    }
  });

  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('aiQuestionInput').value = btn.dataset.prompt;
      $('aiQuestionInput').focus();
    });
  });

  $('askAiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if (!node) return;
    try {
      const customKey = localStorage.getItem('skilltree_api_key') || '';
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          question: $('aiQuestionInput').value,
          apiKey: customKey || undefined,
        }),
      });
      $('aiQuestionInput').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`ШІ відповів за ${res.message.responseTimeMs} мс`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('chatMessages').addEventListener('click', async (e) => {
    const rateBtn = e.target.closest('.rate-btn');
    if (!rateBtn) return;
    try {
      const res = await api(`/api/chat/${Number(rateBtn.dataset.rateMsg)}/rate`, {
        method: 'PATCH',
        body: JSON.stringify({ helpful: rateBtn.dataset.helpful === 'true' }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Mentors & Sessions
  const tomorrow = new Date(Date.now() + 86400000);
  $('bookingStartAt').value = tomorrow.toISOString().slice(0, 16);

  $('mentorsDirectoryGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.select-mentor-book-btn');
    if (!btn) return;
    $('bookingMentorSelect').value = btn.dataset.mentorId;
    $('bookingTopic').focus();
    showToast('Ментора обрано у формі бронювання нижче.');
  });

  $('bookSessionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    try {
      const res = await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: learner.id,
          mentorId: Number($('bookingMentorSelect').value),
          topic: $('bookingTopic').value,
          startAt: $('bookingStartAt').value,
          durationMin: Number($('bookingDuration').value),
        }),
      });
      $('bookingTopic').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Сесію заброньовано! Тепер натисніть «Оплатити сесію».');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('learnerSessionsList').addEventListener('click', async (e) => {
    const payBtn = e.target.closest('.open-checkout-btn');
    if (payBtn) {
      openCheckoutModal(Number(payBtn.dataset.sessionId));
      return;
    }

    const receiptBtn = e.target.closest('.view-receipt-btn');
    if (receiptBtn) {
      openReceiptModal(Number(receiptBtn.dataset.sessionId));
      return;
    }

    const cancelBtn = e.target.closest('.cancel-session-btn');
    if (cancelBtn) {
      try {
        const res = await api(`/api/sessions/${cancelBtn.dataset.sessionId}/cancel`, { method: 'POST' });
        syncSelectionsFromData(res.state);
        renderAll();
        showToast('Сесію скасовано.');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  $('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.checkoutSessionId) return;
    try {
      const res = await api(`/api/sessions/${state.checkoutSessionId}/pay`, { method: 'POST' });
      $('paymentModal').classList.add('hidden');
      syncSelectionsFromData(res.state);
      renderAll();
      openReceiptModal(res.session.id);
      showToast('Оплату успішно проведено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('learnerSessionsList').addEventListener('submit', async (e) => {
    const form = e.target.closest('.feedback-form');
    if (!form) return;
    e.preventDefault();
    try {
      const res = await api(`/api/sessions/${form.dataset.sessionId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating: Number(form.querySelector('[name="rating"]').value),
          feedback: form.querySelector('[name="feedback"]').value,
        }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Відгук збережено! Новий рейтинг ментора: ★ ${res.mentorRating}`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Mentor Dashboard (own mentor only)
  $('publishMaterialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mentor = getActiveMentor();
    const nodeId = Number($('mentorNodeSelect').value);
    try {
      const res = await api(`/api/nodes/${nodeId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          mentorId: mentor.id,
          title: $('materialTitle').value,
          type: $('materialType').value,
          url: $('materialUrl').value,
          description: $('materialDesc').value,
          content: $('materialContent').value,
        }),
      });
      $('materialTitle').value = '';
      $('materialUrl').value = '';
      $('materialDesc').value = '';
      $('materialContent').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Урок «${res.material.title}» опубліковано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('mentorSessionsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.confirm-session-btn');
    if (!btn) return;
    try {
      const res = await api(`/api/sessions/${btn.dataset.sessionId}/confirm`, { method: 'POST' });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Менторську сесію підтверджено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // HR Dashboard
  $('teamSelect').addEventListener('change', (e) => {
    state.selectedTeamId = Number(e.target.value);
    renderHrDashboard();
  });

  $('createTeamForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: $('newTeamName').value }),
      });
      $('newTeamName').value = '';
      state.selectedTeamId = res.team.id;
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Команду «${res.team.name}» створено.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('addTeamMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api(`/api/teams/${state.selectedTeamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ learnerId: Number($('addMemberLearnerSelect').value) }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Співробітника додано до команди.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('assignTreeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/hr/assign-tree', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: Number($('hrLearnerSelect').value),
          profession: $('hrAssignProfession').value,
          level: $('hrAssignLevel').value,
        }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Карту «${res.tree.targetProfession}» призначено співробітнику!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('exportCsvBtn').addEventListener('click', () => {
    window.location.href = `/api/teams/${state.selectedTeamId}/export?format=CSV`;
  });

  $('previewCsvBtn').addEventListener('click', async () => {
    try {
      const csv = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      $('csvPreviewContent').textContent = csv;
      $('csvPreviewCard').classList.remove('hidden');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('closeCsvPreviewBtn').addEventListener('click', () => {
    $('csvPreviewCard').classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  try {
    await refreshState();
  } catch (err) {
    showToast(err.message, true);
  }
});
