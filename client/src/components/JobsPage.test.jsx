import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JobsPage } from './JobsPage'
import * as jobsApi from '../api/jobsApi'

vi.mock('../api/jobsApi', () => ({
  listJobs: vi.fn(),
  createJob: vi.fn(),
  createManualRetryJob: vi.fn(),
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

it('submits manual retry media URL for failed jobs', async () => {
  jobsApi.listJobs.mockResolvedValue({
    ok: true,
    jobs: [
      {
        _id: 'failed1',
        tweetUrl: 'https://x.com/u/status/456',
        status: 'failed',
        error: 'BOT_CHALLENGE',
        createdAt: '2026-02-16T10:00:00.000Z',
      },
    ],
  })
  jobsApi.createManualRetryJob.mockResolvedValue({
    ok: true,
    job: { _id: 'retry2', status: 'queued' },
  })

  render(<JobsPage />)

  const input = await screen.findByPlaceholderText(/video\.twimg\.com/i)
  fireEvent.change(input, { target: { value: 'https://video.twimg.com/x.mp4' } })
  fireEvent.click(screen.getByRole('button', { name: /retry with media url/i }))

  await waitFor(() => {
    expect(jobsApi.createManualRetryJob).toHaveBeenCalledWith('failed1', 'https://video.twimg.com/x.mp4')
  })
})

it('opens contact profile from contacts panel', async () => {
  jobsApi.listJobs.mockResolvedValue({
    ok: true,
    jobs: [
      {
        _id: 'done1',
        tweetUrl: 'https://www.tiktok.com/@sample_user/video/7606119826259512584',
        status: 'completed',
        accountHandle: '@sample_user',
        accountSlug: 'sample_user',
        createdAt: '2026-02-16T10:00:00.000Z',
      },
    ],
  })

  const onOpenContact = vi.fn()

  render(<JobsPage onOpenContact={onOpenContact} />)
  const button = await screen.findByRole('button', { name: /sample_user/i })
  fireEvent.click(button)

  expect(onOpenContact).toHaveBeenCalledWith('sample_user')
})
