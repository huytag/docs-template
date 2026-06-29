const AUTH_API = 'https://docs-auth-worker.huytagicloud.workers.dev';

(async () => {
  const CACHE_KEY = 'docs_cache';
  const CACHE_TTL = 5 * 60 * 1000;
  const TOKEN_KEY = 'auth_token';

  const grid = document.getElementById('projects-grid');
  const searchInput = document.getElementById('search');
  const filterSelect = document.getElementById('filter-tag');
  const titleEl = document.getElementById('page-title');
  const authScreen = document.getElementById('auth-screen');
  const loginForm = document.getElementById('login-form');
  const authError = document.getElementById('auth-error');

  function getToken() {
    const hash = window.location.hash;
    const match = hash && hash.match(/token=([^&]+)/);
    return match ? match[1] : null;
  }

  async function checkAuth() {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      const res = await fetch(`${AUTH_API}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { localStorage.removeItem(TOKEN_KEY); return false; }
      const data = await res.json();
      return data.user;
    } catch { return false; }
  }

  async function showAuthScreen() {
    authScreen.style.display = 'flex';
    document.querySelector('.header').style.display = 'none';
    document.querySelector('main').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';
  }

  function hideAuthScreen() {
    authScreen.style.display = 'none';
    document.querySelector('.header').style.display = '';
    document.querySelector('main').style.display = '';
    document.querySelector('.footer').style.display = '';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    try {
      const res = await fetch(`${AUTH_API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { authError.textContent = data.error || 'Đăng nhập thất bại'; return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      hideAuthScreen();
      initApp();
    } catch (err) {
      authError.textContent = 'Lỗi kết nối đến máy chủ';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchLatestRelease(repo) {
    const token = getToken();
    const headers = token ? { Authorization: `token ${token}` } : {};
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json();
  }

  async function loadConfig() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) return data;
    }
    const data = await fetchJSON('projects.json');
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  }

  function renderCard(project, release) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.tags = (project.tags || []).join(',');

    let version = project.version || (release ? release.tag_name : null);
    let date = release ? new Date(release.published_at).toLocaleDateString('vi-VN') : null;
    let zipUrl = project.downloadUrl || (release ? release.zipball_url : null);

    card.innerHTML = `
      <div class="project-icon">${project.icon || '📦'}</div>
      <h2 class="project-name">${project.name}</h2>
      <p class="project-desc">${project.description || ''}</p>
      <div class="project-tags">
        ${(project.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="release-info">
        ${version
          ? `<span class="release-version">${version}</span><span class="release-date">${date || ''}</span>`
          : `<span class="no-release">Chưa có bản phát hành</span>`}
      </div>
      <div class="project-actions">
        <a href="https://github.com/${project.repo}" class="btn btn-secondary" target="_blank" rel="noopener">
          GitHub
        </a>
        ${zipUrl
          ? `<a href="${zipUrl}" class="btn btn-primary">Tải xuống</a>`
          : `<button class="btn btn-primary" disabled>Tải xuống</button>`}
      </div>
    `;
    return card;
  }

  function populateFilter(projects) {
    const tagSet = new Set();
    projects.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
    [...tagSet].sort().forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      filterSelect.appendChild(opt);
    });
  }

  function filterCards() {
    const q = searchInput.value.toLowerCase().trim();
    const tag = filterSelect.value;
    document.querySelectorAll('.project-card').forEach(card => {
      const name = card.querySelector('.project-name').textContent.toLowerCase();
      const desc = card.querySelector('.project-desc').textContent.toLowerCase();
      const tags = (card.dataset.tags || '').toLowerCase();
      const matchSearch = !q || name.includes(q) || desc.includes(q) || tags.includes(q);
      const matchTag = tag === 'all' || tags.includes(tag.toLowerCase());
      card.style.display = matchSearch && matchTag ? '' : 'none';
    });
  }

  async function initApp() {
    try {
      const config = await loadConfig();
      if (config.title) titleEl.textContent = config.title;

      populateFilter(config.projects);
      grid.innerHTML = '';

      const cards = await Promise.all(config.projects.map(async (project) => {
        try {
          const release = await fetchLatestRelease(project.repo);
          return renderCard(project, release);
        } catch {
          return renderCard(project, null);
        }
      }));

      cards.forEach(c => grid.appendChild(c));
      filterCards();
    } catch (err) {
      grid.innerHTML = `<div class="error">Lỗi tải dữ liệu: ${err.message}</div>`;
    }

    searchInput.addEventListener('input', filterCards);
    filterSelect.addEventListener('change', filterCards);
  }

  const user = await checkAuth();
  if (user) {
    hideAuthScreen();
    initApp();
  } else {
    showAuthScreen();
  }
})();
