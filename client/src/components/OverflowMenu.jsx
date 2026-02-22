import { useState, useEffect, useRef } from 'react'

export function OverflowMenu({ items = [] }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const visibleItems = items.filter((item) => !item.hidden)
  if (visibleItems.length === 0) return null

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        type="button"
        className={`overflow-menu-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="More actions"
      >
        <span className="overflow-menu-dots">&#8942;</span>
      </button>
      {isOpen && (
        <div className="overflow-menu-dropdown">
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`overflow-menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                item.onClick()
                setIsOpen(false)
              }}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
