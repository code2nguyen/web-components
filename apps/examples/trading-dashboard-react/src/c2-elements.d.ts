/**
 * JSX types for the c2 elements used here.
 *
 * The packages declare `HTMLElementTagNameMap` (which is what `document.querySelector` reads), but JSX has its own
 * registry, so a React consumer has to map the tags once. Each package ships that mapping generated from its
 * custom-elements manifest — one side-effect import per package, mirroring the registration imports in `main.tsx`.
 *
 * Every public property of the component is accepted and typed, so a renamed or removed property breaks the build
 * here rather than silently doing nothing at runtime.
 */
import '@c2n/badge/react'
import '@c2n/button/react'
import '@c2n/card/react'
import '@c2n/list-item/react'
import '@c2n/select/react'
import '@c2n/switch/react'
import '@c2n/table/react'
import '@c2n/text-field/react'
