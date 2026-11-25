import {
  getActiveLearner,
  getActiveNode,
  getActiveTree,
  getCurrentUser,
  state,
} from '../core/state.js';
import {
  $,
  debounce,
  escapeHtml,
  getInitials,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  openModal,
  renderSessionStatusBadges,
  showToast,
} from '../core/dom.js';
import { mutateAndSync } from '../core/api.js';

export function closeBookingDrawer() {
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

function openBookingDrawer(mentorId, navigateTo) {
  const user = getCurrentUser();
  if (!user) {
    showToast('Увійдіть як студент, щоб забронювати консультацію.');
    navigateTo('/auth');
    return;
  }
  if (user.role !== 'LEARNER') {
    showToast('Бронювати консультації можуть лише облікові записи студентів.', true);
    return;
  }

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
    $('bookingTopicInput').value = node
      ? `Розбір теми: ${node.title}`
      : `Консультація: ${mentor.specialization}`;
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

export function renderMentorsPage() {
  const mentors = state.data?.mentors || [];
  const learner = getActiveLearner();

  if ($('mentorsActiveCount')) $('mentorsActiveCount').textContent = String(mentors.length);
  if ($('mentorsAvgRating')) {
    const avg = mentors.length
      ? mentors.reduce((sum, m) => sum + Number(m.rating || 5), 0) / mentors.length
      : 5;
    $('mentorsAvgRating').textContent = avg.toFixed(2);
  }
  if ($('mentorsOnlineBadge')) {
    const freeCount = mentors.filter((m) => m.availabilityStatus === 'Вільний слот').length;
    $('mentorsOnlineBadge').textContent = `${freeCount} доступно зараз`;
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
    if (state.mentorSort === 'materials') {
      return (b.publishedMaterialsCount || 0) - (a.publishedMaterialsCount || 0);
    }
    return Number(b.rating || 5) - Number(a.rating || 5);
  });

  const grid = $('mentorsDirectoryGrid');
  if (grid) {
    grid.innerHTML = filtered.length
      ? filtered
          .map((m) => {
            const isFree = m.availabilityStatus === 'Вільний слот';
            const statusClass = isFree
              ? 'border-emerald-500/30 text-emerald-300'
              : 'border-amber-500/30 text-amber-300';
            const dotClass = isFree ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400';
            return `
              <div class="relative cyber-card rounded-3xl p-6 flex flex-col justify-between group overflow-hidden">
                <div>
                  <div class="flex items-center justify-between mb-4">
                    <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-400/50 text-purple-200 font-display text-[11px]">
                      <span class="material-symbols-outlined text-xs">workspace_premium</span> Верифікований
                    </span>
                    <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0e111d] border ${statusClass} font-display text-[11px]">
                      <span class="w-2 h-2 rounded-full ${dotClass}"></span> ${escapeHtml(m.availabilityStatus || 'Вільний слот')}
                    </span>
                  </div>
                  <div class="flex items-start gap-4 mb-4">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 text-white text-xl font-extrabold flex items-center justify-center shrink-0 ring-2 ring-purple-500/50">${escapeHtml(getInitials(m.fullName))}</div>
                    <div class="min-w-0 flex-1">
                      <h3 class="text-lg text-white font-bold truncate m-0">${escapeHtml(m.fullName)}</h3>
                      <p class="text-xs text-purple-300 font-semibold mt-0.5 m-0">${escapeHtml(m.specialization)}</p>
                      <p class="text-xs text-slate-400 mt-1 m-0">Матеріалів: ${m.publishedMaterialsCount ?? 0} • Активних сесій: ${m.activeBookingsCount ?? 0}</p>
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
            `;
          })
          .join('')
      : '<p class="text-sm text-slate-400 col-span-3">Менторів за обраним фільтром не знайдено.</p>';
  }

  const sessionsList = $('learnerSessionsList');
  if (!sessionsList) return;

  if (!learner) {
    sessionsList.innerHTML =
      '<p class="text-xs text-slate-400">Увійдіть як студент, щоб переглядати ваші бронювання та електронні квитанції.</p>';
    return;
  }

  const sessions = state.data?.sessions || [];
  const receipts = state.data?.receipts || [];
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
                <div class="flex gap-1.5">${renderSessionStatusBadges(s)}</div>
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
    : `<p class="text-xs text-slate-400">У вас поки немає заброньованих сесій.</p>`;
}

export function bindMentorsEvents({ navigateTo, renderActiveView }) {
  const debouncedSearch = debounce((val) => {
    state.mentorSearch = val;
    renderMentorsPage();
  }, 150);

  $('mentorSearchInput')?.addEventListener('input', (e) => debouncedSearch(e.target.value));
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
    openBookingDrawer(Number(btn.getAttribute('data-book-mentor')), navigateTo);
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

  // Бронювання та миттєва оплата сесії із блокуванням повторного натискання
  $('confirmPaymentBtn')?.addEventListener('click', async () => {
    const learner = getActiveLearner();
    if (!learner || !state.bookingMentorId) return;
    const durationMin = Number($('bookingDuration')?.value || 60);
    const startVal = $('bookingStartAt')?.value;
    const startDate = startVal ? new Date(startVal) : new Date(Date.now() + 86_400_000);
    if (Number.isNaN(startDate.getTime())) {
      showToast('Оберіть коректну дату та час консультації.', true);
      return;
    }

    await mutateAndSync(
      '/api/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          mentorId: state.bookingMentorId,
          topic: $('bookingTopicInput')?.value.trim() || 'Індивідуальна менторська сесія',
          startAt: startDate.toISOString(),
          durationMin,
          payImmediately: true,
          paymentMethod: state.paymentMethod,
        }),
      },
      {
        button: $('confirmPaymentBtn'),
        renderView: renderActiveView,
        onSuccess: (res) => {
          if ($('paymentTxnId')) {
            $('paymentTxnId').textContent = `Транзакція ${res.receipt?.transactionId || 'підтверджена'}`;
          }
          $('paymentSuccessToast')?.classList.remove('hidden');
        },
        successMessage: 'Сесію заброньовано та оплачено!',
      }
    );
  });

  $('learnerSessionsList')?.addEventListener('click', async (e) => {
    const payBtn = e.target.closest('[data-pay-session]');
    if (payBtn) {
      const id = Number(payBtn.getAttribute('data-pay-session'));
      await mutateAndSync(
        `/api/sessions/${id}/pay`,
        { method: 'POST', body: JSON.stringify({ paymentMethod: state.paymentMethod }) },
        {
          button: payBtn,
          renderView: renderActiveView,
          successMessage: (res) => `Оплата підтверджена! Чек ${res.receipt?.transactionId || ''}`,
        }
      );
      return;
    }

    const receiptBtn = e.target.closest('[data-view-receipt]');
    if (receiptBtn) {
      const id = Number(receiptBtn.getAttribute('data-view-receipt'));
      const receipt = (state.data?.receipts || []).find((r) => r.sessionId === id);
      const session = (state.data?.sessions || []).find((s) => s.id === id);
      if ($('receiptBody')) {
        $('receiptBody').innerHTML = receipt
          ? `
            <div><strong>Транзакція:</strong> <code class="text-cyan-300">${escapeHtml(receipt.transactionId)}</code></div>
            <div><strong>Сесія:</strong> #${receipt.sessionId} (${escapeHtml(session?.topic || '')})</div>
            <div><strong>Сума:</strong> ${receipt.amount} ${escapeHtml(receipt.currency)}</div>
            <div><strong>Спосіб:</strong> ${escapeHtml(getPaymentMethodLabel(receipt.method))}</div>
            <div><strong>Статус:</strong> ${escapeHtml(getPaymentStatusLabel(receipt.status))}</div>
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

  $('learnerSessionsList')?.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-feedback-form]');
    if (!form) return;
    e.preventDefault();
    const id = Number(form.getAttribute('data-feedback-form'));
    const btn = form.querySelector('button[type="submit"]');
    await mutateAndSync(
      `/api/sessions/${id}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({
          rating: Number(form.elements.rating.value),
          feedback: form.elements.comment.value.trim(),
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        successMessage: 'Оцінку та відгук збережено!',
      }
    );
  });
}
