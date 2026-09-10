export interface ManifestDataItem {
  [key: string]: string
}

export interface ManifestData {
  styles: ManifestDataItem
  attributes: ManifestDataItem
  slots: ManifestDataItem
}
