import { test, expect } from '@playwright/test'
import {
  CellError,
  SheetModel,
  columnIndex,
  columnName,
  deleteFromFormula,
  insertIntoFormula,
  parseLiteral,
  parseRange,
  rangeRef,
  shiftFormula,
  type CellValue,
} from '../src/formula'

// The engine has no DOM, so these run in the Playwright worker without a page.

function sheet(inputs: Record<string, string | number>, rows = 20, columns = 8) {
  const model = new SheetModel(rows, columns)
  model.load(Object.entries(inputs).map(([key, input]) => [key, String(input)]))
  return model
}

const errorOf = (value: CellValue) => (value instanceof CellError ? value.error : value)

test.describe('addresses', () => {
  test('converts column names both ways', () => {
    expect([0, 25, 26, 51, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ'])
    expect(['A', 'Z', 'AA', 'zz'].map(columnIndex)).toEqual([0, 25, 26, 701])
  })

  test('normalises ranges', () => {
    expect(rangeRef(parseRange('C4:A1')!)).toBe('A1:C4')
    expect(rangeRef(parseRange('$B$2')!)).toBe('B2')
    expect(parseRange('A0')).toBeUndefined()
    expect(parseRange('A1:B2:C3')).toBeUndefined()
  })
})

test.describe('literals', () => {
  test('reads numbers, percentages, currency, booleans and forced text', () => {
    expect(parseLiteral('1,234.5')).toEqual({ value: 1234.5 })
    expect(parseLiteral('-12')).toEqual({ value: -12 })
    expect(parseLiteral('10%')).toEqual({ value: 0.1, hint: 'percent' })
    expect(parseLiteral('$12')).toEqual({ value: 12, hint: 'currency' })
    expect(parseLiteral('true')).toEqual({ value: true })
    expect(parseLiteral("'42")).toEqual({ value: '42' })
    expect(parseLiteral('12 apples')).toEqual({ value: '12 apples' })
    expect(parseLiteral('  ')).toEqual({ value: null })
  })
})

test.describe('formulas', () => {
  test('follows operator precedence', () => {
    const model = sheet({ A1: '=1+2*3^2', A2: '=-2^2', A3: '=(1+2)*3', A4: '=50%*10', A5: '="a"&1+1', A6: '=1+1=2' })
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((key) => model.getValue(key))).toEqual([19, 4, 9, 5, 'a2', true])
  })

  test('reads references and ranges', () => {
    const model = sheet({ A1: 2, A2: 3, A3: 'note', B1: '=A1*A2', B2: '=SUM(A1:A3)', B3: '=AVERAGE(A1:A2)', B4: '=COUNT(A1:A3)', B5: '=COUNTA(A1:A5)' })
    expect(['B1', 'B2', 'B3', 'B4', 'B5'].map((key) => model.getValue(key))).toEqual([6, 5, 2.5, 2, 3])
  })

  test('runs every built-in function', () => {
    const model = sheet({
      A1: 4,
      A2: -1.5,
      A3: 'Food',
      A4: 'food',
      A5: 'Travel',
      B3: 10,
      B4: 20,
      B5: 30,
      C1: '=MIN(A1:A2)',
      C2: '=MAX(A1:A2)',
      C3: '=ROUND(2.345, 2)',
      C4: '=ABS(A2)',
      C5: '=IF(A1>3, "big", "small")',
      C6: '=AND(TRUE, A1>0)',
      C7: '=OR(FALSE, A1<0)',
      C8: '=NOT(FALSE)',
      D1: '=CONCAT(A3, "-", A1)',
      D2: '=LEN(A5)',
      D3: '=UPPER(A5)',
      D4: '=LOWER(A5)',
      D5: '=TRIM("  a   b ")',
      D6: '=SUMIF(A3:A5, "food", B3:B5)',
      D7: '=SUMIF(B3:B5, ">15")',
      D8: '=IFERROR(1/0, "none")',
      E1: '=ROUND(-2.5)',
    })
    const keys = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'E1']
    expect(keys.map((key) => model.getValue(key))).toEqual([
      -1.5,
      4,
      2.35,
      1.5,
      'big',
      true,
      false,
      true,
      'Food-4',
      6,
      'TRAVEL',
      'travel',
      'a b',
      30,
      50,
      'none',
      -3,
    ])
    expect(sheet({ A1: '=TODAY()' }).getValue('A1')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('shows error values', () => {
    const model = sheet({ A1: '=1/0', A2: '=FOO(1)', A3: '="ten"*2', A4: '=A4+1', A5: '=A1+1', A6: '=Z99', A7: '=1+', A8: '=price', A9: '=A1:A2' }, 20, 8)
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'].map((key) => errorOf(model.getValue(key)))).toEqual([
      '#DIV/0!',
      '#NAME?',
      '#VALUE!',
      '#CIRC!',
      '#DIV/0!',
      '#REF!',
      '#ERROR!',
      '#NAME?',
      '#VALUE!',
    ])
  })

  test('marks every cell of a cycle', () => {
    const model = sheet({ A1: '=B1+1', B1: '=C1+1', C1: '=A1+1', D1: '=A1' })
    expect(['A1', 'B1', 'C1', 'D1'].map((key) => errorOf(model.getValue(key)))).toEqual(['#CIRC!', '#CIRC!', '#CIRC!', '#CIRC!'])
  })

  test('recalculates only the cells that depend on a change', () => {
    const model = sheet({ A1: 1, A2: '=A1*2', A3: '=A2+1', B1: '=5' })
    model.getValue('A3')
    model.getValue('B1')
    expect(model.setInput('A1', '10').sort()).toEqual(['A1', 'A2', 'A3'])
    expect(model.getValue('A3')).toBe(21)
    // Rewiring a formula drops the old dependency.
    model.setInput('A2', '=B1')
    expect(model.setInput('A1', '0')).toEqual(['A1'])
    expect(model.getValue('A3')).toBe(6)
  })

  test('accepts app functions', () => {
    const model = new SheetModel(5, 5, { tax: ([amount]) => (typeof amount === 'number' ? amount * 0.2 : 0) })
    model.load([
      ['A1', '100'],
      ['A2', '=TAX(A1)'],
    ])
    expect(model.getValue('A2')).toBe(20)
  })
})

test.describe('shiftFormula', () => {
  test('moves relative references and keeps pinned ones', () => {
    expect(shiftFormula('=B2*C2', 1, 0)).toBe('=B3*C3')
    expect(shiftFormula('=$B$2*C2+B$2+$B2', 2, 1)).toBe('=$B$2*D4+C$2+$B4')
    expect(shiftFormula('=SUM(A1:A3)&"A1"', 0, 1)).toBe('=SUM(B1:B3)&"A1"')
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!')
  })
})

test.describe('deleteFromFormula', () => {
  test('moves later references back, breaks deleted ones and shrinks ranges that lose cells', () => {
    expect(deleteFromFormula('=B2*C5', 'row', 2, 1)).toBe('=B2*C4')
    expect(deleteFromFormula('=B3+$B$4', 'row', 2, 1)).toBe('=#REF!+$B$3')
    expect(deleteFromFormula('=SUM(B1:B5)', 'row', 2, 1)).toBe('=SUM(B1:B4)')
    expect(deleteFromFormula('=SUM(B3:B6)', 'row', 1, 3)).toBe('=SUM(B2:B3)')
    expect(deleteFromFormula('=SUM(B1:B4)', 'row', 2, 4)).toBe('=SUM(B1:B2)')
    expect(deleteFromFormula('=SUM(B5:B1)', 'row', 0, 1)).toBe('=SUM(B4:B1)')
    expect(deleteFromFormula('=SUM(B3:B4)', 'row', 2, 2)).toBe('=SUM(#REF!)')
    expect(deleteFromFormula('=SUM(A1:D1)&"C1"', 'column', 1, 2)).toBe('=SUM(A1:B1)&"C1"')
  })

  test('a #REF! left in a formula evaluates to #REF!, which IFERROR catches', () => {
    const model = sheet({ A1: '=#REF!+1', A2: '=IFERROR(#REF!, 0)', A3: '=SUM(#REF!)' })
    expect(errorOf(model.getValue('A1'))).toBe('#REF!')
    expect(model.getValue('A2')).toBe(0)
    expect(errorOf(model.getValue('A3'))).toBe('#REF!')
  })
})

test.describe('insertIntoFormula', () => {
  test('moves every reference past the insertion, pinned or not, and grows ranges that span it', () => {
    expect(insertIntoFormula('=B2*C5', 'row', 2, 1)).toBe('=B2*C6')
    expect(insertIntoFormula('=$B$3+B$3+$B3', 'row', 2, 2)).toBe('=$B$5+B$5+$B5')
    expect(insertIntoFormula('=SUM(B1:B5)', 'row', 2, 1)).toBe('=SUM(B1:B6)')
    expect(insertIntoFormula('=SUM(B1:B5)', 'row', 0, 1)).toBe('=SUM(B2:B6)')
    expect(insertIntoFormula('=SUM(B1:B5)', 'row', 5, 1)).toBe('=SUM(B1:B5)')
    expect(insertIntoFormula('=SUM(A1:C1)&"B1"', 'column', 1, 2)).toBe('=SUM(A1:E1)&"B1"')
    expect(insertIntoFormula('=Z1', 'column', 0, 1)).toBe('=AA1')
  })
})
