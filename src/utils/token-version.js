export function getTokenVersionFromDecoded(decoded = {}) {
  return Number(decoded?.tokenVersion ?? 0);
}

export function isTokenVersionValid(decoded, user) {
  return getTokenVersionFromDecoded(decoded) === Number(user?.tokenVersion ?? 0);
}
