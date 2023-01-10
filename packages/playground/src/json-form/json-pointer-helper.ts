// Helper function following JSON Pointer spec : https://www.rfc-editor.org/rfc/rfc6901
import type { JSONSchema7Definition } from 'json-schema'

export function get(object: JSONSchema7Definition, pointer: string): any {}

export function validatePointer(pointer: string) {
  if (pointer === '' || pointer === '#') {
    return true
  }
  if (pointer[0] === '/' || pointer.slice(0, 2) === '#/') {
    return !/(~[^01]|~$)/g.test(pointer)
  }
  return false
}

function escape(key: string) {
  const escaped = key.toString().replace(/~/g, '~0').replace(/\//g, '~1')
  return escaped
}

function unescape(key: string) {
  const unescaped = key.toString().replace(/~1/g, '/').replace(/~0/g, '~')
  return unescaped
}
