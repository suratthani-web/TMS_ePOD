"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

export function ThemeWatcher() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const themeColor = resolvedTheme === "dark" ? "#0f172a" : "#ffffff"
    
    // Update theme-color meta tag
    let metaTag = document.querySelector('meta[name="theme-color"]')
    if (!metaTag) {
      metaTag = document.createElement('meta')
      metaTag.setAttribute('name', 'theme-color')
      document.head.appendChild(metaTag)
    }
    metaTag.setAttribute('content', themeColor)

    // Update apple-mobile-web-app-status-bar-style if needed
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (appleMeta) {
      appleMeta.setAttribute('content', resolvedTheme === "dark" ? "black-translucent" : "default")
    }
    
    // Update body background for PWA aesthetic
    document.body.style.backgroundColor = resolvedTheme === "dark" ? "#0f172a" : "#ffffff"
  }, [resolvedTheme])

  return null
}
