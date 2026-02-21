import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DiscoveredGrid } from './DiscoveredGrid'

describe('DiscoveredGrid', () => {
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

    const buttons = screen.getAllByRole('button')
    const queuingButton = screen.getByRole('button', { name: /Queuing.../i })
    const downloadButton = screen.getByRole('button', { name: /^Download$/i })

    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(queuingButton).toBeDisabled()
    expect(downloadButton).toBeEnabled()

    fireEvent.click(downloadButton)
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onDownload).toHaveBeenCalledWith('post-b')
  })
})
