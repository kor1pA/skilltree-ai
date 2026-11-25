export function $(id) {
  return document.getElementById(id);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeExternalUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function getInitials(fullName) {
  const parts = String(fullName || 'ST')
    .trim()
    .split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return String(fullName || 'ST')
    .slice(0, 2)
    .toUpperCase();
}

export function getRoleLabel(role) {
  if (role === 'MENTOR') return 'Ментор / Експерт';
  if (role === 'HR') return 'HR / TeamLead (B2B)';
  if (role === 'LEARNER') return 'Студент / Фахівець';
  return 'Гість';
}

export function showToast(message, isError = false) {
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

export function openModal(id) {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

export function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.wasDisabled = String(Boolean(btn.disabled));
    btn.disabled = true;
    btn.classList.add('opacity-60', 'cursor-wait');
  } else {
    btn.disabled = btn.dataset.wasDisabled === 'true';
    delete btn.dataset.wasDisabled;
    btn.classList.remove('opacity-60', 'cursor-wait');
  }
}

export function debounce(fn, waitMs = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

export function renderSessionStatusBadges(session, includePrice = false) {
  const paymentBadgeClass =
    session.paymentStatus === 'PAID'
      ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
      : session.paymentStatus === 'REFUNDED'
        ? 'bg-slate-800/80 border border-slate-500/40 text-slate-300'
        : 'bg-amber-950/60 border border-amber-500/40 text-amber-300';

  const priceSuffix = includePrice ? ` (${session.price} ₴)` : '';
  return `
    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#181b2c] border border-purple-500/30 text-purple-200">${escapeHtml(session.status)}</span>
    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${paymentBadgeClass}">${escapeHtml(session.paymentStatus)}${escapeHtml(priceSuffix)}</span>
  `;
}

export function renderRoleGateCard({
  icon,
  title,
  description,
  primaryHref = '/auth',
  primaryLabel = 'Увійти в акаунт',
  secondaryHref = '/mentors',
  secondaryLabel = 'Каталог менторів',
}) {
  return `
    <div class="glass-panel rounded-3xl p-8 text-center max-w-2xl mx-auto my-8 border border-[#2b304c]">
      <div class="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 text-primary flex items-center justify-center mx-auto mb-4">
        <span class="material-symbols-outlined text-3xl">${escapeHtml(icon)}</span>
      </div>
      <h2 class="text-2xl font-bold text-white mb-2 m-0">${escapeHtml(title)}</h2>
      <p class="text-sm text-slate-300 mb-6 leading-relaxed">${escapeHtml(description)}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <a href="${escapeHtml(primaryHref)}" data-route="${escapeHtml(primaryHref)}" class="px-6 py-3 rounded-xl bg-gradient-to-r from-[#6d3bd7] to-[#9a6eff] text-white font-bold text-sm cyber-glow-purple">
          ${escapeHtml(primaryLabel)}
        </a>
        <a href="${escapeHtml(secondaryHref)}" data-route="${escapeHtml(secondaryHref)}" class="px-6 py-3 rounded-xl bg-[#181b2c] border border-[#2b304c] text-slate-200 hover:text-white text-sm font-semibold">
          ${escapeHtml(secondaryLabel)}
        </a>
      </div>
    </div>
  `;
}
