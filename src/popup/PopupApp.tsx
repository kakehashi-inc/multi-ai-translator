import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import {
  Alert,
  Box,
  Button,
  CssBaseline,
  MenuItem,
  Stack,
  TextField,
  ThemeProvider,
  Typography
} from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import ShortTextIcon from '@mui/icons-material/ShortText';
import RestoreIcon from '@mui/icons-material/Restore';
import SettingsIcon from '@mui/icons-material/Settings';
import CancelIcon from '@mui/icons-material/Cancel';
import { getEnabledProviders, getSettings } from '../utils/storage';
import { ConstVariables } from '../utils/const-variables';
import { getMessage, getSupportedLanguages } from '../utils/i18n';
import type { Settings } from '../types/settings';
import { createAppTheme } from '../ui/theme';
import { tokens } from '../ui/design-tokens';
import { useI18n } from '../ui/useI18n';

type StatusSeverity = 'success' | 'error' | 'info';

interface StatusState {
  message: string;
  severity: StatusSeverity;
}

export function PopupApp() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [sourceLanguage, setSourceLanguage] = useState<string>('auto');
  const [targetLanguage, setTargetLanguage] = useState<string>('');
  const [isPageTranslating, setIsPageTranslating] = useState(false);
  const [isSelectionTranslating, setIsSelectionTranslating] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);

  const themeSetting = settings?.ui.theme ?? 'auto';
  const muiTheme = useMemo(() => createAppTheme(themeSetting), [themeSetting]);
  const languages = useMemo(() => getSupportedLanguages(), []);

  const showStatus = useCallback((message: string, severity: StatusSeverity) => {
    setStatus({ message, severity });
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    if (severity !== 'error') {
      statusTimeoutRef.current = window.setTimeout(() => {
        setStatus(null);
        statusTimeoutRef.current = null;
      }, 5000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await getSettings();
        setSettings(loaded);

        const enabled = await getEnabledProviders();
        setProviders(enabled);

        setSourceLanguage(loaded.common.defaultSourceLanguage || 'auto');
        setTargetLanguage(loaded.common.defaultTargetLanguage || '');

        // Provider selection rule:
        //   1. If lastUsedProvider is set AND still enabled → use it
        //   2. Otherwise → use the first enabled provider
        let chosen = '';
        try {
          const response = (await browser.runtime.sendMessage({
            action: 'getLastUsedProvider'
          })) as { provider?: string } | undefined;
          if (response?.provider && enabled.includes(response.provider)) {
            chosen = response.provider;
          }
        } catch (error) {
          console.warn('[Popup] Failed to load last used provider:', error);
        }
        if (!chosen && enabled.length > 0) chosen = enabled[0];
        setSelectedProvider(chosen);

        await refreshContentState();
      } catch (error) {
        console.error('[Popup] Initialization error:', error);
        showStatus(t('errorFailedToInitialize'), 'error');
      }
    })();
  }, []);

  const refreshContentState = useCallback(async () => {
    try {
      const response = (await sendMessageToActiveTab({
        action: 'get-translation-state'
      })) as { canRestore?: boolean; isTranslated?: boolean } | undefined;
      setCanRestore(!!(response?.canRestore ?? response?.isTranslated));
    } catch {
      setCanRestore(false);
    }
    try {
      const selectionResponse = (await sendMessageToActiveTab({
        action: 'has-selection'
      })) as { hasSelection?: boolean } | undefined;
      setHasSelection(!!selectionResponse?.hasSelection);
    } catch {
      setHasSelection(false);
    }
  }, []);

  const handleTranslatePage = useCallback(async () => {
    try {
      if (isPageTranslating) {
        // Cancel the running page translation. 'restore-original' aborts the
        // in-flight provider request in the background worker and restores the
        // page; show a "cancelling" state until it resolves.
        showStatus(t('statusCancelling'), 'info');
        await sendMessageToActiveTab({ action: 'restore-original' });
        setIsPageTranslating(false);
        setIsSelectionTranslating(false);
        showStatus(t('statusCancelled'), 'info');
        await refreshContentState();
        return;
      }
      if (!selectedProvider) {
        showStatus(t('errorPleaseSelectProvider'), 'error');
        return;
      }

      setIsPageTranslating(true);
      setIsSelectionTranslating(false);
      showStatus(t('statusTranslatingPage'), 'info');

      await browser.runtime.sendMessage({
        action: 'setLastUsedProvider',
        data: { provider: selectedProvider }
      });

      const response = (await sendMessageToActiveTab({
        action: 'translate-page',
        provider: selectedProvider,
        language: targetLanguage,
        sourceLanguage
      })) as { success?: boolean; error?: string } | undefined;

      if (!response?.success) {
        throw new Error(response?.error || t('errorTranslationFailed'));
      }
      showStatus(t('statusPageTranslationStarted'), 'success');
    } catch (error) {
      console.error('[Popup] Translation error:', error);
      showStatus(t('errorTranslationFailedWithMessage', [(error as Error).message]), 'error');
    } finally {
      setIsPageTranslating(false);
      await refreshContentState();
    }
  }, [
    isPageTranslating,
    refreshContentState,
    selectedProvider,
    showStatus,
    sourceLanguage,
    t,
    targetLanguage
  ]);

  const handleTranslateSelection = useCallback(async () => {
    try {
      if (isSelectionTranslating) return;
      if (!selectedProvider) {
        showStatus(t('errorPleaseSelectProvider'), 'error');
        return;
      }

      setIsSelectionTranslating(true);
      setIsPageTranslating(false);

      const selectionResponse = (await sendMessageToActiveTab({
        action: 'get-selection-text'
      })) as { text?: string } | undefined;
      const selectionText =
        typeof selectionResponse?.text === 'string' ? selectionResponse.text : '';
      if (!selectionText.trim()) {
        showStatus(t('errorNoSelectionText'), 'error');
        return;
      }

      await browser.runtime.sendMessage({
        action: 'setLastUsedProvider',
        data: { provider: selectedProvider }
      });

      const response = (await sendMessageToActiveTab({
        action: 'translate-selection-inline',
        text: selectionText,
        provider: selectedProvider,
        language: targetLanguage,
        sourceLanguage
      })) as { success?: boolean; error?: string } | undefined;

      if (!response?.success) {
        throw new Error(response?.error || t('errorTranslationFailed'));
      }
      showStatus(t('statusSelectionPopupOpened'), 'success');
    } catch (error) {
      console.error('[Popup] Translation error:', error);
      showStatus(t('errorTranslationFailedWithMessage', [(error as Error).message]), 'error');
    } finally {
      setIsSelectionTranslating(false);
      await refreshContentState();
    }
  }, [
    isSelectionTranslating,
    refreshContentState,
    selectedProvider,
    showStatus,
    sourceLanguage,
    t,
    targetLanguage
  ]);

  const handleRestore = useCallback(async () => {
    try {
      await sendMessageToActiveTab({ action: 'restore-original' });
      showStatus(t('statusOriginalContentRestored'), 'success');
    } catch (error) {
      console.error('[Popup] Restore error:', error);
      showStatus(t('errorRestoreFailedWithMessage', [(error as Error).message]), 'error');
    } finally {
      setIsPageTranslating(false);
      setIsSelectionTranslating(false);
      await refreshContentState();
    }
  }, [refreshContentState, showStatus, t]);

  const handleOpenSettings = useCallback(() => {
    browser.runtime.openOptionsPage();
  }, []);

  const selectedModel = selectedProvider
    ? (settings?.providers?.[selectedProvider]?.model ?? '').trim()
    : '';
  const providerHelperText =
    providers.length === 0
      ? t('popupHelperEnableProvider')
      : selectedModel
        ? `${t('labelModel')}: ${selectedModel}`
        : undefined;

  const pageButtonLabel = isPageTranslating ? t('btnCancelTranslation') : t('btnTranslatePage');
  const pageButtonIcon = isPageTranslating ? <CancelIcon /> : <TranslateIcon />;
  const selectionDisabled = isPageTranslating || isSelectionTranslating || !hasSelection;

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ width: 320 }}>
        <Box
          sx={{
            px: 2,
            py: 1.75,
            background: `linear-gradient(135deg, ${tokens.color.brand.primary} 0%, ${tokens.color.brand.secondary} 100%)`,
            color: 'common.white'
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2
            }}
          >
            {t('extensionName')}
          </Typography>
        </Box>

        <Stack spacing={1.5} sx={{ p: 2 }}>
          <TextField
            select
            label={t('labelProvider')}
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            disabled={providers.length === 0}
            helperText={providerHelperText}
          >
            {providers.map((provider) => (
              <MenuItem key={provider} value={provider}>
                {ConstVariables.formatProviderName(provider)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label={t('labelSourceLanguage')}
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
          >
            <MenuItem value="auto">{t('languageAutoDetect')}</MenuItem>
            {languages.map((lang) => (
              <MenuItem key={lang.id} value={lang.id}>
                {lang.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label={t('labelTargetLanguage')}
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          >
            {languages.map((lang) => (
              <MenuItem key={lang.id} value={lang.id}>
                {lang.label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            variant="contained"
            startIcon={pageButtonIcon}
            onClick={handleTranslatePage}
            disabled={isSelectionTranslating}
          >
            {pageButtonLabel}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<ShortTextIcon />}
            onClick={handleTranslateSelection}
            disabled={selectionDisabled}
          >
            {t('btnTranslateSelection')}
          </Button>

          {canRestore && (
            <Button variant="outlined" startIcon={<RestoreIcon />} onClick={handleRestore}>
              {t('btnRestore')}
            </Button>
          )}

          {status && (
            <Alert severity={status.severity} variant="outlined" sx={{ py: 0.5 }}>
              {status.message}
            </Alert>
          )}
        </Stack>

        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button
            fullWidth
            variant="text"
            startIcon={<SettingsIcon />}
            onClick={handleOpenSettings}
          >
            {t('btnSettings')}
          </Button>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

async function sendMessageToActiveTab(message: Record<string, unknown>): Promise<unknown> {
  const tab = await getContentTabForAction();
  if (!tab?.id) {
    throw new Error(getMessage('errorNoAccessibleTab'));
  }
  try {
    return await browser.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (isMissingContentScriptError(error)) {
      await injectContentScript(tab.id);
      return await browser.tabs.sendMessage(tab.id, message);
    }
    throw error;
  }
}

function isMissingContentScriptError(error: unknown): boolean {
  const message = (error as Error | undefined)?.message;
  if (!message) return false;
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

async function getContentTabForAction(): Promise<browser.Tabs.Tab | undefined> {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (isContentTab(activeTab)) return activeTab;
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs.find(isContentTab);
}

function isContentTab(tab?: browser.Tabs.Tab): boolean {
  if (!tab?.url) return false;
  return (
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    !tab.url.startsWith('edge://')
  );
}

async function injectContentScript(tabId: number): Promise<void> {
  const manifest = browser.runtime.getManifest();
  const files: string[] = [];
  (manifest.content_scripts || []).forEach((script) => {
    (script.js || []).forEach((file) => files.push(file));
  });
  if (files.length === 0) return;

  if (browser.scripting?.executeScript) {
    await browser.scripting.executeScript({ target: { tabId }, files });
    return;
  }
  if (browser.tabs && 'executeScript' in browser.tabs) {
    for (const file of files) {
      await (
        browser.tabs as unknown as {
          executeScript: (tabId: number, details: { file: string }) => Promise<unknown>;
        }
      ).executeScript(tabId, { file });
    }
  }
}
