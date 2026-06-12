import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import browser from 'webextension-polyfill';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  CssBaseline,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  exportSettings,
  getBrowserLanguage,
  getSettings,
  importSettings,
  resetSettings,
  saveSettings
} from '../utils/storage';
import { ConstVariables } from '../utils/const-variables';
import { getMessage, getSupportedLanguages } from '../utils/i18n';
import type { ProviderName, ProviderSettings, Settings } from '../types/settings';
import { PROVIDER_META, type ProviderFieldDef } from './providerMeta';
import { createAppTheme } from '../ui/theme';
import { useI18n } from '../ui/useI18n';

const {
  PROVIDER_ORDER,
  DEFAULT_BATCH_MAX_ITEMS,
  DEFAULT_BATCH_MAX_CHARS,
  DEFAULT_OPENAI_TEMPERATURE,
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  DEFAULT_OLLAMA_HOST
} = ConstVariables;

type TabKey = 'providers' | 'common';

type StatusSeverity = 'success' | 'error' | 'info' | 'warning';

interface StatusState {
  open: boolean;
  message: string;
  severity: StatusSeverity;
}

type ModelsMap = Record<ProviderName, string[]>;

type RevealMap = Record<string, boolean>;

const FIELD_PLACEHOLDERS: Record<string, string> = {
  'anthropic-maxTokens': `${DEFAULT_ANTHROPIC_MAX_TOKENS}`,
  'anthropic-compatible-maxTokens': `${DEFAULT_ANTHROPIC_MAX_TOKENS}`,
  'openai-temperature': `${DEFAULT_OPENAI_TEMPERATURE}`,
  'ollama-host': DEFAULT_OLLAMA_HOST
};

function getFieldPlaceholder(provider: ProviderName, field: ProviderFieldDef): string | undefined {
  return FIELD_PLACEHOLDERS[`${provider}-${field.key}`] ?? field.placeholder;
}

function fieldValueToInputValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

export function OptionsApp() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentTab, setCurrentTab] = useState<TabKey>('providers');
  const [status, setStatus] = useState<StatusState>({
    open: false,
    message: '',
    severity: 'info'
  });
  const [models, setModels] = useState<ModelsMap>({} as ModelsMap);
  const [revealMap, setRevealMap] = useState<RevealMap>({});
  const [isDirty, setIsDirty] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const themeSetting = settings?.ui.theme ?? 'auto';
  const muiTheme = useMemo(() => createAppTheme(themeSetting), [themeSetting]);

  useEffect(() => {
    document.title = t('extensionName') + ' - ' + t('settingsSubtitle');
    (async () => {
      try {
        const loaded = await getSettings();
        setSettings(loaded);
      } catch (error) {
        console.error('[Options] Initialization error:', error);
        showStatus(t('statusFailedToLoadSettings'), 'error');
      }
    })();
  }, [t]);

  const showStatus = useCallback((message: string, severity: StatusSeverity) => {
    setStatus({ open: true, message, severity });
  }, []);

  const handleCloseStatus = useCallback(() => {
    setStatus((prev) => ({ ...prev, open: false }));
  }, []);

  const updateProviderField = useCallback(
    <K extends keyof ProviderSettings>(
      provider: ProviderName,
      key: K,
      value: ProviderSettings[K]
    ) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const nextProviders = {
          ...prev.providers,
          [provider]: {
            ...(prev.providers[provider] ?? { enabled: false }),
            [key]: value
          }
        };
        return { ...prev, providers: nextProviders };
      });
      setIsDirty(true);
    },
    []
  );

  const updateCommonField = useCallback(
    <K extends keyof Settings['common']>(key: K, value: Settings['common'][K]) => {
      setSettings((prev) => {
        if (!prev) return prev;
        return { ...prev, common: { ...prev.common, [key]: value } };
      });
      setIsDirty(true);
    },
    []
  );

  const updateUiField = useCallback(
    <K extends keyof Settings['ui']>(key: K, value: Settings['ui'][K]) => {
      setSettings((prev) => {
        if (!prev) return prev;
        return { ...prev, ui: { ...prev.ui, [key]: value } };
      });
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!settings) return;
    try {
      await saveSettings(settings);
      setIsDirty(false);
      showStatus(t('statusSettingsSaved'), 'success');
    } catch (error) {
      console.error('[Options] Save error:', error);
      showStatus(t('statusFailedToSaveSettings') + ': ' + (error as Error).message, 'error');
    }
  }, [settings, showStatus, t]);

  const handleReset = useCallback(async () => {
    if (!confirm(t('confirmResetSettings'))) {
      return;
    }
    try {
      await resetSettings();
      const fresh = await getSettings();
      setSettings(fresh);
      setIsDirty(false);
      showStatus(t('statusSettingsReset'), 'success');
    } catch (error) {
      console.error('[Options] Reset error:', error);
      showStatus(t('statusFailedToResetSettings'), 'error');
    }
  }, [showStatus, t]);

  const handleExport = useCallback(async () => {
    try {
      const json = await exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'multi-ai-translator-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      showStatus(t('statusSettingsExported'), 'success');
    } catch (error) {
      console.error('[Options] Export error:', error);
      showStatus(t('statusFailedToExportSettings'), 'error');
    }
  }, [showStatus, t]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importSettings(text);
        const fresh = await getSettings();
        setSettings(fresh);
        setIsDirty(false);
        showStatus(t('statusSettingsImported'), 'success');
      } catch (error) {
        console.error('[Options] Import error:', error);
        showStatus(t('statusFailedToImportSettings') + ': ' + (error as Error).message, 'error');
      } finally {
        event.target.value = '';
      }
    },
    [showStatus, t]
  );

  const handleFetchModels = useCallback(
    async (provider: ProviderName) => {
      if (!settings) return;
      try {
        showStatus(
          t('statusFetchingModels', [ConstVariables.formatProviderName(provider)]),
          'info'
        );
        const config = buildModelFetchConfig(provider, settings.providers[provider]);
        if ('error' in config) {
          showStatus(config.error, 'error');
          return;
        }
        const response = (await browser.runtime.sendMessage({
          action: 'getModels',
          data: { providerName: provider, config: config.config }
        })) as { success: boolean; models?: string[]; error?: string };

        if (response.success && response.models && response.models.length > 0) {
          setModels((prev) => ({ ...prev, [provider]: response.models! }));
          showStatus(t('statusFoundModels', [String(response.models.length)]), 'success');
        } else if (response.success) {
          showStatus(t('statusNoModelsFound'), 'info');
        } else {
          showStatus(response.error || t('statusNoModelsFound'), 'error');
        }
      } catch (error) {
        console.error('[Options] Fetch models error:', error);
        showStatus(t('statusFailedToFetchModels') + ': ' + (error as Error).message, 'error');
      }
    },
    [settings, showStatus, t]
  );

  const toggleReveal = useCallback((id: string) => {
    setRevealMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (!settings) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <Container maxWidth="md" sx={{ py: 6 }}>
          <Typography>{t('statusLoading')}</Typography>
        </Container>
      </ThemeProvider>
    );
  }

  const languages = getSupportedLanguages();

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 700
            }}
          >
            {t('extensionName')}
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{
              color: 'text.secondary'
            }}
          >
            {t('settingsSubtitle')}
          </Typography>
        </Box>

        <Tabs
          value={currentTab}
          onChange={(_e, value: TabKey) => setCurrentTab(value)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="providers" label={t('tabProviders')} />
          <Tab value="common" label={t('tabCommon')} />
        </Tabs>

        {currentTab === 'providers' && (
          <Stack spacing={2}>
            <Typography variant="h6">{t('headingProviders')}</Typography>
            {PROVIDER_META.map((meta) => {
              const providerSettings = settings.providers[meta.name] ?? { enabled: false };
              return (
                <Card key={meta.name} variant="outlined">
                  <CardHeader
                    title={
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 600
                        }}
                      >
                        {meta.displayName}
                      </Typography>
                    }
                    action={
                      <Switch
                        checked={!!providerSettings.enabled}
                        onChange={(_e, checked) =>
                          updateProviderField(meta.name, 'enabled', checked)
                        }
                        slotProps={{
                          input: { 'aria-label': t('labelEnableProvider', [meta.displayName]) }
                        }}
                      />
                    }
                  />
                  <CardContent sx={{ pt: 0 }}>
                    <Stack spacing={2}>
                      {meta.fields.map((field) => {
                        const fieldId = `${meta.name}-${field.key}`;
                        const rawValue = (providerSettings as unknown as Record<string, unknown>)[
                          field.key
                        ];
                        const inputValue = fieldValueToInputValue(rawValue);
                        const placeholder = getFieldPlaceholder(meta.name, field);

                        if (field.key === 'model' && meta.supportsFetchModels) {
                          const suggestions = models[meta.name] ?? [];
                          return (
                            <Stack
                              key={fieldId}
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1}
                              sx={{
                                alignItems: 'stretch'
                              }}
                            >
                              <Autocomplete
                                freeSolo
                                fullWidth
                                value={inputValue}
                                options={suggestions}
                                onInputChange={(_e, value) =>
                                  updateProviderField(
                                    meta.name,
                                    'model',
                                    value as ProviderSettings['model']
                                  )
                                }
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label={t(field.labelKey)}
                                    placeholder={placeholder}
                                  />
                                )}
                              />
                              <Button
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                onClick={() => handleFetchModels(meta.name)}
                                sx={{ whiteSpace: 'nowrap' }}
                              >
                                {t('btnFetchModels')}
                              </Button>
                            </Stack>
                          );
                        }

                        if (field.type === 'password') {
                          const revealed = !!revealMap[fieldId];
                          return (
                            <TextField
                              key={fieldId}
                              type={revealed ? 'text' : 'password'}
                              label={
                                t(field.labelKey) + (field.optional ? ' ' + t('labelOptional') : '')
                              }
                              placeholder={placeholder}
                              value={inputValue}
                              onChange={(e) =>
                                updateProviderField(
                                  meta.name,
                                  field.key,
                                  e.target.value as ProviderSettings[typeof field.key]
                                )
                              }
                              slotProps={{
                                input: {
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Button
                                        size="small"
                                        onClick={() => toggleReveal(fieldId)}
                                        aria-label={t('labelToggleVisibility')}
                                        sx={{ minWidth: 0 }}
                                      >
                                        {revealed ? (
                                          <VisibilityOffIcon fontSize="small" />
                                        ) : (
                                          <VisibilityIcon fontSize="small" />
                                        )}
                                      </Button>
                                    </InputAdornment>
                                  )
                                }
                              }}
                            />
                          );
                        }

                        return (
                          <TextField
                            key={fieldId}
                            type={field.type}
                            label={t(field.labelKey)}
                            placeholder={placeholder}
                            value={inputValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const parsed =
                                field.type === 'number'
                                  ? raw === ''
                                    ? undefined
                                    : Number(raw)
                                  : raw;
                              updateProviderField(
                                meta.name,
                                field.key,
                                parsed as ProviderSettings[typeof field.key]
                              );
                            }}
                            slotProps={{
                              htmlInput: {
                                step: field.step,
                                min: field.min,
                                max: field.max
                              }
                            }}
                          />
                        );
                      })}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}

        {currentTab === 'common' && (
          <Stack spacing={2}>
            <Typography variant="h6">{t('headingCommon')}</Typography>
            <TextField
              select
              label={t('labelDefaultSourceLanguage')}
              value={settings.common.defaultSourceLanguage || 'auto'}
              onChange={(e) => updateCommonField('defaultSourceLanguage', e.target.value)}
            >
              <MenuItem value="auto">{t('languageAutoDetect')}</MenuItem>
              {languages.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  {lang.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('labelDefaultTargetLanguage')}
              value={settings.common.defaultTargetLanguage || getBrowserLanguage()}
              onChange={(e) => updateCommonField('defaultTargetLanguage', e.target.value)}
            >
              {languages.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  {lang.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="number"
              label={t('labelBatchMaxItems')}
              placeholder={`${DEFAULT_BATCH_MAX_ITEMS}`}
              value={settings.common.batchMaxItems ?? ''}
              onChange={(e) => {
                const parsed =
                  e.target.value === '' ? DEFAULT_BATCH_MAX_ITEMS : Number(e.target.value);
                updateCommonField('batchMaxItems', parsed);
              }}
              slotProps={{ htmlInput: { min: 1, max: 100 } }}
            />
            <TextField
              type="number"
              label={t('labelBatchMaxChars')}
              placeholder={`${DEFAULT_BATCH_MAX_CHARS}`}
              value={settings.common.batchMaxChars ?? ''}
              onChange={(e) => {
                const parsed =
                  e.target.value === '' ? DEFAULT_BATCH_MAX_CHARS : Number(e.target.value);
                updateCommonField('batchMaxChars', parsed);
              }}
              slotProps={{ htmlInput: { min: 100, max: 1000000 } }}
            />

            <Typography variant="h6" sx={{ mt: 2 }}>
              {t('headingUI')}
            </Typography>
            <TextField
              select
              label={t('labelTheme')}
              value={settings.ui.theme}
              onChange={(e) => updateUiField('theme', e.target.value as Settings['ui']['theme'])}
            >
              <MenuItem value="auto">{t('themeAuto')}</MenuItem>
              <MenuItem value="light">{t('themeLight')}</MenuItem>
              <MenuItem value="dark">{t('themeDark')}</MenuItem>
            </TextField>
          </Stack>
        )}

        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            mt: 4,
            py: 2,
            bgcolor: 'background.default',
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap'
          }}
        >
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!isDirty}
          >
            {t('btnSave')}
          </Button>
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleReset}>
            {t('btnReset')}
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>
            {t('btnExport')}
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={handleImportClick}>
            {t('btnImport')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={handleImportFile}
          />
        </Box>

        <Snackbar
          open={status.open}
          autoHideDuration={5000}
          onClose={handleCloseStatus}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={status.severity}
            variant="filled"
            onClose={handleCloseStatus}
            sx={{ width: '100%' }}
          >
            {status.message}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

type FetchConfigResult = { config: Record<string, unknown> } | { error: string };

function buildModelFetchConfig(
  provider: ProviderName,
  settings: ProviderSettings | undefined
): FetchConfigResult {
  const apiKey = settings?.apiKey?.trim() ?? '';
  const baseUrl = settings?.baseUrl?.trim() ?? '';
  const host = settings?.host?.trim() ?? '';
  const apiKeyError = (label: string) => ({
    error: getMessage('errorAPIKeyRequiredForModels', [label])
  });
  const baseUrlError = (label: string) => ({
    error: getMessage('errorBaseURLRequiredForModels', [label])
  });
  switch (provider) {
    case 'openai':
      return apiKey ? { config: { apiKey } } : apiKeyError('OpenAI');
    case 'anthropic':
      return apiKey ? { config: { apiKey } } : apiKeyError('Anthropic');
    case 'gemini':
      return apiKey ? { config: { apiKey } } : apiKeyError('Gemini');
    case 'ollama':
      return { config: { host: host || DEFAULT_OLLAMA_HOST } };
    case 'openai-compatible':
      if (!baseUrl) {
        return baseUrlError('OpenAI-compatible');
      }
      return { config: { baseUrl, apiKey } };
    case 'anthropic-compatible':
      if (!baseUrl) {
        return baseUrlError('Anthropic-compatible');
      }
      return { config: { baseUrl, apiKey } };
    default:
      return { config: {} };
  }
}

// referenced for completeness; PROVIDER_ORDER is used by storage but kept here for explicit ordering of providers shown in UI
void PROVIDER_ORDER;
