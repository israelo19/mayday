import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installShell } from '../src/platform/shell';
import App from './App';
import './index.css';

// Inside the Expo Go shell this wires the bridge before any tap; in a browser it is a no-op.
installShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
