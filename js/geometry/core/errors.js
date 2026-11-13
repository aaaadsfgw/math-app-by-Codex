export function invalid(message) {
  return Object.assign(new Error(message), { code: "GEOMETRY_INVALID" });
}

export function inconsistent(message) {
  return Object.assign(new Error(message), { code: "GEOMETRY_INCONSISTENT" });
}

export function unsupported(message) {
  return Object.assign(new Error(message), { code: "GEOMETRY_UNSUPPORTED" });
}
