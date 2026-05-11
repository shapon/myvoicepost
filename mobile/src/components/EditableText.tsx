import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';

interface EditableTextProps {
  value: string;
  onChange: (text: string) => void;
  label: string;
  style?: 'normal' | 'highlight';
  editable?: boolean;
}

export function EditableText({ value, onChange, label, style = 'normal', editable = true }: EditableTextProps) {
  const colors = useThemeColors();
  const [isEditing, setIsEditing] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (!isInternalUpdate.current) {
      setDisplayValue(value);
    } else {
      isInternalUpdate.current = false;
    }
  }, [value, label]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    isInternalUpdate.current = true;
    if (onChange) {
      onChange(displayValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDisplayValue(value);
    setIsEditing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[
          styles.label,
          { color: style === 'highlight' ? colors.primary : colors.textSecondary },
          style === 'highlight' && { fontWeight: '600' },
        ]}>
          {label}
        </Text>
        <View style={styles.actions}>
          {isEditing ? (
            <>
              <TouchableOpacity
                onPress={handleSave}
                style={styles.saveButton}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCancel}
                style={styles.cancelButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={28} color={colors.error} />
              </TouchableOpacity>
            </>
          ) : editable ? (
            <TouchableOpacity onPress={handleEdit} style={styles.button}>
              <Ionicons
                name="create-outline"
                size={20}
                color={style === 'highlight' ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isEditing ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.primary, backgroundColor: colors.surfaceLight, color: colors.text },
              style === 'highlight' && { fontSize: 16, lineHeight: 24 },
            ]}
            value={displayValue}
            onChangeText={setDisplayValue}
            multiline
            autoFocus={false}
            editable={true}
            placeholder="Enter text..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
      ) : (
        <View style={styles.textContainer}>
          <Text style={[
            styles.text,
            { color: style === 'highlight' ? colors.text : colors.textSecondary },
            style === 'highlight' && { fontSize: 16, lineHeight: 24, fontWeight: '500' },
          ]}>
            {displayValue}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    padding: 4,
  },
  saveButton: {
    padding: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
  },
  cancelButton: {
    padding: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
  },
  inputContainer: {
    width: '100%',
  },
  input: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textContainer: {
    width: '100%',
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
});
