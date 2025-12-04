#!/usr/bin/env node

// Simple test script to verify edge LLM functionality
console.log('🧪 Testing Ronen Edge LLM Provider...\n');

// Test 1: Import the library
console.log('1. Testing library imports...');
try {
  const { EdgeLLMProvider } = require('./dist/index.js');
  console.log('✅ EdgeLLMProvider imported successfully');
} catch (error) {
  console.log('❌ Failed to import EdgeLLMProvider:', error.message);
  process.exit(1);
}

// Test 2: Create provider instance
console.log('\n2. Testing provider instantiation...');
try {
  const { EdgeLLMProvider } = require('./dist/index.js');
  const provider = new EdgeLLMProvider();
  console.log('✅ EdgeLLMProvider created successfully');
  console.log('📊 Model info:', provider.getModelInfo());
} catch (error) {
  console.log('❌ Failed to create EdgeLLMProvider:', error.message);
  process.exit(1);
}

// Test 3: Test local search fallback
console.log('\n3. Testing local search fallback...');
try {
  const { EdgeLLMProvider } = require('./dist/index.js');
  const provider = new EdgeLLMProvider();
  
  const mockHistory = [
    { id: '1', value: 'john@example.com', timestamp: Date.now(), metadata: {} },
    { id: '2', value: 'jane@example.com', timestamp: Date.now(), metadata: {} },
    { id: '3', value: 'John Smith', timestamp: Date.now(), metadata: {} },
    { id: '4', value: '555-123-4567', timestamp: Date.now(), metadata: {} }
  ];

  // Test without waiting for model (should use local search)
  provider.generateSuggestions('email', mockHistory).then(suggestions => {
    console.log('✅ Local search fallback working');
    console.log('📝 Suggestions:', suggestions);
  }).catch(error => {
    console.log('❌ Local search failed:', error.message);
  });

} catch (error) {
  console.log('❌ Local search test failed:', error.message);
}

console.log('\n🎉 Basic tests completed!');
console.log('\n📋 Next steps:');
console.log('1. Open examples/edge-llm-test.html in your browser');
console.log('2. Wait for the model to load (first time takes ~30 seconds)');
console.log('3. Test the smart fields with double-click and hover interactions');
console.log('4. Try different prompts to see AI-generated suggestions');
console.log('\n🚀 The edge LLM will work entirely offline after the initial download!');



