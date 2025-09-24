import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Draw108 from "./Draw108.tsx";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Draw108 />
  </StrictMode>,
)
