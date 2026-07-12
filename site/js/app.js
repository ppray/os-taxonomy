/* ============================================================
   孩子所学的一切 · 交互引擎
   Canvas 渲染 · 三种布局 · 依赖链流光 · 知识详情（讲解/评测/脉络）
   · 12 周成长地图 · 学习地图（进度追踪 + 成长日志）
   ============================================================ */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 状态 ----------
  let graph = null, N = 0, nodes = [], links = [];
  let SUBJECTS = [], subjectColors = {}, bySubject = [];
  let standards = {}, domainData = null;
  // 中国课标主线（星图脊线）
  let cnLine = false, cnStage = 0, cnSpine = [];
  const CN_STAGES = [
    { name: '幼小衔接 · 4–6 岁', lo: 4, hi: 6 },
    { name: '第一学段 · 1–2 年级', lo: 6, hi: 8 },
    { name: '第二学段 · 3–4 年级', lo: 8, hi: 10 },
    { name: '第三学段 · 5–6 年级', lo: 10, hi: 12 },
    { name: '第四学段 · 7 年级', lo: 12, hi: 14 },
  ];
  let nodeRingRGB = '255,255,255', cnLineRGB = '232,178,61', labelHalo = 'rgba(4,5,9,0.7)';
  const TAU = Math.PI * 2;
  const isCn = (i) => !!(nodes[i] && nodes[i].id && String(nodes[i].id).startsWith('cn_'));
  const isInStage = (i, k) => { const n = nodes[i]; return n && n.ageMid >= CN_STAGES[k].lo && n.ageMid < CN_STAGES[k].hi; };
  function ring(p, r, rgb, lw, alpha) { ctx.lineWidth = lw; ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); }
  let subjectOn = {};              // 学科可见性
  let ageMode = 'all', ageMin = 4; // 年龄筛选
  let domainFilter = null;         // {subject,domain} | null
  let visible = [];                // 每节点可见性
  let selIdx = null, hoveredIdx = null;
  let upSet = new Set(), downSet = new Set(), crossSet = new Set(), activeLinks = [];
  let searchIndex = [];
  let layoutMode = 'force';

  // 学习地图（explorer）
  const LS_KEY = 'xuehai-explorer-v1';
  let profiles = { current: null, list: [] };
  let stateStore = {};   // profileId -> { topicId: 'known'|'learning' }
  let activityStore = {}; // profileId -> [{ts, id, state}]
  let currentProfileId = null;
  let childName = '孩子';
  let explorerMode = false;
  let knownSet = new Set(), learningSet = new Set();
  let hideKnown = false;
  let idToIdx = {};

  // 相机（世界坐标 → 屏幕；含 3D 旋转）
  const cam = { x: 0, y: 0, scale: 1, rotY: 0, tiltX: 0 };
  let bounds = { minX: -1, minY: -1, maxX: 1, maxY: 1 };

  // 动画
  let transition = null, camTween = null, dashPhase = 0;
  let autoRotate = false;          // 3D 布局缓慢自转
  const reasons = { layout: false, cam: false, flow: false, interact: false };
  let looping = false, lastT = 0;
  let W = 0, H = 0, dpr = 1;
  let drawOrder = null;            // 深度排序索引（3D 时按远→近绘制）
  let k12Data = null;              // 教材关键词库

  const canvas = $('#graph-canvas');
  const ctx = canvas.getContext('2d');

  // ---------- 工具 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function hash01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
  function hexA(hex, a) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  let linkRGB = '160,170,190';
  function refreshThemeColors() {
    const cs = getComputedStyle(document.body);
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    linkRGB = dark ? '150,162,185' : '96,84,62';
    nodeRingRGB = dark ? '255,255,255' : '20,20,28';
    cnLineRGB = dark ? '232,178,61' : '176,116,16';
    labelHalo = dark ? 'rgba(4,5,9,0.72)' : 'rgba(248,246,241,0.82)';
  }
  function idToNode(id) { const i = idToIdx[id]; return i == null ? null : nodes[i]; }
  function fmtTime(ts) {
    const d = new Date(ts); const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // ---------- 学习地图：本地存档 ----------
  function loadProfiles() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const d = JSON.parse(raw); profiles = d; stateStore = d.states || {}; activityStore = d.activity || {}; }
    } catch (e) { /* ignore */ }
    if (!profiles.list || !profiles.list.length) {
      profiles = { current: null, list: [] };
      const id = 'p_' + Date.now().toString(36);
      profiles.list.push({ id, name: '孩子' }); profiles.current = id;
      stateStore[id] = {}; activityStore[id] = []; saveProfiles();
    }
    if (!profiles.current) profiles.current = profiles.list[0].id;
    currentProfileId = profiles.current;
    const p = profiles.list.find(x => x.id === currentProfileId);
    childName = p ? p.name : '孩子';
    syncSets();
  }
  function saveProfiles() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ current: profiles.current, list: profiles.list, states: stateStore, activity: activityStore })); } catch (e) {}
  }
  function syncSets() {
    knownSet = new Set(); learningSet = new Set();
    const st = stateStore[currentProfileId] || {};
    for (const id in st) {
      const i = idToIdx[id]; if (i == null) continue;
      if (st[id] === 'known') knownSet.add(i); else if (st[id] === 'learning') learningSet.add(i);
    }
  }
  function markNode(idx, state) {
    const st = stateStore[currentProfileId] || (stateStore[currentProfileId] = {});
    if (!state || state === 'none') delete st[nodes[idx].id];
    else st[nodes[idx].id] = state;
    const act = activityStore[currentProfileId] || (activityStore[currentProfileId] = []);
    act.unshift({ ts: Date.now(), id: nodes[idx].id, state: state || 'none' });
    if (act.length > 200) act.length = 200;
    saveProfiles(); syncSets(); render(); updatePanelMark(); renderProfileBar();
    const verb = state === 'known' ? '已掌握' : state === 'learning' ? '在学中' : '已清除标记';
    const ico = state === 'known' ? '✓' : state === 'learning' ? '◐' : '↺';
    if (!explorerMode && state) toast(`已记录「${nodes[idx].name}」为 <b>${verb}</b>`, ico, '开启学习地图', toggleExplorer);
    else if (state) toast(`已记录「${nodes[idx].name}」为 <b>${verb}</b>`, ico, '成长日志', openLogbook);
    else toast(`已清除「${nodes[idx].name}」的标记`, ico);
  }
  function selectProfile(id) {
    currentProfileId = id; profiles.current = id;
    const p = profiles.list.find(x => x.id === id); childName = p ? p.name : '孩子';
    saveProfiles(); syncSets(); renderProfileBar(); render();
    if (selIdx != null) updatePanel(selIdx);
  }
  function addProfile() {
    const name = prompt('新学习者名字：', '孩子'); if (!name || !name.trim()) return;
    const id = 'p_' + Date.now().toString(36);
    profiles.list.push({ id, name: name.trim() }); stateStore[id] = {}; activityStore[id] = [];
    selectProfile(id);
  }
  function deleteProfile(id) {
    if (profiles.list.length <= 1) return;
    profiles.list = profiles.list.filter(p => p.id !== id);
    delete stateStore[id]; delete activityStore[id];
    if (currentProfileId === id) { currentProfileId = profiles.list[0].id; childName = profiles.list[0].name; }
    saveProfiles(); syncSets(); renderProfileBar(); render();
  }
  function resetCurrent() {
    if (!confirm('确定清空当前学习者的全部掌握标记？')) return;
    stateStore[currentProfileId] = {}; activityStore[currentProfileId] = [];
    saveProfiles(); syncSets(); renderProfileBar(); render();
    if (selIdx != null) updatePanel(selIdx);
  }

  // ---------- 数据加载 ----------
  async function load() {
    try {
      const [g, st, dm, k12] = await Promise.all([
        fetch('data/graph.json').then(r => r.json()),
        fetch('data/standards.json').then(r => r.json()),
        fetch('data/domains.json').then(r => r.json()),
        fetch('data/k12.json').then(r => r.json()).catch(() => null),
      ]);
      graph = g; standards = st; domainData = dm; k12Data = k12;
      nodes = g.nodes; links = g.links; N = nodes.length;
      SUBJECTS = g.subjects; subjectColors = g.subjectColors; bySubject = g.bySubject || SUBJECTS.map(s => nodes.filter(n => n.subject === s).length);
      idToIdx = {}; nodes.forEach((n, i) => idToIdx[n.id] = i);
      computeCnSpine();
      // 初始化坐标（含 3D 维度）
      for (const n of nodes) { n.cx = n.x; n.cy = n.y; n.cz = 0; n.tx = n.x; n.ty = n.y; n.tz = 0; n.vx = 0; n.vy = 0; n.vz = 0; }
      drawOrder = new Int32Array(N); for (let i = 0; i < N; i++) drawOrder[i] = i;
      buildSearchIndex();
      computeBounds();
      buildUI();
      loadProfiles();
      resize();
      fitCamera(true);
      refreshThemeColors();
      render();
      $('#loader').classList.add('hidden');
      $('#stat-maxdeg').textContent = g.maxDeg;
      $('#stat-nodes').textContent = N;
      $('#stat-links').textContent = links.length;
      $('#stat-subj').textContent = SUBJECTS.length;
    } catch (e) {
      console.error(e);
      $('#loader-sub').textContent = '数据加载失败：' + e.message;
    }
  }

  // ---------- 精灵（发光节点）----------
  // 全矢量渲染：节点 / 边 / 主线均在 render() 中按矢量绘制，不再使用位图发光精灵

  // ---------- 布局计算 ----------
  function computeLayout(mode) {
    const res = new Array(N);
    if (mode === 'sphere') {
      // 斐波那契球壳：年龄 → 半径（内幼外长），均匀铺面
      const R0 = 760;
      const order = nodes.slice().sort((a, b) => a.ageMid - b.ageMid);
      order.forEach((n, k) => {
        const rr = R0 * (0.5 + 0.5 * (n.ageMid - 4) / 9);
        const phi = Math.acos(1 - 2 * (k + 0.5) / N);
        const theta = GOLDEN * k;
        res[n.i] = { x: rr * Math.sin(phi) * Math.cos(theta), y: rr * Math.cos(phi), z: rr * Math.sin(phi) * Math.sin(theta) };
      });
    } else if (mode === 'tornado') {
      // 龙卷风：年龄 → 高度与半径（越年长越高越宽），学科 → 螺旋扇区
      const sector = Math.PI * 2 / SUBJECTS.length;
      for (const n of nodes) {
        const k = SUBJECTS.indexOf(n.subject);
        const theta = k * sector - Math.PI / 2 + (hash01(n.id) - 0.5) * 0.5;
        const Y = (n.ageMid - 8.5) * 120;
        const rr = 130 + (n.ageMid - 4) * 78;
        res[n.i] = { x: Math.cos(theta) * rr, y: Y, z: Math.sin(theta) * rr };
      }
    } else if (mode === 'ring') {
      // 环状（甜甜圈环面）：学科 → 主环角，年龄 → 管截面角
      const Rt = 720, rt = 200, sector = Math.PI * 2 / SUBJECTS.length;
      for (const n of nodes) {
        const k = SUBJECTS.indexOf(n.subject);
        const theta = k * sector - Math.PI / 2 + (hash01(n.id) - 0.5) * 0.35;
        const phi = ((n.ageMid - 4) / 9) * Math.PI * 2 + hash01(n.id) * 0.6;
        const R = Rt + rt * Math.cos(phi);
        res[n.i] = { x: R * Math.cos(theta), y: rt * Math.sin(phi), z: R * Math.sin(theta) };
      }
    } else if (mode === 'age') {
      const sector = Math.PI * 2 / 8, rIn = 190, rOut = 1540;
      for (const n of nodes) {
        const k = SUBJECTS.indexOf(n.subject);
        const base = k * sector - Math.PI / 2;
        const off = (hash01(n.id) - 0.5) * sector * 0.84;
        const ang = base + off;
        const rr = rIn + (rOut - rIn) * ((n.ageMid - 4) / 9);
        res[n.i] = { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, z: 0 };
      }
    } else if (mode === 'grid') {
      const COLW = 410, cell = 42, NCOL = 6, gapY = 40;
      const subjNodes = {}; SUBJECTS.forEach(s => subjNodes[s] = []);
      for (const n of nodes) subjNodes[n.subject].push(n);
      const domOrder = {};
      SUBJECTS.forEach(s => { const seen = new Set(); domOrder[s] = []; for (const n of subjNodes[s]) if (!seen.has(n.domain)) { seen.add(n.domain); domOrder[s].push(n.domain); } });
      SUBJECTS.forEach((s, sc) => {
        let y = 0;
        for (const dname of domOrder[s]) {
          const list = subjNodes[s].filter(n => n.domain === dname);
          const rows = Math.ceil(list.length / NCOL);
          list.forEach((n, idx) => {
            const c = idx % NCOL, r = Math.floor(idx / NCOL);
            res[n.i] = { x: sc * COLW + 70 + c * cell + cell / 2, y: y + r * cell + cell / 2 + 14, z: 0 };
          });
          y += rows * cell + gapY;
        }
      });
    } else {
      for (const n of nodes) res[n.i] = { x: n.x, y: n.y, z: 0 };
    }
    return res;
  }
  function setLayout(mode) {
    layoutMode = mode;
    const pos = computeLayout(mode);
    for (const n of nodes) { n.tx = pos[n.i].x; n.ty = pos[n.i].y; n.tz = pos[n.i].z || 0; n.vx = 0; n.vy = 0; n.vz = 0; }
    // 3D 布局自动开启缓慢自转；2D 关闭
    autoRotate = is3D(mode);
    if (is3D(mode) && Math.abs(cam.tiltX) < 0.01) cam.tiltX = 0.42; // 轻微俯视更立体
    updateRotateBtn();
    if (reduceMotion) { for (const n of nodes) { n.cx = n.tx; n.cy = n.ty; n.cz = n.tz; } render(); }
    else { transition = { start: performance.now(), dur: 1150 }; reasons.layout = true; requestFrame(); }
    // 注意：不调用 fitCamera —— 切换布局时维持用户当前的缩放 / 旋转 / 观察中心
  }

  // ---------- 相机 ----------
  function computeBounds() {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const n of nodes) { if (n.x < mnx) mnx = n.x; if (n.x > mxx) mxx = n.x; if (n.y < mny) mny = n.y; if (n.y > mxy) mxy = n.y; }
    bounds = { minX: mnx, minY: mny, maxX: mxx, maxY: mxy };
  }
  function boundsOf(getX, getY) {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const n of nodes) { const x = getX(n), y = getY(n); if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy };
  }
  function fitCamera(instant, bnds) {
    const b = bnds || boundsOf(n => n.cx, n => n.cy);
    const pad = 90;
    const bw = (b.maxX - b.minX) || 1, bh = (b.maxY - b.minY) || 1;
    const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
    const target = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale: clamp(s, 0.05, 4) };
    if (instant || reduceMotion) { Object.assign(cam, target); render(); }
    else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 900 }; reasons.cam = true; requestFrame(); }
  }
  function focusNode(idx, zoomBoost = 1.7) {
    const n = nodes[idx];
    if (is3D(layoutMode)) { const target = { ...cam, scale: clamp(cam.scale * zoomBoost, 0.15, 5) }; if (reduceMotion) { Object.assign(cam, target); render(); } else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 720 }; reasons.cam = true; requestFrame(); } return; }
    const target = { x: n.cx, y: n.cy, scale: clamp(cam.scale * zoomBoost, 0.15, 5) };
    if (reduceMotion) { Object.assign(cam, target); render(); }
    else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 720 }; reasons.cam = true; requestFrame(); }
  }
  // ---------- 3D 投影（透视 + 旋转；2D 布局时退化为平面）----------
  const CAM_D = 1700;                                   // 透视相机距离
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));          // 斐波那契角
  const is3D = (m) => m === 'sphere' || m === 'tornado' || m === 'ring';
  function projectXYZ(x, y, z) {
    const cr = Math.cos(cam.rotY), sr = Math.sin(cam.rotY);
    const ct = Math.cos(cam.tiltX), st = Math.sin(cam.tiltX);
    let x1 = x * cr + z * sr, z1 = -x * sr + z * cr, y1 = y;     // 绕 Y
    let y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct;          // 绕 X
    const persp = CAM_D / (CAM_D + z2);
    return { sx: (x1 * persp - cam.x) * cam.scale + W / 2, sy: (y2 * persp - cam.y) * cam.scale + H / 2, depth: z2, persp };
  }
  function projectNode(n) { return projectXYZ(n.cx, n.cy, n.cz); }
  function worldToScreen(x, y, z) { const p = projectXYZ(x, y, z || 0); return { x: p.sx, y: p.sy }; }
  function screenToWorld(sx, sy) {
    const x2 = ((sx - W / 2) / cam.scale) + cam.x;
    const y2 = ((sy - H / 2) / cam.scale) + cam.y;
    const cr = Math.cos(cam.rotY), sr = Math.sin(cam.rotY), ct = Math.cos(cam.tiltX), st = Math.sin(cam.tiltX);
    const x = x2 / cr;
    const y = (y2 - x * sr * st) / ct;
    return { x, y };
  }

  // ---------- 可见性 ----------
  function ageInRange(ageMid) {
    if (ageMode !== 'all') {
      const [lo, hi] = ageMode.split('-').map(Number);
      if (ageMid < lo || ageMid > hi) return false;
    }
    return ageMid >= ageMin;
  }
  function computeVisible() {
    visible = new Array(N);
    for (const n of nodes) {
      let v = subjectOn[n.subject] && ageInRange(n.ageMid);
      if (v && domainFilter && !(n.subject === domainFilter.subject && n.domain === domainFilter.domain)) v = false;
      visible[n.i] = v;
    }
  }

  // ---------- 选择 / 依赖链 ----------
  function selectNode(idx, doFocus) {
    selIdx = idx;
    computeChains(idx);
    updatePanel(idx);
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    if (doFocus) focusNode(idx, 1.6);
    else render();
    if (!reduceMotion) { reasons.flow = true; requestFrame(); }
  }
  function deselect() {
    selIdx = null; upSet = new Set(); downSet = new Set(); crossSet = new Set(); activeLinks = [];
    $('#panel').classList.remove('open');
    $('#panel').setAttribute('aria-hidden', 'true');
    reasons.flow = false;
    render();
  }
  function computeChains(idx) {
    upSet = new Set(); downSet = new Set(); activeLinks = [];
    // 上游 BFS（prereqs）
    const q = [idx]; const seenU = new Set([idx]);
    while (q.length) { const cur = q.shift(); for (const p of nodes[cur].prereqs) { if (!seenU.has(p)) { seenU.add(p); q.push(p); upSet.add(p); } } }
    // 下游 BFS（deps）
    const q2 = [idx]; const seenD = new Set([idx]);
    while (q2.length) { const cur = q2.shift(); for (const d of nodes[cur].deps) { if (!seenD.has(d)) { seenD.add(d); q2.push(d); downSet.add(d); } } }
    // 标记活跃边（含跨学科锚定桥接）
    crossSet = new Set();
    for (const l of links) {
      if (l.cross) {
        if (l.s === idx) crossSet.add(l.t);
        else if (l.t === idx) crossSet.add(l.s);
        if (l.s === idx || l.t === idx) activeLinks.push({ s: l.s, t: l.t, type: 'cross' });
        continue;
      }
      if (l.t === idx && upSet.has(l.s)) activeLinks.push({ s: l.s, t: l.t, type: 'up' });
      else if (l.s === idx && downSet.has(l.t)) activeLinks.push({ s: l.s, t: l.t, type: 'down' });
    }
  }
  function nodeState(i) {
    if (!visible[i]) return 'hide';
    if (hideKnown && knownSet.has(i)) return 'hide';
    if (selIdx != null) {
      if (i === selIdx) return 'sel';
      if (upSet.has(i)) return 'up';
      if (downSet.has(i)) return 'down';
      if (crossSet.has(i)) return 'cross';
      if (explorerMode && knownSet.has(i)) return 'known';
      if (explorerMode && learningSet.has(i)) return 'learning';
      return 'dim';
    }
    if (explorerMode && knownSet.has(i)) return 'known';
    if (explorerMode && learningSet.has(i)) return 'learning';
    return 'normal';
  }

  // ---------- 渲染 ----------
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!N) return;
    const needDepth = Math.abs(cam.rotY) + Math.abs(cam.tiltX) > 0.002 || is3D(layoutMode);
    if (needDepth) { for (const n of nodes) n._z = projectXYZ(n.cx, n.cy, n.cz).depth; drawOrder.sort((a, b) => nodes[b]._z - nodes[a]._z); }

    // 边：非活跃层（按缩放阈值绘制：远观为纯净星座，近看显结构）
    const EDGE_MIN_SCALE = 0.5;
    if (cam.scale >= EDGE_MIN_SCALE) {
      const ramp = clamp((cam.scale - EDGE_MIN_SCALE) / 1.4, 0, 1);
      const baseA = cnLine ? 0.018 : (selIdx != null ? 0.04 + 0.03 * ramp : 0.05 + 0.10 * ramp);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${linkRGB},${baseA})`;
      ctx.beginPath();
      for (const l of links) {
        if (l.cross) continue;                       // 跨学科桥接在常态下隐去，避免喧宾夺主
        if (!visible[l.s] || !visible[l.t]) continue;
        if (cnLine && !(isCn(l.s) && isCn(l.t))) continue;
        if (selIdx != null && (upSet.has(l.s) || upSet.has(l.t) || downSet.has(l.s) || downSet.has(l.t))) continue;
        const a = worldToScreen(nodes[l.s].cx, nodes[l.s].cy, nodes[l.s].cz);
        const b = worldToScreen(nodes[l.t].cx, nodes[l.t].cy, nodes[l.t].cz);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    // 跨学科锚定：常态以极淡虚线织成「互相借力的网」
    if (!cnLine) {
      ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.strokeStyle = `rgba(186,176,220,0.12)`;
      ctx.beginPath();
      for (const l of links) {
        if (!l.cross) continue;
        if (!visible[l.s] || !visible[l.t]) continue;
        const a = worldToScreen(nodes[l.s].cx, nodes[l.s].cy, nodes[l.s].cz);
        const b = worldToScreen(nodes[l.t].cx, nodes[l.t].cy, nodes[l.t].cz);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // 中国课标主线脊线（矢量，无发光）
    if (cnLine) drawCnSpine();

    // 边：活跃层（流光）
    if (selIdx != null && activeLinks.length) {
      ctx.lineWidth = 1.6;
      const upCol = '255,193,107', downCol = '127,182,255'; // 前置暖金 · 后续靛蓝
      ctx.setLineDash([5, 7]);
      for (const type of ['up', 'down']) {
        const col = type === 'up' ? upCol : downCol;
        ctx.strokeStyle = `rgba(${col},${type === 'up' ? 0.55 : 0.5})`;
        ctx.lineDashOffset = type === 'up' ? -dashPhase : dashPhase;
        ctx.beginPath();
        for (const l of activeLinks) {
          if (l.type !== type) continue;
          const a = worldToScreen(nodes[l.s].cx, nodes[l.s].cy, nodes[l.s].cz);
          const b = worldToScreen(nodes[l.t].cx, nodes[l.t].cy, nodes[l.t].cz);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      // 跨学科锚定桥接高亮（选中时点亮「互相借力的网」）
      ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(232,201,138,0.62)';
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -dashPhase;
      ctx.beginPath();
      for (const l of activeLinks) {
        if (l.type !== 'cross') continue;
        const a = worldToScreen(nodes[l.s].cx, nodes[l.s].cy, nodes[l.s].cz);
        const b = worldToScreen(nodes[l.t].cx, nodes[l.t].cy, nodes[l.t].cz);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 节点（全矢量 + 3D 投影；远节点略淡，按深度排序）
    if (needDepth) { for (let oi = 0; oi < drawOrder.length; oi++) drawNode(nodes[drawOrder[oi]]); }
    else { for (const n of nodes) drawNode(n); }

    // 标签
    drawLabels();
  }

  function drawNode(n) {
    const st = nodeState(n.i);
    if (st === 'hide') return;
    const p = projectXYZ(n.cx, n.cy, n.cz);
    const rs = Math.max(n.r * cam.scale * p.persp, 1.1);
    const col = subjectColors[n.subject];
    const isC = isCn(n.i);
    let alpha = 1;
    if (cnLine && !isC) alpha = 0.10;
    else if (st === 'known') alpha = 0.55;
    else if (st === 'dim') alpha = 0.34;
    if (p.depth > 0) alpha *= clamp(1 - p.depth / CAM_D * 0.34, 0.5, 1); // 远处略淡，强化纵深
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, rs, 0, TAU); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = Math.max(1, rs * 0.16); ctx.strokeStyle = `rgba(${nodeRingRGB},${cnLine && !isC ? 0.04 : 0.22})`;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, rs, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    const gap = Math.max(2, rs * 0.42);
    const P = { x: p.sx, y: p.sy };
    if (cnLine && isC) {
      ring(P, rs + gap, cnLineRGB, Math.max(1.6, rs * 0.22), isInStage(n.i, cnStage) ? 1 : 0.55);
      if (st === 'sel') ring(P, rs + gap * 0.5, '255,255,255', 2, 0.95);
    } else if (st === 'sel') { ring(P, rs + gap, '255,255,255', Math.max(2, rs * 0.18), 0.95); }
    else if (st === 'up') { ring(P, rs + gap, '255,193,107', Math.max(1.8, rs * 0.16), 0.92); }
    else if (st === 'down') { ring(P, rs + gap, '127,182,255', Math.max(1.8, rs * 0.16), 0.92); }
    else if (st === 'cross') { ring(P, rs + gap, '232,201,138', Math.max(1.6, rs * 0.15), 0.8); }
    else if (st === 'known') { ring(P, rs + gap, '127,224,168', Math.max(1.5, rs * 0.14), 0.95); }
    else if (st === 'learning') { ring(P, rs + gap, '255,193,107', Math.max(1.5, rs * 0.14), 0.98); }
  }

  function drawLabels() {
    const txt = (s, x, y, color, size, align = 'center') => {
      ctx.font = `500 ${size}px "Noto Sans SC", system-ui, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5; ctx.strokeStyle = labelHalo; ctx.strokeText(s, x, y);
      ctx.fillStyle = color; ctx.fillText(s, x, y);
    };
    // 选中 / 悬停 / 邻居
    const labelSet = new Set();
    if (selIdx != null) { labelSet.add(selIdx); for (const p of nodes[selIdx].prereqs) labelSet.add(p); for (const d of nodes[selIdx].deps) labelSet.add(d); }
    if (hoveredIdx != null && hoveredIdx !== selIdx) labelSet.add(hoveredIdx);
    for (const i of labelSet) {
      if (!visible[i]) continue;
      const n = nodes[i], p = projectNode(n), rs = n.r * cam.scale * p.persp;
      txt(n.name, p.sx, p.sy - rs - 9, 'rgba(236,236,241,0.96)', 13);
    }
    // 地标节点（高中心性），放大时显示
    if (cam.scale > 0.5) {
      for (const n of topNodes) {
        if (!visible[n.i] || labelSet.has(n.i)) continue;
        const p = projectNode(n), rs = n.r * cam.scale * p.persp;
        if (rs < 2.2) continue;
        txt(n.name, p.sx, p.sy - rs - 7, 'rgba(200,205,215,0.8)', 11.5);
      }
    }
    // 中国课标主线：显示全部中国节点标签
    if (cnLine) {
      for (const i of cnSpine) {
        if (!visible[i]) continue;
        const n = nodes[i], p = projectNode(n), rs = n.r * cam.scale * p.persp;
        const ins = isInStage(i, cnStage);
        txt(n.name, p.sx, p.sy - rs - 8, ins ? `rgba(${cnLineRGB},1)` : 'rgba(206,196,176,0.85)', ins ? 13 : 11);
      }
    }
  }
  let topNodes = [];

  // ---------- 中国课标主线 ----------
  function computeCnSpine() { cnSpine = nodes.filter(n => n.id && String(n.id).startsWith('cn_')).sort((a, b) => a.ageMid - b.ageMid).map(n => n.i); }
  function drawCnSpine() {
    if (!cnSpine.length) return;
    ctx.setLineDash([]);
    ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(${cnLineRGB},0.28)`;
    ctx.beginPath();
    for (let k = 0; k < cnSpine.length; k++) { const n = nodes[cnSpine[k]]; const p = projectNode(n); if (k === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy); }
    ctx.stroke();
    let started = false;
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(${cnLineRGB},0.95)`;
    ctx.beginPath();
    for (let k = 0; k < cnSpine.length; k++) {
      if (!isInStage(cnSpine[k], cnStage)) continue;
      const n = nodes[cnSpine[k]]; const p = projectNode(n);
      if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
  }
  function updateCnBar() {
    const el = document.getElementById('cn-stage-name'); if (el) el.textContent = CN_STAGES[cnStage].name;
    const c = document.getElementById('cn-stage-count'); if (c) { const n = cnSpine.filter(i => isInStage(i, cnStage)).length; c.textContent = n + ' 个节点'; }
  }
  function cnRoam(dir) {
    cnStage = clamp(cnStage + dir, 0, CN_STAGES.length - 1);
    const set = cnSpine.filter(i => isInStage(i, cnStage));
    if (set.length) {
      let mx = 0, my = 0; for (const i of set) { mx += nodes[i].cx; my += nodes[i].cy; } mx /= set.length; my /= set.length;
      const s = clamp(cam.scale * 1.25, 0.6, 2.2);
      if (reduceMotion) { cam.x = mx; cam.y = my; cam.scale = s; render(); }
      else { camTween = { from: { ...cam }, to: { x: mx, y: my, scale: s }, start: performance.now(), dur: 720 }; reasons.cam = true; requestFrame(); }
    }
    updateCnBar();
  }
  function toggleCnLine() {
    cnLine = !cnLine; document.body.classList.toggle('cn-line', cnLine);
    const b = document.getElementById('cn-line-btn'); if (b) b.classList.toggle('is-active', cnLine);
    const bar = document.getElementById('cn-line-bar'); if (bar) bar.classList.toggle('show', cnLine);
    if (cnLine) { cnStage = 0; updateCnBar(); toast('已开启「中国课标主线」，按学段漫游', '🧭'); }
    else deselect();
    render();
  }

  // ---------- 动画循环 ----------
  function requestFrame() { if (!looping) { looping = true; lastT = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    let active = false;
    if (transition) {
      // 力导向物理过渡：每个节点向目标位置做阻尼弹簧积分（O(n)，平滑且维持当前视角）
      const K = 0.16, DAMP = 0.80;
      for (const n of nodes) {
        n.vx = (n.vx + (n.tx - n.cx) * K) * DAMP;
        n.vy = (n.vy + (n.ty - n.cy) * K) * DAMP;
        n.vz = (n.vz + (n.tz - n.cz) * K) * DAMP;
        n.cx += n.vx; n.cy += n.vy; n.cz += n.vz;
      }
      const p = (now - transition.start) / transition.dur;
      if (p >= 1) { for (const n of nodes) { n.cx = n.tx; n.cy = n.ty; n.cz = n.tz; n.vx = n.vy = n.vz = 0; } transition = null; }
      else active = true;
    }
    if (autoRotate && !reduceMotion && !reasons.interact) { cam.rotY += 0.0016; if (cam.rotY > Math.PI * 2) cam.rotY -= Math.PI * 2; active = true; }
    if (camTween) {
      const p = clamp((now - camTween.start) / camTween.dur, 0, 1), e = easeInOut(p);
      cam.x = lerp(camTween.from.x, camTween.to.x, e);
      cam.y = lerp(camTween.from.y, camTween.to.y, e);
      cam.scale = lerp(camTween.from.scale, camTween.to.scale, e);
      if (p >= 1) camTween = null; else active = true;
    }
    if (selIdx != null && !reduceMotion) { dashPhase = (dashPhase + 0.7) % 1000; active = true; }
    render();
    if (active || reasons.interact) requestAnimationFrame(frame);
    else looping = false;
  }

  // ---------- 命中检测 ----------
  function pick(sx, sy) {
    let best = -1, bestD = 1e9;
    for (const n of nodes) {
      if (!visible[n.i]) continue;
      const p = projectXYZ(n.cx, n.cy, n.cz);
      const dx = p.sx - sx, dy = p.sy - sy;
      const d2 = dx * dx + dy * dy;
      const rr = (n.r * cam.scale * p.persp + 6);
      if (d2 < rr * rr && d2 < bestD) { bestD = d2; best = n.i; }
    }
    return best;
  }

  // ---------- 交互（拖拽 / 悬停 / 单击飞向 / 双击聚焦 / 滚轮锚定 / 双指捏合）----------
  let dragging = false, dragMoved = false, lastX = 0, lastY = 0, downX = 0, downY = 0, downIdx = -1;
  const pointers = new Map();
  let pinchDist = 0, pinchMid = null, pinching = false;

  function flyToNode(idx) {
    const n = nodes[idx];
    if (is3D(layoutMode)) { const target = { ...cam, scale: clamp(Math.max(cam.scale, 0.85), 0.2, 4) }; if (reduceMotion) { Object.assign(cam, target); render(); } else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 620 }; reasons.cam = true; requestFrame(); } return; }
    const target = { x: n.cx, y: n.cy, scale: clamp(Math.max(cam.scale, 0.85), 0.2, 4) };
    if (reduceMotion) { Object.assign(cam, target); render(); }
    else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 620 }; reasons.cam = true; requestFrame(); }
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
      reasons.interact = true; requestFrame();
    } else if (pointers.size === 2) {
      pinching = true; dragging = false;
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinchDist > 0) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const factor = dist / pinchDist;
      const before = screenToWorld(mid.x, mid.y);
      cam.scale = clamp(cam.scale * factor, 0.05, 6);
      const after = screenToWorld(mid.x, mid.y);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
      cam.x -= (mid.x - pinchMid.x) / cam.scale; cam.y -= (mid.y - pinchMid.y) / cam.scale;
      pinchDist = dist; pinchMid = mid;
      render();
      return;
    }
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) dragMoved = true;
      if (e.shiftKey) {
        // 旋转视角（按住 Shift 拖拽）
        cam.rotY += dx * 0.006;
        cam.tiltX = clamp(cam.tiltX + dy * 0.006, -1.3, 1.3);
        autoRotate = false; updateRotateBtn();
      } else {
        cam.x -= dx / cam.scale; cam.y -= dy / cam.scale;
      }
      lastX = e.clientX; lastY = e.clientY;
      render();
    } else {
      const idx = pick(e.clientX, e.clientY);
      if (idx !== hoveredIdx) { hoveredIdx = idx; canvas.style.cursor = idx >= 0 ? 'pointer' : (pointers.size ? 'grabbing' : 'grab'); render(); }
      if (idx >= 0) showTooltip(idx, e.clientX, e.clientY); else hideTooltip();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasPinch = pointers.size >= 2;
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (wasPinch) {
      dragMoved = true; // 捏合手势后不再触发点击
      if (pointers.size === 1) { const p = [...pointers.values()][0]; lastX = p.x; lastY = p.y; dragging = true; }
      else { dragging = false; reasons.interact = false; }
      return;
    }
    dragging = false; reasons.interact = false;
    if (!dragMoved) {
      const idx = pick(e.clientX, e.clientY);
      if (idx >= 0) { if (idx === selIdx) flyToNode(idx); else { selectNode(idx, false); flyToNode(idx); } }
      else deselect();
    } else render();
  });
  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { pinching = false; pinchDist = 0; }
    if (pointers.size === 0) { dragging = false; reasons.interact = false; }
  });
  canvas.addEventListener('pointerleave', () => { if (pointers.size === 0) { hoveredIdx = null; hideTooltip(); render(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0014);
    cam.scale = clamp(cam.scale * factor, 0.05, 6);
    const after = screenToWorld(e.clientX, e.clientY);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
    render();
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const idx = pick(e.clientX, e.clientY);
    if (idx >= 0) { if (selIdx !== idx) selectNode(idx, false); focusNode(idx, 2.1); }
  });

  // ---------- 工具提示 ----------
  const tooltip = $('#tooltip');
  function showTooltip(idx, x, y) {
    const n = nodes[idx];
    const st = (stateStore[currentProfileId] || {})[n.id];
    const badge = st === 'known' ? ' · 已掌握' : st === 'learning' ? ' · 在学中' : '';
    tooltip.innerHTML = `<div class="tt-sub"><span class="dot" style="background:${subjectColors[n.subject]};box-shadow:0 0 8px ${subjectColors[n.subject]}"></span>${n.subject}</div><div>${n.name}</div><div class="tt-dom">${n.domain} · ${n.ageStart}–${n.ageEnd} 岁${badge}</div>`;
    tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
    tooltip.hidden = false;
  }
  function hideTooltip() { tooltip.hidden = true; }

  // ---------- 轻量 Toast（标记即时反馈 / 复盘入口）----------
  function toast(msg, ico, actionLabel, actionFn, dur) {
    let stack = $('#toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toast-stack'; stack.className = 'toast-stack'; document.body.appendChild(stack); }
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = (ico ? `<span class="toast-ico" aria-hidden="true">${ico}</span>` : '') + `<span class="toast-msg">${msg}</span>` + (actionLabel ? `<button class="toast-act" type="button">${actionLabel}</button>` : '');
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    let to = setTimeout(dismiss, dur || 4200);
    function dismiss() { clearTimeout(to); t.classList.remove('show'); setTimeout(() => t.remove(), 420); }
    if (actionLabel) t.querySelector('.toast-act').addEventListener('click', () => { dismiss(); if (actionFn) actionFn(); });
    t.addEventListener('mouseenter', () => clearTimeout(to));
    t.addEventListener('mouseleave', () => { to = setTimeout(dismiss, 2400); });
  }

  // ---------- 国外课标参考（六类译注）----------
  const CURRICULA_META = {
    'cn-2022': { label: '中国课标（2022年版）', note: '义务教育课程方案与课程标准' },
    'uk-nc-2013': { label: '英国国家课程 2013', note: 'England National Curriculum 2013' },
    'ccss-ela': { label: '美国共同核心 · 英语语言艺术', note: 'CCSS-ELA · K–12' },
    'ccss-math': { label: '美国共同核心 · 数学', note: 'CCSS-Math · K–12' },
    'ib-pyp-pspe': { label: 'IB 小学项目 · 个人/社会/体育', note: 'PYP-PSPE' },
    'ngss-k5': { label: '新一代科学标准 · 幼儿园至 5 年级', note: 'NGSS K–5' },
    'ngss-ms': { label: '新一代科学标准 · 中学', note: 'NGSS Middle School' },
  };
  const CCSS_ELA_SUBJ = { L: '语言', RF: '基础阅读', RL: '文学阅读', RI: '信息类文本阅读', W: '写作', SL: '口语与听力', K: '拼读识字' };
  const CCSS_MATH_DOM = { OA: '运算与代数思维', NBT: '数位与运算', NF: '分数', MD: '测量与数据', G: '几何', CC: '计数与基数', RP: '比率与比例', NS: '数与运算系统', EE: '表达式与方程', F: '函数', SP: '统计与概率' };
  const NGSS_DISC = { LS: '生命科学', PS: '物质科学', ESS: '地球与空间科学', ENG: '工程', ETS: '工程·技术与科学' };
  const IB_PSPE = { ID: '身份认同', INT: '互动', IN: '互动', AL: '积极生活', CU: '社群', LO: '学习目标', HU: '健康', COM: '沟通', P: '阶段' };
  const GRADE_CN = { K: '幼儿园', '1': '1 年级', '2': '2 年级', '3': '3 年级', '4': '4 年级', '5': '5 年级', '6': '6 年级', '7': '7 年级', '8': '8 年级', '9': '9 年级', '10': '10 年级', '11': '11 年级', '12': '12 年级', MS: '中学', HS: '高中' };
  function decodeStandard(cur, code) {
    if (cur === 'ccss-ela') {
      const m = code.match(/^([A-Z]+)\.([K\d]+)\.(.+)$/);
      if (m) { const subj = CCSS_ELA_SUBJ[m[1]] || m[1]; const g = GRADE_CN[m[2]] || m[2]; return `${subj} · ${g} · 标准 ${m[3]}`; }
    }
    if (cur === 'ccss-math') {
      const m = code.match(/^([K\d]+)\.([A-Z]+)\.(\d+[a-e]?)$/);
      if (m) { const g = GRADE_CN[m[1]] || m[1]; const d = CCSS_MATH_DOM[m[2]] || m[2]; return `数学 · ${g} · ${d} · 第 ${m[3]} 条`; }
    }
    if (cur === 'ngss-k5' || cur === 'ngss-ms') {
      const m = code.match(/^([K\d]+|MS|HS)-([A-Z]+)(\d+)-(\d+)$/);
      if (m) { const g = GRADE_CN[m[1]] || m[1]; const d = NGSS_DISC[m[2]] || m[2]; return `科学 · ${g} · ${d} 主题 ${m[3]} · 第 ${m[4]} 条`; }
    }
    if (cur === 'ib-pyp-pspe') {
      const toks = code.replace(/^PSPE[.\-]/, '').split(/[.\-]/).filter(Boolean);
      const phase = toks.find(t => /^P\d$/i.test(t));
      const strand = toks.filter(t => !/^P\d$/i.test(t)).map(t => IB_PSPE[t] || t).join('·');
      return `IB·PYP·PSPE${phase ? ' · 第 ' + phase.toUpperCase().replace('P', '') + ' 阶段' : ''}${strand ? ' · ' + strand : ''}`;
    }
    return '';
  }

  // ---------- 讲解层 / 评测层 内容生成 ----------
  function typeVerb(t) { return ({ CONCEPTUAL: '理解', PROCEDURAL: '操作', REPRESENTATIONAL: '表征', LANGUAGE: '表达', META: '反思' })[t] || '学习'; }
  function buildWhy(idx) {
    const n = nodes[idx];
    const downs = n.deps.length, ups = n.prereqs.length;
    let s = `它在「${n.subject}」学科中属于「${n.domain}」领域，是一个可${typeVerb(n.type)}的知识点。`;
    if (ups > 0) s += ` 它本身又依赖 ${ups} 个前置基础，先点亮它们，本节点才站得稳。`;
    if (downs > 0) s += ` 一旦掌握，它会直接解锁下游 ${downs} 个后续知识点——`;
    if (downs > 0) {
      const top = n.deps.slice().sort((a, b) => nodes[b].centrality - nodes[a].centrality).slice(0, 3).map(i => nodes[i].name);
      s += `比如「${top.join('」「')}」。`;
    }
    if (n.centrality > 0.05) s += ' 它在整张图谱里处于枢纽位置（中心性居前），是许多学习路径都会经过的关键节点，值得优先夯实。';
    else if (downs === 0 && ups > 0) s += ' 它位于某条能力链的尽头，是更上层能力的合成点。';
    else if (ups === 0) s += ' 它是一条学习链的起点，无需前置，适合作为入门第一站。';
    return s;
  }
  function buildHow(idx) {
    const n = nodes[idx];
    if (!n.prereqs.length) return `这是一个起点型知识点，无需前置。建议直接从它的「掌握证据」逐条自检，并配合生活里的真实例子建立直观感受，再自然过渡到后续解锁的内容。`;
    const near = n.prereqs.slice().sort((a, b) => nodes[b].centrality - nodes[a].centrality).slice(0, 3);
    const names = near.map(i => `「${nodes[i].name}」`).join('、');
    return `在挑战「${n.name}」之前，建议先稳稳掌握：${names}。可以先完成下方「前置自测」小卷，确认它们都已内化为直觉，再回来攻克本节点——顺着依赖链层层而上，比直接硬啃要轻松得多。`;
  }
  function buildPreQuiz(idx) {
    const depths = {}; const q = [[idx, 0]]; depths[idx] = 0;
    while (q.length) { const [c, d] = q.shift(); for (const p of nodes[c].prereqs) { if (depths[p] === undefined) { depths[p] = d + 1; q.push([p, d + 1]); } } }
    const cand = Object.keys(depths).map(i => +i).filter(i => i !== idx && (depths[i] === 1 || depths[i] === 2));
    cand.sort((a, b) => depths[a] - depths[b] || nodes[b].centrality - nodes[a].centrality);
    return cand.slice(0, 6);
  }

  // ---------- UI 构建 ----------
  function buildUI() {
    // 顶栏学科芯片
    const chips = $('#subject-chips'); chips.innerHTML = '';
    SUBJECTS.forEach((s, k) => {
      subjectOn[s] = true;
      const c = document.createElement('button');
      c.className = 'chip'; c.type = 'button'; c.dataset.subject = s;
      c.innerHTML = `<span class="dot" style="background:${subjectColors[s]};color:${subjectColors[s]}"></span><span class="chip-name">${s}</span><span class="cnt">${bySubject[k]}</span>`;
      c.addEventListener('click', () => toggleSubject(s, c));
      chips.appendChild(c);
    });
    // 侧栏图例
    const legend = $('#legend-list'); legend.innerHTML = '';
    SUBJECTS.forEach((s, k) => {
      const li = document.createElement('li'); li.className = 'legend-row'; li.dataset.subject = s;
      li.innerHTML = `<span class="dot" style="background:${subjectColors[s]};color:${subjectColors[s]}"></span><span class="lg-name">${s}</span><span class="lg-cnt">${bySubject[k]}</span>`;
      li.addEventListener('click', () => toggleSubject(s, null));
      legend.appendChild(li);
    });
    // 侧栏学科占比
    const total = N; const bars = $('#subject-bars'); bars.innerHTML = '';
    SUBJECTS.forEach((s, k) => {
      const pct = (bySubject[k] / total * 100).toFixed(1);
      const row = document.createElement('div'); row.className = 'sb-bar';
      row.innerHTML = `<span class="dot" style="background:${subjectColors[s]}"></span><span class="track"><span class="fill" style="width:${pct}%;background:${subjectColors[s]}"></span></span><span class="num">${bySubject[k]}</span>`;
      bars.appendChild(row);
    });
    // 移动端
    const mf = $('#mobile-filters'); mf.innerHTML = '';
    SUBJECTS.forEach((s) => {
      const b = document.createElement('button'); b.className = 'chip'; b.dataset.subject = s; b.innerHTML = `<span class="dot" style="background:${subjectColors[s]};color:${subjectColors[s]}"></span>${s}`;
      b.addEventListener('click', () => toggleSubject(s, null)); mf.appendChild(b);
    });
    const ma = $('#mobile-age'); ma.innerHTML = '';
    [['all', '全部'], ['4-6', '4–6 岁'], ['7-9', '7–9 岁'], ['10-13', '10–13 岁']].forEach(([r, lbl]) => {
      const b = document.createElement('button'); b.className = 'age-q' + (r === 'all' ? ' is-active' : ''); b.dataset.range = r; b.textContent = lbl;
      b.addEventListener('click', () => setAge(r, ma)); ma.appendChild(b);
    });
    const ml = $('#mobile-layout'); ml.innerHTML = '';
    [['force', '星图'], ['age', '年轮'], ['grid', '矩阵'], ['sphere', '球体'], ['tornado', '龙卷风'], ['ring', '环状']].forEach(([m, lbl]) => {
      const b = document.createElement('button'); b.className = 'ls-btn' + (m === 'force' ? ' is-active' : ''); b.dataset.layout = m; b.textContent = lbl;
      b.addEventListener('click', () => setLayoutMode(m)); ml.appendChild(b);
    });
    // 地标节点
    topNodes = [...nodes].sort((a, b) => b.centrality - a.centrality).slice(0, 55);
    computeVisible();
    updateSubjectScrollState();
  }

  function toggleSubject(s, chipEl) {
    subjectOn[s] = !subjectOn[s];
    clearDomainFilter();
    document.querySelectorAll(`[data-subject="${CSS.escape(s)}"]`).forEach(el => el.classList.toggle('off', !subjectOn[s]));
    computeVisible(); render();
  }

  function setAge(range, container) {
    ageMode = range; clearDomainFilter();
    (container || $('#age-quick')).querySelectorAll('.age-q').forEach(b => b.classList.toggle('is-active', b.dataset.range === range));
    updateAgeHint(); computeVisible(); render();
  }
  function updateAgeHint() {
    const hint = $('#age-hint');
    if (ageMode !== 'all') { const [lo, hi] = ageMode.split('-'); hint.textContent = `${lo}–${hi} 岁`; }
    else if (ageMin > 4) hint.textContent = `≥ ${ageMin} 岁`;
    else hint.textContent = `全部 · 4–13 岁`;
  }

  function clearDomainFilter() {
    if (!domainFilter) return;
    domainFilter = null;
    const ind = $('#domain-indicator'); if (ind) ind.remove();
    computeVisible(); render();
  }

  function setLayoutMode(mode) {
    document.querySelectorAll('.ls-btn').forEach(b => { const on = b.dataset.layout === mode; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
    setLayout(mode);
  }
  function toggleRotate() { autoRotate = !autoRotate; if (autoRotate && Math.abs(cam.tiltX) < 0.01) cam.tiltX = 0.42; updateRotateBtn(); reasons.interact = true; requestFrame(); }
  function updateRotateBtn() { const b = document.getElementById('rotate-btn'); if (b) { b.classList.toggle('is-active', autoRotate); b.setAttribute('aria-pressed', autoRotate); } }
  function scrollSubjects(dir) {
    const f = $('#subject-chips'); if (!f) return;
    f.scrollBy({ left: dir * Math.max(160, f.clientWidth * 0.7), behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function updateSubjectScrollState() {
    const f = $('#subject-chips'); if (!f) return;
    const prev = $('#sb-prev'), next = $('#sb-next');
    if (prev) prev.disabled = f.scrollLeft <= 1;
    if (next) next.disabled = f.scrollLeft + f.clientWidth >= f.scrollWidth - 1;
  }

  // ---------- 详情面板（讲解 / 评测 / 脉络）----------
  function updatePanel(idx) {
    const n = nodes[idx];
    $('#p-subject').innerHTML = `<span class="dot" style="background:${subjectColors[n.subject]};color:${subjectColors[n.subject]}"></span>${n.subject}`;
    $('#p-title').textContent = n.name;
    $('#p-meta').innerHTML =
      `<span class="meta-tag">类型 <b>${n.typeLabel}</b></span>` +
      `<span class="meta-tag">领域 <b>${n.domain}</b></span>` +
      `<span class="meta-tag">年龄 <b>${n.ageStart}–${n.ageEnd} 岁</b></span>` +
      `<span class="meta-tag">连接度 <b>${n.deg}</b></span>`;
    // 讲解层
    $('#p-desc').textContent = n.description || '（暂无描述）';
    $('#p-why').textContent = buildWhy(idx);
    $('#p-how').textContent = buildHow(idx);
    // 评测层
    const ab = $('#p-assess-block');
    if (n.assessmentPrompt) { ab.style.display = ''; $('#p-assess').textContent = n.assessmentPrompt.replace(/\{\{name\}\}/g, childName); }
    else ab.style.display = 'none';
    const eb = $('#p-evidence-block');
    if (n.evidence && n.evidence.length) { eb.style.display = ''; $('#p-evidence').innerHTML = n.evidence.map(e => `<li>${e}</li>`).join(''); }
    else eb.style.display = 'none';
    const quiz = buildPreQuiz(idx);
    const pq = $('#p-prequiz'); pq.innerHTML = '';
    if (quiz.length) {
      $('#p-prequiz-label').textContent = `前置自测 · 先确认你掌握了这 ${quiz.length} 个`;
      for (const i of quiz) pq.appendChild(linkItem(i, 'pre'));
    } else { $('#p-prequiz-label').textContent = '前置自测'; pq.innerHTML = '<li class="link-empty">这是一个起点知识点，没有必须前置的内容。</li>'; }
    // 脉络层
    const pre = $('#p-prereqs'); pre.innerHTML = '';
    for (const p of nodes[idx].prereqs) pre.appendChild(linkItem(p, 'pre'));
    $('#p-pre-count').textContent = nodes[idx].prereqs.length;
    const dep = $('#p-deps'); dep.innerHTML = '';
    for (const d of nodes[idx].deps) dep.appendChild(linkItem(d, 'dep'));
    $('#p-dep-count').textContent = nodes[idx].deps.length;
    const sb = $('#p-standards-block');
    if (n.standards && n.standards.length) {
      sb.style.display = '';
      // 按课标体系分组（六类译注）
      const groups = {};
      for (const key of n.standards) {
        const ci = key.indexOf(':');
        const cur = ci >= 0 ? key.slice(0, ci) : '';
        (groups[cur] = groups[cur] || []).push({ key, cur, code: ci >= 0 ? key.slice(ci + 1) : key });
      }
      const order = ['cn-2022', 'uk-nc-2013', 'ccss-ela', 'ccss-math', 'ib-pyp-pspe', 'ngss-k5', 'ngss-ms'].filter(c => groups[c]);
      for (const c in groups) if (!order.includes(c)) order.push(c);
      let html = '';
      for (const cur of order) {
        const meta = CURRICULA_META[cur] || { label: cur, note: '' };
        const all = groups[cur];
        const items = all.slice(0, 6);
        const more = all.length - items.length;
        const lis = items.map(({ key, code }) => {
          const s = standards[key];
          const rawCode = (s && s.code) ? s.code : code;
          const title = (s && s.title && s.title !== rawCode) ? s.title : '';
          const zh = decodeStandard(cur, code);
          const metaLine = [s && s.domain, s && s.keyStage].filter(Boolean).join(' · ');
          return `<li class="st-item"><span class="st-code">${rawCode}</span>`
            + (title ? `<span class="st-title">${title}</span>` : '')
            + (zh ? `<span class="st-zh">译注：${zh}</span>` : '')
            + (metaLine ? `<span class="st-meta">${metaLine}</span>` : '')
            + `</li>`;
        }).join('');
        html += `<div class="st-group"><div class="st-group-head"><span class="st-group-label">${meta.label}</span>${meta.note ? `<span class="st-group-note">${meta.note}</span>` : ''}</div><div class="st-list">${lis}</div>${more > 0 ? `<div class="st-more">…另有 ${more} 条参考课标</div>` : ''}</div>`;
      }
      $('#p-standards').innerHTML = html;
    } else sb.style.display = 'none';
    updatePanelMark();
  }
  function updatePanelMark() {
    if (selIdx == null) return;
    const st = (stateStore[currentProfileId] || {})[nodes[selIdx].id];
    $('#p-mark-known').classList.toggle('is-on', st === 'known');
    $('#p-mark-learning').classList.toggle('is-on', st === 'learning');
    $('#p-mark-none').classList.toggle('is-on', !st);
  }
  function linkItem(i, kind) {
    const n = nodes[i];
    const li = document.createElement('li'); li.className = 'link-item';
    const depth = kind === 'pre' ? upstreamDepth(selIdx, i) : downstreamDepth(selIdx, i);
    li.innerHTML = `<span class="dot" style="background:${subjectColors[n.subject]}"></span><span class="li-name">${n.name}</span><span class="li-depth">${depth >= 0 ? '↧' + depth : ''}</span>`;
    li.addEventListener('click', () => selectNode(i, false));
    return li;
  }
  function upstreamDepth(from, target) {
    const dist = {}; const q = [[from, 0]]; dist[from] = 0;
    while (q.length) { const [c, d] = q.shift(); for (const p of nodes[c].prereqs) { if (dist[p] === undefined) { dist[p] = d + 1; q.push([p, d + 1]); } } }
    return dist[target] !== undefined ? dist[target] : -1;
  }
  function downstreamDepth(from, target) {
    const dist = {}; const q = [[from, 0]]; dist[from] = 0;
    while (q.length) { const [c, d] = q.shift(); for (const d2 of nodes[c].deps) { if (dist[d2] === undefined) { dist[d2] = d + 1; q.push([d2, d + 1]); } } }
    return dist[target] !== undefined ? dist[target] : -1;
  }
  function switchTab(tab) {
    document.querySelectorAll('.ptab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    $('#pane-explain').hidden = tab !== 'explain';
    $('#pane-assess').hidden = tab !== 'assess';
    $('#pane-thread').hidden = tab !== 'thread';
  }

  // ---------- 学习路径视图 ----------
  function openPath(idx) {
    const n = nodes[idx];
    const dist = {}; const q = [[idx, 0]]; dist[idx] = 0;
    while (q.length) { const [c, d] = q.shift(); for (const p of nodes[c].prereqs) { if (dist[p] === undefined) { dist[p] = d + 1; q.push([p, d + 1]); } } }
    const steps = Object.keys(dist).map(i => +i).sort((a, b) => dist[b] - dist[a] || nodes[a].ageMid - nodes[b].ageMid);
    $('#path-title').textContent = n.name;
    const cnt = steps.length - 1;
    $('#path-sub').textContent = cnt > 0 ? `要稳稳抵达「${n.name}」，需先点亮其上游的 ${cnt} 个基石知识点（按依赖深度由远及近排列）。` : `「${n.name}」是一项基础起点，没有必须前置的其他知识点。`;
    const wrap = $('#path-steps'); wrap.innerHTML = '';
    if (steps.length <= 1) { wrap.innerHTML = `<div class="path-empty">该知识点为起点，无需前置。</div>`; }
    else {
      for (const i of steps) {
        const nn = nodes[i];
        const div = document.createElement('div'); div.className = 'path-step';
        const band = ageMode === 'all' ? `${nn.ageStart}–${nn.ageEnd} 岁` : `深度 ${dist[i]}`;
        const tag = i === idx ? '🎯 目标' : `深度 ${dist[i]}`;
        div.innerHTML = `<div class="ps-top"><span class="ps-name">${nn.name}</span><span class="ps-depth">${tag}</span></div>
          <div class="ps-sub"><span class="dot" style="background:${subjectColors[nn.subject]}"></span>${nn.subject} · ${nn.domain}</div>
          <div class="ps-band">${band}</div>`;
        div.addEventListener('click', () => { selectNode(i, false); });
        wrap.appendChild(div);
      }
    }
    $('#path-view').classList.add('open');
    $('#path-view').setAttribute('aria-hidden', 'false');
  }
  function closePath() { $('#path-view').classList.remove('open'); $('#path-view').setAttribute('aria-hidden', 'true'); }

  // ---------- 12 周成长地图 ----------
  function openRoute(idx) {
    const n = nodes[idx];
    const closure = new Set([idx]); const q = [idx];
    while (q.length) { const c = q.shift(); for (const p of nodes[c].prereqs) { if (!closure.has(p)) { closure.add(p); q.push(p); } } }
    const arr = [...closure];
    const WK = 12, minAge = 4, maxAge = 13;
    const weeks = Array.from({ length: WK }, () => []);
    for (const i of arr) {
      const wk = clamp(Math.round((nodes[i].ageMid - minAge) / (maxAge - minAge) * (WK - 1)), 0, WK - 1);
      weeks[wk].push(i);
    }
    weeks.forEach(w => w.sort((a, b) => nodes[b].centrality - nodes[a].centrality));
    $('#route-title').textContent = n.name;
    $('#route-sub').textContent = `从零抵达「${n.name}」，整条前置链共 ${arr.length} 个知识点。下面按建议年龄铺成 12 周：每周点亮该年龄段的基石，循序渐进。`;
    const wrap = $('#route-steps'); wrap.innerHTML = '';
    for (let w = 0; w < WK; w++) {
      const aStart = Math.round(minAge + w / (WK - 1) * (maxAge - minAge));
      const aEnd = Math.round(minAge + (w + 1) / (WK - 1) * (maxAge - minAge));
      const list = weeks[w];
      const sec = document.createElement('section'); sec.className = 'route-week';
      const chips = list.slice(0, 14).map(i => {
        const nn = nodes[i]; const isT = i === idx;
        return `<button class="rw-chip${isT ? ' is-target' : ''}" data-i="${i}" type="button"><span class="dot" style="background:${subjectColors[nn.subject]}"></span>${nn.name}</button>`;
      }).join('');
      const more = list.length > 14 ? `<span class="rw-more">＋${list.length - 14}</span>` : '';
      sec.innerHTML = `<div class="rw-head"><span class="rw-idx">第 ${w + 1} 周</span><span class="rw-age">约 ${aStart}–${aEnd} 岁</span><span class="rw-cnt">${list.length} 个</span></div><div class="rw-list">${chips}${more}</div>`;
      wrap.appendChild(sec);
    }
    wrap.querySelectorAll('.rw-chip').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.i; selectNode(i, true); closeRoute(); }));
    $('#route-view').classList.add('open');
    $('#route-view').setAttribute('aria-hidden', 'false');
  }
  function closeRoute() { $('#route-view').classList.remove('open'); $('#route-view').setAttribute('aria-hidden', 'true'); }

  // ---------- 学科百科 ----------
  function openDomains() {
    const tabs = $('#domain-tabs'); tabs.innerHTML = '';
    SUBJECTS.forEach((s, k) => {
      const b = document.createElement('button'); b.className = 'dom-tab' + (k === 0 ? ' is-active' : ''); b.dataset.subject = s; b.setAttribute('role', 'tab');
      b.innerHTML = `<span class="dot" style="background:${subjectColors[s]};color:${subjectColors[s]}"></span>${s}`;
      b.addEventListener('click', () => { tabs.querySelectorAll('.dom-tab').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); renderDomainList(s); });
      tabs.appendChild(b);
    });
    renderDomainList(SUBJECTS[0]);
    $('#domains-overlay').classList.add('open');
    $('#domains-overlay').setAttribute('aria-hidden', 'false');
  }
  function renderDomainList(subject) {
    const list = $('#domain-list'); list.innerHTML = '';
    const ds = (domainData.domains[subject] || []);
    for (const d of ds) {
      const card = document.createElement('div'); card.className = 'domain-card';
      card.innerHTML = `<div class="dc-head"><span class="dc-name">${d.name}</span><span class="dc-age">${d.ageStart != null ? '约 ' + d.ageStart + ' 岁起' : ''}</span></div>
        <div class="dc-sum">${d.summary || ''}</div><div class="dc-count">${d.count} 个知识点</div>`;
      card.addEventListener('click', () => focusDomain(subject, d.name));
      list.appendChild(card);
    }
  }
  function focusDomain(subject, domain) {
    domainFilter = { subject, domain };
    closeDomains();
    computeVisible();
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9, any = false;
    for (const n of nodes) if (visible[n.i]) { any = true; mnx = Math.min(mnx, n.cx); mny = Math.min(mny, n.cy); mxx = Math.max(mxx, n.cx); mxy = Math.max(mxy, n.cy); }
    if (any) {
      const pad = 120, bw = (mxx - mnx) || 1, bh = (mxy - mny) || 1;
      const s = clamp(Math.min((W - pad * 2) / bw, (H - pad * 2) / bh), 0.05, 4);
      const target = { x: (mnx + mxx) / 2, y: (mny + mxy) / 2, scale: s };
      if (reduceMotion) { Object.assign(cam, target); } else { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 820 }; reasons.cam = true; requestFrame(); }
    }
    const ind = document.createElement('div'); ind.id = 'domain-indicator'; ind.className = 'chip';
    ind.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:36;cursor:pointer';
    ind.innerHTML = `<span class="dot" style="background:${subjectColors[subject]};color:${subjectColors[subject]}"></span>${subject} · ${domain} <span style="opacity:.6">✕</span>`;
    ind.addEventListener('click', clearDomainFilter);
    document.body.appendChild(ind);
    render();
  }
  function closeDomains() { $('#domains-overlay').classList.remove('open'); $('#domains-overlay').setAttribute('aria-hidden', 'true'); }

  // ---------- 教材关键词库（K12）----------
  function openK12() {
    if (!k12Data) { toast('教材关键词库尚未加载'); return; }
    const body = $('#k12-body'); body.innerHTML = '';
    for (const st of k12Data.stages) {
      const sec = document.createElement('section'); sec.className = 'k12-stage';
      sec.innerHTML = `<h3 class="k12-stage-h">${st.name}</h3>`;
      for (const g of st.grades) {
        const gsec = document.createElement('div'); gsec.className = 'k12-grade';
        gsec.innerHTML = `<div class="k12-grade-h">${g.name}</div>`;
        for (const sub of g.subjects) {
          const ssec = document.createElement('div'); ssec.className = 'k12-subj';
          const nn = idToNode(sub.keywords[0] && sub.keywords[0].nodeId);
          const col = nn ? subjectColors[nn.subject] : 'var(--text-3)';
          ssec.innerHTML = `<div class="k12-subj-h"><span class="dot" style="background:${col}"></span>${sub.name}</div>`;
          const wrap = document.createElement('div'); wrap.className = 'k12-kws';
          for (const kw of sub.keywords) {
            const el = document.createElement('button'); el.type = 'button'; el.className = 'k12-kw'; el.textContent = kw.name;
            if (kw.desc) el.title = kw.desc;
            el.addEventListener('click', () => { const i = idToIdx[kw.nodeId]; if (i != null) { selectNode(i, false); flyToNode(i); closeK12(); } else toast('该关键词尚未入图'); });
            wrap.appendChild(el);
          }
          ssec.appendChild(wrap); gsec.appendChild(ssec);
        }
        sec.appendChild(gsec);
      }
      body.appendChild(sec);
    }
    $('#k12-overlay').classList.add('open'); $('#k12-overlay').setAttribute('aria-hidden', 'false');
  }
  function closeK12() { $('#k12-overlay').classList.remove('open'); $('#k12-overlay').setAttribute('aria-hidden', 'true'); }
  function openHelp() { $('#help-modal').classList.add('open'); $('#help-modal').setAttribute('aria-hidden', 'false'); }
  function closeHelp() { $('#help-modal').classList.remove('open'); $('#help-modal').setAttribute('aria-hidden', 'true'); }

  // ---------- 学习地图：进度栏 ----------
  function toggleExplorer() {
    explorerMode = !explorerMode;
    document.body.classList.toggle('explorer-mode', explorerMode);
    $('#explorer-btn').classList.toggle('is-active', explorerMode);
    if (explorerMode) renderProfileBar();
    render();
  }
  function renderProfileBar() {
    const pb = $('#pb-profiles'); pb.innerHTML = '';
    profiles.list.forEach(p => {
      const b = document.createElement('button'); b.className = 'pb-profile' + (p.id === currentProfileId ? ' is-active' : ''); b.type = 'button'; b.dataset.id = p.id;
      b.innerHTML = `<span class="pb-pname">${p.name}</span>` + (profiles.list.length > 1 ? `<span class="pb-del" data-del="${p.id}" title="删除该学习者">✕</span>` : '');
      b.addEventListener('click', (e) => {
        if (e.target.dataset.del) { e.stopPropagation(); if (confirm(`确定删除学习者「${p.name}」及其全部进度？`)) deleteProfile(p.id); return; }
        selectProfile(p.id);
      });
      b.addEventListener('dblclick', () => { const nn = prompt('重命名学习者：', p.name); if (nn && nn.trim()) { p.name = nn.trim(); saveProfiles(); renderProfileBar(); } });
      pb.appendChild(b);
    });
    $('#pb-progress').textContent = `已掌握 ${knownSet.size} / ${N}`;
  }

  // ---------- 成长日志（Logbook）----------
  function suggestNext(limit) {
    const st = stateStore[currentProfileId] || {};
    const res = [];
    for (const n of nodes) {
      if (st[n.id]) continue;
      const hard = links.filter(l => l.t === n.i && l.strength === 'hard').map(l => l.s);
      if (hard.length && hard.every(h => knownSet.has(h))) res.push(n);
    }
    res.sort((a, b) => a.ageMid - b.ageMid || b.centrality - a.centrality);
    return res.slice(0, limit);
  }
  function openLogbook() {
    const sid = currentProfileId; const p = profiles.list.find(x => x.id === sid);
    $('#logbook-title').textContent = (p ? p.name : '学习者') + ' · 成长日志';
    const total = N;
    const known = knownSet.size, learning = learningSet.size;
    const assessed = known + learning;
    const notStarted = total - assessed;
    const pct = Math.round(known / total * 100);
    const subjStats = {}; SUBJECTS.forEach(s => subjStats[s] = { total: 0, known: 0, learning: 0 });
    for (const n of nodes) { subjStats[n.subject].total++; if (knownSet.has(n.i)) subjStats[n.subject].known++; else if (learningSet.has(n.i)) subjStats[n.subject].learning++; }
    const sugg = suggestNext(10);
    const act = (activityStore[sid] || []).slice(0, 12);
    const body = $('#logbook-body');
    body.innerHTML = `
      <div class="lb-top">
        <div class="lb-ring" style="--p:${pct}"><span class="lb-pct">${pct}%</span><span class="lb-ring-lbl">已掌握</span></div>
        <div class="lb-kpis">
          <div class="lb-kpi"><b>${known}</b><span>已掌握</span></div>
          <div class="lb-kpi"><b>${learning}</b><span>在学中</span></div>
          <div class="lb-kpi"><b>${notStarted}</b><span>未开始</span></div>
          <div class="lb-kpi"><b>${total}</b><span>总计</span></div>
        </div>
      </div>
      <div class="lb-section">
        <h3 class="lb-h">学科进度</h3>
        <div class="lb-subjects">${SUBJECTS.map(s => { const ss = subjStats[s]; const pc = ss.total ? Math.round(ss.known / ss.total * 100) : 0; return `<div class="lb-subj"><span class="lb-subj-name"><span class="dot" style="background:${subjectColors[s]}"></span>${s}</span><span class="lb-subj-pct">${pc}%</span><span class="lb-track"><span class="lb-fill" style="width:${pc}%;background:${subjectColors[s]}"></span></span><span class="lb-subj-num">${ss.known}/${ss.total}</span></div>`; }).join('')}</div>
      </div>
      <div class="lb-section">
        <h3 class="lb-h">下一步建议 <span class="lb-hint">前置已全部掌握的待学知识点</span></h3>
        <div class="lb-sugg">${sugg.length ? sugg.map(n => `<button class="lb-sugg-item" data-i="${n.i}" type="button"><span class="lb-sugg-name"><span class="dot" style="background:${subjectColors[n.subject]}"></span>${n.name}</span><span class="lb-sugg-meta">${n.subject} · ${n.ageStart}–${n.ageEnd} 岁</span></button>`).join('') : '<p class="lb-empty">暂时没有“前置已就绪”的待学点——先去标记一些已掌握的基础吧。</p>'}</div>
      </div>
      <div class="lb-section">
        <h3 class="lb-h">近期活动</h3>
        <div class="lb-trail">${act.length ? act.map(a => { const n = idToNode(a.id); const label = a.state === 'known' ? '标记已掌握' : a.state === 'learning' ? '标记在学中' : '清除标记'; return `<div class="lb-trail-item"><span class="lb-trail-dot ${a.state}"></span><span class="lb-trail-name">${n ? n.name : '—'}</span><span class="lb-trail-act">${label}</span><span class="lb-trail-time">${fmtTime(a.ts)}</span></div>`; }).join('') : '<p class="lb-empty">还没有记录。点开一个知识点，标记它的掌握状态试试。</p>'}</div>
      </div>`;
    body.querySelectorAll('.lb-sugg-item').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.i; selectNode(i, true); }));
    $('#logbook-view').classList.add('open');
    $('#logbook-view').setAttribute('aria-hidden', 'false');
  }
  function closeLogbook() { $('#logbook-view').classList.remove('open'); $('#logbook-view').setAttribute('aria-hidden', 'true'); }

  // ---------- 搜索 ----------
  function buildSearchIndex() {
    searchIndex = nodes.map(n => ({ i: n.i, name: n.name, subject: n.subject, domain: n.domain, color: subjectColors[n.subject], py: n.name }));
  }
  function runSearch(q) {
    q = q.trim().toLowerCase();
    const box = $('#search-results');
    if (!q) { box.hidden = true; return; }
    const res = searchIndex.filter(x => x.name.toLowerCase().includes(q) || x.domain.toLowerCase().includes(q)).slice(0, 9);
    if (!res.length) { box.innerHTML = `<div class="sr-item" style="color:var(--text-3);cursor:default">未找到匹配的知识点</div>`; box.hidden = false; return; }
    box.innerHTML = res.map(x => `<div class="sr-item" data-i="${x.i}"><span class="dot" style="background:${x.color}"></span><span class="sr-name">${x.name}</span><span class="sr-dom">${x.domain}</span></div>`).join('');
    box.hidden = false;
    box.querySelectorAll('.sr-item[data-i]').forEach(el => el.addEventListener('click', () => {
      const i = +el.dataset.i; selectNode(i, true); box.hidden = true; $('#search-input').value = '';
    }));
  }

  // ---------- 主题 ----------
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    $('#theme-btn').textContent = next === 'light' ? '☾' : '☀';
    refreshThemeColors();
    render();
  }

  // ---------- 键盘 ----------
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') {
      if ($('#route-view').classList.contains('open')) return closeRoute();
      if ($('#logbook-view').classList.contains('open')) return closeLogbook();
      if ($('#path-view').classList.contains('open')) return closePath();
      if ($('#domains-overlay').classList.contains('open')) return closeDomains();
      if ($('#k12-overlay').classList.contains('open')) return closeK12();
      if ($('#help-modal').classList.contains('open')) return closeHelp();
      if (selIdx != null) return deselect();
      if (domainFilter) return clearDomainFilter();
    }
    if (e.key === 'f' || e.key === 'F') fitCamera(false);
    if (e.key === 'r' || e.key === 'R') toggleRotate();
    if (e.key === '+' || e.key === '=') { cam.scale = clamp(cam.scale * 1.25, 0.05, 6); render(); }
    if (e.key === '-' || e.key === '_') { cam.scale = clamp(cam.scale / 1.25, 0.05, 6); render(); }
    if (e.key === '/') { e.preventDefault(); $('#search-input').focus(); }
    if (e.key.startsWith('Arrow') && selIdx == null) {
      const step = 60 / cam.scale;
      if (e.key === 'ArrowLeft') cam.x -= step; if (e.key === 'ArrowRight') cam.x += step;
      if (e.key === 'ArrowUp') cam.y -= step; if (e.key === 'ArrowDown') cam.y += step;
      render();
    }
  });

  // ---------- 尺寸 ----------
  function resize() {
    W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    render();
  }
  window.addEventListener('resize', resize);

  // ---------- 绑定静态控件 ----------
  function bind() {
    $('#enter-btn').addEventListener('click', () => {
      document.body.removeAttribute('data-loading');
      const target = { x: cam.x, y: cam.y, scale: clamp(cam.scale * 1.06, 0.05, 4) };
      if (!reduceMotion) { camTween = { from: { ...cam }, to: target, start: performance.now(), dur: 1100 }; reasons.cam = true; requestFrame(); }
      $('#hint').classList.add('show');
      setTimeout(() => $('#hint').classList.remove('show'), 6000);
    });
    $('#panel-close').addEventListener('click', deselect);
    $('#p-path').addEventListener('click', () => { if (selIdx != null) openPath(selIdx); });
    $('#p-route').addEventListener('click', () => { if (selIdx != null) openRoute(selIdx); });
    $('#p-focus').addEventListener('click', () => { if (selIdx != null) focusNode(selIdx, 2.0); });
    $('#path-close').addEventListener('click', closePath);
    $('#route-close').addEventListener('click', closeRoute);
    $('#logbook-close').addEventListener('click', closeLogbook);
    $('#domains-btn').addEventListener('click', openDomains);
    $('#domains-btn-top').addEventListener('click', openDomains);
    $('#domains-close').addEventListener('click', closeDomains);
    $('#help-btn-top').addEventListener('click', openHelp);
    $('#help-close').addEventListener('click', closeHelp);
    $('#theme-btn').addEventListener('click', toggleTheme);
    $('#explorer-btn').addEventListener('click', toggleExplorer);
    $('#cn-line-btn').addEventListener('click', toggleCnLine);
    $('#cn-prev').addEventListener('click', () => cnRoam(-1));
    $('#cn-next').addEventListener('click', () => cnRoam(1));
    $('#cn-exit').addEventListener('click', toggleCnLine);
    $('#rotate-btn').addEventListener('click', toggleRotate);
    $('#k12-btn').addEventListener('click', openK12);
    $('#k12-close').addEventListener('click', closeK12);
    $('#pb-add').addEventListener('click', addProfile);
    $('#pb-logbook').addEventListener('click', openLogbook);
    $('#pb-reset').addEventListener('click', resetCurrent);
    $('#pb-hide-known').addEventListener('change', (e) => { hideKnown = e.target.checked; render(); });
    $('#p-mark-known').addEventListener('click', () => { if (selIdx != null) markNode(selIdx, 'known'); });
    $('#p-mark-learning').addEventListener('click', () => { if (selIdx != null) markNode(selIdx, 'learning'); });
    $('#p-mark-none').addEventListener('click', () => { if (selIdx != null) markNode(selIdx, 'none'); });
    document.querySelectorAll('.ptab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#search-input').addEventListener('input', (e) => runSearch(e.target.value));
    $('#mobile-search-input').addEventListener('input', (e) => runSearch(e.target.value));
    $('#age-quick').querySelectorAll('.age-q').forEach(b => b.addEventListener('click', () => setAge(b.dataset.range, $('#age-quick'))));
    $('#age-dial').addEventListener('input', (e) => { ageMin = +e.target.value; updateAgeHint(); clearDomainFilter(); computeVisible(); render(); });
    document.querySelectorAll('#layout-switch .ls-btn').forEach(b => b.addEventListener('click', () => setLayoutMode(b.dataset.layout)));
    $('#sb-prev').addEventListener('click', () => scrollSubjects(-1));
    $('#sb-next').addEventListener('click', () => scrollSubjects(1));
    const subjWrap = $('#subject-chips');
    if (subjWrap) { subjWrap.addEventListener('scroll', updateSubjectScrollState, { passive: true }); window.addEventListener('resize', updateSubjectScrollState); }
    $('#menu-btn').addEventListener('click', () => { $('#mobile-sheet').classList.add('open'); $('#sheet-scrim').classList.add('open'); });
    $('#sheet-scrim').addEventListener('click', () => { $('#mobile-sheet').classList.remove('open'); $('#sheet-scrim').classList.remove('open'); });
  }

  // ---------- 启动 ----------
  bind();
  load();
})();
