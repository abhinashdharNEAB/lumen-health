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