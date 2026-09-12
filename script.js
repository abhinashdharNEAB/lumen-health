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
(function(){
  function pad(n){ return String(n).padStart(2,'0'); }
  function keyFor(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function todayKey(){ return keyFor(new Date()); }
  function readJSON(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }catch(e){ return fallback; }
  }

  const sleepBed = document.getElementById('sleepBed');
  const sleepWake = document.getElementById('sleepWake');
  const sleepQualityRow = document.getElementById('sleepQualityRow');
  const sleepSaveBtn = document.getElementById('sleepSaveBtn');
  const sleepLastVal = document.getElementById('sleepLastVal');
  const sleepGoalTag = document.getElementById('sleepGoalTag');
  const sleepChart = document.getElementById('sleepChart');
  const sleepAvg = document.getElementById('sleepAvg');
  let sleepQuality = 3;
  let sleepGoal = parseFloat(localStorage.getItem('vt_sleep_goal') || '8');

  sleepQualityRow.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sleepQualityRow.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      sleepQuality = parseInt(chip.dataset.q, 10);
    });
  });

  function getSleepLog(){ return readJSON('vt_sleep_log', {}); }

  function fmtHours(hrs){
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return h + 'h ' + m + 'm';
  }

  sleepSaveBtn.addEventListener('click', () => {
    const [bh, bm] = sleepBed.value.split(':').map(Number);
    const [wh, wm] = sleepWake.value.split(':').map(Number);
    if(isNaN(bh) || isNaN(wh)){ return; }
    let bedMin = bh * 60 + bm;
    let wakeMin = wh * 60 + wm;
    if(wakeMin <= bedMin) wakeMin += 24 * 60;
    const hours = (wakeMin - bedMin) / 60;

    const log = getSleepLog();
    log[todayKey()] = { hours, quality: sleepQuality, bed: sleepBed.value, wake: sleepWake.value };
    localStorage.setItem('vt_sleep_log', JSON.stringify(log));
    renderSleep();
  });

  function renderSleep(){
    const log = getSleepLog();
    const todayEntry = log[todayKey()];
    if(todayEntry){
      sleepLastVal.textContent = fmtHours(todayEntry.hours);
      sleepGoalTag.textContent = todayEntry.hours >= sleepGoal ? 'Goal met' : ('Below goal · ' + fmtHours(Math.max(0, sleepGoal - todayEntry.hours)) + ' short');
    } else {
      sleepLastVal.textContent = '—';
      sleepGoalTag.textContent = 'No entry yet';
    }

    sleepChart.innerHTML = '';
    let sum = 0, count = 0;
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = keyFor(d);
      const entry = log[key];
      const val = entry ? entry.hours : 0;
      if(entry){ sum += entry.hours; count++; }
      const col = document.createElement('div'); col.className = 'chart-col';
      const bar = document.createElement('div');
      bar.className = 'chart-bar violet' + (i === 0 ? ' today' : (val >= sleepGoal ? ' met' : ''));
      const maxVal = Math.max(sleepGoal, val, 1);
      const h = Math.max(4, Math.round((val / maxVal) * 76));
      bar.style.height = h + 'px';
      const lbl = document.createElement('div'); lbl.className = 'chart-lbl'; lbl.textContent = d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2);
      col.appendChild(bar); col.appendChild(lbl); sleepChart.appendChild(col);
    }
    sleepAvg.textContent = count ? fmtHours(sum / count) : '— h';
  }

  renderSleep();
})();
(function(){
  function readJSON(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }catch(e){ return fallback; }
  }

  const heightInput = document.getElementById('heightInput');
  const weightInput = document.getElementById('weightInput');
  const weightLogBtn = document.getElementById('weightLogBtn');
  const weightNum = document.getElementById('weightNum');
  const weightDelta = document.getElementById('weightDelta');
  const bmiVal = document.getElementById('bmiVal');
  const bmiCat = document.getElementById('bmiCat');
  const weightList = document.getElementById('weightList');
  const weightEmptyHint = document.getElementById('weightEmptyHint');

  let heightCm = parseFloat(localStorage.getItem('vt_height_cm') || '') || null;
  if(heightCm) heightInput.value = heightCm;

  heightInput.addEventListener('change', () => {
    const v = parseFloat(heightInput.value);
    heightCm = (v && v > 0) ? v : null;
    if(heightCm) localStorage.setItem('vt_height_cm', String(heightCm));
    else localStorage.removeItem('vt_height_cm');
    renderWeight();
  });

  function getWeightLog(){ return readJSON('vt_weight_log', []); }

  function bmiInfo(kg, cm){
    if(!kg || !cm) return null;
    const m = cm / 100;
    const bmi = kg / (m * m);
    let cat = 'Normal', color = 'var(--teal)';
    if(bmi < 18.5){ cat = 'Underweight'; color = 'var(--blue)'; }
    else if(bmi >= 25 && bmi < 30){ cat = 'Overweight'; color = 'var(--coral)'; }
    else if(bmi >= 30){ cat = 'Obese'; color = 'var(--coral)'; }
    return { bmi, cat, color };
  }

  weightLogBtn.addEventListener('click', () => {
    const v = parseFloat(weightInput.value);
    if(!v || v <= 0) return;
    const log = getWeightLog();
    log.push({ ts: Date.now(), kg: v });
    localStorage.setItem('vt_weight_log', JSON.stringify(log));
    weightInput.value = '';
    renderWeight();
  });

  function renderWeight(){
    const log = getWeightLog().slice().sort((a,b) => a.ts - b.ts);
    weightList.innerHTML = '';

    if(!log.length){
      weightNum.textContent = '—';
      weightDelta.textContent = 'no history';
      weightDelta.className = 'weight-delta';
      weightEmptyHint.style.display = 'block';
      bmiVal.textContent = '—';
      bmiCat.textContent = 'set height';
      return;
    }
    weightEmptyHint.style.display = 'none';

    const latest = log[log.length - 1];
    weightNum.textContent = latest.kg.toFixed(1);

    if(log.length >= 2){
      const prev = log[log.length - 2];
      const diff = latest.kg - prev.kg;
      weightDelta.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' kg';
      weightDelta.className = 'weight-delta ' + (diff > 0 ? 'up' : (diff < 0 ? 'down' : ''));
    } else {
      weightDelta.textContent = 'first entry';
      weightDelta.className = 'weight-delta';
    }

    const info = bmiInfo(latest.kg, heightCm);
    if(info){
      bmiVal.textContent = info.bmi.toFixed(1);
      bmiCat.textContent = info.cat;
      bmiCat.style.color = info.color;
    } else {
      bmiVal.textContent = '—';
      bmiCat.textContent = 'set height';
    }

    log.slice(-8).reverse().forEach(e => {
      const row = document.createElement('div'); row.className = 'weight-row';
      const val = document.createElement('div'); val.className = 'weight-row-val'; val.textContent = e.kg.toFixed(1) + ' kg';
      const time = document.createElement('div'); time.className = 'weight-row-time';
      time.textContent = new Date(e.ts).toLocaleDateString(undefined, { month:'short', day:'numeric' });
      row.appendChild(val); row.appendChild(time);
      weightList.appendChild(row);
    });
  }

  renderWeight();
})();
(function(){
  const hrBpm = document.getElementById('hrBpm');
  const hrWave = document.getElementById('hrWave');
  const hrCheckBtn = document.getElementById('hrCheckBtn');
  const hrBtnLabel = document.getElementById('hrBtnLabel');
  const hrStatus = document.getElementById('hrStatus');
  const hrHistoryEl = document.getElementById('hrHistory');
  const hrIcon = document.getElementById('hrIcon');
  const hrReadingWrap = document.getElementById('hrReadingWrap');
  const hrLoadingIcon = document.getElementById('hrLoadingIcon');
  const hrCanvas = document.getElementById('hrCanvas');
  const hrPreview = document.getElementById('hrPreview');
  const hrCtx = hrCanvas.getContext('2d', { willReadFrequently: true });

  const HR_WAVE_BARS = 60;
  const hrBars = [];
  for(let i=0;i<HR_WAVE_BARS;i++){
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.height = '2px';
    hrWave.appendChild(b);
    hrBars.push(b);
  }
  function pushHrBar(height, on){
    const b = hrBars.shift();
    b.style.height = Math.max(2, Math.min(40, height)) + 'px';
    b.className = 'bar' + (on ? ' on' : '');
    hrWave.appendChild(b);
    hrBars.push(b);
  }

  let hrHistory = [];
  try{ hrHistory = JSON.parse(localStorage.getItem('gait_hr_history') || '[]'); }catch(e){ hrHistory = []; }

  function renderHrHistory(){
    hrHistoryEl.innerHTML = '';
    hrHistory.slice(0,5).forEach(r => {
      const row = document.createElement('div');
      row.className = 'hr-row';
      const bpmEl = document.createElement('div');
      bpmEl.className = 'hr-row-bpm';
      bpmEl.textContent = r.bpm + ' bpm';
      const timeEl = document.createElement('div');
      timeEl.className = 'hr-row-time';
      timeEl.textContent = new Date(r.ts).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
      row.appendChild(bpmEl); row.appendChild(timeEl);
      hrHistoryEl.appendChild(row);
    });
  }
  renderHrHistory();
  if(hrHistory.length){
    hrBpm.textContent = hrHistory[0].bpm;
    hrBpm.classList.remove('placeholder');
  }

  let hrStream = null;
  let hrTorchOn = false;
  let hrVideo = null;
  let hrRafId = null;
  let hrMeasuring = false;
  let hrSamples = [];
  let hrStartTime = 0;
  const HR_DURATION_MS = 20000;

  let lastHrBlinkTime = 0;
  let hrTrend = 0;
  let hrSmoothedR = 0;
  let liveBeatTimestamps = [];

  function setHrStatus(text){ hrStatus.textContent = text; }

  async function startHrCheck(){
    if(hrMeasuring) return;
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      setHrStatus('Camera access is not available on this browser. (Needs HTTPS)');
      return;
    }
    try {
      hrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    } catch(err) {
      setHrStatus('Camera access denied or unavailable.');
      return;
    }

    const track = hrStream.getVideoTracks()[0];
    hrTorchOn = false;
    try { await track.applyConstraints({ advanced: [{ torch: true }] }); hrTorchOn = true; } catch(e) {}

    hrVideo = document.createElement('video');
    hrVideo.setAttribute('playsinline', ''); hrVideo.setAttribute('autoplay', '');
    hrVideo.playsInline = true; hrVideo.autoplay = true; hrVideo.muted = true;
    hrVideo.srcObject = hrStream;

    try { await hrVideo.play(); }
    catch (e) { setHrStatus('Playback blocked by browser. Try again.'); hrStream.getTracks().forEach(t => t.stop()); return; }

    hrPreview.classList.add('active');
    hrMeasuring = true;
    hrSamples = []; liveBeatTimestamps = [];
    hrStartTime = Date.now();
    hrTrend = 0; hrSmoothedR = 0; lastHrBlinkTime = Date.now();

    hrBpm.textContent = '—'; hrBpm.classList.add('placeholder');
    hrReadingWrap.classList.add('measuring');
    hrLoadingIcon.classList.add('active');
    hrCheckBtn.classList.add('checking');
    hrBtnLabel.textContent = 'Measuring…';
    hrIcon.classList.add('pulsing');
    setHrStatus('Hold still — measuring for 20 seconds.');

    hrLoop();
  }

  function hrLoop(){
    if(!hrMeasuring) return;
    const elapsed = Date.now() - hrStartTime;
    try{
      hrCtx.drawImage(hrVideo, 0, 0, hrCanvas.width, hrCanvas.height);
      const frame = hrCtx.getImageData(0, 0, hrCanvas.width, hrCanvas.height).data;
      let rSum = 0, gSum = 0;
      const n = frame.length / 4;
      for(let i=0;i<frame.length;i+=4){ rSum += frame[i]; gSum += frame[i+1]; }
      const rAvg = rSum / n, gAvg = gSum / n;

      const fingerDetected = rAvg > 25 && rAvg > gAvg * 1.15;
      const now = Date.now();
      hrSamples.push({ t: now, r: rAvg, covered: fingerDetected });
      pushHrBar(4 + Math.min(36, rAvg / 8), fingerDetected);

      if (fingerDetected && elapsed > 1000) {
        hrSmoothedR = hrSmoothedR === 0 ? rAvg : (hrSmoothedR * 0.8) + (rAvg * 0.2);
        const delta = rAvg - hrSmoothedR;
        const recentSamples = hrSamples.slice(-20);
        let minR = Infinity, maxR = -Infinity;
        for(let s of recentSamples) { if(s.r < minR) minR = s.r; if(s.r > maxR) maxR = s.r; }
        const isStrongSignal = (maxR - minR) > 1.0;
        if (isStrongSignal && delta < -0.5 && hrTrend >= 0 && (now - lastHrBlinkTime) > 300) {
          hrTrend = -1; lastHrBlinkTime = now; liveBeatTimestamps.push(now);
        } else if (delta > 0.2) { hrTrend = 1; }
      }

      if(elapsed > 2500){
        const recent = hrSamples.slice(-20);
        const coveredCount = recent.filter(s => s.covered).length;
        setHrStatus(coveredCount < recent.length * 0.6
          ? 'No fingertip detected — make sure your finger covers the camera light.'
          : 'Hold still — measuring…');
      }
    }catch(e){}

    if(elapsed >= HR_DURATION_MS){ finishHrCheck(); return; }
    hrRafId = requestAnimationFrame(hrLoop);
  }

  function computeBpmFromLiveTimestamps(timestamps, samples){
    if(!samples || samples.length < 30) return { bpm: null, reason: 'weak' };
    const coveredFrac = samples.filter(s => s.covered).length / samples.length;
    if(coveredFrac < 0.70) return { bpm: null, reason: 'uncovered' };
    if(!timestamps || timestamps.length < 4) return { bpm: null, reason: 'weak' };

    const intervals = [];
    for(let i=1; i<timestamps.length; i++) intervals.push(timestamps[i] - timestamps[i-1]);
    const sorted = [...intervals].sort((a,b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const valid = intervals.filter(iv => Math.abs(iv - median) < (median * 0.40));
    if(valid.length < Math.max(3, intervals.length * 0.4)) return { bpm: null, reason: 'irregular' };

    const avg = valid.reduce((a,b)=>a+b,0) / valid.length;
    const bpm = Math.round(60000 / avg);
    if(bpm < 40 || bpm > 200) return { bpm: null, reason: 'irregular' };
    return { bpm, reason: null };
  }

  function cleanUpViewfinder(){ hrPreview.classList.remove('active'); hrCtx.clearRect(0, 0, hrCanvas.width, hrCanvas.height); }

  function finishHrCheck(){
    hrMeasuring = false;
    cancelAnimationFrame(hrRafId);
    if(hrStream){ hrStream.getTracks().forEach(t => t.stop()); hrStream = null; }
    hrReadingWrap.classList.remove('measuring');
    hrLoadingIcon.classList.remove('active');

    const result = computeBpmFromLiveTimestamps(liveBeatTimestamps, hrSamples);
    if(result.bpm){
      const bpm = result.bpm;
      hrBpm.textContent = bpm; hrBpm.classList.remove('placeholder');
      setHrStatus('Reading complete.');
      hrHistory.unshift({ bpm, ts: Date.now() });
      hrHistory = hrHistory.slice(0, 20);
      localStorage.setItem('gait_hr_history', JSON.stringify(hrHistory));
      renderHrHistory();
      if(window.__onHrReading) window.__onHrReading(bpm, liveBeatTimestamps.slice());
    } else if(result.reason === 'uncovered'){
      setHrStatus('No fingertip detected. Cover both camera and flash fully and try again.');
      hrBpm.textContent = '—'; hrBpm.classList.add('placeholder');
    } else if(result.reason === 'weak'){
      setHrStatus(hrTorchOn
        ? 'Signal too faint — rest your finger LIGHTLY over the lens.'
        : 'Signal too faint — try moving to a brighter area.');
      hrBpm.textContent = '—'; hrBpm.classList.add('placeholder');
    } else {
      setHrStatus('Beats too irregular — hold your hand still and try again.');
      hrBpm.textContent = '—'; hrBpm.classList.add('placeholder');
    }
    hrSamples = []; liveBeatTimestamps = [];
    stopHrCheckUI();
  }

  function stopHrCheckUI(){
    hrCheckBtn.classList.remove('checking');
    hrBtnLabel.textContent = 'Check pulse';
    hrIcon.classList.remove('pulsing');
    cleanUpViewfinder();
  }

  function stopHrCheck(){
    hrMeasuring = false;
    cancelAnimationFrame(hrRafId);
    if(hrStream){ hrStream.getTracks().forEach(t => t.stop()); hrStream = null; }
    hrReadingWrap.classList.remove('measuring');
    hrLoadingIcon.classList.remove('active');
    stopHrCheckUI();
    hrBpm.textContent = '—'; hrBpm.classList.add('placeholder');
    setHrStatus('Cancelled.');
  }

  hrCheckBtn.addEventListener('click', () => {
    if(hrMeasuring){ stopHrCheck(); } else { startHrCheck(); }
  });
})();
(function(){
  function keyFor(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function readJSON(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }catch(e){ return fallback; }
  }

  function getHrvHistory(){ return readJSON('vt_hrv_history', []); }

  let hrContext = null;

  function triggerTaggedCheck(tag){
    const btn = document.getElementById('hrCheckBtn');
    if(!btn || btn.classList.contains('checking')) return;
    hrContext = tag;
    btn.click();
  }
  const trendLogResting = document.getElementById('trendLogResting');
  if(trendLogResting) trendLogResting.addEventListener('click', () => triggerTaggedCheck('resting'));

  function computeRMSSD(timestamps){
    if(!timestamps || timestamps.length < 6) return null;
    const intervals = [];
    for(let i=1;i<timestamps.length;i++) intervals.push(timestamps[i] - timestamps[i-1]);
    const valid = intervals.filter(iv => iv >= 300 && iv <= 2000);
    if(valid.length < 5) return null;
    let sumSq = 0, count = 0;
    for(let i=1;i<valid.length;i++){
      const d = valid[i] - valid[i-1];
      sumSq += d * d; count++;
    }
    if(count < 3) return null;
    return Math.sqrt(sumSq / count);
  }

  function stressLabel(rmssd){
    if(rmssd == null) return { label: 'No data', tone: 'none' };
    if(rmssd >= 60) return { label: 'Relaxed', tone: 'good' };
    if(rmssd >= 30) return { label: 'Balanced', tone: 'mid' };
    return { label: 'Stressed', tone: 'high' };
  }

  function toneColors(tone){
    if(tone === 'good') return { fg: 'var(--teal)', bg: 'rgba(46,196,166,0.12)' };
    if(tone === 'mid') return { fg: 'var(--violet)', bg: 'rgba(79,168,232,0.12)' };
    if(tone === 'high') return { fg: 'var(--coral)', bg: 'rgba(255,139,98,0.12)' };
    return { fg: 'var(--text-dim)', bg: 'var(--card-2)' };
  }

  window.__onHrReading = function(bpm, timestamps){
    const rmssd = computeRMSSD(timestamps);
    const hist = getHrvHistory();
    hist.unshift({ ts: Date.now(), bpm, rmssd, context: hrContext });
    localStorage.setItem('vt_hrv_history', JSON.stringify(hist.slice(0, 40)));
    hrContext = null;
    renderStress();
    renderTrends();
  };

  function renderStress(){
    const hist = getHrvHistory();
    const badgeText = document.getElementById('stressLabelText');
    const badgeWrap = document.getElementById('stressBadge');
    const rmssdEl = document.getElementById('stressRmssd');
    const histEl = document.getElementById('stressHistory');
    const hint = document.getElementById('stressHint');
    if(!badgeText) return;

    if(!hist.length){
      badgeText.textContent = '—';
      const c = toneColors('none');
      badgeWrap.style.color = c.fg; badgeWrap.style.background = c.bg;
      rmssdEl.textContent = '—';
      histEl.innerHTML = '';
      return;
    }

    const latest = hist[0];
    const info = stressLabel(latest.rmssd);
    const c = toneColors(info.tone);
    badgeText.textContent = info.label;
    badgeWrap.style.color = c.fg; badgeWrap.style.background = c.bg;
    rmssdEl.textContent = latest.rmssd != null ? Math.round(latest.rmssd) : '—';
    hint.textContent = latest.rmssd != null
      ? 'Based on beat-to-beat variation during your last pulse check.'
      : "Signal was too short or noisy to estimate HRV this time.";

    histEl.innerHTML = '';
    hist.slice(0, 5).forEach(r => {
      const row = document.createElement('div'); row.className = 'hr-row';
      const l = document.createElement('div'); l.className = 'hr-row-bpm';
      const inf = stressLabel(r.rmssd);
      l.textContent = (r.rmssd != null ? Math.round(r.rmssd) + ' ms · ' : '') + inf.label;
      const t = document.createElement('div'); t.className = 'hr-row-time';
      t.textContent = new Date(r.ts).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
      row.appendChild(l); row.appendChild(t); histEl.appendChild(row);
    });
  }

  function renderTrends(){
    const restingChart = document.getElementById('restingChart');
    const restingAvg = document.getElementById('restingAvg');
    if(!restingChart) return;

    const hist = getHrvHistory();
    const byDay = {};
    hist.forEach(r => {
      if(r.context !== 'resting') return;
      const key = keyFor(new Date(r.ts));
      if(!byDay[key]) byDay[key] = [];
      byDay[key].push(r.bpm);
    });

    const days = [];
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = keyFor(d);
      const vals = byDay[key] || [];
      const avg = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
      days.push({ d, avg, has: vals.length > 0, isToday: i === 0 });
    }
    const maxVal = Math.max(60, ...days.map(x => x.avg), 1);

    restingChart.innerHTML = '';
    let sum = 0, count = 0;
    days.forEach(x => {
      if(x.has){ sum += x.avg; count++; }
      const col = document.createElement('div'); col.className = 'chart-col';
      const bar = document.createElement('div');
      bar.className = 'chart-bar coral' + (x.isToday ? ' today' : '');
      const h = x.has ? Math.max(4, Math.round((x.avg / maxVal) * 76)) : 4;
      bar.style.height = h + 'px';
      if(!x.has) bar.style.opacity = '0.3';
      const lbl = document.createElement('div'); lbl.className = 'chart-lbl'; lbl.textContent = x.d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2);
      col.appendChild(bar); col.appendChild(lbl); restingChart.appendChild(col);
    });
    restingAvg.textContent = count ? Math.round(sum / count) + ' bpm' : '— bpm';
  }

  renderStress();
  renderTrends();
})();
