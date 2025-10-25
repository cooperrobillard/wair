// src/components/NewItemDialog.tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { CANON_ARTICLES, CANON_COLORS, normalizeMultiColor, normalizeToCanonArticle } from '@/lib/normalize';
import { normalizeProductText, parseFreeform, parseFromProduct } from '@/lib/freeform-parse';

const IS_DEV = process.env.NODE_ENV === 'development';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB cap for uploads
const AI_CONFIDENCE_THRESHOLD = 0.6;
const SUPABASE_ITEMS_BASE =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`
    : null;
const STORAGE_MARKER = '/storage/v1/object/public/items/';

const extractStoragePath = (url?: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const idx = parsed.href.indexOf(STORAGE_MARKER);
    if (idx >= 0) {
      return parsed.href.slice(idx + STORAGE_MARKER.length);
    }
  } catch {
    // ignore parsing issues
  }
  if (url.includes(STORAGE_MARKER)) {
    return url.slice(url.indexOf(STORAGE_MARKER) + STORAGE_MARKER.length);
  }
  return null;
};

type UploadConfig = { originalUploadPath: string; publicBase: string };

const deriveUploadConfigFromUrl = (url?: string | null): UploadConfig | null => {
  const path = extractStoragePath(url);
  const base = SUPABASE_ITEMS_BASE;
  if (path && base) {
    return { originalUploadPath: path, publicBase: base };
  }
  return null;
};

type DialogInitial = {
  id: string;
  rawInput?: string | null;
  name?: string | null;
  brand?: string | null;
  articleType?: string | null;
  colorRaw?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  originalUrl?: string | null;
};

type NewItemDialogProps = {
  mode?: 'create' | 'edit';
  initial?: DialogInitial | null;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
};

const SourceUrlSchema = z
  .string()
  .trim()
  .optional()
  .refine((v) => v === undefined || v === '' || /^https?:\/\/\S+$/i.test(v), {
    message: 'Must be a valid URL or left empty',
  })
  .transform((v) => (v && v.length > 0 ? v : undefined));

const FormSchema = z.object({
  rawInput: z.string().min(2, 'Please describe the item.'),
  sourceUrl: SourceUrlSchema,
});

export default function NewItemDialog({
  mode = 'create',
  initial = null,
  open: controlledOpen,
  onOpenChange,
}: NewItemDialogProps = {}) {
  const isControlled = typeof controlledOpen === 'boolean';
  const [internalOpen, setInternalOpen] = React.useState<boolean>(controlledOpen ?? false);
  React.useEffect(() => {
    if (isControlled) {
      setInternalOpen(controlledOpen ?? false);
    }
  }, [controlledOpen, isControlled]);
  const open = isControlled ? Boolean(controlledOpen) : internalOpen;
  const setDialogOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [urlCreating, setUrlCreating] = React.useState(false);
  const [previewImg, setPreviewImg] = React.useState<string | null>(null);
  const previewImgRef = React.useRef<string | null>(null);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [fetchHint, setFetchHint] = React.useState<string | null>(null);
  const [productImages, setProductImages] = React.useState<string[]>([]);
  const [customImageUrl, setCustomImageUrl] = React.useState('');
  const [replacingImage, setReplacingImage] = React.useState(false);
  const [finalized, setFinalized] = React.useState(false);
  const [parsedType, setParsedType] = React.useState<string>('');
  const [parsedColor, setParsedColor] = React.useState<string>('');
  const finalizedRef = React.useRef(false);
  const creatingDraftRef = React.useRef<Promise<string> | null>(null);
  const uploadConfigRef = React.useRef<UploadConfig | null>(null);
  const setUploadConfig = React.useCallback((config: UploadConfig | null) => {
    uploadConfigRef.current = config;
  }, []);
  const currentOriginalUrlRef = React.useRef<string | null>(null);
  const setCurrentOriginalUrl = React.useCallback((url: string | null) => {
    currentOriginalUrlRef.current = url;
  }, []);
  const [itemName, setItemName] = React.useState('');
  const [itemBrand, setItemBrand] = React.useState('');
  const [typeConfidence, setTypeConfidence] = React.useState(0);
  const [colorConfidence, setColorConfidence] = React.useState(0);
  const [aiRunning, setAiRunning] = React.useState(false);
  const [colorPrimary, setColorPrimary] = React.useState('');
  const [colorSecondary, setColorSecondary] = React.useState('');
  const [allowSecondColor, setAllowSecondColor] = React.useState(false);
  const applyColorValue = React.useCallback(
    (value: string | null | undefined) => {
      const canonical = value ? normalizeMultiColor(value) : null;
      const parts = canonical ? canonical.split(' / ') : [];
      setParsedColor(canonical ?? '');
      setColorPrimary(parts[0] ?? '');
      setColorSecondary(parts[1] ?? '');
      setAllowSecondColor((prev) => {
        if (!canonical) return false;
        if (parts.length > 1) return true;
        return prev;
      });
      if (!canonical) {
        setColorConfidence(0);
      }
      return canonical;
    },
    [setColorConfidence]
  );

  const [forceBrowserless, setForceBrowserless] = React.useState(false);
  const [scrapePathUsed, setScrapePathUsed] = React.useState<string | null>(null);
  const [stagedFile, setStagedFile] = React.useState<File | null>(null);
  const [stagedRemoteUrl, setStagedRemoteUrl] = React.useState<string | null>(null);
  const [stagedName, setStagedName] = React.useState<string | null>(null);
  const [stagedBrand, setStagedBrand] = React.useState<string | null>(null);
  const [stagedColor, setStagedColor] = React.useState<string | null>(null);
  const [stagedSourceUrl, setStagedSourceUrl] = React.useState<string | null>(null);

  const resetFetchedFromUrlState = React.useCallback(() => {
    setCreatedId(null);
    setFinalized(false);
    setPreviewImg(null);
    setFetchHint(null);
    setProductImages([]);
    setCustomImageUrl('');
    setParsedType('');
    applyColorValue(null);
    setCurrentOriginalUrl(null);
    setUploadConfig(null);
    setTypeConfidence(0);
    setColorConfidence(0);
    setItemName('');
    setItemBrand('');
    setAiRunning(false);
    setScrapePathUsed(null);
    setStagedFile(null);
    setStagedRemoteUrl(null);
    setStagedName(null);
    setStagedBrand(null);
    setStagedColor(null);
    setStagedSourceUrl(null);
  }, [
    applyColorValue,
    setCurrentOriginalUrl,
    setUploadConfig,
  ]);

  const updateColorSelections = React.useCallback(
    (primary: string, secondary: string) => {
      const values = [primary, secondary].filter((value) => value && value.length);
      if (values.length === 0) {
        applyColorValue(null);
        return;
      }
      const joined = values.join(' / ');
      const canonical = normalizeMultiColor(joined) ?? joined;
      applyColorValue(canonical);
      setColorConfidence(0.9);
    },
    [applyColorValue, setColorConfidence]
  );

  const mergeWithParsed = React.useCallback(
    (raw: string, overrides?: { type?: string; color?: string }) => {
      const trimmed = raw.trim();
      const additions: string[] = [];

      const addValue = (value: string) => {
        if (!value) return;
        const pattern = value.replace(/[-\s]+/g, '[-\\s]*');
        const regex = new RegExp(`\\b${pattern}\\b`, 'i');
        if (!regex.test(trimmed)) additions.push(value);
      };

      addValue(overrides?.type ?? parsedType);
      addValue(overrides?.color ?? parsedColor);

      if (!additions.length) return trimmed || raw;

      if (!trimmed) return additions.join(', ');
      const suffix = additions.join(', ');
      return `${trimmed}${trimmed.endsWith(',') ? ' ' : ', '}${suffix}`;
    },
    [parsedType, parsedColor]
  );


  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      rawInput: '',
      sourceUrl: '',
    },
  });

  React.useEffect(() => {
    if (!open) {
      const pendingPreview = previewImgRef.current;
      if (pendingPreview && pendingPreview.startsWith('blob:')) {
        URL.revokeObjectURL(pendingPreview);
      }
      setPreviewImg(null);
      setCreatedId(mode === 'edit' ? initial?.id ?? null : null);
      setUrlCreating(false);
      setFetchHint(null);
      setProductImages([]);
      setCustomImageUrl('');
      setReplacingImage(false);
      setParsedType('');
      applyColorValue(null);
      setFinalized(false);
      creatingDraftRef.current = null;
      setUploadConfig(null);
      setCurrentOriginalUrl(null);
      setItemName('');
      setItemBrand('');
      setTypeConfidence(0);
      setColorConfidence(0);
      setAiRunning(false);
      setColorPrimary('');
      setColorSecondary('');
      setAllowSecondColor(false);
      reset();
      setStagedFile(null);
      setStagedRemoteUrl(null);
      setStagedName(null);
      setStagedBrand(null);
      setStagedColor(null);
      setStagedSourceUrl(null);
      return;
    }

    setFinalized(false);

    if (mode === 'edit' && initial) {
      setCreatedId(initial.id);
      const canonicalType = initial.articleType
        ? normalizeToCanonArticle(initial.articleType) ?? initial.articleType
        : '';
      setParsedType(canonicalType ?? '');
      setTypeConfidence(canonicalType ? 1 : 0);
      const canonicalColor = applyColorValue(initial.colorRaw ?? null);
      if (canonicalColor) {
        setColorConfidence(1);
      } else {
        setColorConfidence(0);
      }
      setAllowSecondColor(canonicalColor ? canonicalColor.includes(' / ') : false);
      setItemName(initial.name ?? '');
      setItemBrand(initial.brand ?? '');
      setPreviewImg(initial.imageUrl ?? initial.originalUrl ?? null);
      setCurrentOriginalUrl(initial.originalUrl ?? initial.imageUrl ?? null);
      setUploadConfig(deriveUploadConfigFromUrl(initial.originalUrl ?? initial.imageUrl ?? null));
      const fallbackRawInput =
        initial.rawInput ??
        [initial.brand, initial.name].filter((value): value is string => Boolean(value && value.trim())).join(' ');
      setValue('rawInput', fallbackRawInput && fallbackRawInput.length >= 2 ? fallbackRawInput : 'Updated item');
      setValue('sourceUrl', initial.sourceUrl ?? '');
      return;
    }

    // create mode defaults when opening
    setParsedType('');
    applyColorValue(null);
    setItemName('');
    setItemBrand('');
    setTypeConfidence(0);
    setColorConfidence(0);
    setCreatedId(null);
    setPreviewImg(null);
    setValue('rawInput', '');
    setValue('sourceUrl', '');
  }, [open, mode, initial, applyColorValue, reset, setValue, setUploadConfig, setCurrentOriginalUrl]);
  React.useEffect(() => {
    finalizedRef.current = finalized;
  }, [finalized]);
  React.useEffect(() => {
    previewImgRef.current = previewImg;
  }, [previewImg]);
  React.useEffect(() => {
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [open]);

  const onSubmit = async (values: { rawInput: string; sourceUrl?: string }) => {
    try {
      setSubmitting(true);

      const mergedRawInput = mergeWithParsed(values.rawInput);
      setValue('rawInput', mergedRawInput, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const trimmedArticleType = (parsedType ?? '').trim();
      const trimmedColor = (parsedColor ?? '').trim();
      const trimmedName = itemName.trim();
      const trimmedBrand = itemBrand.trim();

      const canonicalArticle = trimmedArticleType ? normalizeToCanonArticle(trimmedArticleType) ?? undefined : undefined;
      const canonicalColor = trimmedColor ? normalizeMultiColor(trimmedColor) ?? undefined : undefined;

      if (mode === 'edit' && initial?.id) {
        const payload: Record<string, string | undefined> = {
          name: trimmedName || undefined,
          brand: trimmedBrand || undefined,
          articleType: canonicalArticle,
          colorRaw: canonicalColor,
          sourceUrl: values.sourceUrl ? values.sourceUrl : undefined,
          rawInput: mergedRawInput,
        };

        const res = await fetch(`/api/items/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error((errorPayload?.error as string | undefined) ?? 'Failed to update item');
        }

        finalizedRef.current = true;
        toast.success('Item updated');
        setDialogOpen(false);
        window.location.reload();
        return;
      }

      const createRes = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: mergedRawInput,
          sourceUrl: stagedSourceUrl ?? values.sourceUrl ?? undefined,
        }),
      });
      const createPayload = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error((createPayload?.error as string | undefined) ?? 'Failed to create item');
      }
      const { id, originalUploadPath, publicBase } = createPayload as {
        id: string;
        originalUploadPath: string;
        publicBase: string;
      };

      let originalPublicUrl: string | null = null;

      if (stagedFile) {
        const { error: uploadError } = await supabase.storage
          .from('items')
          .upload(originalUploadPath, stagedFile, { upsert: true });
        if (uploadError) {
          throw new Error(uploadError.message || 'Failed to upload image');
        }
        originalPublicUrl = `${publicBase}/${originalUploadPath}`;
        await fetch(`/api/items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalUrl: originalPublicUrl }),
        }).catch(() => null);
      } else if (stagedRemoteUrl) {
        const remoteRes = await fetch(`/api/items/${id}/upload-remote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: stagedRemoteUrl }),
        });
        const remotePayload = await remoteRes.json().catch(() => ({}));
        if (!remoteRes.ok) {
          throw new Error((remotePayload?.error as string | undefined) || 'Failed to copy remote image');
        }
        originalPublicUrl = typeof remotePayload?.originalUrl === 'string' ? remotePayload.originalUrl : null;
      }

      if (originalPublicUrl) {
        try {
          const cleanRes = await fetch(`/api/items/${id}/clean`, { method: 'POST' });
          const cleanPayload = await cleanRes.json().catch(() => ({}));
          if (cleanRes.ok) {
            const message = typeof cleanPayload?.message === 'string' ? cleanPayload.message : null;
            if (message) toast.message(message);
          }
        } catch (error) {
          console.error('Clean image failed', error);
        }
      }

      const aiNeed = ['name', 'brand', 'type', 'color'];
      let aiResult: Record<string, string | undefined> = {};
      try {
        const aiRes = await fetch('/api/ai-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: mergedRawInput,
            need: aiNeed,
            hints: {
              name: stagedName ?? undefined,
              brand: stagedBrand ?? undefined,
              color: stagedColor ?? undefined,
            },
          }),
        });
        if (aiRes.ok) {
          const aiPayload = await aiRes.json().catch(() => ({}));
          aiResult = (aiPayload?.result ?? {}) as Record<string, string | undefined>;
        }
      } catch (error) {
        console.error('AI enrichment failed', error);
      }

      const finalPatch: Record<string, string | undefined> = {};

      const applyArticle = (value?: string) => {
        const canonical = value ? normalizeToCanonArticle(value) ?? undefined : undefined;
        if (canonical) {
          finalPatch.articleType = canonical;
        }
      };
      const applyColor = (value?: string) => {
        const canonical = value ? normalizeMultiColor(value) ?? undefined : undefined;
        if (canonical) {
          finalPatch.colorRaw = canonical;
        }
      };

      if (aiResult.name && aiResult.name.trim()) finalPatch.name = aiResult.name.trim();
      if (aiResult.brand && aiResult.brand.trim()) finalPatch.brand = aiResult.brand.trim();
      if (aiResult.type) applyArticle(aiResult.type);
      if (aiResult.color) applyColor(aiResult.color);

      if (trimmedName) {
        finalPatch.name = trimmedName;
      } else if (stagedName) {
        finalPatch.name = stagedName;
      }
      if (trimmedBrand) {
        finalPatch.brand = trimmedBrand;
      } else if (stagedBrand) {
        finalPatch.brand = stagedBrand;
      }
      if (canonicalArticle) {
        finalPatch.articleType = canonicalArticle;
      }
      if (canonicalColor) {
        finalPatch.colorRaw = canonicalColor;
      } else if (stagedColor) {
        applyColor(stagedColor);
      }
      const sourceToPersist = stagedSourceUrl ?? values.sourceUrl;
      if (sourceToPersist) {
        finalPatch.sourceUrl = sourceToPersist;
      }

      if (Object.keys(finalPatch).length > 0) {
        await fetch(`/api/items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalPatch),
        }).catch(() => null);
      }

      toast.success('Item saved');
      reset();
      if (previewImg && previewImg.startsWith('blob:')) {
        URL.revokeObjectURL(previewImg);
      }
      setPreviewImg(null);
      setProductImages([]);
      setCustomImageUrl('');
      setStagedFile(null);
      setStagedRemoteUrl(null);
      setStagedName(null);
      setStagedBrand(null);
      setStagedColor(null);
      setStagedSourceUrl(null);
      setDialogOpen(false);
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      console.error(error);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchFromUrl = async () => {
    if (mode === 'edit') {
      toast.message('Fetch from link is available only when adding new items.');
      return;
    }
    const raw = getValues('sourceUrl');
    const url = typeof raw === 'string' ? raw.trim() : raw;
    if (!url) {
      toast.message('Enter a product link first');
      return;
    }

    try {
      setUrlCreating(true);
      setFetchHint(null);
      setStagedSourceUrl(url);
      const payload = forceBrowserless ? { url, force: 'browserless' } : { url };
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const payloadJson = await res.json().catch(() => null);
      if (!res.ok) {
        const errorCode = typeof payloadJson?.error === 'string' ? payloadJson.error : '';
        if (res.status === 404) {
          toast.error('Scraper API not found. Restart dev or check /api/scrape route.');
        } else if (res.status === 502) {
          if (errorCode === 'browserless_403') {
            toast.error(
              'Browserless returned 403 (bad token / no credits / plan limits). Direct fetch works for many sites—try turning off Force Browserless.'
            );
          } else {
            toast.error('This site blocked scraping. Paste a short description or add an image URL.');
          }
        } else {
          toast.error(errorCode || 'Could not scrape link');
        }
        resetFetchedFromUrlState();
        return;
      }

      const prod = (payloadJson?.product ?? {}) as {
        brand?: string;
        name?: string;
        colorRaw?: string;
        type?: string;
        imageUrl?: string;
        images?: string[];
        description?: string;
        title?: string;
      };

      if (IS_DEV && typeof payloadJson?.pathUsed === 'string') {
        console.info('[scrape] path:', payloadJson.pathUsed);
        setScrapePathUsed(payloadJson.pathUsed);
      } else {
        setScrapePathUsed(null);
      }

      const hadFile = Boolean(stagedFile);

      const remoteCandidates = Array.from(
        new Set(
          [
            ...(Array.isArray(prod.images) ? prod.images : []),
            prod.imageUrl,
          ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
        )
      );

      setStagedFile(null);
      setStagedName(prod.name ?? null);
      setStagedBrand(prod.brand ?? null);
      setStagedColor(prod.colorRaw ?? null);
      setProductImages(remoteCandidates);
      setCustomImageUrl('');

      const firstRemote = remoteCandidates[0] ?? null;
      setStagedRemoteUrl(firstRemote);
      if (!hadFile) {
        setPreviewImg(firstRemote);
      }

      const parsedAttrs = parseFromProduct(prod);
      setParsedType(parsedAttrs.type ?? '');
      setAllowSecondColor(false);
      applyColorValue(parsedAttrs.color ?? null);
      setTypeConfidence(parsedAttrs.confidence.type ?? 0);
      setColorConfidence(parsedAttrs.confidence.color ?? 0);
      setItemName(prod.name ?? '');
      setItemBrand(prod.brand ?? '');

      const normalizedName = prod.name ? normalizeProductText(prod.name) : prod.name;
      const seedBase = [prod.brand, normalizedName, prod.colorRaw, prod.type]
        .filter(Boolean)
        .join(', ');
      const mergedSeed = mergeWithParsed(seedBase, parsedAttrs);
      const targetSeed = mergedSeed || seedBase;

      if (targetSeed) {
        setValue('rawInput', targetSeed, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setFetchHint(null);
      } else {
        setFetchHint("Couldn't parse details—please add a short description.");
      }

      const aiTextParts = [
        prod.brand,
        prod.name,
        prod.title,
        prod.description,
        prod.colorRaw,
        prod.type,
        targetSeed,
      ].filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0);

      const aiText = aiTextParts.join(' ');

      await runAiEnrichment(aiText, {
        type: parsedAttrs.type ?? '',
        typeConfidence: parsedAttrs.confidence.type ?? 0,
        color: parsedAttrs.color ?? '',
        colorConfidence: parsedAttrs.confidence.color ?? 0,
      });

      toast.success('Fetched details from link');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fetch failed';
      console.error(error);
      toast.error(message);
      resetFetchedFromUrlState();
    } finally {
      setUrlCreating(false);
    }
  };

  const ensureItemDraft = React.useCallback(async () => {
    if (createdId) {
      if (!uploadConfigRef.current) {
        const derived = deriveUploadConfigFromUrl(currentOriginalUrlRef.current);
        if (derived) setUploadConfig(derived);
      }
      return createdId;
    }
    if (creatingDraftRef.current) {
      try {
        return await creatingDraftRef.current;
      } catch (error) {
        throw error;
      }
    }

    const createPromise = (async () => {
      const values = getValues();
      const baseRawInput = values.rawInput ?? '';
      const mergedRawInput = mergeWithParsed(baseRawInput);
      const payloadRawInput = mergedRawInput.trim().length
        ? mergedRawInput
        : baseRawInput.trim().length
        ? baseRawInput
        : 'Untitled item';

      if (mergedRawInput !== baseRawInput) {
        setValue('rawInput', mergedRawInput, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }

      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: payloadRawInput,
          sourceUrl:
            typeof values.sourceUrl === 'string' && values.sourceUrl.trim().length
              ? values.sourceUrl
              : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload?.error as string | undefined) || 'Failed to create item');
      }

      const newId = payload?.id as string | undefined;
      const originalUploadPath = payload?.originalUploadPath as string | undefined;
      const publicBase =
        (payload?.publicBase as string | undefined) ??
        uploadConfigRef.current?.publicBase ??
        SUPABASE_ITEMS_BASE ??
        null;
      if (!newId || !originalUploadPath || !publicBase) {
        throw new Error('Failed to create item');
      }

      const config: UploadConfig = { originalUploadPath, publicBase };
      setUploadConfig(config);
      setCurrentOriginalUrl(`${publicBase}/${originalUploadPath}`);
      setCreatedId(newId);
      setFinalized(false);
      return newId;
    })();

    creatingDraftRef.current = createPromise;
    try {
      const id = await createPromise;
      return id;
    } finally {
      creatingDraftRef.current = null;
    }
  }, [createdId, getValues, mergeWithParsed, setValue, setCurrentOriginalUrl, setUploadConfig]);

  const runAiEnrichment = React.useCallback(
    async (
      text: string,
      options: {
        type?: string | null;
        typeConfidence?: number;
        color?: string | null;
        colorConfidence?: number;
      } = {}
    ) => {
      const trimmedText = text?.trim();
      if (!trimmedText) return;

      const currentTypeValue = options.type ?? parsedType;
      const currentTypeConfidence = options.typeConfidence ?? typeConfidence;
      const currentColorValue = options.color ?? parsedColor;
      const currentColorConfidence = options.colorConfidence ?? colorConfidence;

      const needSet = new Set<string>(['name', 'brand']);
      if (!currentTypeValue || currentTypeConfidence < AI_CONFIDENCE_THRESHOLD) {
        needSet.add('type');
      }
      if (!currentColorValue || currentColorConfidence < AI_CONFIDENCE_THRESHOLD) {
        needSet.add('color');
      }

      const need = Array.from(needSet);
      if (!need.length) return;

      setAiRunning(true);
      try {
        const res = await fetch('/api/ai-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmedText, need }),
        });
        if (res.status === 401) {
          toast.error('Please sign in to use AI parsing.');
          return;
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error((payload?.error as string | undefined) || 'AI request failed');
        }
        const payload = await res.json().catch(() => ({}));
        const result = (payload?.result ?? {}) as Record<string, string | undefined>;

        if (typeof result.name === 'string' && result.name.trim()) {
          setItemName(result.name.trim());
        }
        if (typeof result.brand === 'string' && result.brand.trim()) {
          setItemBrand(result.brand.trim());
        }
        if (needSet.has('type') && typeof result.type === 'string' && result.type.trim()) {
          const canonicalType = normalizeToCanonArticle(result.type.trim());
          if (canonicalType) {
            setParsedType(canonicalType);
            setTypeConfidence(Math.max(currentTypeConfidence, 0.75));
          }
        }
        if (needSet.has('color') && typeof result.color === 'string' && result.color.trim()) {
          const canonicalColor = normalizeMultiColor(result.color.trim());
          if (canonicalColor) {
            setAllowSecondColor(false);
            applyColorValue(canonicalColor);
            setColorConfidence(Math.max(currentColorConfidence, 0.75));
          }
        }
      } catch (error) {
        console.error('[NewItemDialog] AI enrichment failed', error);
        toast.error('Could not refine details with AI');
      } finally {
        setAiRunning(false);
      }
    },
    [
      applyColorValue,
      colorConfidence,
      parsedColor,
      parsedType,
      setColorConfidence,
      setItemBrand,
      setItemName,
      setParsedType,
      setTypeConfidence,
      setAllowSecondColor,
      typeConfidence,
    ]
  );

  const applyImageResult = React.useCallback(
    (primary: string | null | undefined, extras: Array<string | null | undefined> = []) => {
      if (!primary) return;
      setPreviewImg(primary);
      setProductImages((prev) => {
        const seen = new Set<string>();
        const ordered = [primary, ...extras];
        const combined = [...ordered, ...prev];
        const next: string[] = [];
        for (const candidate of combined) {
          if (typeof candidate !== 'string' || candidate.trim().length === 0) continue;
          if (seen.has(candidate)) continue;
          seen.add(candidate);
          next.push(candidate);
          if (next.length >= 12) break;
        }
        return next;
      });
    },
    []
  );

  const handleReplaceImage = React.useCallback(
    async (imageUrl: string) => {
      const trimmed = typeof imageUrl === 'string' ? imageUrl.trim() : '';
      if (!trimmed || replacingImage) return false;
      if (previewImg && previewImg === trimmed) return true;

      if (mode === 'create') {
        setStagedRemoteUrl(trimmed);
        setStagedFile(null);
        setPreviewImg(trimmed);
        applyImageResult(trimmed, [trimmed]);
        return true;
      }

      const previousPreview = previewImg;
      setPreviewImg(trimmed);
      setReplacingImage(true);
      try {
        const itemId = createdId ?? (await ensureItemDraft());
        if (!itemId) throw new Error('Failed to create item');

        const res = await fetch(`/api/items/${itemId}/replace-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: trimmed }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((payload?.error as string | undefined) || 'Failed to replace image');
        }
        const cleanedUrl = (payload?.imageUrl as string | undefined) ?? trimmed;
        const originalUrl = payload?.originalUrl as string | undefined;
        const newOriginalUrl = originalUrl ?? trimmed;
        setCurrentOriginalUrl(newOriginalUrl ?? null);
        const configFromUrl = deriveUploadConfigFromUrl(newOriginalUrl ?? null);
        if (configFromUrl) {
          setUploadConfig(configFromUrl);
        }
        const cleaned = payload?.cleaned !== false;
        const message =
          typeof payload?.message === 'string'
            ? payload.message
            : cleaned
            ? null
            : 'Using original image.';
        applyImageResult(cleanedUrl, [originalUrl, trimmed]);
        if (message) {
          toast.message(message);
        } else {
          toast.success('Image updated');
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to replace image';
        console.error(error);
        toast.error(message);
        setPreviewImg(previousPreview);
        return false;
      } finally {
        setReplacingImage(false);
      }
    },
    [
      applyImageResult,
      createdId,
      ensureItemDraft,
      mode,
      previewImg,
      replacingImage,
      setCurrentOriginalUrl,
      setStagedFile,
      setStagedRemoteUrl,
      setUploadConfig,
    ]
  );

  const handleUploadFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file || replacingImage) return false;
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('Image too big (12MB max)');
        return false;
      }

      if (mode === 'create') {
        const previousPreview = previewImg;
        let tempUrl: string | null = null;
        try {
          tempUrl = URL.createObjectURL(file);
          setPreviewImg(tempUrl);
          if (previousPreview && previousPreview.startsWith('blob:')) {
            URL.revokeObjectURL(previousPreview);
          }
          setStagedFile(file);
          setStagedRemoteUrl(null);
          return true;
        } catch (error) {
          console.error(error);
          toast.error('Failed to preview image');
          if (tempUrl) URL.revokeObjectURL(tempUrl);
          setPreviewImg(previousPreview);
          return false;
        }
      }

      const previousPreview = previewImg;
      let tempUrl: string | null = null;
      setReplacingImage(true);
      try {
        const itemId = await ensureItemDraft();
        if (!itemId) throw new Error('Failed to create item');

        let config = uploadConfigRef.current;
        if (!config) {
          const derived = deriveUploadConfigFromUrl(currentOriginalUrlRef.current);
          if (derived) {
            setUploadConfig(derived);
            config = derived;
          }
        }
        if (!config) throw new Error('Missing upload configuration');

        const { originalUploadPath, publicBase } = config;

        tempUrl = URL.createObjectURL(file);
        setPreviewImg(tempUrl);

        const { error: uploadError } = await supabase.storage
          .from('items')
          .upload(originalUploadPath, file, { upsert: true });
        if (uploadError) {
          throw new Error(uploadError.message || 'Failed to upload image');
        }

        const originalPublicUrl = `${publicBase}/${originalUploadPath}`;
        setCurrentOriginalUrl(originalPublicUrl);

        const patchRes = await fetch(`/api/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalUrl: originalPublicUrl }),
        });
        const patchPayload = await patchRes.json().catch(() => ({}));
        if (!patchRes.ok) {
          throw new Error((patchPayload?.error as string | undefined) || 'Failed to save original image');
        }

        const cleanRes = await fetch(`/api/items/${itemId}/clean`, { method: 'POST' });
        const cleanPayload = await cleanRes.json().catch(() => ({}));
        if (!cleanRes.ok) {
          throw new Error((cleanPayload?.error as string | undefined) || 'Failed to clean image');
        }

        const cleaned = cleanPayload?.cleaned !== false;
        const cleanedUrl = (cleanPayload?.imageUrl as string | undefined) ?? originalPublicUrl;
        const message =
          typeof cleanPayload?.message === 'string'
            ? cleanPayload.message
            : cleaned
            ? null
            : 'Using original image.';
        applyImageResult(cleanedUrl, [originalPublicUrl]);
        if (message) {
          toast.message(message);
        } else {
          toast.success('Image updated');
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to upload image';
        console.error(error);
        toast.error(message);
        setPreviewImg(previousPreview);
        return false;
      } finally {
        if (tempUrl) URL.revokeObjectURL(tempUrl);
        setReplacingImage(false);
      }
    },
    [
      applyImageResult,
      ensureItemDraft,
      mode,
      previewImg,
      replacingImage,
      setCurrentOriginalUrl,
      setStagedFile,
      setStagedRemoteUrl,
      setUploadConfig,
    ]
  );

  const handleUseImageUrl = React.useCallback(async () => {
    const trimmed = customImageUrl.trim();
    if (!trimmed) {
      toast.message('Paste an image URL first');
      return;
    }
    const success = await handleReplaceImage(trimmed);
    if (success) {
      setCustomImageUrl('');
    }
  }, [customImageUrl, handleReplaceImage]);

  const closeDialog = React.useCallback(async () => {
    setDialogOpen(false);
    resetFetchedFromUrlState();
  }, [resetFetchedFromUrlState, setDialogOpen]);

  const applyFreeformParse = React.useCallback(
    (opts: { silent?: boolean } = {}) => {
      const currentRaw = getValues('rawInput') ?? '';
      const trimmed = currentRaw.trim();

      if (!trimmed) {
        setParsedType('');
        applyColorValue(null);
        setTypeConfidence(0);
        setColorConfidence(0);
        if (!opts.silent) toast.message('No extra details found');
        return;
      }

      const parsed = parseFreeform(trimmed);
      setParsedType(parsed.type ?? '');
      setAllowSecondColor(false);
      applyColorValue(parsed.color ?? null);
      setTypeConfidence(parsed.confidence.type ?? 0);
      setColorConfidence(parsed.confidence.color ?? 0);

      if (!parsed.type && !parsed.color && !opts.silent) {
        toast.message('No extra details found');
      }

      const merged = mergeWithParsed(currentRaw, parsed);
      if (merged.trim() !== trimmed) {
        setValue('rawInput', merged, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        if (!opts.silent) toast.success('Added details from description');
      }

      if (!opts.silent) {
        void runAiEnrichment(trimmed, {
          type: parsed.type ?? '',
          typeConfidence: parsed.confidence.type ?? 0,
          color: parsed.color ?? '',
          colorConfidence: parsed.confidence.color ?? 0,
        });
      }
    },
    [applyColorValue, getValues, mergeWithParsed, runAiEnrichment, setAllowSecondColor, setValue]
  );

  const rawInputRegister = register('rawInput', {
    onBlur: () => applyFreeformParse({ silent: true }),
  });

  const articleOptions = React.useMemo(() => [...CANON_ARTICLES], []);
  const colorOptions = React.useMemo(() => [...CANON_COLORS], []);

  return (
    <>
      {mode === 'create' && (
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
        >
          Add Item
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            void closeDialog();
          }}
        >
          <div className="flex min-h-full items-start justify-center px-4 py-8">
            <div
              className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
              style={{ maxHeight: "calc(100vh - 4rem)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="text-lg font-semibold">
                  {mode === 'edit' ? 'Edit Item' : 'New Item'}
                </h2>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeDialog();
                  }}
                  className="text-sm"
                >
                  Close
                </button>
              </div>

              <form
                className="flex flex-1 min-h-0 flex-col"
                onSubmit={handleSubmit(onSubmit)}
              >
                <div
                  className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div>
                    <label className="block text-sm font-medium">Product link (optional)</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="url"
                        className="w-full rounded-md border p-2 text-sm"
                        placeholder="https://example.com/item"
                        {...register('sourceUrl')}
                      />
                      {mode === 'create' && (
                        <button
                          type="button"
                          onClick={handleFetchFromUrl}
                          disabled={urlCreating}
                          className="whitespace-nowrap rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                        >
                          {urlCreating ? 'Fetching...' : 'Fetch from link'}
                        </button>
                      )}
                    </div>
                    {errors.sourceUrl && (
                      <p className="mt-1 text-xs text-red-600">
                        {(errors.sourceUrl.message as string) || 'Invalid URL'}
                      </p>
                    )}
                    {fetchHint && <p className="mt-2 text-xs text-gray-500">{fetchHint}</p>}
                    {IS_DEV && mode === 'create' && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={forceBrowserless}
                          onChange={(event) => setForceBrowserless(event.target.checked)}
                        />
                        Force Browserless (dev only)
                      </label>
                    )}
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm font-medium">Image</label>
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="overflow-hidden rounded-md border bg-gray-50">
                          {previewImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={previewImg}
                              alt="preview"
                              className="aspect-[4/5] w-full object-cover"
                            />
                          ) : (
                            <div className="grid aspect-[4/5] w-full place-items-center text-xs text-muted-foreground">
                              No image selected
                            </div>
                          )}
                        </div>
                        {IS_DEV && scrapePathUsed && (
                          <p className="text-[11px] text-gray-500">
                            via{' '}
                            {scrapePathUsed === 'browserless'
                              ? 'Browserless'
                              : scrapePathUsed === 'direct'
                              ? 'direct fetch'
                              : scrapePathUsed}
                          </p>
                        )}

                        {productImages.length > 1 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-gray-600">
                              Choose another image
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {productImages.slice(0, 8).map((url) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={() => {
                                    void handleReplaceImage(url);
                                  }}
                                  disabled={replacingImage}
                                  className={`overflow-hidden rounded-md border transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                                    previewImg === url ? 'ring-2 ring-black' : ''
                                  }`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-20 w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted ${
                                replacingImage ? 'opacity-60' : ''
                              }`}
                            >
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                disabled={replacingImage}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) {
                                    void handleUploadFile(file);
                                  }
                                  event.target.value = '';
                                }}
                              />
                              Choose file
                            </label>
                            {replacingImage && (
                              <span className="text-xs text-muted-foreground">
                                Processing image...
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={customImageUrl}
                              onChange={(e) => setCustomImageUrl(e.target.value)}
                              placeholder="https://example.com/photo.jpg"
                              className="w-full rounded-md border p-2 text-sm"
                              disabled={replacingImage}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void handleUseImageUrl();
                              }}
                              disabled={replacingImage || !customImageUrl.trim()}
                              className="rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Use URL
                            </button>
                          </div>

                          <div className="rounded-md border p-3">
                            <p className="text-xs text-gray-600">
                              Paste an image: click below and press ⌘V / Ctrl+V.
                            </p>
                            <div
                              contentEditable
                              suppressContentEditableWarning
                              tabIndex={0}
                              role="textbox"
                              className="mt-2 min-h-[72px] cursor-text rounded border bg-white p-4 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-black/40"
                              onPaste={async (event) => {
                                if (replacingImage) return;
                                const box = event.currentTarget;
                                const items = event.clipboardData?.items;
                                if (!items || items.length === 0) return;
                                const imageItem = Array.from(items).find((entry) =>
                                  entry.type?.startsWith('image/')
                                );
                                if (!imageItem) return;
                                event.preventDefault();
                                const file = imageItem.getAsFile();
                                if (!file) return;
                                await handleUploadFile(file);
                                if (box && box.isConnected) box.textContent = '';
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        Image source:{' '}
                        {stagedFile
                          ? 'uploaded file'
                          : stagedRemoteUrl
                          ? 'remote'
                          : previewImg
                          ? 'remote'
                          : 'none selected'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Describe the item</label>
                    <textarea
                      className="mt-1 w-full rounded-md border p-2 text-sm"
                      placeholder='e.g., "Uniqlo U crewneck, dark navy, M"'
                      rows={3}
                      {...rawInputRegister}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {aiRunning && (
                        <span className="text-xs text-muted-foreground">Refining…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => applyFreeformParse()}
                        disabled={aiRunning}
                        className="text-xs text-gray-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Parse description
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600">Name</label>
                        <input
                          type="text"
                          value={itemName}
                          onChange={(event) => setItemName(event.target.value)}
                          placeholder="e.g., Merino turtleneck"
                          className="mt-1 w-full rounded-md border p-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600">Brand</label>
                        <input
                          type="text"
                          value={itemBrand}
                          onChange={(event) => setItemBrand(event.target.value)}
                          placeholder="e.g., Uniqlo"
                          className="mt-1 w-full rounded-md border p-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600">
                          Parsed Article
                        </label>
                        <select
                          className="mt-1 w-full rounded-md border p-2 text-sm"
                          value={parsedType}
                          onChange={(event) => {
                            const value = event.target.value;
                            setParsedType(value);
                            setTypeConfidence(value ? 1 : 0);
                          }}
                        >
                          <option value="">Unset</option>
                          {articleOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600">
                          Parsed Color
                        </label>
                        <div className="mt-1 space-y-2">
                          <select
                            className="w-full rounded-md border p-2 text-sm"
                            value={colorPrimary}
                            onChange={(event) => {
                              const value = event.target.value;
                              setColorPrimary(value);
                              updateColorSelections(value, colorSecondary);
                            }}
                          >
                            <option value="">Unset</option>
                            {colorOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          {allowSecondColor ? (
                            <div className="flex items-center gap-2">
                              <select
                                className="flex-1 rounded-md border p-2 text-sm"
                                value={colorSecondary}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setColorSecondary(value);
                                  updateColorSelections(colorPrimary, value);
                                }}
                              >
                                <option value="">Unset</option>
                                {colorOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setAllowSecondColor(false);
                                  setColorSecondary('');
                                  updateColorSelections(colorPrimary, '');
                                }}
                                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAllowSecondColor(true);
                              }}
                              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                            >
                              + Add second color
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {errors.rawInput && (
                      <p className="mt-1 text-xs text-red-600">{errors.rawInput.message}</p>
                    )}
                  </div>

                </div>

                <div className="flex items-center justify-end gap-2 border-t p-4">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeDialog();
                  }}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting || (getValues('rawInput')?.trim().length ?? 0) < 2}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                    {submitting ? 'Saving...' : 'Save Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
