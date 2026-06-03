export const PROCESS_AUDIO_MAX_SIZE_MB = 10;
export const PROCESS_AUDIO_MAX_SIZE_BYTES = PROCESS_AUDIO_MAX_SIZE_MB * 1024 * 1024;

export const PROCESS_AUDIO_SUPPORTED_TYPES = [
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
] as const;

export const PROCESS_AUDIO_SUPPORTED_EXTENSIONS = [
  'mp4', 'mp3', 'mpeg', 'wav', 'webm', 'ogg', 'aac', 'm4a', 'flac',
] as const;

export type SupportedAudioType = typeof PROCESS_AUDIO_SUPPORTED_TYPES[number];

export function isAudioTypeSupported(mimeType: string): boolean {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return PROCESS_AUDIO_SUPPORTED_TYPES.includes(normalized as SupportedAudioType);
}

export function formatMaxSize(): string {
  return `${PROCESS_AUDIO_MAX_SIZE_MB}MB`;
}
