import { useEffect, useState } from 'react'
import { ContactProfilePage } from './components/ContactProfilePage'
import { JobsPage } from './components/JobsPage'
import './App.css'

function parseHashRoute(hashValue) {
  const hash = String(hashValue || '').replace(/^#/, '')
  const normalized = hash.startsWith('/') ? hash : `/${hash}`
  const contactMatch = normalized.match(/^\/contacts\/([^/]+)$/i)
  if (contactMatch) {
    return {
      view: 'contact',
      slug: decodeURIComponent(contactMatch[1]).toLowerCase(),
    }
  }
  return {
    view: 'dashboard',
    slug: '',
  }
}

function setRouteHash(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  window.location.hash = normalized
}

function App() {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash))
    }

    window.addEventListener('hashchange', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  if (route.view === 'contact' && route.slug) {
    return (
      <ContactProfilePage
        contactSlug={route.slug}
        onBack={() => {
          setRouteHash('/')
        }}
      />
    )
  }

  return (
    <JobsPage
      onOpenContact={(slug) => {
        setRouteHash(`/contacts/${encodeURIComponent(slug)}`)
      }}
    />
  )
}

export default App
