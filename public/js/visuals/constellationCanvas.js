import { state } from '../core/state.js';
import { $ } from '../core/dom.js';

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
};

let rafId = null;
let initialized = false;
let onSelectNodeCallback = () => {};

export function createConstellationController({ onSelectNode }) {
  onSelectNodeCallback = onSelectNode || (() => {});

  function syncData(tree, activeNode) {
    if (!tree || !Array.isArray(tree.nodes)) {
      constellation.nodes = [];
      constellation.projected = [];
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

  function resize() {
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

  function resetView() {
    constellation.yaw = 0.35;
    constellation.pitch = -0.18;
    constellation.zoom = 1;
  }

  function focusSelected() {
    const idx = constellation.nodes.findIndex((n) => n.isSelected);
    if (idx !== -1) {
      constellation.yaw = -(idx * 1.15 - 1.2);
      constellation.pitch = 0;
    }
  }

  function bindCanvasEvents() {
    if (initialized) return;
    const canvas = $('constellation-canvas');
    if (!canvas) return;
    initialized = true;

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
      if (!rect.width) return;
      const dpr = canvas.width / rect.width;
      const clickX = (e.clientX - rect.left) * dpr;
      const clickY = (e.clientY - rect.top) * dpr;

      for (let i = constellation.projected.length - 1; i >= 0; i--) {
        const p = constellation.projected[i];
        if (Math.hypot(clickX - p.sx, clickY - p.sy) <= p.r * 1.45) {
          onSelectNodeCallback(p.item.node.id);
          break;
        }
      }
    });

    window.addEventListener('resize', resize);
  }

  function drawFrame() {
    if (
      document.hidden ||
      state.currentRoute !== '/roadmap' ||
      state.skillViewMode !== '3d'
    ) {
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(drawFrame);

    const canvas = $('constellation-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!canvas.width || !canvas.height) resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    constellation.pulsePhase += 0.035;
    if (!constellation.dragging) {
      constellation.yaw += 0.0022;
    }

    ctx.clearRect(0, 0, w, h);

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

    const sorted = [...mapped].sort((a, b) => a.z - b.z);
    constellation.projected = sorted;

    for (const p of sorted) {
      const st = p.item.node.status;
      const primaryColor = st === 'DONE' ? '#10b981' : st === 'IN_PROGRESS' ? '#06b6d4' : '#64748b';
      const glowColor =
        st === 'DONE'
          ? 'rgba(16,185,129,0.45)'
          : st === 'IN_PROGRESS'
            ? 'rgba(139,92,246,0.55)'
            : 'rgba(100,116,139,0.22)';

      const halo = ctx.createRadialGradient(p.sx, p.sy, p.r * 0.2, p.sx, p.sy, p.r * 2.1);
      halo.addColorStop(0, glowColor);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r * 2.1, 0, Math.PI * 2);
      ctx.fill();

      if (p.item.isSelected) {
        const ringRadius = p.r + 6 + Math.sin(constellation.pulsePhase * 2) * 2;
        ctx.strokeStyle = '#d0bcff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = st === 'DONE' ? '#064e3b' : st === 'IN_PROGRESS' ? '#1e1b4b' : '#181b2c';
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = p.item.isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(11, Math.round(p.r * 0.72))}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.item.node.orderNumber), p.sx, p.sy);

      const titleText =
        p.item.node.title.length > 26 ? `${p.item.node.title.slice(0, 24)}…` : p.item.node.title;
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = p.item.isSelected ? '#7bd0ff' : '#cbd5e1';
      ctx.fillText(titleText, p.sx, p.sy + p.r + 16);
    }
  }

  function start() {
    bindCanvasEvents();
    resize();
    if (
      rafId === null &&
      !document.hidden &&
      state.currentRoute === '/roadmap' &&
      state.skillViewMode === '3d'
    ) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { start, stop, syncData, resize, resetView, focusSelected };
}
