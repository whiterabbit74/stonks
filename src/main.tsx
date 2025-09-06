import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRouter from './components/AppRouter.tsx'
import { initErrorLogger } from './lib/error-logger'

// Initialize client error logger early
initErrorLogger({ captureConsoleErrors: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
