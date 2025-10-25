'use client';

import * as React from 'react';
import { MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import NewItemDialog from '@/components/NewItemDialog';

export type UIItem = {
  id: string;
  rawInput: string | null;
  articleType: string | null;
  colorRaw: string | null;
  name: string | null;
  brand: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  originalUrl: string | null;
  createdAt: string;
};

type Props = {
  initialItems: UIItem[];
};

function formatSourceLink(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    return { href: url, label: host };
  } catch {
    return null;
  }
}

export default function ItemGrid({ initialItems }: Props) {
  const [items, setItems] = React.useState<UIItem[]>(initialItems);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const menuRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<UIItem | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  React.useEffect(() => {
    function handlePointer(event: MouseEvent | TouchEvent) {
      if (!openMenuId) return;
      const menuContainer = menuRefs.current[openMenuId];
      if (menuContainer && menuContainer.contains(event.target as Node)) {
        return;
      }
      setOpenMenuId(null);
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
    };
  }, [openMenuId]);

  React.useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  React.useEffect(() => {
    if (selectionMode) {
      setOpenMenuId(null);
    }
  }, [selectionMode]);

  const selectedCount = selectedIds.size;
  const selectedIdsArray = React.useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedIdSet = React.useMemo(() => new Set(selectedIdsArray), [selectedIdsArray]);

  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(items.map((item) => item.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items]);

  const toggleSelectionMode = React.useCallback(() => {
    setOpenMenuId(null);
    setSelectionMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedIds(new Set());
      }
      return next;
    });
  }, []);

  const toggleItemSelection = React.useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleDelete = React.useCallback(
    async (itemId: string) => {
      const wasSelected = selectedIds.has(itemId);
      let rollback: UIItem[] = [];
      setItems((prev) => {
        rollback = prev;
        return prev.filter((item) => item.id !== itemId);
      });
      setOpenMenuId(null);
      setDeletingId(itemId);

      try {
        const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
        let payload: { error?: string } | null = null;
        if (!res.ok && res.status !== 404) {
          payload = await res.json().catch(() => ({}));
          throw new Error((payload?.error as string | undefined) || 'Failed to delete item');
        }
        toast.success('Item deleted');
        if (wasSelected) {
          setSelectedIds((prev) => {
            if (!prev.has(itemId)) return prev;
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }
      } catch (error) {
        setItems(rollback);
        const message = error instanceof Error ? error.message : 'Failed to delete item';
        toast.error(message);
      } finally {
        setDeletingId((current) => (current === itemId ? null : current));
      }
    },
    [selectedIds]
  );

  const handleBulkDelete = React.useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const selectedSet = new Set(ids);
    let snapshot: UIItem[] = [];
    setItems((prev) => {
      snapshot = prev;
      return prev.filter((item) => !selectedSet.has(item.id));
    });
    setOpenMenuId(null);
    setBulkDeleting(true);

    const labelMap = new Map(
      snapshot.map((item) => {
        const label =
          item.name ||
          item.brand ||
          item.articleType ||
          item.colorRaw ||
          item.rawInput ||
          item.sourceUrl ||
          item.id;
        return [item.id, label];
      })
    );

    try {
      const res = await fetch('/api/items/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload: { error?: string; failed?: Array<{ id: string; reason?: string }> } =
        await res.json().catch(() => ({}));
      if (!res.ok) {
        setItems(snapshot);
        throw new Error((payload?.error as string | undefined) || 'Failed to delete selected items');
      }

      const deletedIds: string[] = Array.isArray(payload?.deletedIds)
        ? payload.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const missingIds: string[] = Array.isArray(payload?.missingIds)
        ? payload.missingIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];

      const deletedSet = new Set(deletedIds);
      const missingSet = new Set(missingIds);
      const failedIds = ids.filter((id) => !deletedSet.has(id) && !missingSet.has(id));

      const nextItems = snapshot.filter((item) => {
        if (!selectedSet.has(item.id)) return true;
        return failedIds.includes(item.id);
      });
      setItems(nextItems);

      if (failedIds.length > 0) {
        setSelectedIds(new Set(failedIds));
        const names = failedIds
          .map((id) => labelMap.get(id) || id)
          .slice(0, 5)
          .join(', ');
        toast.error(`Failed to delete ${failedIds.length} item(s): ${names}`);
      } else {
        setSelectedIds(new Set());
        setSelectionMode(false);
        const count = deletedIds.length;
        if (count > 0) {
          toast.success(`Deleted ${count} item${count === 1 ? '' : 's'}`);
        }
        if (missingIds.length > 0) {
          const names = missingIds
            .map((id) => labelMap.get(id) || id)
            .slice(0, 5)
            .join(', ');
          toast.message(
            missingIds.length > 1
              ? `Already removed: ${names}`
              : `Already removed: ${names || 'selected item'}`
          );
        }
      }

      if (payload?.storageError && typeof payload.storageError === 'string') {
        const warningMessage = 'Items deleted but storage cleanup failed';
        const toastWithWarning = toast as typeof toast & { warning?: (message: string) => void };
        if (typeof toastWithWarning.warning === 'function') {
          toastWithWarning.warning(warningMessage);
        } else {
          toast.message(warningMessage);
        }
        console.error('[bulk delete] storage cleanup issue', payload.storageError);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete selected items';
      toast.error(message);
      setItems(snapshot);
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds]);

  const handleEdit = React.useCallback((item: UIItem) => {
    setEditingItem(item);
    setEditOpen(true);
    setOpenMenuId(null);
  }, []);

  return (
    <>
      <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={toggleSelectionMode}
          className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
        >
          {selectionMode ? 'Cancel select' : 'Select'}
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={() => {
              void handleBulkDelete();
            }}
            disabled={bulkDeleting}
            className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkDeleting
              ? 'Deleting...'
              : `Delete selected (${selectedCount})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items yet. Click “Add Item” to create your first piece.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item) => {
            const isSelected = selectedIdSet.has(item.id);
            const displayImage = item.imageUrl ?? item.originalUrl;
            const displayName = item.name && item.name.trim().length ? item.name.trim() : 'Untitled';
            const displayBrand = item.brand && item.brand.trim().length ? item.brand.trim() : undefined;
            const displayArticle = item.articleType && item.articleType.trim().length ? item.articleType.trim() : '—';
            const displayColor = item.colorRaw && item.colorRaw.trim().length ? item.colorRaw.trim() : undefined;
            return (
              <li
                key={item.id}
                className={`relative rounded-xl border p-3 ${
                  isSelected ? 'ring-2 ring-red-500' : ''
                }`}
                onClick={() => {
                  if (selectionMode) {
                    toggleItemSelection(item.id);
                  }
                }}
              >
                {(selectionMode || isSelected) && (
                  <label
                    className="absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded bg-white shadow"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleItemSelection(item.id);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      className="h-4 w-4 accent-red-600"
                    />
                  </label>
                )}

                {!selectionMode && (
                  <div
                    ref={(node) => {
                      if (node) {
                        menuRefs.current[item.id] = node;
                      } else {
                        delete menuRefs.current[item.id];
                      }
                    }}
                    className="absolute right-2 top-2 z-10"
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((current) => (current === item.id ? null : item.id));
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {openMenuId === item.id && (
                      <div className="mt-2 w-36 rounded-md border bg-white py-1 text-sm shadow-lg">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(item);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                        >
                          Edit
                        </button>
                        <div className="my-1 h-px bg-muted" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(item.id);
                          }}
                          disabled={deletingId === item.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {displayImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayImage}
                    alt="Item"
                    className="aspect-[4/5] w-full rounded-lg border object-cover"
                  />
                ) : (
                  <div className="grid aspect-[4/5] w-full place-items-center rounded-lg border text-xs text-muted-foreground">
                    No image
                  </div>
                )}

                <div className="mt-2 space-y-1">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold leading-tight line-clamp-2">
                      {displayName}
                      {displayBrand ? (
                        <span className="text-muted-foreground"> · {displayBrand}</span>
                      ) : null}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {displayArticle}
                      {displayColor ? ` · ${displayColor}` : ''}
                    </p>
                  </div>
                  {(() => {
                    const formatted = formatSourceLink(item.sourceUrl);
                    if (!formatted) return null;
                    return (
                      <a
                        href={formatted.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        {formatted.label}
                      </a>
                    );
                  })()}
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
      <NewItemDialog
        mode="edit"
        open={editOpen}
        onOpenChange={(value) => {
          setEditOpen(value);
          if (!value) setEditingItem(null);
        }}
        initial={editingItem ? {
          id: editingItem.id,
          rawInput: editingItem.rawInput,
          name: editingItem.name,
          brand: editingItem.brand,
          articleType: editingItem.articleType,
          colorRaw: editingItem.colorRaw,
          sourceUrl: editingItem.sourceUrl,
          imageUrl: editingItem.imageUrl,
          originalUrl: editingItem.originalUrl,
        } : null}
      />
    </>
  );
}
