import { getCurrentUser, state } from '../core/state.js';
import {
  $,
  closeModal,
  escapeHtml,
  getInitials,
  getMaterialTypeLabel,
  openModal,
  renderSessionStatusBadges,
} from '../core/dom.js';
import { mutateAndSync } from '../core/api.js';

export function renderMentorCabinetPage() {
  const currentUser = getCurrentUser();
  const notice = $('mentorGuestNotice');
  const content = $('mentorCabinetContent');

  if (!currentUser || currentUser.role !== 'MENTOR') {
    notice?.classList.remove('hidden');
    content?.classList.add('hidden');
    return;
  }

  notice?.classList.add('hidden');
  content?.classList.remove('hidden');

  const mentor = currentUser;
  const sessions = state.data?.sessions || [];
  const publishedMaterials = mentor.publishedMaterials || [];
  const catalogNodes = state.data?.catalogNodes || [];

  if ($('mentorBannerAvatar')) $('mentorBannerAvatar').textContent = getInitials(mentor.fullName);
  if ($('mentorBannerName')) $('mentorBannerName').textContent = mentor.fullName;
  if ($('mentorBannerSpec')) {
    const span = $('mentorBannerSpec').querySelector('span:last-child');
    if (span) span.textContent = mentor.specialization || 'IT Mentor';
  }
  if ($('mentorKpiRating')) $('mentorKpiRating').textContent = Number(mentor.rating || 5).toFixed(2);
  if ($('mentorKpiSessions')) $('mentorKpiSessions').textContent = String(sessions.length);
  if ($('mentorKpiMaterials')) {
    $('mentorKpiMaterials').textContent = String(mentor.publishedMaterialsCount ?? publishedMaterials.length);
  }
  if ($('mentorKpiRevenue')) $('mentorKpiRevenue').textContent = `${mentor.hourlyRate ?? 900} ₴`;
  if ($('mentorSessionsTotalBadge')) {
    $('mentorSessionsTotalBadge').textContent = `Усього: ${sessions.length}`;
  }

  const nodeSelect = $('mentorNodeSelect');
  if (nodeSelect) {
    nodeSelect.innerHTML = catalogNodes.length
      ? catalogNodes
          .map(
            (n) =>
              `<option value="${n.nodeId}" class="bg-[#121422]">${escapeHtml(n.ownerName)} — ${escapeHtml(n.profession)}: ${escapeHtml(n.nodeTitle)}</option>`
          )
          .join('')
      : '<option value="" disabled>Поки що немає доступних вузлів</option>';
  }

  const sessContainer = $('mentorSessionsList');
  if (sessContainer) {
    sessContainer.innerHTML = sessions.length
      ? sessions
          .map(
            (s) => `
              <div class="flex flex-col p-5 rounded-3xl bg-[#141724]/90 border ${
                s.status === 'BOOKED' ? 'border-amber-500/40' : 'border-[#2b304c]'
              } gap-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-full bg-primary/25 border border-primary/40 text-white font-bold flex items-center justify-center">${escapeHtml(getInitials(s.learnerName || 'ST'))}</div>
                    <div>
                      <div class="text-sm font-bold text-white">${escapeHtml(s.learnerName || `Студент #${s.learnerId}`)}</div>
                      <div class="text-xs text-slate-400">${escapeHtml(s.topic)}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">${renderSessionStatusBadges(s, true)}</div>
                </div>
                <div class="p-3 rounded-2xl bg-[#0f111d] border border-[#252a42] flex flex-wrap gap-4 text-xs text-slate-300">
                  <span>📅 ${new Date(s.startAt).toLocaleString('uk-UA')}</span>
                  <span>⏱ ${s.durationMin} хв</span>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#22273c]">
                  ${
                    s.status !== 'DONE' && s.status !== 'CANCELLED'
                      ? `<button type="button" data-cancel-session="${s.id}" class="px-4 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-semibold cursor-pointer">Скасувати${s.paymentStatus === 'PAID' ? ' з поверненням' : ''}</button>`
                      : '<span></span>'
                  }
                  ${
                    s.status === 'BOOKED'
                      ? `<button type="button" data-confirm-session="${s.id}" class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs font-bold cursor-pointer">✓ Підтвердити сесію</button>`
                      : ''
                  }
                </div>
              </div>
            `
          )
          .join('')
      : '<p class="text-sm text-slate-400">Вхідних записів на сесії поки немає.</p>';
  }

  const matContainer = $('mentorMaterialsList');
  if (matContainer) {
    matContainer.innerHTML = publishedMaterials.length
      ? publishedMaterials
          .slice(0, 8)
          .map(
            (m) => `
          <div class="p-4 rounded-2xl bg-[#141724]/80 border border-[#2b304c] flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-primary font-mono text-[11px] font-bold">${escapeHtml(getMaterialTypeLabel(m.type))}</span>
              <span class="text-[11px] text-slate-400 font-mono truncate max-w-[60%]">Вузол: ${escapeHtml(m.nodeTitle || '')}</span>
            </div>
            <div class="text-sm text-white font-semibold">${escapeHtml(m.title)}</div>
          </div>
        `
          )
          .join('')
      : '<p class="text-xs text-slate-400">Опублікуйте перший матеріал, натиснувши «+ Додати».</p>';
  }
}

export function bindMentorCabinetEvents({ renderActiveView }) {
  $('openModalBtn')?.addEventListener('click', () => openModal('addMaterialModal'));
  $('addMaterialShortcutBtn')?.addEventListener('click', () => openModal('addMaterialModal'));
  $('closeModalBtn')?.addEventListener('click', () => closeModal('addMaterialModal'));
  $('cancelModalBtn')?.addEventListener('click', () => closeModal('addMaterialModal'));

  $('materialForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = Number($('mentorNodeSelect')?.value);
    const type = document.querySelector('input[name="mat_type"]:checked')?.value || 'TEXT';
    if (!nodeId) return;
    const btn = e.target.querySelector('button[type="submit"]');

    await mutateAndSync(
      `/api/nodes/${nodeId}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: $('materialTitle')?.value.trim(),
          type,
          url: $('materialUrl')?.value.trim(),
          description: $('materialDesc')?.value.trim(),
          content: $('materialContent')?.value.trim(),
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => {
          closeModal('addMaterialModal');
          $('materialForm')?.reset();
        },
        successMessage: 'Матеріал опубліковано у вузол!',
      }
    );
  });

  $('mentorSessionsList')?.addEventListener('click', async (e) => {
    const confirmBtn = e.target.closest('[data-confirm-session]');
    if (confirmBtn) {
      const id = Number(confirmBtn.getAttribute('data-confirm-session'));
      await mutateAndSync(
        `/api/sessions/${id}/confirm`,
        { method: 'POST', body: '{}' },
        {
          button: confirmBtn,
          renderView: renderActiveView,
          successMessage: 'Сесію підтверджено!',
        }
      );
      return;
    }

    const cancelBtn = e.target.closest('[data-cancel-session]');
    if (cancelBtn) {
      const id = Number(cancelBtn.getAttribute('data-cancel-session'));
      await mutateAndSync(
        `/api/sessions/${id}/cancel`,
        { method: 'POST', body: '{}' },
        {
          button: cancelBtn,
          renderView: renderActiveView,
          successMessage: 'Сесію скасовано.',
        }
      );
    }
  });
}
