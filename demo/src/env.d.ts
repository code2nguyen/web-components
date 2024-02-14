/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
declare namespace astroHTML.JSX {
  interface IntrinsicAttributes {
    [attr: string]: string | boolean | any[]
  }
}
