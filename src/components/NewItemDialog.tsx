// src/components/NewItemDialog.tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase';

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
  const { getToken } = useAuth();

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

      // 1️⃣ Create item row
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: values.rawInput,
          sourceUrl: values.sourceUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to create item');

      const { id, originalUploadPath, publicBase } = (await res.json()) as {
        id: string;
        originalUploadPath: string;
        publicBase: string;
      };

      // 2️⃣ Upload original image to Supabase (if provided)
      const fileList = values.image ?? undefined;
      const file = fileList?.[0];
      let originalPublicUrl: string | undefined = undefined;

      if (file) {
        const { error: upErr } = await supabase.storage
          .from('items')
          .upload(originalUploadPath, file, { upsert: true });

        if (upErr) throw upErr;

        originalPublicUrl = `${publicBase}/${originalUploadPath}`;

        // PATCH originalUrl
        const patchRes = await fetch(`/api/items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalUrl: originalPublicUrl }),
        });
        if (!patchRes.ok) throw new Error('Failed to save originalUrl');
      }

      // 3️⃣ Request background removal
      if (originalPublicUrl) {
        const token = await getToken();
        if (!token) {
          throw new Error('Unable to authenticate background removal request.');
        }

        const cleanRes = await fetch(`/api/items/${id}/clean`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!cleanRes.ok) console.warn('Background removal failed, keeping original.');
      }

      // 4️⃣ Wrap up
      toast.success('Item added');
      reset();
      setOpen(false);
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      console.error(error);
      toast.error(message);
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
