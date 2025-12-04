import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <div class="container">
      <h1>🤖 Ronen Smart Fields - Angular</h1>
      
      <div class="description">
        <h3>How it works:</h3>
        <p>These Angular components remember everything you type and can retrieve past data. Try double-clicking or hovering for 3 seconds to see smart suggestions!</p>
      </div>

      <form>
        <div class="form-group">
          <label for="name">Name</label>
          <div class="field-container">
            <input 
              type="text" 
              id="name" 
              placeholder="Enter your name"
              ronenSmartField
              [ronenConfig]="nameConfig"
              [(ronenValue)]="formData.name"
              (ronenValueChange)="onFieldChange('name', $event)"
              (ronenSuggestions)="onSuggestions('name', $event)">
          </div>
          <div class="info">Double-click or hover to retrieve previous names</div>
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <div class="field-container">
            <input 
              type="email" 
              id="email" 
              placeholder="Enter your email"
              ronenSmartField
              [ronenConfig]="emailConfig"
              [(ronenValue)]="formData.email"
              (ronenValueChange)="onFieldChange('email', $event)"
              (ronenSuggestions)="onSuggestions('email', $event)">
          </div>
          <div class="info">Smart field will remember all email addresses you've entered</div>
        </div>

        <div class="form-group">
          <label for="phone">Phone Number</label>
          <div class="field-container">
            <input 
              type="tel" 
              id="phone" 
              placeholder="Enter your phone number"
              ronenSmartField
              [ronenConfig]="phoneConfig"
              [(ronenValue)]="formData.phone"
              (ronenValueChange)="onFieldChange('phone', $event)"
              (ronenSuggestions)="onSuggestions('phone', $event)">
          </div>
          <div class="info">Try typing "work" or "home" in the prompt search</div>
        </div>

        <div class="form-group">
          <label for="address">Address</label>
          <div class="field-container">
            <textarea 
              id="address" 
              rows="3" 
              placeholder="Enter your address"
              ronenSmartField
              [ronenConfig]="addressConfig"
              [(ronenValue)]="formData.address"
              (ronenValueChange)="onFieldChange('address', $event)"
              (ronenSuggestions)="onSuggestions('address', $event)"></textarea>
          </div>
          <div class="info">Multiline smart field with memory</div>
        </div>

        <div class="form-group">
          <label for="notes">Notes</label>
          <div class="field-container">
            <textarea 
              id="notes" 
              rows="4" 
              placeholder="Add some notes..."
              ronenSmartField
              [ronenConfig]="notesConfig"
              [(ronenValue)]="formData.notes"
              (ronenValueChange)="onFieldChange('notes', $event)"
              (ronenSuggestions)="onSuggestions('notes', $event)"></textarea>
          </div>
          <div class="info">Try entering different types of notes and see how the smart field learns</div>
        </div>
      </form>

      <div class="form-data">
        <h4>Current Form Data:</h4>
        <pre>{{ formData | json }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
      min-height: 100vh;
    }

    .container > div {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    h1 {
      color: #1f2937;
      margin-bottom: 30px;
      text-align: center;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #374151;
    }

    input, textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .description {
      background: #eff6ff;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #3b82f6;
    }

    .description h3 {
      margin-top: 0;
      color: #1e40af;
    }

    .description p {
      margin-bottom: 0;
      color: #1e3a8a;
    }

    .field-container {
      position: relative;
    }

    .info {
      font-size: 14px;
      color: #6b7280;
      margin-top: 8px;
    }

    .form-data {
      margin-top: 30px;
      padding: 16px;
      background-color: #f3f4f6;
      border-radius: 8px;
    }

    .form-data h4 {
      margin-top: 0;
      color: #374151;
    }

    .form-data pre {
      font-size: 12px;
      color: #6b7280;
      overflow: auto;
      margin: 0;
    }
  `]
})
export class AppComponent {
  formData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  };

  // Smart field configurations
  nameConfig = {
    id: 'name',
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  emailConfig = {
    id: 'email',
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  phoneConfig = {
    id: 'phone',
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  addressConfig = {
    id: 'address',
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  notesConfig = {
    id: 'notes',
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  onFieldChange(field: string, value: string): void {
    this.formData = { ...this.formData, [field]: value };
    console.log(`${field} changed:`, value);
  }

  onSuggestions(field: string, suggestions: string[]): void {
    console.log(`${field} suggestions:`, suggestions);
  }
}
