const gamesGrid = document.getElementById('gamesGrid');
const itemsGrid = document.getElementById('itemsGrid');
const searchInput = document.getElementById('search');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const diagEl = document.getElementById('diag');
const gamesPageLabel = document.getElementById('gamesPage');
const itemsPageLabel = document.getElementById('itemsPage');
const itemsNextBtn = document.getElementById('itemsNext');

let gamesPage = 1;
let itemsPage = 1;
let itemsCursor = '';
let hasNextItems = true;
const itemsCursorHistory = [''];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setDiagnostics(data) {
  diagEl.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON response (${response.status})`);
  }

  if (!response.ok) {
    const reason = data.error || data.detail || `Request failed (${response.status})`;
    const error = new Error(reason);
    error.payload = data;
    throw error;
  }

  return data;
}

function gameCard(game) {
  const url = `https://www.roblox.com/games/${game.placeId}`;
  const players = game.playerCount ?? 'N/A';
  const ratio =
    game.totalUpVotes != null && game.totalDownVotes != null
      ? `${Math.round((game.totalUpVotes / Math.max(1, game.totalUpVotes + game.totalDownVotes)) * 100)}%`
      : 'N/A';

  return `
    <article class="card">
      <h3>${escapeHtml(game.name || 'Unknown game')}</h3>
      <p>${escapeHtml(game.gameDescription || 'No description available.')}</p>
      <div class="meta"><span>👥 ${players}</span><span>👍 ${ratio}</span></div>
      <a class="btn official" href="${url}" target="_blank" rel="noreferrer">Open Official Game Page</a>
    </article>
  `;
}

function itemCard(item) {
  const url = `https://www.roblox.com/catalog/${item.id}`;
  const price = item.priceStatus === 'Free' ? 'Free' : `${item.price ?? 'N/A'} Robux`;

  return `
    <article class="card">
      <h3>${escapeHtml(item.name || 'Unknown item')}</h3>
      <p>${escapeHtml(item.description || 'No description available.')}</p>
      <div class="meta"><span>🏷 ${escapeHtml(item.itemType || 'Item')}</span><span>🪙 ${price}</span></div>
      <a class="btn official" href="${url}" target="_blank" rel="noreferrer">Open Official Item Page</a>
    </article>
  `;
}

function withLoading(state) {
  searchBtn.disabled = state;
  itemsNextBtn.disabled = state || !hasNextItems;
}

async function fetchGames() {
  const q = encodeURIComponent(searchInput.value.trim());
  setStatus('Loading games...');

  const data = await fetchJson(`/api/games?q=${q}&page=${gamesPage}&limit=12`);
  const list = data.games || [];

  gamesGrid.innerHTML = list.length ? list.map(gameCard).join('') : '<p class="empty">No games found.</p>';
  gamesPageLabel.textContent = `Page ${gamesPage}`;
  setDiagnostics({ gamesMeta: data.meta || null });
}

async function fetchItems() {
  const q = encodeURIComponent(searchInput.value.trim());
  setStatus('Loading marketplace items...');

  const data = await fetchJson(`/api/catalog?q=${q}&page=${itemsPage}&cursor=${encodeURIComponent(itemsCursor)}&limit=12`);
  const list = data.data || [];

  itemsGrid.innerHTML = list.length ? list.map(itemCard).join('') : '<p class="empty">No items found.</p>';
  itemsPageLabel.textContent = `Page ${itemsPage}`;

  hasNextItems = Boolean(data.nextPageCursor);
  itemsNextBtn.disabled = !hasNextItems;

  if (data.nextPageCursor) {
    itemsCursorHistory[itemsPage] = data.nextPageCursor;
  }

  setDiagnostics({
    catalogMeta: data.meta || null,
    hasNextItems,
    nextCursorPresent: Boolean(data.nextPageCursor),
  });
}

async function refreshAll() {
  withLoading(true);
  try {
    await Promise.all([fetchGames(), fetchItems()]);
    setStatus('Loaded live Roblox data successfully.');
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
    setDiagnostics(error.payload || { message: error.message });
    if (!gamesGrid.innerHTML.trim()) gamesGrid.innerHTML = '<p class="empty">Failed to load games.</p>';
    if (!itemsGrid.innerHTML.trim()) itemsGrid.innerHTML = '<p class="empty">Failed to load marketplace items.</p>';
  } finally {
    withLoading(false);
  }
}

function resetSearchState() {
  gamesPage = 1;
  itemsPage = 1;
  itemsCursor = '';
  hasNextItems = true;
  itemsCursorHistory.length = 1;
  itemsCursorHistory[0] = '';
}

searchBtn.addEventListener('click', () => {
  resetSearchState();
  refreshAll();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchBtn.click();
  }
});

document.getElementById('gamesPrev').addEventListener('click', () => {
  gamesPage = Math.max(1, gamesPage - 1);
  refreshAll();
});

document.getElementById('gamesNext').addEventListener('click', () => {
  gamesPage += 1;
  refreshAll();
});

document.getElementById('itemsPrev').addEventListener('click', () => {
  if (itemsPage <= 1) return;
  itemsPage -= 1;
  itemsCursor = itemsCursorHistory[itemsPage - 1] || '';
  refreshAll();
});

itemsNextBtn.addEventListener('click', () => {
  if (!hasNextItems) return;
  itemsPage += 1;
  itemsCursor = itemsCursorHistory[itemsPage - 1] || '';
  refreshAll();
});

refreshAll();
