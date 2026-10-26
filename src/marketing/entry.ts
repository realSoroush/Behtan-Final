async function start() {
  // The public site never waits for an authenticated session.
  const params = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\/$/, "");
  if (location.hash === '#auth' || params.has('payment')) {
    location.replace('/app' + location.search);
    return;
  }
  if (!import.meta.env.DEV && location.hash.startsWith('#pro') && !path.startsWith('/professionals')) {
    location.replace('/professionals' + location.search + location.hash); return;
  }
  if (!import.meta.env.DEV && path === '/site.html') {
    const pro = location.hash.startsWith('#pro');
    location.replace((pro ? '/professionals' : '/') + location.search + location.hash);
    return;
  }
  await import('./main');
  if (!import.meta.env.DEV && location.hash) history.replaceState(null, '', location.pathname + location.search);
}
void start();
export {};
