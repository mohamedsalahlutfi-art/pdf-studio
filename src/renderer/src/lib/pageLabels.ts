import type { LabelRange, LabelStyle } from './model'

function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ]
  let out = ''
  for (const [value, numeral] of table) {
    while (n >= value) {
      out += numeral
      n -= value
    }
  }
  return out
}

/** PDF letter numbering: a…z, then aa…zz, aaa… */
const toLetters = (n: number): string => String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.ceil(n / 26))

export function formatNumber(style: LabelStyle, n: number): string {
  switch (style) {
    case 'D':
      return String(n)
    case 'r':
      return toRoman(n)
    case 'R':
      return toRoman(n).toUpperCase()
    case 'a':
      return toLetters(n)
    case 'A':
      return toLetters(n).toUpperCase()
    default:
      return ''
  }
}

/** The label shown for a page, following the PDF /PageLabels rules. */
export function pageLabel(index: number, labels: LabelRange[] | null): string {
  if (!labels?.length) return String(index + 1)
  const range = [...labels].reverse().find((r) => r.startIndex <= index)
  if (!range) return String(index + 1)
  return range.prefix + formatNumber(range.style, range.start + index - range.startIndex)
}

/** Drops ranges past the end of the document and sorts by start page. */
export function normalizeLabels(labels: LabelRange[], pageCount: number): LabelRange[] {
  const byStart = new Map(labels.filter((r) => r.startIndex < pageCount).map((r) => [r.startIndex, r]))
  return [...byStart.values()].sort((a, b) => a.startIndex - b.startIndex)
}
