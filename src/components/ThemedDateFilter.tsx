import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { dropdownVariants } from '../lib/motion'

export interface ThemedDateFilterProps {
  dateFilter: string // 'all' | 'today' | 'yesterday' | 'specific' | 'range' | 'YYYY-MM'
  onDateFilterChange: (val: string) => void
  specificDate: string // 'YYYY-MM-DD'
  onSpecificDateChange: (val: string) => void
  rangeStart: string // 'YYYY-MM-DD'
  rangeEnd: string // 'YYYY-MM-DD'
  onRangeChange: (start: string, end: string) => void
  months: string[] // ['YYYY-MM', ...]
  className?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseYMD(val: string): Date {
  if (!val || val.length < 10) return new Date()
  const [y, m, d] = val.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatSingleDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const d = parseYMD(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRangeDates(start: string, end: string): string {
  if (!start || !end) return 'Date range'
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const dtStart = new Date(sy, (sm || 1) - 1, sd || 1)
  const dtEnd = new Date(ey, (em || 1) - 1, ed || 1)

  if (sy === ey) {
    const s = dtStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const e = dtEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} → ${e}`
  }
  const s = dtStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const e = dtEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} → ${e}`
}

export function ThemedDateFilter({
  dateFilter,
  onDateFilterChange,
  specificDate,
  onSpecificDateChange,
  rangeStart,
  rangeEnd,
  onRangeChange,
  months,
  className = ''
}: ThemedDateFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; isUpward: boolean } | null>(null)

  // Internal tab state: 'presets' | 'single' | 'range'
  const [activeTab, setActiveTab] = useState<'presets' | 'single' | 'range'>('presets')

  // Calendar navigation view
  const [viewDate, setViewDate] = useState<Date>(() => new Date())

  // Temporary date range state while user is picking
  const [tempStart, setTempStart] = useState<string>(rangeStart)
  const [tempEnd, setTempEnd] = useState<string>(rangeEnd)
  const [rangeTarget, setRangeTarget] = useState<'start' | 'end'>('start')

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const todayStr = useMemo(() => toYMD(new Date()), [])
  const yesterdayStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toYMD(d)
  }, [])

  // Sync temp dates when props change
  useEffect(() => {
    setTempStart(rangeStart)
    setTempEnd(rangeEnd)
  }, [rangeStart, rangeEnd])

  // Synchronize calendar view date based on current selection
  useEffect(() => {
    if (isOpen) {
      if (dateFilter === 'specific' && specificDate) {
        setActiveTab('single')
        const d = parseYMD(specificDate)
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
      } else if (dateFilter === 'range' && rangeStart) {
        setActiveTab('range')
        const d = parseYMD(rangeStart)
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
      } else {
        setActiveTab('presets')
        setViewDate(new Date())
      }
    }
  }, [isOpen, dateFilter, specificDate, rangeStart])

  // Update popup positioning
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const popupWidth = Math.min(318, viewportWidth - 24)
    const popupHeight = 360

    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const isUpward = spaceBelow < popupHeight && spaceAbove > spaceBelow

    let left = rect.left
    if (left + popupWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - popupWidth - 12)
    }
    if (left < 12) left = 12

    const top = isUpward ? Math.max(8, rect.top - popupHeight - 6) : rect.bottom + 6

    setCoords({
      top,
      left,
      width: popupWidth,
      isUpward
    })
  }, [])

  useLayoutEffect(() => {
    if (isOpen) updatePosition()
  }, [isOpen, updatePosition, activeTab])

  useEffect(() => {
    if (!isOpen) return
    const handleResize = () => updatePosition()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [isOpen, updatePosition])

  // Click outside listener
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

  // Determine button display label
  const displayLabel = useMemo(() => {
    if (dateFilter === 'all') return 'All dates'
    if (dateFilter === 'today') return 'Today'
    if (dateFilter === 'yesterday') return 'Yesterday'
    if (dateFilter === 'specific') return formatSingleDate(specificDate)
    if (dateFilter === 'range') return formatRangeDates(rangeStart, rangeEnd)
    // Month YYYY-MM
    try {
      const d = new Date(`${dateFilter}-01T12:00:00`)
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    } catch {
      return dateFilter
    }
  }, [dateFilter, specificDate, rangeStart, rangeEnd])

  // Calendar days computation for viewDate
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days: Array<{ dayNum: number; dateStr: string; isCurrentMonth: boolean }> = []

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevDate = new Date(year, month - 1, d)
      days.push({
        dayNum: d,
        dateStr: toYMD(prevDate),
        isCurrentMonth: false
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d)
      days.push({
        dayNum: d,
        dateStr: toYMD(curDate),
        isCurrentMonth: true
      })
    }

    // Next month filler days (to fill 5 or 6 full rows = 35 or 42)
    const totalSlots = days.length > 35 ? 42 : 35
    const remaining = totalSlots - days.length
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d)
      days.push({
        dayNum: d,
        dateStr: toYMD(nextDate),
        isCurrentMonth: false
      })
    }

    return days
  }, [viewDate])

  const monthYearTitle = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  }

  // Handle preset clicks
  const selectPreset = (val: string) => {
    onDateFilterChange(val)
    setIsOpen(false)
  }

  // Handle single date click
  const handleDayClickSingle = (dateStr: string) => {
    onSpecificDateChange(dateStr)
    onDateFilterChange('specific')
    setIsOpen(false)
  }

  // Handle range date click
  const handleDayClickRange = (dateStr: string) => {
    if (rangeTarget === 'start') {
      setTempStart(dateStr)
      // If new start is after current end, push end forward
      if (dateStr > tempEnd) {
        setTempEnd(dateStr)
      }
      setRangeTarget('end')
    } else {
      if (dateStr < tempStart) {
        // If clicked date is before start, make it start
        setTempStart(dateStr)
      } else {
        setTempEnd(dateStr)
      }
    }
  }

  const applyRange = () => {
    const finalStart = tempStart <= tempEnd ? tempStart : tempEnd
    const finalEnd = tempStart <= tempEnd ? tempEnd : tempStart
    onRangeChange(finalStart, finalEnd)
    onDateFilterChange('range')
    setIsOpen(false)
  }

  return (
    <div className={`themed-select-wrapper themed-date-filter-wrapper ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`themed-select-trigger compact date-filter-btn ${isOpen ? 'active' : ''}`}
        aria-label="Filter by date"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="themed-select-value">
          <CalendarDays size={14} className="themed-select-icon" aria-hidden="true" />
          <span className="themed-select-label date-filter-text">{displayLabel}</span>
        </span>
        <ChevronDown size={14} className={`themed-select-arrow ${isOpen ? 'open' : ''}`} aria-hidden="true" />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={popupRef}
                role="dialog"
                aria-label="Date filter picker"
                className="themed-calendar-popup date-filter-popover"
                style={{
                  position: 'fixed',
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                  zIndex: 9999
                }}
                variants={dropdownVariants(coords.isUpward)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {/* Popover Subtabs */}
                <div className="date-filter-tabs date-popover-tabs">
                  <button
                    type="button"
                    className={`date-filter-tab date-tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
                    onClick={() => setActiveTab('presets')}
                  >
                    Presets
                  </button>
                  <button
                    type="button"
                    className={`date-filter-tab date-tab-btn ${activeTab === 'single' ? 'active' : ''}`}
                    onClick={() => setActiveTab('single')}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    className={`date-filter-tab date-tab-btn ${activeTab === 'range' ? 'active' : ''}`}
                    onClick={() => setActiveTab('range')}
                  >
                    Date Range
                  </button>
                </div>

                {/* ─── TAB 1: PRESETS ─── */}
                {activeTab === 'presets' && (
                  <div className="date-presets-list">
                    <button
                      type="button"
                      className={`date-preset-item ${dateFilter === 'all' ? 'selected' : ''}`}
                      onClick={() => selectPreset('all')}
                    >
                      <span>All dates</span>
                      {dateFilter === 'all' && <Check size={14} className="preset-check" />}
                    </button>
                    <button
                      type="button"
                      className={`date-preset-item ${dateFilter === 'today' ? 'selected' : ''}`}
                      onClick={() => selectPreset('today')}
                    >
                      <span>Today</span>
                      {dateFilter === 'today' && <Check size={14} className="preset-check" />}
                    </button>
                    <button
                      type="button"
                      className={`date-preset-item ${dateFilter === 'yesterday' ? 'selected' : ''}`}
                      onClick={() => selectPreset('yesterday')}
                    >
                      <span>Yesterday</span>
                      {dateFilter === 'yesterday' && <Check size={14} className="preset-check" />}
                    </button>

                    {months.length > 0 && (
                      <div className="presets-section-divider">
                        <span>Months</span>
                      </div>
                    )}

                    {months.slice(0, 8).map((m) => {
                      const d = new Date(`${m}-01T12:00:00`)
                      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                      const isSelected = dateFilter === m
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`date-preset-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => selectPreset(m)}
                        >
                          <span>{label}</span>
                          {isSelected && <Check size={14} className="preset-check" />}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* ─── TAB 2: SINGLE DATE ─── */}
                {activeTab === 'single' && (
                  <div className="date-calendar-container">
                    <div className="themed-calendar-header">
                      <button
                        type="button"
                        className="themed-calendar-nav-btn"
                        onClick={prevMonth}
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="themed-calendar-title">
                        <strong>{monthYearTitle}</strong>
                      </div>
                      <button
                        type="button"
                        className="themed-calendar-nav-btn"
                        onClick={nextMonth}
                        aria-label="Next month"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="themed-calendar-weekdays">
                      {WEEKDAYS.map((w) => (
                        <span key={w} className="themed-calendar-weekday">
                          {w}
                        </span>
                      ))}
                    </div>

                    <div className="themed-calendar-grid">
                      {calendarDays.map((item, idx) => {
                        const isSelected = dateFilter === 'specific' && item.dateStr === specificDate
                        const isToday = item.dateStr === todayStr
                        return (
                          <button
                            key={`${item.dateStr}-${idx}`}
                            type="button"
                            className={`themed-calendar-day ${isSelected ? 'selected' : ''} ${
                              isToday ? 'today' : ''
                            } ${!item.isCurrentMonth ? 'outside' : ''}`}
                            onClick={() => handleDayClickSingle(item.dateStr)}
                          >
                            <span>{item.dayNum}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ─── TAB 3: DATE RANGE ─── */}
                {activeTab === 'range' && (
                  <div className="date-range-container">
                    {/* Range Start / End Selector Pills */}
                    <div className="range-pick-pills">
                      <button
                        type="button"
                        className={`range-pill ${rangeTarget === 'start' ? 'active' : ''}`}
                        onClick={() => setRangeTarget('start')}
                      >
                        <small>From</small>
                        <strong>{formatSingleDate(tempStart)}</strong>
                      </button>
                      <span className="range-arrow-sym">→</span>
                      <button
                        type="button"
                        className={`range-pill ${rangeTarget === 'end' ? 'active' : ''}`}
                        onClick={() => setRangeTarget('end')}
                      >
                        <small>To</small>
                        <strong>{formatSingleDate(tempEnd)}</strong>
                      </button>
                    </div>

                    {/* Range Calendar */}
                    <div className="themed-calendar-header">
                      <button
                        type="button"
                        className="themed-calendar-nav-btn"
                        onClick={prevMonth}
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="themed-calendar-title">
                        <strong>{monthYearTitle}</strong>
                      </div>
                      <button
                        type="button"
                        className="themed-calendar-nav-btn"
                        onClick={nextMonth}
                        aria-label="Next month"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="themed-calendar-weekdays">
                      {WEEKDAYS.map((w) => (
                        <span key={w} className="themed-calendar-weekday">
                          {w}
                        </span>
                      ))}
                    </div>

                    <div className="themed-calendar-grid">
                      {calendarDays.map((item, idx) => {
                        const isStart = item.dateStr === tempStart
                        const isEnd = item.dateStr === tempEnd
                        const inBetween = item.dateStr > tempStart && item.dateStr < tempEnd
                        const isToday = item.dateStr === todayStr

                        return (
                          <button
                            key={`${item.dateStr}-${idx}`}
                            type="button"
                            className={`themed-calendar-day range-day ${isStart ? 'range-start selected' : ''} ${
                              isEnd ? 'range-end selected' : ''
                            } ${inBetween ? 'in-range' : ''} ${isToday ? 'today' : ''} ${
                              !item.isCurrentMonth ? 'outside' : ''
                            }`}
                            onClick={() => handleDayClickRange(item.dateStr)}
                          >
                            <span>{item.dayNum}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Apply Range Action Bar */}
                    <div className="date-range-actions">
                      <button
                        type="button"
                        className="button compact secondary"
                        onClick={() => setIsOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button compact primary apply-range-btn"
                        onClick={applyRange}
                      >
                        Apply range
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
