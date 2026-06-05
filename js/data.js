// ======================================================
//  data.js — 数据层
//  包含：存储键常量、localStorage 读写封装、日期工具函数
//  注意：本文件不访问 DOM，仅提供纯数据操作
// ======================================================

// ---------- 存储键常量 ----------
const K_PERIODS     = 'xfrl_periods_v2';
const K_MOOD        = 'xfrl_mood_v2';
const K_SETTINGS    = 'xfrl_settings_v2';
const K_DEVIATIONS  = 'xfrl_deviations_v2';
const K_PERIOD_ENDS = 'xfrl_period_ends_v2';
const K_ACCOUNTS    = 'xfrl_accounts_v2';
const K_PROFILE     = 'xfrl_profile_v2';
const K_LOCKOUT     = 'xfrl_lockout';
const K_REG_KEY     = 'xfrl_reg_key';

// 星期名称
const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

// ---------- 经期数据读写 ----------
function loadPeriods() {
  try { return JSON.parse(localStorage.getItem(K_PERIODS)) || []; }
  catch { return []; }
}
function savePeriods(d) { localStorage.setItem(K_PERIODS, JSON.stringify(d)); }

// ---------- 心情/症状记录读写 ----------
function loadMoods() {
  try { return JSON.parse(localStorage.getItem(K_MOOD)) || {}; }
  catch { return {}; }
}
function saveMoods(d) { localStorage.setItem(K_MOOD, JSON.stringify(d)); }

// ---------- 设置读写 ----------
function loadSettings() {
  try {
    return Object.assign(
      { reminder: false, reminderDays: 2, mode: 'normal' },
      JSON.parse(localStorage.getItem(K_SETTINGS)) || {}
    );
  }
  catch { return { reminder: false, reminderDays: 2, mode: 'normal' }; }
}
function saveSettings(s) { localStorage.setItem(K_SETTINGS, JSON.stringify(s)); }

// ---------- 周期偏差记录读写 ----------
function loadDeviations() {
  try { return JSON.parse(localStorage.getItem(K_DEVIATIONS)) || {}; }
  catch { return {}; }
}
function saveDeviations(d) { localStorage.setItem(K_DEVIATIONS, JSON.stringify(d)); }

// ---------- 经期结束日读写 ----------
function loadPeriodEnds() {
  try { return JSON.parse(localStorage.getItem(K_PERIOD_ENDS)) || {}; }
  catch { return {}; }
}
function savePeriodEnds(d) { localStorage.setItem(K_PERIOD_ENDS, JSON.stringify(d)); }

// ---------- 账号数据读写 ----------
function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(K_ACCOUNTS)) || {}; }
  catch { return {}; }
}
function saveAccounts(d) { localStorage.setItem(K_ACCOUNTS, JSON.stringify(d)); }

// ---------- 个人资料读写 ----------
function loadProfile() {
  try {
    return Object.assign(
      { nickname: '', avatar: '', loggedIn: false, userId: '', username: '' },
      JSON.parse(localStorage.getItem(K_PROFILE)) || {}
    );
  }
  catch { return { nickname: '', avatar: '', loggedIn: false, userId: '', username: '' }; }
}
function saveProfile(p) { localStorage.setItem(K_PROFILE, JSON.stringify(p)); }

// ---------- 登录锁定读写 ----------
function loadLockout() {
  try { return JSON.parse(localStorage.getItem(K_LOCKOUT)) || {}; }
  catch { return {}; }
}
function saveLockout(d) { localStorage.setItem(K_LOCKOUT, JSON.stringify(d)); }

// ---------- 注册密钥读写 ----------
function getRegKey() {
  try { return localStorage.getItem(K_REG_KEY) || ''; }
  catch { return ''; }
}
function setRegKey(v) { localStorage.setItem(K_REG_KEY, v); }

// ======================================================
//  日期工具函数
// ======================================================

// 获取今天日期字符串，格式 "YYYY-MM-DD"
function todayStr() {
  const d = new Date();
  return fmt(d);
}

// Date 对象 → "YYYY-MM-DD" 字符串
function fmt(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// "YYYY-MM-DD" 字符串 → Date 对象
function parseDate(s) {
  const parts = s.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// 日期字符串加 n 天，返回新日期字符串
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

// 两个日期字符串之间的天数差
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// 格式化为中文短日期，如 "6月5日"
function fmtCN(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 格式化为中文完整日期，如 "2026年6月5日"
function fmtFullCN(s) {
  const d = parseDate(s);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
