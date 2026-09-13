export interface Position {
  symbol: string
  name: string
  sector: string
  quantity: number
  price: number
  open: number
  volume: number
}

const SEED: Omit<Position, 'price'>[] = [
  { symbol: 'ACME', name: 'Acme Industrial', sector: 'Industrials', quantity: 1_400, open: 182.4, volume: 4_120_000 },
  { symbol: 'BLTZ', name: 'Blitz Energy', sector: 'Energy', quantity: 3_250, open: 61.15, volume: 9_840_000 },
  { symbol: 'CRTX', name: 'Cortex Systems', sector: 'Technology', quantity: 880, open: 431.9, volume: 2_310_000 },
  { symbol: 'DLTA', name: 'Delta Foods', sector: 'Consumer', quantity: 5_100, open: 27.6, volume: 12_600_000 },
  { symbol: 'EVRG', name: 'Evergreen Materials', sector: 'Materials', quantity: 2_050, open: 94.3, volume: 1_870_000 },
  { symbol: 'FRST', name: 'Forrest Pharma', sector: 'Healthcare', quantity: 1_620, open: 148.75, volume: 3_450_000 },
  { symbol: 'GRVT', name: 'Gravity Logistics', sector: 'Industrials', quantity: 940, open: 212.05, volume: 780_000 },
  { symbol: 'HLIO', name: 'Helio Semiconductors', sector: 'Technology', quantity: 2_700, open: 88.2, volume: 15_200_000 },
  { symbol: 'IONX', name: 'Ionix Utilities', sector: 'Energy', quantity: 4_400, open: 39.45, volume: 6_050_000 },
  { symbol: 'JUNO', name: 'Juno Biosciences', sector: 'Healthcare', quantity: 3_050, open: 56.8, volume: 5_300_000 },
  { symbol: 'KRTZ', name: 'Kertz Retail', sector: 'Consumer', quantity: 6_800, open: 18.95, volume: 21_400_000 },
  { symbol: 'LMNR', name: 'Luminar Optics', sector: 'Technology', quantity: 1_150, open: 305.6, volume: 1_120_000 },
]

export const SECTORS = [...new Set(SEED.map((position) => position.sector))].sort()

export const initialPositions = (): Position[] => SEED.map((position) => ({ ...position, price: position.open }))

/** One market tick: nudges every price by up to ±0.8% and bumps the traded volume. */
export function tick(positions: Position[]): Position[] {
  return positions.map((position) => {
    const drift = (Math.random() - 0.5) * 0.016
    return {
      ...position,
      price: Math.max(0.01, Number((position.price * (1 + drift)).toFixed(2))),
      volume: position.volume + Math.round(Math.random() * 40_000),
    }
  })
}

export const marketValue = (position: Position) => position.price * position.quantity
export const changePct = (position: Position) => (position.price - position.open) / position.open
