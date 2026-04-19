export function normalizeIntegratorValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizeExternalStatusValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isOwnerStayIntegrator(integratorName: string | null | undefined) {
  const normalizedValue = normalizeIntegratorValue(integratorName);
  return normalizedValue === "own (owner staying)" || normalizedValue === "owner";
}

export function isBlackedOutIntegrator(integratorName: string | null | undefined) {
  const normalizedValue = normalizeIntegratorValue(integratorName);
  return normalizedValue === "blacked out (dates blacked out)";
}

export function isCancelledStatus(externalStatus: string | null | undefined) {
  const normalizedValue = normalizeExternalStatusValue(externalStatus);
  return (
    normalizedValue === "cancelled" ||
    normalizedValue === "canceled" ||
    normalizedValue.includes("cancelled") ||
    normalizedValue.includes("canceled")
  );
}

export function isBlockedStatus(externalStatus: string | null | undefined) {
  const normalizedValue = normalizeExternalStatusValue(externalStatus);
  return (
    normalizedValue === "blocked" ||
    normalizedValue.includes("blocked")
  );
}
