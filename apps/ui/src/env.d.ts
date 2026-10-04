/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CssCustomProperty } from 'custom-elements-manifest/schema'

declare global {
  interface ImportMetaEnv {
    /** Browser key for the Google Maps examples; see `src/data/google-maps-config.ts`. */
    readonly PUBLIC_GOOGLE_MAPS_API_KEY?: string
  }
}

declare namespace astroHTML.JSX {
  interface IntrinsicAttributes {
    [attr: string]: string | boolean | any[]
  }
}
declare module 'custom-elements-manifest/schema.ts' {
  interface CustomElement {
    internalComponents?: string[]
    slotComponents?: string[]
  }
  interface CssCustomProperty {
    type?: {
      text: string
    }
  }
}
