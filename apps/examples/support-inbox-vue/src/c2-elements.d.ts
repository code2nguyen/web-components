/**
 * Vue template types for the c2 elements used here.
 *
 * Each package ships them generated from its custom-elements manifest, augmenting Volar's
 * `IntrinsicElementAttributes` so `strictTemplates` can stay on: a misspelt property or a handler with the wrong
 * detail type is a build error instead of an attribute that silently does nothing.
 *
 * `isCustomElement` in `vite.config.ts` is still required — that is what stops the *compiler* from resolving
 * `c2-*` as a Vue component; this file only types the tags it then emits.
 */
import '@c2n/components/vue'
import '@c2n/feather-icons/vue'
