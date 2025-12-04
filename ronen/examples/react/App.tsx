import React, { useState } from 'react';
import { SmartTextField } from 'ronen';

const App: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  const handleFieldChange = (field: string) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const smartFieldConfig = {
    maxHistoryItems: 20,
    enableLLM: true,
    llmProvider: 'edge' as const
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
    }}>
      <div style={{
        background: 'white',
        padding: '30px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{
          color: '#1f2937',
          marginBottom: '30px',
          textAlign: 'center'
        }}>
          🤖 Ronen Smart Fields - React
        </h1>
        
        <div style={{
          background: '#eff6ff',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '30px',
          borderLeft: '4px solid #3b82f6'
        }}>
          <h3 style={{ marginTop: 0, color: '#1e40af' }}>How it works:</h3>
          <p style={{ marginBottom: 0, color: '#1e3a8a' }}>
            These React components remember everything you type and can retrieve past data. 
            Try double-clicking or hovering for 3 seconds to see smart suggestions!
          </p>
        </div>

        <form>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              Name
            </label>
            <SmartTextField
              config={{ ...smartFieldConfig, id: 'name' }}
              value={formData.name}
              onChange={handleFieldChange('name')}
              placeholder="Enter your name"
            />
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Double-click or hover to retrieve previous names
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              Email
            </label>
            <SmartTextField
              config={{ ...smartFieldConfig, id: 'email' }}
              value={formData.email}
              onChange={handleFieldChange('email')}
              placeholder="Enter your email"
            />
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Smart field will remember all email addresses you've entered
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              Phone Number
            </label>
            <SmartTextField
              config={{ ...smartFieldConfig, id: 'phone' }}
              value={formData.phone}
              onChange={handleFieldChange('phone')}
              placeholder="Enter your phone number"
            />
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Try typing "work" or "home" in the prompt search
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              Address
            </label>
            <SmartTextField
              config={{ ...smartFieldConfig, id: 'address' }}
              value={formData.address}
              onChange={handleFieldChange('address')}
              placeholder="Enter your address"
              multiline
              rows={3}
            />
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Multiline smart field with memory
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              Notes
            </label>
            <SmartTextField
              config={{ ...smartFieldConfig, id: 'notes' }}
              value={formData.notes}
              onChange={handleFieldChange('notes')}
              placeholder="Add some notes..."
              multiline
              rows={4}
            />
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Try entering different types of notes and see how the smart field learns
            </div>
          </div>
        </form>

        <div style={{
          marginTop: '30px',
          padding: '16px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px'
        }}>
          <h4 style={{ marginTop: 0, color: '#374151' }}>Current Form Data:</h4>
          <pre style={{
            fontSize: '12px',
            color: '#6b7280',
            overflow: 'auto',
            margin: 0
          }}>
            {JSON.stringify(formData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default App;
