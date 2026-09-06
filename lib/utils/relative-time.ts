export function formatShortRelativeTime(
  value: Date | string,
) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000),
  );

  if (diffMinutes < 1) {
    return "Ahora";
  }

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "Ayer";
  }

  return `Hace ${diffDays} días`;
}
