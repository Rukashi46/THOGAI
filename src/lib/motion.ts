import type { TargetAndTransition, Transition, Variants } from 'framer-motion'

/**
 * THOGAI iOS-Inspired Physics Motion System
 * Premium, tactile, spring-driven transitions.
 *
 * Design principles:
 * - Every motion communicates physical continuity
 * - Spring physics for all interactive elements
 * - Minimal overshoot — confident, not bouncy
 * - GPU-only properties: transform + opacity
 * - Interruptible by design (no mode="wait" on nav)
 */

// ─── Core Spring Presets ─────────────────────────────────────────────────────

/** Primary navigation spring — fast, confident, minimal overshoot */
export const iosSpring: Transition = {
  type: 'spring',
  stiffness: 440,
  damping: 36,
  mass: 0.75,
}

/** Sheet/modal entry spring — slightly slower, heavier feel */
export const sheetSpring: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 38,
  mass: 1.05,
}

/** Gentle spring for subtle state changes */
export const gentleSpring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 0.8,
}

/** Micro-interaction spring — very snappy, instant-feeling */
export const snapSpring: Transition = {
  type: 'spring',
  stiffness: 560,
  damping: 30,
  mass: 0.6,
}

/** Snappy ease curve for dropdowns/menus */
export const snappyEase: Transition = {
  duration: 0.22,
  ease: [0.34, 1.04, 0.64, 1],
}

/** Fast ease for exits (no spring needed) */
export const quickEaseOut: Transition = {
  duration: 0.18,
  ease: [0.4, 0, 0.6, 1],
}

// ─── Button & Card Press States ──────────────────────────────────────────────

/** Icon buttons, small CTAs */
export const buttonTap: TargetAndTransition = {
  scale: 0.93,
  transition: snapSpring,
}

/** Primary/large action buttons */
export const primaryButtonTap: TargetAndTransition = {
  scale: 0.965,
  transition: snapSpring,
}

/** Cards and list rows */
export const cardTap: TargetAndTransition = {
  scale: 0.984,
  transition: { type: 'spring', stiffness: 400, damping: 34, mass: 0.7 },
}

/** Hover lift for interactive cards */
export const cardHover: TargetAndTransition = {
  y: -2,
  transition: gentleSpring,
}

// ─── Page Transitions ─────────────────────────────────────────────────────────
//
// direction: 1  = forward (new screen from right)
// direction: -1 = backward (new screen from left)
// direction: 0  = tab switch (scale/fade)
//
export const pageVariants: Variants = {
  initial: (direction: number = 0) => {
    if (direction === 1) {
      // New page enters from right
      return { x: 36, y: 0, opacity: 0.94, scale: 0.995 }
    }
    if (direction === -1) {
      // Back — new page enters from left
      return { x: -36, y: 0, opacity: 0.94, scale: 0.995 }
    }
    // Tab switch — subtle scale+fade
    return { x: 0, y: 5, opacity: 0, scale: 0.985 }
  },

  animate: {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 440,
      damping: 36,
      mass: 0.75,
      opacity: { duration: 0.18, ease: 'easeOut' },
    },
  },

  exit: (direction: number = 0) => {
    if (direction === 1) {
      // Previous page exits to left (pushed away)
      return {
        x: -22,
        y: 0,
        opacity: 0.92,
        scale: 0.99,
        transition: { duration: 0.26, ease: [0.4, 0, 0.6, 1] },
      }
    }
    if (direction === -1) {
      // Returning page exits to right
      return {
        x: 22,
        y: 0,
        opacity: 0.92,
        scale: 0.99,
        transition: { duration: 0.26, ease: [0.4, 0, 0.6, 1] },
      }
    }
    // Tab switch exit
    return {
      x: 0,
      y: -5,
      opacity: 0,
      scale: 0.985,
      transition: { duration: 0.16, ease: [0.4, 0, 0.6, 1] },
    }
  },
}

// ─── Modal Animations ─────────────────────────────────────────────────────────

/** Desktop center modal — scale up from slightly below center */
export const desktopModalVariants: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 16 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...sheetSpring, opacity: { duration: 0.16 } },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 10,
    transition: { duration: 0.18, ease: [0.4, 0, 0.6, 1] },
  },
}

/** Mobile bottom sheet — slides up from bottom */
export const mobileSheetVariants: Variants = {
  initial: { y: '100%', opacity: 0.8 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { ...sheetSpring, opacity: { duration: 0.12 } },
  },
  exit: {
    y: '100%',
    opacity: 0.8,
    transition: { duration: 0.24, ease: [0.4, 0, 0.8, 0] },
  },
}

/** Backdrop — crossfade */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } },
}

// ─── Dropdown / Overlay Menus ─────────────────────────────────────────────────

/** ThemedSelect, DatePicker, context menus */
export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, y: -6 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: snappyEase,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -4,
    transition: { duration: 0.14, ease: [0.4, 0, 0.6, 1] },
  },
}

// ─── Auth Screen Step Switcher ────────────────────────────────────────────────

export const authStepVariants: Variants = {
  initial: { opacity: 0, x: 18, scale: 0.97 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: iosSpring,
  },
  exit: {
    opacity: 0,
    x: -18,
    scale: 0.97,
    transition: { duration: 0.18, ease: [0.4, 0, 0.6, 1] },
  },
}

// ─── List / Stagger Items ─────────────────────────────────────────────────────

/** For animating lists with staggerChildren */
export const listContainerVariants: Variants = {
  animate: {
    transition: { staggerChildren: 0.045, delayChildren: 0.04 },
  },
}

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 30 },
  },
}

// ─── AI Chat Message Entrance ─────────────────────────────────────────────────

export const messageVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: iosSpring,
  },
}

// ─── Fade + Slide (generic) ───────────────────────────────────────────────────

export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: gentleSpring },
  exit: { opacity: 0, y: -6, transition: quickEaseOut },
}

// ─── Reduced Motion Fallbacks ─────────────────────────────────────────────────

export const reducedMotionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.08 } },
  exit: { opacity: 0, transition: { duration: 0.06 } },
}
