(async () => {
  const CACHE_KEY = 'docs_cache';
  const CACHE_TTL = 5 * 60 * 1000;

  const grid = document.getElementById('projects-grid');
  const searchInput = document.getElementById('search');
  const filterSelect = document.getElementById('filter-tag');
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchLatestRelease(repo) {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const res = await fetch(url);
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

    const version = release ? release.tag_name : null;
    const date = release ? new Date(release.published_at).toLocaleDateString('vi-VN') : null;
    const zipUrl = release ? release.zipball_url : null;

    card.innerHTML = `
      <div class="project-icon">${project.icon || '📦'}</div>
      <h2 class="project-name">${project.name}</h2>
      <p class="project-desc">${project.description || ''}</p>
      <div class="project-tags">
        ${(project.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="release-info">
        ${version
          ? `<span class="release-version">${version}</span><span class="release-date">${date}</span>`
          : `<span class="no-release">Chưa có release</span>`}
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

  try {
    const config = await loadConfig();
    if (config.title) titleEl.textContent = config.title;
    if (config.subtitle) subtitleEl.textContent = config.subtitle;

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
})();
