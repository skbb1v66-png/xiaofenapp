// ======================================================
//  ui.js — UI 渲染与交互
//  包含：首页/日历/心情/导航/Toast/PWA/设置/数据导出导入
//  依赖：data.js → cycle.js → auth.js（按此顺序加载）
// ======================================================

// ---------- 模块级状态 ----------
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var selectedMood = null;
var selectedSymptoms = new Set();
var selectedFlow = null;
var pendingMode = null;
var toastTimer = null;
var deferredPrompt = null;

// ======================================================
//  首页渲染
// ======================================================

function renderHome() {
  var periods = loadPeriods();
  var settings = loadSettings();
  var card = document.getElementById('statusCard');
  var cycleBarCard = document.getElementById('cycleBarCard');
  var fertilityExtra = document.getElementById('fertilityExtra');
  var addPeriodCard = document.getElementById('addPeriodCard');
  var modeBadge = document.getElementById('modeBadge');
  var endPeriodCard = document.getElementById('endPeriodCard');
  var profile = loadProfile();

  // 未登录 → 显示登录提示
  if (!profile.loggedIn) {
    // 检查是否无任何账号（首次使用）
    var accounts = loadAccounts();
    card.innerHTML = Object.keys(accounts).length === 0
      ? '<div class="first-use"><span class="first-use-emoji">🌸</span>' +
        '<div class="first-use-text">欢迎使用小粉日历<br>创建管理员账号开始使用 💗</div>' +
        '<button class="btn-add" style="margin-top:14px;font-size:14px" onclick="showSetupModal()">🔑 创建管理员账号</button></div>'
      : '<div class="first-use"><span class="first-use-emoji">🌸</span>' +
        '<div class="first-use-text">欢迎使用小粉日历<br>让我们一起了解你的身体节律 💗</div></div>';
    cycleBarCard.style.display = 'none';
    fertilityExtra.style.display = 'none';
    addPeriodCard.style.display = 'none';
    if (endPeriodCard) endPeriodCard.style.display = 'none';
    modeBadge.style.display = 'none';
    document.getElementById('loginPromptModal').classList.add('open');
    return;
  }

  // 已登录
  addPeriodCard.style.display = 'block';
  modeBadge.style.display = 'block';
  modeBadge.textContent = settings.mode === 'fertility' ? '🌱 备孕模式' : '🌸 经期模式';

  if (!periods.length) {
    card.innerHTML = '<div class="first-use"><span class="first-use-emoji">🌸</span>' +
      '<div class="first-use-text">欢迎使用小粉日历<br>点击下方记录第一次经期开始日<br>让我们一起了解你的身体节律 💗</div></div>';
    cycleBarCard.style.display = 'none';
    fertilityExtra.style.display = 'none';
    return;
  }

  var info = getPhaseInfo(periods);
  var daysLabel = info.daysTo === 0 ? '今天来访' :
    info.daysTo < 0 ? '已推迟 ' + (-info.daysTo) + ' 天' :
    info.daysTo + ' 天后来访';

  var chipHTML = '';
  if (info.phase === '排卵期') {
    chipHTML = '<div class="chip"><div class="chip-label">易孕期</div><div class="chip-value">' +
      fmtCN(info.fertileStart) + '–' + fmtCN(info.fertileEnd) +
      '</div></div><div class="chip"><div class="chip-label">排卵日</div><div class="chip-value">' +
      fmtCN(info.ovulation) + '</div></div>';
  } else {
    chipHTML = '<div class="chip"><div class="chip-label">预测下次经期</div><div class="chip-value">' +
      fmtCN(info.nextPeriod) + '</div></div><div class="chip"><div class="chip-label">平均周期</div>' +
      '<div class="chip-value">' + info.cycle + '天' + (periods.length < 2 ? ' (默认)' : '') + '</div></div>';
  }

  card.innerHTML =
    '<div class="phase-badge">' + info.emoji + ' ' + info.phase + '</div>' +
    '<div class="days-row">' +
    '<div class="days-num">' + Math.abs(info.daysTo) + '</div>' +
    '<div class="days-unit">' + (info.daysTo === 0 ? '' : info.daysTo < 0 ? '天' : '天后') + '</div>' +
    '</div>' +
    '<div class="days-tip">' + daysLabel + '<br><span style="font-size:12px">' + info.tip + '</span></div>' +
    '<div class="info-chips">' + chipHTML + '</div>';

  // 周期进度条
  cycleBarCard.style.display = 'block';
  var pct = Math.min(100, Math.max(0, (info.dayInCycle / info.cycle) * 100));
  var periodPct = (info.actualPeriodLen / info.cycle * 100).toFixed(0);
  var ovulPct = ((info.cycle - 14) / info.cycle * 100).toFixed(0);
  var fertileEndPct = ((info.cycle - 12) / info.cycle * 100).toFixed(0);
  var fill = document.getElementById('cycleBarFill');
  fill.style.width = pct + '%';
  fill.style.background = 'linear-gradient(90deg,#f4a7ba 0%,#fce4eb ' + periodPct +
    '%,#fce4eb ' + ((info.cycle - 16) / info.cycle * 100).toFixed(0) +
    '%,var(--orange) ' + ovulPct + '%,#fce4eb ' + fertileEndPct + '%,#fce4eb 100%)';
  document.getElementById('cycleBarCursor').style.left = pct + '%';
  document.getElementById('cycleEndLabel').textContent = '第' + info.cycle + '天';

  // 备孕模式
  if (settings.mode === 'fertility') {
    fertilityExtra.style.display = 'block';
    var fc = document.getElementById('fertilityCard');
    fc.innerHTML =
      '<div class="card-title">🌡️ 备孕指南</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="chip"><div class="chip-label">预测排卵日</div><div class="chip-value" style="color:var(--orange)">' +
      fmtCN(info.ovulation) + ' ' + WEEKDAYS[parseDate(info.ovulation).getDay()] + '</div></div>' +
      '<div class="chip"><div class="chip-label">易孕窗口期</div><div class="chip-value">' +
      fmtCN(info.fertileStart) + ' — ' + fmtCN(info.fertileEnd) + '</div></div>' +
      '<div class="chip"><div class="chip-label">距排卵日</div><div class="chip-value">' +
      (diffDays(info.today, info.ovulation) > 0 ? diffDays(info.today, info.ovulation) + '天后' : '已过') +
      (diffDays(info.today, info.ovulation) === 0 ? ' 今天是排卵日🎯' : '') + '</div></div>' +
      '<div style="font-size:12px;color:var(--text-muted);line-height:1.7;background:var(--bg);padding:10px 12px;border-radius:10px">' +
      '💡 备孕小贴士：在易孕期内保持轻松心态，规律同房，补充叶酸，避免熬夜。排卵期前后同房受孕概率最高。</div></div>';
  } else {
    fertilityExtra.style.display = 'none';
  }

  renderDeviationCard();
  renderEndPeriodCard();
  renderStatsCard();
}

// ---------- 周期偏差卡片 ----------

function renderDeviationCard() {
  var card = document.getElementById('deviationCard');
  var periods = loadPeriods();
  var devs = loadDeviations();
  var sorted = periods.slice().sort();
  if (sorted.length < 2) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // 统计
  var early = 0, late = 0, ontime = 0, totalDev = 0, devCount = 0;
  sorted.forEach(function (p) {
    var d = devs[p];
    if (!d) return;
    totalDev += d.deviation;
    devCount++;
    if (d.status === 'early') early++;
    else if (d.status === 'late') late++;
    else ontime++;
  });

  var avgDev = devCount > 0 ? (totalDev / devCount).toFixed(1) : '0';
  var avgSign = Number(avgDev) > 0 ? '推迟' + avgDev + '天' :
    Number(avgDev) < 0 ? '提前' + Math.abs(avgDev) + '天' : '基本准时';

  document.getElementById('deviationSummary').innerHTML =
    '<div class="deviation-stat">✅ 准时 ' + ontime + '次</div>' +
    '<div class="deviation-stat">🟠 提前 ' + early + '次</div>' +
    '<div class="deviation-stat">🔴 推迟 ' + late + '次</div>' +
    '<div class="deviation-stat">📏 平均 ' + avgSign + '</div>';

  // 列表（最近8条）
  document.getElementById('deviationList').innerHTML = sorted.reverse().slice(0, 8).map(function (p) {
    var d = devs[p];
    if (!d) {
      return '<div class="deviation-item">' +
        '<div class="deviation-date">' + fmtCN(p) + ' ' + WEEKDAYS[parseDate(p).getDay()] + '</div>' +
        '<div class="deviation-badge first">首次记录</div></div>';
    }
    var abs = Math.abs(d.deviation);
    var detail = d.status === 'ontime' ? '准时' :
      d.status === 'early' ? '提前' + abs + '天' : '推迟' + abs + '天';
    if (d.anomaly) detail += ' ⚠️';
    var statusEmojis = { early: '🟠', late: '🔴', ontime: '🟢' };
    return '<div class="deviation-item">' +
      '<div class="deviation-date">' + fmtCN(p) + ' ' + WEEKDAYS[parseDate(p).getDay()] + '</div>' +
      '<div class="deviation-badge ' + d.status + '">' + (statusEmojis[d.status] || '') + ' ' + detail + '</div></div>';
  }).join('');
}

// ---------- 统计分析卡片 ----------

function renderStatsCard() {
  var card = document.getElementById('statsCard');
  var data = getStatsData();
  if (data.periods.length < 2) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  document.getElementById('statsGrid').innerHTML =
    '<div class="stats-item"><div class="stats-value">' + (data.avgCycle || '--') +
    '<span style="font-size:14px">天</span></div><div class="stats-label">平均周期</div></div>' +
    '<div class="stats-item"><div class="stats-value green">' + (data.avgDuration || '--') +
    '<span style="font-size:14px">天</span></div><div class="stats-label">平均经期</div></div>' +
    '<div class="stats-item"><div class="stats-value orange">' + (data.shortestCycle || '--') + '-' +
    (data.longestCycle || '--') + '<span style="font-size:14px">天</span></div><div class="stats-label">周期范围</div></div>' +
    '<div class="stats-item"><div class="stats-value orange">' + (data.regularityStars || '--') +
    '</div><div class="stats-label">' + (data.regularity || '需要更多数据') + '</div></div>';

  // 周期趋势图
  var cycleSec = document.getElementById('cycleTrendSection');
  if (data.cycles.length >= 2) {
    cycleSec.style.display = 'block';
    var vals = data.cycles.map(function (c) { return c.days; });
    var maxVal = Math.max.apply(null, vals);
    var minVal = Math.min.apply(null, vals);
    var range = Math.max(maxVal - minVal, 6);
    document.getElementById('cycleTrend').innerHTML =
      '<div class="trend-avg-line" style="bottom:' + ((data.avgCycle - minVal) / range * 100).toFixed(0) + '%"></div>' +
      '<div class="trend-avg-label" style="bottom:' + ((data.avgCycle - minVal) / range * 100).toFixed(0) + '%">均' + data.avgCycle + '天</div>' +
      data.cycles.slice(-10).map(function (c) {
        var h = Math.max(15, ((c.days - minVal) / range * 100).toFixed(0));
        var color = c.days <= data.avgCycle + 1 && c.days >= data.avgCycle - 1 ? '#d95b74' :
          c.days < data.avgCycle ? '#f0a050' : '#e88';
        return '<div class="trend-bar cycle-bar" style="height:' + h + '%;background:' + color +
          '" title="' + c.start + '→' + c.end + ': ' + c.days + '天">' +
          '<div class="trend-bar-label">' + c.days + '天</div></div>';
      }).join('');
  } else { cycleSec.style.display = 'none'; }

  // 经期长度趋势图
  var durSec = document.getElementById('durationTrendSection');
  if (data.durations.length >= 2) {
    durSec.style.display = 'block';
    var dvals = data.durations.map(function (d) { return d.days; });
    var dmaxVal = Math.max.apply(null, dvals.concat([7]));
    var dminVal = Math.min.apply(null, dvals.concat([1]));
    var drange = Math.max(dmaxVal - dminVal, 3);
    document.getElementById('durationTrend').innerHTML =
      data.durations.slice(-10).map(function (d) {
        var h = Math.max(18, ((d.days - dminVal) / drange * 100).toFixed(0));
        return '<div class="trend-bar duration-bar" style="height:' + h + '%" title="' +
          d.start + '→' + d.end + ': ' + d.days + '天">' +
          '<div class="trend-bar-label">' + d.days + '天</div></div>';
      }).join('');
  } else { durSec.style.display = 'none'; }
}

// ---------- 经期结束日卡片 ----------

function renderEndPeriodCard() {
  var card = document.getElementById('endPeriodCard');
  var unended = getUnendedPeriod();
  if (!unended) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  var daysIn = diffDays(unended, todayStr()) + 1;
  // 更新天数计数器
  document.getElementById('periodDayNum').textContent = daysIn;
  // 更新经期信息
  document.getElementById('endPeriodHint').innerHTML =
    '从 <b>' + fmtCN(unended) + '</b> 开始，今天是<b>第 ' + daysIn + ' 天</b>';
  var di = document.getElementById('endDateInput');
  di.value = todayStr(); di.max = todayStr(); di.min = unended;
}

// ======================================================
//  日历渲染
// ======================================================

function calNav(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  var periods = loadPeriods();
  var phases = getDatePhases(periods);
  var devs = loadDeviations();
  var today = todayStr();
  document.getElementById('calMonthLabel').textContent = calYear + '年' + (calMonth + 1) + '月';
  var grid = document.getElementById('calGrid');
  var firstDay = new Date(calYear, calMonth, 1).getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var html = '';
  for (var i = 0; i < firstDay; i++) html += '<div class="cal-day other-month"></div>';
  var moods = loadMoods();
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var ph = phases[ds] || {};
    var hasMood = !!moods[ds];
    var cls = 'cal-day';
    if (ds === today) cls += ' today';
    if (ph.periodStart) cls += ' period-start';
    else if (ph.period) cls += ' period';
    else if (ph.ovulation) cls += ' ovulation';
    else if (ph.fertile) cls += ' fertile';
    var extras = '';
    if (ph.periodStart && devs[ds]) {
      var st = devs[ds].status;
      var abs = Math.abs(devs[ds].deviation);
      var label = st === 'ontime' ? '准时' : st === 'early' ? '提前' + abs + '天' : '推迟' + abs + '天';
      if (devs[ds].anomaly) { label += ' ⚠️'; cls += ' anomaly'; }
      cls += ' has-tag';
      extras += '<div class="cal-deviation-tag ' + st + '">' + label + '</div>';
    }
    var dot = hasMood ? '<div class="cal-dot" style="background:var(--primary-light)"></div>' : '';
    html += '<div class="' + cls + '" onclick="calDayClick(\'' + ds + '\')">' + d + extras + dot + '</div>';
  }
  grid.innerHTML = html;
}

function calDayClick(ds) {
  var periods = loadPeriods();
  var phases = getDatePhases(periods);
  var devs = loadDeviations();
  var ph = phases[ds] || {};
  var moods = loadMoods();
  var m = moods[ds] || {};
  var phaseName = ph.periodStart ? '经期开始' : ph.period ? '经期中' : ph.ovulation ? '排卵日' : ph.fertile ? '易孕期' : '安全期';
  var moodNames = { happy: '开心', calm: '平静', tired: '疲惫', sad: '低落', anxious: '焦虑', irritable: '烦躁', romantic: '浪漫', excited: '兴奋' };
  var moodEmojis = { happy: '😊', calm: '😌', tired: '😴', sad: '😢', anxious: '😰', irritable: '😤', romantic: '🥰', excited: '🤩' };
  var moodStr = m.mood ? (moodEmojis[m.mood] || '') + '' + (moodNames[m.mood] || '') : '';
  var symStr = (m.symptoms || []).length ? m.symptoms.join('、') : '';
  var devStr = '';
  if (ph.periodStart && devs[ds]) {
    var d = devs[ds];
    devStr = d.status === 'ontime' ? ' ✅准时' : d.status === 'early' ? ' 🟠提前' + Math.abs(d.deviation) + '天' : ' 🔴推迟' + d.deviation + '天';
    if (d.anomaly) devStr += ' ⚠️异常';
  }
  showToast(phaseName + (moodStr ? ' · ' + moodStr : '') + devStr);
}

// ======================================================
//  心情/症状记录
// ======================================================

function toggleMood(mood, el) {
  var btns = document.querySelectorAll('#moodGrid .mood-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  if (selectedMood === mood) { selectedMood = null; }
  else { selectedMood = mood; el.classList.add('selected'); }
}

function toggleFlow(flow, el) {
  var btns = document.querySelectorAll('#flowGrid .sym-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  if (selectedFlow === flow) { selectedFlow = null; }
  else { selectedFlow = flow; el.classList.add('selected'); }
}

function toggleSym(sym, el) {
  if (selectedSymptoms.has(sym)) { selectedSymptoms.delete(sym); el.classList.remove('selected'); }
  else { selectedSymptoms.add(sym); el.classList.add('selected'); }
}

function saveMoodEntry() {
  if (!loadProfile().loggedIn) { document.getElementById('loginPromptModal').classList.add('open'); return; }
  var today = todayStr();
  var moods = loadMoods();
  moods[today] = {
    mood: selectedMood,
    symptoms: Array.from(selectedSymptoms),
    flow: selectedFlow,
    note: document.getElementById('noteInput').value.trim(),
    ts: Date.now()
  };
  saveMoods(moods);
  showToast('记录已保存 💗');
  renderMoodHistory();
}

function renderMoodPage() {
  var today = todayStr();
  var d = parseDate(today);
  document.getElementById('moodDateLabel').textContent =
    (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEKDAYS[d.getDay()];
  var moods = loadMoods();
  var e = moods[today] || {};
  selectedMood = e.mood || null;
  selectedSymptoms = new Set(e.symptoms || []);
  selectedFlow = e.flow || null;

  var flowBtns = document.querySelectorAll('#flowGrid .sym-btn');
  for (var i = 0; i < flowBtns.length; i++)
    flowBtns[i].classList.toggle('selected', flowBtns[i].dataset.flow === selectedFlow);

  var moodBtns = document.querySelectorAll('#moodGrid .mood-btn');
  for (var j = 0; j < moodBtns.length; j++)
    moodBtns[j].classList.toggle('selected', moodBtns[j].dataset.mood === selectedMood);

  var symBtns = document.querySelectorAll('#symptomGrid .sym-btn');
  for (var k = 0; k < symBtns.length; k++)
    symBtns[k].classList.toggle('selected', selectedSymptoms.has(symBtns[k].dataset.sym));

  document.getElementById('noteInput').value = e.note || '';
  renderMoodHistory();
}

function renderMoodHistory() {
  var moods = loadMoods();
  var keys = Object.keys(moods).sort().reverse().slice(0, 14);
  var card = document.getElementById('moodHistCard');
  var list = document.getElementById('moodHistList');
  if (!keys.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  var symNames = { cramps: '痛经', bloating: '腹胀', headache: '头痛', backache: '腰酸', acne: '痘痘',
    breast: '乳房胀', nausea: '恶心', discharge: '分泌物增多', insomnia: '失眠', appetite: '食欲增加' };
  var flowNames = { none: '🈚', light: '🔸少', medium: '🔴中', heavy: '🔴🔴多' };
  var moodEmojis = { happy: '😊', calm: '😌', tired: '😴', sad: '😢', anxious: '😰', irritable: '😤', romantic: '🥰', excited: '🤩' };

  list.innerHTML = '<div class="history-list">' + keys.map(function (ds) {
    var m = moods[ds];
    var syms = (m.symptoms || []).map(function (s) { return symNames[s] || s; }).join(' · ');
    return '<div class="history-item">' +
      '<div class="h-left">' +
      '<div class="h-date">' + fmtCN(ds) + ' ' + WEEKDAYS[parseDate(ds).getDay()] + ' ' +
      (m.mood ? (moodEmojis[m.mood] || '') : '') + ' ' + (m.flow ? (flowNames[m.flow] || '') : '') + '</div>' +
      '<div class="h-meta">' + (syms || '无症状') + (m.note ? ' · ' + m.note : '') + '</div>' +
      '</div></div>';
  }).join('') + '</div>';
}

// ======================================================
//  经期记录
// ======================================================

// 一键记录经期开始（今天）
function quickAddPeriod() {
  if (!loadProfile().loggedIn) { document.getElementById('loginPromptModal').classList.add('open'); return; }
  var v = todayStr();
  var err = document.getElementById('errorMsg');
  var periods = loadPeriods();
  if (periods.indexOf(v) !== -1) { err.textContent = '今天已记录过了'; return; }
  document.getElementById('dateInput').value = v;
  handleAdd();
}

// 一键记录经期结束（今天）
function quickEndPeriod() {
  if (!loadProfile().loggedIn) { document.getElementById('loginPromptModal').classList.add('open'); return; }
  var v = todayStr();
  var start = getUnendedPeriod();
  var err = document.getElementById('endErrorMsg');
  if (!start) { err.textContent = '没有可关联的经期开始日'; return; }
  if (v < start) { err.textContent = '结束日期不能早于开始日期'; return; }
  document.getElementById('endDateInput').value = v;
  handleAddEnd();
}

// 展开/折叠经期开始日期选择
function toggleAddDate() {
  var row = document.getElementById('addDateRow');
  var arrow = document.getElementById('addDateArrow');
  if (row.style.display === 'none' || !row.style.display) {
    row.style.display = 'block';
    arrow.textContent = '▴';
  } else {
    row.style.display = 'none';
    arrow.textContent = '▾';
  }
}

// 展开/折叠经期结束日期选择
function toggleEndDate() {
  var row = document.getElementById('endDateRow');
  var arrow = document.getElementById('endDateArrow');
  if (row.style.display === 'none' || !row.style.display) {
    row.style.display = 'block';
    arrow.textContent = '▴';
  } else {
    row.style.display = 'none';
    arrow.textContent = '▾';
  }
}

function handleAdd() {
  if (!loadProfile().loggedIn) { document.getElementById('loginPromptModal').classList.add('open'); return; }
  var v = document.getElementById('dateInput').value;
  var err = document.getElementById('errorMsg');
  if (!v) { err.textContent = '请选择日期'; return; }
  if (v > todayStr()) { err.textContent = '不能记录未来的日期'; return; }
  var periods = loadPeriods();
  if (periods.indexOf(v) !== -1) { err.textContent = '该日期已记录过了'; return; }

  // 检查是否距离上次经期太近（低于用户设定的最短周期）
  if (periods.length) {
    var sorted2 = periods.slice().sort();
    var lastPeriod = sorted2[sorted2.length - 1];
    var daysFromLast = diffDays(lastPeriod, v);
    var settings = loadSettings();
    if (daysFromLast < (settings.minCycle || 21)) {
      if (!confirm('⚠️ 距离上次经期仅 ' + daysFromLast + ' 天，低于设定的最短周期（' + (settings.minCycle || 21) + '天）。\n\n这可能不是真正的经期（如排卵期出血）。\n\n确定要记录吗？')) {
        return;
      }
    }
  }

  // 计算偏差
  var dev = calcDeviation(periods, v);
  periods.push(v); savePeriods(periods);

  // 存储偏差（含异常标记）
  if (dev) {
    var devs = loadDeviations();
    devs[v] = { predicted: dev.predicted, deviation: dev.deviation, status: dev.status, anomaly: dev.anomaly, recordedAt: Date.now() };
    saveDeviations(devs);
  }

  err.textContent = '';
  if (dev) {
    if (dev.anomaly) showToast('⚠️ 记录成功 🌸 偏差较大，请注意观察');
    else if (dev.status === 'ontime') showToast('记录成功 🌸 准时来访');
    else if (dev.status === 'early') showToast('记录成功 🌸 比预测提前' + Math.abs(dev.deviation) + '天');
    else showToast('记录成功 🌸 比预测推迟' + dev.deviation + '天');
  } else {
    showToast('首次记录成功 🌸');
  }
  renderHome();
  renderCalendar();
}

function handleAddEnd() {
  if (!loadProfile().loggedIn) { document.getElementById('loginPromptModal').classList.add('open'); return; }
  var v = document.getElementById('endDateInput').value;
  var err = document.getElementById('endErrorMsg');
  if (!v) { err.textContent = '请选择结束日期'; return; }
  if (v > todayStr()) { err.textContent = '不能记录未来的日期'; return; }
  var start = getUnendedPeriod();
  if (!start) { err.textContent = '没有可关联的经期开始日'; return; }
  if (v < start) { err.textContent = '结束日期不能早于开始日期'; return; }
  var ends = loadPeriodEnds();
  ends[start] = v; savePeriodEnds(ends);
  err.textContent = '';
  var duration = diffDays(start, v) + 1;
  showToast('经期结束已记录 🩸 持续' + duration + '天');
  renderHome();
  renderCalendar();
}

// ======================================================
//  设置
// ======================================================

function saveSettings() {
  var s = loadSettings();
  s.reminderDays = +document.getElementById('reminderDays').value;
  localStorage.setItem(K_SETTINGS, JSON.stringify(s));
  scheduleReminder();
}

// 保存周期范围设定
function saveCycleRange() {
  var s = loadSettings();
  var minEl = document.getElementById('minCycle');
  var maxEl = document.getElementById('maxCycle');
  var min = +minEl.value;
  var max = +maxEl.value;
  if (min > max) {
    // 自动交换，确保最短 ≤ 最长
    minEl.value = max;
    maxEl.value = min;
    var tmp = min; min = max; max = tmp;
    showToast('已自动调整：最短周期 ≤ 最长周期');
  }
  s.minCycle = min;
  s.maxCycle = max;
  saveSettings(s);
  renderHome();
  renderCalendar();
}

function handleReminderToggle() {
  var on = document.getElementById('reminderToggle').checked;
  var row = document.getElementById('reminderDaysRow');
  row.style.opacity = on ? '1' : '0.4';
  row.style.pointerEvents = on ? 'auto' : 'none';
  var s = loadSettings(); s.reminder = on;
  localStorage.setItem(K_SETTINGS, JSON.stringify(s));
  if (on) requestNotificationPermission();
  scheduleReminder();
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('此浏览器不支持通知'); return; }
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    showToast('请允许通知权限以启用提醒');
    document.getElementById('reminderToggle').checked = false;
  } else {
    showToast('提醒已开启 🔔');
  }
}

function scheduleReminder() {
  var s = loadSettings();
  if (!s.reminder) return;
  var periods = loadPeriods();
  if (!periods.length) return;
  var info = getPhaseInfo(periods);
  if (info && info.daysTo === s.reminderDays) {
    if (Notification.permission === 'granted') {
      new Notification('💗 小粉日历提醒', {
        body: '预计还有' + s.reminderDays + '天经期到来，注意做好准备哦～',
        icon: './icon-192.png'
      });
    }
  }
}

function confirmClearAll() {
  if (!loadPeriods().length && !Object.keys(loadMoods()).length) { showToast('暂无数据'); return; }
  if (confirm('确定要清空所有数据吗？此操作不可撤销。')) {
    localStorage.removeItem(K_PERIODS);
    localStorage.removeItem(K_MOOD);
    localStorage.removeItem(K_DEVIATIONS);
    localStorage.removeItem(K_PERIOD_ENDS);
    showToast('已清空所有数据');
    var di = document.getElementById('dateInput');
    if (di) di.value = todayStr();
    selectedMood = null; selectedSymptoms = new Set(); selectedFlow = null;
    renderHome(); renderCalendar(); renderMoodPage();
  }
}

// ======================================================
//  模式切换
// ======================================================

function openModal() {
  var s = loadSettings();
  pendingMode = s.mode;
  var btns = document.querySelectorAll('#modeGrid .mood-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('selected', btns[i].dataset.mode === pendingMode);
  }
  document.getElementById('modeModal').classList.add('open');
}

function closeModal() { document.getElementById('modeModal').classList.remove('open'); }

function selectMode(m, el) {
  pendingMode = m;
  var btns = document.querySelectorAll('#modeGrid .mood-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  el.classList.add('selected');
}

function confirmMode() {
  var s = loadSettings(); s.mode = pendingMode;
  localStorage.setItem(K_SETTINGS, JSON.stringify(s));
  closeModal(); renderHome();
}

// ======================================================
//  页面导航
// ======================================================

function switchPage(name) {
  // 月历/记录页需要登录
  if ((name === 'calendar' || name === 'mood') && !loadProfile().loggedIn) {
    document.getElementById('loginPromptModal').classList.add('open');
    return;
  }
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
  var navs = document.querySelectorAll('.nav-item');
  for (var j = 0; j < navs.length; j++) navs[j].classList.remove('active');
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'calendar') renderCalendar();
  if (name === 'mood') renderMoodPage();
  if (name === 'profile') renderProfilePage();
}

// ======================================================
//  Toast 提示
// ======================================================

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

// ======================================================
//  PWA 安装
// ======================================================

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBtn').style.display = 'block';
  document.getElementById('installHint').textContent = '点击安装按钮，将应用添加到手机桌面';
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
  }
}

// ======================================================
//  数据导出
// ======================================================

function exportAllData() {
  var data = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '2.5.4',
    data: {
      periods: loadPeriods(),
      periodEnds: loadPeriodEnds(),
      moods: loadMoods(),
      deviations: loadDeviations(),
      settings: loadSettings(),
      profile: { nickname: loadProfile().nickname, avatar: '' }
    }
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'xiaofenapp-backup-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 数据已导出');
}

// ======================================================
//  数据导入
// ======================================================

function importAllData(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var backup = JSON.parse(e.target.result);
      if (!backup.exportVersion || !backup.data) { showToast('❌ 无效的备份文件'); return; }

      var periodCount = (backup.data.periods || []).length;
      var moodCount = Object.keys(backup.data.moods || {}).length;

      if (!confirm(
        '确认导入以下数据？此操作将覆盖当前所有数据。\n\n' +
        '- 经期记录: ' + periodCount + ' 条\n' +
        '- 心情记录: ' + moodCount + ' 条\n\n' +
        '此操作不可撤销！'
      )) return;

      if (backup.data.periods !== undefined) savePeriods(backup.data.periods);
      if (backup.data.periodEnds !== undefined) savePeriodEnds(backup.data.periodEnds);
      if (backup.data.moods !== undefined) saveMoods(backup.data.moods);
      if (backup.data.deviations !== undefined) saveDeviations(backup.data.deviations);
      if (backup.data.settings !== undefined) {
        var s = loadSettings();
        Object.assign(s, backup.data.settings);
        localStorage.setItem(K_SETTINGS, JSON.stringify(s));
      }
      if (backup.data.profile && backup.data.profile.nickname) {
        var p = loadProfile();
        p.nickname = backup.data.profile.nickname;
        saveProfile(p);
      }

      renderHome(); renderCalendar(); renderMoodPage(); renderProfilePage();
      showToast('✅ 数据导入成功');
    } catch (err) {
      showToast('❌ 导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ======================================================
//  首次启动：创建管理员账号
// ======================================================

function showSetupModal() {
  document.getElementById('setupModal').classList.add('open');
  document.getElementById('setupError').textContent = '';
  document.getElementById('setupUsername').value = '';
  document.getElementById('setupPassword').value = '';
  document.getElementById('setupPassword2').value = '';
}

function closeSetupModal() {
  document.getElementById('setupModal').classList.remove('open');
}

async function handleSetupAdmin() {
  var uname = document.getElementById('setupUsername').value.trim();
  var pwd   = document.getElementById('setupPassword').value.trim();
  var pwd2  = document.getElementById('setupPassword2').value.trim();
  var err   = document.getElementById('setupError');

  if (!uname || !pwd || !pwd2) { err.textContent = '请填写所有字段'; return; }
  if (uname.length < 2)  { err.textContent = '用户名至少2个字符'; return; }
  if (pwd.length < 4)    { err.textContent = '密码至少4位'; return; }
  if (pwd !== pwd2)      { err.textContent = '两次密码不一致'; return; }

  var accounts = loadAccounts();
  if (Object.keys(accounts).length > 0) { err.textContent = '已存在账号，请刷新页面'; return; }

  // 创建管理员账号
  var passwordHash = await hashPassword(pwd, uname);
  accounts[uname] = { passwordHash: passwordHash, role: 'admin' };
  saveAccounts(accounts);

  // 自动生成注册密钥
  var newKey = Math.random().toString(36).substring(2, 10);
  setRegKey(newKey);

  // 自动登录
  var prof = loadProfile();
  prof.loggedIn = true; prof.userId = uname; prof.username = uname;
  prof.nickname = uname;
  saveProfile(prof);

  closeSetupModal(); closeLoginPrompt();
  renderProfilePage(); renderHome();
  showToast('🎉 管理员账号 ' + uname + ' 已创建');
}

// ======================================================
//  初始化入口
// ======================================================

document.addEventListener('DOMContentLoaded', async function () {
  // 初始化账号系统（含密码迁移）
  await initLocalAccounts();

  // 补充偏差数据
  migrateDeviations();

  // 页头日期
  var now = new Date();
  var days = ['日', '一', '二', '三', '四', '五', '六'];
  document.getElementById('headerDate').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日  星期' + days[now.getDay()];

  // 日期输入框初始值
  var di = document.getElementById('dateInput');
  di.value = todayStr(); di.max = todayStr();
  di.addEventListener('input', function () {
    if (!this.value) this.value = todayStr();
  });

  // 结束日期输入框
  var edi = document.getElementById('endDateInput');
  edi.max = todayStr();

  // 首次渲染
  renderHome();
  scheduleReminder();

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
});
