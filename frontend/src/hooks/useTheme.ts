import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('whiteboard_theme') as Theme
    return saved || 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = window.document.documentElement
    
    const applyTheme = (themeValue: Theme) => {
      let activeTheme: 'light' | 'dark' = 'light'
      
      if (themeValue === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        activeTheme = systemPrefersDark ? 'dark' : 'light'
      } else {
        activeTheme = themeValue
      }

      root.classList.remove('light', 'dark')
      root.classList.add(activeTheme)
      setResolvedTheme(activeTheme)
    }

    applyTheme(theme)
    localStorage.setItem('whiteboard_theme', theme)

    // Handle system preference changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = (e: MediaQueryListEvent) => {
        const activeTheme = e.matches ? 'dark' : 'light'
        root.classList.remove('light', 'dark')
        root.classList.add(activeTheme)
        setResolvedTheme(activeTheme)
      }
      
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  return { theme, resolvedTheme, setTheme }
}
