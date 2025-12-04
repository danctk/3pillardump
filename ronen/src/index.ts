// Core types and interfaces
export * from './types/index.js';

// Core smart field functionality
export { SmartField } from './core/SmartField.js';
export { SmartTextField } from './fields/SmartTextField.js';

// Storage system
export { MemoryStorage } from './storage/MemoryStorage.js';

// LLM providers
export { LocalLLMProvider, OpenAIProvider, AnthropicProvider } from './llm/LLMProvider.js';
export { EdgeLLMProvider } from './llm/EdgeLLMProvider.js';

// Framework adapters
export { VanillaSmartField } from './adapters/VanillaAdapter.js';
export { RonenSmartFieldDirective } from './adapters/AngularAdapter.optional.js';

// React components (only if React is available)
let ReactComponents: any = {};
try {
  // Check if React is available at runtime
  if (typeof window !== 'undefined' && (window as any).React) {
    // Dynamic import for React components
    import('./components/SmartTextField.js').then(({ SmartTextField }) => {
      import('./components/SuggestionModal.js').then(({ SuggestionModal }) => {
        ReactComponents = {
          SmartTextField,
          SuggestionModal,
        };
      });
    });
  }
} catch (e) {
  // React not available, components will be undefined
}

export const React = ReactComponents;

// Utility functions
export const createSmartField = async (config: any, element?: HTMLElement) => {
  if (element) {
    const { VanillaSmartField } = await import('./adapters/VanillaAdapter.js');
    return new VanillaSmartField({ element, config });
  }
  const { SmartTextField } = await import('./fields/SmartTextField.js');
  return new SmartTextField(config);
};
