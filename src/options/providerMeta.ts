import type { ProviderName } from '../types/settings';

export type ProviderFieldKey =
  | 'apiKey'
  | 'baseUrl'
  | 'host'
  | 'model'
  | 'maxTokens'
  | 'temperature';

export interface ProviderFieldDef {
  key: ProviderFieldKey;
  labelKey: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  optional?: boolean;
}

export interface ProviderMeta {
  name: ProviderName;
  displayName: string;
  fields: ProviderFieldDef[];
  supportsFetchModels: boolean;
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    name: 'gemini',
    displayName: 'Gemini (Google)',
    supportsFetchModels: true,
    fields: [
      { key: 'apiKey', labelKey: 'labelAPIKey', type: 'password' },
      { key: 'model', labelKey: 'labelModel', type: 'text', placeholder: 'gemini-pro' }
    ]
  },
  {
    name: 'anthropic',
    displayName: 'Anthropic (Claude)',
    supportsFetchModels: true,
    fields: [
      { key: 'apiKey', labelKey: 'labelAPIKey', type: 'password', placeholder: 'sk-ant-...' },
      {
        key: 'model',
        labelKey: 'labelModel',
        type: 'text',
        placeholder: 'claude-3-sonnet-20240229'
      },
      { key: 'maxTokens', labelKey: 'labelMaxTokens', type: 'number', min: 1 }
    ]
  },
  {
    name: 'anthropic-compatible',
    displayName: 'Anthropic Compatible',
    supportsFetchModels: true,
    fields: [
      {
        key: 'baseUrl',
        labelKey: 'labelBaseURL',
        type: 'text',
        placeholder: 'https://api.example.com'
      },
      { key: 'apiKey', labelKey: 'labelAPIKey', type: 'password', placeholder: 'sk-ant-...' },
      {
        key: 'model',
        labelKey: 'labelModel',
        type: 'text',
        placeholder: 'claude-3-opus-20240229'
      },
      { key: 'maxTokens', labelKey: 'labelMaxTokens', type: 'number', min: 1 }
    ]
  },
  {
    name: 'openai',
    displayName: 'OpenAI',
    supportsFetchModels: true,
    fields: [
      { key: 'apiKey', labelKey: 'labelAPIKey', type: 'password', placeholder: 'sk-...' },
      { key: 'model', labelKey: 'labelModel', type: 'text', placeholder: 'gpt-3.5-turbo' },
      {
        key: 'temperature',
        labelKey: 'labelTemperature',
        type: 'number',
        step: 0.1,
        min: 0,
        max: 2
      }
    ]
  },
  {
    name: 'openai-compatible',
    displayName: 'OpenAI Compatible',
    supportsFetchModels: true,
    fields: [
      {
        key: 'baseUrl',
        labelKey: 'labelBaseURL',
        type: 'text',
        placeholder: 'http://localhost:1234/v1'
      },
      { key: 'apiKey', labelKey: 'labelAPIKey', type: 'password', optional: true },
      { key: 'model', labelKey: 'labelModel', type: 'text' }
    ]
  },
  {
    name: 'ollama',
    displayName: 'Ollama',
    supportsFetchModels: true,
    fields: [
      { key: 'host', labelKey: 'labelHost', type: 'text' },
      { key: 'model', labelKey: 'labelModel', type: 'text', placeholder: 'llama2' }
    ]
  }
];
