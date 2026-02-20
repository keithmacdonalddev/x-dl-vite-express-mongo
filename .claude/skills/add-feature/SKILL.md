---
name: add-feature
description: Scaffold a new feature across the Vite+Express+MongoDB stack. Walks through Express route, Mongoose model, client API call, component, and CSS. Use when building any new user-facing capability.
allowed-tools: Read Grep Glob
argument-hint: "<feature-name> <description>"
---

# Add Feature

End-to-end guide for adding a new feature to Media Vault. Follow these
steps IN ORDER — each layer depends on the one before it.

## Step 1: Design the Contract

Before writing any code, answer these questions:

1. **What data does the feature need from the server?**
   -> This defines your Express route(s) and Mongoose model changes
2. **What state does the client need?**
   -> This defines your React hooks/context
3. **Where does the UI live?**
   -> Existing component or new component?
4. **What user actions trigger it?**
   -> Buttons, form submissions, automatic on load?

Write out the API contract:
```
Route:      METHOD /api/{resource} (in server/routes/{module}.js)
Params:     req.body / req.params / req.query
Validates:  [input validation rules]
Returns:    { ok: true, data } | { ok: false, code, error }
Model:      [Mongoose schema changes if any] (in server/models/{Model}.js)
Service:    [business logic] (in server/services/{service}.js)
Client:     fetch call + state management (in client/src/)
Component:  [UI component] (in client/src/components/)
```

## Step 2: Mongoose Model (server/models/{Model}.js)

If the feature needs new data, update or create a Mongoose model:

```javascript
const mongoose = require('mongoose')

const featureSchema = new mongoose.Schema({
  // fields with types, defaults, validation
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
})

// Add indexes for query patterns
featureSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('Feature', featureSchema)
```

Key requirements:
- Define schema validation (required, enum, min/max)
- Add indexes for fields used in queries
- Use `timestamps: true` option if you need createdAt/updatedAt
- Keep schemas flat — avoid deep nesting

## Step 3: Service Layer (server/services/{service}.js)

Business logic lives in services, not route handlers:

```javascript
const Feature = require('../models/Feature')
const logger = require('../lib/logger')

async function createFeature(data) {
  logger.info('Creating feature', { name: data.name })
  const feature = await Feature.create(data)
  return feature
}

async function listFeatures(filter = {}) {
  return Feature.find(filter).sort({ createdAt: -1 }).lean()
}

module.exports = { createFeature, listFeatures }
```

Key requirements:
- Log operations via structured logger with context
- Use `.lean()` for read queries (returns plain objects, faster)
- Handle edge cases (not found, duplicate, validation errors)
- Keep functions focused — one operation per function

## Step 4: Express Route (server/routes/{module}.js)

Add route handlers. Express 5 auto-catches async errors:

```javascript
const express = require('express')
const router = express.Router()
const { createFeature, listFeatures } = require('../services/featureService')

// GET /api/features
router.get('/', async (req, res) => {
  const features = await listFeatures()
  res.json({ ok: true, features })
})

// POST /api/features
router.post('/', async (req, res) => {
  const { name } = req.body
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Name is required' })
  }

  const feature = await createFeature({ name: name.trim() })
  res.status(201).json({ ok: true, feature })
})

module.exports = router
```

Key requirements:
- Validate ALL input before processing (type checks, length limits, format)
- Return `{ ok: true/false }` shape consistently
- Include `code` string in error responses for client-side handling
- Do NOT wrap in try/catch for error handling (Express 5 does this)
- Register the router in the main app: `app.use('/api/features', featureRouter)`

## Step 5: Client API Call (client/src/api/ or inline)

Create a fetch wrapper for the new endpoint:

```javascript
export async function fetchFeatures() {
  const res = await fetch('/api/features')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createFeature(name) {
  const res = await fetch('/api/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json()
}
```

Key requirements:
- Check `res.ok` before parsing JSON
- Parse error responses for user-friendly messages
- Use the Vite proxy (`/api/` prefix) — never hardcode port 4000

## Step 6: React Component (client/src/components/)

```jsx
import { useState, useEffect } from 'react'
import { fetchFeatures, createFeature } from '../api/features'

export function FeatureList() {
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchFeatures()
      .then(data => {
        if (data.ok) setFeatures(data.features)
        else setError(data.error)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(name) {
    try {
      const data = await createFeature(name)
      if (data.ok) {
        setFeatures(prev => [data.feature, ...prev])
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>
  if (!features.length) return <div className="empty">No features yet</div>

  return (
    <div className="feature-list">
      {features.map(f => (
        <div key={f._id} className="feature-card">
          {f.name}
        </div>
      ))}
    </div>
  )
}
```

Component rules:
- Use `useState` + `useEffect` for data fetching (no state library in this project)
- Semantic HTML: `<button>` not `<div onClick>`, proper form elements
- Include loading, empty, and error states
- Use Framer Motion for animations (respect `useReducedMotion()`)
- Support keyboard: Enter/Space activate, Tab navigates
- Use CSS classes, never inline `style={{}}`

## Step 7: Styles (client/src/*.css)

Add CSS for the new component:

```css
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-card {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--border, #2a2a3a);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.feature-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

Use CSS variables where defined. Match the existing design language.

## Step 8: Wire It Up

1. Import the component in its parent (likely `App.jsx` or `JobsPage.jsx`)
2. Register the Express router in the main app file
3. Add the Vite proxy rule if using a new API prefix (usually not needed — `/api/` covers it)
4. Test with `/test-app`

## Checklist

Before marking complete:
- [ ] Model has schema validation and indexes
- [ ] Service logs operations with structured logger
- [ ] Route validates ALL input parameters
- [ ] Route returns `{ ok: true/false }` shape
- [ ] Route is registered in Express app
- [ ] Client checks `res.ok` and handles errors
- [ ] Component has loading, empty, and error states
- [ ] Component uses semantic HTML and keyboard navigation
- [ ] CSS uses existing design tokens/variables
- [ ] Animations respect `useReducedMotion()`

## Team Assignments

When building with an agent team:
- **Backend agent**: Steps 2-4 (model + service + route)
- **Client agent**: Steps 5-7 (API call + component + CSS)
- Client agent is BLOCKED until backend completes step 4 (needs API contract)
