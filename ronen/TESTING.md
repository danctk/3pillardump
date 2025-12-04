# 🧪 Testing Ronen Smart Fields

This guide covers all the different ways to test the Ronen smart fields library.

## 🚀 **Quick Testing Methods**

### 1. **Build and Run Tests**
```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the library
npm run build
```

### 2. **Test the Edge LLM Provider**

The edge LLM provider uses an embedded DistilGPT-2 model that runs entirely in the browser. Here's how to test it:

#### **Method 1: Direct Browser Test**
1. Build the library: `npm run build`
2. Open `examples/edge-llm-test.html` in your browser
3. Watch the model load (first time takes ~30 seconds)
4. Type in the fields and double-click or hover for 3 seconds
5. See AI-powered suggestions generated locally!

#### **Method 2: Vanilla JS Example**
```bash
# Start a local server
cd examples/vanilla-js
python -m http.server 8000
# or
npx serve .

# Open http://localhost:8000
```

#### **Method 3: React Example**
```bash
cd examples/react
npm install
npm start
```

### 3. **Test Different LLM Providers**

You can test all four LLM providers:

```javascript
// Edge LLM (embedded, no API key needed)
const config = {
  id: 'test',
  enableLLM: true,
  llmProvider: 'edge'
};

// Local fuzzy search (no API key needed)
const config = {
  id: 'test',
  enableLLM: true,
  llmProvider: 'local'
};

// OpenAI (requires API key)
const config = {
  id: 'test',
  enableLLM: true,
  llmProvider: 'openai',
  llmApiKey: 'your-openai-key'
};

// Anthropic (requires API key)
const config = {
  id: 'test',
  enableLLM: true,
  llmProvider: 'anthropic',
  llmApiKey: 'your-anthropic-key'
};
```

## 🔧 **Testing Features**

### **Memory System**
- Type in fields and see data persist across page reloads
- Check browser localStorage for `smart-fields-memory`
- Test with different field IDs to ensure isolation

### **Smart Interactions**
- **Double-click**: Instantly retrieve suggestions
- **Hover (3 seconds)**: Trigger suggestion modal
- **Prompt search**: Type natural language queries

### **Edge LLM Features**
- **Model Loading**: First load takes ~30 seconds, subsequent loads are cached
- **Offline Operation**: Works without internet connection
- **Privacy**: All processing happens locally
- **Performance**: Fast responses after initial load

## 🎯 **Test Scenarios**

### **Basic Functionality**
1. Type text in a smart field
2. Double-click to see suggestions
3. Select a suggestion
4. Verify the field updates

### **Memory Persistence**
1. Type several different values
2. Refresh the page
3. Double-click the field
4. Verify previous values appear as suggestions

### **Prompt-Based Search**
1. Type various types of data (emails, names, addresses)
2. Double-click to open suggestions
3. Click "Search with prompt..."
4. Try prompts like:
   - "email addresses"
   - "names starting with J"
   - "phone numbers"
   - "addresses in California"

### **Edge LLM Testing**
1. Open the edge LLM test page
2. Wait for model to load (watch status indicator)
3. Type some text and test suggestions
4. Try different prompts to see AI-generated responses
5. Check browser console for model loading progress

## 🐛 **Debugging**

### **Check Console Logs**
```javascript
// Enable debug logging
localStorage.setItem('ronen-debug', 'true');
```

### **Inspect Memory Storage**
```javascript
// View all stored data
console.log(JSON.parse(localStorage.getItem('smart-fields-memory')));
```

### **Test Model Status**
```javascript
// Check if edge LLM is ready
import { EdgeLLMProvider } from 'ronen';
const edgeLLM = new EdgeLLMProvider();
console.log(edgeLLM.isReady());
console.log(edgeLLM.getModelInfo());
```

## 📱 **Cross-Browser Testing**

Test in different browsers:
- Chrome/Chromium
- Firefox
- Safari
- Edge

## 🔒 **Privacy Testing**

Verify privacy features:
- No external network calls when using edge/local providers
- Data stays in browser localStorage
- No tracking or analytics

## ⚡ **Performance Testing**

### **Edge LLM Performance**
- Initial model load: ~30 seconds
- Subsequent loads: <1 second (cached)
- Generation time: ~100-500ms per suggestion
- Memory usage: ~100-200MB for model

### **Memory System Performance**
- Storage: Instant
- Retrieval: <10ms
- Search: <50ms for 1000+ items

## 🚨 **Troubleshooting**

### **Edge LLM Not Loading**
1. Check browser console for errors
2. Ensure stable internet connection (for initial download)
3. Check available memory (needs ~200MB)
4. Try refreshing the page

### **Suggestions Not Appearing**
1. Verify `enableLLM: true` in config
2. Check that field has some history
3. Try different interaction methods (double-click vs hover)

### **Memory Not Persisting**
1. Check browser localStorage is enabled
2. Verify field has unique ID
3. Check for localStorage quota exceeded

## 📊 **Test Results**

After testing, you should see:
- ✅ Model loads successfully
- ✅ Suggestions appear on interaction
- ✅ Memory persists across sessions
- ✅ No external API calls (with edge/local providers)
- ✅ Fast response times
- ✅ Cross-browser compatibility

## 🎉 **Success Indicators**

The library is working correctly when:
1. Edge LLM model loads and shows "Ready" status
2. Double-clicking fields shows relevant suggestions
3. Prompt search returns contextual results
4. Data persists after page refresh
5. No console errors
6. Smooth animations and interactions

Happy testing! 🚀



