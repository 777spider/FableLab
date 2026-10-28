import type React from 'react';

/** Keep ordinary app navigation in this session; preserve native new-tab actions. */
export function navigateWithinApp(event: React.MouseEvent<HTMLAnchorElement>) {
  const link = event.currentTarget;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !/^\/learn(?:\/library)?\/?$/.test(url.pathname)) return;
  event.preventDefault();
  history.pushState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
