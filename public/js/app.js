// App shell: hash router, role-aware navigation (R11), focus management and session handling.

import { api, resetMeta } from './api.js';
import { html, setHtml } from './html.js';
import { logout } from './nav.js';
import { session, ROLE_LABELS } from './session.js';
import { icon, consumeFlash, clearBanner, setFlash, errorState } from './ui.js';

import * as loginView from './views/login.js';
import * as dashboardView from './views/dashboard.js';
import * as inventoryView from './views/inventory.js';
import * as scanView from './views/scan.js';
import * as materialView from './views/material.js';
import * as materialFormView from './views/material-form.js';
import * as labelsView from './views/labels.js';
import * as activityView from './views/activity.js';
import * as menuView from './views/menu.js';

const ROUTES = [
  { pattern: /^\/login$/, view: loginView, title: 'Log in', public: true },
  { pattern: /^\/dashboard$/, view: dashboardView, title: 'Dashboard' },
  { pattern: /^\/inventory$/, view: inventoryView, title: 'Inventory' },
  { pattern: /^\/scan$/, view: scanView, title: 'Scan QR label' },
  { pattern: /^\/materials\/new$/, view: materialFormView, title: 'Register material', permission: 'materials.create' },
  { pattern: /^\/materials\/(\d{4})\/edit$/, view: materialFormView, title: 'Edit material', permission: 'materials.update' },
  { pattern: /^\/materials\/(\d{4})$/, view: materialView, title: 'Material' },
  { pattern: /^\/labels$/, view: labelsView, title: 'QR labels', permission: 'labels.read' },
  { pattern: /^\/activity$/, view: activityView, title: 'Activity log', permission: 'audit.read' },
  { pattern: /^\/menu$/, view: menuView, title: 'Menu' },
];

const NAV_ITEMS = [
  { href: '#/dashboard', label: 'Dashboard', icon: 'dashboard', match: /^\/dashboard/ },
  { href: '#/inventory', label: 'Inventory', icon: 'inventory', match: /^\/(inventory|materials\/\d{4})/ },
  { href: '#/scan', label: 'Scan', icon: 'scan', match: /^\/scan/, primary: true },
  { href: '#/materials/new', label: 'Register', icon: 'plus', match: /^\/materials\/new/, permission: 'materials.create', desktop: true },
  { href: '#/labels', label: 'Labels', icon: 'label', match: /^\/labels/, permission: 'labels.read', desktop: true },
  { href: '#/activity', label: 'Activity log', icon: 'activity', match: /^\/activity/, permission: 'audit.read', desktop: true },
  { href: '#/menu', label: 'Menu', icon: 'menu', match: /^\/menu/, mobile: true },
];

function parseHash() {
  const hash = location.hash.startsWith('#/') ? location.hash.slice(1) : '/dashboard';
  const [path, query = ''] = hash.split('?');
  return { path, params: new URLSearchParams(query), full: hash };
}

function renderChrome(path, isPublic) {
  const header = document.getElementById('app-header');
  const bottom = document.getElementById('bottom-nav');
  header.hidden = isPublic;
  bottom.hidden = isPublic;
  document.body.classList.toggle('has-bottom-nav', !isPublic);
  if (isPublic) return;

  const allowed = NAV_ITEMS.filter((item) => !item.permission || session.can(item.permission));
  const current = (item) => (item.match.test(path) ? 'page' : null);

  setHtml(
    document.getElementById('top-nav'),
    html`${allowed
      .filter((i) => !i.mobile)
      .map((i) => html`<a class="nav-link" href="${i.href}" aria-current="${current(i) ?? 'false'}">${icon(i.icon)}<span>${i.label}</span></a>`)}`,
  );
  setHtml(
    bottom,
    html`${allowed
      .filter((i) => !i.desktop)
      .map(
        (i) => html`<a class="bottom-link ${i.primary ? 'is-primary' : ''}" href="${i.href}" aria-current="${current(i) ?? 'false'}">
          <span class="bottom-link-icon">${icon(i.icon)}</span><span>${i.label}</span>
        </a>`,
      )}`,
  );

  const user = session.user;
  const box = document.getElementById('user-box');
  setHtml(
    box,
    html`<div class="user-name"><strong>${user?.displayName}</strong><span>${ROLE_LABELS[user?.role] ?? user?.role}</span></div>
      <button type="button" class="btn btn-secondary btn-sm" id="logout-btn">${icon('logout')}<span>Log out</span></button>`,
  );
  box.querySelector('#logout-btn').addEventListener('click', logout);
}

function forbidden() {
  return html`<div class="card empty-state">
    ${icon('crit')}
    <h1>You don't have access to this page</h1>
    <p>Your account role (${ROLE_LABELS[session.user?.role] ?? 'unknown'}) cannot open this page. Ask a lab manager if you need access.</p>
    <a class="btn btn-primary" href="#/dashboard">Go to the dashboard</a>
  </div>`;
}

let current = { controller: null, cleanup: null };
let firstRender = true;

async function navigate() {
  const { path, params, full } = parseHash();
  const route = ROUTES.find((r) => r.pattern.test(path));
  if (!route) {
    location.replace('#/dashboard');
    return;
  }
  if (!route.public && !session.token) {
    location.replace(`#/login?next=${encodeURIComponent(full)}`);
    return;
  }
  if (route.public && session.token) {
    location.replace('#/dashboard');
    return;
  }

  current.controller?.abort();
  try {
    current.cleanup?.();
  } catch {
    // ignore cleanup failures
  }
  const controller = new AbortController();
  current = { controller, cleanup: null };

  clearBanner();
  consumeFlash();
  renderChrome(path, Boolean(route.public));
  document.title = `${route.title} · Lab Inventory`;

  const main = document.getElementById('main');
  main.innerHTML = '';

  if (route.permission && !session.can(route.permission)) {
    setHtml(main, forbidden());
  } else {
    const ctx = { params, match: path.match(route.pattern), signal: controller.signal, path, title: route.title };
    try {
      const cleanup = await route.view.render(main, ctx);
      if (controller.signal.aborted) {
        cleanup?.();
        return;
      }
      current.cleanup = cleanup ?? null;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) return;
      if (err.status === 401) return; // handled by the auth:expired listener
      console.error(err);
      setHtml(main, errorState(err));
      main.querySelector('[data-action="retry"]')?.addEventListener('click', navigate);
    }
  }

  // Move focus to the new page so keyboard and screen-reader users land on its content.
  const target = main.querySelector('[data-autofocus]') || main.querySelector('h1');
  if (target && (!firstRender || target.hasAttribute('data-autofocus'))) {
    if (!target.hasAttribute('tabindex') && target.tagName === 'H1') target.setAttribute('tabindex', '-1');
    target.focus();
  }
  if (!firstRender) window.scrollTo(0, 0);
  firstRender = false;
}

window.addEventListener('auth:expired', () => {
  if (!session.token) return;
  session.clear();
  resetMeta();
  setFlash('warn', 'Your session has ended. Please log in again.');
  const { full } = parseHash();
  location.replace(`#/login?next=${encodeURIComponent(full)}`);
});

window.addEventListener('hashchange', navigate);

document.getElementById('skip-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('main').focus();
});

async function start() {
  if (session.token) {
    try {
      session.update(await api('/auth/me'));
    } catch {
      // 401 clears the session via auth:expired; network errors keep the cached session
    }
  }
  navigate();
}

start();
