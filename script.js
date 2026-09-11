(function(){
  const dateStr = document.getElementById('dateStr');
  if(dateStr){
    dateStr.textContent = new Date().toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  }

  const pages = {
    today: document.getElementById('page-today'),
    profile: document.getElementById('page-profile'),
    move: document.getElementById('page-move'),
    gym: document.getElementById('page-gym'),
    heart: document.getElementById('page-heart'),
    sleep: document.getElementById('page-sleep'),
    body: document.getElementById('page-body'),
    more: document.getElementById('page-more'),
  };
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));

  function showTab(name){
    if(!pages[name]) return;
    Object.keys(pages).forEach(k => pages[k].classList.toggle('active', k === name));
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  }

  tabBtns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-tab]').forEach(el => {
    if(el.classList.contains('tab-btn')) return;
    el.addEventListener('click', () => showTab(el.dataset.tab));
  });
})();
(function(){
  const stepCountEl = document.getElementById('stepCount');
  const countCore = document.getElementById('countCore');
  const distVal = document.getElementById('distVal');
  const paceVal = document.getElementById('paceVal');
  const calVal = document.getElementById('calVal');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const rhythm = document.getElementById('rhythm');
  const progressFill = document.querySelector('#page-move .progress .fill');
  const goalDisplay = document.getElementById('goalDisplay');
  const goalEditBtn = document.getElementById('goalEditBtn');
  const chart = document.getElementById('chart');
  const streakBadge = document.getElementById('streakBadge').querySelector('span');

  const CIRC = 2 * Math.PI * 102;
  const STRIDE_M = 0.75;
  const KCAL_PER_STEP = 0.04;
  const AUTOPAUSE_MS = 45000;

  function todayKey(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  let goal = parseInt(localStorage.getItem('gait_goal') || '10000', 10);
  let history = {};
  try{ history = JSON.parse(localStorage.getItem('gait_history') || '{}'); }catch(e){ history = {}; }

  let steps = history[todayKey()] || 0;
  let listening = false;
  let autoPaused = false;
  let lastPeakTime = 0;
  let smoothed = 0;
  let trend = 0;
  let recentTimes = [];
  let autopauseTimer = null;

  function saveHistory(){ history[todayKey()] = steps; localStorage.setItem('gait_history', JSON.stringify(history)); }

  goalDisplay.textContent = goal.toLocaleString();

  const BAR_TOTAL = 90;
  const bars = [];
  for(let i=0;i<BAR_TOTAL;i++){
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.height = '2.5px';
    rhythm.appendChild(b);
    bars.push(b);
  }
  function pushBar(height, isStep){
    const b = bars.shift();
    b.style.height = Math.max(2.5, Math.min(40, height)) + 'px';
    b.className = 'bar' + (isStep ? ' step' : '');
    rhythm.appendChild(b);
    bars.push(b);
  }

  function computeStreak(){
    let streak = 0;
    let d = new Date();
    if((history[todayKey()] || 0) < goal){ d.setDate(d.getDate() - 1); }
    while(true){
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const val = history[key] || 0;
      if(val >= goal){ streak++; d.setDate(d.getDate() - 1); } else { break; }
    }
    return streak;
  }

  function renderChart(){
    chart.innerHTML = '';
    const days = [];
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      days.push({ key, label: d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2), isToday: i===0, val: (i===0 ? steps : (history[key]||0)) });
    }
    const maxVal = Math.max(goal, ...days.map(d=>d.val), 1);
    days.forEach(d => {
      const col = document.createElement('div'); col.className = 'chart-col';
      const bar = document.createElement('div');
      bar.className = 'chart-bar' + (d.isToday ? ' today' : (d.val >= goal ? ' met' : ''));
      const h = Math.max(4, Math.round((d.val / maxVal) * 76));
      bar.style.height = h + 'px';
      const lbl = document.createElement('div'); lbl.className = 'chart-lbl'; lbl.textContent = d.label;
      col.appendChild(bar); col.appendChild(lbl); chart.appendChild(col);
    });
    streakBadge.textContent = computeStreak() + '-day streak';
  }

  function render(){
    stepCountEl.textContent = steps.toLocaleString();
    const km = (steps * STRIDE_M) / 1000;
    distVal.textContent = km.toFixed(2);
    calVal.textContent = Math.round(steps * KCAL_PER_STEP);
    const frac = Math.min(1, steps / goal);
    progressFill.style.strokeDasharray = CIRC;
    progressFill.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(1);
    const now = Date.now();
    recentTimes = recentTimes.filter(t => now - t < 60000);
    paceVal.textContent = recentTimes.length > 0 ? recentTimes.length : '—';
    saveHistory();
    renderChart();
  }

  function armAutopause(){
    clearTimeout(autopauseTimer);
    autopauseTimer = setTimeout(() => {
      if(listening && !autoPaused){ autoPaused = true; setStatus('Auto-paused — no motion detected. Move to resume.', 'paused'); }
    }, AUTOPAUSE_MS);
  }

  function registerStep(mag){
    if(autoPaused){ autoPaused = false; setStatus('Reading motion — walk naturally.', 'live'); }
    armAutopause();
    steps += 1;
    recentTimes.push(Date.now());
    countCore.classList.add('pulse');
    setTimeout(()=>countCore.classList.remove('pulse'), 100);
    pushBar(10 + Math.min(30, (mag - 9.8) * 6), true);
    render();
  }

  function handleMotion(e){
    const a = e.accelerationIncludingGravity;
    if(!a || a.x === null) return;
    const mag = Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2);
    smoothed = smoothed === 0 ? mag : smoothed * 0.8 + mag * 0.2;
    const delta = mag - smoothed;
    if(!listening || autoPaused) return;
    if(Math.random() < 0.3){ pushBar(6 + Math.abs(delta) * 5, false); }
    const now = Date.now();
    const THRESHOLD = 1.15, MIN_INTERVAL = 260;
    if(delta > THRESHOLD && trend <= 0 && (now - lastPeakTime) > MIN_INTERVAL){
      trend = 1; lastPeakTime = now; registerStep(mag);
    } else if(delta < -THRESHOLD * 0.3){ trend = -1; }
  }

  function setStatus(text, mode){ statusText.textContent = text; statusDot.className = 'dot' + (mode ? ' ' + mode : ''); }

  function beginListening(){
    window.addEventListener('devicemotion', handleMotion, true);
    listening = true; autoPaused = false; armAutopause();
    setStatus('Reading motion — walk naturally.', 'live');
    startBtn.textContent = 'Stop'; startBtn.classList.add('stopping');
  }
  function stopListening(){
    window.removeEventListener('devicemotion', handleMotion, true);
    listening = false; autoPaused = false; clearTimeout(autopauseTimer);
    setStatus('Paused. Press begin to resume counting.', '');
    startBtn.textContent = 'Begin'; startBtn.classList.remove('stopping');
  }

  startBtn.addEventListener('click', async () => {
    if(listening){ stopListening(); return; }
    if(typeof DeviceMotionEvent === 'undefined'){
      setStatus('This device has no motion sensor available.', 'err'); startBtn.disabled = true; return;
    }
    if(typeof DeviceMotionEvent.requestPermission === 'function'){
      try{
        const result = await DeviceMotionEvent.requestPermission();
        if(result === 'granted'){ beginListening(); }
        else { setStatus('Motion access denied. Enable it in Settings to count steps.', 'err'); }
      }catch(err){ setStatus('Could not request motion access. Try again.', 'err'); }
    } else { beginListening(); }
  });

  resetBtn.addEventListener('click', () => { steps = 0; recentTimes = []; render(); });

  goalEditBtn.addEventListener('click', () => {
  
    if(v === null) return;
    const n = Math.max(500, parseInt(v, 10) || 10000);
    goal = n;
    goalDisplay.textContent = n.toLocaleString();
    localStorage.setItem('gait_goal', String(n));
    render();
  });

  // ---- settings sheet ----
  const settingsBtn = document.getElementById('settingsBtn');
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheet');
  const closeSheet = document.getElementById('closeSheet');
  const goalInput = document.getElementById('goalInput');
  const stepGoalRowVal = document.getElementById('stepGoalRowVal');

  goalInput.value = goal;
  stepGoalRowVal.textContent = goal.toLocaleString();

  let openSettingsDetailEl = null;
  function openSettingsDetail(id){
    const el = document.getElementById(id);
    if(!el) return;
    sheet.classList.remove('open');
    el.classList.add('open');
    openSettingsDetailEl = el;
  }
  function closeSettingsDetail(){
    if(openSettingsDetailEl){ openSettingsDetailEl.classList.remove('open'); openSettingsDetailEl = null; }
    sheet.classList.add('open');
  }
  document.querySelectorAll('.settings-row.nav[data-open]').forEach(row => {
    row.addEventListener('click', () => openSettingsDetail(row.getAttribute('data-open')));
  });
  document.querySelectorAll('.settings-detail [data-back]').forEach(btn => {
    btn.addEventListener('click', closeSettingsDetail);
  });

  function adjustStepper(input, dir){
    const step = parseFloat(input.step) || 1;
    let v = (parseFloat(input.value) || 0) + dir * step;
    v = Math.max(500, v);
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }
  document.querySelectorAll('.settings-detail .stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = btn.parentElement;
      const input = wrap.querySelector('input.stepper-input');
      if(input) adjustStepper(input, btn.classList.contains('minus') ? -1 : 1);
    });
  });

  function openSheet(){ overlay.classList.add('open'); sheet.classList.add('open'); }
  function closeSheetFn(){ closeSettingsDetail(); overlay.classList.remove('open'); sheet.classList.remove('open'); }
  settingsBtn.addEventListener('click', openSheet);
  goalEditBtn.addEventListener('click', openSheet);
  overlay.addEventListener('click', () => { if(openSettingsDetailEl){ closeSettingsDetail(); } else { closeSheetFn(); } });
  closeSheet.addEventListener('click', closeSheetFn);

  goalInput.addEventListener('change', () => {
    const v = Math.max(500, parseInt(goalInput.value || '10000', 10));
    goal = v; goalInput.value = v; goalDisplay.textContent = v.toLocaleString();
    stepGoalRowVal.textContent = v.toLocaleString();
    localStorage.setItem('gait_goal', String(v)); render();
  });

  render();

  if(location.protocol !== 'https:' && location.hostname !== 'localhost'){
    setStatus('Needs to be opened over HTTPS for motion access to work.', 'err');
  }
})();
(function(){
  function pad(n){ return String(n).padStart(2,'0'); }
  function keyFor(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function todayKey(){ return keyFor(new Date()); }
  function readJSON(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }catch(e){ return fallback; }
  }

  const cupGrid = document.getElementById('cupGrid');
  const waterNum = document.getElementById('waterNum');
  const waterBar = document.getElementById('waterBar');
  const waterChart = document.getElementById('waterChart');
  const CUP_ML = 250;

  let waterGoal = parseInt(localStorage.getItem('vt_water_goal') || '2000', 10);
  document.getElementById('waterGoalNum').textContent = waterGoal;

  function getWaterHistory(){ return readJSON('vt_water_history', {}); }
  function setWaterToday(ml){
    const hist = getWaterHistory();
    hist[todayKey()] = Math.max(0, ml);
    localStorage.setItem('vt_water_history', JSON.stringify(hist));
  }
  function addWater(ml){
    const hist = getWaterHistory();
    const cur = hist[todayKey()] || 0;
    setWaterToday(cur + ml);
    renderWater();
  }

  function renderWater(){
    const hist = getWaterHistory();
    const ml = hist[todayKey()] || 0;
    waterNum.textContent = ml.toLocaleString();
    waterBar.style.width = Math.min(100, Math.round((ml / waterGoal) * 100)) + '%';

    const totalCups = Math.max(4, Math.round(waterGoal / CUP_ML));
    const filled = Math.round(ml / CUP_ML);
    cupGrid.innerHTML = '';
    for(let i=0;i<totalCups;i++){
      const c = document.createElement('div');
      c.className = 'cup' + (i < filled ? ' filled' : '');
      c.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5s6.5 7.2 6.5 12a6.5 6.5 0 01-13 0c0-4.8 6.5-12 6.5-12z"/></svg>';
      c.addEventListener('click', () => { setWaterToday((i+1) * CUP_ML); renderWater(); });
      cupGrid.appendChild(c);
    }

    waterChart.innerHTML = '';
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = keyFor(d);
      const val = i === 0 ? ml : (hist[key] || 0);
      const col = document.createElement('div'); col.className = 'chart-col';
      const bar = document.createElement('div');
      bar.className = 'chart-bar blue' + (i === 0 ? ' today' : (val >= waterGoal ? ' met' : ''));
      const maxVal = Math.max(waterGoal, ml, 1);
      const h = Math.max(4, Math.round((val / maxVal) * 76));
      bar.style.height = h + 'px';
      const lbl = document.createElement('div'); lbl.className = 'chart-lbl'; lbl.textContent = d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2);
      col.appendChild(bar); col.appendChild(lbl); waterChart.appendChild(col);
    }
  }

  document.getElementById('waterAdd200').addEventListener('click', () => addWater(200));
  document.getElementById('waterAdd350').addEventListener('click', () => addWater(350));
  document.getElementById('waterAdd500').addEventListener('click', () => addWater(500));
  document.getElementById('waterReset').addEventListener('click', () => { setWaterToday(0); renderWater(); });

  renderWater();
})();