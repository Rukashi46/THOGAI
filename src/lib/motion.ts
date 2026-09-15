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

/** ThemedSelect, DatePicker, context menus — direction-aware */
export function dropdownVariants(isUpward: boolean = false): Variants {
  const enterY = isUpward ? 6 : -6
  const exitY  = isUpward ? 4 : -4
  return {
    initial: { opacity: 0, scale: 0.97, y: enterY },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: snappyEase,
    },
    exit: {
      opacity: 0,
      scale: 0.97,
      y: exitY,
      transition: { duration: 0.14, ease: [0.4, 0, 0.6, 1] },
    },
  }
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

// ─── Onboarding Step Transitions ──────────────────────────────────────────────
//
// direction: 1  = forward (content enters from right)
// direction: -1 = backward (content enters from left)
//
export const onboardingStepVariants: Variants = {
  initial: (direction: number = 1) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
    scale: 0.97,
  }),
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      ...iosSpring,
      opacity: { duration: 0.18, ease: 'easeOut' },
    },
  },
  exit: (direction: number = 1) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.2, ease: [0.4, 0, 0.6, 1] },
  }),
}

/** Stagger container for onboarding content */
export const onboardingContentVariants: Variants = {
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

/** Individual onboarding content items (eyebrow, heading, desc, buttons) */
export const onboardingItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: gentleSpring,
  },
}

/** Word-by-word text reveal for onboarding headings */
export const wordRevealContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

export const wordRevealItem: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(3px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 360,
      damping: 30,
      mass: 0.7,
    },
  },
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

/** Verification checkmark animation */
export const verifyVariants: Variants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: snapSpring,
  },
}

// ─── Stats Screen Animations ──────────────────────────────────────────────────

/** Individual stat card entrance (stagger parent must set delayChildren) */
export const statCardVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 32, mass: 0.85 },
  },
}

/** Stagger container for chart cards */
export const statGridVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

/** Chart bar fill — spring physics */
export const barFillSpring: Transition = {
  type: 'spring',
  stiffness: 160,
  damping: 26,
  mass: 1.1,
}

/** Donut ring fill transition */
export const donutSpring: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 24,
  mass: 1.2,
}

/** Month selector change — content cross-fades with micro-slide */
export const monthChangeVariants: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: dir > 0 ? 12 : -12 }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 420, damping: 34, mass: 0.75 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -8 : 8,
    transition: { duration: 0.13, ease: [0.4, 0, 0.6, 1] },
  }),
}

/** Category row entrance (stagger) */
export const categoryRowVariants: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 360, damping: 30 },
  },
}

/** Toast notification */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.94 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...snapSpring, opacity: { duration: 0.12, ease: 'easeOut' } },
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.96,
    transition: { duration: 0.16, ease: [0.4, 0, 0.6, 1] },
  },
}

// ─── Lock Screen / PIN ────────────────────────────────────────────────────────

/** Lock screen entrance */
export const lockScreenVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 0.6, 1] } },
}

/** PIN dot fill — spring pop */
export const pinDotVariants: Variants = {
  empty: { scale: 1, background: 'transparent' },
  filled: {
    scale: [1, 1.3, 1],
    transition: { type: 'spring', stiffness: 600, damping: 18, mass: 0.5 },
  },
}

// ─── Sync Pill ────────────────────────────────────────────────────────────────

/** Sync pill label cross-fade */
export const syncLabelVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.1, ease: [0.4, 0, 0.6, 1] } },
}

// ─── Balance / Number Reveal ──────────────────────────────────────────────────

/** Animated balance value — cross-fades on change */
export const balanceRevealVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { ...iosSpring, opacity: { duration: 0.16 } } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.12, ease: [0.4, 0, 0.6, 1] } },
}

// ─── Home Page Content Stagger ────────────────────────────────────────────────

/** Container for staggered home sections */
export const homeSectionContainer: Variants = {
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

/** Individual home section */
export const homeSectionItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 32 } },
}

// ─── Budget Item ──────────────────────────────────────────────────────────────

/** Budget list item entrance */
export const budgetItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 32 } },
}

// ─── Split Panel ──────────────────────────────────────────────────────────────

/** Expandable split section — uses layout animation */
export const splitPanelVariants: Variants = {
  initial: { opacity: 0, scaleY: 0.92 },
  animate: { opacity: 1, scaleY: 1, transition: { ...sheetSpring, opacity: { duration: 0.14 } } },
  exit:    { opacity: 0, scaleY: 0.94, transition: { duration: 0.15, ease: [0.4, 0, 0.6, 1] } },
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

/** Confirm modal pop */
export const confirmVariants: Variants = {
  initial: { opacity: 0, scale: 0.93, y: 12 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { ...snapSpring, opacity: { duration: 0.14 } },
  },
  exit: {
    opacity: 0, scale: 0.95, y: 6,
    transition: { duration: 0.15, ease: [0.4, 0, 0.6, 1] },
  },
}
