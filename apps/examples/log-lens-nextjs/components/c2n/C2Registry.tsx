'use client'

import { useEffect } from 'react'

let registration: Promise<void> | undefined

/** Registers every c2 element the app renders, exactly once, before any property is assigned. */
export function registerC2Elements(): Promise<void> {
  registration ??= Promise.all([
    import('@c2n/components/badge'),
    import('@c2n/components/banner'),
    import('@c2n/components/button'),
    import('@c2n/components/button-group'),
    import('@c2n/components/card'),
    import('@c2n/components/code-viewer'),
    import('@c2n/components/command'),
    import('@c2n/components/details'),
    import('@c2n/components/flow'),
    import('@c2n/components/header'),
    import('@c2n/components/hover-card'),
    import('@c2n/components/icon-button'),
    import('@c2n/components/link-button'),
    import('@c2n/components/list-item'),
    import('@c2n/components/log-viewer'),
    import('@c2n/components/marker'),
    import('@c2n/components/modal'),
    import('@c2n/components/progress'),
    import('@c2n/components/select'),
    import('@c2n/components/sheet'),
    import('@c2n/components/shortcut'),
    import('@c2n/components/skeleton'),
    import('@c2n/components/split-panel'),
    import('@c2n/components/stat'),
    import('@c2n/components/status-panel'),
    import('@c2n/components/steps'),
    import('@c2n/components/switch'),
    import('@c2n/components/table'),
    import('@c2n/components/tabs'),
    import('@c2n/components/text-field'),
    import('@c2n/components/theme-select'),
    import('@c2n/components/timeline'),
    import('@c2n/components/toast'),
    import('@c2n/components/tooltip'),
    import('@c2n/components/tree'),
    import('@c2n/components/upload'),
    // Only the chart kinds the app draws: the barrel would pull the optional ECharts engines in.
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/feather-icons/icons/activity.js'),
    import('@c2n/feather-icons/icons/alert-triangle.js'),
    import('@c2n/feather-icons/icons/book-open.js'),
    import('@c2n/feather-icons/icons/clock.js'),
    import('@c2n/feather-icons/icons/crosshair.js'),
    import('@c2n/feather-icons/icons/download.js'),
    import('@c2n/feather-icons/icons/file-text.js'),
    import('@c2n/feather-icons/icons/git-merge.js'),
    import('@c2n/feather-icons/icons/layers.js'),
    import('@c2n/feather-icons/icons/search.js'),
    import('@c2n/feather-icons/icons/upload.js'),
    import('@c2n/feather-icons/icons/x.js'),
    import('@c2n/feather-icons/icons/zap.js'),
    import('@c2n/feather-icons/icons/terminal.js'),
  ]).then(() => undefined)

  return registration
}

let echartsRegistration: Promise<void> | undefined

/** The butterfly chart runs on ECharts (~800 KB), so it is registered only when the Differences view first opens. */
export function registerEchartsElements(): Promise<void> {
  echartsRegistration ??= import('@c2n/components/chart').then(() => undefined)
  return echartsRegistration
}

export function C2Registry() {
  useEffect(() => {
    void registerC2Elements()
  }, [])

  return null
}
