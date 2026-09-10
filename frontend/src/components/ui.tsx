import { ReactNode } from 'react'

export function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 880 } : undefined}>
        <div className="flex-between mb16">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ 关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <div className="empty">⏳ {label}</div>
}

export function SectionTitle({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="flex-between mb16">
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {extra}
    </div>
  )
}
