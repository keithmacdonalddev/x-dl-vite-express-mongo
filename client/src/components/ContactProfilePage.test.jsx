import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContactProfilePage } from './ContactProfilePage'

const refreshMock = vi.fn(async () => {})
const listDiscoveredPostsMock = vi.fn()
const downloadDiscoveredPostMock = vi.fn()

vi.mock('../hooks/useJobsPolling', () => ({
  useJobsPolling: () => ({
    jobs: [
      {
        _id: 'job-1',
        tweetUrl: 'https://www.tiktok.com/@creator/video/123',
        accountPlatform: 'tiktok',
        accountHandle: '@creator',
        accountSlug: 'creator',
        status: 'completed',
        createdAt: '2026-02-21T00:00:00.000Z',
      },
    ],
    isLoading: false,
    error: '',
    refresh: refreshMock,
  }),
}))

vi.mock('../features/dashboard/useJobActions', () => ({
  useJobActions: () => ({
    isMutating: false,
    actionError: '',
    setActionError: vi.fn(),
    editingJobId: '',
    editDraftByJobId: {},
    hiddenJobIds: {},
    startEdit: vi.fn(),
    cancelEdit: vi.fn(),
    updateEditDraft: vi.fn(),
    submitEdit: vi.fn(),
    handleDeleteJob: vi.fn(),
    handleBulkDelete: vi.fn(),
    handleRetry: vi.fn(),
    cleanupHiddenIds: vi.fn(),
  }),
}))

vi.mock('../api/jobsApi', () => ({
  listDiscoveredPosts: (...args) => listDiscoveredPostsMock(...args),
  downloadDiscoveredPost: (...args) => downloadDiscoveredPostMock(...args),
  refreshDiscovery: vi.fn(async () => ({ ok: true })),
  deleteContactProfile: vi.fn(async () => ({ ok: true })),
  updateContactProfile: vi.fn(async () => ({ ok: true })),
}))

vi.mock('./ConfirmModal', () => ({
  ConfirmModal: () => null,
}))

vi.mock('./OverflowMenu', () => ({
  OverflowMenu: () => null,
}))

vi.mock('../features/dashboard/JobEditForm', () => ({
  JobEditForm: () => null,
}))

vi.mock('../features/intake/IntakeForm', () => ({
  IntakeForm: () => null,
}))

vi.mock('./DiscoveredGrid', () => ({
  DiscoveredGrid: ({ posts, downloadingPostIds, onDownload }) => (
    <div>
      {(posts || []).map((post) => {
        const isDownloading = downloadingPostIds.has(post._id)
        return (
          <button
            key={post._id}
            type="button"
            data-testid={`download-${post._id}`}
            onClick={() => onDownload(post._id)}
            disabled={isDownloading}
          >
            {isDownloading ? 'Queuing...' : 'Download'}
          </button>
        )
      })}
    </div>
  ),
}))

function createDeferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('ContactProfilePage discovered queue state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tracks discovered download queue per-post instead of globally', async () => {
    const firstQueue = createDeferred()

    listDiscoveredPostsMock.mockResolvedValue({
      posts: [
        { _id: 'post-a', title: 'A' },
        { _id: 'post-b', title: 'B' },
      ],
    })

    downloadDiscoveredPostMock.mockImplementation((postId) => {
      if (postId === 'post-a') return firstQueue.promise
      return Promise.resolve({ ok: true })
    })

    render(<ContactProfilePage contactSlug="creator" onBack={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('download-post-a')).toBeInTheDocument()
      expect(screen.getByTestId('download-post-b')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('download-post-a'))

    await waitFor(() => {
      expect(screen.getByTestId('download-post-a')).toBeDisabled()
      expect(screen.getByTestId('download-post-a')).toHaveTextContent('Queuing...')
      expect(screen.getByTestId('download-post-b')).toBeEnabled()
      expect(screen.getByTestId('download-post-b')).toHaveTextContent('Download')
    })

    firstQueue.resolve({ ok: true })

    await waitFor(() => {
      expect(screen.getByTestId('download-post-a')).toBeEnabled()
      expect(screen.getByTestId('download-post-a')).toHaveTextContent('Download')
    })

    expect(downloadDiscoveredPostMock).toHaveBeenCalledWith('post-a')
    expect(refreshMock).toHaveBeenCalled()
  })
})
