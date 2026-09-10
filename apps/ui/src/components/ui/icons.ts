/**
 * Feather icons used by the site chrome, re-exported as classes so `.astro` files can render them as islands:
 * `import { FeatherMenuIcon } from './ui/icons'` then `<FeatherMenuIcon client:load />`.
 * Repeated chrome (example toolbars) renders plain `<c2-feather-*>` tags instead; those are registered by
 * `src/data/chrome-modules.ts`. Astro cannot put a `client:*` directive on a dynamic tag, hence one export per icon.
 */
export { FeatherArrowLeftIcon } from '@c2n/feather-icons/icons/arrow-left.js'
export { FeatherArrowRightIcon } from '@c2n/feather-icons/icons/arrow-right.js'
export { FeatherCheckIcon } from '@c2n/feather-icons/icons/check.js'
export { FeatherChevronDownIcon } from '@c2n/feather-icons/icons/chevron-down.js'
export { FeatherChevronRightIcon } from '@c2n/feather-icons/icons/chevron-right.js'
export { FeatherCodeIcon } from '@c2n/feather-icons/icons/code.js'
export { FeatherCopyIcon } from '@c2n/feather-icons/icons/copy.js'
export { FeatherExternalLinkIcon } from '@c2n/feather-icons/icons/external-link.js'
export { FeatherFeatherIcon } from '@c2n/feather-icons/icons/feather.js'
export { FeatherGithubIcon } from '@c2n/feather-icons/icons/github.js'
export { FeatherLayersIcon } from '@c2n/feather-icons/icons/layers.js'
export { FeatherMenuIcon } from '@c2n/feather-icons/icons/menu.js'
export { FeatherMoonIcon } from '@c2n/feather-icons/icons/moon.js'
export { FeatherPackageIcon } from '@c2n/feather-icons/icons/package.js'
export { FeatherRefreshCwIcon } from '@c2n/feather-icons/icons/refresh-cw.js'
export { FeatherRotateCcwIcon } from '@c2n/feather-icons/icons/rotate-ccw.js'
export { FeatherSearchIcon } from '@c2n/feather-icons/icons/search.js'
export { FeatherSlidersIcon } from '@c2n/feather-icons/icons/sliders.js'
export { FeatherSunIcon } from '@c2n/feather-icons/icons/sun.js'
export { FeatherXIcon } from '@c2n/feather-icons/icons/x.js'
