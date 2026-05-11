import { createContext, useContext, useState, ReactNode } from 'react';
import { SavedItem } from '../lib/api';

interface EditingSavedItemContextType {
  editingItem: SavedItem | null;
  setEditingItem: (item: SavedItem | null) => void;
  clearEditingItem: () => void;
}

const EditingSavedItemContext = createContext<EditingSavedItemContextType | undefined>(undefined);

export function EditingSavedItemProvider({ children }: { children: ReactNode }) {
  const [editingItem, setEditingItem] = useState<SavedItem | null>(null);

  const clearEditingItem = () => setEditingItem(null);

  return (
    <EditingSavedItemContext.Provider value={{ editingItem, setEditingItem, clearEditingItem }}>
      {children}
    </EditingSavedItemContext.Provider>
  );
}

export function useEditingSavedItem() {
  const context = useContext(EditingSavedItemContext);
  if (context === undefined) {
    throw new Error('useEditingSavedItem must be used within EditingSavedItemProvider');
  }
  return context;
}
