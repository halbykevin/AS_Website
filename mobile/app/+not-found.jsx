import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen, Header, EmptyState } from '@/src/ui';
import { useTheme } from '@/src/theme';

export default function NotFound() {
  const theme = useTheme();
  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Not found" onBack={() => router.replace('/')} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <EmptyState icon="info" title="Page not found" message="That screen doesn't exist." actionLabel="Go home" onAction={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
