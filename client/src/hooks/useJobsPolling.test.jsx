import { afterEach, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as jobsApi from '../api/jobsApi'
import { useJobsPolling } from './useJobsPolling'

vi.mock('../api/jobsApi', () => ({
  listJobs: vi.fn(),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('refreshes jobs list on interval', async () => {
  vi.useFakeTimers()
  jobsApi.listJobs
    .mockResolvedValueOnce({
      ok: true,
      jobs: [{ _id: 'first', tweetUrl: 'https://x.com/u/status/1', status: 'queued' }],
    })
    .mockResolvedValueOnce({
      ok: true,
      jobs: [
        { _id: 'first', tweetUrl: 'https://x.com/u/status/1', status: 'queued' },
        { _id: 'second', tweetUrl: 'https://x.com/u/status/2', status: 'running' },
      ],
    })

  const { result } = renderHook(() => useJobsPolling({ intervalMs: 1000 }))

  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.jobs.length).toBe(1)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })

  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.jobs.length).toBe(2)
})
