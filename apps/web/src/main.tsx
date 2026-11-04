import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { applyTheme, resolveTheme } from './theme';
import './i18n';
import './styles/tokens.css';
import './styles/global.css';

// index.html sets this before first paint; re-applying here keeps the DOM in sync
// without persisting an implicit OS-derived choice as an explicit one.
applyTheme(resolveTheme(), false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
