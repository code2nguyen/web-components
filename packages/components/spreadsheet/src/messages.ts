import { defineMessages } from '@c2n/core/localize.js'

const en = {
  // The field that opens in a column header to name the column.
  columnName: (column: string) => `Name of column ${column}`,

  // The totals of the selection, under the grid. Each total is a button that writes its formula under the range.
  selectToSum: 'Select cells to see their sum',
  sum: 'Sum',
  average: 'Average',
  count: 'Count',
  insertTotal: (formula: string, cell: string) => `Insert ${formula} in ${cell}`,

  // The help shown while a formula is typed.
  functions: 'Functions',
  showFunctions: 'Show the functions',
  suggestionKeys: '↑↓ choose · Tab insert',
  pointHint: 'Click or drag over cells to add them',
  result: 'Result',

  // What each built-in function takes (argument names, `[ ]` around optional ones, `…` for more) and does.
  argsSUM: 'value1, [value2, …]',
  helpSUM: 'Adds up numbers and ranges.',
  argsAVERAGE: 'value1, [value2, …]',
  helpAVERAGE: 'The average of the numbers.',
  argsCOUNT: 'value1, [value2, …]',
  helpCOUNT: 'Counts the cells that hold a number.',
  argsCOUNTA: 'value1, [value2, …]',
  helpCOUNTA: 'Counts the cells that are not empty.',
  argsMIN: 'value1, [value2, …]',
  helpMIN: 'The smallest number.',
  argsMAX: 'value1, [value2, …]',
  helpMAX: 'The largest number.',
  argsROUND: 'number, [digits]',
  helpROUND: 'Rounds a number to a number of decimal places.',
  argsABS: 'number',
  helpABS: 'The number without its sign.',
  argsIF: 'condition, then, [otherwise]',
  helpIF: 'One value when the condition holds, another when it does not.',
  argsIFERROR: 'value, fallback',
  helpIFERROR: 'The value, or the fallback when the value is an error.',
  argsSUMIF: 'range, condition, [sum_range]',
  helpSUMIF: 'Adds the numbers whose cell meets a condition, such as ">100" or "Food".',
  argsAND: 'condition1, [condition2, …]',
  helpAND: 'TRUE when every condition holds.',
  argsOR: 'condition1, [condition2, …]',
  helpOR: 'TRUE when any condition holds.',
  argsNOT: 'condition',
  helpNOT: 'TRUE when the condition does not hold.',
  argsCONCAT: 'text1, [text2, …]',
  helpCONCAT: 'Joins texts together.',
  argsLEN: 'text',
  helpLEN: 'The number of characters in a text.',
  argsUPPER: 'text',
  helpUPPER: 'The text in capital letters.',
  argsLOWER: 'text',
  helpLOWER: 'The text in small letters.',
  argsTRIM: 'text',
  helpTRIM: 'The text without extra spaces.',
  argsTODAY: '',
  helpTODAY: 'Today’s date.',
}

/** The spreadsheet's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const spreadsheetMessages = defineMessages('spreadsheet', en)
