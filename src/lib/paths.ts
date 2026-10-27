export function withBase(pathname = ""): string {
  const raw = import.meta.env.BASE_URL || "/";
  const prefix = raw.endsWith("/") ? raw : `${raw}/`;
  const clean = pathname.replace(/^\/+/, "");
  return clean ? `${prefix}${clean}` : prefix;
}
