// Mobile menu: every page the role may open, plus account info and log out.
import { html, setHtml } from '../html.js';
import { logout } from '../nav.js';
import { session, ROLE_LABELS } from '../session.js';
import { icon } from '../ui.js';

const LINKS = [
  { href: '#/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '#/inventory', label: 'Inventory table', icon: 'inventory' },
  { href: '#/scan', label: 'Scan QR label', icon: 'scan' },
  { href: '#/materials/new', label: 'Register material', icon: 'plus', permission: 'materials.create' },
  { href: '#/labels', label: 'Print QR labels', icon: 'label', permission: 'labels.read' },
  { href: '#/activity', label: 'Activity log', icon: 'activity', permission: 'audit.read' },
];

export async function render(root) {
  const user = session.user;
  setHtml(
    root,
    html`<div class="page-header"><h1>Menu</h1></div>
      <div class="stack">
        <div class="card">
          <p class="eyebrow">Signed in as</p>
          <p><strong>${user?.displayName}</strong> (${user?.username})<br /><span class="muted">${ROLE_LABELS[user?.role]}</span></p>
          <button type="button" class="btn btn-secondary btn-block" id="menu-logout">${icon('logout')}<span>Log out</span></button>
        </div>
        <nav aria-label="All pages">
          <ul class="menu-list">
            ${LINKS.filter((l) => !l.permission || session.can(l.permission)).map(
              (l) => html`<li><a href="${l.href}">${icon(l.icon)}<span>${l.label}</span>${icon('chevron', 'icon chev')}</a></li>`,
            )}
          </ul>
        </nav>
      </div>`,
  );
  root.querySelector('#menu-logout').addEventListener('click', logout);
}
