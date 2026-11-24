"use strict"

const PAYLOAD_LIMIT = 3000
let configured = false
let webpush = null
let disabled = false

function bounded (value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength)
}

function hasPushConfiguration () {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

function configure () {
  if (disabled || !hasPushConfiguration()) { return false }
  if (!configured) {
    try {
      if (!webpush) { webpush = require("web-push") }
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      )
      configured = true
    } catch (error) {
      disabled = true
      console.warn("Notificações push indisponíveis neste ambiente.", error && error.message ? error.message : error)
      return false
    }
  }
  return true
}

function buildPayload (application) {
  const role = bounded(application && application.role, 120)
  const company = bounded(application && application.company, 120)
  const city = bounded(application && application.city, 80)
  const details = [role, company, city].filter(Boolean).join(" • ")
  const body = details
    ? `Nova solicitação: ${details}. Abra o painel para revisar.`
    : "Há uma nova solicitação de vaga. Abra o painel para revisar."
  return JSON.stringify({
    title: "NOVA VAGA!",
    body: body.slice(0, PAYLOAD_LIMIT),
    icon: "/admin/icon-192.png",
    badge: "/admin/icon-192.png",
    tag: "svrs-new-application",
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url: "/admin/" }
  })
}

async function sendAll (subscriptions, payload, onExpired) {
  if (!configure()) { return { sent: 0, total: 0, skipped: true } }
  const list = Array.isArray(subscriptions) ? subscriptions : []
  const results = await Promise.all(list.map(async function (subscription) {
    try {
      await webpush.sendNotification(subscription, payload)
      return true
    } catch (error) {
      const status = error && error.statusCode
      if ((status === 404 || status === 410) && typeof onExpired === "function") {
        await onExpired(subscription.endpoint)
      } else {
        console.warn("Não foi possível enviar a notificação push.", error && error.message ? error.message : error)
      }
      return false
    }
  }))
  return { sent: results.filter(Boolean).length, total: results.length }
}

async function notifyNewApplication (application) {
  if (!hasPushConfiguration()) { return { enabled: false, sent: 0 } }
  try {
    const store = require("../api/push-subscriptions")
    const subscriptions = await store.readSubscriptions()
    if (!subscriptions.length) { return { enabled: true, sent: 0, total: 0 } }
    return await sendAll(subscriptions, buildPayload(application), store.removeSubscription)
  } catch (error) {
    console.warn("Não foi possível preparar as notificações push.", error && error.message ? error.message : error)
    return { enabled: true, sent: 0, error: true }
  }
}

module.exports = {
  buildPayload,
  hasPushConfiguration,
  notifyNewApplication,
  sendAll
}
