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
    userInfo.textContent = `${user.username} (${user.role === 'admin' ? 'Admin' : 'Khách hàng'})`;

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

      populateFilter(allProjects);
      projectsGrid.innerHTML = '';

      if (allProjects.length === 0) {
        projectsGrid.innerHTML = '<div class="loading">Chưa có dự án nào được phân quyền</div>';
        return;
      }

      allProjects.forEach(p => projectsGrid.appendChild(renderCard(p)));
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

  function setupProjectForm() {
    const form = document.getElementById('project-form');
    const container = document.getElementById('project-form-container');
    const cancelBtn = document.getElementById('pf-cancel');
    const addBtn = document.getElementById('btn-add-project');

    addBtn.addEventListener('click', () => {
      form.reset();
      document.getElementById('pf-id').value = '';
      document.getElementById('pf-submit').textContent = 'Thêm';
      container.style.display = 'block';
    });

    cancelBtn.addEventListener('click', () => {
      container.style.display = 'none';
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
      const tbody = document.getElementById('users-tbody');
      tbody.innerHTML = '';
      (data.users || []).forEach(u => {
        const tr = document.createElement('tr');
        const roleBadge = u.role === 'admin'
          ? '<span class="badge badge-admin">Admin</span>'
          : '<span class="badge badge-customer">Customer</span>';
        tr.innerHTML = `
          <td>${u.username}</td>
          <td>${roleBadge}</td>
          <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '-'}</td>
          <td>
            ${u.role !== 'admin'
              ? `<button class="btn btn-sm btn-secondary" onclick="openPerm(${u.id}, '${u.username}')">Phân quyền</button>`
              : '<span class="text-muted">Full quyền</span>'}
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (err) {
      document.getElementById('users-tbody').innerHTML = `<tr><td colspan="4">Lỗi: ${err.message}</td></tr>`;
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

  // ===== INIT =====

  const user = await checkAuth();
  if (user) {
    showApp(user);
  } else {
    showAuth();
  }
})();
