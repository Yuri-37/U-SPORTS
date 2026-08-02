import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import router from './router'
import './styles/index.css'
import { hydrateAppearanceThemeFromStorage } from './stores/appearanceStore'

hydrateAppearanceThemeFromStorage()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
