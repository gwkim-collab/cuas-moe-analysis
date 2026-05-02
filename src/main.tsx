import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 1. Airbility brand tokens (Olo / Montserrat / Pretendard) — must load first
//    so var(--olo) etc. are available to App.css
import './airbility-tokens.css'
// 2. Cesium-variant overlays (loading splash, fly button, etc.)
import './index.css'
// 3. App imports App.css internally
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
