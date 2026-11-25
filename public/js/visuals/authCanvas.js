import { state } from '../core/state.js';
import { $ } from '../core/dom.js';

export function createAuthCanvasController() {
  let rafId = null;
  let initialized = false;
  let particles = [];
  const tilt = { cx: 0, cy: 0, tx: 0, ty: 0 };

  function resize() {
    const canvas = $('antigravity-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function bindEvents() {
    if (initialized) return;
    const canvas = $('antigravity-canvas');
    const card = $('interactive-card');
    const cursorGlow = $('cursor-glow');
    if (!canvas || !card) return;
    initialized = true;

    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', (e) => {
      if (state.currentRoute !== '/auth') return;
      if (cursorGlow) {
        cursorGlow.style.opacity = '1';
        cursorGlow.style.left = `${e.clientX}px`;
        cursorGlow.style.top = `${e.clientY}px`;
      }
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      const ox = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
      const oy = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
      tilt.ty = Math.max(-5, Math.min(5, ox * 5));
      tilt.tx = Math.max(-5, Math.min(5, -oy * 5));
    });

    window.addEventListener('mouseleave', () => {
      tilt.tx = 0;
      tilt.ty = 0;
      if (cursorGlow) cursorGlow.style.opacity = '0';
    });

    const palette = ['139, 92, 246', '56, 189, 248', '192, 132, 252', '255, 255, 255'];
    particles = Array.from({ length: 65 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -Math.random() * 0.4 - 0.15,
      alpha: Math.random() * 0.5 + 0.2,
      color: palette[Math.floor(Math.random() * palette.length)],
    }));
  }

  function tick() {
    if (document.hidden || state.currentRoute !== '/auth') {
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(tick);

    const canvas = $('antigravity-canvas');
    const card = $('interactive-card');
    if (!canvas || !card) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    tilt.cx += (tilt.tx - tilt.cx) * 0.1;
    tilt.cy += (tilt.ty - tilt.cy) * 0.1;
    card.style.transform = `rotateX(${tilt.cx.toFixed(2)}deg) rotateY(${tilt.cy.toFixed(2)}deg)`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) {
        p.y = canvas.height + 10;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;

      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < 85) {
          ctx.strokeStyle = `rgba(167, 139, 250, ${(1 - dist / 85) * 0.14})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
  }

  function start() {
    bindEvents();
    resize();
    if (rafId === null && !document.hidden && state.currentRoute === '/auth') {
      rafId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { start, stop };
}
