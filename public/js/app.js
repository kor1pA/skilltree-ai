import { getActiveLearner, getCurrentUser, state } from './core/state.js';
import { $, closeModal, debounce, getInitials, getRoleLabel, showToast } from './core/dom.js';
import { api, mutateAndSync } from './core/api.js';
import { configureRouter, navigateTo, renderActiveView } from './core/router.js';
import { createConstellationController } from './visuals/constellationCanvas.js';
import { createAuthCanvasController } from './visuals/authCanvas.js';
import { bindAuthEvents, selectRegisterRole, setAuthTab } from './pages/authPage.js';
import {
  bindRoadmapEvents,
  renderRoadmapPage,
  setRoadmapConstellation,
} from './pages/roadmapPage.js';
import { bindMentorsEvents, closeBookingDrawer, renderMentorsPage } from './pages/mentorsPage.js';
import { bindMentorCabinetEvents, renderMentorCabinetPage } from './pages/mentorCabinetPage.js';
import { bindB2bEvents, closeAssignModal, renderB2bPage } from './pages/b2bPage.js';
import {
  bindProfileEvents,
  openEditProfileModal,
  renderProfilePage,
} from './pages/profilePage.js';

function renderHeaderAndDropdown() {
  const currentUser = getCurrentUser();
  const learner = getActiveLearner();

  if ($('headerXpPill')) {
    $('headerXpPill').classList.toggle('hidden', !learner);
    if (learner) $('headerXpPill').classList.add('md:flex');
  }
  if ($('headerXpText') && learner) {
    $('headerXpText').textContent = `${learner.points ?? 0} XP`;
  }
  if ($('headerLevelText') && learner) {
    $('headerLevelText').textContent = learner.level ?? 'BEGINNER';
  }

  const label = currentUser ? currentUser.fullName : 'Гість (Увійти)';
  const initials = getInitials(currentUser?.fullName || 'ГТ');
  if ($('headerUserAvatar')) $('headerUserAvatar').textContent = initials;
  if ($('headerUserName')) $('headerUserName').textContent = label;
  if ($('dropdownAvatarLg')) $('dropdownAvatarLg').textContent = initials;
  if ($('dropdownUserName')) $('dropdownUserName').textContent = currentUser?.fullName || 'Гість';
  if ($('dropdownUserMeta')) {
    $('dropdownUserMeta').textContent = currentUser
      ? `${getRoleLabel(currentUser.role)} • ${currentUser.email}`
      : 'Сесію не розпочато — увійдіть у кабінет';
  }

  $('dropdownEditProfileBtn')?.classList.toggle('hidden', !currentUser);
  $('headerLogoutBtn')?.classList.toggle('hidden', !currentUser);
}

const constellationCtrl = createConstellationController({
  onSelectNode: (nodeId) => {
    state.selectedNodeId = nodeId;
    renderRoadmapPage();
  },
});

const authCanvasCtrl = createAuthCanvasController();
setRoadmapConstellation(constellationCtrl);

configureRouter({
  renderHeader: renderHeaderAndDropdown,
  authCanvas: authCanvasCtrl,
  constellation: constellationCtrl,
  pages: {
    '/auth': () => {},
    '/roadmap': renderRoadmapPage,
    '/mentors': renderMentorsPage,
    '/mentor-cabinet': renderMentorCabinetPage,
    '/b2b': renderB2bPage,
    '/profile': renderProfilePage,
  },
});

function bindGlobalEvents() {
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

    if (!e.target.closest('#userProfileDropdownContainer')) {
      $('userProfileDropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#teamDropdownBtn') && !e.target.closest('#teamDropdownMenu')) {
      $('teamDropdownMenu')?.classList.add('hidden');
    }
  });

  window.addEventListener('popstate', () => navigateTo(window.location.pathname, false));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      authCanvasCtrl.stop();
      constellationCtrl.stop();
    } else if (state.currentRoute === '/auth') {
      authCanvasCtrl.start();
    } else if (state.currentRoute === '/roadmap' && state.skillViewMode === '3d') {
      constellationCtrl.start();
    }
  });

  $('mobileSidebarBtn')?.addEventListener('click', () => {
    $('dashboard-sidebar')?.classList.toggle('open');
    $('mobileSidebarBackdrop')?.classList.toggle('hidden');
  });
  $('mobileSidebarBackdrop')?.addEventListener('click', () => {
    $('dashboard-sidebar')?.classList.remove('open');
    $('mobileSidebarBackdrop')?.classList.add('hidden');
  });

  $('userProfileMenuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('userProfileDropdown')?.classList.toggle('hidden');
  });
  $('dropdownEditProfileBtn')?.addEventListener('click', () => {
    $('userProfileDropdown')?.classList.add('hidden');
    openEditProfileModal();
  });

  const handleGlobalSearch = debounce((val) => {
    state.globalSearch = val;
    renderActiveView();
  }, 150);
  $('globalSearchInput')?.addEventListener('input', (e) => handleGlobalSearch(e.target.value));

  const handleLogout = async () => {
    await mutateAndSync(
      '/api/auth/logout',
      { method: 'POST', body: '{}' },
      {
        renderView: renderActiveView,
        onSuccess: () => {
          state.selectedTreeId = null;
          state.selectedNodeId = null;
          navigateTo('/auth');
        },
        successMessage: 'Ви вийшли з облікового запису.',
      }
    );
  };
  $('headerLogoutBtn')?.addEventListener('click', handleLogout);
  $('profileLogoutBtn')?.addEventListener('click', handleLogout);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    [
      'wizardModal',
      'addNodeModal',
      'materialModal',
      'addMaterialModal',
      'createTeamModal',
      'editProfileModal',
      'receiptModal',
      'csvPreviewModal',
    ].forEach(closeModal);
    closeBookingDrawer();
    closeAssignModal();
  });

  const ctx = { navigateTo, renderActiveView };
  bindAuthEvents(ctx);
  bindRoadmapEvents(ctx);
  bindMentorsEvents(ctx);
  bindMentorCabinetEvents(ctx);
  bindB2bEvents(ctx);
  bindProfileEvents(ctx);
}

async function init() {
  setAuthTab('login');
  selectRegisterRole('LEARNER');
  bindGlobalEvents();

  const initialPath = window.location.pathname;
  navigateTo(initialPath, false);

  try {
    state.data = await api('/api/state');
    const currentUser = getCurrentUser();
    if (!currentUser && (initialPath === '/' || initialPath === '/roadmap')) {
      navigateTo('/auth', false);
    } else {
      renderActiveView();
    }
  } catch (err) {
    showToast(`Не вдалося завантажити дані: ${err.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', init);
