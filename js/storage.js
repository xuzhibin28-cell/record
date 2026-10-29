/**
 * Luma Capture - IndexedDB Storage Module
 * Manages persistent client-side storage for recorded videos, metadata, and snapshots.
 */

const DB_NAME = 'LumaCaptureDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

class StorageService {
  constructor() {
    this.db = null;
    this._listeners = new Set();
  }

  /**
   * Initializes and opens the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(new Error('Failed to open browser storage: ' + (event.target.error?.message || 'Unknown error')));
      };
    });
  }

  /**
   * Subscribes to storage mutation events.
   * @param {Function} callback
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(changeType, data) {
    for (const cb of this._listeners) {
      try {
        cb(changeType, data);
      } catch (err) {
        console.error('Storage listener error:', err);
      }
    }
  }

  /**
   * Saves a recording to IndexedDB.
   * @param {Object} recordingData
   * @returns {Promise<Object>}
   */
  async saveRecording(recordingData) {
    const db = await this.init();
    const id = recordingData.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      id,
      title: recordingData.title || `Recording ${new Date().toLocaleString()}`,
      blob: recordingData.blob,
      mimeType: recordingData.mimeType || 'video/webm',
      extension: recordingData.extension || 'webm',
      size: recordingData.size || recordingData.blob?.size || 0,
      duration: recordingData.duration || 0,
      width: recordingData.width || 1920,
      height: recordingData.height || 1080,
      createdAt: recordingData.createdAt || Date.now(),
      thumbnail: recordingData.thumbnail || null
    };

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.put(record);

        req.onsuccess = () => {
          this._notify('saved', record);
          resolve(record);
        };

        req.onerror = (evt) => {
          console.error('Error saving recording:', evt.target.error);
          reject(new Error('Storage quota exceeded or write failed.'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves all recordings, sorted with the newest first.
   * @returns {Promise<Array>}
   */
  async getAllRecordings() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = req.result || [];
          // Sort newest first
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        };

        req.onerror = (evt) => {
          reject(evt.target.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves a single recording by its ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getRecording(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Updates the title of an existing recording.
   * @param {string} id
   * @param {string} newTitle
   * @returns {Promise<Object>}
   */
  async updateTitle(id, newTitle) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          return reject(new Error('Recording not found.'));
        }
        item.title = newTitle.trim() || item.title;
        const putReq = store.put(item);
        putReq.onsuccess = () => {
          this._notify('updated', item);
          resolve(item);
        };
        putReq.onerror = (evt) => reject(evt.target.error);
      };

      getReq.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Deletes a recording by its ID.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteRecording(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        this._notify('deleted', { id });
        resolve();
      };
      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Estimates remaining storage quota.
   * @returns {Promise<{usage: number, quota: number, percent: number}|null>}
   */
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percent = quota > 0 ? (usage / quota) * 100 : 0;
        return { usage, quota, percent: Math.round(percent * 10) / 10 };
      } catch (err) {
        console.warn('Could not read storage estimate:', err);
      }
    }
    return null;
  }
}

export const storageService = new StorageService();
