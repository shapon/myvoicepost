import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}: ButtonProps) {
  const colors = useThemeColors();

  const getButtonStyle = (): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      gap: 8,
    };

    const sizes: Record<string, ViewStyle> = {
      sm: { paddingVertical: 10, paddingHorizontal: 18 },
      md: { paddingVertical: 14, paddingHorizontal: 22 },
      lg: { paddingVertical: 16, paddingHorizontal: 26 },
    };

    const variants: Record<string, ViewStyle> = {
      primary: { backgroundColor: colors.primary },
      secondary: { backgroundColor: colors.secondary },
      outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
      ghost: { backgroundColor: 'transparent' },
    };

    return {
      ...base,
      ...sizes[size],
      ...variants[variant],
      opacity: disabled || loading ? 0.5 : 1,
    };
  };

  const getTextStyle = (): TextStyle => {
    const sizes: Record<string, TextStyle> = {
      sm: { fontSize: 14, letterSpacing: 0.2 },
      md: { fontSize: 16, letterSpacing: 0.3 },
      lg: { fontSize: 18, letterSpacing: 0.3 },
    };

    const variants: Record<string, TextStyle> = {
      primary: { color: '#ffffff' },
      secondary: { color: '#ffffff' },
      outline: { color: colors.text },
      ghost: { color: colors.text },
    };

    return {
      fontWeight: '600',
      ...sizes[size],
      ...variants[variant],
    };
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
