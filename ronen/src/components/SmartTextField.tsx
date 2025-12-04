import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SmartTextField as SmartTextFieldCore } from '../fields/SmartTextField.js';
import { SmartFieldConfig } from '../types/index.js';
import { SuggestionModal } from './SuggestionModal';

interface SmartTextFieldProps {
  config: SmartFieldConfig;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
}

export const SmartTextField: React.FC<SmartTextFieldProps> = ({
  config,
  value = '',
  onChange,
  placeholder = 'Type something...',
  className = '',
  disabled = false,
  multiline = false,
  rows = 3
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isRetrieving, setIsRetrieving] = useState(false);
  
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const smartFieldRef = useRef<SmartTextFieldCore | null>(null);

  // Initialize smart field
  useEffect(() => {
    smartFieldRef.current = new SmartTextFieldCore(config, {
      onRetrieval: (newSuggestions) => {
        setSuggestions(newSuggestions);
        setIsRetrieving(false);
      },
      onValueChange: (newValue) => {
        setInternalValue(newValue);
        onChange?.(newValue);
      }
    });

    return () => {
      smartFieldRef.current?.destroy();
    };
  }, [config, onChange]);

  // Update internal value when prop changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);
    smartFieldRef.current?.handleInput(newValue);
  }, [onChange]);

  const handleRetrieval = useCallback(async () => {
    if (isRetrieving) return;
    
    setIsRetrieving(true);
    
    // Calculate modal position
    if (fieldRef.current) {
      const rect = fieldRef.current.getBoundingClientRect();
      setModalPosition({
        x: rect.left,
        y: rect.top
      });
    }
    
    setShowModal(true);
  }, [isRetrieving]);

  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setInternalValue(suggestion);
    onChange?.(suggestion);
    setShowModal(false);
    setIsRetrieving(false);
  }, [onChange]);

  const handlePromptSubmit = useCallback(async (prompt: string) => {
    setIsRetrieving(true);
    await smartFieldRef.current?.handlePrompt(prompt);
  }, []);

  const handleDoubleClick = useCallback(() => {
    handleRetrieval();
  }, [handleRetrieval]);

  const handleMouseEnter = useCallback(() => {
    if (smartFieldRef.current) {
      const handlers = smartFieldRef.current.getInteractionHandlers();
      handlers.onMouseEnter();
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (smartFieldRef.current) {
      const handlers = smartFieldRef.current.getInteractionHandlers();
      handlers.onMouseLeave();
    }
  }, []);

  const baseClasses = `
    w-full px-3 py-2 border border-gray-300 rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed
    transition-colors duration-200
    ${className}
  `.trim();

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={internalValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={baseClasses}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={internalValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className={baseClasses}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}

      {/* Smart field indicator */}
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
        <div className="flex items-center space-x-1">
          {isRetrieving && (
            <div className="animate-spin">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          )}
          <div className="w-2 h-2 bg-blue-500 rounded-full opacity-60" title="Smart field - double-click or hover to retrieve suggestions" />
        </div>
      </div>

      <SuggestionModal
        isOpen={showModal}
        suggestions={suggestions}
        onSelect={handleSuggestionSelect}
        onClose={() => {
          setShowModal(false);
          setIsRetrieving(false);
        }}
        onPromptSubmit={handlePromptSubmit}
        position={modalPosition}
      />
    </div>
  );
};
