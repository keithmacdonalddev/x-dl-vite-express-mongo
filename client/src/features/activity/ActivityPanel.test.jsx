import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityPanel } from './ActivityPanel'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    aside: ({ children, ...props }) => <aside {...props}>{children}</aside>,
  },
  useReducedMotion: () => true,
}))

describe('ActivityPanel discovery rendering', () => {
  it('renders discovery events in the job group when jobId is present', () => {
    render(
      <ActivityPanel
        isOpen
        onToggle={() => {}}
        telemetryEvents={[
          {
            id: 1,
            ts: '2026-02-21T01:00:00.000Z',
            event: 'discovery.trigger.started',
            jobId: 'job-123',
            accountHandle: 'creator',
            handle: '@creator',
          },
        ]}
      />
    )

    expect(screen.getByText('@creator')).toBeInTheDocument()
    expect(screen.getByText(/Profile discovery started for @creator/i)).toBeInTheDocument()
    expect(screen.queryByText('System')).not.toBeInTheDocument()
  })
})
