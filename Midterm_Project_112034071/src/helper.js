import DOMPurify from "dompurify";

/**
 * Sanitize user-generated text to prevent XSS attacks.
 * Strips all HTML tags and dangerous attributes.
 */
export function sanitize(text) {
  if (typeof text !== "string") return "";
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Render sanitized text with line breaks preserved.
 * Safe to use with dangerouslySetInnerHTML.
 */
export function sanitizeWithLineBreaks(text) {
  if (typeof text !== "string") return "";
  const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return clean.replace(/\n/g, "<br/>");
}

/**
 * Format a Firestore timestamp or Date to a readable time string.
 */
export function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Generate a consistent conversation ID for two users.
 */
export function getDMId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}
