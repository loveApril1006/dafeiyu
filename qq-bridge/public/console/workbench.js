// Same-origin workbenches follow the console immediately, including lazy loads.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let parentRoot;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) {
      parentRoot = window.parent.document.documentElement;
      root.classList.add('embedded');
    }
  } catch {}
  function apply() {
    let theme = parentRoot?.dataset.theme;
    if (parentRoot) {
      const styles = window.parent.getComputedStyle(parentRoot);
      const tokens = { bg:'bg', card:'card', surface:'surface', text:'text', muted:'muted', accent:'accent', blue:'accent', border:'card-border', line:'card-border' };
      for (const [target, source] of Object.entries(tokens)) {
        const value = styles.getPropertyValue('--' + source).trim();
        if (value) root.style.setProperty('--' + target, value);
      }
    }
    if (!theme) {
      try { theme = localStorage.getItem('qq-console-theme'); } catch {}
    }
    root.dataset.theme = theme === 'dark' || theme === 'light' ? theme : media.matches ? 'dark' : 'light';
  }
  apply();
  const observer = new MutationObserver(apply);
  if (parentRoot) observer.observe(parentRoot, { attributes: true, attributeFilter: ['data-theme'] });
  addEventListener('storage', apply);
  media.addEventListener('change', apply);
  addEventListener('pagehide', () => observer.disconnect(), { once:true });
  addEventListener('pageshow', () => {
    if (parentRoot) observer.observe(parentRoot, { attributes:true, attributeFilter:['data-theme'] });
    apply();
  });
  addEventListener('DOMContentLoaded', () => {
    if (!parentRoot || !document.body.classList.contains('studio-page') || document.body.dataset.workbench === 'robot-options') return;
    let heightFrame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(heightFrame);
      heightFrame = requestAnimationFrame(() => parent.postMessage({type:'qq-workbench-height',path:location.pathname,height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin));
    });
    observer.observe(document.body);
    addEventListener('pagehide', () => { observer.disconnect(); cancelAnimationFrame(heightFrame); }, {once:true});
  });
})();
