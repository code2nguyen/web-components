import { onFirstUse } from './islands.ts'

// The dialog's components are not needed until someone asks to sign up, so they load on the first press.
const loadDialog = onFirstUse(() =>
  Promise.all([import('@c2n/components/modal'), import('@c2n/components/form-field'), import('@c2n/components/text-field'), import('@c2n/components/toast')]),
)

/** Opens the sign-up dialog from every `[data-signup]` button, and confirms with a toast when the form is sent. */
export function setUpSignup(): void {
  const dialog = document.getElementById('signup')
  const form = document.querySelector<HTMLFormElement>('#signup-form')
  const plan = document.querySelector<HTMLElement>('[data-signup-plan]')
  if (!dialog || !form) return

  document.addEventListener('click', async (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-signup]')
    if (!trigger) return
    try {
      await loadDialog()
    } catch (error) {
      // The dialog's modules did not load; a later press tries again.
      console.warn('The sign-up dialog could not load.', error)
      return
    }
    const free = (trigger.dataset.plan ?? 'starter') === 'starter'
    const name = trigger.dataset.planName ?? 'Starter'
    if (plan) plan.textContent = free ? `${name} plan · free forever` : `${name} plan · free for 14 days`
    dialog.setAttribute('open', '')
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    // The form fields show their own messages for whichever check failed.
    if (!form.reportValidity()) return
    const email = String(new FormData(form).get('email') ?? '')
    await loadDialog()
    dialog.removeAttribute('open')
    form.reset()
    // The page's own region, so its `position` applies (the `toast` helper would create a second one).
    document.querySelector('c2-toast-region')?.show({
      heading: 'Check your inbox',
      message: `We sent a sign-in link to ${email}.`,
      variant: 'success',
      duration: 6000,
      dismissible: true,
    })
  })
}
