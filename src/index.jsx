import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { runMigrations } from './utils/migrateData'

// Only run local data migrations in development to avoid accidental writes in production
if (import.meta.env.DEV) {
        runMigrations();
}

ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
                <App />
        </React.StrictMode>
)

