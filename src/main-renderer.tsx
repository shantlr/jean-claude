import { createRoot } from 'react-dom/client';
import { scan } from 'react-scan';
import { StrictMode } from 'react';


import App from './app';

import './index.css';

document.documentElement.dataset.reduceMotion = 'true';

function getInitialReactScanEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem('ui-store');
    if (!raw) return false;

    const parsed = JSON.parse(raw) as {
      state?: { settings?: { reactScanEnabled?: unknown } };
    };
    return parsed.state?.settings?.reactScanEnabled === true;
  } catch {
    return false;
  }
}

const reactScanEnabled = getInitialReactScanEnabled();

if (reactScanEnabled) {
  window.localStorage.removeItem('react-scan-options');

  scan({
    enabled: true,
    showToolbar: true,
    animationSpeed: 'fast',
    dangerouslyForceRunInProduction: true,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
