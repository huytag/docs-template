const AUTH_API = 'https://docs-auth-worker.huytagicloud.workers.dev';
const TOKEN_KEY = 'auth_token';

(async () => {
  const authScreen = document.getElementById('auth-screen');
  const appEl = document.getElementById('app');
  const loginForm = document.getElementById('login-form');
  const authError = document.getElementById('auth-error');
  const userInfo = document.getElementById('user-info');
  const logoutBtn = document.getElementById('logout-btn');
  const adminPanel = document.getElementById('admin-panel');
  const customerView = document.getElementById('customer-view');
  const searchInput = document.getElementById('search');
  const filterSelect = document.getElementById('filter-tag');
  const projectsGrid = document.getElementById('projects-grid');
  const titleEl = document.getElementById('page-title');

  let currentUser = null;
  let allProjects = [];

  function getToken() {
    const hash = window.location.hash;
    const match = hash && hash.match(/token=([^&]+)/);
    return match ? match[1] : localStorage.getItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${AUTH_API}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function checkAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const data = await api('/api/me');
      return data.user;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

  function showAuth() {
    authScreen.style.display = 'flex';
    appEl.style.display = 'none';
  }

  function showApp(user) {
    currentUser = user;
    authScreen.style.display = 'none';
    appEl.style.display = 'flex';
    appEl.style.flexDirection = 'column';
    appEl.style.minHeight = '100vh';
    userInfo.textContent = user.username;

    if (user.role === 'admin') {
      adminPanel.style.display = 'block';
      customerView.style.display = 'none';
      initAdmin();
    } else {
      adminPanel.style.display = 'none';
      customerView.style.display = 'block';
      initCustomer();
    }
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
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      showApp(data.user);
    } catch (err) {
      authError.textContent = err.message || 'Lỗi kết nối';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    showAuth();
  });

  // ===== CHANGE PASSWORD =====

  const changePwBtn = document.getElementById('change-pw-btn');
  const cpwModal = document.getElementById('change-pw-modal');
  const cpwForm = document.getElementById('change-pw-form');
  const cpwError = document.getElementById('cpw-error');

  changePwBtn.addEventListener('click', () => {
    cpwError.textContent = '';
    cpwForm.reset();
    cpwModal.style.display = 'flex';
  });

  document.getElementById('cpw-close').addEventListener('click', () => { cpwModal.style.display = 'none'; });
  document.getElementById('cpw-cancel').addEventListener('click', () => { cpwModal.style.display = 'none'; });

  cpwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    cpwError.textContent = '';
    const current = document.getElementById('cpw-current').value;
    const newPw = document.getElementById('cpw-new').value;
    const btn = document.getElementById('cpw-submit');
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await api('/api/change-password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: current, new_password: newPw }),
      });
      cpwModal.style.display = 'none';
      alert('Đổi mật khẩu thành công!');
    } catch (err) {
      cpwError.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Lưu';
    }
  });

  // ===== CUSTOMER VIEW =====

  function renderCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.tags = (project.tags || []).join(',');

    card.innerHTML = `
      <div class="project-icon">${project.icon || '📦'}</div>
      <h2 class="project-name">${project.name}</h2>
      <p class="project-desc">${project.description || ''}</p>
      <div class="project-tags">
        ${(project.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="release-info">
        ${project.version
          ? `<span class="release-version">${project.version}</span>`
          : `<span class="no-release">Chưa có phiên bản</span>`}
      </div>
      <div class="project-actions">
        ${project.repo
          ? `<a href="https://github.com/${project.repo}" class="btn btn-secondary" target="_blank" rel="noopener">GitHub</a>`
          : ''}
        ${project.download_url
          ? `<a href="${project.download_url}" class="btn btn-primary">Tải xuống</a>`
          : `<button class="btn btn-primary" disabled>Tải xuống</button>`}
      </div>
    `;
    return card;
  }

  function populateFilter(projects) {
    filterSelect.innerHTML = '<option value="all">Tất cả</option>';
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

  async function initCustomer() {
    searchInput.value = '';
    try {
      const data = await api('/api/projects');
      allProjects = data.projects || [];
      if (titleEl) titleEl.textContent = 'Tài Liệu Sản Phẩm';

      const enhanced = await Promise.all(allProjects.map(async (p) => {
        if (!p.repo) return p;
        try {
          const ghToken = localStorage.getItem('github_token');
          const headers = { 'User-Agent': 'docs-template/1.0' };
          if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;
          const releaseRes = await fetch(`https://api.github.com/repos/${p.repo}/releases/latest`, { headers });
          if (releaseRes.ok) {
            const release = await releaseRes.json();
            const assetUrl = release.assets?.[0]?.browser_download_url || release.zipball_url;
            return {
              ...p,
              version: p.version || release.tag_name || '',
              download_url: p.download_url || assetUrl || '',
            };
          }
        } catch {}
        return p;
      }));

      populateFilter(enhanced);
      projectsGrid.innerHTML = '';

      if (enhanced.length === 0) {
        projectsGrid.innerHTML = '<div class="loading">Chưa có dự án nào được phân quyền</div>';
        return;
      }

      enhanced.forEach(p => projectsGrid.appendChild(renderCard(p)));
      filterCards();
    } catch (err) {
      projectsGrid.innerHTML = `<div class="error">Lỗi tải dữ liệu: ${err.message}</div>`;
    }

    searchInput.addEventListener('input', filterCards);
    filterSelect.addEventListener('change', filterCards);
  }

  // ===== ADMIN VIEW =====

  function initAdmin() {
    setupTabs();
    loadProjectsTable();
    loadUsersTable();
    setupProjectForm();
    setupPermModal();
    setupPreview();
  }

  function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  }

  // --- GitHub Sync ---

  async function fetchGitHubRepo(repo) {
    const ghToken = localStorage.getItem('github_token');
    const headers = { 'User-Agent': 'docs-template/1.0' };
    if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;
    const [repoRes, readmeRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/readme`, { headers }).catch(() => null),
    ]);
    if (!repoRes.ok) throw new Error('Cannot fetch repo: ' + repoRes.status);
    const repoData = await repoRes.json();
    const readmeData = readmeRes?.ok ? await readmeRes.json() : null;
    const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers }).catch(() => null);
    const releaseData = releaseRes?.ok ? await releaseRes.json() : null;
    return {
      name: repoData.name || '',
      description: repoData.description || '',
      tags: repoData.topics || [],
      version: releaseData?.tag_name || '',
      download_url: releaseData?.assets?.[0]?.browser_download_url || releaseData?.zipball_url || '',
      readme_content: readmeData ? atob(readmeData.content) : '',
    };
  }

  // --- Projects CRUD ---

  async function loadProjectsTable() {
    try {
      const data = await api('/api/admin/projects');
      const tbody = document.getElementById('projects-tbody');
      tbody.innerHTML = '';
      (data.projects || []).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.icon || '📦'} ${p.name}</td>
          <td>${p.version || '-'}</td>
          <td>${(p.tags || []).map(t => `<span class="tag">${t}</span>`).join(' ')}</td>
          <td>${p.created_at ? new Date(p.created_at).toLocaleDateString('vi-VN') : '-'}</td>
          <td class="actions-cell">
            <button class="btn btn-sm btn-secondary" onclick="editProject('${p.id}')">Sửa</button>
            <button class="btn btn-sm btn-secondary" onclick="syncProject('${p.id}')">Đồng bộ</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProject('${p.id}')">Xoá</button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (err) {
      document.getElementById('projects-tbody').innerHTML = `<tr><td colspan="5">Lỗi: ${err.message}</td></tr>`;
    }
  }

  window.editProject = async (id) => {
    try {
      const data = await api('/api/admin/projects');
      const p = data.projects.find(pr => pr.id === id);
      if (!p) return;
      document.getElementById('pf-id').value = p.id;
      document.getElementById('pf-name').value = p.name;
      document.getElementById('pf-version').value = p.version || '';
      document.getElementById('pf-repo').value = p.repo || '';
      document.getElementById('pf-icon').value = p.icon || '';
      document.getElementById('pf-download-url').value = p.download_url || '';
      document.getElementById('pf-tags').value = (p.tags || []).join(', ');
      document.getElementById('pf-description').value = p.description || '';
      document.getElementById('pf-submit').textContent = 'Cập nhật';
      document.getElementById('project-form-container').style.display = 'block';
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  window.deleteProject = async (id) => {
    if (!confirm('Xoá dự án này?')) return;
    try {
      await api(`/api/admin/projects/${id}`, { method: 'DELETE' });
      loadProjectsTable();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  window.syncProject = async (id) => {
    if (!confirm('Đồng bộ dữ liệu từ GitHub?')) return;
    try {
      const data = await api('/api/admin/projects');
      const p = data.projects.find(pr => pr.id === id);
      if (!p || !p.repo) return alert('Dự án chưa có repo GitHub');
      const gh = await fetchGitHubRepo(p.repo);
      await api(`/api/admin/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: gh.name,
          version: gh.version,
          tags: gh.tags,
          description: gh.description,
          repo: p.repo,
          icon: p.icon,
          download_url: gh.download_url || p.download_url,
        }),
      });
      alert('Đồng bộ thành công!');
      loadProjectsTable();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  function setupProjectForm() {
    const form = document.getElementById('project-form');
    const container = document.getElementById('project-form-container');
    const cancelBtn = document.getElementById('pf-cancel');
    const addBtn = document.getElementById('btn-add-project');

    document.getElementById('btn-set-gh-token').addEventListener('click', () => {
      const current = localStorage.getItem('github_token') || '';
      const token = prompt('Nhập GitHub Personal Access Token (để fetch repo private):', current);
      if (token === null) return;
      if (token.trim()) {
        localStorage.setItem('github_token', token.trim());
        alert('Đã lưu GitHub Token!');
      } else {
        localStorage.removeItem('github_token');
        alert('Đã xoá GitHub Token!');
      }
    });

    addBtn.addEventListener('click', () => {
      form.reset();
      document.getElementById('pf-id').value = '';
      document.getElementById('pf-submit').textContent = 'Thêm';
      container.style.display = 'block';
    });

    cancelBtn.addEventListener('click', () => {
      container.style.display = 'none';
    });

    document.getElementById('btn-fetch-gh').addEventListener('click', async () => {
      const repo = document.getElementById('pf-repo').value.trim();
      if (!repo) return alert('Nhập GitHub repo trước (vd: huytag/AI-video-bop)');
      const btn = document.getElementById('btn-fetch-gh');
      btn.disabled = true;
      btn.textContent = 'Đang tải...';
      try {
        const gh = await fetchGitHubRepo(repo);
        document.getElementById('pf-name').value = gh.name;
        document.getElementById('pf-version').value = gh.version;
        document.getElementById('pf-tags').value = gh.tags.join(', ');
        document.getElementById('pf-description').value = gh.description;
        if (gh.download_url) document.getElementById('pf-download-url').value = gh.download_url;
      } catch (err) {
        alert('Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lấy từ GitHub';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('pf-id').value;
      const name = document.getElementById('pf-name').value.trim();
      const version = document.getElementById('pf-version').value.trim();
      const repo = document.getElementById('pf-repo').value.trim();
      const icon = document.getElementById('pf-icon').value.trim();
      const download_url = document.getElementById('pf-download-url').value.trim();
      const tags = document.getElementById('pf-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      const description = document.getElementById('pf-description').value.trim();

      const body = { name, version, repo, icon, download_url, tags, description };
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';

      try {
        if (id) {
          await api(`/api/admin/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api('/api/admin/projects', { method: 'POST', body: JSON.stringify(body) });
        }
        container.style.display = 'none';
        form.reset();
        loadProjectsTable();
      } catch (err) {
        alert('Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = id ? 'Cập nhật' : 'Thêm';
      }
    });
  }

  // --- User Permissions ---

  async function loadUsersTable() {
    try {
      const data = await api('/api/admin/users');
      const grid = document.getElementById('users-grid');
      grid.innerHTML = '';
      (data.users || []).forEach(u => {
        const card = document.createElement('div');
        card.className = 'user-card';
        const roleClass = u.role === 'admin' ? 'badge-admin' : 'badge-customer';
        const roleLabel = u.role === 'admin' ? 'Admin' : 'Customer';
        card.innerHTML = `
          <div class="user-card-avatar">${u.username.charAt(0).toUpperCase()}</div>
          <div class="user-card-name">${u.username}</div>
          <div class="user-card-role"><span class="badge ${roleClass}">${roleLabel}</span></div>
          <div class="user-card-date">${u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : ''}</div>
          <div class="user-card-action">
            ${u.role !== 'admin'
              ? `<button class="btn btn-primary btn-sm" onclick="openPerm(${u.id}, '${u.username}')">Phân quyền</button>`
              : '<span class="text-muted">Toàn quyền</span>'}
          </div>`;
        grid.appendChild(card);
      });
    } catch (err) {
      document.getElementById('users-grid').innerHTML = `<div class="error">Lỗi: ${err.message}</div>`;
    }
  }

  let permUserId = null;

  window.openPerm = async (userId, username) => {
    permUserId = userId;
    document.getElementById('perm-username').textContent = username;
    const modal = document.getElementById('perm-modal');
    modal.style.display = 'flex';

    try {
      const [projData, permData] = await Promise.all([
        api('/api/admin/projects'),
        api(`/api/admin/users/${userId}/projects`),
      ]);
      const allProjs = projData.projects || [];
      const allowedIds = permData.project_ids || [];
      const checklist = document.getElementById('perm-checklist');
      checklist.innerHTML = '';

      if (allProjs.length === 0) {
        checklist.innerHTML = '<p class="text-muted">Chưa có dự án nào</p>';
        return;
      }

      allProjs.forEach(p => {
        const label = document.createElement('label');
        label.className = 'perm-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = p.id;
        cb.checked = allowedIds.includes(p.id);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${p.icon || '📦'} ${p.name}`));
        checklist.appendChild(label);
      });
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  function setupPermModal() {
    const modal = document.getElementById('perm-modal');

    document.getElementById('perm-close').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('perm-cancel').addEventListener('click', () => { modal.style.display = 'none'; });

    document.getElementById('perm-save').addEventListener('click', async () => {
      const checked = document.querySelectorAll('#perm-checklist input:checked');
      const projectIds = [...checked].map(cb => cb.value);
      try {
        await api(`/api/admin/users/${permUserId}/projects`, {
          method: 'PUT',
          body: JSON.stringify({ project_ids: projectIds }),
        });
        modal.style.display = 'none';
        alert('Đã cập nhật phân quyền!');
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    });
  }

  // --- Preview ---

  function setupPreview() {
    const searchInput = document.getElementById('preview-search');
    const filterSelect = document.getElementById('preview-filter');
    const grid = document.getElementById('preview-grid');

    async function loadPreview() {
      try {
        const data = await api('/api/admin/projects');
        const projects = data.projects || [];
        filterSelect.innerHTML = '<option value="all">Tất cả</option>';
        const tagSet = new Set();
        projects.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
        [...tagSet].sort().forEach(tag => {
          const opt = document.createElement('option');
          opt.value = tag; opt.textContent = tag;
          filterSelect.appendChild(opt);
        });
        grid.innerHTML = '';
        if (projects.length === 0) {
          grid.innerHTML = '<div class="loading">Chưa có dự án</div>'; return;
        }
        projects.forEach(p => grid.appendChild(renderCard(p)));
        filterCards();
      } catch (err) {
        grid.innerHTML = `<div class="error">Lỗi: ${err.message}</div>`;
      }
    }

    function filterCards() {
      const q = searchInput.value.toLowerCase().trim();
      const tag = filterSelect.value;
      grid.querySelectorAll('.project-card').forEach(card => {
        const name = card.querySelector('.project-name').textContent.toLowerCase();
        const desc = card.querySelector('.project-desc').textContent.toLowerCase();
        const tags = (card.dataset.tags || '').toLowerCase();
        const matchSearch = !q || name.includes(q) || desc.includes(q) || tags.includes(q);
        const matchTag = tag === 'all' || tags.includes(tag.toLowerCase());
        card.style.display = matchSearch && matchTag ? '' : 'none';
      });
    }

    searchInput.addEventListener('input', filterCards);
    filterSelect.addEventListener('change', filterCards);

    document.querySelector('[data-tab="preview"]')?.addEventListener('click', () => {
      setTimeout(loadPreview, 50);
    });
  }

  // ===== INIT =====

  const user = await checkAuth();
  if (user) {
    showApp(user);
  } else {
    showAuth();
  }
})();
