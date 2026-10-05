/**
 * Side-effect imports that register the c2 elements the site chrome renders as plain tags (not Astro islands):
 * example toolbars, code-block copy buttons, API table controls and the search palette. Repeated chrome uses plain
 * tags so a gallery page does not ship one declarative-shadow-DOM copy of a component per instance; the elements
 * upgrade once this module runs. Unique chrome (header, hero) uses islands and does not need this file.
 */
import '@c2n/components/button'
import '@c2n/components/checkbox'
import '@c2n/components/command'
import '@c2n/components/card'
import '@c2n/components/details'
import '@c2n/components/icon-button'
import '@c2n/components/kbd'
import '@c2n/components/link-button'
import '@c2n/components/label'
import '@c2n/components/list'
import '@c2n/components/list-item'
import '@c2n/components/modal'
import '@c2n/components/select'
import '@c2n/components/shortcut'
import '@c2n/components/text-field'
import '@c2n/components/theme-select'
import '@c2n/components/tree'
import '@c2n/feather-icons/icons/arrow-left.js'
import '@c2n/feather-icons/icons/arrow-right.js'
import '@c2n/feather-icons/icons/check.js'
import '@c2n/feather-icons/icons/chevron-down.js'
import '@c2n/feather-icons/icons/chevron-right.js'
import '@c2n/feather-icons/icons/code.js'
import '@c2n/feather-icons/icons/copy.js'
import '@c2n/feather-icons/icons/rotate-ccw.js'
import '@c2n/feather-icons/icons/search.js'
import '@c2n/feather-icons/icons/sliders.js'
import '@c2n/feather-icons/icons/sun.js'
