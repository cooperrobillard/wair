// src/components/NewItemDialog.tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

/**
 * Properly type the <input type="file"> value as FileList | undefined
 * and keep sourceUrl as a plain string for RHF ('' or a valid URL).
 */
const FileListSchema = z.custom<FileList>(
  (v) => typeof FileList !== 'undefined' && v instanceof FileList,
  { message: 'Invalid file' }
);

const FormSchema = z.object({
  rawInput: z.string().min(2, 'Please describe the item.'),
  // RHF wants a string; we validate '' or URL. We'll normalize '' -> undefined in onSubmit.
  sourceUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), {
      message: 'Must be a valid URL or left empty',
    }),
  image: FileListSchema.optional(), // FileList | undefined
});

type FormValues = z.infer<typeof FormSchema>;

export default function NewItemDialog() {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
  });

  const imageField = register('image');

  const onSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);

      // Normalize: empty string -> undefined
      const normalizedSourceUrl =
        values.sourceUrl && values.sourceUrl.trim() !== '' ? values.sourceUrl.trim() : undefined;

      // 1) Create item row
      const res = await fetch('/api/items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: values.rawInput,
          sourceUrl: normalizedSourceUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to create item');

      const { id, uploadPath } = (await res.json()) as { id: string; uploadPath: string };
      console.log('[NewItemDialog] created item', { id, uploadPath });

      // 2) Optional: upload image to Supabase via server route
      let publicUrl: string | undefined;
      const fileList = values.image ?? inputRef.current?.files ?? undefined;
      const file = fileList?.[0];

      if (file) {
        // keep extension sane
        const extFromName = file.name.split('.').pop()?.toLowerCase();
        const ext =
          extFromName && ['png', 'jpg', 'jpeg', 'webp'].includes(extFromName)
            ? extFromName
            : file.type.split('/')[1] || 'png';

        const pathWithExt = uploadPath.replace(/\.png$/, `.${ext}`);
        console.log('[NewItemDialog] uploading file', {
          name: file.name,
          size: file.size,
          type: file.type,
          pathWithExt,
        });

        const fd = new FormData();
        fd.append('file', file);
        fd.append('path', pathWithExt);

        const up = await fetch('/api/items/upload', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const upJson = await up.json();
        console.log('[NewItemDialog] upload response', { status: up.status, ok: up.ok, body: upJson });
        if (!up.ok) throw new Error(upJson.error || 'Upload failed');

        publicUrl = upJson.publicUrl;
        console.log('[NewItemDialog] received public URL', { publicUrl });

        // 3) Patch item with imageUrl
        const patchRes = await fetch(`/api/items/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: publicUrl }),
        });
        if (!patchRes.ok) {
          const txt = await patchRes.text();
          throw new Error(`Failed to save image URL: ${txt}`);
        }
        console.log('[NewItemDialog] patched item with image URL', { id });
      } else {
        console.log('[NewItemDialog] no file selected, skipping upload');
      }

      toast.success('Item added');
      reset();
      setOpen(false);
      // simplest refresh so the list updates without importing router
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      console.error('[NewItemDialog] submit failed', e);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-black text-white text-sm px-3 py-2 hover:opacity-90"
      >
        Add Item
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Item</h2>
              <button onClick={() => setOpen(false)} className="text-sm">
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="block text-sm font-medium">Describe the item</label>
                <textarea
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                  placeholder='e.g., "H&M hoodie, Hale Navy, M"'
                  rows={3}
                  {...register('rawInput')}
                />
                {errors.rawInput && (
                  <p className="mt-1 text-xs text-red-600">{errors.rawInput.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium">Product link (optional)</label>
                <input
                  type="url"
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                  placeholder="https://example.com/item"
                  {...register('sourceUrl')}
                />
                {errors.sourceUrl && (
                  <p className="mt-1 text-xs text-red-600">
                    {(errors.sourceUrl.message as string) || 'Invalid URL'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium">Photo (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  {...imageField}
                  ref={(el) => {
                    imageField.ref(el);
                    inputRef.current = el;
                  }}
                />
                {errors.image && (
                  <p className="mt-1 text-xs text-red-600">{String(errors.image.message)}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
