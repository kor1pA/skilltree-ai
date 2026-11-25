import { ROUTES, ROUTE_TITLES, state } from './state.js';
import { $ } from './dom.js';

let renderHeaderFn = () => {};
let pageRenderers = {};
let authCanvasCtrl = null;
let constellationCtrl = null;

export function configureRouter({ renderHeader, pages, authCanvas, constellation }) {
  renderHeaderFn = renderHeader;
  pageRenderers = pages;
  authCanvasCtrl = authCanvas;
  constellationCtrl = constellation;
}

export function normalizeRoute(path) {
  if (!path || path === '/') return '/roadmap';
  const cleaned = path.replace(/\/+$/, '');
  if (cleaned === '/login') return '/auth';
  return ROUTES[cleaned] ? cleaned : '/roadmap';
}

export function renderActiveView() {
  if (!state.data) return;
  renderHeaderFn();
  const renderPage = pageRenderers[state.currentRoute] || pageRenderers['/roadmap'];
  if (typeof renderPage === 'function') {
    renderPage();
  }
}

export function navigateTo(path, push = true) {
  const rawNormalized = !path || path === '/' ? '/' : path.replace(/\/+$/, '');
  const target = ROUTES[rawNormalized] ? rawNormalized : '/roadmap';
  const navRoute = target === '/' ? '/roadmap' : target === '/login' ? '/auth' : target;
  state.currentRoute = navRoute;

  const targetUrl = target === '/' ? '/' : navRoute;
  if (push && window.location.pathname !== targetUrl) {
    window.history.pushState({ route: navRoute }, '', targetUrl);
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

  $('dashboard-sidebar')?.classList.remove('open');
  $('mobileSidebarBackdrop')?.classList.add('hidden');
  $('userProfileDropdown')?.classList.add('hidden');

  document.title = ROUTE_TITLES[navRoute] || ROUTE_TITLES['/'];
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Прицільний рендер лише активної сторінки та керування циклом Canvas RAF
  renderActiveView();

  if (navRoute === '/auth') {
    constellationCtrl?.stop();
    authCanvasCtrl?.start();
  } else if (navRoute === '/roadmap' && state.skillViewMode === '3d') {
    authCanvasCtrl?.stop();
    constellationCtrl?.start();
    requestAnimationFrame(() => constellationCtrl?.resize());
  } else {
    authCanvasCtrl?.stop();
    constellationCtrl?.stop();
  }
}
