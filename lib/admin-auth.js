"use strict";

const crypto = require("node:crypto");

const COOKIE_NAME = "svrs_admin_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSignature(expiresAt, password) {
  return crypto.createHmac("sha256", password).update(String(expiresAt)).digest("base64url");
}

function isAdminRequest(request) {
  const password = process.env.GESTOR_PASSWORD;
  if (!password) return false;

  const cookieHeader = request.headers && request.headers.cookie;
  if (typeof cookieHeader !== "string") return false;
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  return constantTimeEqual(signature, sessionSignature(expiresAt, password));
}

function createSessionCookie(request, password) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const signature = sessionSignature(expiresAt, password);
  const secure = process.env.VERCEL === "1" || request.headers["x-forwarded-proto"] === "https";
  return `${COOKIE_NAME}=${expiresAt}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(request) {
  const secure = process.env.VERCEL === "1" || request.headers["x-forwarded-proto"] === "https";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sendUnauthorized(response) {
  response.statusCode = 401;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ error: "Entre no painel para realizar esta ação." }));
}

module.exports = {
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  constantTimeEqual,
  createSessionCookie,
  clearSessionCookie,
  isAdminRequest,
  sendUnauthorized
};
