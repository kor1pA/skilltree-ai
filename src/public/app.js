'use strict';

const ROUTES = {
  '/': 'page-roadmap',
  '/roadmap': 'page-roadmap',
  '/mentors': 'page-mentors',
  '/mentor-cabinet': 'page-mentor-cabinet',
  '/b2b': 'page-b2b',
  '/profile': 'page-profile',
  '/auth': 'page-auth',
  '/login': 'page-auth',
};

const ROUTE_TITLES = {
  '/': 'Моя карта розвитку — SkillTree AI',
  '/roadmap': 'Моя карта розвитку — SkillTree AI',
  '/mentors': 'Каталог менторів та сесій — SkillTree AI',
  '/mentor-cabinet': 'Кабінет ментора — SkillTree AI',
  '/b2b': 'B2B Skill Matrix — SkillTree AI',
  '/profile': 'Вхід та управління профілями — SkillTree AI',
  '/auth': 'Портал авторизації та доступу — SkillTree AI',
  '/login': 'Портал авторизації та доступу — SkillTree AI',
};

const state = {
  data: null,
  currentRoute: '/roadmap',
  selectedTreeId: null,
  selectedNodeId: null,
  selectedTeamId: null,
  skillViewMode: '3d',
  authMode: 'login',
  registerRole: 'LEARNER',
  mentorSearch: '',
  mentorSpec: 'ALL',
  mentorSort: 'rating',
  globalSearch: '',
  bookingMentorId: null,
  paymentMethod: 'CARD',
  revokedSessions: new Set(),
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
  const toast = $('toastNotification');
  const msgEl = $('toastMessage');
  const iconEl = $('toastIcon');
  if (!toast || !msgEl || !iconEl) return;

  msgEl.textContent = message;
  iconEl.textContent = isError ? 'error' : 'check_circle';
  iconEl.className = `material-symbols-outlined ${isError ? 'text-rose-400' : 'text-emerald-400'}`;
  toast.classList.remove('hidden', 'border-emerald-400/50', 'border-rose-500/60');
  toast.classList.add(isError ? 'border-rose-500/60' : 'border-emerald-400/50');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3800);
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
  if (!path || path === '/') return '/roadmap';
  const cleaned = path.replace(/\/+$/, '');
  return ROUTES[cleaned] ? cleaned : '/roadmap';
}

function navigateTo(path, push = true) {
  const rawNormalized = !path || path === '/' ? '/' : path.replace(/\/+$/, '');
  const target = ROUTES[rawNormalized] ? rawNormalized : '/roadmap';
  const navRoute = target === '/' ? '/roadmap' : target === '/login' ? '/auth' : target;
  state.currentRoute = navRoute;

  if (push && window.location.pathname !== (target === '/' ? '/' : navRoute)) {
    window.history.pushState({ route: navRoute }, '', target === '/' ? '/' : navRoute);
  }

  const isAuthPage = navRoute === '/auth';
  const shell = $('dashboard-shell');
  const authView = $('page-auth');

  if (shell) shell.classList.toggle('hidden', isAuthPage);
  if (authView) authView.classList.toggle('active', isAuthPage);

  if (!isAuthPage) {
    const activeSectionId = ROUTES[navRoute] || 'page-roadmap';
    document.querySelectorAll('#dashboard-shell .page-view').forEach((section) => {
      section.classList.toggle('active', section.id === activeSectionId);
    });
  }

  document.querySelectorAll('.sidebar-nav-link[data-route]').forEach((link) => {
    const linkRoute = normalizeRoute(link.getAttribute('data-route'));
    link.classList.toggle('active', linkRoute === navRoute);
  });

  // Close mobile sidebar & dropdown on navigation
  $('dashboard-sidebar')?.classList.remove('open');
  $('mobileSidebarBackdrop')?.classList.add('hidden');
  $('userProfileDropdown')?.classList.add('hidden');

  document.title = ROUTE_TITLES[navRoute] || ROUTE_TITLES['/'];
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (navRoute === '/roadmap') {
    requestAnimationFrame(() => resizeConstellationCanvas());
  }
}

function getInitials(fullName) {
  const parts = String(fullName || 'ST').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return String(fullName || 'ST').slice(0, 2).toUpperCase();
}

function getRoleLabel(role) {
  if (role === 'MENTOR') return 'Ментор / Експерт';
  if (role === 'HR') return 'HR / TeamLead (B2B)';
  return 'Студент / Фахівець';
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

function openModal(id) {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

function getDemoAccounts() {
  const learners = state.data?.learners || [];
  const mentors = state.data?.mentors || [];
  const hrs = state.data?.hrManagers || [];
  const teams = state.data?.teams || [];

  const learner = learners[0] || {
    fullName: "В'ячеслав Гой",
    email: 'slava@skilltree.ai',
    points: 100,
    level: 'BEGINNER',
  };
  const mentor = mentors[0] || {
    fullName: 'Андрій Савченко',
    email: 'andriy.mentor@skilltree.ai',
    rating: 4.9,
    hourlyRate: 900,
    specialization: 'Full-Stack & TypeScript',
    publishedMaterialsCount: 2,
  };
  const hr = hrs[0] || {
    fullName: 'Марія Ткаченко',
    email: 'maria.hr@technova.ua',
    company: 'TechNova Ukraine',
  };

  return {
    LEARNER: {
      role: 'LEARNER',
      name: learner.fullName,
      email: learner.email,
      meta: `${learner.points ?? 0} XP`,
      sub: learner.targetProfession || 'Студент',
    },
    MENTOR: {
      role: 'MENTOR',
      name: mentor.fullName,
      email: mentor.email,
      meta: `★ ${Number(mentor.rating || 4.9).toFixed(1)}`,
      sub: mentor.specialization || 'Ментор',
      rate: mentor.hourlyRate || 900,
      materialsCount: mentor.publishedMaterialsCount || 0,
    },
    HR: {
      role: 'HR',
      name: hr.fullName,
      email: hr.email,
      meta: `${learners.length} чол.`,
      sub: hr.company || 'TechNova',
      teamsCount: teams.length,
    },
  };
}

async function quickSwitchRole(role, shouldNavigate = true) {
  const demos = getDemoAccounts();
  const target = demos[role] || demos.LEARNER;
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: target.email, password: 'demo1234' }),
    });
    state.data = res.state;
    state.selectedTreeId = null;
    state.selectedNodeId = null;
    renderAll();
    if (shouldNavigate) {
      const dest = role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap';
      navigateTo(dest);
    }
    showToast(`Увійшли як ${res.user.fullName} (${getRoleLabel(res.user.role)})`);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadState() {
  state.data = await api('/api/state');
  renderAll();
}

function renderAll() {
  if (!state.data) return;
  renderAuthQuickCards();
  renderHeaderAndDropdown();
  renderRoadmapPage();
  renderMentorsPage();
  renderMentorCabinetPage();
  renderB2bPage();
  renderProfilePage();
}

// ============================================================================
// SCREEN 1: AUTH PORTAL RENDER & HELPERS
// ============================================================================
function setAuthTab(mode) {
  state.authMode = mode;
  const tabLogin = $('tab-login');
  const tabReg = $('tab-register');
  const titleEl = $('portal-title');
  const subtitleEl = $('portal-subtitle');
  const submitText = $('submit-btn-text');
  const savedSection = $('saved-sessions-section');
  const roleWrapper = $('role-section-wrapper');
  const fieldFullname = $('field-fullname');
  const fieldExtra = $('field-extra');

  const activeClasses = [
    'bg-gradient-to-r',
    'from-brand-600',
    'to-indigo-600',
    'text-white',
    'shadow-md',
    'shadow-brand-600/30',
  ];

  if (mode === 'register') {
    tabReg?.classList.add(...activeClasses);
    tabReg?.classList.remove('text-slate-400');
    tabLogin?.classList.remove(...activeClasses);
    tabLogin?.classList.add('text-slate-400');

    savedSection?.classList.add('hidden');
    roleWrapper?.classList.remove('hidden');
    fieldFullname?.classList.remove('hidden');
    fieldExtra?.classList.remove('hidden');
    if ($('input-fullname')) $('input-fullname').required = true;
    if ($('input-email')) $('input-email').value = '';
    if ($('input-password')) $('input-password').value = '';
    if (titleEl) titleEl.textContent = 'Реєстрація в SkillTree AI';
    if (subtitleEl) subtitleEl.textContent = 'Створіть свій акаунт, оберіть роль та отримайте стартову карту навичок';
    if (submitText) submitText.textContent = 'Зареєструватися (+100 XP)';
  } else {
    tabLogin?.classList.add(...activeClasses);
    tabLogin?.classList.remove('text-slate-400');
    tabReg?.classList.remove(...activeClasses);
    tabReg?.classList.add('text-slate-400');

    savedSection?.classList.remove('hidden');
    roleWrapper?.classList.add('hidden');
    fieldFullname?.classList.add('hidden');
    fieldExtra?.classList.add('hidden');
    if ($('input-fullname')) $('input-fullname').required = false;
    if (titleEl) titleEl.textContent = 'Вхід до SkillTree AI';
    if (subtitleEl) subtitleEl.textContent = 'Оберіть роль у системі, увійдіть за паролем або використайте швидкий вхід';
    if (submitText) submitText.textContent = 'Увійти в кабінет';
  }
}

function selectRegisterRole(role) {
  state.registerRole = role;
  document.querySelectorAll('[data-select-role]').forEach((chip) => {
    const active = chip.getAttribute('data-select-role') === role;
    chip.classList.toggle('role-card-active', active);
    chip.classList.toggle('border-slate-800', !active);
  });

  const label = $('input-extra-label');
  const input = $('input-extra');
  if (label && input) {
    if (role === 'MENTOR') {
      label.textContent = 'Спеціалізація ментора';
      input.placeholder = 'Senior Backend & Architecture';
    } else if (role === 'HR') {
      label.textContent = 'Назва компанії';
      input.placeholder = 'TechNova Ukraine';
    } else {
      label.textContent = 'Цільова професія';
      input.placeholder = 'Full-Stack Developer';
    }
  }
}

function renderAuthQuickCards() {
  const container = $('authQuickDemoGrid');
  if (!container) return;
  const demos = getDemoAccounts();
  container.innerHTML = `
    <button type="button" data-auth-demo="LEARNER" class="group flex flex-col p-2.5 rounded-xl bg-slate-900/60 hover:bg-brand-500/10 border border-slate-800 hover:border-brand-500/50 transition text-left cursor-pointer">
      <div class="flex items-center gap-1.5 mb-1">
        <div class="w-5 h-5 rounded-md bg-brand-500/20 text-brand-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xs">school</span></div>
        <span class="text-xs font-bold text-slate-200 truncate">${escapeHtml(demos.LEARNER.name)}</span>
      </div>
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="text-brand-300 font-medium">Студент</span>
        <span class="font-mono text-cyan-300">${escapeHtml(demos.LEARNER.meta)}</span>
      </div>
    </button>
    <button type="button" data-auth-demo="MENTOR" class="group flex flex-col p-2.5 rounded-xl bg-slate-900/60 hover:bg-brand-500/10 border border-slate-800 hover:border-brand-500/50 transition text-left cursor-pointer">
      <div class="flex items-center gap-1.5 mb-1">
        <div class="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xs">psychology</span></div>
        <span class="text-xs font-bold text-slate-200 truncate">${escapeHtml(demos.MENTOR.name)}</span>
      </div>
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="text-indigo-300 font-medium">Ментор</span>
        <span class="font-mono text-amber-300">${escapeHtml(demos.MENTOR.meta)}</span>
      </div>
    </button>
    <button type="button" data-auth-demo="HR" class="group flex flex-col p-2.5 rounded-xl bg-slate-900/60 hover:bg-brand-500/10 border border-slate-800 hover:border-brand-500/50 transition text-left cursor-pointer">
      <div class="flex items-center gap-1.5 mb-1">
        <div class="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xs">corporate_fare</span></div>
        <span class="text-xs font-bold text-slate-200 truncate">${escapeHtml(demos.HR.name)}</span>
      </div>
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="text-cyan-300 font-medium">HR Lead</span>
        <span class="font-mono text-emerald-400">${escapeHtml(demos.HR.meta)}</span>
      </div>
    </button>
  `;
}

// ============================================================================
// HEADER & ROLE DROPDOWN
// ============================================================================
function renderHeaderAndDropdown() {
  const currentUser = state.data.currentUser;
  const learner = getActiveLearner();
  const displayUser = currentUser || learner;

  if ($('headerXpText')) {
    const xp = currentUser?.role === 'LEARNER' ? currentUser.points : learner?.points ?? 0;
    $('headerXpText').textContent = `${xp} XP`;
  }
  if ($('headerLevelText')) {
    const lvl = currentUser?.role === 'LEARNER' ? currentUser.level : learner?.level ?? 'BEGINNER';
    $('headerLevelText').textContent = lvl;
  }

  const label = currentUser ? currentUser.fullName : `Гість (${learner?.fullName || 'Студент'})`;
  const initials = getInitials(displayUser?.fullName || 'ГТ');
  if ($('headerUserAvatar')) $('headerUserAvatar').textContent = initials;
  if ($('headerUserName')) $('headerUserName').textContent = label;
  if ($('dropdownAvatarLg')) $('dropdownAvatarLg').textContent = initials;
  if ($('dropdownUserName')) $('dropdownUserName').textContent = displayUser?.fullName || 'Гість';
  if ($('dropdownUserMeta')) {
    $('dropdownUserMeta').textContent = currentUser
      ? `${getRoleLabel(currentUser.role)} • ${currentUser.email}`
      : 'Гостьовий режим • Увійдіть або перемкніть роль';
  }
}

// ============================================================================
// SCREEN 2: ROADMAP, 3D CONSTELLATION & AI CHAT
// ============================================================================
function renderRoadmapPage() {
  const learner = getActiveLearner();
  if (!learner) return;

  const trees = learner.skillTrees || [];
  const treeSelect = $('treeSelect');
  if (treeSelect) {
    treeSelect.innerHTML = trees
      .map(
        (t) =>
          `<option value="${t.id}" class="bg-[#121422]">${escapeHtml(t.targetProfession)} (${escapeHtml(t.level)}) — ${Math.round(t.progress)}%</option>`
      )
      .join('');
  }

  const tree = getActiveTree(learner);
  if (!tree) return;
  if (treeSelect) treeSelect.value = String(tree.id);

  if ($('treeTitle')) $('treeTitle').textContent = tree.targetProfession || tree.title;
  if ($('treeTechBadge')) $('treeTechBadge').textContent = `${tree.level} • ${tree.nodes.length} ВУЗЛІВ`;
  if ($('treeLevelBadge')) $('treeLevelBadge').textContent = `Студент: ${learner.fullName}`;

  const doneCount = tree.nodes.filter((n) => n.status === 'DONE').length;
  const inProgressCount = tree.nodes.filter((n) => n.status === 'IN_PROGRESS').length;
  const todoCount = tree.nodes.filter((n) => n.status === 'NOT_STARTED').length;

  if ($('treeMeta')) $('treeMeta').textContent = `${doneCount} з ${tree.nodes.length} вузлів закрито`;
  if ($('treePercentBadge')) $('treePercentBadge').textContent = `${Math.round(tree.progress)}%`;
  if ($('treeProgressFill')) $('treeProgressFill').style.width = `${tree.progress}%`;
  if ($('countDoneNodes')) $('countDoneNodes').textContent = `${doneCount} опановано`;
  if ($('countInProgressNodes')) $('countInProgressNodes').textContent = `${inProgressCount} у процесі`;
  if ($('countLockedNodes')) $('countLockedNodes').textContent = `${todoCount} очікують`;

  if ($('badgesRow')) {
    const badgesHtml = (learner.badges || [])
      .map(
        (b) =>
          `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#181b2c] border border-[#282d44] text-slate-200 font-display text-xs"><span>🏆</span><span>${escapeHtml(b)}</span></span>`
      )
      .join('');
    $('badgesRow').innerHTML = `
      <span class="font-display text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Бейджі:</span>
      ${badgesHtml || '<span class="text-xs text-slate-500">Завершіть модуль для першого бейджу</span>'}
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 to-cyan-500/20 border border-primary/40 text-purple-200 font-display text-xs">
        <span>⭐</span><span class="font-bold text-white">+${learner.points} XP</span>
      </span>
    `;
  }

  const activeNode = getActiveNode(tree);

  // HUD updates for 3D constellation
  if ($('hudActiveFocusTitle')) {
    $('hudActiveFocusTitle').textContent = activeNode ? `#${activeNode.orderNumber} ${activeNode.title}` : '—';
  }
  if ($('hudActiveFocusStatus')) {
    $('hudActiveFocusStatus').textContent = activeNode ? activeNode.status : '—';
  }
  if ($('hudNodesCount')) {
    $('hudNodesCount').textContent = `${tree.nodes.length} взаємопов'язаних вузлів`;
  }

  render2dNodesList(tree, activeNode);
  renderNodeInspector(tree, activeNode);
  syncConstellationData(tree, activeNode);
}

function render2dNodesList(tree, activeNode) {
  const container = $('tree-container-2d');
  if (!container) return;

  const query = state.globalSearch.trim().toLowerCase();
  const visibleNodes = query
    ? tree.nodes.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          (n.description || '').toLowerCase().includes(query)
      )
    : tree.nodes;

  container.innerHTML = visibleNodes.length
    ? visibleNodes
        .map((node) => {
          const isSelected = activeNode && activeNode.id === node.id;
          const isDone = node.status === 'DONE';
          const isProg = node.status === 'IN_PROGRESS';
          const badgeHtml = isDone
            ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">✓ Завершено</span>'
            : isProg
              ? '<span class="px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold">◷ В процесі</span>'
              : '<span class="px-2.5 py-0.5 rounded-full bg-[#1e2235] text-slate-400 text-xs font-semibold">○ Не розпочато</span>';

          return `
            <div data-select-node="${node.id}" class="cursor-pointer rounded-2xl p-4.5 border transition-all ${
              isSelected
                ? 'bg-[#1a1d2e] border-primary/60 shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                : 'bg-[#181b2c] border-[#23273c] hover:border-slate-500'
            }">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  ${badgeHtml}
                  <span class="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-purple-200 text-xs font-semibold">+50 XP</span>
                </div>
                <span class="text-xs text-slate-400">${node.materials.length} матеріалів • ${node.messages.length} ШІ</span>
              </div>
              <h3 class="text-sm text-white font-bold m-0">${node.orderNumber}. ${escapeHtml(node.title)}</h3>
              <p class="text-xs text-slate-400 mt-1 mb-0">${escapeHtml(node.description)}</p>
            </div>
          `;
        })
        .join('')
    : '<p class="text-xs text-slate-400">Вузлів за вашим запитом не знайдено.</p>';
}

function renderNodeInspector(tree, node) {
  if (!node) return;

  const badge = $('activeNodeBadge');
  if (badge) {
    badge.textContent = node.status;
    badge.className = `px-2.5 py-0.5 rounded-full font-display text-[11px] font-bold uppercase tracking-wider border ${
      node.status === 'DONE'
        ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400'
        : node.status === 'IN_PROGRESS'
          ? 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
          : 'bg-[#1e2235] border-slate-600/40 text-slate-300'
    }`;
  }

  if ($('activeNodeTitle')) $('activeNodeTitle').textContent = `${node.orderNumber}. ${node.title}`;
  if ($('activeNodeDesc')) $('activeNodeDesc').textContent = node.description || 'Детальний опис модуля.';
  if ($('aiContextNodeTitle')) $('aiContextNodeTitle').textContent = `Контекст: ${node.title}`;

  const delBtn = $('deleteNodeBtn');
  if (delBtn) {
    delBtn.disabled = tree.nodes.length <= 1;
    delBtn.classList.toggle('opacity-40', tree.nodes.length <= 1);
  }

  const materials = node.materials || [];
  if ($('materialsCount')) $('materialsCount').textContent = String(materials.length);
  if ($('nodeMaterialsList')) {
    $('nodeMaterialsList').innerHTML = materials.length
      ? materials
          .map((m) => {
            const colorClass =
              m.type === 'VIDEO'
                ? 'bg-red-950/50 border-red-500/30 text-red-400'
                : m.type === 'LINK'
                  ? 'bg-cyan-950/50 border-cyan-500/30 text-cyan-400'
                  : 'bg-primary/20 border-primary/40 text-primary';
            const icon = m.type === 'VIDEO' ? 'smart_display' : m.type === 'LINK' ? 'link' : 'description';
            return `
              <button type="button" data-open-material="${m.id}" class="group w-full text-left flex items-center justify-between p-3 rounded-xl bg-[#181b2c] border border-[#23273c] hover:border-primary/50 hover:bg-[#1e2238] transition-all cursor-pointer">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${colorClass}">
                    <span class="material-symbols-outlined text-lg">${icon}</span>
                  </div>
                  <div class="min-w-0">
                    <div class="text-xs text-slate-100 font-semibold group-hover:text-primary truncate">${escapeHtml(m.title)}</div>
                    <div class="text-[11px] text-slate-400 truncate">${escapeHtml(m.type)} • ${escapeHtml(m.description || 'Натисніть щоб відкрити урок')}</div>
                  </div>
                </div>
                <span class="material-symbols-outlined text-slate-500 text-sm group-hover:text-cyan-400 shrink-0">open_in_new</span>
              </button>
            `;
          })
          .join('')
      : '<p class="text-xs text-slate-400">Поки що немає прикріплених матеріалів.</p>';
  }

  const actionsEl = $('nodeActionButtons');
  if (actionsEl) {
    actionsEl.innerHTML = `
      ${
        node.status === 'NOT_STARTED'
          ? `<button type="button" data-node-status="IN_PROGRESS" class="flex-1 py-2.5 px-4 rounded-xl bg-[#181b2c] border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 font-display text-xs font-bold cursor-pointer">▶ Розпочати тему</button>`
          : ''
      }
      ${
        node.status !== 'DONE'
          ? `<button type="button" data-node-status="DONE" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-display text-xs font-bold shadow-[0_0_20px_rgba(139,92,246,0.35)] cursor-pointer"><span class="material-symbols-outlined text-base">check_circle</span> Завершити вузол (+50 XP)</button>`
          : `<div class="w-full py-2.5 px-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-center font-display text-xs font-bold">✓ Модуль повністю опановано (+50 XP нараховано)</div>`
      }
    `;
  }

  const chatBox = $('chatMessages');
  if (chatBox) {
    const msgs = node.messages || [];
    chatBox.innerHTML = msgs.length
      ? msgs
          .map(
            (msg) => `
          <div class="flex flex-col gap-2.5">
            <div class="flex justify-end">
              <div class="bg-gradient-to-r from-brand-600 to-indigo-600 text-white p-3 rounded-2xl rounded-tr-sm max-w-[88%] text-xs leading-relaxed">${escapeHtml(msg.question)}</div>
            </div>
            <div class="flex items-start gap-2">
              <div class="w-7 h-7 rounded-lg bg-primary/20 border border-primary/40 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-xs">auto_awesome</span>
              </div>
              <div class="bg-[#181b2c] border border-[#23273c] p-3.5 rounded-2xl rounded-tl-sm flex-1 text-xs text-slate-200 leading-relaxed">
                <div class="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                  <span class="font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">SkillTree AI Assistant</span>
                  <span>${msg.responseTimeMs} мс</span>
                </div>
                <div class="whitespace-pre-wrap">${escapeHtml(msg.answer)}</div>
                <div class="mt-2.5 pt-2 border-t border-[#23273c] flex items-center gap-2">
                  <button type="button" data-rate-msg="${msg.id}" data-helpful="true" class="px-2.5 py-1 rounded-full text-[11px] border transition-colors cursor-pointer ${
                    msg.isHelpful === true
                      ? 'bg-emerald-950/70 border-emerald-400 text-emerald-300'
                      : 'bg-[#121422] border-[#282d44] text-slate-300 hover:border-cyan-400'
                  }">👍 Корисно</button>
                  <button type="button" data-rate-msg="${msg.id}" data-helpful="false" class="px-2.5 py-1 rounded-full text-[11px] border transition-colors cursor-pointer ${
                    msg.isHelpful === false
                      ? 'bg-rose-950/70 border-rose-400 text-rose-300'
                      : 'bg-[#121422] border-[#282d44] text-slate-300 hover:border-rose-400'
                  }">👎</button>
                </div>
              </div>
            </div>
          </div>
        `
          )
          .join('')
      : '<p class="text-xs text-slate-400 text-center py-6">Історія діалогу порожня. Задайте питання ШІ-помічнику нижче (відповідь ≤ 5 с).</p>';
  }

  const avgMs = state.data.kpi?.avgAiResponseMs ?? 180;
  const helpfulPct = state.data.kpi?.aiHelpfulnessPct ?? 100;
  if ($('aiSlaBadge')) $('aiSlaBadge').textContent = `${avgMs} мс (SLA ≤ 5000 мс)`;
  if ($('aiHelpfulnessKpi')) $('aiHelpfulnessKpi').textContent = `${helpfulPct}%`;
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
      material.content || `Навчальний ресурс (${material.type}) для модуля «${node.title}».`;
  }
  const ext = $('materialModalExternal');
  if (ext) {
    if (material.url) {
      ext.href = material.url;
      ext.classList.remove('hidden');
    } else {
      ext.classList.add('hidden');
    }
  }
  openModal('materialModal');
}

// ============================================================================
// SCREEN 3: MENTORS CATALOG & SLIDE-OVER BOOKING DRAWER
// ============================================================================
function renderMentorsPage() {
  const mentors = state.data.mentors || [];
  const learner = getActiveLearner();

  if ($('mentorsActiveCount')) $('mentorsActiveCount').textContent = String(mentors.length);
  if ($('mentorsAvgRating')) {
    const avg = mentors.length
      ? mentors.reduce((sum, m) => sum + Number(m.rating || 5), 0) / mentors.length
      : 5;
    $('mentorsAvgRating').textContent = avg.toFixed(2);
  }

  const query = (state.mentorSearch || state.globalSearch || '').trim().toLowerCase();
  const spec = state.mentorSpec;
  const filtered = mentors.filter((m) => {
    const matchesSearch =
      !query ||
      m.fullName.toLowerCase().includes(query) ||
      (m.specialization || '').toLowerCase().includes(query) ||
      (m.bio || '').toLowerCase().includes(query);
    const matchesSpec =
      spec === 'ALL' || (m.specialization || '').toLowerCase().includes(spec.toLowerCase());
    return matchesSearch && matchesSpec;
  });

  filtered.sort((a, b) => {
    if (state.mentorSort === 'price_asc') return a.hourlyRate - b.hourlyRate;
    if (state.mentorSort === 'price_desc') return b.hourlyRate - a.hourlyRate;
    if (state.mentorSort === 'materials') return (b.publishedMaterialsCount || 0) - (a.publishedMaterialsCount || 0);
    return Number(b.rating || 5) - Number(a.rating || 5);
  });

  const grid = $('mentorsDirectoryGrid');
  if (grid) {
    grid.innerHTML = filtered.length
      ? filtered
          .map(
            (m) => `
          <div class="relative cyber-card rounded-3xl p-6 flex flex-col justify-between group overflow-hidden">
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-400/50 text-purple-200 font-display text-[11px]">
                  <span class="material-symbols-outlined text-xs">workspace_premium</span> Верифікований
                </span>
                <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0e111d] border border-emerald-500/30 text-emerald-300 font-display text-[11px]">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Вільний слот
                </span>
              </div>
              <div class="flex items-start gap-4 mb-4">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 text-white text-xl font-extrabold flex items-center justify-center shrink-0 ring-2 ring-purple-500/50">${escapeHtml(getInitials(m.fullName))}</div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-lg text-white font-bold truncate m-0">${escapeHtml(m.fullName)}</h3>
                  <p class="text-xs text-purple-300 font-semibold mt-0.5 m-0">${escapeHtml(m.specialization)}</p>
                  <p class="text-xs text-slate-400 mt-1 m-0">Матеріалів: ${m.publishedMaterialsCount ?? 0}</p>
                </div>
              </div>
              <div class="flex items-center justify-between p-3 rounded-2xl bg-[#0e1220] border border-purple-500/20 mb-4">
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-amber-400 text-base">star</span>
                  <span class="text-base text-white font-bold">${Number(m.rating || 5).toFixed(2)}</span>
                </div>
                <div class="px-3 py-1 rounded-full bg-purple-950/80 border border-purple-400/40 text-purple-200 text-sm font-semibold">${m.hourlyRate} ₴ / год</div>
              </div>
              <p class="text-xs text-slate-300 mb-5 leading-relaxed line-clamp-3">${escapeHtml(m.bio)}</p>
            </div>
            <button type="button" data-book-mentor="${m.id}" class="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-brand-500 to-purple-600 hover:from-purple-500 hover:to-brand-500 text-white text-sm font-semibold cyber-glow-purple cursor-pointer border border-purple-400/40">
              <span class="material-symbols-outlined text-base">calendar_month</span> Забронювати сесію
            </button>
          </div>
        `
          )
          .join('')
      : '<p class="text-sm text-slate-400 col-span-3">Менторів за обраним фільтром не знайдено.</p>';
  }

  const sessionsList = $('learnerSessionsList');
  if (sessionsList && learner) {
    const sessions = (state.data.sessions || []).filter((s) => s.learnerId === learner.id);
    const receipts = state.data.receipts || [];
    sessionsList.innerHTML = sessions.length
      ? sessions
          .map((s) => {
            const m = mentors.find((x) => x.id === s.mentorId);
            const hasReceipt = receipts.some((r) => r.sessionId === s.id);
            return `
              <div class="p-4 rounded-2xl bg-[#0e111d] border border-[#252a42] flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-sm font-bold text-white">${escapeHtml(s.topic)}</div>
                    <div class="text-xs text-slate-400 mt-0.5">${escapeHtml(m?.fullName || '')} • ${new Date(s.startAt).toLocaleString('uk-UA')} • ${s.durationMin} хв (${s.price} ₴)</div>
                  </div>
                  <div class="flex gap-1.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#181b2c] border border-purple-500/30 text-purple-200">${escapeHtml(s.status)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.paymentStatus === 'PAID'
                        ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                    }">${escapeHtml(s.paymentStatus)}</span>
                  </div>
                </div>
                ${
                  s.rating
                    ? `<div class="text-xs text-amber-300">Ваша оцінка: ★ ${s.rating}/5 ${s.feedback ? `— «${escapeHtml(s.feedback)}»` : ''}</div>`
                    : ''
                }
                <div class="flex flex-wrap items-center gap-2">
                  ${
                    s.status !== 'CANCELLED' && s.paymentStatus === 'PENDING'
                      ? `<button type="button" data-pay-session="${s.id}" class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 text-white text-xs font-bold cursor-pointer">💳 Оплатити ${s.price} ₴</button>`
                      : ''
                  }
                  ${
                    hasReceipt || s.paymentStatus === 'PAID'
                      ? `<button type="button" data-view-receipt="${s.id}" class="px-3 py-1.5 rounded-xl bg-[#181b2c] border border-[#2b304c] text-cyan-300 text-xs font-semibold cursor-pointer">🧾 Квитанція</button>`
                      : ''
                  }
                  ${
                    s.paymentStatus === 'PAID' && s.status !== 'DONE' && s.status !== 'CANCELLED'
                      ? `
                        <form data-feedback-form="${s.id}" class="flex items-center gap-1.5 flex-1 min-w-[220px]">
                          <select name="rating" class="bg-[#181b2c] border border-[#2b304c] rounded-lg px-2 py-1 text-xs text-white">
                            <option value="5">5 ★</option>
                            <option value="4">4 ★</option>
                            <option value="3">3 ★</option>
                            <option value="2">2 ★</option>
                            <option value="1">1 ★</option>
                          </select>
                          <input name="comment" required placeholder="Ваш відгук..." class="flex-1 bg-[#181b2c] border border-[#2b304c] rounded-lg px-2.5 py-1 text-xs text-white" />
                          <button type="submit" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer">Оцінити</button>
                        </form>
                      `
                      : ''
                  }
                  ${
                    s.status !== 'DONE' && s.status !== 'CANCELLED'
                      ? `<button type="button" data-cancel-session="${s.id}" class="px-3 py-1.5 rounded-xl text-rose-400 hover:bg-rose-950/40 text-xs font-semibold cursor-pointer">Скасувати</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')
      : `<p class="text-xs text-slate-400">Немає заброньованих сесій для ${escapeHtml(learner.fullName)}.</p>`;
  }
}

function openBookingDrawer(mentorId) {
  const mentor = (state.data?.mentors || []).find((m) => m.id === mentorId);
  if (!mentor) return;
  state.bookingMentorId = mentorId;

  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  const node = getActiveNode(tree);

  if ($('drawerMentorAvatar')) $('drawerMentorAvatar').textContent = getInitials(mentor.fullName);
  if ($('drawerMentorName')) $('drawerMentorName').textContent = mentor.fullName;
  if ($('drawerMentorRole')) $('drawerMentorRole').textContent = mentor.specialization;
  if ($('drawerMentorPrice')) $('drawerMentorPrice').textContent = `${mentor.hourlyRate} ₴`;

  if ($('bookingTopicInput')) {
    $('bookingTopicInput').value = node ? `Розбір теми: ${node.title}` : `Консультація: ${mentor.specialization}`;
  }
  const startInput = $('bookingStartAt');
  if (startInput && !startInput.value) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(18, 0, 0, 0);
    startInput.value = tomorrow.toISOString().slice(0, 16);
  }
  updateBookingPrice();

  $('paymentSuccessToast')?.classList.add('hidden');
  const overlay = $('bookingDrawerOverlay');
  const drawer = $('bookingDrawer');
  overlay?.classList.remove('pointer-events-none', 'opacity-0');
  overlay?.classList.add('opacity-100');
  drawer?.classList.remove('translate-x-full');
  drawer?.classList.add('translate-x-0');
}

function closeBookingDrawer() {
  const overlay = $('bookingDrawerOverlay');
  const drawer = $('bookingDrawer');
  overlay?.classList.add('pointer-events-none', 'opacity-0');
  overlay?.classList.remove('opacity-100');
  drawer?.classList.add('translate-x-full');
  drawer?.classList.remove('translate-x-0');
}

function updateBookingPrice() {
  const mentor = (state.data?.mentors || []).find((m) => m.id === state.bookingMentorId);
  const durationMin = Number($('bookingDuration')?.value || 60);
  const price = mentor ? Number(((mentor.hourlyRate * durationMin) / 60).toFixed(2)) : 0;
  if ($('paymentTotalAmount')) $('paymentTotalAmount').textContent = `${price} ₴`;
}

// ============================================================================
// SCREEN 4: MENTOR CABINET
// ============================================================================
function renderMentorCabinetPage() {
  const currentUser = state.data.currentUser;
  const notice = $('mentorGuestNotice');
  const content = $('mentorCabinetContent');

  if (!currentUser || currentUser.role !== 'MENTOR') {
    notice?.classList.remove('hidden');
    content?.classList.add('hidden');
    return;
  }

  notice?.classList.add('hidden');
  content?.classList.remove('hidden');

  const mentor = (state.data.mentors || []).find((m) => m.id === currentUser.id) || currentUser;
  const sessions = (state.data.sessions || []).filter((s) => s.mentorId === mentor.id);

  if ($('mentorBannerAvatar')) $('mentorBannerAvatar').textContent = getInitials(mentor.fullName);
  if ($('mentorBannerName')) $('mentorBannerName').textContent = mentor.fullName;
  if ($('mentorBannerSpec')) $('mentorBannerSpec').querySelector('span:last-child').textContent = mentor.specialization || 'IT Mentor';
  if ($('mentorKpiRating')) $('mentorKpiRating').textContent = Number(mentor.rating || 5).toFixed(2);
  if ($('mentorKpiSessions')) $('mentorKpiSessions').textContent = String(sessions.length);
  if ($('mentorKpiMaterials')) $('mentorKpiMaterials').textContent = String(mentor.publishedMaterialsCount ?? 0);
  if ($('mentorKpiRevenue')) $('mentorKpiRevenue').textContent = `${mentor.hourlyRate ?? 900} ₴`;
  if ($('mentorSessionsTotalBadge')) $('mentorSessionsTotalBadge').textContent = `Усього: ${sessions.length}`;

  // Populate Target Skill Nodes for Material Publishing
  const nodeSelect = $('mentorNodeSelect');
  const allMaterials = [];
  if (nodeSelect) {
    const opts = [];
    for (const l of state.data.learners || []) {
      for (const t of l.skillTrees || []) {
        for (const n of t.nodes || []) {
          opts.push(
            `<option value="${n.id}" class="bg-[#121422]">${escapeHtml(l.fullName)} — ${escapeHtml(t.targetProfession)}: #${n.orderNumber} ${escapeHtml(n.title)}</option>`
          );
          for (const m of n.materials || []) {
            if (m.authorId === mentor.id || m.authorId) {
              allMaterials.push({ ...m, nodeTitle: n.title });
            }
          }
        }
      }
    }
    nodeSelect.innerHTML = opts.join('');
  }

  const sessContainer = $('mentorSessionsList');
  if (sessContainer) {
    sessContainer.innerHTML = sessions.length
      ? sessions
          .map((s) => {
            const learner = (state.data.learners || []).find((l) => l.id === s.learnerId);
            return `
              <div class="flex flex-col p-5 rounded-3xl bg-[#141724]/90 border ${
                s.status === 'BOOKED' ? 'border-amber-500/40' : 'border-[#2b304c]'
              } gap-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-full bg-primary/25 border border-primary/40 text-white font-bold flex items-center justify-center">${escapeHtml(getInitials(learner?.fullName || 'ST'))}</div>
                    <div>
                      <div class="text-sm font-bold text-white">${escapeHtml(learner?.fullName || `Студент #${s.learnerId}`)}</div>
                      <div class="text-xs text-slate-400">${escapeHtml(s.topic)}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#181b2c] border border-purple-500/30 text-purple-200">${escapeHtml(s.status)}</span>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                      s.paymentStatus === 'PAID'
                        ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                    }">${escapeHtml(s.paymentStatus)} (${s.price} ₴)</span>
                  </div>
                </div>
                <div class="p-3 rounded-2xl bg-[#0f111d] border border-[#252a42] flex flex-wrap gap-4 text-xs text-slate-300">
                  <span>📅 ${new Date(s.startAt).toLocaleString('uk-UA')}</span>
                  <span>⏱ ${s.durationMin} хв</span>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#22273c]">
                  ${
                    s.status !== 'DONE' && s.status !== 'CANCELLED'
                      ? `<button type="button" data-cancel-session="${s.id}" class="px-4 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-semibold cursor-pointer">Скасувати ${s.paymentStatus === 'PAID' ? '(REFUND)' : ''}</button>`
                      : '<span></span>'
                  }
                  ${
                    s.status === 'BOOKED'
                      ? `<button type="button" data-confirm-session="${s.id}" class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs font-bold cursor-pointer">✓ Підтвердити сесію</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')
      : '<p class="text-sm text-slate-400">Вхідних записів на сесії поки немає.</p>';
  }

  const matContainer = $('mentorMaterialsList');
  if (matContainer) {
    const mine = allMaterials.filter((m) => m.authorId === mentor.id);
    const showList = mine.length ? mine : allMaterials.slice(0, 4);
    matContainer.innerHTML = showList.length
      ? showList
          .slice(0, 6)
          .map(
            (m) => `
          <div class="p-4 rounded-2xl bg-[#141724]/80 border border-[#2b304c] flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-primary font-mono text-[11px] font-bold">${escapeHtml(m.type)}</span>
              <span class="text-[11px] text-slate-400 font-mono">Вузол: ${escapeHtml(m.nodeTitle)}</span>
            </div>
            <div class="text-sm text-white font-semibold">${escapeHtml(m.title)}</div>
          </div>
        `
          )
          .join('')
      : '<p class="text-xs text-slate-400">Опублікуйте перший матеріал, натиснувши «+ Додати».</p>';
  }
}

// ============================================================================
// SCREEN 5: B2B SKILL MATRIX
// ============================================================================
function renderB2bPage() {
  const teams = state.data.teams || [];
  const learners = state.data.learners || [];
  const professions = state.data.professions || [];

  if (!teams.some((t) => t.id === state.selectedTeamId) && teams.length > 0) {
    state.selectedTeamId = teams[0].id;
  }

  const team = teams.find((t) => t.id === state.selectedTeamId) || teams[0];

  if ($('professionList')) {
    $('professionList').innerHTML = professions.map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
  }

  const learnerOpts = learners
    .map((l) => `<option value="${l.id}" class="bg-[#121422]">${escapeHtml(l.fullName)} (${escapeHtml(l.targetProfession)})</option>`)
    .join('');
  if ($('hrLearnerSelect')) $('hrLearnerSelect').innerHTML = learnerOpts;
  if ($('addMemberLearnerSelect')) $('addMemberLearnerSelect').innerHTML = learnerOpts;

  const menu = $('teamDropdownMenu');
  if (menu) {
    menu.innerHTML = teams
      .map(
        (t) => `
      <button type="button" data-select-team="${t.id}" class="w-full text-left px-4 py-2.5 hover:bg-[#34343b] flex items-center justify-between text-xs text-white transition-colors cursor-pointer">
        <span>${escapeHtml(t.name)}</span>
        <span class="font-mono text-cyan-300">${t.memberIds.length} чол.</span>
      </button>
    `
      )
      .join('');
  }

  if (!team) return;
  if ($('currentTeamLabel')) {
    $('currentTeamLabel').textContent = `${team.name} (${team.memberIds.length} працівників)`;
  }

  const matrix = team.detailedMatrix || {
    professionAverages: team.skillMatrix || {},
    skillNodeAverages: {},
    members: [],
    teamAverageProgress: 0,
  };

  if ($('b2bAvgProgress')) $('b2bAvgProgress').textContent = `${Number(matrix.teamAverageProgress || 0).toFixed(0)}%`;
  if ($('b2bAvgProgressBar')) $('b2bAvgProgressBar').style.width = `${Number(matrix.teamAverageProgress || 0)}%`;

  const nodeEntries = Object.entries(matrix.skillNodeAverages || {});
  const gaps = nodeEntries.filter(([, score]) => Number(score) < 50);
  if ($('b2bSkillGapsCount')) $('b2bSkillGapsCount').textContent = String(gaps.length);
  if ($('b2bSkillGapChips')) {
    $('b2bSkillGapChips').innerHTML = gaps.length
      ? gaps
          .slice(0, 3)
          .map(
            ([name]) =>
              `<span class="px-2 py-0.5 rounded-lg bg-red-950/40 border border-error/30 text-error text-[11px] font-semibold truncate max-w-full">${escapeHtml(name)}</span>`
          )
          .join('')
      : '<span class="text-xs text-emerald-400">Критичних прогалин немає</span>';
  }

  const totalDone = matrix.members.reduce((sum, m) => sum + (m.doneNodes || 0), 0);
  if ($('b2bNodesPassed')) $('b2bNodesPassed').textContent = String(totalDone);
  if ($('b2bActivePlans')) $('b2bActivePlans').textContent = String(matrix.members.length);

  const query = state.globalSearch.trim().toLowerCase();
  const rows = query
    ? matrix.members.filter(
        (m) =>
          m.fullName.toLowerCase().includes(query) ||
          m.targetProfession.toLowerCase().includes(query)
      )
    : matrix.members;

  const tbody = $('hrMembersTableBody');
  if (tbody) {
    tbody.innerHTML = rows.length
      ? rows
          .map((m) => {
            const isGap = m.progressPct < 50;
            return `
              <tr class="hover:bg-violet-950/20 transition-all ${isGap ? 'border-l-2 border-l-error bg-red-950/10' : ''}">
                <td class="py-3.5 px-5">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-primary-container to-tertiary text-white text-xs font-bold flex items-center justify-center shrink-0">${escapeHtml(getInitials(m.fullName))}</div>
                    <div>
                      <div class="font-semibold text-white flex items-center gap-2">
                        <span>${escapeHtml(m.fullName)}</span>
                        ${isGap ? '<span class="px-2 py-0.5 rounded-full bg-red-950/80 border border-error/50 text-error text-[10px] font-bold">Skill Gap</span>' : ''}
                      </div>
                      <div class="text-xs text-slate-400">${escapeHtml(m.email)}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3.5 px-4">
                  <div class="text-xs font-semibold text-primary">${escapeHtml(m.targetProfession)}</div>
                  <div class="text-[11px] text-slate-400">${escapeHtml(m.level)}</div>
                </td>
                <td class="py-3.5 px-4 text-xs text-slate-300">${m.treesCount} карт • ${m.doneNodes}/${m.totalNodes} вузлів</td>
                <td class="py-3.5 px-4">
                  <div class="flex items-center gap-2.5">
                    <div class="w-24 bg-[#1b1e2e] rounded-full h-2 overflow-hidden">
                      <div class="h-2 rounded-full ${isGap ? 'bg-error' : 'bg-emerald-400'}" style="width: ${m.progressPct}%"></div>
                    </div>
                    <span class="text-xs font-bold ${isGap ? 'text-error' : 'text-white'}">${m.progressPct.toFixed(1)}%</span>
                  </div>
                </td>
                <td class="py-3.5 px-4 text-center font-mono text-xs text-cyan-300 font-bold">${m.points} XP</td>
                <td class="py-3.5 px-5 text-right">
                  <button type="button" data-assign-learner="${m.learnerId}" class="px-3 py-1.5 rounded-full bg-[#1e2238] hover:bg-primary-container/40 border border-violet-500/30 text-xs text-white font-semibold cursor-pointer">
                    + Карта (UC8)
                  </button>
                </td>
              </tr>
            `;
          })
          .join('')
      : '<tr><td colspan="6" class="py-6 px-5 text-center text-slate-400">У команді ще немає учасників.</td></tr>';
  }

  const profEntries = Object.entries(matrix.professionAverages || {});
  if ($('b2bBalanceBars')) {
    $('b2bBalanceBars').innerHTML = profEntries.length
      ? profEntries
          .map(
            ([prof, avg]) => `
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-200 font-medium">${escapeHtml(prof)}</span>
              <span class="font-bold ${avg < 50 ? 'text-error' : 'text-emerald-400'}">${Number(avg).toFixed(1)}%</span>
            </div>
            <div class="w-full bg-[#0d0e14] rounded-full h-1.5 border border-violet-500/20">
              <div class="h-1.5 rounded-full ${avg < 50 ? 'bg-error' : 'bg-emerald-400'}" style="width: ${Math.min(100, Number(avg))}%"></div>
            </div>
          </div>
        `
          )
          .join('')
      : '<p class="text-xs text-slate-400">Немає даних профілів.</p>';
  }

  if ($('b2bAiInsightText')) {
    $('b2bAiInsightText').textContent = gaps.length
      ? `AI Insight: Рекомендовано підсилити модулі «${gaps[0][0]}» (${gaps[0][1]}% прогресу) через UC8.`
      : 'AI Insight: Баланс навичок команди стабільний — критичних відставань не виявлено.';
  }
}

function openAssignModal(learnerId) {
  if (learnerId && $('hrLearnerSelect')) {
    $('hrLearnerSelect').value = String(learnerId);
  }
  const backdrop = $('assignModalBackdrop');
  const panel = $('assignModalPanel');
  backdrop?.classList.remove('hidden');
  setTimeout(() => {
    panel?.classList.remove('translate-x-full');
  }, 10);
}

function closeAssignModal() {
  const backdrop = $('assignModalBackdrop');
  const panel = $('assignModalPanel');
  panel?.classList.add('translate-x-full');
  setTimeout(() => {
    backdrop?.classList.add('hidden');
  }, 260);
}

// ============================================================================
// SCREEN 6: PROFILES & ROLE SWITCHER
// ============================================================================
function renderProfilePage() {
  const currentUser = state.data.currentUser;
  const learner = getActiveLearner();
  const display = currentUser || learner;
  const role = currentUser?.role || 'GUEST';

  if ($('profileHeroAvatar')) $('profileHeroAvatar').textContent = getInitials(display?.fullName || 'ГТ');
  if ($('profileHeroRole')) {
    $('profileHeroRole').textContent = currentUser ? getRoleLabel(currentUser.role) : 'Гостьовий режим';
  }
  if ($('profileHeroId')) $('profileHeroId').textContent = `ID: #${display?.id || 0}`;
  if ($('profileHeroName')) $('profileHeroName').textContent = display?.fullName || 'Гість платформи';
  if ($('profileHeroHandle')) $('profileHeroHandle').textContent = display?.email ? `(${display.email})` : '';

  const wsLink = $('profileWorkspaceLink');
  if (wsLink) {
    const dest = role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap';
    wsLink.href = dest;
    wsLink.setAttribute('data-route', dest);
  }

  if (role === 'MENTOR') {
    const mentor = (state.data.mentors || []).find((m) => m.id === currentUser.id) || currentUser;
    if ($('profileHeroTrack')) $('profileHeroTrack').textContent = `Спеціалізація: ${mentor.specialization}`;
    if ($('profileHeroNode')) $('profileHeroNode').textContent = `Рейтинг: ★ ${mentor.rating} • ${mentor.hourlyRate} ₴/год`;
  } else if (role === 'HR') {
    if ($('profileHeroTrack')) $('profileHeroTrack').textContent = `Компанія: ${currentUser.company}`;
    if ($('profileHeroNode')) $('profileHeroNode').textContent = `Команд у базі: ${(state.data.teams || []).length}`;
  } else {
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if ($('profileHeroTrack')) $('profileHeroTrack').textContent = `Трек: ${tree?.targetProfession || 'Не обрано'}`;
    if ($('profileHeroNode')) $('profileHeroNode').textContent = `Фокус: ${node ? `#${node.orderNumber} ${node.title}` : 'Оберіть вузол'}`;
  }

  if ($('profileSessionStatusText')) {
    $('profileSessionStatusText').textContent = currentUser ? 'Авторизована сесія' : 'Гість (оберіть профіль нижче)';
  }

  const demos = getDemoAccounts();
  const cardsEl = $('roleDemoCards');
  if (cardsEl) {
    const isLearner = currentUser?.role === 'LEARNER';
    const isMentor = currentUser?.role === 'MENTOR';
    const isHr = currentUser?.role === 'HR';
    cardsEl.innerHTML = `
      <div class="relative bg-[#1a1b22]/90 rounded-xl p-6 flex flex-col justify-between border ${
        isLearner ? 'border-primary ring-1 ring-primary/40 shadow-[0_0_20px_rgba(208,188,255,0.18)]' : 'border-[#292930]'
      }">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/60 text-emerald-300">Студент</span>
            <span class="font-display text-[11px] uppercase text-slate-400">ROLE: LEARNER</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-primary text-on-primary font-extrabold flex items-center justify-center">${escapeHtml(getInitials(demos.LEARNER.name))}</div>
            <div class="min-w-0">
              <h4 class="text-base text-white font-bold truncate m-0">${escapeHtml(demos.LEARNER.name)}</h4>
              <span class="text-xs text-slate-400 truncate block">${escapeHtml(demos.LEARNER.sub)}</span>
            </div>
          </div>
          <div class="bg-[#1e1f26]/70 rounded-lg p-3 text-xs space-y-1.5">
            <div class="flex justify-between"><span class="text-slate-400">Email:</span><span class="font-mono text-slate-200">${escapeHtml(demos.LEARNER.email)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Досвід:</span><span class="text-tertiary font-bold">${escapeHtml(demos.LEARNER.meta)}</span></div>
          </div>
        </div>
        <button type="button" data-quick-role="LEARNER" ${isLearner ? 'disabled' : ''} class="mt-4 w-full py-2.5 rounded-xl font-display text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
          isLearner
            ? 'bg-[#292930] text-slate-400 cursor-not-allowed'
            : 'bg-primary text-on-primary hover:brightness-110 cursor-pointer'
        }">
          <span>${isLearner ? 'Поточна роль (Обрано)' : 'Увійти як Студент →'}</span>
        </button>
      </div>

      <div class="relative bg-[#1a1b22]/90 rounded-xl p-6 flex flex-col justify-between border ${
        isMentor ? 'border-tertiary ring-1 ring-tertiary/40 shadow-[0_0_20px_rgba(123,208,255,0.18)]' : 'border-[#292930]'
      }">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#292930] text-tertiary">Експерт</span>
            <span class="font-display text-[11px] uppercase text-slate-400">ROLE: MENTOR</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-tertiary to-tertiary-container text-on-tertiary font-extrabold flex items-center justify-center">${escapeHtml(getInitials(demos.MENTOR.name))}</div>
            <div class="min-w-0">
              <h4 class="text-base text-white font-bold truncate m-0">${escapeHtml(demos.MENTOR.name)}</h4>
              <span class="text-xs text-slate-400 truncate block">${escapeHtml(demos.MENTOR.sub)}</span>
            </div>
          </div>
          <div class="bg-[#1e1f26]/70 rounded-lg p-3 text-xs space-y-1.5">
            <div class="flex justify-between"><span class="text-slate-400">Email:</span><span class="font-mono text-slate-200">${escapeHtml(demos.MENTOR.email)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Ставка / Рейтинг:</span><span class="text-tertiary font-bold">${demos.MENTOR.rate} ₴ • ${escapeHtml(demos.MENTOR.meta)}</span></div>
          </div>
        </div>
        <button type="button" data-quick-role="MENTOR" ${isMentor ? 'disabled' : ''} class="mt-4 w-full py-2.5 rounded-xl font-display text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
          isMentor
            ? 'bg-[#292930] text-slate-400 cursor-not-allowed'
            : 'bg-tertiary text-on-tertiary hover:brightness-110 cursor-pointer'
        }">
          <span>${isMentor ? 'Поточна роль (Обрано)' : 'Увійти як Ментор →'}</span>
        </button>
      </div>

      <div class="relative bg-[#1a1b22]/90 rounded-xl p-6 flex flex-col justify-between border ${
        isHr ? 'border-secondary ring-1 ring-secondary/40 shadow-[0_0_20px_rgba(192,193,255,0.18)]' : 'border-[#292930]'
      }">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#292930] text-secondary">Корпоративний B2B</span>
            <span class="font-display text-[11px] uppercase text-slate-400">ROLE: HR_MANAGER</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-secondary to-secondary-container text-white font-extrabold flex items-center justify-center">${escapeHtml(getInitials(demos.HR.name))}</div>
            <div class="min-w-0">
              <h4 class="text-base text-white font-bold truncate m-0">${escapeHtml(demos.HR.name)}</h4>
              <span class="text-xs text-slate-400 truncate block">${escapeHtml(demos.HR.sub)}</span>
            </div>
          </div>
          <div class="bg-[#1e1f26]/70 rounded-lg p-3 text-xs space-y-1.5">
            <div class="flex justify-between"><span class="text-slate-400">Email:</span><span class="font-mono text-slate-200">${escapeHtml(demos.HR.email)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Команди / Штат:</span><span class="text-secondary font-bold">${demos.HR.teamsCount} ком. / ${escapeHtml(demos.HR.meta)}</span></div>
          </div>
        </div>
        <button type="button" data-quick-role="HR" ${isHr ? 'disabled' : ''} class="mt-4 w-full py-2.5 rounded-xl font-display text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${
          isHr
            ? 'bg-[#292930] text-slate-400 cursor-not-allowed'
            : 'bg-secondary-fixed-dim text-on-secondary hover:brightness-110 cursor-pointer'
        }">
          <span>${isHr ? 'Поточна роль (Обрано)' : 'Увійти як HR Lead →'}</span>
        </button>
      </div>
    `;
  }

  // Active Sessions Ledger table
  const ledger = $('activeSessionsTableBody');
  if (ledger) {
    const entries = [
      { id: 'current', device: 'Поточний браузер', ua: 'SkillTree Web UI', loc: 'Localhost • SHA-256', status: 'Зараз активний', current: true },
      { id: 'mobile', device: 'iOS PWA Client', ua: 'Mobile Session', loc: 'Kyiv, UA (Token)', status: '18 хв тому', current: false },
      { id: 'cli', device: 'REST API / Node Runner', ua: 'Automated Checks', loc: '127.0.0.1 (Local)', status: 'Сьогодні', current: false },
    ];
    const activeCount = entries.filter((e) => !state.revokedSessions.has(e.id)).length;
    if ($('onlineDevicesBadge')) $('onlineDevicesBadge').textContent = `${activeCount} сесії активні`;

    ledger.innerHTML = entries
      .map((entry) => {
        const revoked = state.revokedSessions.has(entry.id);
        return `
          <tr class="${revoked ? 'opacity-35' : ''}">
            <td class="py-3 px-3">
              <div class="font-semibold text-white">${escapeHtml(entry.device)}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(entry.ua)}</div>
            </td>
            <td class="py-3 px-3 text-slate-300">${escapeHtml(entry.loc)}</td>
            <td class="py-3 px-3">${entry.current ? '<span class="text-emerald-400 font-semibold">● Активний</span>' : escapeHtml(entry.status)}</td>
            <td class="py-3 px-3 text-right">
              ${
                entry.current
                  ? '<span class="px-2 py-0.5 rounded bg-[#1a1b22] text-slate-400 uppercase text-[10px]">Захищено</span>'
                  : revoked
                    ? '<span class="text-xs text-slate-500">Відкликано</span>'
                    : `<button type="button" data-revoke-session="${entry.id}" class="text-rose-400 hover:underline font-semibold cursor-pointer">Відкликати</button>`
              }
            </td>
          </tr>
        `;
      })
      .join('');
  }
}

function openEditProfileModal() {
  const user = state.data?.currentUser;
  if (!user) {
    showToast('Спочатку увійдіть в акаунт для редагування профілю.', true);
    return;
  }

  if ($('profFullName')) $('profFullName').value = user.fullName || '';
  const container = $('profRoleFields');
  if (container) {
    if (user.role === 'LEARNER') {
      const learner = (state.data.learners || []).find((l) => l.id === user.id) || user;
      container.innerHTML = `
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profTargetProfession">Цільова професія</label>
          <input id="profTargetProfession" type="text" list="professionList" value="${escapeHtml(learner.targetProfession || '')}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
        </div>
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profLevel">Поточний рівень</label>
          <select id="profLevel" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none">
            <option value="BEGINNER" ${learner.level === 'BEGINNER' ? 'selected' : ''}>BEGINNER</option>
            <option value="INTERMEDIATE" ${learner.level === 'INTERMEDIATE' ? 'selected' : ''}>INTERMEDIATE</option>
            <option value="ADVANCED" ${learner.level === 'ADVANCED' ? 'selected' : ''}>ADVANCED</option>
          </select>
        </div>
      `;
    } else if (user.role === 'MENTOR') {
      const mentor = (state.data.mentors || []).find((m) => m.id === user.id) || user;
      container.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-slate-300 block mb-1" for="profSpecialization">Спеціалізація</label>
            <input id="profSpecialization" type="text" value="${escapeHtml(mentor.specialization || '')}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1" for="profHourlyRate">Ставка (₴/год)</label>
            <input id="profHourlyRate" type="number" min="100" step="50" value="${Number(mentor.hourlyRate || 900)}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
          </div>
        </div>
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profBio">Про себе</label>
          <textarea id="profBio" rows="2" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none">${escapeHtml(mentor.bio || '')}</textarea>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profCompany">Компанія</label>
          <input id="profCompany" type="text" value="${escapeHtml(user.company || '')}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
        </div>
      `;
    }
  }
  openModal('editProfileModal');
}

// ============================================================================
// INTERACTIVE 3D KNOWLEDGE CONSTELLATION ENGINE (#constellation-canvas)
// ============================================================================
const constellation = {
  nodes: [],
  projected: [],
  yaw: 0.35,
  pitch: -0.18,
  zoom: 1,
  dragging: false,
  dragMoved: false,
  lastX: 0,
  lastY: 0,
  pulsePhase: 0,
  hoveredId: null,
};

function syncConstellationData(tree, activeNode) {
  if (!tree || !Array.isArray(tree.nodes)) {
    constellation.nodes = [];
    return;
  }
  const count = tree.nodes.length;
  constellation.nodes = tree.nodes.map((node, idx) => {
    const t = count > 1 ? idx / (count - 1) : 0.5;
    const angle = idx * 1.15 - 1.2;
    const radius = 115 + (idx % 2 === 0 ? 18 : -14);
    return {
      node,
      isSelected: activeNode && activeNode.id === node.id,
      x: Math.cos(angle) * radius,
      y: (t - 0.5) * 230,
      z: Math.sin(angle) * radius,
    };
  });
}

function resizeConstellationCanvas() {
  const canvas = $('constellation-canvas');
  const container = $('tree-container-3d');
  if (!canvas || !container) return;
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
}

function startConstellationLoop() {
  const canvas = $('constellation-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', (e) => {
    constellation.dragging = true;
    constellation.dragMoved = false;
    constellation.lastX = e.clientX;
    constellation.lastY = e.clientY;
    canvas.classList.add('cursor-grabbing');
  });

  window.addEventListener('mousemove', (e) => {
    if (!constellation.dragging) return;
    const dx = e.clientX - constellation.lastX;
    const dy = e.clientY - constellation.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) constellation.dragMoved = true;
    constellation.yaw += dx * 0.008;
    constellation.pitch = Math.max(-0.9, Math.min(0.9, constellation.pitch + dy * 0.006));
    constellation.lastX = e.clientX;
    constellation.lastY = e.clientY;
  });

  window.addEventListener('mouseup', () => {
    constellation.dragging = false;
    canvas.classList.remove('cursor-grabbing');
  });

  canvas.addEventListener('click', (e) => {
    if (constellation.dragMoved) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const clickX = (e.clientX - rect.left) * dpr;
    const clickY = (e.clientY - rect.top) * dpr;

    for (let i = constellation.projected.length - 1; i >= 0; i--) {
      const p = constellation.projected[i];
      if (Math.hypot(clickX - p.sx, clickY - p.sy) <= p.r * 1.45) {
        state.selectedNodeId = p.item.node.id;
        renderRoadmapPage();
        break;
      }
    }
  });

  resizeConstellationCanvas();
  window.addEventListener('resize', resizeConstellationCanvas);

  function frame() {
    requestAnimationFrame(frame);
    if (state.currentRoute !== '/roadmap' || state.skillViewMode !== '3d') return;
    if (!canvas.width || !canvas.height) resizeConstellationCanvas();

    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    constellation.pulsePhase += 0.035;
    if (!constellation.dragging) {
      constellation.yaw += 0.0022;
    }

    ctx.clearRect(0, 0, w, h);

    // Subtle deep space star dots
    ctx.fillStyle = 'rgba(167, 139, 250, 0.25)';
    for (let i = 0; i < 36; i++) {
      const sx = ((i * 197 + 41) % 100) * (w / 100);
      const sy = ((i * 313 + 73) % 100) * (h / 100);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    const cosY = Math.cos(constellation.yaw);
    const sinY = Math.sin(constellation.yaw);
    const cosX = Math.cos(constellation.pitch);
    const sinX = Math.sin(constellation.pitch);
    const fov = 560 * constellation.zoom;
    const scaleFactor = Math.min(w, h) / 520;

    const mapped = constellation.nodes.map((item) => {
      const x1 = item.x * cosY - item.z * sinY;
      const z1 = item.x * sinY + item.z * cosY;
      const y2 = item.y * cosX - z1 * sinX;
      const z2 = item.y * sinX + z1 * cosX;
      const depth = fov + z2 + 240;
      const persp = (fov / Math.max(120, depth)) * scaleFactor;
      return {
        item,
        sx: w / 2 + x1 * persp,
        sy: h / 2 + y2 * persp,
        z: z2,
        r: (item.isSelected ? 22 : 16) * persp,
      };
    });

    // Draw sequential glowing conduits before depth sorting nodes
    for (let i = 0; i < mapped.length - 1; i++) {
      const a = mapped[i];
      const b = mapped[i + 1];
      const doneLink = a.item.node.status === 'DONE';
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.lineWidth = doneLink ? 2.5 : 1.6;
      ctx.strokeStyle = doneLink ? 'rgba(16, 185, 129, 0.65)' : 'rgba(139, 92, 246, 0.45)';
      if (!doneLink) ctx.setLineDash([6, 6]);
      ctx.stroke();

      // Traveling energy pulse along active path
      const t = (constellation.pulsePhase * 0.45 + i * 0.27) % 1;
      const px = a.sx + (b.sx - a.sx) * t;
      const py = a.sy + (b.sy - a.sy) * t;
      ctx.setLineDash([]);
      ctx.fillStyle = doneLink ? '#34d399' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Depth sort back-to-front
    const sorted = [...mapped].sort((a, b) => a.z - b.z);
    constellation.projected = sorted;

    for (const p of sorted) {
      const st = p.item.node.status;
      const primaryColor = st === 'DONE' ? '#10b981' : st === 'IN_PROGRESS' ? '#06b6d4' : '#64748b';
      const glowColor = st === 'DONE' ? 'rgba(16,185,129,0.45)' : st === 'IN_PROGRESS' ? 'rgba(139,92,246,0.55)' : 'rgba(100,116,139,0.22)';

      // Outer halo
      const halo = ctx.createRadialGradient(p.sx, p.sy, p.r * 0.2, p.sx, p.sy, p.r * 2.1);
      halo.addColorStop(0, glowColor);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // Active focus reticle ring
      if (p.item.isSelected) {
        const ringRadius = p.r + 6 + Math.sin(constellation.pulsePhase * 2) * 2;
        ctx.strokeStyle = '#d0bcff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sphere fill
      ctx.fillStyle = st === 'DONE' ? '#064e3b' : st === 'IN_PROGRESS' ? '#1e1b4b' : '#181b2c';
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = p.item.isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Order number inside sphere
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(11, Math.round(p.r * 0.72))}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.item.node.orderNumber), p.sx, p.sy);

      // Node label pill below sphere
      const titleText = p.item.node.title.length > 26
        ? `${p.item.node.title.slice(0, 24)}…`
        : p.item.node.title;
      ctx.font = `600 12px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = p.item.isSelected ? '#7bd0ff' : '#cbd5e1';
      ctx.fillText(titleText, p.sx, p.sy + p.r + 16);
    }
  }

  requestAnimationFrame(frame);
}

// ============================================================================
// SCREEN 1: AUTH CANVAS PARTICLES & 3D CARD TILT
// ============================================================================
function startAuthEffects() {
  const canvas = $('antigravity-canvas');
  const card = $('interactive-card');
  const cursorGlow = $('cursor-glow');
  if (!canvas || !card) return;

  const ctx = canvas.getContext('2d');
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, targetX: 0, targetY: 0, active: false };
  const tilt = { cx: 0, cy: 0, tx: 0, ty: 0 };

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('mousemove', (e) => {
    if (state.currentRoute !== '/auth') return;
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
    mouse.active = true;
    if (cursorGlow) {
      cursorGlow.style.opacity = '1';
      cursorGlow.style.left = `${e.clientX}px`;
      cursorGlow.style.top = `${e.clientY}px`;
    }
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    const ox = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
    const oy = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
    tilt.ty = Math.max(-5, Math.min(5, ox * 5));
    tilt.tx = Math.max(-5, Math.min(5, -oy * 5));
  });

  window.addEventListener('mouseleave', () => {
    mouse.active = false;
    tilt.tx = 0;
    tilt.ty = 0;
    if (cursorGlow) cursorGlow.style.opacity = '0';
  });

  const palette = ['139, 92, 246', '56, 189, 248', '192, 132, 252', '255, 255, 255'];
  const particles = Array.from({ length: 65 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.8 + 0.6,
    vx: (Math.random() - 0.5) * 0.35,
    vy: -Math.random() * 0.4 - 0.15,
    alpha: Math.random() * 0.5 + 0.2,
    color: palette[Math.floor(Math.random() * palette.length)],
  }));

  function tick() {
    requestAnimationFrame(tick);
    if (state.currentRoute !== '/auth') return;

    tilt.cx += (tilt.tx - tilt.cx) * 0.1;
    tilt.cy += (tilt.ty - tilt.cy) * 0.1;
    card.style.transform = `rotateX(${tilt.cx.toFixed(2)}deg) rotateY(${tilt.cy.toFixed(2)}deg)`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) {
        p.y = canvas.height + 10;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;

      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < 85) {
          ctx.strokeStyle = `rgba(167, 139, 250, ${(1 - dist / 85) * 0.14})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
  }
  requestAnimationFrame(tick);
}

// ============================================================================
// EVENTS BINDING
// ============================================================================
function bindEvents() {
  // SPA Client-Side Routing & Close Popovers
  document.addEventListener('click', (e) => {
    const closeModalBtn = e.target.closest('[data-close-modal]');
    if (closeModalBtn) {
      closeModal(closeModalBtn.getAttribute('data-close-modal'));
      return;
    }

    const routeEl = e.target.closest('[data-route]');
    if (routeEl) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigateTo(routeEl.getAttribute('data-route'));
      return;
    }

    const quickRoleBtn = e.target.closest('[data-quick-role]');
    if (quickRoleBtn) {
      quickSwitchRole(quickRoleBtn.getAttribute('data-quick-role'), true);
      return;
    }

    const authDemoBtn = e.target.closest('[data-auth-demo]');
    if (authDemoBtn) {
      const role = authDemoBtn.getAttribute('data-auth-demo');
      const demos = getDemoAccounts();
      const target = demos[role];
      if (target) {
        if ($('input-email')) $('input-email').value = target.email;
        if ($('input-password')) $('input-password').value = 'demo1234';
        quickSwitchRole(role, true);
      }
      return;
    }

    // Outside click for Dropdowns
    if (!e.target.closest('#userProfileDropdownContainer')) {
      $('userProfileDropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#teamDropdownBtn') && !e.target.closest('#teamDropdownMenu')) {
      $('teamDropdownMenu')?.classList.add('hidden');
    }
  });

  window.addEventListener('popstate', () => {
    navigateTo(window.location.pathname, false);
  });

  // Mobile sidebar toggle
  $('mobileSidebarBtn')?.addEventListener('click', () => {
    $('dashboard-sidebar')?.classList.toggle('open');
    $('mobileSidebarBackdrop')?.classList.toggle('hidden');
  });
  $('mobileSidebarBackdrop')?.addEventListener('click', () => {
    $('dashboard-sidebar')?.classList.remove('open');
    $('mobileSidebarBackdrop')?.classList.add('hidden');
  });

  // Top Header Dropdown
  $('userProfileMenuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('userProfileDropdown')?.classList.toggle('hidden');
  });
  $('dropdownEditProfileBtn')?.addEventListener('click', () => {
    $('userProfileDropdown')?.classList.add('hidden');
    openEditProfileModal();
  });

  // Global Search Input
  $('globalSearchInput')?.addEventListener('input', (e) => {
    state.globalSearch = e.target.value;
    if (state.currentRoute === '/mentors') renderMentorsPage();
    else if (state.currentRoute === '/b2b') renderB2bPage();
    else renderRoadmapPage();
  });

  // Screen 1 Auth Controls
  $('tab-login')?.addEventListener('click', () => setAuthTab('login'));
  $('tab-register')?.addEventListener('click', () => setAuthTab('register'));
  document.querySelectorAll('[data-select-role]').forEach((btn) => {
    btn.addEventListener('click', () => selectRegisterRole(btn.getAttribute('data-select-role')));
  });
  $('togglePasswordBtn')?.addEventListener('click', () => {
    const inp = $('input-password');
    const icon = $('togglePasswordBtn')?.querySelector('.material-symbols-outlined');
    if (inp) {
      const nextType = inp.type === 'password' ? 'text' : 'password';
      inp.type = nextType;
      if (icon) icon.textContent = nextType === 'text' ? 'visibility_off' : 'visibility';
    }
  });
  $('forgotPasswordLink')?.addEventListener('click', () => openModal('resetPasswordModal'));
  $('inlineResetPwdBtn')?.addEventListener('click', () => openModal('resetPasswordModal'));
  $('googleOAuthBtn')?.addEventListener('click', () => quickSwitchRole('LEARNER', true));

  $('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = $('input-email').value.trim();
      const password = $('input-password').value;
      if (state.authMode === 'register') {
        const role = state.registerRole;
        const extra = $('input-extra')?.value.trim() || '';
        const body = {
          fullName: $('input-fullname').value.trim(),
          email,
          password,
          role,
        };
        if (role === 'MENTOR' && extra) body.specialization = extra;
        if (role === 'HR' && extra) body.company = extra;
        if (role === 'LEARNER' && extra) body.targetProfession = extra;

        const res = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
        state.data = res.state;
        state.selectedTreeId = null;
        state.selectedNodeId = null;
        renderAll();
        navigateTo(role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap');
        showToast(`Акаунт створено! Вітаємо, ${res.user.fullName}.`);
      } else {
        const res = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        state.data = res.state;
        state.selectedTreeId = null;
        state.selectedNodeId = null;
        renderAll();
        const role = res.user.role;
        navigateTo(role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap');
        showToast(`Вітаємо, ${res.user.fullName}!`);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('inlineLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('inlineLoginEmail').value.trim(),
          password: $('inlineLoginPassword').value,
        }),
      });
      state.data = res.state;
      state.selectedTreeId = null;
      state.selectedNodeId = null;
      renderAll();
      showToast(`Увійшли як ${res.user.fullName}`);
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
      closeModal('resetPasswordModal');
      showToast('Пароль оновлено. Можете увійти з новим паролем.');
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
      navigateTo('/auth');
      showToast('Ви вийшли з облікового запису.');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  $('headerLogoutBtn')?.addEventListener('click', handleLogout);
  $('profileLogoutBtn')?.addEventListener('click', handleLogout);

  // Screen 2: Roadmap Interactions
  $('treeSelect')?.addEventListener('change', (e) => {
    state.selectedTreeId = Number(e.target.value);
    state.selectedNodeId = null;
    renderRoadmapPage();
  });

  $('view-mode-3d')?.addEventListener('click', () => {
    state.skillViewMode = '3d';
    $('tree-container-3d')?.classList.remove('hidden');
    $('tree-container-2d')?.classList.add('hidden');
    $('view-mode-3d').className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-display text-xs font-semibold transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]';
    $('view-mode-2d').className = 'flex items-center gap-1.5 px-3 py-1 rounded-full text-slate-400 hover:text-white font-display text-xs font-medium transition-all';
    requestAnimationFrame(() => resizeConstellationCanvas());
  });

  $('view-mode-2d')?.addEventListener('click', () => {
    state.skillViewMode = '2d';
    $('tree-container-3d')?.classList.add('hidden');
    $('tree-container-2d')?.classList.remove('hidden');
    $('view-mode-2d').className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-display text-xs font-semibold transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]';
    $('view-mode-3d').className = 'flex items-center gap-1.5 px-3 py-1 rounded-full text-slate-400 hover:text-white font-display text-xs font-medium transition-all';
  });

  $('reset3dViewBtn')?.addEventListener('click', () => {
    constellation.yaw = 0.35;
    constellation.pitch = -0.18;
    constellation.zoom = 1;
  });

  $('focus3dNodeBtn')?.addEventListener('click', () => {
    const idx = constellation.nodes.findIndex((n) => n.isSelected);
    if (idx !== -1) {
      constellation.yaw = -(idx * 1.15 - 1.2);
      constellation.pitch = 0;
    }
  });

  $('fullscreen3dBtn')?.addEventListener('click', () => {
    const el = $('tree-container-3d');
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  $('tree-container-2d')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-select-node]');
    if (!card) return;
    state.selectedNodeId = Number(card.getAttribute('data-select-node'));
    renderRoadmapPage();
  });

  $('openWizardBtn')?.addEventListener('click', () => openModal('wizardModal'));
  $('openAddNodeBtn')?.addEventListener('click', () => openModal('addNodeModal'));

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
        }),
      });
      state.data = res.state;
      state.selectedTreeId = res.tree.id;
      state.selectedNodeId = res.tree.nodes[0]?.id || null;
      closeModal('wizardModal');
      $('wizardForm').reset();
      renderAll();
      showToast(`Карту «${res.tree.targetProfession}» згенеровано!`);
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
      showToast(`Вузол «${res.node.title}» додано!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('deleteNodeBtn')?.addEventListener('click', async () => {
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if (!tree || !node) return;
    try {
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}`, { method: 'DELETE' });
      state.data = res.state;
      state.selectedNodeId = null;
      renderAll();
      showToast('Вузол видалено з карти.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('nodeActionButtons')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-node-status]');
    if (!btn) return;
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if (!tree || !node) return;
    try {
      const targetStatus = btn.getAttribute('data-node-status');
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: targetStatus === 'IN_PROGRESS' ? 'start' : 'complete',
          status: targetStatus,
        }),
      });
      state.data = res.state;
      renderAll();
      showToast('Статус вузла оновлено!');
    } catch (err) {
      showToast(err.message, true);
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
      const res = await api(`/api/trees/${tree.id}/nodes/${node.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ question }),
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
    const msgId = Number(btn.getAttribute('data-rate-msg'));
    const helpful = btn.getAttribute('data-helpful') === 'true';
    try {
      const res = await api(`/api/chat/${msgId}/rate`, {
        method: 'PATCH',
        body: JSON.stringify({ helpful }),
      });
      state.data = res.state;
      renderAll();
      showToast('Оцінку відповіді ШІ збережено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Screen 3: Mentors & Drawer
  $('mentorSearchInput')?.addEventListener('input', (e) => {
    state.mentorSearch = e.target.value;
    renderMentorsPage();
  });
  $('sortSelect')?.addEventListener('change', (e) => {
    state.mentorSort = e.target.value;
    renderMentorsPage();
  });
  document.querySelectorAll('.chip-filter[data-spec]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip-filter[data-spec]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.mentorSpec = chip.getAttribute('data-spec') || 'ALL';
      renderMentorsPage();
    });
  });

  $('mentorsDirectoryGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-book-mentor]');
    if (!btn) return;
    openBookingDrawer(Number(btn.getAttribute('data-book-mentor')));
  });

  $('closeBookingDrawerBtn')?.addEventListener('click', closeBookingDrawer);
  $('closePaymentSuccessBtn')?.addEventListener('click', closeBookingDrawer);
  $('bookingDrawerOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('bookingDrawerOverlay')) closeBookingDrawer();
  });
  $('bookingDuration')?.addEventListener('change', updateBookingPrice);

  document.querySelectorAll('.pay-method-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method-btn').forEach((b) => {
        b.classList.remove('bg-purple-950/80', 'border-purple-500/50', 'text-white');
        b.classList.add('bg-[#141829]', 'border-purple-500/20', 'text-slate-300');
      });
      btn.classList.add('bg-purple-950/80', 'border-purple-500/50', 'text-white');
      btn.classList.remove('bg-[#141829]', 'border-purple-500/20', 'text-slate-300');
      state.paymentMethod = btn.getAttribute('data-pay-method') || 'CARD';
    });
  });

  $('confirmPaymentBtn')?.addEventListener('click', async () => {
    const learner = getActiveLearner();
    if (!learner || !state.bookingMentorId) return;
    try {
      const durationMin = Number($('bookingDuration').value || 60);
      const bookRes = await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: learner.id,
          mentorId: state.bookingMentorId,
          topic: $('bookingTopicInput').value.trim() || 'Індивідуальна менторська сесія',
          startAt: new Date($('bookingStartAt').value).toISOString(),
          durationMin,
          durationMinutes: durationMin,
        }),
      });
      const payRes = await api(`/api/sessions/${bookRes.session.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ method: state.paymentMethod }),
      });
      state.data = payRes.state;
      renderAll();
      if ($('paymentTxnId')) {
        $('paymentTxnId').textContent = `Транзакція ${payRes.receipt?.transactionId || 'PAID'}`;
      }
      $('paymentSuccessToast')?.classList.remove('hidden');
      showToast('Сесію заброньовано та оплачено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('learnerSessionsList')?.addEventListener('click', async (e) => {
    const payBtn = e.target.closest('[data-pay-session]');
    if (payBtn) {
      const id = Number(payBtn.getAttribute('data-pay-session'));
      try {
        const res = await api(`/api/sessions/${id}/pay`, { method: 'POST', body: '{}' });
        state.data = res.state;
        renderAll();
        showToast(`Оплата підтверджена! Чек ${res.receipt?.transactionId || ''}`);
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const receiptBtn = e.target.closest('[data-view-receipt]');
    if (receiptBtn) {
      const id = Number(receiptBtn.getAttribute('data-view-receipt'));
      const receipt = (state.data.receipts || []).find((r) => r.sessionId === id);
      const session = (state.data.sessions || []).find((s) => s.id === id);
      if ($('receiptBody')) {
        $('receiptBody').innerHTML = receipt
          ? `
            <div><strong>Транзакція:</strong> <code class="text-cyan-300">${escapeHtml(receipt.transactionId)}</code></div>
            <div><strong>Сесія:</strong> #${receipt.sessionId} (${escapeHtml(session?.topic || '')})</div>
            <div><strong>Сума:</strong> ${receipt.amount} ${escapeHtml(receipt.currency)}</div>
            <div><strong>Статус:</strong> ${escapeHtml(receipt.status)}</div>
            <div><strong>Дата:</strong> ${new Date(receipt.processedAt).toLocaleString('uk-UA')}</div>
          `
          : `<div>Сесія #${id} оплачена (${session?.price || 0} ₴).</div>`;
      }
      openModal('receiptModal');
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

  $('learnerSessionsList')?.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-feedback-form]');
    if (!form) return;
    e.preventDefault();
    const id = Number(form.getAttribute('data-feedback-form'));
    try {
      const res = await api(`/api/sessions/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating: Number(form.elements.rating.value),
          feedback: form.elements.comment.value.trim(),
          comment: form.elements.comment.value.trim(),
        }),
      });
      state.data = res.state;
      renderAll();
      showToast('Оцінку та відгук збережено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Screen 4: Mentor Cabinet
  $('switchToMentorQuickBtn')?.addEventListener('click', () => quickSwitchRole('MENTOR', false));
  $('openModalBtn')?.addEventListener('click', () => openModal('addMaterialModal'));
  $('addMaterialShortcutBtn')?.addEventListener('click', () => openModal('addMaterialModal'));
  $('closeModalBtn')?.addEventListener('click', () => closeModal('addMaterialModal'));
  $('cancelModalBtn')?.addEventListener('click', () => closeModal('addMaterialModal'));

  $('materialForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = Number($('mentorNodeSelect').value);
    const type = document.querySelector('input[name="mat_type"]:checked')?.value || 'TEXT';
    if (!nodeId) return;
    try {
      const res = await api(`/api/nodes/${nodeId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          mentorId: state.data.currentUser?.id,
          title: $('materialTitle').value.trim(),
          type,
          url: $('materialUrl').value.trim(),
          description: $('materialDesc').value.trim(),
          content: $('materialContent').value.trim(),
        }),
      });
      state.data = res.state;
      closeModal('addMaterialModal');
      $('materialForm').reset();
      renderAll();
      showToast('Матеріал опубліковано у вузол!');
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

  // Screen 5: B2B Skill Matrix
  $('teamDropdownBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('teamDropdownMenu')?.classList.toggle('hidden');
  });
  $('teamDropdownMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-select-team]');
    if (!btn) return;
    state.selectedTeamId = Number(btn.getAttribute('data-select-team'));
    $('teamDropdownMenu')?.classList.add('hidden');
    renderB2bPage();
  });

  $('openCreateTeamBtn')?.addEventListener('click', () => openModal('createTeamModal'));
  $('openAssignModalBtn')?.addEventListener('click', () => openAssignModal());
  $('quickAssignRecommendationBtn')?.addEventListener('click', () => openAssignModal());
  $('closeAssignModalBtn')?.addEventListener('click', closeAssignModal);
  $('cancelAssignBtn')?.addEventListener('click', closeAssignModal);
  $('assignModalBackdrop')?.addEventListener('click', (e) => {
    if (e.target === $('assignModalBackdrop')) closeAssignModal();
  });

  $('hrMembersTableBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-assign-learner]');
    if (!btn) return;
    openAssignModal(Number(btn.getAttribute('data-assign-learner')));
  });

  $('assignTreeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/hr/assign-tree', {
        method: 'POST',
        body: JSON.stringify({
          learnerId: Number($('hrLearnerSelect').value),
          profession: $('roadmapSelect').value.trim(),
          level: $('hrAssignLevel').value,
        }),
      });
      state.data = res.state;
      closeAssignModal();
      renderAll();
      showToast('Карту розвитку призначено співробітнику!');
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
        body: JSON.stringify({ name: $('newTeamName').value.trim(), hrManagerId }),
      });
      state.data = res.state;
      state.selectedTeamId = res.team.id;
      $('newTeamName').value = '';
      closeModal('createTeamModal');
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
      closeModal('createTeamModal');
      renderAll();
      showToast('Учасника додано до команди.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  const downloadCsv = async () => {
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
      showToast('CSV-звіт сформовано (RFC-4180 + UTF-8 BOM).');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  $('exportCsvBtn')?.addEventListener('click', downloadCsv);
  $('downloadCsvSecondaryBtn')?.addEventListener('click', downloadCsv);

  $('previewCsvBtn')?.addEventListener('click', async () => {
    if (!state.selectedTeamId) return;
    try {
      const csvText = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      if ($('csvPreviewContent')) $('csvPreviewContent').textContent = csvText;
      openModal('csvPreviewModal');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Screen 6: Profile Edit & Sessions
  $('openEditProfileBtn')?.addEventListener('click', openEditProfileModal);

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
      const res = await api('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
      state.data = res.state;
      closeModal('editProfileModal');
      renderAll();
      showToast('Дані профілю оновлено!');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('profilePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = state.data?.currentUser;
    if (!user) return;
    const p1 = $('profileNewPassword').value;
    const p2 = $('profileConfirmPassword').value;
    if (p1 !== p2) {
      showToast('Паролі не співпадають.', true);
      return;
    }
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: user.email, newPassword: p1 }),
      });
      $('profilePasswordForm').reset();
      closeModal('editProfileModal');
      showToast('Пароль успішно змінено.');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $('activeSessionsTableBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-revoke-session]');
    if (!btn) return;
    state.revokedSessions.add(btn.getAttribute('data-revoke-session'));
    renderProfilePage();
    showToast('Сесію відкликано.');
  });

  $('revokeOtherBtn')?.addEventListener('click', () => {
    state.revokedSessions.add('mobile');
    state.revokedSessions.add('cli');
    renderProfilePage();
    showToast('Усі сторонні сесії завершено.');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    [
      'wizardModal',
      'addNodeModal',
      'materialModal',
      'addMaterialModal',
      'createTeamModal',
      'editProfileModal',
      'resetPasswordModal',
      'receiptModal',
      'csvPreviewModal',
    ].forEach(closeModal);
    closeBookingDrawer();
    closeAssignModal();
  });
}

async function init() {
  setAuthTab('login');
  selectRegisterRole('LEARNER');
  bindEvents();
  startAuthEffects();
  startConstellationLoop();
  navigateTo(window.location.pathname, false);
  try {
    await loadState();
  } catch (err) {
    showToast(`Не вдалося завантажити дані: ${err.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', init);
