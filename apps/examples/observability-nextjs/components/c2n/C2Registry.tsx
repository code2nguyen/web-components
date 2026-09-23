'use client'

import { useEffect } from 'react'

let registration: Promise<void> | undefined

/** Register the elements used throughout the shell and feature routes exactly once. */
export function registerC2Elements(): Promise<void> {
  registration ??= Promise.all([
    import('@c2n/badge'),
    import('@c2n/breadcrumb'),
    import('@c2n/button'),
    import('@c2n/button-group'),
    import('@c2n/card'),
    import('@c2n/checkbox'),
    import('@c2n/dashboard'),
    import('@c2n/date-input'),
    import('@c2n/date-selector'),
    import('@c2n/details'),
    import('@c2n/header'),
    import('@c2n/icon-button'),
    import('@c2n/link-button'),
    import('@c2n/list-item'),
    import('@c2n/menu'),
    import('@c2n/modal'),
    import('@c2n/number-input'),
    import('@c2n/pagination'),
    import('@c2n/progress'),
    import('@c2n/radio'),
    import('@c2n/select'),
    import('@c2n/sheet'),
    import('@c2n/side-nav'),
    import('@c2n/skeleton'),
    import('@c2n/spinner'),
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
    // Register only the chart implementations the example ships. Avoiding the chart
    // barrel keeps optional ECharts chart engines out of every route.
    import('@c2n/chart/line-chart.js'),
    import('@c2n/chart/area-chart.js'),
    import('@c2n/chart/bar-chart.js'),
    import('@c2n/chart/sparkline.js'),
    import('@c2n/chart/chart-series.js'),
    import('@c2n/chart/chart-legend.js'),
    import('@c2n/chart/chart-tooltip.js'),
    import('@c2n/feather-icons/icons/activity.js'),
    import('@c2n/feather-icons/icons/alert-triangle.js'),
    import('@c2n/feather-icons/icons/bar-chart-2.js'),
    import('@c2n/feather-icons/icons/bell.js'),
    import('@c2n/feather-icons/icons/box.js'),
    import('@c2n/feather-icons/icons/chevron-left.js'),
    import('@c2n/feather-icons/icons/clock.js'),
    import('@c2n/feather-icons/icons/file-text.js'),
    import('@c2n/feather-icons/icons/home.js'),
    import('@c2n/feather-icons/icons/menu.js'),
    import('@c2n/feather-icons/icons/pause.js'),
    import('@c2n/feather-icons/icons/play.js'),
    import('@c2n/feather-icons/icons/refresh-cw.js'),
    import('@c2n/feather-icons/icons/search.js'),
    import('@c2n/feather-icons/icons/server.js'),
    import('@c2n/feather-icons/icons/settings.js'),
    import('@c2n/feather-icons/icons/x.js'),
  ]).then(() => undefined)

  return registration
}

export function C2Registry() {
  useEffect(() => {
    void registerC2Elements()
  }, [])

  return null
}
