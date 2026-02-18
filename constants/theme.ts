
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Enterprise Blue Palette for Professional & Trustworthy Feel
const lightPalette = {
  primary: '#0056b3', // Enterprise Blue (similar to Bootstrap primary)
  onPrimary: '#FFFFFF',
  primaryContainer: '#D1E7DD', // Light Blue/Greenish tint or just lighter blue
  onPrimaryContainer: '#001D3F', // Deep Blue
  secondary: '#17a2b8', // Info Cyan
  onSecondary: '#FFFFFF',
  secondaryContainer: '#D1ECF1',
  onSecondaryContainer: '#0C5460',
  tertiary: '#ffc107', // Warning Yellow
  onTertiary: '#212529',
  tertiaryContainer: '#FFF3CD',
  onTertiaryContainer: '#856404',
  error: '#dc3545', // Danger Red
  onError: '#FFFFFF',
  errorContainer: '#F8D7DA',
  onErrorContainer: '#721C24',
  background: '#F8F9FA', // Light Gray
  onBackground: '#212529', // Dark Gray
  surface: '#FFFFFF',
  onSurface: '#212529',
  surfaceVariant: '#E9ECEF', // Gray 200
  onSurfaceVariant: '#495057', // Gray 600
  outline: '#ADB5BD',
  elevation: {
    level0: 'transparent',
    level1: '#FFFFFF',
    level2: '#F8F9FA',
    level3: '#E9ECEF',
    level4: '#DEE2E6',
    level5: '#CED4DA',
  },
};

const darkPalette = {
  primary: '#3395ff', // Lighter Blue for Dark Mode
  onPrimary: '#002a5c',
  primaryContainer: '#004085',
  onPrimaryContainer: '#cce5ff',
  secondary: '#3dd5f3', // Lighter Cyan
  onSecondary: '#063f4a',
  secondaryContainer: '#125a69',
  onSecondaryContainer: '#D1ECF1',
  tertiary: '#ffda6a', // Lighter Yellow
  onTertiary: '#533f03',
  tertiaryContainer: '#856404',
  onTertiaryContainer: '#FFF3CD',
  error: '#ea868f', // Lighter Red
  onError: '#5c1218',
  errorContainer: '#721C24',
  onErrorContainer: '#F8D7DA',
  background: '#212529', // Dark Gray
  onBackground: '#F8F9FA', // Light Gray
  surface: '#343A40', // Gray 700
  onSurface: '#F8F9FA',
  surfaceVariant: '#495057', // Gray 600
  onSurfaceVariant: '#DEE2E6', // Gray 300
  outline: '#6C757D',
};

export const AppLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightPalette,
  },
  roundness: 16, // Softer corners
};

export const AppDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkPalette,
  },
  roundness: 16,
};
