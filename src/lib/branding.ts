import type { ThemeId } from '../services/storage'

export const THEME_LOGOS: Record<ThemeId, string> = {
  navy: '/logos/logo-navy.jpg',
  liquid: '/logos/logo-liquid.jpg',
  midnight: '/logos/logo-midnight.jpg',
  cream: '/logos/logo-cream.jpg',
  cyan: '/logos/logo-cyan.jpg',
}

export const THEME_META: Record<ThemeId, { name: string; copy: string }> = {
  navy: { name: 'Deep Navy & Gold', copy: 'Dark navy & warm gold' },
  liquid: { name: 'Midnight Liquid', copy: 'Deep violet glass' },
  midnight: { name: 'Green Midnight', copy: 'Emerald green glass' },
  cream: { name: 'Cream Clay', copy: 'Warm sculptural clay' },
  cyan: { name: 'Graphite Cyan', copy: 'Techy cyan glass' },
}

export function getThemeLogo(theme?: ThemeId | string | null): string {
  if (theme && theme in THEME_LOGOS) {
    return THEME_LOGOS[theme as ThemeId]
  }
  return '/logos/logo-default.jpg'
}

