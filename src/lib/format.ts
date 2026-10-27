export function formatDate(iso: string | null): string {
  if (!iso) return "未注明日期";
  const value = iso.length === 10 ? `${iso}T00:00:00+08:00` : iso;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function dateTimeAttr(iso: string | null): string | undefined {
  if (!iso) return undefined;
  return iso.slice(0, 10);
}
