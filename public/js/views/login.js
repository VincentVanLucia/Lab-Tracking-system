// Login view (F9, R11).
import { api, resetMeta } from '../api.js';
import { html, setHtml } from '../html.js';
import { go } from '../nav.js';
import { session } from '../session.js';
import { icon, fieldError, clearFieldErrors, showFieldErrors } from '../ui.js';

function safeNext(next) {
  return typeof next === 'string' && /^\/[a-z]/.test(next) && !next.startsWith('/login') ? `#${next}` : '#/dashboard';
}

export async function render(root, { params }) {
  setHtml(
    root,
    html`<div class="auth-page">
      <div class="card auth-card">
        <div class="auth-brand">
          ${icon('logo', 'brand-mark')}
          <div>
            <p class="eyebrow">Smart Laboratory</p>
            <h1>Inventory &amp; Reagent Tracking</h1>
          </div>
        </div>
        <form id="login-form" novalidate>
          <div class="form-error" id="login-error" role="alert"></div>
          <div class="field">
            <label for="username">Username</label>
            <input id="username" name="username" type="text" autocomplete="username" autocapitalize="none"
              spellcheck="false" required aria-describedby="err-username" data-autofocus />
            ${fieldError('username')}
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required
              aria-describedby="err-password" />
            ${fieldError('password')}
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Log in</button>
        </form>
        <p class="muted small">Use the account provided by your lab manager.</p>
      </div>
    </div>`,
  );

  const form = root.querySelector('#login-form');
  const formError = root.querySelector('#login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    formError.textContent = '';
    const username = form.username.value.trim();
    const password = form.password.value;
    const errors = {};
    if (!username) errors.username = 'Enter your username.';
    if (!password) errors.password = 'Enter your password.';
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors).first?.focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username, password } });
      session.set(data);
      resetMeta();
      go(safeNext(params.get('next')));
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) showFieldErrors(form, err.fields).first?.focus();
      else {
        formError.textContent = err.message;
        form.password.select();
        form.password.focus();
      }
    } finally {
      button.disabled = false;
    }
  });
}
