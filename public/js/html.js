// Tiny HTML templating with automatic escaping of interpolated values (XSS-safe by default).
//   html`<p>${userText}</p>`      -> userText is escaped
//   html`<p>${raw(trustedHtml)}</p>` -> inserted verbatim (only for markup we generated)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (markup) => new SafeHtml(String(markup));

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export function setHtml(el, content) {
  el.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content ?? '');
}
