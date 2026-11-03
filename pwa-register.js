/* FURY PWA registration and active mobile navigation */
(()=>{'use strict';
 const page=location.pathname.toLowerCase().endsWith('analytics.html')?(new URLSearchParams(location.search).get('tab')||'teams'):'home';
 document.querySelectorAll('.fury-pwa-nav a').forEach(a=>{if(a.dataset.pwaPage===page){a.classList.add('active');a.setAttribute('aria-current','page')}});
 if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('FURY PWA registration:',e)));
})();