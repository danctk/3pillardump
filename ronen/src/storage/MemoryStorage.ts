import { MemoryItem, SmartFieldConfig } from '../types/index.js';

export class MemoryStorage {
  private static instance: MemoryStorage;
  private storage: Map<string, MemoryItem[]> = new Map();

  private constructor() {
    this.loadFromLocalStorage();
  }

  public static getInstance(): MemoryStorage {
    if (!MemoryStorage.instance) {
      MemoryStorage.instance = new MemoryStorage();
    }
    return MemoryStorage.instance;
  }

  public saveItem(config: SmartFieldConfig, value: string, metadata?: Record<string, any>): void {
    if (!value.trim()) return;

    const storageKey = config.storageKey || config.id;
    const history = this.storage.get(storageKey) || [];
    
    // Avoid duplicates
    const existingIndex = history.findIndex(item => item.value === value);
    if (existingIndex !== -1) {
      // Move to front and update timestamp
      const existingItem = history.splice(existingIndex, 1)[0];
      existingItem.timestamp = Date.now();
      existingItem.metadata = { ...existingItem.metadata, ...metadata };
      history.unshift(existingItem);
    } else {
      const newItem: MemoryItem = {
        id: this.generateId(),
        value,
        timestamp: Date.now(),
        metadata
      };
      history.unshift(newItem);
    }

    // Limit history size
    const maxItems = config.maxHistoryItems || 50;
    if (history.length > maxItems) {
      history.splice(maxItems);
    }

    this.storage.set(storageKey, history);
    this.saveToLocalStorage();
  }

  public getHistory(config: SmartFieldConfig): MemoryItem[] {
    const storageKey = config.storageKey || config.id;
    return this.storage.get(storageKey) || [];
  }

  public clearHistory(config: SmartFieldConfig): void {
    const storageKey = config.storageKey || config.id;
    this.storage.delete(storageKey);
    this.saveToLocalStorage();
  }

  public searchHistory(config: SmartFieldConfig, query: string): MemoryItem[] {
    const history = this.getHistory(config);
    if (!query.trim()) return history;

    const lowercaseQuery = query.toLowerCase();
    return history.filter(item => 
      item.value.toLowerCase().includes(lowercaseQuery) ||
      (item.metadata && Object.values(item.metadata).some(val => 
        String(val).toLowerCase().includes(lowercaseQuery)
      ))
    );
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('smart-fields-memory');
      if (stored) {
        const data = JSON.parse(stored);
        this.storage = new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('Failed to load smart fields memory from localStorage:', error);
    }
  }

  private saveToLocalStorage(): void {
    try {
      const data = Object.fromEntries(this.storage);
      localStorage.setItem('smart-fields-memory', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save smart fields memory to localStorage:', error);
    }
  }
}
