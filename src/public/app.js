const state = {
  data: null,
  selectedLearnerId: null,
  selectedTreeId: null,
  selectedNodeId: null,
  selectedMentorId: null,
  selectedTeamId: null,
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

function showToast(message, isError = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
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

function getActiveLearner() {
  if (!state.data?.learners?.length) return null;
  return (
    state.data.learners.find((l) => l.id === state.selectedLearnerId) ||
    state.data.learners[0]
  );
}

function getActiveTree(learner) {
  if (!learner?.skillTrees?.length) return null;
  return (
    learner.skillTrees.find((t) => t.id === state.selectedTreeId) ||
    learner.skillTrees[0]
  );
}

function getActiveNode(tree) {
  if (!tree?.nodes?.length) return null;
  return (
    tree.nodes.find((n) => n.id === state.selectedNodeId) ||
    tree.nodes[0]
  );
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
}

function syncSelectionsFromData(data) {
  state.data = data;
  const current = data.currentUser;
  if (current) {
    if (current.role === 'LEARNER') state.selectedLearnerId = current.id;
    if (current.role === 'MENTOR') state.selectedMentorId = current.id;
  }
  if (!state.selectedLearnerId && data.learners[0]) {
    state.selectedLearnerId = data.learners[0].id;
  }
  if (!state.selectedMentorId && data.mentors[0]) {
    state.selectedMentorId = data.mentors[0].id;
  }
  if (!state.selectedTeamId && data.teams[0]) {
    state.selectedTeamId = data.teams[0].id;
  }

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
}

function renderHeaderAndKpi() {
  const { users, currentUser, kpi, professions } = state.data;

  // User switcher
  const userSelect = $('userSelect');
  userSelect.innerHTML = users
    .map(
      (u) =>
        `<option value="${u.id}" ${u.id === currentUser?.id ? 'selected' : ''}>${esc(u.fullName)} (${esc(u.role)})</option>`
    )
    .join('');

  // Profession datalist
  $('professionList').innerHTML = professions
    .map((p) => `<option value="${esc(p)}"></option>`)
    .join('');

  // KPI strip
  const roleLabel =
    currentUser?.role === 'LEARNER'
      ? 'Студент'
      : currentUser?.role === 'MENTOR'
        ? 'Ментор'
        : 'HR / TeamLead';
  $('kpiRole').textContent = `${roleLabel}`;
  $('kpiUserSub').textContent = currentUser ? `${currentUser.fullName}` : '—';

  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  $('kpiTreeProgress').textContent = tree ? `${tree.progress}%` : '0%';
  $('kpiBadges').textContent = learner
    ? `${learner.points} балів • ${learner.badges.length} бейдж(ів)`
    : '—';

  $('kpiAiSla').textContent = `${kpi.avgAiResponseMs} мс`;
  $('kpiAiStatus').textContent = kpi.aiSlaCompliant ? 'SLA ≤ 5000 мс виконано' : 'Перевищення SLA';
  $('kpiAiHelpful').textContent = `${kpi.aiHelpfulnessPct}%`;
  $('kpiAiCount').textContent = `Оцінено відповідей: ${kpi.aiRatedCount} із ${kpi.aiMessagesCount}`;
}

function renderLearnerTab() {
  const { learners, mentors, sessions } = state.data;
  const learnerSelect = $('learnerSelect');
  learnerSelect.innerHTML = learners
    .map(
      (l) =>
        `<option value="${l.id}" ${l.id === state.selectedLearnerId ? 'selected' : ''}>${esc(l.fullName)} (${l.points} б.)</option>`
    )
    .join('');

  const learner = getActiveLearner();
  if (!learner) return;

  const treeSelect = $('treeSelect');
  treeSelect.innerHTML = learner.skillTrees
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === state.selectedTreeId ? 'selected' : ''}>${esc(t.title)} — ${t.progress}%</option>`
    )
    .join('');

  const tree = getActiveTree(learner);
  $('learnerPoints').textContent = learner.points;
  $('badgesRow').innerHTML =
    learner.badges.length > 0
      ? learner.badges.map((b) => `<span class="badge-chip">🏆 ${esc(b)}</span>`).join('')
      : '<span class="muted">Завершіть перший вузол, щоб отримати бейдж!</span>';

  if (tree) {
    $('treeTitle').textContent = tree.title;
    $('treeMeta').textContent = `Професія: ${tree.targetProfession} • Рівень: ${tree.level} • Вузлів: ${tree.nodes.length}`;
    $('treeProgressFill').style.width = `${tree.progress}%`;
    $('treeProgressText').textContent = `${tree.progress}%`;

    const activeNode = getActiveNode(tree);
    $('nodesList').innerHTML = tree.nodes
      .map(
        (node) => `
      <div class="node-card ${activeNode?.id === node.id ? 'selected' : ''}" data-node-id="${node.id}">
        <div class="node-card-left">
          <span class="node-order ${node.status}">${node.orderNumber}</span>
          <div>
            <strong>${esc(node.title)}</strong>
            <div class="muted">${node.materials.length} матеріал(ів) • ${node.messages.length} повідомлень ШІ</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.45rem;">
          <span class="status-badge ${node.status}">${node.status}</span>
          <button type="button" class="btn btn-danger btn-sm delete-node-btn" data-delete-node="${node.id}" title="Видалити вузол (UC10)">✕</button>
        </div>
      </div>
    `
      )
      .join('');

    renderNodeInspector(tree, activeNode);
  }

  // Booking mentors dropdown
  $('bookingMentorSelect').innerHTML = mentors
    .map(
      (m) =>
        `<option value="${m.id}">${esc(m.fullName)} — ${esc(m.specialization)} (${m.hourlyRate} ₴/год, ★ ${m.rating})</option>`
    )
    .join('');

  // Learner sessions
  const learnerSessions = sessions.filter((s) => s.learnerId === learner.id);
  const sessionsEl = $('learnerSessionsList');
  if (learnerSessions.length === 0) {
    sessionsEl.innerHTML = '<div class="muted">У студента ще немає заброньованих сесій.</div>';
  } else {
    sessionsEl.innerHTML = learnerSessions
      .map((s) => {
        const mentor = mentors.find((m) => m.id === s.mentorId);
        const dateStr = new Date(s.startAt).toLocaleString('uk-UA');
        const canPay = s.paymentStatus === 'PENDING' && s.status !== 'CANCELLED';
        const canFeedback = s.paymentStatus === 'PAID' && s.status !== 'CANCELLED' && s.rating === null;
        const canCancel = s.status !== 'CANCELLED' && s.status !== 'DONE';

        return `
        <div class="session-card">
          <div class="session-top">
            <div>
              <strong>${esc(s.topic)}</strong>
              <div class="muted">Ментор: ${esc(mentor?.fullName ?? s.mentorId)} • ${esc(dateStr)} • ${s.durationMin} хв • ${s.price} ₴</div>
            </div>
            <div style="display:flex;gap:0.35rem;">
              <span class="status-badge ${s.status}">${s.status}</span>
              <span class="status-badge ${s.paymentStatus}">${s.paymentStatus}</span>
            </div>
          </div>
          ${
            s.rating !== null
              ? `<div class="muted">Ваш відгук: ★ ${s.rating}/5 — «${esc(s.feedback)}»</div>`
              : ''
          }
          <div class="session-actions">
            ${canPay ? `<button class="btn btn-primary btn-sm pay-session-btn" data-session-id="${s.id}">💳 Оплатити (UC9)</button>` : ''}
            ${canCancel ? `<button class="btn btn-danger btn-sm cancel-session-btn" data-session-id="${s.id}">Скасувати</button>` : ''}
            ${
              canFeedback
                ? `
              <form class="inline-form feedback-form" data-session-id="${s.id}">
                <select name="rating">
                  <option value="5">★ 5</option>
                  <option value="4">★ 4</option>
                  <option value="3">★ 3</option>
                  <option value="2">★ 2</option>
                  <option value="1">★ 1</option>
                </select>
                <input name="feedback" type="text" placeholder="Ваш відгук після сесії" required />
                <button type="submit" class="btn btn-success btn-sm">Оцінити</button>
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
}

function renderNodeInspector(tree, node) {
  if (!node) {
    $('nodeInspectorEmpty').classList.remove('hidden');
    $('nodeInspectorContent').classList.add('hidden');
    return;
  }

  $('nodeInspectorEmpty').classList.add('hidden');
  $('nodeInspectorContent').classList.remove('hidden');

  const badge = $('activeNodeBadge');
  badge.textContent = node.status;
  badge.className = `status-badge ${node.status}`;

  $('activeNodeTitle').textContent = `${node.orderNumber}. ${node.title}`;
  $('activeNodeDesc').textContent = node.description || 'Опис відсутній.';

  const materialsEl = $('nodeMaterialsList');
  if (node.materials.length === 0) {
    materialsEl.innerHTML = '<li class="muted">Матеріалів поки немає. Ментор може додати їх у вкладці «Ментор».</li>';
  } else {
    materialsEl.innerHTML = node.materials
      .map(
        (m) => `
      <li class="material-item">
        <div>
          <span class="status-badge">${esc(m.type)}</span>
          <strong>${esc(m.title)}</strong>
          ${m.description ? `<div class="muted">${esc(m.description)}</div>` : ''}
        </div>
        <a href="${esc(m.url)}" target="_blank" rel="noopener">Відкрити ↗</a>
      </li>
    `
      )
      .join('');
  }

  const chatEl = $('chatMessages');
  if (node.messages.length === 0) {
    chatEl.innerHTML =
      '<div class="muted">Історія чату порожня. Поставте запитання ШІ-асистенту нижче (відповідь до 5 с).</div>';
  } else {
    chatEl.innerHTML = node.messages
      .map(
        (msg) => `
      <div class="chat-msg">
        <div class="chat-q">Ви: ${esc(msg.question)}</div>
        <div class="chat-a">${esc(msg.answer)}</div>
        <div class="chat-meta">
          <span>⏱ Час відповіді: ${msg.responseTimeMs} мс</span>
          <div class="rate-btns">
            <button type="button" class="rate-btn ${msg.isHelpful === true ? 'active-good' : ''}" data-rate-msg="${msg.id}" data-helpful="true">👍 Корисно</button>
            <button type="button" class="rate-btn ${msg.isHelpful === false ? 'active-bad' : ''}" data-rate-msg="${msg.id}" data-helpful="false">👎 Некорисно</button>
          </div>
        </div>
      </div>
    `
      )
      .join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

function renderMentorTab() {
  const { mentors, learners, sessions } = state.data;
  const mentorSelect = $('mentorSelect');
  mentorSelect.innerHTML = mentors
    .map(
      (m) =>
        `<option value="${m.id}" ${m.id === state.selectedMentorId ? 'selected' : ''}>${esc(m.fullName)} (★ ${m.rating})</option>`
    )
    .join('');

  const mentor = mentors.find((m) => m.id === state.selectedMentorId) || mentors[0];
  if (!mentor) return;

  $('mentorProfileSummary').innerHTML = `
    <span><strong>Спеціалізація:</strong> ${esc(mentor.specialization)}</span>
    <span><strong>Ставка:</strong> ${mentor.hourlyRate} ₴/год</span>
    <span><strong>Рейтинг:</strong> ★ ${mentor.rating}</span>
  `;

  // Populate all nodes across learners so Mentor can publish material to any node
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

  // Mentor incoming sessions
  const mentorSessions = sessions.filter((s) => s.mentorId === mentor.id);
  const el = $('mentorSessionsList');
  if (mentorSessions.length === 0) {
    el.innerHTML = '<div class="muted">Немає запланованих сесій.</div>';
  } else {
    el.innerHTML = mentorSessions
      .map((s) => {
        const learner = learners.find((l) => l.id === s.learnerId);
        const dateStr = new Date(s.startAt).toLocaleString('uk-UA');
        const canConfirm = s.status === 'BOOKED';

        return `
        <div class="session-card">
          <div class="session-top">
            <div>
              <strong>${esc(s.topic)}</strong>
              <div class="muted">Студент: ${esc(learner?.fullName ?? s.learnerId)} • ${esc(dateStr)} • ${s.price} ₴</div>
            </div>
            <div style="display:flex;gap:0.35rem;">
              <span class="status-badge ${s.status}">${s.status}</span>
              <span class="status-badge ${s.paymentStatus}">${s.paymentStatus}</span>
            </div>
          </div>
          ${s.feedback ? `<div class="muted">Відгук студента (★ ${s.rating}/5): «${esc(s.feedback)}»</div>` : ''}
          <div class="session-actions">
            ${
              canConfirm
                ? `<button class="btn btn-primary btn-sm confirm-session-btn" data-session-id="${s.id}">✓ Підтвердити сесію (UC6)</button>`
                : ''
            }
          </div>
        </div>
      `;
      })
      .join('');
  }
}

function renderHrTab() {
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
        <div class="matrix-row">
          <div class="matrix-row-head">
            <strong>${esc(prof)}</strong>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `
          )
          .join('');

  const nodeEntries = Object.entries(matrix.skillNodeAverages || {}).slice(0, 8);
  $('nodeMatrixBars').innerHTML = nodeEntries
    .map(
      ([skill, pct]) => `
    <div class="matrix-row">
      <div class="matrix-row-head">
        <span>${esc(skill)}</span>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
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
      <td><span class="status-badge">${esc(m.level)}</span></td>
      <td>${m.treesCount}</td>
      <td>${m.doneNodes}/${m.totalNodes}</td>
      <td><strong>${m.progressPct}%</strong></td>
      <td>${m.points}</td>
    </tr>
  `
    )
    .join('');
}

function renderAll() {
  if (!state.data) return;
  renderHeaderAndKpi();
  renderLearnerTab();
  renderMentorTab();
  renderHrTab();
}

async function refreshState() {
  const data = await api('/api/state');
  syncSelectionsFromData(data);
  renderAll();
}

function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Switch active user
  $('userSelect').addEventListener('change', async (e) => {
    try {
      const res = await api('/api/auth/switch-user', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(e.target.value) }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      const role = res.user.role;
      switchTab(role === 'MENTOR' ? 'mentor' : role === 'HR' ? 'hr' : 'learner');
      showToast(`Активовано профіль: ${res.user.fullName}`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Reset demo
  $('resetDemoBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/reset', { method: 'POST' });
      state.selectedTreeId = null;
      state.selectedNodeId = null;
      syncSelectionsFromData(data);
      renderAll();
      showToast('Демонстраційні дані відновлено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Auth modal
  $('openAuthBtn').addEventListener('click', () => $('authModal').classList.remove('hidden'));
  $('closeAuthBtn').addEventListener('click', () => $('authModal').classList.add('hidden'));

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('loginEmail').value,
          password: $('loginPassword').value,
        }),
      });
      $('authModal').classList.add('hidden');
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
      const payload = {
        fullName: $('regName').value,
        email: $('regEmail').value,
        password: $('regPassword').value,
        role,
        targetProfession: role === 'LEARNER' ? extra || 'Full-Stack Developer' : undefined,
        specialization: role === 'MENTOR' ? extra || 'Software Engineering' : undefined,
        company: role === 'HR' ? extra || 'TechNova Ukraine' : undefined,
      };
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      $('authModal').classList.add('hidden');
      syncSelectionsFromData(res.state);
      renderAll();
      switchTab(role === 'MENTOR' ? 'mentor' : role === 'HR' ? 'hr' : 'learner');
      showToast(`Користувача ${res.user.fullName} зареєстровано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Learner & Tree selectors
  $('learnerSelect').addEventListener('change', (e) => {
    state.selectedLearnerId = Number(e.target.value);
    state.selectedTreeId = null;
    state.selectedNodeId = null;
    syncSelectionsFromData(state.data);
    renderAll();
  });

  $('treeSelect').addEventListener('change', (e) => {
    state.selectedTreeId = Number(e.target.value);
    state.selectedNodeId = null;
    syncSelectionsFromData(state.data);
    renderAll();
  });

  // Generate SkillTree (UC2)
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
      showToast(`Карту «${res.tree.title}» згенеровано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Node selection & deletion (UC10)
  $('nodesList').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-node-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const nodeId = Number(deleteBtn.dataset.deleteNode);
      const learner = getActiveLearner();
      const tree = getActiveTree(learner);
      try {
        const res = await api(`/api/trees/${tree.id}/nodes/${nodeId}`, {
          method: 'DELETE',
        });
        syncSelectionsFromData(res.state);
        renderAll();
        showToast('Вузол видалено з карти.');
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const card = e.target.closest('.node-card');
    if (card) {
      state.selectedNodeId = Number(card.dataset.nodeId);
      renderAll();
    }
  });

  // Add node (UC10)
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
        }),
      });
      $('newNodeTitle').value = '';
      $('newNodeDesc').value = '';
      $('newNodeMaterialTitle').value = '';
      state.selectedNodeId = res.node.id;
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Додано вузол «${res.node.title}»`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Node status update (UC3)
  $('startNodeBtn').addEventListener('click', () => updateActiveNodeStatus('start'));
  $('completeNodeBtn').addEventListener('click', () => updateActiveNodeStatus('complete'));

  // Quick AI prompt chips
  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('aiQuestionInput').value = btn.dataset.prompt;
      $('aiQuestionInput').focus();
    });
  });

  // Ask AI Assistant (UC4)
  $('askAiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if (!node) return;
    try {
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ question: $('aiQuestionInput').value }),
      });
      $('aiQuestionInput').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`ШІ відповів за ${res.message.responseTimeMs} мс (SLA ≤ 5000 мс)`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Rate AI message (UC11)
  $('chatMessages').addEventListener('click', async (e) => {
    const rateBtn = e.target.closest('.rate-btn');
    if (!rateBtn) return;
    const messageId = Number(rateBtn.dataset.rateMsg);
    const helpful = rateBtn.dataset.helpful === 'true';
    try {
      const res = await api(`/api/chat/${messageId}/rate`, {
        method: 'PATCH',
        body: JSON.stringify({ helpful }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(helpful ? 'Оцінка «Корисно» збережена!' : 'Оцінка «Некорисно» зафіксована.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Book mentor session (UC6)
  const tomorrow = new Date(Date.now() + 86400000);
  $('bookingStartAt').value = tomorrow.toISOString().slice(0, 16);

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
      showToast('Сесію заброньовано! Тепер оплатіть її для підтвердження ментором.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Learner session actions (Pay UC9, Cancel, Feedback)
  $('learnerSessionsList').addEventListener('click', async (e) => {
    const payBtn = e.target.closest('.pay-session-btn');
    if (payBtn) {
      try {
        const res = await api(`/api/sessions/${payBtn.dataset.sessionId}/pay`, {
          method: 'POST',
        });
        syncSelectionsFromData(res.state);
        renderAll();
        showToast(`Оплату проведено! Чек: ${res.receipt.transactionId}`);
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const cancelBtn = e.target.closest('.cancel-session-btn');
    if (cancelBtn) {
      try {
        const res = await api(`/api/sessions/${cancelBtn.dataset.sessionId}/cancel`, {
          method: 'POST',
        });
        syncSelectionsFromData(res.state);
        renderAll();
        showToast('Сесію скасовано.');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  $('learnerSessionsList').addEventListener('submit', async (e) => {
    const form = e.target.closest('.feedback-form');
    if (!form) return;
    e.preventDefault();
    const sessionId = form.dataset.sessionId;
    const rating = Number(form.querySelector('[name="rating"]').value);
    const feedback = form.querySelector('[name="feedback"]').value;
    try {
      const res = await api(`/api/sessions/${sessionId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, feedback }),
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Дякуємо за відгук! Оновлений рейтинг ментора: ★ ${res.mentorRating}`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Mentor Tab handlers
  $('mentorSelect').addEventListener('change', (e) => {
    state.selectedMentorId = Number(e.target.value);
    renderMentorTab();
  });

  $('publishMaterialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = Number($('mentorNodeSelect').value);
    try {
      const res = await api(`/api/nodes/${nodeId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          mentorId: state.selectedMentorId,
          title: $('materialTitle').value,
          type: $('materialType').value,
          url: $('materialUrl').value,
          description: $('materialDesc').value,
        }),
      });
      $('materialTitle').value = '';
      $('materialUrl').value = '';
      $('materialDesc').value = '';
      syncSelectionsFromData(res.state);
      renderAll();
      showToast(`Матеріал «${res.material.title}» опубліковано у вузлі!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('mentorSessionsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.confirm-session-btn');
    if (!btn) return;
    try {
      const res = await api(`/api/sessions/${btn.dataset.sessionId}/confirm`, {
        method: 'POST',
      });
      syncSelectionsFromData(res.state);
      renderAll();
      showToast('Менторську сесію підтверджено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // HR Tab handlers
  $('teamSelect').addEventListener('change', (e) => {
    state.selectedTeamId = Number(e.target.value);
    renderHrTab();
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
      showToast(`Карту «${res.tree.title}» призначено працівнику!`);
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
        ? `Вузол завершено! Прогрес карти: ${res.treeProgress}%, балів: ${res.learnerPoints}`
        : `Вузол переведено у статус IN_PROGRESS`
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  try {
    await refreshState();
  } catch (err) {
    showToast(err.message, true);
  }
});
