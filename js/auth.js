// ======================================================
//  auth.js — 认证系统（v3：PBKDF2 密码哈希）
//  包含：密码哈希/验证、账号 CRUD、登录/注册/管理面板
//  依赖：data.js（loadAccounts, saveAccounts, loadProfile,
//        saveProfile, loadLockout, saveLockout, getRegKey,
//        setRegKey, loadSettings, saveSettings）
// ======================================================

// ---------- 防重入锁（防止 async 函数被双击并行触发）----------
var _authBusy = false;

// ---------- 密码哈希（SubtleCrypto PBKDF2）----------

// 生成确定性盐值，基于用户名
function _makeSalt(username) {
  return 'xf_v3_' + username;
}

// 对密码进行 PBKDF2 哈希，返回 64 位十六进制字符串
async function hashPassword(password, username) {
  var encoder = new TextEncoder();
  var salt = encoder.encode(_makeSalt(username));
  var keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  var derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: 50000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  var hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// 验证输入密码是否与存储的哈希匹配
async function verifyPassword(input, storedHash, username) {
  try {
    var computed = await hashPassword(input, username);
    return computed === storedHash;
  } catch (e) {
    return false;
  }
}

// ---------- 数据迁移 ----------

// v2 → v3：将明文密码迁移为 PBKDF2 哈希
async function migrateToV3() {
  if (localStorage.getItem('xfrl_migrated_v3')) return;
  var accounts = loadAccounts();
  var changed = false;
  var accountKeys = Object.keys(accounts);
  for (var i = 0; i < accountKeys.length; i++) {
    var username = accountKeys[i];
    var acct = accounts[username];
    if (acct.password && !acct.passwordHash) {
      acct.passwordHash = await hashPassword(acct.password, username);
      delete acct.password;
      changed = true;
    }
  }
  if (changed) saveAccounts(accounts);
  localStorage.setItem('xfrl_migrated_v3', '1');
}

// ---------- 账号初始化 ----------

async function initLocalAccounts() {
  // 先执行密码迁移（如有需要）
  await migrateToV3();

  // 检查登录态一致性：如果账号已被删除，清除登录态
  var p = loadProfile();
  if (p.loggedIn && p.username) {
    var accts = loadAccounts();
    if (!accts[p.username]) {
      p.loggedIn = false; p.userId = ''; p.username = '';
      saveProfile(p);
    }
  }
}

// ---------- 登录/注册弹窗控制 ----------

function showLoginModal() {
  document.getElementById('loginModal').classList.add('open');
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('open');
}

function showRegisterModal() {
  closeLoginModal();
  document.getElementById('registerModal').classList.add('open');
  document.getElementById('regError').textContent = '';
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regPassword2').value = '';
  document.getElementById('regInviteCode').value = '';
  // 第一个账号（管理员）不需要邀请码
  var accounts = loadAccounts();
  var hasAccounts = Object.keys(accounts).length > 0;
  var inviteRow = document.getElementById('inviteCodeRow');
  if (inviteRow) inviteRow.style.display = hasAccounts ? 'block' : 'none';
}

function closeRegisterModal() {
  document.getElementById('registerModal').classList.remove('open');
}

function showChangePwdModal() {
  document.getElementById('changePwdModal').classList.add('open');
  document.getElementById('changePwdError').textContent = '';
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword2').value = '';
}

function closeChangePwdModal() {
  document.getElementById('changePwdModal').classList.remove('open');
}

function showAdminModal() {
  document.getElementById('adminModal').classList.add('open');
  document.getElementById('regKeyInput').value = getRegKey();
  document.getElementById('regKeyMsg').textContent = '';
  renderAdminPanel();
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('open');
}

function closeLoginPrompt() {
  document.getElementById('loginPromptModal').classList.remove('open');
}

// ---------- 注册 ----------

async function handleRegister() {
  if (_authBusy) return;
  _authBusy = true;
  try {
    var uname = document.getElementById('regUsername').value.trim();
    var pwd   = document.getElementById('regPassword').value.trim();
    var pwd2  = document.getElementById('regPassword2').value.trim();
    var code  = document.getElementById('regInviteCode').value.trim();
    var err   = document.getElementById('regError');

    if (!uname || !pwd || !pwd2) { err.textContent = '请填写所有字段'; return; }
    if (uname.length < 2)  { err.textContent = '用户名至少2个字符'; return; }
    if (pwd.length < 4)    { err.textContent = '密码至少4位'; return; }
    if (pwd !== pwd2)      { err.textContent = '两次密码不一致'; return; }

    var accounts = loadAccounts();
    var isFirstAccount = Object.keys(accounts).length === 0;

    // 非首个账号需要验证注册密钥
    if (!isFirstAccount) {
      if (!code) { err.textContent = '请输入注册密钥'; return; }
      if (code !== getRegKey()) { err.textContent = '注册密钥错误，请向管理员索取'; return; }
    }

    if (accounts[uname]) { err.textContent = '该用户名已存在，请换一个'; return; }

    // 哈希密码后存储
    var passwordHash = await hashPassword(pwd, uname);
    accounts[uname] = { passwordHash: passwordHash, role: isFirstAccount ? 'admin' : 'user' };
    saveAccounts(accounts);

    // 首个管理员账号：自动生成注册密钥
    if (isFirstAccount) {
      var newKey = Math.random().toString(36).substring(2, 10);
      setRegKey(newKey);
    }

    // 自动登录
    var prof = loadProfile();
    prof.loggedIn = true; prof.userId = uname; prof.username = uname;
    if (!prof.nickname) prof.nickname = uname;
    saveProfile(prof);

    closeRegisterModal(); closeLoginPrompt();
    renderProfilePage(); renderHome();
    showToast('🎉 注册成功！欢迎 ' + uname);
  } finally {
    _authBusy = false;
  }
}

// ---------- 登录 ----------

async function handleLogin() {
  if (_authBusy) return;
  _authBusy = true;
  try {
    var u = document.getElementById('loginUsername').value.trim();
    var p = document.getElementById('loginPassword').value.trim();
    var err = document.getElementById('loginError');
    if (!u || !p) { err.textContent = '请输入用户名和密码'; return; }

  // 锁定检查
  var lockout = loadLockout();
  var lo = lockout[u];
  if (lo && lo.lockedUntil > Date.now()) {
    var mins = Math.ceil((lo.lockedUntil - Date.now()) / 60000);
    err.textContent = '⚠️ 账号已锁定，请' + mins + '分钟后再试';
    return;
  }

  var accounts = loadAccounts();
  var acct = accounts[u];
  if (!acct) { err.textContent = '账号不存在'; return; }

  // 使用哈希验证（兼容旧版明文密码）
  var verified = false;
  if (acct.passwordHash) {
    verified = await verifyPassword(p, acct.passwordHash, u);
  } else if (acct.password) {
    // 旧版明文密码（迁移前），直接比对
    verified = (acct.password === p);
  }

  if (!verified) {
    var now = Date.now();
    var entry = lockout[u] || { attempts: 0, lockedUntil: 0 };
    entry.attempts++;
    if (entry.attempts >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000;
      err.textContent = '⚠️ 连续输错5次，账号已锁定15分钟';
    } else {
      var left = 5 - entry.attempts;
      err.textContent = '密码错误，还剩' + left + '次机会';
    }
    saveLockout(lockout);
    return;
  }

    // 登录成功，清除锁定
    delete lockout[u];
    saveLockout(lockout);

    var prof = loadProfile();
    prof.loggedIn = true; prof.userId = u; prof.username = u;
    if (!prof.nickname) prof.nickname = u;
    saveProfile(prof);

    closeLoginModal(); closeLoginPrompt();
    renderProfilePage(); renderHome();
    showToast('登录成功 💗');
  } finally {
    _authBusy = false;
  }
}

function handleLogout() {
  var p = loadProfile();
  p.loggedIn = false; p.userId = ''; p.username = '';
  saveProfile(p);
  renderProfilePage(); renderHome();
  showToast('已退出登录');
}

// ---------- 修改密码 ----------

async function handleChangePwd() {
  if (_authBusy) return;
  _authBusy = true;
  try {
    var oldPwd  = document.getElementById('oldPassword').value.trim();
    var newPwd  = document.getElementById('newPassword').value.trim();
    var newPwd2 = document.getElementById('newPassword2').value.trim();
    var err = document.getElementById('changePwdError');
  if (!oldPwd || !newPwd || !newPwd2) { err.textContent = '请填写所有字段'; return; }
  if (newPwd.length < 4)  { err.textContent = '新密码至少4位'; return; }
  if (newPwd !== newPwd2) { err.textContent = '两次新密码不一致'; return; }

  var p = loadProfile();
  if (!p.loggedIn) { err.textContent = '请先登录'; return; }

  var accounts = loadAccounts();
  var acct = accounts[p.username];
  if (!acct) { err.textContent = '账号异常，请重新登录'; return; }

  // 验证旧密码
  var oldVerified = false;
  if (acct.passwordHash) {
    oldVerified = await verifyPassword(oldPwd, acct.passwordHash, p.username);
  } else if (acct.password) {
    oldVerified = (acct.password === oldPwd);
  }
  if (!oldVerified) { err.textContent = '当前密码错误'; return; }

  // 哈希并保存新密码
  acct.passwordHash = await hashPassword(newPwd, p.username);
  if (acct.password) delete acct.password; // 清理旧格式
  saveAccounts(accounts);

    closeChangePwdModal();
    showToast('🔒 密码已修改');
  } finally {
    _authBusy = false;
  }
}

// ---------- 管理员功能 ----------

// HTML 编码函数，防止 XSS（用于 innerHTML 中的纯文本插值）
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function handleCreateUser() {
  if (_authBusy) return;
  _authBusy = true;
  try {
    var uname = document.getElementById('newUsername').value.trim();
  var pwd   = document.getElementById('newUserPwd').value.trim();
  var err   = document.getElementById('createUserError');
  if (!uname || !pwd) { err.textContent = '请填写用户名和密码'; return; }
  if (uname.length < 2) { err.textContent = '用户名至少2个字符'; return; }
  if (pwd.length < 4)   { err.textContent = '密码至少4位'; return; }

  var accounts = loadAccounts();
  if (accounts[uname]) { err.textContent = '该用户名已存在'; return; }

  accounts[uname] = { passwordHash: await hashPassword(pwd, uname), role: 'user' };
  saveAccounts(accounts);

    err.textContent = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPwd').value = '';
    showToast('✅ 账号 ' + uname + ' 已创建');
    renderAdminPanel();
  } finally {
    _authBusy = false;
  }
}

function handleDeleteUser(username) {
  // decodeURIComponent 配合 renderAdminPanel 的 encodeURIComponent
  var u = decodeURIComponent(username);
  if (!confirm('确定要删除用户 "' + u + '" 及其所有数据吗？此操作不可撤销。')) return;
  var accounts = loadAccounts();
  delete accounts[u];
  saveAccounts(accounts);
  // 如被删的是当前登录用户，强制退出
  var p = loadProfile();
  if (p.username === u) {
    p.loggedIn = false; p.userId = ''; p.username = '';
    saveProfile(p); renderProfilePage(); renderHome();
  }
  deleteAvatarFromDB(u);
  showToast('已删除用户 ' + u);
  renderAdminPanel();
}

async function handleResetPwd(username) {
  var u = decodeURIComponent(username);
  if (!confirm('确定要重置 ' + u + ' 的密码为 123456 吗？')) return;
  var accounts = loadAccounts();
  if (accounts[u]) {
    accounts[u].passwordHash = await hashPassword('123456', u);
    if (accounts[u].password) delete accounts[u].password;
    saveAccounts(accounts);
    showToast(u + ' 密码已重置为 123456');
    renderAdminPanel();
  }
}

function handleSaveRegKey() {
  var v = document.getElementById('regKeyInput').value.trim();
  var msg = document.getElementById('regKeyMsg');
  if (!v || v.length < 4) { msg.textContent = '密钥至少4位'; msg.style.color = '#e05c5c'; return; }
  setRegKey(v);
  msg.textContent = '✅ 注册密钥已保存'; msg.style.color = 'var(--green)';
  setTimeout(function () { msg.textContent = ''; }, 2000);
}

// ---------- 管理员面板渲染 ----------

function renderAdminPanel() {
  var list = document.getElementById('adminUserList');
  var accounts = loadAccounts();
  var html = '<div style="font-size:13px;font-weight:500;margin-bottom:10px">👥 用户列表</div>';
  var hasUsers = false;
  var names = Object.keys(accounts);
  for (var i = 0; i < names.length; i++) {
    var uname = names[i];
    var info = accounts[uname];
    if (info.role === 'admin') continue;
    hasUsers = true;
    // encodeURIComponent 防止恶意用户名中的 ' 等字符逃逸 onclick
    var safe = encodeURIComponent(uname);
    html += '<div class="admin-user-row">' +
      '<div class="admin-user-info">' +
      '<div class="admin-user-name">👤 ' + escHtml(uname) + '</div>' +
      '<div class="admin-user-meta">普通用户 · 经期记录</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
      '<button class="btn-reset" onclick="handleResetPwd(\'' + safe + '\')">重置密码</button>' +
      '<button class="btn-reset" style="color:#e05c5c" onclick="handleDeleteUser(\'' + safe + '\')">删除</button>' +
      '</div></div>';
  }
  list.innerHTML = html + (hasUsers ? '' : '<div style="text-align:center;color:var(--text-muted);padding:12px">暂无普通用户</div>');
}

// ---------- 个人页渲染 ----------

// 头像背景色生成
function avatarColor(name) {
  var colors = ['#d95b74', '#c04865', '#f0a050', '#6aabcf', '#6dbf82', '#a77dc2', '#e88d9e', '#5b9ecf'];
  var idx = name.split('').reduce(function (s, c) { return s + c.charCodeAt(0); }, 0) % colors.length;
  return colors[idx];
}

function renderProfilePage() {
  var p = loadProfile();
  // 头像（先显示首字母占位，再从 IndexedDB 异步加载实际头像）
  var img = document.getElementById('profileAvatarImg');
  var ph  = document.getElementById('profileAvatarPlaceholder');
  if (p.hasAvatar) {
    // 占位显示首字母，异步加载真实头像
    if (p.nickname) {
      img.style.display = 'none'; ph.style.display = 'flex';
      ph.style.background = avatarColor(p.nickname);
      ph.textContent = p.nickname.charAt(0);
    }
    loadAvatarFromDB(p.username).then(function(dataUrl) {
      if (dataUrl) {
        img.src = dataUrl; img.style.display = 'block'; ph.style.display = 'none';
      }
    });
  } else if (p.nickname) {
    img.style.display = 'none'; ph.style.display = 'flex';
    ph.style.background = avatarColor(p.nickname);
    ph.textContent = p.nickname.charAt(0);
  } else {
    img.style.display = 'none'; ph.style.display = 'flex';
    ph.style.background = '#ccc'; ph.textContent = '?';
  }
  // 昵称
  document.getElementById('profileNameDisplay').textContent = p.nickname || '点击设置昵称';
  document.getElementById('profileNameInput').value = p.nickname || '';
  // 登录态
  if (p.loggedIn) {
    document.getElementById('profileNotLoggedIn').style.display = 'none';
    document.getElementById('profileLoggedIn').style.display = 'block';
    document.getElementById('loginWelcome').textContent = '欢迎，' + (p.nickname || p.username) + ' 💗';
    document.getElementById('btnAdmin').style.display = (p.username === 'admin') ? 'inline-block' : 'none';
    // 渲染统计数据
    renderProfileStats();
  } else {
    document.getElementById('profileNotLoggedIn').style.display = 'block';
    document.getElementById('profileLoggedIn').style.display = 'none';
  }
  // 设置 UI
  loadSettingsUI();
}

// 渲染个人信息页的统计概览
function renderProfileStats() {
  var data = getStatsData();
  var statsRow = document.getElementById('profileStatsRow');
  if (!statsRow) return;

  // 记录次数
  document.getElementById('statRecordCount').textContent = data.periods.length;

  // 平均周期
  if (data.avgCycle) {
    document.getElementById('statAvgCycle').textContent = data.avgCycle;
  } else {
    document.getElementById('statAvgCycle').textContent = '--';
  }

  // 平均经期长度
  if (data.avgDuration) {
    document.getElementById('statAvgDuration').textContent = data.avgDuration;
  } else {
    document.getElementById('statAvgDuration').textContent = '--';
  }

  // 规律度
  if (data.regularityStars) {
    document.getElementById('statRegularity').textContent = data.regularityStars;
  } else {
    document.getElementById('statRegularity').textContent = '--';
  }
}

// 加载设置 UI 状态
function loadSettingsUI() {
  var s = loadSettings();
  document.getElementById('reminderToggle').checked = s.reminder;
  document.getElementById('reminderDays').value = String(s.reminderDays);
  var row = document.getElementById('reminderDaysRow');
  row.style.opacity = s.reminder ? '1' : '0.4';
  row.style.pointerEvents = s.reminder ? 'auto' : 'none';
  // 加载周期范围设定
  var minEl = document.getElementById('minCycle');
  var maxEl = document.getElementById('maxCycle');
  if (minEl) minEl.value = String(s.minCycle || 21);
  if (maxEl) maxEl.value = String(s.maxCycle || 35);
}

// 昵称编辑
function editNickname() {
  var display = document.getElementById('profileNameDisplay');
  var input = document.getElementById('profileNameInput');
  display.style.display = 'none';
  input.style.display = '';
  input.value = display.textContent === '点击设置昵称' ? '' : display.textContent;
  input.focus();
  input.select();
}

function saveNickname() {
  var input = document.getElementById('profileNameInput');
  var display = document.getElementById('profileNameDisplay');
  var nm = input.value.trim() || display.textContent;
  var p = loadProfile(); p.nickname = nm; saveProfile(p);
  input.style.display = 'none';
  display.style.display = '';
  display.textContent = nm || '点击设置昵称';
}

// 头像上传
function handleAvatarUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('图片不能超过2MB'); e.target.value = ''; return; }
  if (!file.type.match(/image\/(jpeg|png|webp)/)) { showToast('仅支持 JPG/PNG/WebP 格式'); e.target.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function (ev) {
    var dataUrl = ev.target.result;
    // 用 Canvas 压缩头像：最大 200×200，JPEG quality 0.7，控制在 200KB 内
    var img = new Image();
    img.onload = function () {
      var MAX_W = 200, MAX_H = 200, MAX_BYTES = 200 * 1024;
      var w = img.width, h = img.height;
      if (w > MAX_W || h > MAX_H) {
        var ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
      }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // 尝试 quality 0.7，如果太大则逐步降低
      var quality = 0.7;
      var compressed = c.toDataURL('image/jpeg', quality);
      while (compressed.length > MAX_BYTES && quality > 0.1) {
        quality -= 0.1;
        compressed = c.toDataURL('image/jpeg', quality);
      }
      document.getElementById('profileAvatarImg').src = compressed;
      document.getElementById('profileAvatarImg').style.display = 'block';
      document.getElementById('profileAvatarPlaceholder').style.display = 'none';
      var p = loadProfile();
      saveAvatarToDB(p.username, compressed);
      p.hasAvatar = true;
      saveProfile(p);
      showToast('头像已更新 💗');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
