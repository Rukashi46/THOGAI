import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface ThemedSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel?: string
  placeholder?: string
  className?: string
  compact?: boolean
  id?: string
  searchable?: boolean
  searchPlaceholder?: string
}

interface DropdownCoords {
  top: number
  left: number
  width: number
  maxHeight: number
  isUpward: boolean
}

export function ThemedSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Select option',
  className = '',
  compact = false,
  id,
  searchable = false,
  searchPlaceholder = 'Search...'
}: ThemedSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const [coords, setCoords] = useState<DropdownCoords | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  const filteredOptions =
    searchable && searchQuery.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase().trim()))
      : options

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const estimatedHeight = 240

    const isUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow
    const maxHeight = isUpward
      ? Math.min(260, Math.max(120, spaceAbove - 10))
      : Math.min(260, Math.max(120, spaceBelow - 10))

    const minW = Math.max(rect.width, compact ? 150 : 180)
    const targetWidth = Math.min(Math.max(minW, 200), viewportWidth - 24)

    let left = rect.left
    if (left + targetWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - targetWidth - 12)
    }
    if (left < 12) left = 12

    const top = isUpward ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6

    setCoords({
      top,
      left,
      width: targetWidth,
      maxHeight,
      isUpward
    })
  }, [compact])

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handleScrollOrResize = () => {
      updatePosition()
    }

    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    return () => {
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      if (searchable) {
        setTimeout(() => searchInputRef.current?.focus(), 40)
      }
    } else {
      setSearchQuery('')
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen, searchable])

  // Scroll highlighted into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]')
      if (items[highlightedIndex]) {
        ;(items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
        const curIdx = filteredOptions.findIndex((o) => o.value === value)
        setHighlightedIndex(curIdx >= 0 ? curIdx : 0)
      }
      return
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const targetIdx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (filteredOptions[targetIdx]) {
        onChange(filteredOptions[targetIdx].value)
        setIsOpen(false)
      }
    }
  }

  const selectOption = (optValue: string) => {
    onChange(optValue)
    setIsOpen(false)
  }

  return (
    <div className={`themed-select-wrapper ${compact ? 'compact' : ''} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel || placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`themed-select-trigger ${compact ? 'compact' : ''} ${isOpen ? 'active' : ''}`}
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) {
            const curIdx = filteredOptions.findIndex((o) => o.value === value)
            setHighlightedIndex(curIdx >= 0 ? curIdx : 0)
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="themed-select-value">
          {selectedOption?.icon && <span className="themed-select-icon">{selectedOption.icon}</span>}
          <span className="themed-select-label">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown
          size={compact ? 14 : 16}
          className={`themed-select-arrow ${isOpen ? 'open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={listRef}
                role="listbox"
                aria-label={ariaLabel}
                tabIndex={-1}
                className="themed-select-dropdown"
                style={{
                  position: 'fixed',
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                  minWidth: coords.width,
                  maxHeight: coords.maxHeight,
                  zIndex: 9999
                }}
                initial={{ opacity: 0, y: coords.isUpward ? 8 : -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.34, 1.04, 0.64, 1] } }}
                exit={{ opacity: 0, y: coords.isUpward ? 6 : -6, scale: 0.97, transition: { duration: 0.14, ease: [0.4, 0, 0.6, 1] } }}
                onKeyDown={handleKeyDown}
              >
                {searchable && (
                  <div className="themed-select-search-box" onClick={(e) => e.stopPropagation()}>
                    <Search size={13} aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="themed-select-search-input"
                      placeholder={searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setHighlightedIndex(0)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                          handleKeyDown(e)
                        }
                      }}
                    />
                  </div>
                )}

                {filteredOptions.length > 0 ? (
                  filteredOptions.map((opt, idx) => {
                    const isSelected = opt.value === value
                    const isHighlighted = idx === highlightedIndex
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`themed-select-option ${isSelected ? 'selected' : ''} ${
                          isHighlighted ? 'highlighted' : ''
                        }`}
                        onClick={() => selectOption(opt.value)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                      >
                        {opt.icon && <span className="themed-select-icon">{opt.icon}</span>}
                        <span className="themed-select-text">{opt.label}</span>
                        {isSelected && (
                          <span className="themed-select-check">
                            <Check size={14} />
                          </span>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="themed-select-empty">No matching options</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
