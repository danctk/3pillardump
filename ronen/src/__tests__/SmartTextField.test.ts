import { SmartTextField } from '../fields/SmartTextField';
import { MemoryStorage } from '../storage/MemoryStorage';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('SmartTextField', () => {
  let smartField: SmartTextField;
  const mockConfig = {
    id: 'test-field',
    maxHistoryItems: 10,
    enableLLM: false,
    llmProvider: 'local' as const
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
    smartField = new SmartTextField(mockConfig);
  });

  afterEach(() => {
    smartField.destroy();
    // Clear localStorage after each test
    localStorage.clear();
  });

  it('should create a SmartTextField instance', () => {
    expect(smartField).toBeInstanceOf(SmartTextField);
  });

  it('should handle input and save to memory', async () => {
    const onValueChange = jest.fn();
    const smartFieldWithCallback = new SmartTextField(mockConfig, {
      onValueChange
    });

    await smartFieldWithCallback.handleInput('test value');
    
    expect(onValueChange).toHaveBeenCalledWith('test value');
    
    const history = smartFieldWithCallback.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].value).toBe('test value');
    
    smartFieldWithCallback.destroy();
  });

  it('should not save empty values', async () => {
    await smartField.handleInput('');
    await smartField.handleInput('   ');
    
    const history = smartField.getHistory();
    expect(history).toHaveLength(0);
  });

  it('should generate suggestions', async () => {
    // Add some test data
    await smartField.handleInput('test value 1');
    await smartField.handleInput('test value 2');
    
    const suggestions = await smartField.generateSuggestions('');
    expect(suggestions).toContain('test value 1');
    expect(suggestions).toContain('test value 2');
  });

  it('should handle prompt-based suggestions', async () => {
    const onRetrieval = jest.fn();
    const smartFieldWithCallback = new SmartTextField(mockConfig, {
      onRetrieval
    });

    // Add some test data
    await smartFieldWithCallback.handleInput('john@example.com');
    await smartFieldWithCallback.handleInput('jane@example.com');
    
    await smartFieldWithCallback.handlePrompt('email');
    
    expect(onRetrieval).toHaveBeenCalled();
    
    smartFieldWithCallback.destroy();
  });

  it('should clear history', async () => {
    await smartField.handleInput('test value');
    expect(smartField.getHistory()).toHaveLength(1);
    
    smartField.clearHistory();
    expect(smartField.getHistory()).toHaveLength(0);
  });

  it('should get interaction handlers', () => {
    const handlers = smartField.getInteractionHandlers();
    
    expect(handlers).toHaveProperty('onDoubleClick');
    expect(handlers).toHaveProperty('onMouseEnter');
    expect(handlers).toHaveProperty('onMouseLeave');
    
    expect(typeof handlers.onDoubleClick).toBe('function');
    expect(typeof handlers.onMouseEnter).toBe('function');
    expect(typeof handlers.onMouseLeave).toBe('function');
  });
});
