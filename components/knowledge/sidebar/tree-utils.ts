// components/knowledge/sidebar/tree-utils.ts
import type { LibraryItem } from "./types";

export function buildLibraryTree(libraries: any[]): LibraryItem[] {
  const map = new Map<string, LibraryItem>();

  libraries.forEach((library) => {
    map.set(library.id, {
      id: library.id,
      name: library.name,
      isExpanded: false,
      is_shared: Boolean(library.is_shared),
      is_team_shared: Boolean(
        library.knowledge_library_team_permissions?.length,
      ),
      children: [],
    });
  });

  const roots: LibraryItem[] = [];

  libraries.forEach((library) => {
    const node = map.get(library.id);

    if (!node) {
      return;
    }

    if (library.parent_id) {
      const parent = map.get(library.parent_id);

      if (parent) {
        parent.children?.push(node);
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

export function saveLibraries(items: LibraryItem[]): LibraryItem[] {
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
      const found = findLibraryById(library.children, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function libraryContainsId(
  library: LibraryItem,
  id: string,
): boolean {
  if (library.id === id) {
    return true;
  }

  for (const child of library.children ?? []) {
    if (libraryContainsId(child, id)) {
      return true;
    }
  }

  return false;
}

function removeLibraryNode(
  items: LibraryItem[],
  id: string,
): {
  items: LibraryItem[];
  removed: LibraryItem | null;
} {
  let removed: LibraryItem | null = null;
  const nextItems: LibraryItem[] = [];

  for (const item of items) {
    if (item.id === id) {
      removed = item;
      continue;
    }

    if (item.children?.length) {
      const childResult = removeLibraryNode(item.children, id);

      if (childResult.removed) {
        removed = childResult.removed;
      }

      nextItems.push({
        ...item,
        children: childResult.items,
      });

      continue;
    }

    nextItems.push(item);
  }

  return {
    items: nextItems,
    removed,
  };
}

function insertLibraryNode(
  items: LibraryItem[],
  parentId: string | null,
  library: LibraryItem,
): LibraryItem[] {
  if (!parentId) {
    return [...items, library];
  }

  return items.map((item) => {
    if (item.id === parentId) {
      return {
        ...item,
        isExpanded: true,
        children: [...(item.children ?? []), library],
      };
    }

    if (item.children?.length) {
      return {
        ...item,
        children: insertLibraryNode(
          item.children,
          parentId,
          library,
        ),
      };
    }

    return item;
  });
}

export function moveLibraryNode(
  items: LibraryItem[],
  libraryId: string,
  parentId: string | null,
): LibraryItem[] {
  const library = findLibraryById(items, libraryId);

  if (!library) {
    return items;
  }

  if (parentId && libraryContainsId(library, parentId)) {
    return items;
  }

  const result = removeLibraryNode(items, libraryId);

  if (!result.removed) {
    return items;
  }

  return insertLibraryNode(
    result.items,
    parentId,
    result.removed,
  );
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
        const result = search(item.children, currentPath);

        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return search(libraries, []) ?? [];
}