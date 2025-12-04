import { SmartFieldConfig } from '../types/index.js';
import { SmartTextField } from '../fields/SmartTextField.js';

export interface VanillaSmartFieldOptions {
  element: HTMLElement;
  config: SmartFieldConfig;
  onValueChange?: (value: string) => void;
  onSuggestions?: (suggestions: string[]) => void;
}

export class VanillaSmartField {
  private element: HTMLElement;
  private smartField: SmartTextField;
  private suggestionModal?: HTMLElement;
  private isRetrieving: boolean = false;

  constructor(options: VanillaSmartFieldOptions) {
    this.element = options.element;
    this.smartField = new SmartTextField(options.config, {
      onRetrieval: (suggestions) => {
        this.showSuggestions(suggestions);
        options.onSuggestions?.(suggestions);
      },
      onValueChange: (value) => {
        options.onValueChange?.(value);
      }
    });

    this.setupEventListeners();
    this.addSmartIndicator();
  }

  private setupEventListeners(): void {
    // Handle input changes
    this.element.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      this.smartField.handleInput(target.value);
    });

    // Handle double click
    this.element.addEventListener('dblclick', () => {
      this.triggerRetrieval();
    });

    // Handle hover
    this.element.addEventListener('mouseenter', () => {
      const handlers = this.smartField.getInteractionHandlers();
      handlers.onMouseEnter();
    });

    this.element.addEventListener('mouseleave', () => {
      const handlers = this.smartField.getInteractionHandlers();
      handlers.onMouseLeave();
    });
  }

  private addSmartIndicator(): void {
    const indicator = document.createElement('div');
    indicator.className = 'ronen-smart-indicator';
    indicator.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 8px;
      height: 8px;
      background-color: #3b82f6;
      border-radius: 50%;
      opacity: 0.6;
      pointer-events: none;
      z-index: 10;
    `;
    indicator.title = 'Smart field - double-click or hover to retrieve suggestions';

    // Make parent element relative if not already
    const parent = this.element.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    parent?.appendChild(indicator);
  }

  private async triggerRetrieval(): Promise<void> {
    if (this.isRetrieving) return;
    
    this.isRetrieving = true;
    this.updateIndicator(true);
    this.showSuggestions([]);
  }

  private updateIndicator(loading: boolean): void {
    const indicator = this.element.parentElement?.querySelector('.ronen-smart-indicator') as HTMLElement;
    if (!indicator) return;

    if (loading) {
      indicator.innerHTML = `
        <div style="
          width: 16px;
          height: 16px;
          border: 2px solid #3b82f6;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    } else {
      indicator.innerHTML = '';
      indicator.style.cssText = `
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        background-color: #3b82f6;
        border-radius: 50%;
        opacity: 0.6;
        pointer-events: none;
        z-index: 10;
      `;
    }
  }

  private showSuggestions(suggestions: string[]): void {
    this.hideSuggestions();

    const rect = this.element.getBoundingClientRect();
    const modal = document.createElement('div');
    modal.className = 'ronen-suggestion-modal';
    modal.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      transform: translateY(-100%);
      z-index: 1000;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      padding: 16px;
      min-width: 256px;
      max-width: 384px;
      animation: slideUp 0.3s ease-out;
    `;

    modal.innerHTML = `
      <style>
        @keyframes slideUp {
          0% { transform: translateY(-100%) translateY(10px); opacity: 0; }
          100% { transform: translateY(-100%); opacity: 1; }
        }
        .ronen-suggestion-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          font-size: 14px;
          color: #374151;
          background: none;
          border: none;
          border-bottom: 1px solid #f3f4f6;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .ronen-suggestion-item:hover {
          background-color: #f9fafb;
        }
        .ronen-suggestion-item:last-child {
          border-bottom: none;
        }
        .ronen-prompt-button {
          display: flex;
          align-items: center;
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          font-size: 14px;
          color: #2563eb;
          background: none;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-bottom: 12px;
        }
        .ronen-prompt-button:hover {
          background-color: #eff6ff;
        }
        .ronen-close-button {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
        }
        .ronen-close-button:hover {
          color: #6b7280;
        }
      </style>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h3 style="font-size: 14px; font-weight: 500; color: #374151; margin: 0;">Smart Suggestions</h3>
        <button class="ronen-close-button" onclick="this.closest('.ronen-suggestion-modal').remove()">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button class="ronen-prompt-button" onclick="this.parentElement.querySelector('.ronen-prompt-form').style.display='block'; this.style.display='none';">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 8px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Search with prompt...
      </button>
      <div class="ronen-prompt-form" style="display: none;">
        <form onsubmit="event.preventDefault(); this.parentElement.parentElement.querySelector('.ronen-suggestions').innerHTML=''; this.parentElement.parentElement.querySelector('.ronen-loading').style.display='block'; window.ronenHandlePrompt(this.querySelector('input').value); this.style.display='none'; this.parentElement.querySelector('.ronen-prompt-button').style.display='flex';">
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 4px;">
              Describe what you're looking for:
            </label>
            <input type="text" placeholder="e.g., email addresses, phone numbers, names..." 
                   style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; outline: none; focus:ring-2 focus:ring-blue-500 focus:border-transparent;" />
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="submit" style="flex: 1; padding: 8px 12px; background: #2563eb; color: white; font-size: 14px; border-radius: 6px; border: none; cursor: pointer; transition: background-color 0.2s;">
              Search
            </button>
            <button type="button" onclick="this.closest('.ronen-prompt-form').style.display='none'; this.closest('.ronen-prompt-form').parentElement.querySelector('.ronen-prompt-button').style.display='flex';" 
                    style="padding: 8px 12px; border: 1px solid #d1d5db; color: #374151; font-size: 14px; border-radius: 6px; background: white; cursor: pointer; transition: background-color 0.2s;">
              Cancel
            </button>
          </div>
        </form>
      </div>
      <div class="ronen-loading" style="display: none; text-align: center; padding: 16px; color: #6b7280; font-size: 14px;">
        Loading suggestions...
      </div>
      <div class="ronen-suggestions">
        ${suggestions.length > 0 ? 
          suggestions.map(suggestion => 
            `<button class="ronen-suggestion-item" onclick="window.ronenSelectSuggestion('${suggestion.replace(/'/g, "\\'")}'); this.closest('.ronen-suggestion-modal').remove();">${suggestion}</button>`
          ).join('') :
          '<div style="text-align: center; padding: 16px; color: #6b7280; font-size: 14px;">No suggestions available</div>'
        }
      </div>
    `;

    document.body.appendChild(modal);
    this.suggestionModal = modal;

    // Set up global handlers
    (window as any).ronenSelectSuggestion = (suggestion: string) => {
      (this.element as HTMLInputElement | HTMLTextAreaElement).value = suggestion;
      this.element.dispatchEvent(new Event('input', { bubbles: true }));
      this.hideSuggestions();
      this.updateIndicator(false);
      this.isRetrieving = false;
    };

    (window as any).ronenHandlePrompt = async (prompt: string) => {
      await this.smartField.handlePrompt(prompt);
    };

    // Close modal when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (modal && !modal.contains(event.target as Node)) {
        this.hideSuggestions();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    // Store cleanup function
    (modal as any).cleanup = () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }

  private hideSuggestions(): void {
    if (this.suggestionModal) {
      const cleanup = (this.suggestionModal as any).cleanup;
      if (cleanup) cleanup();
      this.suggestionModal.remove();
      this.suggestionModal = undefined;
    }
  }

  public destroy(): void {
    this.hideSuggestions();
    this.smartField.destroy();
    
    // Remove indicator
    const indicator = this.element.parentElement?.querySelector('.ronen-smart-indicator');
    indicator?.remove();
  }

  public getValue(): string {
    return (this.element as HTMLInputElement | HTMLTextAreaElement).value;
  }

  public setValue(value: string): void {
    (this.element as HTMLInputElement | HTMLTextAreaElement).value = value;
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
