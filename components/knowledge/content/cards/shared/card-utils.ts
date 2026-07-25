// components/knowledge/content/cards/shared/card-utils.ts

export function formatRelativeDate(
  date: Date | string | null | undefined,
  emptyLabel = "Sin fecha",
) {
  if (!date) {
    return emptyLabel;
  }

  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) {
    return emptyLabel;
  }

  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60000),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function getCountLabel(
  count: number,
  singular: string,
  plural: string,
) {
  return count === 1
    ? `1 ${singular}`
    : `${count} ${plural}`;
}