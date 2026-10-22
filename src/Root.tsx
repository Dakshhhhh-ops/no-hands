import { lazy, Suspense, useEffect, useRef } from 'react';
import { navigate, useLocation } from './router.ts';
import Landing from './Landing.tsx';

// The workspace is its own chunk: the landing page downloads none of it.
const Workspace = lazy(() => import('./App.tsx'));

const TITLES: Record<string, string> = {
  '/': 'VoiceArchitect: say the change, see what it touches',
  '/app': 'Workspace · VoiceArchitect',
};

/** "/" is the landing page and "/app" the workspace; anything else shows the landing page. */
export default function Root() {
  const { path, params, fromHistory } = useLocation();
  // Wispr Flow's sign-in returns to "/?wispr=..."; the import dialog lives in the workspace.
  const wisprReturn = path === '/' && params.has('wispr');
  const isApp = path === '/app' || wisprReturn;
  useEffect(() => {
    if (wisprReturn) navigate('/app', { replace: true });
  }, [wisprReturn]);
  const firstRender = useRef(true);

  useEffect(() => {
    document.title = TITLES[isApp ? '/app' : '/'] ?? 'VoiceArchitect';
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A new page starts at the top with focus on its heading; back and forward keep the browser's place.
    if (fromHistory) return;
    window.scrollTo(0, 0);
    if (!isApp) document.getElementById('va-hero-title')?.focus({ preventScroll: true });
  }, [isApp, fromHistory]);

  if (isApp) {
    return (
      <Suspense fallback={<main className="va-app va-route-loading" aria-busy="true"><p>Opening the workspace…</p></main>}>
        <Workspace />
      </Suspense>
    );
  }
  return <Landing />;
}
