export interface SmartFieldConfig {
  id: string;
  maxHistoryItems?: number;
  enableLLM?: boolean;
  llmProvider?: 'openai' | 'anthropic' | 'local' | 'edge';
  llmApiKey?: string;
  storageKey?: string;
  hoverDuration?: number;
}

export interface MemoryItem {
  id: string;
  value: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SmartFieldState {
  value: string;
  history: MemoryItem[];
  isRetrieving: boolean;
  suggestions: string[];
  showSuggestions: boolean;
}

export interface LLMProvider {
  generateSuggestions(prompt: string, history: MemoryItem[]): Promise<string[]>;
  searchHistory(query: string, history: MemoryItem[]): Promise<MemoryItem[]>;
}

export interface SmartFieldProps {
  config: SmartFieldConfig;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export interface InteractionTrigger {
  type: 'doubleClick' | 'hover' | 'keyboard';
  duration?: number; // for hover
  key?: string; // for keyboard
}
