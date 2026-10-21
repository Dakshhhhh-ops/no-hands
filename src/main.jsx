import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Legacy layers first. They still style the older components until the bridge fully replaces them.
import './styles.css';
import './responsive.css';
import './theme.css';

// New system last, so it wins by order and specificity instead of !important.
import './tokens.css';
import './bridge.css';
import './app-shell.css';
import './landing.css';
import './landing-v3.css';
import './landing-canvas.css';
import './theme-editorial.css';
import './panels.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);