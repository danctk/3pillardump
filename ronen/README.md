# 🤖 Ronen - Smart Fields Library

A powerful library of intelligent form fields with memory and LLM-powered interactions. Ronen fields remember everything you type and can retrieve past data through smart suggestions powered by local or cloud-based LLMs.

## ✨ Features

- **Memory System**: Automatically remembers all input values with local storage
- **Smart Retrieval**: Double-click or hover for 3 seconds to retrieve suggestions
- **LLM Integration**: Support for embedded edge LLM, OpenAI, Anthropic, or local fuzzy search
- **Multi-Framework**: Works with React, Angular, and vanilla JavaScript
- **Prompt-Based Search**: Describe what you're looking for in natural language
- **Modern UI**: Beautiful, accessible components with smooth animations

## 🚀 Quick Start

### Installation

```bash
npm install ronen
```

### React Usage

```tsx
import React, { useState } from 'react';
import { SmartTextField } from 'ronen';

function App() {
  const [value, setValue] = useState('');

  return (
    <SmartTextField
      config={{
        id: 'my-field',
        enableLLM: true,
        llmProvider: 'edge'
      }}
      value={value}
      onChange={setValue}
      placeholder="Type something..."
    />
  );
}
```

### Angular Usage

```typescript
import { Component } from '@angular/core';

@Component({
  template: `
    <input 
      ronenSmartField
      [ronenConfig]="config"
      [(ronenValue)]="value"
      (ronenValueChange)="onValueChange($event)"
      placeholder="Type something...">
  `
})
export class MyComponent {
  value = '';
  config = {
    id: 'my-field',
    enableLLM: true,
    llmProvider: 'edge'
  };

  onValueChange(value: string) {
    this.value = value;
  }
}
```

### Vanilla JavaScript Usage

```javascript
import { VanillaSmartField } from 'ronen';

const input = document.getElementById('my-input');
const smartField = new VanillaSmartField({
  element: input,
  config: {
    id: 'my-field',
    enableLLM: true,
    llmProvider: 'edge'
  },
  onValueChange: (value) => {
    console.log('Value changed:', value);
  }
});
```

## 🔧 Configuration

### SmartFieldConfig

```typescript
interface SmartFieldConfig {
  id: string;                    // Unique identifier for the field
  maxHistoryItems?: number;      // Maximum items to store (default: 50)
  enableLLM?: boolean;          // Enable LLM-powered suggestions (default: false)
  llmProvider?: 'edge' | 'openai' | 'anthropic' | 'local'; // LLM provider (default: 'edge')
  llmApiKey?: string;           // API key for cloud providers
  storageKey?: string;          // Custom storage key (defaults to id)
}
```

### LLM Providers

#### Edge Provider (Default)
Uses an embedded DistilGPT-2 model that runs entirely in the browser. No API key required, completely private, and fast responses.

```typescript
const config = {
  id: 'my-field',
  enableLLM: true,
  llmProvider: 'edge'
};
```

#### Local Provider
Uses fuzzy search for suggestions. No API key required.

```typescript
const config = {
  id: 'my-field',
  enableLLM: true,
  llmProvider: 'local'
};
```

#### OpenAI Provider
Uses GPT models for intelligent suggestions.

```typescript
const config = {
  id: 'my-field',
  enableLLM: true,
  llmProvider: 'openai',
  llmApiKey: 'your-openai-api-key'
};
```

#### Anthropic Provider
Uses Claude models for intelligent suggestions.

```typescript
const config = {
  id: 'my-field',
  enableLLM: true,
  llmProvider: 'anthropic',
  llmApiKey: 'your-anthropic-api-key'
};
```

## 🎯 Interactions

### Double-Click
Double-click any smart field to instantly retrieve suggestions from memory.

### Hover (3 seconds)
Hover over a field for 3 seconds to trigger the suggestion modal.

### Prompt Search
Click "Search with prompt..." in the suggestion modal to describe what you're looking for:
- "email addresses"
- "phone numbers starting with 555"
- "names containing 'john'"
- "addresses in California"

## 📦 Framework Support

### React
- `<SmartTextField>` component
- Full TypeScript support
- Hooks integration
- Controlled/uncontrolled modes

### Angular
- `ronenSmartField` directive
- Two-way data binding
- Event emitters
- Full TypeScript support

### Vanilla JavaScript
- `VanillaSmartField` class
- Direct DOM manipulation
- Event-driven architecture
- No framework dependencies

## 🎨 Styling

Ronen fields come with beautiful default styles using Tailwind CSS classes. The components are fully customizable:

```tsx
<SmartTextField
  config={config}
  className="my-custom-class"
  // ... other props
/>
```

### CSS Customization

You can override the default styles by targeting the generated classes:

```css
.ronen-smart-indicator {
  background-color: your-color !important;
}

.ronen-suggestion-modal {
  border-radius: 12px !important;
}
```

## 🔒 Privacy & Security

- **Local Storage**: All data is stored locally in the browser
- **No Tracking**: No analytics or tracking code
- **API Keys**: Only sent to your chosen LLM provider when using cloud services
- **Data Control**: You have full control over your data

## 🛠️ Development

### Building the Library

```bash
npm run build
```

### Running Examples

```bash
# Vanilla JS example
cd examples/vanilla-js
python -m http.server 8000

# React example
cd examples/react
npm start

# Angular example
cd examples/angular
ng serve
```

### Testing

```bash
npm test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📞 Support

- 📧 Email: support@ronen.dev
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/ronen/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-org/ronen/discussions)

## 🗺️ Roadmap

- [ ] Vue.js support
- [ ] Svelte support
- [ ] More field types (email, phone, date)
- [ ] Advanced LLM features
- [ ] Plugin system
- [ ] Theme customization
- [ ] Accessibility improvements

---

Made with ❤️ by the Ronen team
