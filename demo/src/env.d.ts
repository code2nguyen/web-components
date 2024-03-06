/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CssCustomProperty } from 'custom-elements-manifest/schema'

declare namespace astroHTML.JSX {
  interface IntrinsicAttributes {
    [attr: string]: string | boolean | any[]
  }
}
declare module 'custom-elements-manifest/schema' {
  interface CssCustomProperty {
    type?: {
      text: string
    }
  }
}
