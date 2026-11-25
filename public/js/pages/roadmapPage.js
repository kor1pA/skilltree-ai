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
  openModal,
  renderRoleGateCard,
  sanitizeExternalUrl,
} from '../core/dom.js';
import { mutateAndSync } from '../core/api.js';

let constellationCtrl = null;

export function setRoadmapConstellation(ctrl) {
  constellationCtrl = ctrl;
}

function computeAiKpi(learner) {
  const messages = [];
  for (const tree of learner.skillTrees || []) {
    for (const node of tree.nodes || []) {
      messages.push(...(node.messages || []));
    }
  }
  const avgMs =
    messages.length > 0
      ? Math.round(messages.reduce((sum, m) => sum + Number(m.responseTimeMs || 0), 0) / messages.length)
      : 0;
  const rated = messages.filter((m) => m.isHelpful !== null && m.isHelpful !== undefined);
  const helpful = rated.filter((m) => m.isHelpful === true).length;
  const helpfulPct = rated.length > 0 ? Number(((helpful / rated.length) * 100).toFixed(1)) : 100;
  return { avgMs, helpfulPct };
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
          const badgeHtml =
            node.status === 'DONE'
              ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">✓ Завершено</span>'
              : node.status === 'IN_PROGRESS'
                ? '<span class="px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold">◷ В процесі</span>'
                : '<span class="px-2.5 py-0.5 rounded-full bg-[#1e2235] text-slate-400 text-xs font-semibold">○ Не розпочато</span>';

          return `
            <div data-select-node="${node.id}" class="cursor-pointer rounded-2xl p-4 border transition-all ${
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

function renderNodeInspector(learner, tree, node) {
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

  const kpi = computeAiKpi(learner);
  if ($('aiSlaBadge')) {
    $('aiSlaBadge').textContent = kpi.avgMs > 0 ? `${kpi.avgMs} мс (SLA ≤ 5000 мс)` : 'SLA ≤ 5000 мс';
  }
  if ($('aiHelpfulnessKpi')) {
    $('aiHelpfulnessKpi').textContent = `${kpi.helpfulPct}%`;
  }
}

function openMaterialReader(materialId) {
  const learner = getActiveLearner();
  const tree = getActiveTree(learner);
  const node = getActiveNode(tree);
  const material = node?.materials?.find((m) => m.id === materialId);
  if (!material) return;

  const authorName =
    material.authorId !== undefined
      ? state.data?.authorNames?.[String(material.authorId)] || ''
      : '';

  if ($('materialModalType')) $('materialModalType').textContent = material.type;
  if ($('materialModalTitle')) $('materialModalTitle').textContent = material.title;
  if ($('materialModalAuthor')) {
    $('materialModalAuthor').textContent = authorName
      ? `Автор: ${authorName}`
      : 'Вбудована бібліотекa SkillTree AI';
  }
  if ($('materialModalDesc')) $('materialModalDesc').textContent = material.description || '';
  if ($('materialModalBody')) {
    $('materialModalBody').textContent =
      material.content || `Навчальний ресурс (${material.type}) для модуля «${node.title}».`;
  }

  const ext = $('materialModalExternal');
  if (ext) {
    const safeUrl = sanitizeExternalUrl(material.url);
    if (safeUrl) {
      ext.href = safeUrl;
      ext.classList.remove('hidden');
    } else {
      ext.removeAttribute('href');
      ext.classList.add('hidden');
    }
  }
  openModal('materialModal');
}

export function renderRoadmapPage() {
  const currentUser = getCurrentUser();
  const learner = getActiveLearner();
  const content = $('roadmapContent');
  const gate = $('roadmapGateNotice');

  const professions = state.data?.professions || [];
  if ($('professionList')) {
    $('professionList').innerHTML = professions
      .map((p) => `<option value="${escapeHtml(p)}"></option>`)
      .join('');
  }

  if (!learner) {
    content?.classList.add('hidden');
    if (gate) {
      gate.classList.remove('hidden');
      const roleDest = currentUser?.role === 'MENTOR' ? '/mentor-cabinet' : '/b2b';
      gate.innerHTML = currentUser
        ? renderRoleGateCard({
            icon: 'account_tree',
            title: 'Персональна карта навичок доступна для ролі Студент',
            description:
              'Ви авторизовані в системі як інша роль. Перейдіть до свого робочого кабінету або увійдіть у студентський акаунт.',
            primaryHref: roleDest,
            primaryLabel: 'Відкрити мій кабінет',
            secondaryHref: '/profile',
            secondaryLabel: 'Профіль і сесії',
          })
        : renderRoleGateCard({
            icon: 'account_tree',
            title: 'Увійдіть або зареєструйтеся, щоб будувати свою карту навичок',
            description:
              'Після реєстрації ШІ автоматично згенерує персоналізований маршрут навчання та збереже прогрес у SQLite.',
            primaryHref: '/auth',
            primaryLabel: 'Увійти / Зареєструватися',
            secondaryHref: '/mentors',
            secondaryLabel: 'Переглянути менторів',
          });
    }
    constellationCtrl?.syncData(null, null);
    return;
  }

  gate?.classList.add('hidden');
  content?.classList.remove('hidden');

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
  if ($('treeTechBadge')) {
    $('treeTechBadge').textContent = `${tree.level} • ${tree.nodes.length} ВУЗЛІВ`;
  }
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
        <span>⭐</span><span class="font-bold text-white">${learner.points} XP</span>
      </span>
    `;
  }

  const activeNode = getActiveNode(tree);
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
  renderNodeInspector(learner, tree, activeNode);
  constellationCtrl?.syncData(tree, activeNode);
}

export function bindRoadmapEvents({ renderActiveView }) {
  $('treeSelect')?.addEventListener('change', (e) => {
    state.selectedTreeId = Number(e.target.value);
    state.selectedNodeId = null;
    renderRoadmapPage();
  });

  $('view-mode-3d')?.addEventListener('click', () => {
    state.skillViewMode = '3d';
    $('tree-container-3d')?.classList.remove('hidden');
    $('tree-container-2d')?.classList.add('hidden');
    $('view-mode-3d').className =
      'flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-display text-xs font-semibold transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]';
    $('view-mode-2d').className =
      'flex items-center gap-1.5 px-3 py-1 rounded-full text-slate-400 hover:text-white font-display text-xs font-medium transition-all';
    constellationCtrl?.start();
    requestAnimationFrame(() => constellationCtrl?.resize());
  });

  $('view-mode-2d')?.addEventListener('click', () => {
    state.skillViewMode = '2d';
    $('tree-container-3d')?.classList.add('hidden');
    $('tree-container-2d')?.classList.remove('hidden');
    $('view-mode-2d').className =
      'flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-display text-xs font-semibold transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]';
    $('view-mode-3d').className =
      'flex items-center gap-1.5 px-3 py-1 rounded-full text-slate-400 hover:text-white font-display text-xs font-medium transition-all';
    constellationCtrl?.stop();
  });

  $('reset3dViewBtn')?.addEventListener('click', () => constellationCtrl?.resetView());
  $('focus3dNodeBtn')?.addEventListener('click', () => constellationCtrl?.focusSelected());
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
    const btn = e.target.querySelector('button[type="submit"]');
    await mutateAndSync(
      '/api/trees/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          profession: $('wizardProfession')?.value.trim(),
          level: $('wizardLevel')?.value,
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: (res) => {
          state.selectedTreeId = res.tree.id;
          state.selectedNodeId = res.tree.nodes[0]?.id || null;
          closeModal('wizardModal');
          $('wizardForm')?.reset();
        },
        successMessage: (res) => `Карту «${res.tree.targetProfession}» згенеровано!`,
      }
    );
  });

  $('addNodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tree = getActiveTree(getActiveLearner());
    if (!tree) return;
    const btn = e.target.querySelector('button[type="submit"]');
    await mutateAndSync(
      `/api/trees/${tree.id}/nodes`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: $('newNodeTitle')?.value.trim(),
          description: $('newNodeDesc')?.value.trim(),
          materialTitle: $('newNodeMaterialTitle')?.value.trim() || undefined,
          materialUrl: $('newNodeMaterialUrl')?.value.trim() || undefined,
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: (res) => {
          state.selectedNodeId = res.node.id;
          closeModal('addNodeModal');
          $('addNodeForm')?.reset();
        },
        successMessage: (res) => `Вузол «${res.node.title}» додано!`,
      }
    );
  });

  $('deleteNodeBtn')?.addEventListener('click', async () => {
    const tree = getActiveTree(getActiveLearner());
    const node = getActiveNode(tree);
    if (!tree || !node) return;
    await mutateAndSync(
      `/api/trees/${tree.id}/nodes/${node.id}`,
      { method: 'DELETE', body: '{}' },
      {
        button: $('deleteNodeBtn'),
        renderView: renderActiveView,
        onSuccess: () => {
          state.selectedNodeId = null;
        },
        successMessage: 'Вузол видалено з карти.',
      }
    );
  });

  $('nodeActionButtons')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-node-status]');
    if (!btn) return;
    const tree = getActiveTree(getActiveLearner());
    const node = getActiveNode(tree);
    if (!tree || !node) return;

    const targetStatus = btn.getAttribute('data-node-status');
    await mutateAndSync(
      `/api/trees/${tree.id}/nodes/${node.id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: targetStatus === 'IN_PROGRESS' ? 'start' : 'complete',
          status: targetStatus,
        }),
      },
      {
        button: btn,
        renderView: renderActiveView,
        successMessage: 'Статус вузла оновлено!',
      }
    );
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
    const tree = getActiveTree(getActiveLearner());
    const node = getActiveNode(tree);
    const question = $('aiQuestionInput')?.value.trim();
    if (!tree || !node || !question) return;
    const btn = e.target.querySelector('button[type="submit"]');

    await mutateAndSync(
      `/api/trees/${tree.id}/nodes/${node.id}/chat`,
      { method: 'POST', body: JSON.stringify({ question }) },
      {
        button: btn,
        renderView: renderActiveView,
        onSuccess: () => {
          if ($('aiQuestionInput')) $('aiQuestionInput').value = '';
          const box = $('chatMessages');
          if (box) box.scrollTop = box.scrollHeight;
        },
      }
    );
  });

  $('chatMessages')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rate-msg]');
    if (!btn) return;
    const msgId = Number(btn.getAttribute('data-rate-msg'));
    const helpful = btn.getAttribute('data-helpful') === 'true';

    await mutateAndSync(
      `/api/chat/${msgId}/rate`,
      { method: 'PATCH', body: JSON.stringify({ helpful }) },
      {
        button: btn,
        renderView: renderActiveView,
        successMessage: 'Оцінку відповіді ШІ збережено.',
      }
    );
  });
}
