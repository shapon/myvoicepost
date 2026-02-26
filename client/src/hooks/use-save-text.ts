import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SaveTextParams {
  type: "polish" | "translate";
  originalText: string;
  polishedText: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  translatedText?: string;
  outputFormat?: string;
  outputType?: string;
}

export function useSaveTextMutation() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: SaveTextParams) => {
      const res = await apiRequest("POST", "/api/v1/a/saved-texts", params);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/saved-texts"] });
      toast({ title: "Saved", description: "Text saved to your collection." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });
}
