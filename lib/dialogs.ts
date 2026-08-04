import { Alert, Platform } from 'react-native';

function webWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

export function showMessage(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    webWindow()?.alert(text);
    return;
  }

  Alert.alert(title, message);
}

export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(webWindow()?.confirm(options.message) ?? false);
  }

  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
