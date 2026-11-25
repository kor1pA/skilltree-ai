import {
  getActiveLearner,
  getActiveNode,
  getActiveTree,
  getCurrentUser,
  state,
} from '../core/state.js';
import {
  $,
  closeModal,
  escapeHtml,
  getInitials,
  getRoleLabel,
  openModal,
  renderRoleGateCard,
  showToast,
} from '../core/dom.js';
import { mutateAndSync } from '../core/api.js';

export function openEditProfileModal() {
  const user = getCurrentUser();
  if (!user) {
    showToast('Спочатку увійдіть в акаунт для редагування профілю.', true);
    return;
  }

  if ($('profFullName')) $('profFullName').value = user.fullName || '';
  const container = $('profRoleFields');
  if (container) {
    if (user.role === 'LEARNER') {
      const learner = getActiveLearner() || user;
      container.innerHTML = `
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profTargetProfession">Цільова професія</label>
          <input id="profTargetProfession" type="text" list="professionList" value="${escapeHtml(learner.targetProfession || '')}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
        </div>
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profLevel">Поточний рівень</label>
          <select id="profLevel" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none">
            <option value="BEGINNER" ${learner.level === 'BEGINNER' ? 'selected' : ''}>Початковий</option>
            <option value="INTERMEDIATE" ${learner.level === 'INTERMEDIATE' ? 'selected' : ''}>Середній</option>
            <option value="ADVANCED" ${learner.level === 'ADVANCED' ? 'selected' : ''}>Просунутий</option>
          </select>
        </div>
      `;
    } else if (user.role === 'MENTOR') {
      container.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-slate-300 block mb-1" for="profSpecialization">Спеціалізація</label>
            <input id="profSpecialization" type="text" value="${escapeHtml(user.specialization || '')}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1" for="profHourlyRate">Ставка (₴/год)</label>
            <input id="profHourlyRate" type="number" min="100" step="50" value="${Number(user.hourlyRate || 900)}" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none" />
          </div>
        </div>
        <div>
          <label class="text-xs text-slate-300 block mb-1" for="profBio">Про себе</label>
          <textarea id="profBio" rows="2" class="w-full px-3.5 py-2 bg-[#0e101a] border border-[#2b314e] text-white rounded-xl text-sm outline-none">${escapeHtml(user.bio || '')}</textarea>
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

export function renderProfilePage() {
  const currentUser = getCurrentUser();
  const guestNotice = $('profileGuestNotice');
  const heroCard = $('profileHeroCard');
  const sessionsLedger = $('profileSessionsCard');

  if (!currentUser) {
    heroCard?.classList.add('hidden');
    sessionsLedger?.classList.add('hidden');
    $('revokeOtherBtn')?.classList.add('hidden');
    if (guestNotice) {
      guestNotice.classList.remove('hidden');
      guestNotice.innerHTML = renderRoleGateCard({
        icon: 'badge',
        title: 'Авторизуйтеся для управління профілем і сесіями',
        description:
          'Увійдіть або створіть акаунт — ви зможете редагувати дані, безпечно змінювати пароль і контролювати активні сесії на ваших пристроях.',
        primaryHref: '/auth',
        primaryLabel: 'Увійти / Реєстрація',
        secondaryHref: '/mentors',
        secondaryLabel: 'Каталог менторів',
      });
    }
    return;
  }

  guestNotice?.classList.add('hidden');
  heroCard?.classList.remove('hidden');
  sessionsLedger?.classList.remove('hidden');
  $('revokeOtherBtn')?.classList.remove('hidden');

  if ($('profileHeroAvatar')) $('profileHeroAvatar').textContent = getInitials(currentUser.fullName);
  if ($('profileHeroRole')) $('profileHeroRole').textContent = getRoleLabel(currentUser.role);
  if ($('profileHeroId')) $('profileHeroId').textContent = `ID: #${currentUser.id}`;
  if ($('profileHeroName')) $('profileHeroName').textContent = currentUser.fullName;
  if ($('profileHeroHandle')) $('profileHeroHandle').textContent = `(${currentUser.email})`;

  const wsLink = $('profileWorkspaceLink');
  if (wsLink) {
    const dest =
      currentUser.role === 'MENTOR'
        ? '/mentor-cabinet'
        : currentUser.role === 'HR'
          ? '/b2b'
          : '/roadmap';
    wsLink.href = dest;
    wsLink.setAttribute('data-route', dest);
  }

  if (currentUser.role === 'MENTOR') {
    if ($('profileHeroTrack')) {
      $('profileHeroTrack').textContent = `Спеціалізація: ${currentUser.specialization}`;
    }
    if ($('profileHeroNode')) {
      $('profileHeroNode').textContent = `Рейтинг: ★ ${currentUser.rating} • ${currentUser.hourlyRate} ₴/год`;
    }
  } else if (currentUser.role === 'HR') {
    if ($('profileHeroTrack')) $('profileHeroTrack').textContent = `Компанія: ${currentUser.company}`;
    if ($('profileHeroNode')) {
      $('profileHeroNode').textContent = `Команд: ${(state.data?.teams || []).length}`;
    }
  } else {
    const learner = getActiveLearner();
    const tree = getActiveTree(learner);
    const node = getActiveNode(tree);
    if ($('profileHeroTrack')) {
      $('profileHeroTrack').textContent = `Трек: ${tree?.targetProfession || 'Не обрано'}`;
    }
    if ($('profileHeroNode')) {
      $('profileHeroNode').textContent = `Фокус: ${node ? `#${node.orderNumber} ${node.title}` : 'Оберіть вузол'}`;
    }
  }

  if ($('profileSessionStatusText')) {
    $('profileSessionStatusText').textContent = 'Активна сесія';
  }

  // Активні сесії користувача
  const authSessions = state.data?.authSessions || [];
  if ($('onlineDevicesBadge')) {
    $('onlineDevicesBadge').textContent = `${authSessions.length} активн.`;
  }

  const ledger = $('activeSessionsTableBody');
  if (ledger) {
    ledger.innerHTML = authSessions.length
      ? authSessions
          .map(
            (entry) => `
          <tr>
            <td class="py-3 px-3">
              <div class="font-semibold text-white">${escapeHtml(entry.deviceLabel)}</div>
              <div class="text-[11px] text-slate-400 truncate max-w-[220px]">${escapeHtml(entry.userAgent)}</div>
            </td>
            <td class="py-3 px-3 font-mono text-slate-300">${escapeHtml(entry.ipAddress)}</td>
            <td class="py-3 px-3">
              ${
                entry.isCurrent
                  ? '<span class="text-emerald-400 font-semibold">● Поточна</span>'
                  : `<span class="text-slate-300">${new Date(entry.lastSeenAt).toLocaleString('uk-UA')}</span>`
              }
            </td>
            <td class="py-3 px-3 text-right">
              ${
                entry.isCurrent
                  ? '<span class="px-2 py-0.5 rounded bg-[#1a1b22] text-slate-400 uppercase text-[10px]">Захищено</span>'
                  : `<button type="button" data-revoke-session="${escapeHtml(entry.id)}" class="text-rose-400 hover:underline font-semibold cursor-pointer">Відкликати</button>`
              }
            </td>
          </tr>
        `
          )
          .join('')
      : '<tr><td colspan="4" class="py-4 px-3 text-center text-slate-400">Активні сесії відсутні.</td></tr>';
  }
}

export function bindProfileEvents({ navigateTo, renderActiveView }) {
  $('openEditProfileBtn')?.addEventListener('click', openEditProfileModal);

  $('inlineResetPwdBtn')?.addEventListener('click', () => {
    showToast('Зміна пароля доступна в налаштуваннях безпеки після входу в акаунт.');
  });

  $('inlineLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await mutateAndSync(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: $('inlineLoginEmail')?.value.trim(),
          password: $('inlineLoginPassword')?.value,
          rememberMe: true,
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: (res) => {
          state.selectedTreeId = null;
          state.selectedNodeId = null;
          $('inlineLoginForm')?.reset();
          const role = res.user.role;
          navigateTo(role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap');
          showToast(`Увійшли як ${res.user.fullName}`);
        },
      }
    );
  });

  $('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const payload = { fullName: $('profFullName')?.value.trim() };

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

    await mutateAndSync(
      '/api/profile',
      { method: 'PUT', body: JSON.stringify(payload) },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => closeModal('editProfileModal'),
        successMessage: 'Дані профілю оновлено!',
      }
    );
  });

  $('profilePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const currentPassword = $('profileCurrentPassword')?.value || '';
    const p1 = $('profileNewPassword')?.value || '';
    const p2 = $('profileConfirmPassword')?.value || '';

    if (p1.length < 8) {
      showToast('Новий пароль має містити щонайменше 8 символів.', true);
      return;
    }
    if (p1 !== p2) {
      showToast('Новий пароль і підтвердження не співпадають.', true);
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    await mutateAndSync(
      '/api/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword: p1 }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => {
          $('profilePasswordForm')?.reset();
          closeModal('editProfileModal');
        },
        successMessage: 'Пароль успішно змінено. Інші сесії завершено.',
      }
    );
  });

  $('activeSessionsTableBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-revoke-session]');
    if (!btn) return;
    const sessionId = btn.getAttribute('data-revoke-session');
    if (!sessionId) return;

    await mutateAndSync(
      `/api/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE', body: '{}' },
      {
        button: btn,
        renderView: renderActiveView,
        successMessage: 'Сесію успішно завершено.',
      }
    );
  });

  $('revokeOtherBtn')?.addEventListener('click', async () => {
    await mutateAndSync(
      '/api/auth/sessions/revoke-others',
      { method: 'POST', body: '{}' },
      {
        button: $('revokeOtherBtn'),
        renderView: renderActiveView,
        successMessage: (res) => `Завершено сторонніх сесій: ${res.revokedCount ?? 0}.`,
      }
    );
  });
}
