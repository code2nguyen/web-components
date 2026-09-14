import '@c2n/theme/theme.css'
import './style.css'

// C2N Web Components
import '@c2n/avatar'
import '@c2n/badge'
import '@c2n/button'
import '@c2n/card'
import '@c2n/checkbox'
import '@c2n/code-viewer'
import '@c2n/header'
import '@c2n/label'
import '@c2n/link-button'
import '@c2n/list-item'
import { type Modal } from '@c2n/modal'
import '@c2n/modal'
import '@c2n/navigation-menu'
import { type Select } from '@c2n/select'
import '@c2n/select'
import '@c2n/seperator'
import '@c2n/stat'
import '@c2n/text-field'
import '@c2n/textarea'
import { toast } from '@c2n/toast'

// Feather Icons from @c2n/feather-icons
import '@c2n/feather-icons/icons/arrow-right.js'
import '@c2n/feather-icons/icons/database.js'
import '@c2n/feather-icons/icons/activity.js'
import '@c2n/feather-icons/icons/globe.js'
import '@c2n/feather-icons/icons/layers.js'
import '@c2n/feather-icons/icons/calendar.js'
import '@c2n/feather-icons/icons/trending-up.js'
import '@c2n/feather-icons/icons/shield.js'
import '@c2n/feather-icons/icons/check.js'
import '@c2n/feather-icons/icons/check-circle.js'
import '@c2n/feather-icons/icons/sliders.js'
import '@c2n/feather-icons/icons/users.js'
import '@c2n/feather-icons/icons/linkedin.js'
import '@c2n/feather-icons/icons/clock.js'
import '@c2n/feather-icons/icons/bar-chart-2.js'
import '@c2n/feather-icons/icons/zap.js'
import '@c2n/feather-icons/icons/server.js'
import '@c2n/feather-icons/icons/cpu.js'
import '@c2n/feather-icons/icons/briefcase.js'
import '@c2n/feather-icons/icons/mail.js'
import '@c2n/feather-icons/icons/user.js'
import '@c2n/feather-icons/icons/send.js'
import '@c2n/feather-icons/icons/message-square.js'

// MODAL & FORM ELEMENTS
const demoModal = document.querySelector<Modal>('#demoModal')!
const modalProduct = document.querySelector<Select>('#modalProduct')!
const demoRequestForm = document.querySelector<HTMLFormElement>('#demoRequestForm')
const modalSubmitBtn = document.querySelector('#modalSubmitBtn')!
const modalCancelBtn = document.querySelector('#modalCancelBtn')!

function openDemoModal(productValue?: string) {
  if (productValue && modalProduct) {
    modalProduct.selectedValue = productValue
  }
  demoModal?.show()
}

// ATTACH MODAL TRIGGERS
document.querySelector('#heroDemoBtn')?.addEventListener('click', () => openDemoModal())
document.querySelector('#ctaBandBtn')?.addEventListener('click', () => openDemoModal())

document.querySelector('#heroExploreBtn')?.addEventListener('click', () => {
  const el = document.getElementById('what-we-deliver')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  } else {
    window.location.href = 'fixed-income.html'
  }
})

// PRESERVE THEME PARAM ON INTERNAL LINK CLICKS (INSIDE IFRAME)
document.addEventListener('click', (event) => {
  const currentTheme = new URLSearchParams(window.location.search).get('theme')
  if (!currentTheme) return

  const path = event.composedPath()
  for (const target of path) {
    if (target instanceof HTMLAnchorElement && target.href) {
      try {
        const url = new URL(target.href, window.location.href)
        if (url.origin === window.location.origin && !url.searchParams.has('theme')) {
          url.searchParams.set('theme', currentTheme)
          target.href = url.toString()
        }
      } catch {
        // Ignore invalid URL parsing errors
      }
    }
  }
})

// PAGE-SPECIFIC SERVICE BUTTONS
document.querySelector('#refReqBtn')?.addEventListener('click', () => openDemoModal('reference'))
document.querySelector('#corpReqBtn')?.addEventListener('click', () => openDemoModal('corporate-actions'))
document.querySelector('#priceReqBtn')?.addEventListener('click', () => openDemoModal('pricing'))
document.querySelector('#erisaReqBtn')?.addEventListener('click', () => openDemoModal('erisa'))
document.querySelector('#maReqBtn')?.addEventListener('click', () => openDemoModal('matching-adjustment'))
document.querySelector('#leiReqBtn')?.addEventListener('click', () => openDemoModal('lei-mapping'))

// CONTACT PAGE FORM
const contactForm = document.querySelector<HTMLFormElement>('#contactForm')
const contactSubmitBtn = document.querySelector('#contactSubmitBtn')

contactSubmitBtn?.addEventListener('click', () => contactForm?.requestSubmit())

contactForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const data = new FormData(contactForm)
  const name = String(data.get('fullName') ?? '')
  const email = String(data.get('email') ?? '')

  toast.show({
    variant: 'success',
    heading: 'Message Dispatched',
    message: `Thank you, ${name}. Our quantitative data desk will contact ${email} promptly.`,
    duration: 6000,
  })

  contactForm.reset()
})

// CLICKABLE PRODUCT CARDS
const productCards = [
  { id: 'reference-data', url: 'fixed-income.html#reference-api' },
  { id: 'corporate-actions', url: 'fixed-income.html#corporate-actions' },
  { id: 'pricing', url: 'fixed-income.html#pricing' },
  { id: 'erisa', url: 'regulatory-intelligence.html#erisa' },
  { id: 'matching-adjustment', url: 'regulatory-intelligence.html#solvency-ma' },
  { id: 'lei-mapping', url: 'regulatory-intelligence.html#lei-mapping' },
]

for (const { id, url } of productCards) {
  document.getElementById(id)?.addEventListener('click', () => {
    const currentTheme = new URLSearchParams(window.location.search).get('theme')
    const finalUrl = currentTheme ? `${url}${url.includes('?') ? '&' : '?'}theme=${currentTheme}` : url
    window.location.href = finalUrl
  })
}

// MODAL SUBMISSION
modalCancelBtn?.addEventListener('click', () => {
  demoModal.close('cancel')
})

modalSubmitBtn?.addEventListener('click', () => demoRequestForm?.requestSubmit())

demoRequestForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const data = new FormData(demoRequestForm)
  const name = String(data.get('fullName') ?? '')
  const email = String(data.get('email') ?? '')

  demoModal.close('ok')

  toast.show({
    variant: 'success',
    heading: 'Request Submitted',
    message: `Thank you, ${name}. Our quantitative data team will contact ${email} within 24 hours.`,
    duration: 6000,
  })

  demoRequestForm.reset()
})

// HEADER SCROLL GLASS EFFECT
const siteHeader = document.getElementById('site-header')
window.addEventListener(
  'scroll',
  () => {
    if (window.scrollY > 30) {
      siteHeader?.classList.add('scrolled')
    } else {
      siteHeader?.classList.remove('scrolled')
    }
  },
  { passive: true },
)

// SCROLL REVEAL OBSERVER
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('show')
      }
    }
  },
  { threshold: 0.12 },
)

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))

// PARALLAX BLOBS ON SCROLL
window.addEventListener(
  'scroll',
  () => {
    const sy = window.scrollY
    document.querySelectorAll<HTMLElement>('.parallax-blob').forEach((el) => {
      const speed = parseFloat(el.dataset.speed || '0.3')
      el.style.transform = `translateY(${sy * speed}px)`
    })
  },
  { passive: true },
)

// PARTICLE FIELD CANVAS (Exact particle mesh from original site)
;(function initParticles() {
  const canvas = document.getElementById('particleCanvas') as HTMLCanvasElement | null
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let width = 0
  let height = 0
  interface Particle {
    x: number
    y: number
    r: number
    vx: number
    vy: number
    a: number
  }
  let particles: Particle[] = []

  function resize() {
    width = canvas!.width = canvas!.offsetWidth
    height = canvas!.height = canvas!.offsetHeight
  }

  function createParticle(): Particle {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      a: Math.random() * 0.55 + 0.25,
    }
  }

  function init() {
    resize()
    particles = Array.from({ length: 95 }, createParticle)
  }

  function animate() {
    ctx!.clearRect(0, 0, width, height)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0) p.x = width
      if (p.x > width) p.x = 0
      if (p.y < 0) p.y = height
      if (p.y > height) p.y = 0

      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx!.fillStyle = `rgba(110, 231, 255, ${p.a})`
      ctx!.fill()
    }

    const maxDistance = 85
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < maxDistance) {
          ctx!.beginPath()
          ctx!.moveTo(particles[i].x, particles[i].y)
          ctx!.lineTo(particles[j].x, particles[j].y)
          ctx!.strokeStyle = `rgba(110, 231, 255, ${0.14 * (1 - dist / maxDistance)})`
          ctx!.lineWidth = 0.6
          ctx!.stroke()
        }
      }
    }

    requestAnimationFrame(animate)
  }

  window.addEventListener('resize', resize)
  init()
  animate()
})()
