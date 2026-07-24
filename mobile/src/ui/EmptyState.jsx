// Centered empty/error state with an icon, message and optional action.
import { View } from 'react-native'
import { useTheme } from '@/src/theme'
import Text from './Text'
import Icon from './Icon'
import Button from './Button'

export default function EmptyState({ icon = 'info', title, message, actionLabel, onAction, style }) {
  const theme = useTheme()
  return (
    <View
      style={[
        { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing['5xl'], gap: theme.spacing.md },
        style,
      ]}
    >
      <Icon name={icon} size={40} color={theme.colors.textFaint} />
      {title ? (
        <Text variant="h3" center>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text variant="body" muted center>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="primary" style={{ marginTop: theme.spacing.sm }} />
      ) : null}
    </View>
  )
}
