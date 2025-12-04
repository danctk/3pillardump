import { SmartField } from '../core/SmartField.js';
import { SmartFieldConfig } from '../types/index.js';

export class SmartTextField extends SmartField {
  private onRetrieval?: (suggestions: string[]) => void;
  private onValueChange?: (value: string) => void;

  constructor(config: SmartFieldConfig, callbacks?: {
    onRetrieval?: (suggestions: string[]) => void;
    onValueChange?: (value: string) => void;
  }) {
    super(config);
    this.onRetrieval = callbacks?.onRetrieval;
    this.onValueChange = callbacks?.onValueChange;
  }

  protected async triggerRetrieval(): Promise<void> {
    try {
      const suggestions = await this.generateSuggestions('');
      this.onRetrieval?.(suggestions);
    } catch (error) {
      console.error('Error retrieving suggestions:', error);
    }
  }

  public async handleInput(value: string): Promise<void> {
    this.onValueChange?.(value);
    
    // Save the value to memory
    if (value.trim()) {
      this.saveValue(value, {
        timestamp: Date.now(),
        fieldType: 'text'
      });
    }
  }

  public async handlePrompt(prompt: string): Promise<void> {
    try {
      const suggestions = await this.generateSuggestions(prompt);
      this.onRetrieval?.(suggestions);
    } catch (error) {
      console.error('Error generating suggestions from prompt:', error);
    }
  }

  public getInteractionHandlers() {
    return {
      onDoubleClick: this.handleDoubleClick,
      onMouseEnter: this.handleMouseEnter,
      onMouseLeave: this.handleMouseLeave,
    };
  }
}
