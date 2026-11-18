'use strict';

const ROUTES = {
  '/': 'page-home',
  '/roadmap': 'page-roadmap',
  '/mentors': 'page-mentors',
  '/mentor-cabinet': 'page-mentor-cabinet',
  '/b2b': 'page-b2b',
  '/profile': 'page-profile',
};

const ROUTE_TITLES = {
  '/': 'SkillTree AI — Персоналізовані карти розвитку та ШІ-навчання',
  '/roadmap': 'Карта навичок та ШІ-тьютор — SkillTree AI',
  '/mentors': 'Ментори та 1-на-1 консультації — SkillTree AI',
  '/mentor-cabinet': 'Кабінет ментора — SkillTree AI',
  '/b2b': 'B2B Матриця навичок команди — SkillTree AI',
  '/profile': 'Мій профіль — SkillTree AI',
};

const state = {
  data: null,
  currentRoute: '/',
  selectedTreeId: null,
  selectedNodeId: null,
  selectedTeamId: null,
  paymentSessionId: null,
  authMode: 'login',
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, isError = false) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden', 'error');
  if (isError) {
    toast.classList.add('error');
  }
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3600);
}

async function api(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  };
  const response = await fetch(url, config);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errMsg =
      typeof payload === 'object' && payload !== null && payload.error
        ? payload.error
        : `Помилка HTTP ${response.status}`;
    throw new Error(errMsg);
  }
  return payload;
}

function normalizeRoute(path) {
  if (!path || path === '/') return '/';
  const cleaned = path.replace(/\/+$/, '');
  return ROUTES[cleaned] ? cleaned : '/';
}

function navigateTo(path, push = true) {
  const target = normalizeRoute(path);
  state.currentRoute = target;

  if (push && window.location.pathname !== target) {
    window.history.pushState({ route: target }, '', target);
  }

  document.querySelectorAll('.page-view').forEach((section) => {
    const isActive = section.id === ROUTES[target];
    section.classList.toggle('active', isActive);
  });

  document.querySelectorAll('.nav-link[data-route]').forEach((link) => {
    const isCurrent = normalizeRoute(link.getAttribute('data-route')) === target;
    link.classList.toggle('active', isCurrent);
  });

  document.title = ROUTE_TITLES[target] || ROUTE_TITLES['/'];
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function getInitials(fullName) {
  const parts = String(fullName || 'SK').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return String(fullName || 'SK').slice(0, 2).toUpperCase();
}

function getActiveLearner() {
  const learners = state.data?.learners || [];
  const current = state.data?.currentUser;
  if (current && current.role === 'LEARNER') {
    const matched = learners.find((l) => l.id === current.id);
    if (matched) return matched;
  }
  return learners[0] || null;
}

function getActiveTree(learner) {
  if (!learner || !Array.isArray(learner.skillTrees) || learner.skillTrees.length === 0) {
    return null;
  }
  const found = learner.skillTrees.find((t) => t.id === state.selectedTreeId);
  if (found) return found;
  state.selectedTreeId = learner.skillTrees[0].id;
  return learner.skillTrees[0];
}

function getActiveNode(tree) {
  if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) {
    state.selectedNodeId = null;
    return null;
  }
  const found = tree.nodes.find((n) => n.id === state.selectedNodeId);
  if (found) return found;
  const fallback = tree.nodes.find((n) => n.status === 'IN_PROGRESS') || tree.nodes[0];
  state.selectedNodeId = fallback.id;
  return fallback;
}

function getRoleLabel(role) {
  if (role === 'MENTOR') return 'Ментор / Експерт';
  if (role === 'HR') return 'HR / TeamLead (B2B)';
  return 'Студент / Фахівець';
}

function getStatusBadgeClass(status) {
  if (status === 'DONE' || status === 'PAID' || status === 'CONFIRMED') return 'st-badge-success';
  if (status === 'IN_PROGRESS' || status === 'BOOKED') return 'st-badge-accent';
  if (status === 'PENDING') return 'st-badge-warning';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'st-badge-danger';
  return '';
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add('hidden');
}

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  localStorage.setItem('skilltree_theme', normalized);
  const btn = $('themeToggleBtn');
  if (btn) {
    btn.textContent = normalized === 'dark' ? '☀️' : '🌙';
  }
}

function setAuthTab(mode) {
  state.authMode = mode;
  $('authTabLogin')?.classList.toggle('active', mode === 'login');
  $('authTabRegister')?.classList.toggle('active', mode === 'register');
  $('authTabReset')?.classList.toggle('active', mode === 'reset');

  $('loginForm')?.classList.toggle('hidden', mode !== 'login');
  $('registerForm')?.classList.toggle('hidden', mode !== 'register');
  $('resetPasswordForm')?.classList.toggle('hidden', mode !== 'reset');
}

function syncRegisterRoleField() {
  const role = $('regRole')?.value || 'LEARNER';
  const label = $('regExtraLabel');
  const input = $('regExtraInput');
  if (!label || !input) return;

  if (role === 'MENTOR') {
    label.textContent = 'Спеціалізація ментора';
    input.placeholder = 'Напр.: Senior Backend & Architecture';
  } else if (role === 'HR') {
    label.textContent = 'Назва компанії';
    input.placeholder = 'Напр.: TechNova Ukraine';
  } else {
    label.textContent = 'Цільова професія';
    input.placeholder = 'Напр.: Full-Stack Developer';
  }
}

async function loadState() {
  state.data = await api('/api/state');
  renderAll();
}

function renderAll() {
  if (!state.data) return;
  renderNavbarAndHero();
  renderRoadmapPage();
  renderMentorsPage();
  renderMentorCabinetPage();
  renderB2bPage();
  renderProfilePage();
}

function renderNavbarAndHero() {
  const user = state.data.currentUser;
  const openAuthBtn = $('openAuthBtn');
  const userMenu = $('userMenu');
  const navProfileLink = $('navProfileLink');

  if (user) {
    openAuthBtn?.classList.add('hidden');
    userMenu?.classList.remove('hidden');
    navProfileLink?.classList.remove('hidden');
    if ($('navAvatar')) $('navAvatar').textContent = getInitials(user.fullName);
    if ($('navUserName')) $('navUserName').textContent = user.fullName;
  } else {
    openAuthBtn?.classList.remove('hidden');
    userMenu?.classList.add('hidden');
    navProfileLink?.classList.add('hidden');
  }

  const learner = getActiveLearner();
  const tree = learner?.skillTrees?.[0] || null;
  const progress = tree ? Number(tree.progress || 0) : 0;

  if ($('heroTrackTitle') && tree) {
    $('heroTrackTitle').textContent = tree.targetProfession || tree.title;
  }
  if ($('heroRingText')) {
    $('heroRingText').textContent = `${Math.round(progress)}%`;
  }
  if ($('heroRingFill')) {
    const circumference = 163.36;
    const offset = circumference * (1 - Math.max(0, Math.min(100, progress)) / 100);
    $('heroRingFill').setAttribute('stroke-dashoffset', offset.toFixed(2));
  }

  const avgMs = state.data.kpi?.avgAiResponseMs ?? 180;
  const helpfulPct = state.data.kpi?.aiHelpfulnessPct ?? 100;
  if ($('heroAiSla')) {
    $('heroAiSla').textContent = `${avgMs} мс`;
  }
  if ($('footerKpiText')) {
    $('footerKpiText').textContent = `Середня відповідь ШІ: ${avgMs} мс • Корисність порад: ${helpfulPct}% • Студентів: ${state.data.learners.length}`;
  }
}

function renderRoadmapPage() {
  const learner = getActiveLearner();
  const treeSelect = $('treeSelect');
  const quickRow = $('quickProfessionsRow');

  if (quickRow) {
    const professions = (state.data.professions || []).slice(0, 6);
    quickRow.innerHTML = professions
      .map(
        (prof) =>
          `<button type="button" class="quick-chip" data-quick-profession="${escapeHtml(prof)}">${escapeHtml(prof)}</button>`
      )
      .join('');
  }

  if (!learner) return;

  const trees = learner.skillTrees || [];
  if (treeSelect) {
    treeSelect.innerHTML = trees
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.targetProfession)} (${escapeHtml(t.level)}) — ${Math.round(t.progress)}%</option>`
      )
      .join('');
    const activeTree = getActiveTree(learner);
    if (activeTree) treeSelect.value = String(activeTree.id);
  }

  const tree = getActiveTree(learner);
  if (!tree) {
    if ($('treeTitle')) $('treeTitle').textContent = 'Карту ще не створено';
    if ($('nodesList')) $('nodesList').innerHTML = '<p class="muted-text">Натисніть «✨ Нова ШІ-карта», щоб згенерувати маршрут.</p>';
    $('nodeInspectorEmpty')?.classList.remove('hidden');
    $('nodeInspectorContent')?.classList.add('hidden');
    return;
  }

  if ($('treeTitle')) $('treeTitle').textContent = tree.title || tree.targetProfession;
  if ($('treeMeta')) {
    $('treeMeta').textContent = `Студент: ${learner.fullName} • Рівень: ${tree.level} • Вузлів: ${tree.nodes.length}`;
  }
  if ($('learnerPointsBadge')) $('learnerPointsBadge').textContent = `${learner.points} XP`;
  if ($('treePercentBadge')) $('treePercentBadge').textContent = `${Math.round(tree.progress)}%`;
  if ($('treeProgressFill')) $('treeProgressFill').style.width = `${tree.progress}%`;

  if ($('badgesRow')) {
    $('badgesRow').innerHTML = (learner.badges || []).length
      ? learner.badges.map((b) => `<span class="st-badge st-badge-warning">🏆 ${escapeHtml(b)}</span>`).join('')
      : '<span class="muted-text">Завершіть перший вузол, щоб отримати бейджі.</span>';
  }

  const activeNode = getActiveNode(tree);

  if ($('nodesList')) {
    $('nodesList').innerHTML = tree.nodes
      .map((node) => {
        const isSelected = activeNode && activeNode.id === node.id;
        return `
          <div class="node-item ${isSelected ? 'active' : ''}" data-node-id="${node.id}" role="button" tabindex="0">
            <div class="node-item-main">
              <strong>${node.orderNumber}. ${escapeHtml(node.title)}</strong>
              <small>${node.materials.length} матеріал(ів) • ${node.messages.length} повідомлень ШІ</small>
            </div>
            <div class="node-item-right">
              <span class="st-badge ${getStatusBadgeClass(node.status)}">${escapeHtml(node.status)}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  renderNodeInspector(tree, activeNode);
}

function renderNodeInspector(tree, node) {
  if (!node) {
    $('nodeInspectorEmpty')?.classList.remove('hidden');
    $('nodeInspectorContent')?.classList.add('hidden');
    return;
  }

  $('nodeInspectorEmpty')?.classList.add('hidden');
  $('nodeInspectorContent')?.classList.remove('hidden');

  if ($('activeNodeBadge')) {
    $('activeNodeBadge').textContent = node.status;
    $('activeNodeBadge').className = `st-badge ${getStatusBadgeClass(node.status)}`;
  }
  if ($('activeNodeTitle')) $('activeNodeTitle').textContent = `${node.orderNumber}. ${node.title}`;
  if ($('activeNodeDesc')) $('activeNodeDesc').textContent = node.description || 'Опис теми відсутній.';

  if ($('nodeActionButtons')) {
    const canRemove = tree.nodes.length > 1;
    $('nodeActionButtons').innerHTML = `
      ${
        node.status === 'NOT_STARTED'
          ? `<button type="button" class="st-btn st-btn-outline st-btn-sm" data-node-status="IN_PROGRESS">▶ Розпочати</button>`
          : ''
      }
      ${
        node.status !== 'DONE'
          ? `<button type="button" class="st-btn st-btn-primary st-btn-sm" data-node-status="DONE">✓ Завершити (+50 XP)</button>`
          : `<span class="st-badge st-badge-success">✓ Виконано</span>`
      }
      <button type="button" class="st-btn st-btn-danger st-btn-sm" id="deleteNodeBtn" ${canRemove ? '' : 'disabled title="Останній вузол карти видалити не можна"'}>🗑 Видалити</button>
    `;
  }

  const materials = node.materials || [];
  if ($('materialsCount')) $('materialsCount').textContent = String(materials.length);
  if ($('nodeMaterialsList')) {
    $('nodeMaterialsList').innerHTML = materials.length
      ? materials
          .map(
            (m) => `
          <div class="material-item">
            <div class="material-item-info">
              <span class="st-badge st-badge-accent">${escapeHtml(m.type)}</span>
              <strong>${escapeHtml(m.title)}</strong>
              <small>${escapeHtml(m.description || 'Навчальний матеріал модуля')}</small>
            </div>
            <button type="button" class="st-btn st-btn-outline st-btn-sm" data-open-material="${m.id}">Читати урок</button>
          </div>
        `
          )
          .join('')
      : '<p class="muted-text">У цьому вузлі ще немає матеріалів. Ментор або ви можете додати їх.</p>';
  }

  const messages = node.messages || [];
  if ($('chatMessages')) {
    $('chatMessages').innerHTML = messages.length
      ? messages
          .map(
            (msg) => `
          <div class="chat-entry">
            <div class="chat-q">${escapeHtml(msg.question)}</div>
            <div class="chat-a">
              <div>${escapeHtml(msg.answer)}</div>
              <div class="chat-meta">
                <span>⚡ Відповідь за ${msg.responseTimeMs} мс</span>
                <div class="chat-rate-btns">
                  <button type="button" class="st-btn st-btn-ghost st-btn-sm ${msg.isHelpful === true ? 'st-badge-success' : ''}" data-rate-msg="${msg.id}" data-helpful="true">👍 ${msg.isHelpful === true ? 'Корисно' : ''}</button>
                  <button type="button" class="st-btn st-btn-ghost st-btn-sm ${msg.isHelpful === false ? 'st-badge-danger' : ''}" data-rate-msg="${msg.id}" data-helpful="false">👎</button>
                </div>
              </div>
            </div>
          </div>
        `
          )
          .join('')
      : '<p class="muted-text">Історія діалогу порожня. Поставте перше запитання ШІ-тьютору нижче.</p>';
  }

  const avgMs = state.data.kpi?.avgAiResponseMs ?? 180;
  if ($('aiSlaBadge')) {
    $('aiSlaBadge').textContent = `Сер. ${avgMs} мс (SLA ≤ 5000 мс)`;
  }
}

function openMaterialReader(materialId) {
  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  const node = getActiveNode(tree);
  const material = node?.materials?.find((m) => m.id === materialId);
  if (!material) return;

  const author = (state.data.users || []).find((u) => u.id === material.authorId);
  if ($('materialModalType')) $('materialModalType').textContent = material.type;
  if ($('materialModalTitle')) $('materialModalTitle').textContent = material.title;
  if ($('materialModalAuthor')) {
    $('materialModalAuthor').textContent = author ? `Автор: ${author.fullName}` : 'Вбудована бібліотека SkillTree AI';
  }
  if ($('materialModalDesc')) $('materialModalDesc').textContent = material.description || '';
  if ($('materialModalBody')) {
    $('materialModalBody').textContent =
      material.content ||
      `Цей ресурс (${material.type}) підготовлено для поглибленого вивчення теми «${node.title}».`;
  }

  const extBtn = $('materialModalExternal');
  if (extBtn) {
    if (material.url) {
      extBtn.href = material.url;
      extBtn.classList.remove('hidden');
    } else {
      extBtn.classList.add('hidden');
    }
  }

  openModal('materialModal');
}

function renderMentorsPage() {
  const mentors = state.data.mentors || [];
  const learners = state.data.learners || [];
  const learner = getActiveLearner();

  if ($('mentorsDirectoryGrid')) {
    $('mentorsDirectoryGrid').innerHTML = mentors
      .map(
        (m) => `
        <article class="st-card mentor-card">
          <div class="mentor-card-head">
            <div>
              <span class="st-badge st-badge-accent">Верифікований ментор</span>
              <h3>${escapeHtml(m.fullName)}</h3>
            </div>
            <span class="st-badge st-badge-warning">★ ${Number(m.rating || 5).toFixed(1)}</span>
          </div>
          <p class="muted-text"><strong>${escapeHtml(m.specialization)}</strong></p>
          <p class="mentor-card-bio">${escapeHtml(m.bio)}</p>
          <div class="mentor-card-foot">
            <strong>${m.hourlyRate} ₴ / год</strong>
            <button type="button" class="st-btn st-btn-outline st-btn-sm" data-select-mentor="${m.id}">Обрати ментора</button>
          </div>
        </article>
      `
      )
      .join('');
  }

  const mentorSelect = $('bookingMentorSelect');
  if (mentorSelect) {
    const prev = mentorSelect.value;
    mentorSelect.innerHTML = mentors
      .map((m) => `<option value="${m.id}">${escapeHtml(m.fullName)} — ${escapeHtml(m.specialization)} (${m.hourlyRate} ₴/год)</option>`)
      .join('');
    if (prev && mentors.some((m) => String(m.id) === prev)) {
      mentorSelect.value = prev;
    }
  }

  const startInput = $('bookingStartAt');
  if (startInput && !startInput.value) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(11, 0, 0, 0);
    startInput.value = tomorrow.toISOString().slice(0, 16);
  }

  const sessionsList = $('learnerSessionsList');
  if (!sessionsList || !learner) return;

  const sessions = (state.data.sessions || []).filter((s) => s.learnerId === learner.id);
  const receipts = state.data.receipts || [];

  sessionsList.innerHTML = sessions.length
    ? sessions
        .map((s) => {
          const mentor = mentors.find((m) => m.id === s.mentorId);
          const hasReceipt = receipts.some((r) => r.sessionId === s.id);
          const dateLabel = new Date(s.startAt).toLocaleString('uk-UA');
          return `
            <div class="session-card">
              <div class="session-card-head">
                <div>
                  <strong>${escapeHtml(s.topic)}</strong>
                  <div class="muted-text">Ментор: ${escapeHtml(mentor?.fullName || `#${s.mentorId}`)} • ${dateLabel} • ${s.durationMin} хв • ${s.price} ₴</div>
                </div>
                <div class="session-card-badges">
                  <span class="st-badge ${getStatusBadgeClass(s.status)}">${escapeHtml(s.status)}</span>
                  <span class="st-badge ${getStatusBadgeClass(s.paymentStatus)}">${escapeHtml(s.paymentStatus)}</span>
                </div>
              </div>
              ${
                s.rating
                  ? `<div class="muted-text">Ваша оцінка: ★ ${s.rating}/5 ${s.feedback ? `— «${escapeHtml(s.feedback)}»` : ''}</div>`
                  : ''
              }
              <div class="session-card-actions">
                ${
                  s.status !== 'CANCELLED' && s.paymentStatus === 'PENDING'
                    ? `<button type="button" class="st-btn st-btn-primary st-btn-sm" data-open-pay="${s.id}">💳 Оплатити ${s.price} ₴</button>`
                    : ''
                }
                ${
                  hasReceipt || s.paymentStatus === 'PAID'
                    ? `<button type="button" class="st-btn st-btn-outline st-btn-sm" data-view-receipt="${s.id}">🧾 Квитанція</button>`
                    : ''
                }
                ${
                  s.paymentStatus === 'PAID' && s.status !== 'DONE' && s.status !== 'CANCELLED'
                    ? `
                      <form class="inline-form-row" data-feedback-form="${s.id}">
                        <select name="rating" class="st-input" style="width:auto">
                          <option value="5">5 ★</option>
                          <option value="4">4 ★</option>
                          <option value="3">3 ★</option>
                          <option value="2">2 ★</option>
                          <option value="1">1 ★</option>
                        </select>
                        <input name="comment" type="text" class="st-input" placeholder="Короткий відгук..." required />
                        <button type="submit" class="st-btn st-btn-outline st-btn-sm">Оцінити</button>
                      </form>
                    `
                    : ''
                }
                ${
                  s.status !== 'DONE' && s.status !== 'CANCELLED'
                    ? `<button type="button" class="st-btn st-btn-danger st-btn-sm" data-cancel-session="${s.id}">Скасувати</button>`
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('')
    : `<p class="muted-text">У студента ${escapeHtml(learner.fullName)} поки що немає заброньованих сесій.</p>`;

  if (learners.length === 0) {
    sessionsList.innerHTML = '<p class="muted-text">Немає активних студентів.</p>';
  }
}

function renderMentorCabinetPage() {
  const user = state.data.currentUser;
  const notice = $('mentorGuestNotice');
  const content = $('mentorCabinetContent');

  if (!user || user.role !== 'MENTOR') {
    notice?.classList.remove('hidden');
    content?.classList.add('hidden');
    return;
  }

  notice?.classList.add('hidden');
  content?.classList.remove('hidden');

  const mentor = (state.data.mentors || []).find((m) => m.id === user.id) || user;
  const sessions = (state.data.sessions || []).filter((s) => s.mentorId === mentor.id);
  const confirmedCount = sessions.filter((s) => s.status === 'CONFIRMED' || s.status === 'DONE').length;

  if ($('mentorProfileSummary')) {
    $('mentorProfileSummary').innerHTML = `
      <div class="st-card kpi-mini-card">
        <span>Спеціалізація</span>
        <strong>${escapeHtml(mentor.specialization || 'ІТ-ментор')}</strong>
      </div>
      <div class="st-card kpi-mini-card">
        <span>Рейтинг ментора</span>
        <strong>★ ${Number(mentor.rating || 5).toFixed(2)}</strong>
      </div>
      <div class="st-card kpi-mini-card">
        <span>Вартість сесії</span>
        <strong>${mentor.hourlyRate ?? 800} ₴ / год</strong>
      </div>
      <div class="st-card kpi-mini-card">
        <span>Сесій / Матеріалів</span>
        <strong>${confirmedCount} / ${mentor.publishedMaterialsCount ?? 0}</strong>
      </div>
    `;
  }

  const nodeSelect = $('mentorNodeSelect');
  if (nodeSelect) {
    const options = [];
    for (const learner of state.data.learners || []) {
      for (const tree of learner.skillTrees || []) {
        for (const node of tree.nodes || []) {
          options.push(
            `<option value="${node.id}">${escapeHtml(learner.fullName)} — ${escapeHtml(tree.targetProfession)}: #${node.orderNumber} ${escapeHtml(node.title)}</option>`
          );
        }
      }
    }
    nodeSelect.innerHTML = options.length
      ? options.join('')
      : '<option value="">Немає доступних вузлів</option>';
  }

  const mentorSessions = $('mentorSessionsList');
  if (mentorSessions) {
    mentorSessions.innerHTML = sessions.length
      ? sessions
          .map((s) => {
            const learner = (state.data.learners || []).find((l) => l.id === s.learnerId);
            return `
              <div class="session-card">
                <div class="session-card-head">
                  <div>
                    <strong>${escapeHtml(s.topic)}</strong>
                    <div class="muted-text">Студент: ${escapeHtml(learner?.fullName || `#${s.learnerId}`)} • ${new Date(s.startAt).toLocaleString('uk-UA')} • ${s.durationMin} хв (${s.price} ₴)</div>
                  </div>
                  <div class="session-card-badges">
                    <span class="st-badge ${getStatusBadgeClass(s.status)}">${escapeHtml(s.status)}</span>
                    <span class="st-badge ${getStatusBadgeClass(s.paymentStatus)}">${escapeHtml(s.paymentStatus)}</span>
                  </div>
                </div>
                <div class="session-card-actions">
                  ${
                    s.status === 'BOOKED'
                      ? `<button type="button" class="st-btn st-btn-primary st-btn-sm" data-confirm-session="${s.id}">✓ Підтвердити сесію</button>`
                      : ''
                  }
                  ${
                    s.status !== 'DONE' && s.status !== 'CANCELLED'
                      ? `<button type="button" class="st-btn st-btn-danger st-btn-sm" data-cancel-session="${s.id}">Скасувати</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')
      : '<p class="muted-text">Наразі вхідних бронювань немає.</p>';
  }
}

function renderB2bPage() {
  const teams = state.data.teams || [];
  const learners = state.data.learners || [];
  const professions = state.data.professions || [];

  if ($('professionList')) {
    $('professionList').innerHTML = professions.map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
  }

  const learnerOpts = learners
    .map((l) => `<option value="${l.id}">${escapeHtml(l.fullName)} (${escapeHtml(l.targetProfession)})</option>`)
    .join('');
  if ($('hrLearnerSelect')) $('hrLearnerSelect').innerHTML = learnerOpts;
  if ($('addMemberLearnerSelect')) $('addMemberLearnerSelect').innerHTML = learnerOpts;

  const teamSelect = $('teamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = teams
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)} (${t.memberIds.length} учасн.)</option>`)
      .join('');
    if (!teams.some((t) => t.id === state.selectedTeamId) && teams.length > 0) {
      state.selectedTeamId = teams[0].id;
    }
    if (state.selectedTeamId) teamSelect.value = String(state.selectedTeamId);
  }

  const team = teams.find((t) => t.id === state.selectedTeamId) || teams[0];
  if (!team) return;

  const matrix = team.detailedMatrix || {
    professionAverages: team.skillMatrix || {},
    skillNodeAverages: {},
    members: [],
  };

  const renderBars = (containerId, entries) => {
    const el = $(containerId);
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<p class="muted-text">У команді ще немає призначених карт розвитку.</p>';
      return;
    }
    el.innerHTML = entries
      .map(
        ([label, pct]) => `
        <div class="matrix-row">
          <div class="matrix-row-head">
            <span>${escapeHtml(label)}</span>
            <strong>${Number(pct).toFixed(1)}%</strong>
          </div>
          <div class="matrix-track">
            <div class="matrix-fill" style="width: ${Math.min(100, Number(pct))}%"></div>
          </div>
        </div>
      `
      )
      .join('');
  };

  renderBars('skillMatrixBars', Object.entries(matrix.professionAverages || {}));
  renderBars('nodeMatrixBars', Object.entries(matrix.skillNodeAverages || {}).slice(0, 8));

  const tbody = $('hrMembersTableBody');
  if (tbody) {
    tbody.innerHTML = matrix.members.length
      ? matrix.members
          .map(
            (m) => `
          <tr>
            <td>
              <strong>${escapeHtml(m.fullName)}</strong>
              <div class="muted-text">${escapeHtml(m.email)}</div>
            </td>
            <td>${escapeHtml(m.targetProfession)}</td>
            <td><span class="st-badge">${escapeHtml(m.level)}</span></td>
            <td>${m.treesCount}</td>
            <td>${m.doneNodes}/${m.totalNodes}</td>
            <td><strong>${m.progressPct.toFixed(1)}%</strong></td>
            <td>${m.points} XP</td>
          </tr>
        `
          )
          .join('')
      : '<tr><td colspan="7" class="muted-text">У цій команді поки що немає учасників.</td></tr>';
  }
}

function renderProfilePage() {
  const user = state.data.currentUser;
  const notice = $('profileGuestNotice');
  const content = $('profilePageContent');

  if (!user) {
    notice?.classList.remove('hidden');
    content?.classList.add('hidden');
    return;
  }

  notice?.classList.add('hidden');
  content?.classList.remove('hidden');

  if ($('profilePageAvatar')) $('profilePageAvatar').textContent = getInitials(user.fullName);
  if ($('profilePageName')) $('profilePageName').textContent = user.fullName;
  if ($('profilePageRole')) $('profilePageRole').textContent = getRoleLabel(user.role);
  if ($('profilePageEmail')) $('profilePageEmail').textContent = user.email;

  const wsLink = $('profileWorkspaceLink');
  if (wsLink) {
    const targetRoute =
      user.role === 'MENTOR' ? '/mentor-cabinet' : user.role === 'HR' ? '/b2b' : '/roadmap';
    wsLink.href = targetRoute;
    wsLink.setAttribute('data-route', targetRoute);
  }

  const statsEl = $('profileStatsSummary');
  if (statsEl) {
    if (user.role === 'LEARNER') {
      const learner = (state.data.learners || []).find((l) => l.id === user.id) || user;
      const sessCount = (state.data.sessions || []).filter((s) => s.learnerId === user.id).length;
      statsEl.innerHTML = `
        <div class="profile-stat-box"><span>Карт навичок</span><strong>${(learner.skillTrees || []).length}</strong></div>
        <div class="profile-stat-box"><span>Досвід (XP)</span><strong>${learner.points ?? 0}</strong></div>
        <div class="profile-stat-box"><span>Бейджі</span><strong>${(learner.badges || []).length}</strong></div>
        <div class="profile-stat-box"><span>Сесій з ментором</span><strong>${sessCount}</strong></div>
      `;
    } else if (user.role === 'MENTOR') {
      const mentor = (state.data.mentors || []).find((m) => m.id === user.id) || user;
      const sessCount = (state.data.sessions || []).filter((s) => s.mentorId === user.id).length;
      statsEl.innerHTML = `
        <div class="profile-stat-box"><span>Рейтинг</span><strong>★ ${Number(mentor.rating || 5).toFixed(2)}</strong></div>
        <div class="profile-stat-box"><span>Ставка</span><strong>${mentor.hourlyRate ?? 800} ₴/год</strong></div>
        <div class="profile-stat-box"><span>Матеріали</span><strong>${mentor.publishedMaterialsCount ?? 0}</strong></div>
        <div class="profile-stat-box"><span>Консультацій</span><strong>${sessCount}</strong></div>
      `;
    } else {
      const teams = (state.data.teams || []).filter((t) => t.hrManagerId === user.id);
      statsEl.innerHTML = `
        <div class="profile-stat-box"><span>Компанія</span><strong>${escapeHtml(user.company || 'TechCorp')}</strong></div>
        <div class="profile-stat-box"><span>Ваші команди</span><strong>${teams.length}</strong></div>
        <div class="profile-stat-box"><span>Студентів у базі</span><strong>${(state.data.learners || []).length}</strong></div>
        <div class="profile-stat-box"><span>Сесій у системі</span><strong>${(state.data.sessions || []).length}</strong></div>
      `;
    }
  }

  if ($('profFullName')) $('profFullName').value = user.fullName || '';

  const roleFields = $('profRoleFields');
  if (!roleFields) return;

  if (user.role === 'LEARNER') {
    const learner = (state.data.learners || []).find((l) => l.id === user.id) || user;
    roleFields.innerHTML = `
      <div class="form-grid-2">
        <div class="form-group">
          <label for="profTargetProfession">Цільова професія</label>
          <input type="text" id="profTargetProfession" class="st-input" list="professionList" value="${escapeHtml(learner.targetProfession || '')}" />
        </div>
        <div class="form-group">
          <label for="profLevel">Поточний рівень</label>
          <select id="profLevel" class="st-input">
            <option value="BEGINNER" ${learner.level === 'BEGINNER' ? 'selected' : ''}>BEGINNER</option>
            <option value="INTERMEDIATE" ${learner.level === 'INTERMEDIATE' ? 'selected' : ''}>INTERMEDIATE</option>
            <option value="ADVANCED" ${learner.level === 'ADVANCED' ? 'selected' : ''}>ADVANCED</option>
          </select>
        </div>
      </div>
    `;
  } else if (user.role === 'MENTOR') {
    const mentor = (state.data.mentors || []).find((m) => m.id === user.id) || user;
    roleFields.innerHTML = `
      <div class="form-grid-2">
        <div class="form-group">
          <label for="profSpecialization">Спеціалізація</label>
          <input type="text" id="profSpecialization" class="st-input" value="${escapeHtml(mentor.specialization || '')}" />
        </div>
        <div class="form-group">
          <label for="profHourlyRate">Ставка (₴ / год)</label>
          <input type="number" id="profHourlyRate" class="st-input" min="100" step="50" value="${Number(mentor.hourlyRate || 800)}" />
        </div>
      </div>
      <div class="form-group">
        <label for="profBio">Про себе (біографія ментора)</label>
        <textarea id="profBio" class="st-input" rows="3">${escapeHtml(mentor.bio || '')}</textarea>
      </div>
    `;
  } else {
    roleFields.innerHTML = `
      <div class="form-group">
        <label for="profCompany">Компанія</label>
        <input type="text" id="profCompany" class="st-input" value="${escapeHtml(user.company || '')}" />
      </div>
    `;
  }
}

function bindEvents() {
  // SPA Client-Side Routing across any [data-route] link/card
  document.addEventListener('click', (event) => {
    const routeEl = event.target.closest('[data-route]');
    if (!routeEl) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const targetRoute = routeEl.getAttribute('data-route');
    if (targetRoute) {
      event.preventDefault();
      navigateTo(targetRoute);
    }
  });

  window.addEventListener('popstate', () => {
    navigateTo(window.location.pathname, false);
  });

  // Theme Toggle
  $('themeToggleBtn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // AI Settings Modal
  $('openAiSettingsBtn')?.addEventListener('click', () => {
    if ($('aiApiKeyInput')) $('aiApiKeyInput').value = localStorage.getItem('skilltree_gemini_key') || '';
    if ($('aiModelSelect')) $('aiModelSelect').value = localStorage.getItem('skilltree_ai_model') || 'builtin';
    openModal('aiSettingsModal');
  });

  $('aiSettingsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('aiApiKeyInput')?.value.trim() || '';
    const model = $('aiModelSelect')?.value || 'builtin';
    if (key) localStorage.setItem('skilltree_gemini_key', key);
    else localStorage.removeItem('skilltree_gemini_key');
    localStorage.setItem('skilltree_ai_model', model);
    closeModal('aiSettingsModal');
    showToast('Налаштування ШІ-асистента збережено.');
  });

  $('clearAiKeyBtn')?.addEventListener('click', () => {
    localStorage.removeItem('skilltree_gemini_key');
    localStorage.setItem('skilltree_ai_model', 'builtin');
    if ($('aiApiKeyInput')) $('aiApiKeyInput').value = '';
    if ($('aiModelSelect')) $('aiModelSelect').value = 'builtin';
    showToast('Локальний API-ключ очищено.');
  });

  // Close Modals
  document.addEventListener('click', (event) => {
    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal(closeBtn.getAttribute('data-close-modal'));
      return;
    }
    if (event.target.classList?.contains('st-modal')) {
      event.target.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.st-modal:not(.hidden)').forEach((m) => m.classList.add('hidden'));
    }
  });

  // Auth Modal triggers
  $('openAuthBtn')?.addEventListener('click', () => {
    setAuthTab('login');
    openModal('authModal');
  });

  $('openAuthFromProfileBtn')?.addEventListener('click', () => {
    setAuthTab('login');
    openModal('authModal');
  });

  $('openAuthFromMentorBtn')?.addEventListener('click', () => {
    setAuthTab('register');
    if ($('regRole')) {
      $('regRole').value = 'MENTOR';
      syncRegisterRoleField();
    }
    openModal('authModal');
  });

  $('authTabLogin')?.addEventListener('click', () => setAuthTab('login'));
  $('authTabRegister')?.addEventListener('click', () => setAuthTab('register'));
  $('authTabReset')?.addEventListener('click', () => setAuthTab('reset'));
  $('regRole')?.addEventListener('change', syncRegisterRoleField);

  $('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      state.data = res.state;
      state.selectedTreeId = null;
      state.selectedNodeId = null;
      closeModal('authModal');
      renderAll();
      const role = res.user.role;
      const dest = role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap';
      navigateTo(dest);
      showToast(`Вітаємо, ${res.user.fullName}!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const role = $('regRole').value;
      const extraVal = $('regExtraInput').value.trim();
      const body = {
        fullName: $('regFullName').value.trim(),
        email: $('regEmail').value.trim(),
        password: $('regPassword').value,
        role,
      };
      if (role === 'MENTOR' && extraVal) body.specialization = extraVal;
      if (role === 'HR' && extraVal) body.company = extraVal;
      if (role === 'LEARNER' && extraVal) body.targetProfession = extraVal;

      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      state.data = res.state;
      state.selectedTreeId = null;
      state.selectedNodeId = null;
      closeModal('authModal');
      renderAll();
      const dest = role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap';
      navigateTo(dest);
      showToast(`Акаунт створено! Вітаємо, ${res.user.fullName}.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: $('resetEmail').value.trim(),
          newPassword: $('resetNewPassword').value,
        }),
      });
      showToast('Пароль оновлено. Тепер ви можете увійти.');
      setAuthTab('login');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  const handleLogout = async () => {
    try {
      const res = await api('/api/auth/logout', { method: 'POST', body: '{}' });
      state.data = res.state;
      state.selectedTreeId = null;
      state.selectedNodeId = null;
      renderAll();
      navigateTo('/');
      showToast('Ви вийшли з облікового запису.');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  $('logoutBtn')?.addEventListener('click', handleLogout);
  $('profileLogoutBtn')?.addEventListener('click', handleLogout);

  // Roadmap Actions
  $('treeSelect')?.addEventListener('change', (e) => {
    state.selectedTreeId = Number(e.target.value);
    state.selectedNodeId = null;
    renderRoadmapPage();
  });

  $('openWizardBtn')?.addEventListener('click', () => openModal('wizardModal'));
  $('openAddNodeBtn')?.addEventListener('click', () => openModal('addNodeModal'));

  $('quickProfessionsRow')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quick-profession]');
    if (!btn) return;
    const profession = btn.getAttribute('data-quick-profession');
    const learner = getActiveLearner();
    if (!learner) return;
    try {
      const res = await api('/api/trees/generate', {
        method: 'POST',
        body: JSON.stringify({ learnerId: learner.id, profession, level: 'BEGINNER' }),
      });
      state.data = res.state;
      state.selectedTreeId = res.tree.id;
      state.selectedNodeId = res.tree.nodes[0]?.id || null;
      renderAll();
      showToast(`Карту «${profession}» згенеровано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('wizardForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    if (!learner) return;
    try {
      const res = await api('/api/trees/generate', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: learner.id,
          profession: $('wizardProfession').value.trim(),
          level: $('wizardLevel').value,
          goal: $('wizardGoal').value.trim(),
        }),
      });
      state.data = res.state;
      state.selectedTreeId = res.tree.id;
      state.selectedNodeId = res.tree.nodes[0]?.id || null;
      closeModal('wizardModal');
      $('wizardForm').reset();
      renderAll();
      showToast(`Карту «${res.tree.targetProfession}» створено!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('addNodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    if (!tree) return;
    try {
      const res = await api(`/api/trees/${tree.id}/nodes`, {
        method: 'POST',
        body: JSON.stringify({
          title: $('newNodeTitle').value.trim(),
          description: $('newNodeDesc').value.trim(),
          materialTitle: $('newNodeMaterialTitle').value.trim() || undefined,
          materialUrl: $('newNodeMaterialUrl').value.trim() || undefined,
        }),
      });
      state.data = res.state;
      state.selectedNodeId = res.node.id;
      closeModal('addNodeModal');
      $('addNodeForm').reset();
      renderAll();
      showToast(`Вузол «${res.node.title}» додано до карти.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('nodesList')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-node-id]');
    if (!item) return;
    state.selectedNodeId = Number(item.getAttribute('data-node-id'));
    renderRoadmapPage();
  });

  $('nodeActionButtons')?.addEventListener('click', async (e) => {
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if (!tree || !node) return;

    const statusBtn = e.target.closest('[data-node-status]');
    if (statusBtn) {
      try {
        const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: statusBtn.getAttribute('data-node-status') }),
        });
        state.data = res.state;
        renderAll();
        showToast('Статус вузла оновлено.');
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    if (e.target.closest('#deleteNodeBtn')) {
      try {
        const res = await api(`/api/trees/${tree.id}/nodes/${node.id}`, { method: 'DELETE' });
        state.data = res.state;
        state.selectedNodeId = null;
        renderAll();
        showToast('Вузол видалено з карти.');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  $('nodeMaterialsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-material]');
    if (!btn) return;
    openMaterialReader(Number(btn.getAttribute('data-open-material')));
  });

  document.querySelectorAll('.chip-btn[data-prompt]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if ($('aiQuestionInput')) {
        $('aiQuestionInput').value = chip.getAttribute('data-prompt') || '';
        $('askAiForm')?.requestSubmit();
      }
    });
  });

  $('askAiForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    const question = $('aiQuestionInput')?.value.trim();
    if (!tree || !node || !question) return;

    try {
      const apiKey = localStorage.getItem('skilltree_gemini_key') || undefined;
      const model = localStorage.getItem('skilltree_ai_model') || undefined;
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ question, apiKey, model }),
      });
      $('aiQuestionInput').value = '';
      state.data = res.state;
      renderAll();
      const box = $('chatMessages');
      if (box) box.scrollTop = box.scrollHeight;
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('chatMessages')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rate-msg]');
    if (!btn) return;
    const messageId = Number(btn.getAttribute('data-rate-msg'));
    const helpful = btn.getAttribute('data-helpful') === 'true';
    try {
      const res = await api(`/api/chat/${messageId}/rate`, {
        method: 'PATCH',
        body: JSON.stringify({ helpful }),
      });
      state.data = res.state;
      renderAll();
      showToast(helpful ? 'Дякуємо! Відповідь позначено як корисну.' : 'Оцінку збережено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Mentors & Payment Checkout
  $('mentorsDirectoryGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-select-mentor]');
    if (!btn) return;
    const mentorId = btn.getAttribute('data-select-mentor');
    if ($('bookingMentorSelect')) $('bookingMentorSelect').value = mentorId;
    $('bookingTopic')?.focus();
    showToast('Ментора обрано у формі бронювання нижче.');
  });

  $('bookSessionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const learner = getActiveLearner();
    if (!learner) return;
    try {
      const durationMin = Number($('bookingDuration').value);
      const startAtVal = $('bookingStartAt').value;
      const res = await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: learner.id,
          mentorId: Number($('bookingMentorSelect').value),
          topic: $('bookingTopic').value.trim(),
          startAt: new Date(startAtVal).toISOString(),
          durationMin,
          durationMinutes: durationMin,
        }),
      });
      state.data = res.state;
      $('bookingTopic').value = '';
      renderAll();
      showToast('Сесію заброньовано! Тепер можна перейти до оплати.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('learnerSessionsList')?.addEventListener('click', async (e) => {
    const payBtn = e.target.closest('[data-open-pay]');
    if (payBtn) {
      const sessionId = Number(payBtn.getAttribute('data-open-pay'));
      const session = (state.data.sessions || []).find((s) => s.id === sessionId);
      if (!session) return;
      state.paymentSessionId = sessionId;
      const mentor = (state.data.mentors || []).find((m) => m.id === session.mentorId);
      if ($('paymentSessionSummary')) {
        $('paymentSessionSummary').innerHTML = `
          <div><strong>Тема:</strong> ${escapeHtml(session.topic)}</div>
          <div><strong>Ментор:</strong> ${escapeHtml(mentor?.fullName || '')}</div>
          <div><strong>Дата:</strong> ${new Date(session.startAt).toLocaleString('uk-UA')} (${session.durationMin} хв)</div>
        `;
      }
      if ($('paymentAmount')) $('paymentAmount').textContent = `${session.price} ₴`;
      openModal('paymentModal');
      return;
    }

    const receiptBtn = e.target.closest('[data-view-receipt]');
    if (receiptBtn) {
      const sessionId = Number(receiptBtn.getAttribute('data-view-receipt'));
      const receipt = (state.data.receipts || []).find((r) => r.sessionId === sessionId);
      const session = (state.data.sessions || []).find((s) => s.id === sessionId);
      if ($('receiptBody')) {
        $('receiptBody').innerHTML = receipt
          ? `
            <div><strong>ID транзакції:</strong> <code>${escapeHtml(receipt.transactionId)}</code></div>
            <div><strong>Сесія:</strong> #${receipt.sessionId} (${escapeHtml(session?.topic || '')})</div>
            <div><strong>Сума:</strong> ${receipt.amount} ${escapeHtml(receipt.currency)}</div>
            <div><strong>Статус:</strong> ${escapeHtml(receipt.status)}</div>
            <div><strong>Час оплати:</strong> ${new Date(receipt.processedAt).toLocaleString('uk-UA')}</div>
          `
          : `<div><strong>Сесія #${sessionId}:</strong> Оплата підтверджена (${session?.price || 0} ₴).</div>`;
      }
      openModal('receiptModal');
      return;
    }

    const cancelBtn = e.target.closest('[data-cancel-session]');
    if (cancelBtn) {
      const sessionId = Number(cancelBtn.getAttribute('data-cancel-session'));
      try {
        const res = await api(`/api/sessions/${sessionId}/cancel`, { method: 'POST', body: '{}' });
        state.data = res.state;
        renderAll();
        showToast('Сесію скасовано.');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  $('learnerSessionsList')?.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-feedback-form]');
    if (!form) return;
    e.preventDefault();
    const sessionId = Number(form.getAttribute('data-feedback-form'));
    const rating = Number(form.elements.rating.value);
    const feedback = form.elements.comment.value.trim();
    try {
      const res = await api(`/api/sessions/${sessionId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, feedback, comment: feedback }),
      });
      state.data = res.state;
      renderAll();
      showToast('Дякуємо! Відгук та оцінку ментора збережено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('confirmPaymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.paymentSessionId) return;
    try {
      const res = await api(`/api/sessions/${state.paymentSessionId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ method: $('paymentMethod').value }),
      });
      state.data = res.state;
      closeModal('paymentModal');
      renderAll();
      showToast(`Оплату підтверджено! Чек ${res.receipt?.transactionId || ''}`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Mentor Cabinet Actions
  $('publishMaterialForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = Number($('mentorNodeSelect').value);
    if (!nodeId) return;
    try {
      const mentorId = state.data.currentUser?.id;
      const res = await api(`/api/nodes/${nodeId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          mentorId,
          title: $('materialTitle').value.trim(),
          type: $('materialType').value,
          url: $('materialUrl').value.trim(),
          description: $('materialDesc').value.trim(),
          content: $('materialContent').value.trim(),
        }),
      });
      state.data = res.state;
      $('publishMaterialForm').reset();
      renderAll();
      showToast('Навчальний матеріал успішно опубліковано у вузол!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('mentorSessionsList')?.addEventListener('click', async (e) => {
    const confirmBtn = e.target.closest('[data-confirm-session]');
    if (confirmBtn) {
      const id = Number(confirmBtn.getAttribute('data-confirm-session'));
      try {
        const res = await api(`/api/sessions/${id}/confirm`, { method: 'POST', body: '{}' });
        state.data = res.state;
        renderAll();
        showToast('Сесію підтверджено!');
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const cancelBtn = e.target.closest('[data-cancel-session]');
    if (cancelBtn) {
      const id = Number(cancelBtn.getAttribute('data-cancel-session'));
      try {
        const res = await api(`/api/sessions/${id}/cancel`, { method: 'POST', body: '{}' });
        state.data = res.state;
        renderAll();
        showToast('Сесію скасовано.');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  // B2B Actions
  $('teamSelect')?.addEventListener('change', (e) => {
    state.selectedTeamId = Number(e.target.value);
    renderB2bPage();
  });

  $('assignTreeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/hr/assign-tree', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: Number($('hrLearnerSelect').value),
          profession: $('hrAssignProfession').value.trim(),
          level: $('hrAssignLevel').value,
        }),
      });
      state.data = res.state;
      $('hrAssignProfession').value = '';
      renderAll();
      showToast('Індивідуальну карту розвитку призначено працівнику.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('createTeamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const hrManagerId =
        state.data.currentUser?.role === 'HR'
          ? state.data.currentUser.id
          : state.data.hrManagers?.[0]?.id;
      const res = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: $('newTeamName').value.trim(),
          hrManagerId,
        }),
      });
      state.data = res.state;
      state.selectedTeamId = res.team.id;
      $('newTeamName').value = '';
      renderAll();
      showToast(`Команду «${res.team.name}» створено.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('addTeamMemberForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedTeamId) return;
    try {
      const res = await api(`/api/teams/${state.selectedTeamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ learnerId: Number($('addMemberLearnerSelect').value) }),
      });
      state.data = res.state;
      renderAll();
      showToast('Учасника додано до команди.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('previewCsvBtn')?.addEventListener('click', async () => {
    if (!state.selectedTeamId) return;
    try {
      const csvText = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      if ($('csvPreviewContent')) $('csvPreviewContent').textContent = csvText;
      $('csvPreviewCard')?.classList.remove('hidden');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('closeCsvPreviewBtn')?.addEventListener('click', () => {
    $('csvPreviewCard')?.classList.add('hidden');
  });

  $('exportCsvBtn')?.addEventListener('click', async () => {
    if (!state.selectedTeamId) return;
    try {
      const csvText = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skilltree-team-${state.selectedTeamId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV-звіт сформовано та завантажено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Profile Edit & Password Change on Dedicated Profile Page
  $('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = state.data?.currentUser;
    if (!user) return;
    try {
      const payload = { fullName: $('profFullName').value.trim() };
      if (user.role === 'LEARNER') {
        payload.targetProfession = $('profTargetProfession')?.value.trim();
        payload.level = $('profLevel')?.value;
      } else if (user.role === 'MENTOR') {
        payload.specialization = $('profSpecialization')?.value.trim();
        payload.hourlyRate = Number($('profHourlyRate')?.value);
        payload.bio = $('profBio')?.value.trim();
      } else if (user.role === 'HR') {
        payload.company = $('profCompany')?.value.trim();
      }

      const res = await api('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      state.data = res.state;
      renderAll();
      showToast('Дані профілю успішно збережено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('profilePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = state.data?.currentUser;
    if (!user) return;
    const newPassword = $('profileNewPassword').value;
    const confirmPassword = $('profileConfirmPassword').value;
    if (newPassword !== confirmPassword) {
      showToast('Паролі не співпадають.', true);
      return;
    }
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: user.email, newPassword }),
      });
      $('profilePasswordForm').reset();
      showToast('Пароль облікового запису успішно оновлено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

async function init() {
  applyTheme(localStorage.getItem('skilltree_theme') || 'dark');
  syncRegisterRoleField();
  bindEvents();
  navigateTo(window.location.pathname, false);
  try {
    await loadState();
  } catch (err) {
    showToast(`Не вдалося завантажити дані: ${err.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', init);
