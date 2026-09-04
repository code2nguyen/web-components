export interface ComponentInstanceState {
  [key: string]: unknown
}

export interface FormState {
  [id: string]: ComponentInstanceState[]
}
