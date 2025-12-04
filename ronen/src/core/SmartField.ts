import { SmartFieldConfig, MemoryItem, LLMProvider } from '../types/index.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';
import { LocalLLMProvider, OpenAIProvider, AnthropicProvider } from '../llm/LLMProvider.js';
import { EdgeLLMProvider } from '../llm/EdgeLLMProvider.js';

export abstract class SmartField {
  protected config: SmartFieldConfig;
  protected memoryStorage: MemoryStorage;
  protected llmProvider: LLMProvider;
  protected hoverTimer?: NodeJS.Timeout;
  protected isHovering: boolean = false;

  constructor(config: SmartFieldConfig) {
    this.config = config;
    this.memoryStorage = MemoryStorage.getInstance();
    this.llmProvider = this.createLLMProvider();
  }

  protected createLLMProvider(): LLMProvider {
    switch (this.config.llmProvider) {
      case 'edge':
        return new EdgeLLMProvider();
      
      case 'openai':
        if (!this.config.llmApiKey) {
          console.warn('OpenAI API key not provided, falling back to edge provider');
          return new EdgeLLMProvider();
        }
        return new OpenAIProvider(this.config.llmApiKey);
      
      case 'anthropic':
        if (!this.config.llmApiKey) {
          console.warn('Anthropic API key not provided, falling back to edge provider');
          return new EdgeLLMProvider();
        }
        return new AnthropicProvider(this.config.llmApiKey);
      
      case 'local':
      default:
        return new LocalLLMProvider();
    }
  }

  public saveValue(value: string, metadata?: Record<string, any>): void {
    this.memoryStorage.saveItem(this.config, value, metadata);
  }

  public getHistory(): MemoryItem[] {
    return this.memoryStorage.getHistory(this.config);
  }

  public clearHistory(): void {
    this.memoryStorage.clearHistory(this.config);
  }

  public async searchHistory(query: string): Promise<MemoryItem[]> {
    if (this.config.enableLLM) {
      return this.llmProvider.searchHistory(query, this.getHistory());
    }
    return this.memoryStorage.searchHistory(this.config, query);
  }

  public async generateSuggestions(prompt: string): Promise<string[]> {
    if (this.config.enableLLM) {
      return this.llmProvider.generateSuggestions(prompt, this.getHistory());
    }
    return this.getHistory().slice(0, 5).map(item => item.value);
  }

  protected handleDoubleClick = (): void => {
    this.triggerRetrieval();
  };

  protected handleMouseEnter = (): void => {
    this.isHovering = true;
    this.hoverTimer = setTimeout(() => {
      if (this.isHovering) {
        this.triggerRetrieval();
      }
    }, this.config.hoverDuration || 3000);
  };

  protected handleMouseLeave = (): void => {
    this.isHovering = false;
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = undefined;
    }
  };

  protected abstract triggerRetrieval(): void;

  public destroy(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }
  }
}
