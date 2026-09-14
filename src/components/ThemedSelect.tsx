import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { dropdownVariants } from '../lib/motion'

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
  minWidth: number
  maxWidth: number
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

  // Type-ahead: accumulate keypresses, auto-clear after 800ms
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      ? Math.min(280, Math.max(120, spaceAbove - 10))
      : Math.min(280, Math.max(120, spaceBelow - 10))

    const minWidth = rect.width
    const maxSafeWidth = Math.max(160, viewportWidth - 24)
    // At least trigger width, may expand up to safe viewport width if content or mobile warrants it
    const targetWidth = Math.min(Math.max(minWidth, compact ? 150 : 200), maxSafeWidth)

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
      minWidth: Math.min(minWidth, maxSafeWidth),
      maxWidth: maxSafeWidth,
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
      } else {
        // When not searchable, focus the listbox so arrow keys work
        setTimeout(() => listRef.current?.focus(), 40)
      }
    } else {
      setSearchQuery('')
      // Clear type-ahead buffer
      typeaheadRef.current = ''
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
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

  // Type-ahead: find first option whose label starts with the accumulated buffer
  const handleTypeahead = useCallback((char: string) => {
    typeaheadRef.current += char.toLowerCase()
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = ''
    }, 800)

    const buf = typeaheadRef.current
    // Priority: starts-with match, then contains
    const idx = filteredOptions.findIndex((o) => o.label.toLowerCase().startsWith(buf))
    if (idx >= 0) {
      setHighlightedIndex(idx)
    } else {
      const containsIdx = filteredOptions.findIndex((o) => o.label.toLowerCase().includes(buf))
      if (containsIdx >= 0) setHighlightedIndex(containsIdx)
    }
  }, [filteredOptions])

  const closeAndReturnFocus = useCallback(() => {
    setIsOpen(false)
    // Return focus to trigger button
    setTimeout(() => triggerRef.current?.focus(), 10)
  }, [])

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

    switch (e.key) {
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        closeAndReturnFocus()
        break

      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
        break

      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
        break

      case 'Home':
        e.preventDefault()
        setHighlightedIndex(0)
        break

      case 'End':
        e.preventDefault()
        setHighlightedIndex(filteredOptions.length - 1)
        break

      case 'Enter':
      case ' ':
        e.preventDefault()
        {
          const targetIdx = highlightedIndex >= 0 ? highlightedIndex : 0
          if (filteredOptions[targetIdx]) {
            onChange(filteredOptions[targetIdx].value)
            closeAndReturnFocus()
          }
        }
        break

      default:
        // Type-ahead (only when not in search mode, to avoid interfering with search input)
        if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          handleTypeahead(e.key)
        }
        break
    }
  }

  // Handler specifically for search input — forward nav keys upward, handle Escape
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case 'Home':
      case 'End':
        handleKeyDown(e as unknown as React.KeyboardEvent)
        break
      case 'Escape':
        e.preventDefault()
        closeAndReturnFocus()
        break
    }
  }

  const selectOption = (optValue: string) => {
    onChange(optValue)
    closeAndReturnFocus()
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
                variants={dropdownVariants(coords.isUpward)}
                initial="initial"
                animate="animate"
                exit="exit"
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
                      onKeyDown={handleSearchKeyDown}
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
