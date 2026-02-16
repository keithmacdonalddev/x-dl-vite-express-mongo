import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ContactProfilePage } from './ContactProfilePage'
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

it('renders a dedicated profile timeline for a contact', async () => {
  jobsApi.listJobs.mockResolvedValue({
    ok: true,
    jobs: [
      {
        _id: 'profile1',
        tweetUrl: 'https://www.tiktok.com/@sample_user/video/7606119826259512584',
        status: 'completed',
        accountHandle: '@sample_user',
        accountDisplayName: '@sample_user',
        accountSlug: 'sample_user',
        thumbnailPath: 'downloads/sample_user/thumbnails/profile1.jpg',
        outputPath: 'downloads/sample_user/profile1.mp4',
        createdAt: '2026-02-16T10:00:00.000Z',
        metadata: {
          title: 'Sample clip',
        },
        candidateUrls: ['https://v19-webapp-prime.tiktok.com/video/tos/alisg/path/?mime_type=video_mp4&br=2470'],
      },
    ],
  })

  render(<ContactProfilePage contactSlug="sample_user" onBack={() => {}} />)
  expect(await screen.findByRole('heading', { name: /sample_user/i })).toBeInTheDocument()
  expect(await screen.findByText(/posts/i)).toBeInTheDocument()
  expect(await screen.findByText(/sample clip/i)).toBeInTheDocument()
})

it('triggers back handler from profile page', async () => {
  jobsApi.listJobs.mockResolvedValue({
    ok: true,
    jobs: [],
  })

  const onBack = vi.fn()
  render(<ContactProfilePage contactSlug="sample_user" onBack={onBack} />)

  await screen.findByText(/no jobs found for this contact yet/i)
  fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
  expect(onBack).toHaveBeenCalled()
})
