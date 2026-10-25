import React from 'react';
import ReactDOM from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { connectionBuilder } from './stdb';
import App from './App';
import CustomerApp from './customer/CustomerApp';
import './index.css';

// "/console" is the machine room (the dashboard, unchanged); every other path is the controller's view (D-7).
// Vite's SPA fallback serves index.html for both, in dev and in preview.
const isConsole = window.location.pathname.replace(/\/+$/, '') === '/console';
if (!isConsole) document.documentElement.classList.add('cv-root');

// The customer feed links to /console#event-<id>. Audit rows arrive over the subscription after the
// browser has already tried the fragment, so scroll once the row exists (give up after 15 s).
if (isConsole && /^#event-\d+$/.test(window.location.hash)) {
  const id = window.location.hash.slice(1);
  const started = Date.now();
  const tryScroll = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      return;
    }
    if (Date.now() - started < 15_000) window.setTimeout(tryScroll, 200);
  };
  window.setTimeout(tryScroll, 200);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{isConsole ? <App /> : <CustomerApp />}</SpacetimeDBProvider>
  </React.StrictMode>,
);
