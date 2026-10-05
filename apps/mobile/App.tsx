import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EmptyState } from './src/components/states';
import { API_CONFIG } from './src/config';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {API_CONFIG.error ? (
          // Falla cerrado: sin origen HTTPS válido en release no se monta la app ni se hace ninguna solicitud.
          <EmptyState title="La aplicación no está configurada" hint={API_CONFIG.error} icon="alert-circle-outline" testID="config-error" />
        ) : (
          <AppNavigator />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
