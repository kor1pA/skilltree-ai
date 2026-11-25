import { state } from '../core/state.js';
import { $, showToast } from '../core/dom.js';
import { mutateAndSync } from '../core/api.js';

export function setAuthTab(mode) {
  state.authMode = mode;
  const tabLogin = $('tab-login');
  const tabReg = $('tab-register');
  const titleEl = $('portal-title');
  const subtitleEl = $('portal-subtitle');
  const submitText = $('submit-btn-text');
  const roleWrapper = $('role-section-wrapper');
  const fieldFullname = $('field-fullname');
  const fieldExtra = $('field-extra');
  const rememberRow = $('rememberMeRow');
  const passwordInput = $('input-password');

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

    roleWrapper?.classList.remove('hidden');
    fieldFullname?.classList.remove('hidden');
    fieldExtra?.classList.remove('hidden');
    rememberRow?.classList.add('hidden');

    if ($('input-fullname')) $('input-fullname').required = true;
    if (passwordInput) {
      passwordInput.minLength = 8;
      passwordInput.autocomplete = 'new-password';
      passwordInput.placeholder = 'Мінімум 8 символів';
    }
    if (titleEl) titleEl.textContent = 'Реєстрація в SkillTree AI';
    if (subtitleEl) {
      subtitleEl.textContent = 'Створіть акаунт, оберіть роль і розпочніть персональне навчання';
    }
    if (submitText) submitText.textContent = 'Створити акаунт';
  } else {
    tabLogin?.classList.add(...activeClasses);
    tabLogin?.classList.remove('text-slate-400');
    tabReg?.classList.remove(...activeClasses);
    tabReg?.classList.add('text-slate-400');

    roleWrapper?.classList.add('hidden');
    fieldFullname?.classList.add('hidden');
    fieldExtra?.classList.add('hidden');
    rememberRow?.classList.remove('hidden');

    if ($('input-fullname')) $('input-fullname').required = false;
    if (passwordInput) {
      passwordInput.removeAttribute('minlength');
      passwordInput.autocomplete = 'current-password';
      passwordInput.placeholder = 'Введіть пароль';
    }
    if (titleEl) titleEl.textContent = 'Вхід до SkillTree AI';
    if (subtitleEl) {
      subtitleEl.textContent = 'Увійдіть за email і паролем або створіть новий обліковий запис';
    }
    if (submitText) submitText.textContent = 'Увійти в кабінет';
  }
}

export function selectRegisterRole(role) {
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

export function bindAuthEvents({ navigateTo, renderActiveView }) {
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

  $('forgotPasswordLink')?.addEventListener('click', () => {
    showToast(
      'Для безпеки пароль можна змінити лише в налаштуваннях після входу або через адміністратора.',
      false
    );
  });

  $('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = $('auth-submit-btn');
    const email = $('input-email')?.value.trim() || '';
    const password = $('input-password')?.value || '';

    if (state.authMode === 'register') {
      const role = state.registerRole;
      const extra = $('input-extra')?.value.trim() || '';
      const body = {
        fullName: $('input-fullname')?.value.trim() || '',
        email,
        password,
        role,
      };
      if (role === 'MENTOR' && extra) body.specialization = extra;
      if (role === 'HR' && extra) body.company = extra;
      if (role === 'LEARNER' && extra) body.targetProfession = extra;

      await mutateAndSync(
        '/api/auth/register',
        { method: 'POST', body: JSON.stringify(body) },
        {
          button: submitBtn,
          renderView: renderActiveView,
          onSuccess: (res) => {
            state.selectedTreeId = null;
            state.selectedNodeId = null;
            $('auth-form')?.reset();
            navigateTo(role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap');
            showToast(`Акаунт створено! Вітаємо, ${res.user.fullName}.`);
          },
        }
      );
      return;
    }

    const rememberMe = Boolean($('rememberMeCheckbox')?.checked);
    await mutateAndSync(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password, rememberMe }) },
      {
        button: submitBtn,
        renderView: renderActiveView,
        onSuccess: (res) => {
          state.selectedTreeId = null;
          state.selectedNodeId = null;
          $('auth-form')?.reset();
          const role = res.user.role;
          navigateTo(role === 'MENTOR' ? '/mentor-cabinet' : role === 'HR' ? '/b2b' : '/roadmap');
          showToast(`Вітаємо, ${res.user.fullName}!`);
        },
      }
    );
  });
}
