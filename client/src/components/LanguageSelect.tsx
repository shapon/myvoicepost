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
  /** When true, prepends an "Auto-detect" option (code: "auto"). Use for source language only. */
  showAutoDetect?: boolean;
}

export default function LanguageSelect({
  value,
  onValueChange,
  label,
  placeholder = "Language",
  testIdPrefix = "lang",
  showAutoDetect = false,
}: LanguageSelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm text-muted-foreground">{label}</label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger data-testid={`select-${testIdPrefix}`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {showAutoDetect && (
            <SelectItem value="auto" data-testid={`option-${testIdPrefix}-auto`}>
              ?? Auto-detect
            </SelectItem>
          )}
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
