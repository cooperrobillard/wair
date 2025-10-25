export type BulkDeleteResponse =
  | {
      ok: true;
      deletedIds: string[];
      missingIds: string[];
      storageErrors?: Array<{ path: string; message: string }>;
    }
  | {
      ok: false;
      error: string;
    };
