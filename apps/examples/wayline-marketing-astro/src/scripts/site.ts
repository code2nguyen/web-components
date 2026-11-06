// Above the fold: registered straight away, so the header and the hero upgrade on the first frame.
import '@c2n/components/scroll-progress'
import '@c2n/components/header'
import '@c2n/components/navigation-menu'
import '@c2n/components/link-button'
import '@c2n/components/button'
import '@c2n/components/badge'
import '@c2n/components/backdrop'
import '@c2n/components/text-effect'
import '@c2n/components/device-frame'
import './icons.ts'
import { whenNear } from './islands.ts'
import { setUpPricing } from './pricing.ts'
import { setUpSignup } from './signup.ts'

// Below the fold: each module loads when the first section that uses it comes near.
whenNear('c2-marquee', () => import('@c2n/components/marquee'))
whenNear('c2-beam', () => import('@c2n/components/beam'))
whenNear('c2-stat, c2-card', () => Promise.all([import('@c2n/components/stat'), import('@c2n/components/card')]))
whenNear('c2-button-group', () => import('@c2n/components/button-group'))
whenNear('c2-accordion', () => Promise.all([import('@c2n/components/accordion'), import('@c2n/components/details')]))

setUpPricing()
setUpSignup()
