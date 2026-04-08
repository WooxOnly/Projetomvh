import "server-only";

export const HERE_ROUTING_NOTE = "system:routing-source=here";
export const LOCAL_ROUTING_NOTE = "system:routing-source=local";
export const HERE_ROUTING_COOLDOWN_MS = 60 * 60 * 1000;

export function getHereRoutingLockedUntil(lastHereRoutingAt: Date | null) {
  if (!lastHereRoutingAt) {
    return null;
  }

  const lockedUntil = new Date(lastHereRoutingAt.getTime() + HERE_ROUTING_COOLDOWN_MS);
  return lockedUntil.getTime() > Date.now() ? lockedUntil : null;
}
