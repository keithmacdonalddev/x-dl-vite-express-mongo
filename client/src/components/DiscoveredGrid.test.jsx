import { beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DiscoveredGrid } from './DiscoveredGrid'

describe('DiscoveredGrid', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders empty-state copy when there are no posts', () => {
    render(<DiscoveredGrid posts={[]} downloadingPostIds={new Set()} onDownload={() => {}} />)
    expect(screen.getByText(/No discovered posts yet/i)).toBeInTheDocument()
  })

  it('keeps queue state per-post and only disables the targeted card', () => {
    const onDownload = vi.fn()
    const posts = [
      {
        _id: 'post-a',
        title: 'Already queuing',
        thumbnailUrl: 'https://cdn.example.com/a.jpg',
      },
      {
        _id: 'post-b',
        title: 'Ready',
        thumbnailUrl: 'https://cdn.example.com/b.jpg',
      },
    ]

    render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set(['post-a'])}
        onDownload={onDownload}
      />
    )

    const queuingBadge = screen.getByText(/Queuing.../i)
    const downloadButton = screen.getByRole('button', { name: /^Download$/i })

    expect(queuingBadge).toBeInTheDocument()
    expect(queuingBadge.tagName).toBe('SPAN')
    expect(downloadButton).toBeEnabled()

    fireEvent.click(downloadButton)
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onDownload).toHaveBeenCalledWith('post-b')
  })

  it('uses verified isDownloaded flag instead of downloadedJobId alone', () => {
    const onDownload = vi.fn()
    const posts = [
      {
        _id: 'post-a',
        title: 'Previously linked but file missing',
        downloadedJobId: 'job-123',
        isDownloaded: false,
      },
      {
        _id: 'post-b',
        title: 'Verified downloaded',
        downloadedJobId: 'job-456',
        isDownloaded: true,
      },
    ]

    const { container } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={onDownload}
      />
    )
    const scope = within(container)

    expect(scope.getByText(/^Downloading$/i)).toBeInTheDocument()
    expect(scope.getByRole('button', { name: /^Play$/i })).toBeInTheDocument()
    expect(scope.queryByRole('button', { name: /^Downloaded$/i })).not.toBeInTheDocument()
  })

  it('opens downloaded videos in a browser modal and exposes an Open in VLC link', () => {
    const posts = [
      {
        _id: 'post-playable',
        title: 'Playable download',
        thumbnailUrl: 'https://cdn.example.com/playable.jpg',
        isDownloaded: true,
        downloadOutputPath: 'downloads/creator/video-1.mp4',
      },
    ]

    const { container } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTitle('Play in browser'))

    expect(screen.getByRole('dialog', { name: /Playable download/i })).toBeInTheDocument()
    const playerVideo = container.querySelector('.discovered-player-video')
    expect(playerVideo).toBeInTheDocument()
    expect(playerVideo?.muted).toBe(true)

    const vlcLinks = screen.getAllByRole('link', { name: /Open in VLC/i })
    expect(vlcLinks.length).toBeGreaterThan(0)
    expect(vlcLinks[0].getAttribute('href')).toMatch(/^vlc:\/\/http:\/\/localhost(?::\d+)?\/downloads\/creator\/video-1\.mp4$/)
  })

  it('notifies when a downloaded video is viewed in the modal', async () => {
    const onViewedVideo = vi.fn()
    const posts = [
      {
        _id: 'post-view-track',
        title: 'Track me',
        thumbnailUrl: 'https://cdn.example.com/track.jpg',
        isDownloaded: true,
        downloadOutputPath: 'downloads/creator/video-track.mp4',
      },
    ]

    render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        onViewedVideo={onViewedVideo}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))

    await waitFor(() => {
      expect(onViewedVideo).toHaveBeenCalledTimes(1)
      expect(onViewedVideo).toHaveBeenCalledWith(expect.objectContaining({ _id: 'post-view-track' }))
    })
  })

  it('applies the selected size class to resize the creator video grid', () => {
    const posts = [
      {
        _id: 'post-size',
        title: 'Size candidate',
      },
    ]

    const { container } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        size="large"
      />
    )

    const section = container.querySelector('.discovered-section')
    expect(section).toBeInTheDocument()
    expect(section).toHaveClass('is-size-large')
  })

  it('auto-opens the video modal when initialOpenDownloadedJobId matches a playable post', async () => {
    const posts = [
      {
        _id: 'post-auto',
        title: 'Auto-open candidate',
        isDownloaded: true,
        downloadedJobId: 'job-abc',
        downloadOutputPath: 'downloads/creator/video-auto.mp4',
      },
    ]

    render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        initialOpenDownloadedJobId="job-abc"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Auto-open candidate/i })).toBeInTheDocument()
    })
  })

  it('notifies when initial auto-open is consumed, once per trigger id', async () => {
    const onInitialOpenConsumed = vi.fn()
    const posts = [
      {
        _id: 'post-auto-once',
        title: 'Auto-open once',
        isDownloaded: true,
        downloadedJobId: 'job-once',
        downloadOutputPath: 'downloads/creator/video-once.mp4',
      },
    ]

    const { rerender } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        initialOpenDownloadedJobId="job-once"
        onInitialOpenConsumed={onInitialOpenConsumed}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Auto-open once/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(onInitialOpenConsumed).toHaveBeenCalledTimes(1)
      expect(onInitialOpenConsumed).toHaveBeenCalledWith('job-once')
    })

    rerender(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        initialOpenDownloadedJobId="job-once"
        onInitialOpenConsumed={onInitialOpenConsumed}
      />
    )

    await waitFor(() => {
      expect(onInitialOpenConsumed).toHaveBeenCalledTimes(1)
    })
  })

  it('shows a three-dot menu with metadata and post actions for each card', () => {
    const posts = [
      {
        _id: 'post-menu',
        title: 'Menu candidate',
        postUrl: 'https://www.tiktok.com/@creator/video/999',
        canonicalUrl: 'https://www.tiktok.com/@creator/video/999',
        videoId: '999',
        publishedAt: '2026-02-21T12:34:56.000Z',
      },
    ]

    const { container } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
      />
    )
    const scope = within(container)

    fireEvent.click(scope.getByRole('button', { name: /More actions/i }))

    expect(scope.getByRole('button', { name: /^View metadata$/i })).toBeInTheDocument()
    expect(scope.getByRole('button', { name: /^Copy post URL$/i })).toBeInTheDocument()
    expect(scope.getByRole('button', { name: /^Published:/i })).toBeDisabled()

    fireEvent.click(scope.getByRole('button', { name: /^View metadata$/i }))

    const metadataDialog = screen.getByRole('dialog', { name: /Post metadata/i })
    const metadataScope = within(metadataDialog)

    expect(metadataDialog).toBeInTheDocument()
    expect(metadataScope.getByText(/^Published$/i)).toBeInTheDocument()
    expect(metadataScope.getByText(/^Video ID$/i)).toBeInTheDocument()
    expect(metadataScope.getByText('999')).toBeInTheDocument()
  })

  it('shows an Open file folder action for downloaded posts and calls the handler', () => {
    const onOpenFolder = vi.fn()
    const posts = [
      {
        _id: 'post-folder',
        title: 'Folder candidate',
        isDownloaded: true,
        downloadedJobId: 'job-folder',
        downloadOutputPath: 'downloads/creator/video-folder.mp4',
      },
    ]

    const { container } = render(
      <DiscoveredGrid
        posts={posts}
        downloadingPostIds={new Set()}
        onDownload={vi.fn()}
        onOpenFolder={onOpenFolder}
      />
    )
    const scope = within(container)

    fireEvent.click(scope.getByRole('button', { name: /More actions/i }))
    fireEvent.click(scope.getByRole('button', { name: /^Open file folder$/i }))

    expect(onOpenFolder).toHaveBeenCalledTimes(1)
    expect(onOpenFolder).toHaveBeenCalledWith('downloads/creator/video-folder.mp4')
  })
})
