// Angular adapter - only available when @angular/core is installed
import { SmartFieldConfig } from '../types/index.js';
import { SmartTextField } from '../fields/SmartTextField.js';

// This will be conditionally imported in the main index file
// For now, we'll create a placeholder that can be replaced when Angular is available

export interface AngularSmartFieldDirective {
  ronenConfig: SmartFieldConfig;
  ronenValue: string;
  ronenValueChange: any;
  ronenSuggestions: any;
}

// Placeholder class - will be replaced with actual Angular directive when available
export class RonenSmartFieldDirective {
  ronenConfig!: SmartFieldConfig;
  ronenValue: string = '';
  ronenValueChange: any;
  ronenSuggestions: any;

  constructor() {
    console.warn('Angular adapter not available. Please install @angular/core to use Angular features.');
  }
}
