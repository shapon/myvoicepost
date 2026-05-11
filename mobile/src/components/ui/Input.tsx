import { forwardRef } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, icon, style, ...props }, ref) => {
    const colors = useThemeColors();

    return (
      <View style={styles.container}>
        {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surface, borderColor: colors.border },
            error && { borderColor: colors.error },
          ]}
        >
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              { color: colors.text },
              icon && styles.inputWithIcon,
              style,
            ]}
            placeholderTextColor={colors.textMuted}
            {...props}
          />
        </View>
        {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  iconContainer: {
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  inputWithIcon: {
    paddingLeft: 12,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
