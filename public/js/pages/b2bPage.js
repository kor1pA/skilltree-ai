import { getCurrentUser, state } from '../core/state.js';
import {
  $,
  closeModal,
  escapeHtml,
  getInitials,
  getLevelLabel,
  openModal,
  renderRoleGateCard,
  showToast,
} from '../core/dom.js';
import { api, mutateAndSync } from '../core/api.js';

export function openAssignModal(learnerId) {
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

export function closeAssignModal() {
  const backdrop = $('assignModalBackdrop');
  const panel = $('assignModalPanel');
  panel?.classList.add('translate-x-full');
  setTimeout(() => {
    backdrop?.classList.add('hidden');
  }, 260);
}

export function renderB2bPage() {
  const currentUser = getCurrentUser();
  const gate = $('b2bGateNotice');
  const workspace = $('b2bWorkspaceContent');

  if (!currentUser || currentUser.role !== 'HR') {
    workspace?.classList.add('hidden');
    if (gate) {
      gate.classList.remove('hidden');
      const roleDest = currentUser?.role === 'MENTOR' ? '/mentor-cabinet' : '/roadmap';
      gate.innerHTML = currentUser
        ? renderRoleGateCard({
            icon: 'grid_view',
            title: 'B2B Skill Matrix доступний лише для ролі HR / TeamLead',
            description:
              'Керування командами, призначення корпоративних планів та експорт CSV-звітів доступні в кабінеті HR-менеджера.',
            primaryHref: roleDest,
            primaryLabel: 'Повернутися в кабінет',
            secondaryHref: '/auth',
            secondaryLabel: 'Увійти як HR-менеджер',
          })
        : renderRoleGateCard({
            icon: 'corporate_fare',
            title: 'Увійдіть як HR-менеджер для доступу до B2B Skill Matrix',
            description:
              'Створіть обліковий запис із роллю HR / TeamLead, формуйте команди та експортуйте аналітику компетенцій у CSV.',
            primaryHref: '/auth',
            primaryLabel: 'Увійти / Зареєструватися',
            secondaryHref: '/mentors',
            secondaryLabel: 'Каталог менторів',
          });
    }
    return;
  }

  gate?.classList.add('hidden');
  workspace?.classList.remove('hidden');

  const teams = state.data?.teams || [];
  const learners = state.data?.learners || [];
  const professions = state.data?.professions || [];

  if (!teams.some((t) => t.id === state.selectedTeamId)) {
    state.selectedTeamId = teams.length > 0 ? teams[0].id : null;
  }
  const team = teams.find((t) => t.id === state.selectedTeamId) || null;

  if ($('professionList')) {
    $('professionList').innerHTML = professions
      .map((p) => `<option value="${escapeHtml(p)}"></option>`)
      .join('');
  }

  const learnerOpts = learners.length
    ? learners
        .map(
          (l) =>
            `<option value="${l.id}" class="bg-[#121422]">${escapeHtml(l.fullName)} (${escapeHtml(l.targetProfession)})</option>`
        )
        .join('')
    : '<option value="" disabled>Зареєстрованих студентів поки немає</option>';
  if ($('hrLearnerSelect')) $('hrLearnerSelect').innerHTML = learnerOpts;
  if ($('addMemberLearnerSelect')) $('addMemberLearnerSelect').innerHTML = learnerOpts;

  const menu = $('teamDropdownMenu');
  if (menu) {
    menu.innerHTML = teams.length
      ? teams
          .map(
            (t) => `
          <button type="button" data-select-team="${t.id}" class="w-full text-left px-4 py-2.5 hover:bg-[#34343b] flex items-center justify-between text-xs text-white transition-colors cursor-pointer">
            <span>${escapeHtml(t.name)}</span>
            <span class="font-mono text-cyan-300">${t.memberIds.length} чол.</span>
          </button>
        `
          )
          .join('')
      : '<div class="px-4 py-2.5 text-xs text-slate-400">Команд ще не створено</div>';
  }

  if (!team) {
    if ($('currentTeamLabel')) $('currentTeamLabel').textContent = 'Створіть першу команду';
    if ($('b2bAvgProgress')) $('b2bAvgProgress').textContent = '0%';
    if ($('b2bAvgProgressBar')) $('b2bAvgProgressBar').style.width = '0%';
    if ($('b2bSkillGapsCount')) $('b2bSkillGapsCount').textContent = '0';
    if ($('b2bSkillGapChips')) {
      $('b2bSkillGapChips').innerHTML =
        '<span class="text-xs text-slate-400">Немає активної команди</span>';
    }
    if ($('b2bNodesPassed')) $('b2bNodesPassed').textContent = '0';
    if ($('b2bActivePlans')) $('b2bActivePlans').textContent = '0';
    if ($('hrMembersTableBody')) {
      $('hrMembersTableBody').innerHTML =
        '<tr><td colspan="6" class="py-6 px-5 text-center text-slate-400">Натисніть «+ Команда / Учасник», щоб створити першу команду та додати співробітників.</td></tr>';
    }
    if ($('b2bBalanceBars')) {
      $('b2bBalanceBars').innerHTML = '<p class="text-xs text-slate-400">Немає даних профілів.</p>';
    }
    if ($('b2bAiInsightText')) {
      $('b2bAiInsightText').textContent =
        'AI Insight: Створіть команду та додайте працівників для аналізу прогалин компетенцій.';
    }
    return;
  }

  if ($('currentTeamLabel')) {
    $('currentTeamLabel').textContent = `${team.name} (${team.memberIds.length} працівників)`;
  }

  const matrix = team.detailedMatrix || {
    professionAverages: team.skillMatrix || {},
    skillNodeAverages: {},
    members: [],
    teamAverageProgress: 0,
  };

  if ($('b2bAvgProgress')) {
    $('b2bAvgProgress').textContent = `${Number(matrix.teamAverageProgress || 0).toFixed(0)}%`;
  }
  if ($('b2bAvgProgressBar')) {
    $('b2bAvgProgressBar').style.width = `${Number(matrix.teamAverageProgress || 0)}%`;
  }

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
                  <div class="text-[11px] text-slate-400">${escapeHtml(getLevelLabel(m.level))}</div>
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
                    + Призначити карту
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
      ? `AI Insight: Рекомендовано підсилити модулі «${gaps[0][0]}» (${gaps[0][1]}% прогресу) за допомогою персонального плану розвитку.`
      : 'AI Insight: Баланс навичок команди стабільний — критичних відставань не виявлено.';
  }
}

export function bindB2bEvents({ renderActiveView }) {
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
    const learnerId = Number($('hrLearnerSelect')?.value);
    if (!learnerId) {
      showToast('Оберіть співробітника для призначення карти.', true);
      return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    const payload = {
      learnerId,
      profession: $('roadmapSelect')?.value.trim(),
      level: $('hrAssignLevel')?.value,
    };
    if (state.selectedTeamId) {
      payload.teamId = state.selectedTeamId;
    }

    await mutateAndSync(
      '/api/hr/assign-tree',
      { method: 'POST', body: JSON.stringify(payload) },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => closeAssignModal(),
        successMessage: 'Карту розвитку призначено співробітнику!',
      }
    );
  });

  $('createTeamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await mutateAndSync(
      '/api/teams',
      {
        method: 'POST',
        body: JSON.stringify({ name: $('newTeamName')?.value.trim() }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: (res) => {
          state.selectedTeamId = res.team.id;
          if ($('newTeamName')) $('newTeamName').value = '';
          closeModal('createTeamModal');
        },
        successMessage: (res) => `Команду «${res.team.name}» створено.`,
      }
    );
  });

  $('addTeamMemberForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedTeamId) {
      showToast('Спочатку створіть або оберіть команду.', true);
      return;
    }
    const learnerId = Number($('addMemberLearnerSelect')?.value);
    if (!learnerId) return;
    const btn = e.target.querySelector('button[type="submit"]');

    await mutateAndSync(
      `/api/teams/${state.selectedTeamId}/members`,
      { method: 'POST', body: JSON.stringify({ learnerId }) },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => closeModal('createTeamModal'),
        successMessage: 'Учасника додано до команди.',
      }
    );
  });

  const downloadCsv = async () => {
    if (!state.selectedTeamId) {
      showToast('Спочатку створіть команду для експорту звіту.', true);
      return;
    }
    try {
      const csvText = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      const bomSafeCsv = csvText.startsWith('\uFEFF') ? csvText : `\uFEFF${csvText}`;
      const blob = new Blob([bomSafeCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skilltree-team-${state.selectedTeamId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV-звіт успішно завантажено.');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  $('exportCsvBtn')?.addEventListener('click', downloadCsv);
  $('downloadCsvSecondaryBtn')?.addEventListener('click', downloadCsv);

  $('previewCsvBtn')?.addEventListener('click', async () => {
    if (!state.selectedTeamId) {
      showToast('Спочатку створіть команду для перегляду звіту.', true);
      return;
    }
    try {
      const csvText = await api(`/api/teams/${state.selectedTeamId}/export?format=CSV`);
      if ($('csvPreviewContent')) $('csvPreviewContent').textContent = csvText;
      openModal('csvPreviewModal');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
