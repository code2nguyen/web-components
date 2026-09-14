import '@c2n/theme/theme.css'
import './style.css'

// C2N Web Components
import '@c2n/avatar'
import '@c2n/badge'
import '@c2n/button'
import '@c2n/card'
import { type Checkbox } from '@c2n/checkbox'
import '@c2n/checkbox'
import '@c2n/label'
import '@c2n/link-button'
import '@c2n/list-item'
import { type Modal } from '@c2n/modal'
import '@c2n/modal'
import '@c2n/navigation-menu'
import { type Select } from '@c2n/select'
import '@c2n/select'
import '@c2n/seperator'
import { type TextField } from '@c2n/text-field'
import '@c2n/text-field'
import { type Textarea } from '@c2n/textarea'
import '@c2n/textarea'
import { toast } from '@c2n/toast'
import '@c2n/tooltip'

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
const modalFullName = document.querySelector<TextField>('#modalFullName')!
const modalEmail = document.querySelector<TextField>('#modalEmail')!
const modalOrg = document.querySelector<TextField>('#modalOrg')!
const modalProduct = document.querySelector<Select>('#modalProduct')!
const modalNotes = document.querySelector<Textarea>('#modalNotes')!
const modalConsent = document.querySelector<Checkbox>('#modalConsent')!
const modalSubmitBtn = document.querySelector('#modalSubmitBtn')!
const modalCancelBtn = document.querySelector('#modalCancelBtn')!

function openDemoModal(productValue?: string) {
  if (productValue && modalProduct) {
    modalProduct.value = [productValue]
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

// SUPPORT HREF ON C2-BUTTON (SCROLL OR NAVIGATE)
document.addEventListener('click', (event) => {
  const path = event.composedPath()
  for (const target of path) {
    if (target instanceof HTMLElement && target.tagName.toLowerCase() === 'c2-button') {
      const href = target.getAttribute('href')
      if (href) {
        event.preventDefault()
        if (href.startsWith('#')) {
          const el = document.querySelector(href)
          el?.scrollIntoView({ behavior: 'smooth' })
        } else {
          const currentTheme = new URLSearchParams(window.location.search).get('theme')
          if (currentTheme && !href.includes('theme=')) {
            const separator = href.includes('?') ? '&' : '?'
            window.location.href = `${href}${separator}theme=${currentTheme}`
          } else {
            window.location.href = href
          }
        }
        return
      }
    }
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
const contactFullName = document.querySelector<TextField>('#contactFullName')
const contactEmail = document.querySelector<TextField>('#contactEmail')
const contactCompany = document.querySelector<TextField>('#contactCompany')
const contactMessage = document.querySelector<Textarea>('#contactMessage')
const contactConsent = document.querySelector<Checkbox>('#contactConsent')
const contactSubmitBtn = document.querySelector('#contactSubmitBtn')

contactSubmitBtn?.addEventListener('click', () => {
  const name = contactFullName?.value?.trim() || ''
  const email = contactEmail?.value?.trim() || ''
  const msg = contactMessage?.value?.trim() || ''

  if (!name) {
    if (contactFullName) {
      contactFullName.error = true
      contactFullName.errorText = 'Full name required'
      contactFullName.focus()
    }
    toast.show({ variant: 'error', heading: 'Missing Name', message: 'Please enter your name.' })
    return
  }

  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    if (contactEmail) {
      contactEmail.error = true
      contactEmail.errorText = 'Valid business email required'
      contactEmail.focus()
    }
    toast.show({ variant: 'error', heading: 'Invalid Email', message: 'Please provide a valid corporate email.' })
    return
  }

  if (!msg) {
    if (contactMessage) {
      contactMessage.error = true
      contactMessage.errorText = 'Message required'
      contactMessage.focus()
    }
    toast.show({ variant: 'error', heading: 'Empty Message', message: 'Please tell us about your requirements.' })
    return
  }

  if (contactConsent && !contactConsent.checked) {
    toast.show({ variant: 'warning', heading: 'Consent Required', message: 'Please accept communication terms.' })
    return
  }

  // Clear errors
  if (contactFullName) {
    contactFullName.error = false
    contactFullName.errorText = ''
  }
  if (contactEmail) {
    contactEmail.error = false
    contactEmail.errorText = ''
  }
  if (contactMessage) {
    contactMessage.error = false
    contactMessage.errorText = ''
  }

  toast.show({
    variant: 'success',
    heading: 'Message Dispatched',
    message: `Thank you, ${name}. Our quantitative data desk will contact ${email} promptly.`,
    duration: 6000,
  })

  // Clear inputs
  if (contactFullName) contactFullName.value = ''
  if (contactEmail) contactEmail.value = ''
  if (contactCompany) contactCompany.value = ''
  if (contactMessage) contactMessage.value = ''
  if (contactConsent) contactConsent.checked = false
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

modalSubmitBtn?.addEventListener('click', () => {
  const name = modalFullName?.value?.trim() || ''
  const email = modalEmail?.value?.trim() || ''

  if (!name) {
    modalFullName.error = true
    modalFullName.errorText = 'Full name is required'
    modalFullName.focus()
    toast.show({ variant: 'error', heading: 'Incomplete Field', message: 'Please provide your full name.' })
    return
  }

  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    modalEmail.error = true
    modalEmail.errorText = 'Valid corporate email required'
    modalEmail.focus()
    toast.show({ variant: 'error', heading: 'Invalid Email', message: 'Please enter a valid corporate email.' })
    return
  }

  if (!modalConsent?.checked) {
    toast.show({
      variant: 'warning',
      heading: 'Consent Required',
      message: 'Please accept communications to proceed.',
    })
    return
  }

  // Clear form errors
  modalFullName.error = false
  modalFullName.errorText = ''
  modalEmail.error = false
  modalEmail.errorText = ''

  demoModal.close('ok')

  toast.show({
    variant: 'success',
    heading: 'Request Submitted',
    message: `Thank you, ${name}. Our quantitative data team will contact ${email} within 24 hours.`,
    duration: 6000,
  })

  // Reset fields
  modalFullName.value = ''
  modalEmail.value = ''
  if (modalOrg) modalOrg.value = ''
  if (modalNotes) modalNotes.value = ''
  if (modalConsent) modalConsent.checked = false
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
