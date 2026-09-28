'use client'

import { useEffect } from 'react'

let registration: Promise<void> | undefined

/** Registers every c2 element the app renders, exactly once, before any property is assigned. */
export function registerC2Elements(): Promise<void> {
  registration ??= Promise.all([
    import('@c2n/badge'),
    import('@c2n/button'),
    import('@c2n/button-group'),
    import('@c2n/card'),
    import('@c2n/code-viewer'),
    import('@c2n/details'),
    import('@c2n/header'),
    import('@c2n/icon-button'),
    import('@c2n/link-button'),
    import('@c2n/list-item'),
    import('@c2n/log-viewer'),
    import('@c2n/progress'),
    import('@c2n/select'),
    import('@c2n/sheet'),
    import('@c2n/skeleton'),
    import('@c2n/stat'),
    import('@c2n/status-panel'),
    import('@c2n/steps'),
    import('@c2n/switch'),
    import('@c2n/table'),
    import('@c2n/tabs'),
    import('@c2n/text-field'),
    import('@c2n/theme-select'),
    import('@c2n/toast'),
    import('@c2n/tooltip'),
    import('@c2n/tree'),
    import('@c2n/upload'),
    // Only the chart kinds the app draws: the barrel would pull the optional ECharts engines in.
    import('@c2n/chart/area-chart.js'),
    import('@c2n/chart/bar-chart.js'),
    import('@c2n/chart/sparkline.js'),
    import('@c2n/chart/chart-series.js'),
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

export function C2Registry() {
  useEffect(() => {
    void registerC2Elements()
  }, [])

  return null
}
