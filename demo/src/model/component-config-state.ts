import type { ComponentManifest } from '../store/manifest-declaration-item.ts'

export interface ComponentConfigState extends ComponentManifest {
  uid?: string
  showConfig?: boolean
  cssComponentTag?: string
  hideValues?: {
    [key: string]: string
  }
}
