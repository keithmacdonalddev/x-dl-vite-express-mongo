import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobsPage } from './JobsPage'
import * as jobsApi from '../api/jobsApi'

vi.mock('../api/jobsApi', () => ({
  listJobs: vi.fn(),
  createJob: vi.fn(),
  getJob: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

it('renders jobs returned by the API client', async () => {
  jobsApi.listJobs.mockResolvedValue({
    ok: true,
    jobs: [
      {
        _id: 'abc123',
        tweetUrl: 'https://x.com/u/status/123',
        status: 'queued',
        createdAt: '2026-02-16T10:00:00.000Z',
      },
    ],
  })

  render(<JobsPage />)
  expect(await screen.findByText(/queued/i)).toBeInTheDocument()
})
