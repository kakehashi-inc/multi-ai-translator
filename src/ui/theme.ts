import { createTheme, type Theme } from '@mui/material/styles';
import type { UISettings } from '../types/settings';
import { tokens } from './design-tokens';

function resolveMode(theme: UISettings['theme']): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function createAppTheme(themeSetting: UISettings['theme']): Theme {
  const mode = resolveMode(themeSetting);
  return createTheme({
    palette: {
      mode,
      primary: { main: tokens.color.brand.primary },
      secondary: { main: tokens.color.brand.secondary },
      success: { main: tokens.color.status.success },
      error: { main: tokens.color.status.error },
      warning: { main: tokens.color.status.warning },
      info: { main: tokens.color.status.info }
    },
    spacing: tokens.space.sm, // 8px base grid
    shape: {
      borderRadius: tokens.radius.md
    },
    typography: {
      // Use OS-native fonts only. Avoid "Roboto" so MUI does not implicitly
      // depend on the Google Font (no CDN access, fully offline-friendly).
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif',
      fontSize: 14
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true
        },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600
          }
        }
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
          fullWidth: true
        }
      },
      MuiSelect: {
        defaultProps: {
          size: 'small'
        }
      }
    }
  });
}
