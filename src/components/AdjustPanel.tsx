import { memo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/context'
import { CloseIcon } from './icons'

export interface PanelSection {
  id: string
  title: string
  /** 抽屉标签页上的短名称 */
  tabLabel: string
  content: ReactNode
}

interface AdjustPanelProps {
  /** dock：桌面 / 横屏侧栏，所有分组纵向排列；sheet：竖屏底部抽屉，分组以标签页切换 */
  variant: 'dock' | 'sheet'
  open: boolean
  sections: PanelSection[]
  onClose: () => void
}

export const ADJUST_PANEL_ID = 'adjust-panel'

/**
 * 调整面板。始终挂载（关闭时隐藏），控件状态与原生表单元素不会因开合而重建；
 * 开合只改变布局，不触碰渲染与录制。
 */
export const AdjustPanel = memo(function AdjustPanel({ variant, open, sections, onClose }: AdjustPanelProps) {
  const { m } = useI18n()
  const [tab, setTab] = useState(sections[0]?.id ?? '')
  const tabbed = variant === 'sheet'

  return (
    <aside
      id={ADJUST_PANEL_ID}
      className={`adjust-panel adjust-${variant}`}
      aria-label={m.panel.region}
      hidden={!open}
    >
      <div className="panel-head">
        {tabbed ? (
          <div className="panel-tabs" role="tablist" aria-label={m.panel.region}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`tab-${section.id}`}
                aria-selected={section.id === tab}
                aria-controls={`section-${section.id}`}
                className={section.id === tab ? 'panel-tab is-selected' : 'panel-tab'}
                onClick={() => setTab(section.id)}
              >
                {section.tabLabel}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="panel-heading">{m.panel.adjust}</h2>
        )}
        {tabbed ? (
          <button type="button" className="panel-done" onClick={onClose}>
            {m.panel.done}
          </button>
        ) : (
          <button type="button" className="icon-button icon-button-small" onClick={onClose}>
            <CloseIcon size={18} />
            <span className="sr-only">{m.panel.closeAdjust}</span>
          </button>
        )}
      </div>
      <div className="panel-body">
        {sections.map((section) => (
          <section
            key={section.id}
            id={`section-${section.id}`}
            className="panel-section"
            data-section={section.id}
            role={tabbed ? 'tabpanel' : undefined}
            aria-labelledby={tabbed ? `tab-${section.id}` : `title-${section.id}`}
            hidden={tabbed && section.id !== tab}
          >
            {!tabbed && (
              <h3 className="section-title" id={`title-${section.id}`}>
                {section.title}
              </h3>
            )}
            {section.content}
          </section>
        ))}
      </div>
    </aside>
  )
})
