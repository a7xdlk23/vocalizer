import type { ReactNode } from 'react'

interface LayoutProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  titlebarRight?: ReactNode
}

export function Layout({ left, center, right, titlebarRight }: LayoutProps) {
  return (
    <div className="app">
      <div className="titlebar">
        <svg className="titlebar-logo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span className="titlebar-name">Vocalizer</span>
        <span className="titlebar-version">v0.1</span>
        <div className="titlebar-spacer" />
        {titlebarRight}
      </div>
      <div className="panels">
        <div className="panel">{left}</div>
        <div className="panel">{center}</div>
        <div className="panel">{right}</div>
      </div>
    </div>
  )
}
