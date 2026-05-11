/**
 * Custom Hooks
 * 
 * Reusable hooks to encapsulate common logic and improve code organization.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { polishApi, translateApi, savedItemsApi } from '../lib/api';
import { handleApiError, ApiError } from '../utils/errorHandler';
import type { PolishResponse, TranslateResponse, SavedItem } from '../lib/api';

// Re-export chunked recording hook
export { useChunkedRecording } from './useChunkedRecording';
export type {
  ChunkInfo,
  ChunkedRecordingState,
  ChunkedRecordingOptions,
  UseChunkedRecordingResult
} from './useChunkedRecording';

/**
 * Polish Hook
 * Encapsulates polish API logic with loading and error states
 */
export interface PolishOptions {
  language: string;
  outputFormat: string;
  outputType: string;
  mimeType?: string;
}

export interface UsePolishResult {
  polish: (base64Audio: string, options: PolishOptions) => Promise<void>;
  isProcessing: boolean;
  result: PolishResponse | null;
  error: ApiError | null;
  clear: () => void;
}

export function usePolish(): UsePolishResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const polish = useCallback(async (base64Audio: string, options: PolishOptions) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await polishApi.polishBase64(
        base64Audio,
        options.language,
        options.outputFormat,
        options.outputType,
        options.mimeType
      );
      setResult(response);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { polish, isProcessing, result, error, clear };
}

/**
 * Translate Hook
 * Encapsulates translate API logic with loading and error states
 */
export interface TranslateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  outputFormat: string;
  mimeType?: string;
}

export interface UseTranslateResult {
  translate: (base64Audio: string, options: TranslateOptions) => Promise<void>;
  isProcessing: boolean;
  result: TranslateResponse | null;
  error: ApiError | null;
  clear: () => void;
}

export function useTranslate(): UseTranslateResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const translate = useCallback(async (base64Audio: string, options: TranslateOptions) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await translateApi.translateBase64(
        base64Audio,
        options.sourceLanguage,
        options.targetLanguage,
        options.outputFormat,
        options.mimeType
      );
      setResult(response);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { translate, isProcessing, result, error, clear };
}

/**
 * Saved Items Hook
 * Manages saved items with CRUD operations
 */
export interface UseSavedItemsResult {
  items: SavedItem[];
  isLoading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  save: (item: Partial<SavedItem>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

export function useSavedItems(type: string = 'all'): UseSavedItemsResult {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await savedItemsApi.getAll(type);
      setItems(data);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  const save = useCallback(async (item: any) => {
    setIsSaving(true);
    setError(null);

    try {
      const savedItem = await savedItemsApi.save(item);
      setItems(prev => [savedItem, ...prev]);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await savedItemsApi.delete(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    isLoading,
    error,
    refresh,
    save,
    remove,
    isSaving,
    isDeleting,
  };
}

/**
 * Debounce Hook
 * Delays execution of a function until after a specified delay
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Form Hook
 * Manages form state, validation, and submission
 */
export interface UseFormOptions<T> {
  initialValues: T;
  validate?: (values: T) => Record<string, string>;
  onSubmit: (values: T) => Promise<void> | void;
}

export interface UseFormResult<T> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  handleChange: (field: keyof T) => (value: any) => void;
  handleBlur: (field: keyof T) => () => void;
  handleSubmit: () => Promise<void>;
  setFieldValue: (field: keyof T, value: any) => void;
  setFieldError: (field: keyof T, error: string) => void;
  resetForm: () => void;
}

export function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>
): UseFormResult<T> {
  const [values, setValues] = useState<T>(options.initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback((field: keyof T) => (value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleBlur = useCallback((field: keyof T) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const setFieldError = useCallback((field: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }));
  }, []);

  const resetForm = useCallback(() => {
    setValues(options.initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [options.initialValues]);

  const handleSubmit = useCallback(async () => {
    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setTouched(allTouched);

    // Validate if validator provided
    if (options.validate) {
      const validationErrors = options.validate(values);
      setErrors(validationErrors);

      if (Object.keys(validationErrors).length > 0) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await options.onSubmit(values);
    } catch (error) {
      // Error handled by onSubmit
    } finally {
      setIsSubmitting(false);
    }
  }, [values, options]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    resetForm,
  };
}

/**
 * Previous Value Hook
 * Returns the previous value of a state
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Mount Hook
 * Runs effect only on mount
 */
export function useMount(effect: () => void | (() => void)) {
  useEffect(() => {
    return effect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Update Effect Hook
 * Runs effect only on updates, not on mount
 */
export function useUpdateEffect(effect: () => void | (() => void), deps: any[]) {
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      return effect();
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
