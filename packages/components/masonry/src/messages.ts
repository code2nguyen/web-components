import { defineMessages } from '@c2n/core/localize.js'

type Kind = 'move' | 'resize'

const en = {
  // c2-masonry-item
  tile: 'Tile',
  move: (label: string) => `Move ${label}`,
  resize: (label: string) => `Resize ${label}`,
  content: (label: string) => `${label} content`,
  instructions: 'Press Enter or Space, use arrow keys, then press Enter to save or Escape to cancel.',
  // c2-masonry live region
  started: (label: string, kind: Kind) => `${label} ${kind} started. Use arrow keys; Enter saves and Escape cancels.`,
  position: (label: string, position: number, count: number) => `${label}: position ${position} of ${count}.`,
  size: (label: string, columns: number, rows: number, atMinimum: boolean) =>
    `${label}: ${columns} columns, ${rows} rows.${atMinimum ? ' Smallest size reached.' : ''}`,
  noChange: 'No layout change.',
  saved: (label: string, kind: Kind) => `${label} ${kind} saved.`,
  canceled: (label: string) => `${label} edit canceled.`,
}

const fr: typeof en = {
  tile: 'Tuile',
  move: (label) => `Déplacer ${label}`,
  resize: (label) => `Redimensionner ${label}`,
  content: (label) => `Contenu de ${label}`,
  instructions: 'Appuyez sur Entrée ou Espace, utilisez les flèches, puis appuyez sur Entrée pour enregistrer ou sur Échap pour annuler.',
  started: (label, kind) =>
    `${kind === 'move' ? 'Déplacement' : 'Redimensionnement'} de ${label} commencé. Utilisez les flèches\u202f; Entrée enregistre, Échap annule.`,
  position: (label, position, count) => `${label}\u202f: position ${position} sur ${count}.`,
  size: (label, columns, rows, atMinimum) =>
    `${label}\u202f: ${columns} ${columns >= 2 ? 'colonnes' : 'colonne'}, ${rows} ${rows >= 2 ? 'lignes' : 'ligne'}.${atMinimum ? ' Taille minimale atteinte.' : ''}`,
  noChange: 'Disposition inchangée.',
  saved: (label, kind) => `${kind === 'move' ? 'Déplacement' : 'Redimensionnement'} de ${label} enregistré.`,
  canceled: (label) => `Modification de ${label} annulée.`,
}

const vi: typeof en = {
  tile: 'Ô',
  move: (label) => `Di chuyển ${label}`,
  resize: (label) => `Đổi kích thước ${label}`,
  content: (label) => `Nội dung ${label}`,
  instructions: 'Nhấn Enter hoặc phím cách, dùng các phím mũi tên, rồi nhấn Enter để lưu hoặc Escape để hủy.',
  started: (label, kind) => `Bắt đầu ${kind === 'move' ? 'di chuyển' : 'đổi kích thước'} ${label}. Dùng các phím mũi tên; Enter để lưu, Escape để hủy.`,
  position: (label, position, count) => `${label}: vị trí ${position} trên ${count}.`,
  size: (label, columns, rows, atMinimum) => `${label}: ${columns} cột, ${rows} hàng.${atMinimum ? ' Đã đạt kích thước nhỏ nhất.' : ''}`,
  noChange: 'Bố cục không thay đổi.',
  saved: (label, kind) => `Đã ${kind === 'move' ? 'di chuyển' : 'đổi kích thước'} ${label}.`,
  canceled: (label) => `Đã hủy chỉnh sửa ${label}.`,
}

/** The masonry's and its tiles' interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const masonryMessages = defineMessages('masonry', en, { fr, vi })
