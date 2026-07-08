import type { LibraryItem } from "./types";

export function buildLibraryTree(libraries: any[]): LibraryItem[] {
  const map = new Map<string, LibraryItem>();

  libraries.forEach((library) => {
    map.set(library.id, {
      id: library.id,
      name: library.name,
      isExpanded: false,
      children: [],
    });
  });

  const roots: LibraryItem[] = [];

  libraries.forEach((library) => {
    const node = map.get(library.id)!;

    if (library.parent_id) {
      const parent = map.get(library.parent_id);

      if (parent) {
        parent.children!.push(node);
        return;
      }
    }

    roots.push(node);
  });

  return roots;
}

export function renameLibrary(
  items: LibraryItem[],
  id: string,
  name: string,
): LibraryItem[] {
  return items.map((library) => {
    if (library.id === id) {
      return {
        ...library,
        name,
      };
    }

    if (library.children?.length) {
      return {
        ...library,
        children: renameLibrary(library.children, id, name),
      };
    }

    return library;
  });
}

export function toggleLibrary(
  items: LibraryItem[],
  id: string,
): LibraryItem[] {
  return items.map((library) => {
    if (library.id === id) {
      return {
        ...library,
        isExpanded: !library.isExpanded,
      };
    }

    if (library.children?.length) {
      return {
        ...library,
        children: toggleLibrary(library.children, id),
      };
    }

    return library;
  });
}

export function startRename(
  items: LibraryItem[],
  id: string,
): LibraryItem[] {
  return items.map((library) => {
    if (library.id === id) {
      return {
        ...library,
        isEditing: true,
      };
    }

    if (library.children?.length) {
      return {
        ...library,
        children: startRename(library.children, id),
      };
    }

    return library;
  });
}

export function saveLibraries(
  items: LibraryItem[],
): LibraryItem[] {
  return items.map((library) => ({
    ...library,
    name: library.name.trim() || "Nueva biblioteca",
    isEditing: false,
    children: library.children?.length
      ? saveLibraries(library.children)
      : library.children,
  }));
}

export function deleteLibrary(
  items: LibraryItem[],
  id: string,
): LibraryItem[] {
  return items
    .filter((library) => library.id !== id)
    .map((library) => ({
      ...library,
      children: library.children?.length
        ? deleteLibrary(library.children, id)
        : library.children,
    }));
}

export function findLibraryById(
  items: LibraryItem[],
  id: string,
): LibraryItem | undefined {
  for (const library of items) {
    if (library.id === id) {
      return library;
    }

    if (library.children?.length) {
      const found = findLibraryById(
        library.children,
        id,
      );

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function getLibraryPath(
  libraries: LibraryItem[],
  libraryId: string | null,
): LibraryItem[] {
  if (!libraryId) {
    return [];
  }

  function search(
    items: LibraryItem[],
    parents: LibraryItem[],
  ): LibraryItem[] | null {
    for (const item of items) {
      const currentPath = [...parents, item];

      if (item.id === libraryId) {
        return currentPath;
      }

      if (item.children?.length) {
        const result = search(
          item.children,
          currentPath,
        );

        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return search(libraries, []) ?? [];
}