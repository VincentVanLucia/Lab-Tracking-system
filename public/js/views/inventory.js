// Searchable inventory table (F3, F8, R10): live search by name or printed ID, status and
// category filters, sorting. Always available as the fallback when scanning fails.
import { api, getMeta } from '../api.js';
import { html, setHtml } from '../html.js';
import { go } from '../nav.js';
import { startTiming } from '../perf.js';
import { session } from '../session.js';
import { STATUS_FILTERS, formatAmount, parseMaterialId } from '../status-text.js';
import { icon, stockBadge, expiryBadge, formatDate, debounce } from '../ui.js';

const SEARCH_DEBOUNCE_MS = 300; // §6.1.4: manual search debounce of 0.3–0.5 s

const SORTS = {
  name: { label: 'Name (A–Z)', fn: (a, b) => a.name.localeCompare(b.name) },
  id: { label: 'ID', fn: (a, b) => a.id.localeCompare(b.id) },
  urgency: { label: 'Most urgent first', fn: (a, b) => b.severity - a.severity || a.daysUntilExpiry - b.daysUntilExpiry || a.name.localeCompare(b.name) },
  expiry: { label: 'Expires soonest', fn: (a, b) => a.expirationDate.localeCompare(b.expirationDate) },
  updated: { label: 'Recently updated', fn: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
};

function table(items) {
  return html`<div class="table-wrap">
    <table class="data-table">
      <caption class="visually-hidden">Inventory materials</caption>
      <thead>
        <tr>
          <th scope="col">Material</th>
          <th scope="col">ID</th>
          <th scope="col">Category</th>
          <th scope="col" class="t-right">Remaining</th>
          <th scope="col">Stock status</th>
          <th scope="col">Expiration</th>
          <th scope="col">Storage</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(
          (m) => html`<tr>
            <td class="cell-primary"><a href="#/materials/${m.id}" data-open="${m.id}">${m.name}</a></td>
            <td data-label="ID" class="num"><strong>${m.id}</strong></td>
            <td data-label="Category">${m.category}</td>
            <td data-label="Remaining" class="t-right num">${formatAmount(m.quantity, m.unit)}</td>
            <td data-label="Stock">${stockBadge(m)}</td>
            <td data-label="Expiration">${expiryBadge(m)}<div class="muted small">${formatDate(m.expirationDate)}</div></td>
            <td data-label="Storage">${m.storageConditionLabel}${m.storageLocation ? html`<div class="muted small">${m.storageLocation}</div>` : ''}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export async function render(root, { params, signal }) {
  const meta = await getMeta();
  const state = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    category: params.get('category') ?? '',
    sort: SORTS[params.get('sort')] ? params.get('sort') : params.get('status') ? 'urgency' : 'name',
  };
  const canCreate = session.can('materials.create');

  setHtml(
    root,
    html`<div class="page-header">
        <div>
          <h1>Inventory</h1>
          <p class="lede">Search by material name or the 4-digit ID printed under the QR code.</p>
        </div>
        <div class="actions">
          ${canCreate ? html`<a class="btn btn-primary" href="#/materials/new">${icon('plus')}<span>Register material</span></a>` : ''}
          ${session.can('labels.read') ? html`<a class="btn btn-secondary" href="#/labels">${icon('print')}<span>Print labels</span></a>` : ''}
        </div>
      </div>

      <form class="card filters" role="search" id="filters" aria-label="Filter inventory">
        <div class="field">
          <label for="q">Search name or ID</label>
          <div class="search-input">
            ${icon('search')}
            <input id="q" name="q" type="search" value="${state.q}" autocomplete="off" enterkeyhint="search"
              placeholder="e.g. Taq or 0007" aria-describedby="q-hint" />
          </div>
          <p class="hint" id="q-hint">Press Enter on an exact ID to open it directly.</p>
        </div>
        <div class="field">
          <label for="status">Status</label>
          <select id="status" name="status">
            ${STATUS_FILTERS.map((s) => html`<option value="${s.value}" ${s.value === state.status ? 'selected' : ''}>${s.label}</option>`)}
          </select>
        </div>
        <div class="field">
          <label for="category">Category</label>
          <select id="category" name="category">
            <option value="">All categories</option>
            ${meta.categories.map((c) => html`<option value="${c}" ${c === state.category ? 'selected' : ''}>${c}</option>`)}
          </select>
        </div>
        <div class="field">
          <label for="sort">Sort by</label>
          <select id="sort" name="sort">
            ${Object.entries(SORTS).map(([k, s]) => html`<option value="${k}" ${k === state.sort ? 'selected' : ''}>${s.label}</option>`)}
          </select>
        </div>
      </form>

      <section aria-labelledby="results-heading">
        <h2 id="results-heading" class="visually-hidden">Results</h2>
        <p class="results-meta" id="results-meta" aria-live="polite"></p>
        <div id="results"></div>
      </section>`,
  );

  const form = root.querySelector('#filters');
  const results = root.querySelector('#results');
  const metaLine = root.querySelector('#results-meta');
  let items = [];
  let searchController = null;

  function syncUrl() {
    const qs = new URLSearchParams();
    for (const k of ['q', 'status', 'category']) if (state[k]) qs.set(k, state[k]);
    if (state.sort !== 'name') qs.set('sort', state.sort);
    const hash = `#/inventory${qs.toString() ? `?${qs}` : ''}`;
    history.replaceState(null, '', hash);
  }

  function draw(ms) {
    const sorted = [...items].sort(SORTS[state.sort].fn);
    const filtered = state.q || state.status || state.category;
    metaLine.textContent = `${sorted.length} ${sorted.length === 1 ? 'material' : 'materials'}${filtered ? ' match' : ''}${ms != null ? ` · retrieved in ${ms} ms` : ''}`;
    if (!sorted.length) {
      setHtml(
        results,
        html`<div class="card empty-state">${icon('search')}
          <p><strong>No materials found.</strong></p>
          <p>Check the spelling or the ID printed under the QR code, or clear the filters.</p>
          <button type="button" class="btn btn-secondary" id="clear-filters">Clear search and filters</button>
        </div>`,
      );
      results.querySelector('#clear-filters').addEventListener('click', () => {
        Object.assign(state, { q: '', status: '', category: '' });
        form.q.value = '';
        form.status.value = '';
        form.category.value = '';
        search();
      });
      return;
    }
    setHtml(results, table(sorted));
  }

  async function search({ openExact = false } = {}) {
    searchController?.abort();
    searchController = new AbortController();
    const local = searchController;
    const onAbort = () => local.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const started = performance.now();
    syncUrl();
    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.status) qs.set('status', state.status);
    if (state.category) qs.set('category', state.category);
    try {
      const data = await api(`/materials?${qs}`, { signal: local.signal });
      items = data.items;
      const exactId = parseMaterialId(state.q);
      if (openExact && exactId && items.some((m) => m.id === exactId)) {
        startTiming('manual ID search');
        go(`#/materials/${exactId}`);
        return;
      }
      draw(Math.round(performance.now() - started));
    } catch (err) {
      if (err.name !== 'AbortError') metaLine.textContent = err.message;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  const debounced = debounce(() => search(), SEARCH_DEBOUNCE_MS);
  form.q.addEventListener('input', () => {
    state.q = form.q.value.trim();
    debounced();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.q = form.q.value.trim();
    search({ openExact: true });
  });
  form.status.addEventListener('change', () => {
    state.status = form.status.value;
    search();
  });
  form.category.addEventListener('change', () => {
    state.category = form.category.value;
    search();
  });
  form.sort.addEventListener('change', () => {
    state.sort = form.sort.value;
    syncUrl();
    draw();
  });
  results.addEventListener('click', (e) => {
    if (e.target.closest('a[data-open]')) startTiming('inventory table');
  });

  await search();
  return () => searchController?.abort();
}
