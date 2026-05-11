import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { transcribeApi, polishApi, translateApi, savedItemsApi } from '../lib/api';
import { isAuthenticated } from '../lib/api';

const PENDING_ITEMS_KEY = '@pending_processing_items';
const PENDING_AUDIO_DIR = `${FileSystem.documentDirectory}pending_audio/`;

export type PendingItemType = 'polish_audio' | 'polish_text' | 'translate_audio' | 'translate_text';

export interface PendingItem {
  id: string;
  type: PendingItemType;
  createdAt: string;
  attempts: number;
  lastError?: string;
  
  // For audio items
  audioUri?: string;
  base64Audio?: string;  // Stored for small recordings
  
  // For text items (re-polish/re-translate)
  originalText?: string;
  
  // Processing settings
  language?: string;           // For polish
  sourceLanguage?: string;     // For translate
  targetLanguage?: string;     // For translate
  outputFormat?: string;       // tone
  outputType?: string;         // For polish (message, email, etc.)
  
  // Auto-save after processing?
  autoSave?: boolean;
}

export interface ProcessingResult {
  success: boolean;
  originalText?: string;
  polishedText?: string;
  translatedText?: string;
  error?: string;
}

class PendingProcessorManager {
  private isProcessing = false;
  private listeners: Array<(items: PendingItem[]) => void> = [];

  constructor() {
    this.initDirectory();
    this.setupNetworkListener();
  }

  private async initDirectory() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(PENDING_AUDIO_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(PENDING_AUDIO_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('[PendingProcessor] Failed to create directory:', error);
    }
  }

  private setupNetworkListener() {
    NetInfo.addEventListener((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      console.log('[PendingProcessor] Network changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
      });
      
      // Auto-process when network becomes available
      if (state.isConnected && state.isInternetReachable) {
        console.log('[PendingProcessor] Network available - will process pending items');
        // Don't auto-process to give user control - they can use manual sync
      }
    });
  }

  async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.isInternetReachable === true;
    } catch {
      return false;
    }
  }

  /**
   * Add audio recording to pending queue
   */
  async addAudioItem(params: {
    type: 'polish' | 'translate';
    base64Audio: string;
    language?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    outputFormat?: string;
    outputType?: string;
    autoSave?: boolean;
  }): Promise<PendingItem> {
    const id = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const audioUri = `${PENDING_AUDIO_DIR}${id}.m4a`;

    console.log('[PendingProcessor] Adding audio item:', id, 'Type:', params.type);

    // Save audio to file for persistence
    try {
      await FileSystem.writeAsStringAsync(audioUri, params.base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[PendingProcessor] Audio saved to:', audioUri);
    } catch (error) {
      console.error('[PendingProcessor] Failed to save audio file:', error);
      throw error;
    }

    const item: PendingItem = {
      id,
      type: params.type === 'polish' ? 'polish_audio' : 'translate_audio',
      createdAt: new Date().toISOString(),
      attempts: 0,
      audioUri,
      language: params.language,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      outputFormat: params.outputFormat,
      outputType: params.outputType,
      autoSave: params.autoSave,
    };

    await this.addItem(item);
    return item;
  }

  /**
   * Add text to pending queue (for re-polish/re-translate)
   */
  async addTextItem(params: {
    type: 'polish' | 'translate';
    originalText: string;
    language?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    outputFormat?: string;
    outputType?: string;
    autoSave?: boolean;
  }): Promise<PendingItem> {
    const id = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[PendingProcessor] Adding text item:', id, 'Type:', params.type);

    const item: PendingItem = {
      id,
      type: params.type === 'polish' ? 'polish_text' : 'translate_text',
      createdAt: new Date().toISOString(),
      attempts: 0,
      originalText: params.originalText,
      language: params.language,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      outputFormat: params.outputFormat,
      outputType: params.outputType,
      autoSave: params.autoSave,
    };

    await this.addItem(item);
    return item;
  }

  private async addItem(item: PendingItem): Promise<void> {
    const items = await this.getItems();
    items.push(item);
    await AsyncStorage.setItem(PENDING_ITEMS_KEY, JSON.stringify(items));
    this.notifyListeners();
    console.log('[PendingProcessor] Item added. Total pending:', items.length);
  }

  /**
   * Get all pending items
   */
  async getItems(): Promise<PendingItem[]> {
    try {
      const data = await AsyncStorage.getItem(PENDING_ITEMS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[PendingProcessor] Failed to get items:', error);
      return [];
    }
  }

  /**
   * Process a single pending item
   */
  async processItem(itemId: string): Promise<ProcessingResult> {
    const items = await this.getItems();
    const item = items.find(i => i.id === itemId);

    if (!item) {
      return { success: false, error: 'Item not found' };
    }

    console.log('[PendingProcessor] Processing item:', itemId, 'Type:', item.type);

    const isOnline = await this.isOnline();
    if (!isOnline) {
      return { success: false, error: 'No network connection' };
    }

    try {
      let result: ProcessingResult;

      switch (item.type) {
        case 'polish_audio':
          result = await this.processPolishAudio(item);
          break;
        case 'polish_text':
          result = await this.processPolishText(item);
          break;
        case 'translate_audio':
          result = await this.processTranslateAudio(item);
          break;
        case 'translate_text':
          result = await this.processTranslateText(item);
          break;
        default:
          result = { success: false, error: 'Unknown item type' };
      }

      if (result.success) {
        // Remove from pending queue
        await this.removeItem(itemId);
        console.log('[PendingProcessor] Item processed successfully:', itemId);

        // Auto-save if requested
        if (item.autoSave && await isAuthenticated()) {
          try {
            await this.saveToServer(item, result);
            console.log('[PendingProcessor] Auto-saved to server');
          } catch (saveError) {
            console.error('[PendingProcessor] Auto-save failed:', saveError);
            // Don't fail the overall processing
          }
        }
      } else {
        // Update attempt count
        item.attempts++;
        item.lastError = result.error;
        await this.updateItem(item);
        console.log('[PendingProcessor] Processing failed, attempt:', item.attempts);
      }

      return result;
    } catch (error: any) {
      console.error('[PendingProcessor] Processing error:', error);
      
      // Update attempt count
      item.attempts++;
      item.lastError = error.message;
      await this.updateItem(item);

      return { success: false, error: error.message };
    }
  }

  /**
   * Process Polish Audio: Transcribe -> Polish
   */
  private async processPolishAudio(item: PendingItem): Promise<ProcessingResult> {
    console.log('[PendingProcessor] POLISH AUDIO FLOW');

    // Step 1: Read audio from file
    let base64Audio: string;
    if (item.audioUri) {
      const fileInfo = await FileSystem.getInfoAsync(item.audioUri);
      if (!fileInfo.exists) {
        return { success: false, error: 'Audio file not found' };
      }
      base64Audio = await FileSystem.readAsStringAsync(item.audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (item.base64Audio) {
      base64Audio = item.base64Audio;
    } else {
      return { success: false, error: 'No audio data' };
    }

    console.log('[PendingProcessor] Step 1: Transcribing audio (language-specific)...');
    const transcribeResult = await transcribeApi.transcribeLanguageOnly(
      base64Audio,
      item.language || 'en',
      'audio/mp4'
    );
    const originalText = transcribeResult.originalText;
    console.log('[PendingProcessor] Transcribed:', originalText.substring(0, 50));

    console.log('[PendingProcessor] Step 2: Polishing text...');
    const polishResult = await polishApi.polishText(
      originalText,
      item.language || 'en',
      item.outputFormat || 'professional',
      item.outputType || 'general'
    );
    console.log('[PendingProcessor] Polished successfully');

    // Clean up audio file
    if (item.audioUri) {
      try {
        await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      success: true,
      originalText,
      polishedText: polishResult.polishedText,
    };
  }

  /**
   * Process Polish Text: Just Polish (already have text)
   */
  private async processPolishText(item: PendingItem): Promise<ProcessingResult> {
    console.log('[PendingProcessor] POLISH TEXT FLOW');

    if (!item.originalText) {
      return { success: false, error: 'No text to polish' };
    }

    console.log('[PendingProcessor] Polishing text...');
    const polishResult = await polishApi.polishText(
      item.originalText,
      item.language || 'en',
      item.outputFormat || 'professional',
      item.outputType || 'general'
    );
    console.log('[PendingProcessor] Polished successfully');

    return {
      success: true,
      originalText: item.originalText,
      polishedText: polishResult.polishedText,
    };
  }

  /**
   * Process Translate Audio: Transcribe -> Translate
   */
  private async processTranslateAudio(item: PendingItem): Promise<ProcessingResult> {
    console.log('[PendingProcessor] TRANSLATE AUDIO FLOW');

    // Step 1: Read audio from file
    let base64Audio: string;
    if (item.audioUri) {
      const fileInfo = await FileSystem.getInfoAsync(item.audioUri);
      if (!fileInfo.exists) {
        return { success: false, error: 'Audio file not found' };
      }
      base64Audio = await FileSystem.readAsStringAsync(item.audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (item.base64Audio) {
      base64Audio = item.base64Audio;
    } else {
      return { success: false, error: 'No audio data' };
    }

    console.log('[PendingProcessor] Step 1: Transcribing audio (language-specific)...');
    const transcribeResult = await transcribeApi.transcribeLanguageOnly(
      base64Audio,
      item.sourceLanguage || 'en',
      'audio/mp4'
    );
    const originalText = transcribeResult.originalText;
    console.log('[PendingProcessor] Transcribed:', originalText.substring(0, 50));

    console.log('[PendingProcessor] Step 2: Translating text...');
    const translateResult = await translateApi.translateText(
      originalText,
      item.sourceLanguage || 'en',
      item.targetLanguage || 'es',
      item.outputFormat || 'professional'
    );
    console.log('[PendingProcessor] Translated successfully');

    // Clean up audio file
    if (item.audioUri) {
      try {
        await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      success: true,
      originalText,
      polishedText: translateResult.polishedText,
      translatedText: translateResult.translatedText,
    };
  }

  /**
   * Process Translate Text: Just Translate (already have text)
   */
  private async processTranslateText(item: PendingItem): Promise<ProcessingResult> {
    console.log('[PendingProcessor] TRANSLATE TEXT FLOW');

    if (!item.originalText) {
      return { success: false, error: 'No text to translate' };
    }

    console.log('[PendingProcessor] Translating text...');
    const translateResult = await translateApi.translateText(
      item.originalText,
      item.sourceLanguage || 'en',
      item.targetLanguage || 'es',
      item.outputFormat || 'professional'
    );
    console.log('[PendingProcessor] Translated successfully');

    return {
      success: true,
      originalText: item.originalText,
      polishedText: translateResult.polishedText,
      translatedText: translateResult.translatedText,
    };
  }

  /**
   * Save processed result to server
   */
  private async saveToServer(item: PendingItem, result: ProcessingResult): Promise<void> {
    const isTranslate = item.type.startsWith('translate');
    
    await savedItemsApi.save({
      type: isTranslate ? 'translate' : 'polish',
      originalText: result.originalText || '',
      polishedText: result.polishedText || '',
      translatedText: result.translatedText,
      sourceLanguage: item.sourceLanguage || item.language || 'en',
      targetLanguage: item.targetLanguage,
      outputFormat: item.outputFormat || 'professional',
      outputType: item.outputType,
    });
  }

  /**
   * Process all pending items
   */
  async processAll(): Promise<{ success: number; failed: number; total: number }> {
    if (this.isProcessing) {
      console.log('[PendingProcessor] Already processing');
      return { success: 0, failed: 0, total: 0 };
    }

    const isOnline = await this.isOnline();
    if (!isOnline) {
      console.log('[PendingProcessor] Offline - cannot process');
      return { success: 0, failed: 0, total: 0 };
    }

    this.isProcessing = true;
    const items = await this.getItems();
    const total = items.length;
    let success = 0;
    let failed = 0;

    console.log('[PendingProcessor] Processing all items:', total);

    for (const item of items) {
      const result = await this.processItem(item.id);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    this.isProcessing = false;
    console.log('[PendingProcessor] Processing complete:', { success, failed, total });

    return { success, failed, total };
  }

  /**
   * Remove item from queue
   */
  async removeItem(itemId: string): Promise<void> {
    const items = await this.getItems();
    const item = items.find(i => i.id === itemId);
    
    // Clean up audio file if exists
    if (item?.audioUri) {
      try {
        await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    const filtered = items.filter(i => i.id !== itemId);
    await AsyncStorage.setItem(PENDING_ITEMS_KEY, JSON.stringify(filtered));
    this.notifyListeners();
  }

  private async updateItem(item: PendingItem): Promise<void> {
    const items = await this.getItems();
    const index = items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      items[index] = item;
      await AsyncStorage.setItem(PENDING_ITEMS_KEY, JSON.stringify(items));
      this.notifyListeners();
    }
  }

  /**
   * Clear all pending items
   */
  async clearAll(): Promise<void> {
    const items = await this.getItems();
    
    // Clean up audio files
    for (const item of items) {
      if (item.audioUri) {
        try {
          await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    await AsyncStorage.removeItem(PENDING_ITEMS_KEY);
    this.notifyListeners();
    console.log('[PendingProcessor] All items cleared');
  }

  /**
   * Subscribe to pending items changes
   */
  subscribe(listener: (items: PendingItem[]) => void): () => void {
    this.listeners.push(listener);
    
    // Send initial state
    this.getItems().then(listener);

    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.getItems().then(items => {
      this.listeners.forEach(listener => listener(items));
    });
  }

  /**
   * Get count of pending items
   */
  async getCount(): Promise<number> {
    const items = await this.getItems();
    return items.length;
  }
}

export const pendingProcessor = new PendingProcessorManager();
