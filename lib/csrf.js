"use strict"

function isSameOriginRequest (request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (!host) { return false }
  if (origin) {
    try {
      const originUrl = new URL(origin)
      return originUrl.host === host
    } catch {
      return false
    }
  }
  return true
}

module.exports = { isSameOriginRequest }
