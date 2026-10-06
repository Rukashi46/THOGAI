import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { initMobileFeatures } from './lib/mobile'

// Initialize native mobile features (Status Bar, Back Button) if running inside Android APK
initMobileFeatures()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

