// ======================================================
//  cycle.js — 周期计算与相位检测
//  包含：平均周期、阶段判断、偏差计算、统计分析
//  注意：本文件不访问 DOM，仅处理纯数据逻辑
//  依赖：data.js（loadPeriods, loadPeriodEnds, loadDeviations,
//        saveDeviations, todayStr, addDays, diffDays, parseDate, fmtCN）
// ======================================================

// 计算平均周期长度（天），不足2条记录时默认28天
function calcCycle(periods) {
  if (periods.length < 2) return 28;
  var sorted = periods.slice().sort();
  var recent = sorted.slice(-4);        // 取最近4次
  var settings = loadSettings();
  var minGap = settings.minCycle || 21; // 使用用户设定的周期范围
  var maxGap = settings.maxCycle || 35;
  var gaps = [];
  for (var i = 1; i < recent.length; i++) {
    var g = diffDays(recent[i - 1], recent[i]);
    if (g >= minGap && g <= maxGap) gaps.push(g);  // 按用户设定范围过滤
  }
  if (!gaps.length) return 28;          // 无有效间隔时使用默认28天
  return Math.round(gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length);
}

// 获取当前所处的阶段信息（经期/排卵期/安全期/经前期）
function getPhaseInfo(periods) {
  if (!periods.length) return null;
  var sorted = periods.slice().sort();
  var last = sorted[sorted.length - 1];
  var cycle = calcCycle(periods);
  var today = todayStr();
  var daysSince = diffDays(last, today);
  var nextPeriod;
  if (daysSince < cycle) {
    nextPeriod = addDays(last, cycle);
  } else {
    var n = Math.ceil(daysSince / cycle);
    nextPeriod = addDays(last, n * cycle);
  }
  var daysTo = diffDays(today, nextPeriod);
  var ovulation = addDays(nextPeriod, -14);
  var fertileStart = addDays(ovulation, -2);
  var fertileEnd = addDays(ovulation, 2);
  var dayInCycle = ((daysSince % cycle) + cycle) % cycle;

  // 使用实际经期结束日计算经期长度
  var ends = loadPeriodEnds();
  var actualPeriodLen = ends[last] ? diffDays(last, ends[last]) + 1 : 5;

  var phase, emoji, tip;
  var tp = parseDate(today);
  var fs = parseDate(fertileStart);
  var fe = parseDate(fertileEnd);

  if (dayInCycle < actualPeriodLen) {
    phase = '经期'; emoji = '🌹'; tip = '注意保暖，多休息，避免剧烈运动 💊';
  } else if (tp >= fs && tp <= fe) {
    phase = '排卵期'; emoji = '🌷'; tip = '易孕高峰期，注意避孕或积极备孕 🌡️';
  } else if (daysTo <= 7 && daysTo >= 0) {
    phase = '经前期'; emoji = '🌸'; tip = '经期即将到来，注意情绪调节 🫖';
  } else {
    phase = '安全期'; emoji = '🌼'; tip = '状态良好，保持规律作息和运动 ✨';
  }
  return {
    last: last, cycle: cycle, today: today,
    daysSince: daysSince, nextPeriod: nextPeriod, daysTo: daysTo,
    ovulation: ovulation, fertileStart: fertileStart, fertileEnd: fertileEnd,
    dayInCycle: dayInCycle, phase: phase, emoji: emoji, tip: tip,
    actualPeriodLen: actualPeriodLen
  };
}

// 构建日期 → 相位映射表，用于日历着色
// 覆盖 ±3 个周期范围
function getDatePhases(periods) {
  var map = {};
  if (!periods.length) return map;
  var sorted = periods.slice().sort();
  var ends = loadPeriodEnds();
  var cycle = calcCycle(periods);
  var last = sorted[sorted.length - 1];
  var start = addDays(last, -cycle * 3);
  var end = addDays(last, cycle * 3);
  var cur = start;
  while (cur <= end) {
    map[cur] = map[cur] || {};
    if (periods.indexOf(cur) !== -1) { map[cur].periodStart = true; }
    var prevPeriods = sorted.filter(function (p) { return p <= cur; });
    if (prevPeriods.length) {
      var prevLast = prevPeriods[prevPeriods.length - 1];
      var dayIn = diffDays(prevLast, cur);
      var periodEnd = ends[prevLast];
      var periodLen = periodEnd ? diffDays(prevLast, periodEnd) + 1 : 5;
      var c = calcCycle(periods);
      var nextP = addDays(prevLast, c);
      var ovul = addDays(nextP, -14);
      var fs = addDays(ovul, -2);
      var fe = addDays(ovul, 2);
      if (dayIn < periodLen) map[cur].period = true;
      if (cur >= fs && cur <= fe) map[cur].fertile = true;
      if (cur === ovul) map[cur].ovulation = true;
    }
    cur = addDays(cur, 1);
  }
  return map;
}

// 计算新经期记录相对于预测的偏差（提前/准时/推迟）
// 返回 null 表示该记录无法计算偏差（首次记录）
function calcDeviation(periods, newDate) {
  var sorted = periods.slice().sort();
  if (sorted.length < 1) return null;
  var last = sorted[sorted.length - 1];
  var cycle = calcCycle(periods);
  var predicted = addDays(last, cycle);
  var deviation = diffDays(predicted, newDate); // 负=提前, 正=推迟, 0=准时
  var status = 'ontime';
  if (deviation <= -2) status = 'early';        // 提前 ≥2 天
  else if (deviation >= 2) status = 'late';     // 推迟 ≥2 天
  var anomaly = Math.abs(deviation) > 10;        // 偏差超过10天视为异常
  return { predicted: predicted, deviation: deviation, status: status, anomaly: anomaly };
}

// 获取最近一个未记录结束日的经期开始日期
function getUnendedPeriod() {
  var periods = loadPeriods();
  if (!periods.length) return null;
  var sorted = periods.slice().sort();
  var ends = loadPeriodEnds();
  var today = todayStr();
  for (var i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] <= today && !ends[sorted[i]]) return sorted[i];
  }
  return null;
}

// 获取统计数据：平均周期、平均经期长度、范围、规律评分
function getStatsData() {
  var periods = loadPeriods().slice().sort();
  var ends = loadPeriodEnds();
  var data = {
    periods: periods, ends: ends,
    cycles: [], durations: [],
    avgCycle: 0, avgDuration: 0,
    shortestCycle: 0, longestCycle: 0,
    regularity: '', regularityStars: '',
    cycleStdDev: 0
  };
  if (periods.length < 2) return data;

  // 收集周期间隔
  var settings = loadSettings();
  var statsMin = Math.max(15, (settings.minCycle || 21) - 6);
  var statsMax = Math.min(60, (settings.maxCycle || 35) + 15);
  for (var i = 1; i < periods.length; i++) {
    var c = diffDays(periods[i - 1], periods[i]);
    if (c >= statsMin && c <= statsMax) {
      data.cycles.push({ start: periods[i - 1], end: periods[i], days: c });
    }
  }

  // 收集经期持续时间
  for (var j = 0; j < periods.length; j++) {
    var start = periods[j];
    if (ends[start]) {
      var dur = diffDays(start, ends[start]) + 1;
      if (dur >= 1 && dur <= 15) {
        data.durations.push({ start: start, end: ends[start], days: dur });
      }
    }
  }

  // 计算平均周期
  if (data.cycles.length) {
    var vals = data.cycles.map(function (c) { return c.days; });
    data.avgCycle = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
    data.shortestCycle = Math.min.apply(null, vals);
    data.longestCycle = Math.max.apply(null, vals);
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    data.cycleStdDev = Math.sqrt(
      vals.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / vals.length
    );
  }

  // 计算平均经期长度
  if (data.durations.length) {
    var dvals = data.durations.map(function (d) { return d.days; });
    data.avgDuration = (dvals.reduce(function (a, b) { return a + b; }, 0) / dvals.length).toFixed(1);
  }

  // 规律评分（基于标准差）
  if (data.cycles.length >= 2) {
    var sd = data.cycleStdDev;
    if (sd < 2)      { data.regularity = '非常规律'; data.regularityStars = '⭐⭐⭐'; }
    else if (sd < 4) { data.regularity = '比较规律'; data.regularityStars = '⭐⭐'; }
    else if (sd < 7) { data.regularity = '不太规律'; data.regularityStars = '⭐'; }
    else             { data.regularity = '不规律';   data.regularityStars = '⚠️'; }
  }
  return data;
}

// 向后兼容迁移：为已有经期补充偏差数据
function migrateDeviations() {
  var periods = loadPeriods();
  var devs = loadDeviations();
  if (periods.length < 2) return;
  var sorted = periods.slice().sort();
  var changed = false;
  for (var i = 1; i < sorted.length; i++) {
    var cur = sorted[i];
    if (devs[cur]) continue;
    var prevPeriods = sorted.slice(0, i);
    var dev = calcDeviation(prevPeriods, cur);
    if (dev) {
      devs[cur] = {
        predicted: dev.predicted,
        deviation: dev.deviation,
        status: dev.status,
        anomaly: dev.anomaly,
        recordedAt: Date.now()
      };
      changed = true;
    }
  }
  if (changed) saveDeviations(devs);
}
