import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useApp } from './store/useApp'
import './styles.css'

// Lets the end-to-end tests inspect state; only exposed under automation.
if (navigator.webdriver) Object.assign(window, { __salahStore: useApp })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
