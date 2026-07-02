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
        <img src="/icon.png" alt="Vocalizer Logo" className="titlebar-logo" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />
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
