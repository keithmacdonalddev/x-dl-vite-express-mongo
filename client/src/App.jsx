import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadHealth() {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`)
        }
        const payload = await response.json()
        if (mounted) {
          setHealth(payload)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    loadHealth()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <main className="app">
      <header>
        <p className="eyebrow">x-dl rewrite</p>
        <h1>Vite + Express + Mongo (JS)</h1>
        <p className="subhead">
          Initial scaffold is ready. Next step is implementing extraction and download jobs.
        </p>
      </header>

      <section className="card">
        <h2>API health</h2>
        {!health && !error && <p>Checking backend...</p>}
        {health && (
          <div className="ok">
            <p>Status: OK</p>
            <p>Service: {health.service}</p>
            <p>Timestamp: {health.timestamp}</p>
          </div>
        )}
        {error && (
          <p className="error">
            Could not reach `/api/health`: {error}
          </p>
        )}
      </section>
      <div className="next">
        <p>Edit `client/src/App.jsx` and `server/src/index.js` to continue.</p>
      </div>
    </main>
  )
}

export default App
