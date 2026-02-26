import { supportedLanguages } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LanguageSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  testIdPrefix?: string;
}

export default function LanguageSelect({
  value,
  onValueChange,
  label,
  placeholder = "Language",
  testIdPrefix = "lang",
}: LanguageSelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm text-muted-foreground">{label}</label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger data-testid={`select-${testIdPrefix}`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {supportedLanguages.map((lang) => (
            <SelectItem
              key={lang.code}
              value={lang.code}
              data-testid={`option-${testIdPrefix}-${lang.code}`}
            >
              {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
