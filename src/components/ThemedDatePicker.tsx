import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export interface ThemedDatePickerProps {
  value: string // 'YYYY-MM-DD'
  onChange: (value: string) => void
  ariaLabel?: string
  placeholder?: string
  className?: string
  id?: string
  align?: 'left' | 'right'
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseDate(val: string): Date {
  if (!val || val.length < 10) return new Date()
  const [y, m, d] = val.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function ThemedDatePicker({
  value,
  onChange,
  ariaLabel = 'Select date',
  placeholder = 'Select date',
  className = '',
  id,
  align = 'left'
}: ThemedDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; isUpward: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseDate(value) : new Date()
  const [viewDate, setViewDate] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  )

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const popupWidth = Math.min(268, viewportWidth - 24)
    const popupHeight = 290

    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const isUpward = spaceBelow < popupHeight && spaceAbove > spaceBelow

    let left = align === 'right' ? rect.right - popupWidth : rect.left
    if (left + popupWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - popupWidth - 12)
    }
    if (left < 12) left = 12

    const top = isUpward ? Math.max(8, rect.top - popupHeight - 6) : rect.bottom + 6

    setCoords({
      top,
      left,
      isUpward
    })
  }, [align])

  useLayoutEffect(() => {
    if (isOpen) {
      const d = value ? parseDate(value) : new Date()
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
      updatePosition()
    }
  }, [isOpen, value, updatePosition])

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
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const prevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const jumpToday = () => {
    const today = new Date()
    onChange(formatDate(today))
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setIsOpen(false)
  }

  // Calculate calendar days
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayStr = formatDate(new Date())
  const selectedStr = value

  // Build grid
  const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []

  // Preceding month padding
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i
    const d = new Date(year, month - 1, dayNum)
    days.push({ dateStr: formatDate(d), dayNum, isCurrentMonth: false })
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    days.push({ dateStr: formatDate(d), dayNum: i, isCurrentMonth: true })
  }

  // Trailing days to fill 35 or 42 cells
  const remaining = (7 - (days.length % 7)) % 7
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    days.push({ dateStr: formatDate(d), dayNum: i, isCurrentMonth: false })
  }

  const monthName = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const formattedDisplay = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : placeholder

  return (
    <div className={`themed-datepicker-wrapper ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`themed-datepicker-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="themed-datepicker-value">
          <CalendarDays size={16} className="themed-datepicker-icon" aria-hidden="true" />
          <span className="themed-datepicker-text">{formattedDisplay}</span>
        </span>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={popupRef}
                role="dialog"
                aria-label="Calendar date picker"
                className="themed-calendar-popup"
                style={{
                  position: 'fixed',
                  top: coords.top,
                  left: coords.left,
                  width: Math.min(268, window.innerWidth - 24),
                  zIndex: 9999
                }}
                initial={{ opacity: 0, y: coords.isUpward ? 8 : -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.34, 1.04, 0.64, 1] } }}
                exit={{ opacity: 0, y: coords.isUpward ? 6 : -6, scale: 0.97, transition: { duration: 0.14, ease: [0.4, 0, 0.6, 1] } }}
              >
            <div className="themed-calendar-header">
              <button
                type="button"
                className="themed-calendar-nav-btn"
                aria-label="Previous month"
                onClick={prevMonth}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="themed-calendar-title">
                <strong>{monthName}</strong>
              </div>
              <button
                type="button"
                className="themed-calendar-nav-btn"
                aria-label="Next month"
                onClick={nextMonth}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="themed-calendar-weekdays">
              {WEEKDAYS.map(w => (
                <span key={w} className="themed-calendar-weekday">
                  {w}
                </span>
              ))}
            </div>

            <div className="themed-calendar-grid">
              {days.map((item, idx) => {
                const isSelected = item.dateStr === selectedStr
                const isToday = item.dateStr === todayStr
                return (
                  <button
                    key={`${item.dateStr}-${idx}`}
                    type="button"
                    className={`themed-calendar-day ${isSelected ? 'selected' : ''} ${
                      isToday ? 'today' : ''
                    } ${!item.isCurrentMonth ? 'outside' : ''}`}
                    onClick={() => {
                      onChange(item.dateStr)
                      setIsOpen(false)
                    }}
                  >
                    <span>{item.dayNum}</span>
                  </button>
                )
              })}
            </div>

            <div className="themed-calendar-footer">
              <button
                type="button"
                className="themed-calendar-today-btn"
                onClick={jumpToday}
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  )
}
