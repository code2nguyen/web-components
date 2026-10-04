'use client'

import { useEffect } from 'react'

let registration: Promise<void> | undefined

/** Register the elements used throughout the shell and feature routes exactly once. */
export function registerC2Elements(): Promise<void> {
  registration ??= Promise.all([
    import('@c2n/components/badge'),
    import('@c2n/components/breadcrumb'),
    import('@c2n/components/button'),
    import('@c2n/components/button-group'),
    import('@c2n/components/card'),
    import('@c2n/components/checkbox'),
    import('@c2n/components/dashboard'),
    import('@c2n/components/date-input'),
    import('@c2n/components/date-selector'),
    import('@c2n/components/details'),
    import('@c2n/components/header'),
    import('@c2n/components/icon-button'),
    import('@c2n/components/link-button'),
    import('@c2n/components/list-item'),
    import('@c2n/components/menu'),
    import('@c2n/components/modal'),
    import('@c2n/components/number-input'),
    import('@c2n/components/pagination'),
    import('@c2n/components/progress'),
    import('@c2n/components/radio'),
    import('@c2n/components/select'),
    import('@c2n/components/sheet'),
    import('@c2n/components/side-nav'),
    import('@c2n/components/skeleton'),
    import('@c2n/components/spinner'),
    import('@c2n/components/stat'),
    import('@c2n/components/status-panel'),
    import('@c2n/components/steps'),
    import('@c2n/components/switch'),
    import('@c2n/components/table'),
    import('@c2n/components/tabs'),
    import('@c2n/components/text-field'),
    import('@c2n/components/theme-select'),
    import('@c2n/components/toast'),
    import('@c2n/components/tooltip'),
    import('@c2n/components/tree'),
    // Register only the chart implementations the example ships. Avoiding the chart
    // barrel keeps optional ECharts chart engines out of every route.
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
    import('@c2n/components/chart'),
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
