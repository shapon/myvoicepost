/**
 * WAV File Writer Utility
 *
 * Converts raw PCM chunks (base64-encoded Int16 LE data from react-native-live-audio-stream)
 * into a valid WAV file written to the device filesystem via expo-file-system.
 *
 * WAV format reference:
 *   Offset  Length  Content
 *   0       4       'RIFF'
 *   4       4       file length – 8 (little-endian uint32)
 *   8       4       'WAVE'
 *   12      4       'fmt '
 *   16      4       16 (PCM chunk size)
 *   20      2       1  (PCM format)
 *   22      2       channels
 *   24      4       sampleRate
 *   28      4       byteRate = sampleRate × channels × bitsPerSample / 8
 *   32      2       blockAlign = channels × bitsPerSample / 8
 *   34      2       bitsPerSample
 *   36      4       'data'
 *   40      4       dataLength (bytes)
 *   44      N       raw PCM bytes
 */

import * as FileSystem from 'expo-file-system';

// ── Binary helpers ────────────────────────────────────────────────────────────

/**
 * Decode a base64 string → Uint8Array without using Buffer (React Native safe).
 * Handles the `atob` global available in React Native's Hermes engine.
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Encode a Uint8Array → base64 string.
 * Processes in 8 KB slices to avoid JS call-stack overflow on large buffers.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const SLICE = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += SLICE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + SLICE, bytes.length))
    );
  }
  return btoa(binary);
}

// ── WAV header builder ────────────────────────────────────────────────────────

function buildWavHeader(
  dataLength: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  // 'RIFF'
  header[0] = 82; header[1] = 73; header[2] = 70; header[3] = 70;
  // file size – 8
  view.setUint32(4, 36 + dataLength, true);
  // 'WAVE'
  header[8] = 87; header[9] = 65; header[10] = 86; header[11] = 69;
  // 'fmt '
  header[12] = 102; header[13] = 109; header[14] = 116; header[15] = 32;
  // PCM chunk size = 16
  view.setUint32(16, 16, true);
  // audio format = 1 (PCM)
  view.setUint16(20, 1, true);
  // channels
  view.setUint16(22, channels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  // block align
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  // bits per sample
  view.setUint16(34, bitsPerSample, true);
  // 'data'
  header[36] = 100; header[37] = 97; header[38] = 116; header[39] = 97;
  // data length
  view.setUint32(40, dataLength, true);

  return header;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const WAV_MIME_TYPE = 'audio/wav';

/**
 * Write a WAV file from an array of base64-encoded raw PCM chunks.
 *
 * @param destUri        Full file URI to write (e.g. `${FileSystem.documentDirectory}snip_1.wav`)
 * @param pcmBase64Chunks  Array of base64 strings, each representing Int16 LE PCM bytes.
 *                       These are exactly what react-native-live-audio-stream provides in its `data` event.
 * @param sampleRate     Audio sample rate in Hz (default: 16000)
 * @param channels       Number of channels (default: 1 = mono)
 * @param bitsPerSample  Bits per sample (default: 16)
 *
 * @returns              The destUri on success.
 */
export async function writePcmChunksToWav(
  destUri: string,
  pcmBase64Chunks: string[],
  sampleRate = 16000,
  channels = 1,
  bitsPerSample = 16
): Promise<string> {
  if (pcmBase64Chunks.length === 0) {
    throw new Error('No PCM chunks to write');
  }

  // Decode all chunks
  const decodedChunks = pcmBase64Chunks.map(base64ToUint8Array);
  const totalPcmBytes = decodedChunks.reduce((sum, arr) => sum + arr.length, 0);

  // Allocate: 44-byte header + PCM data
  const wavBytes = new Uint8Array(44 + totalPcmBytes);
  wavBytes.set(buildWavHeader(totalPcmBytes, sampleRate, channels, bitsPerSample), 0);

  let offset = 44;
  for (const chunk of decodedChunks) {
    wavBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const wavBase64 = uint8ArrayToBase64(wavBytes);
  await FileSystem.writeAsStringAsync(destUri, wavBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return destUri;
}
