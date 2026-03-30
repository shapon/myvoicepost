import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Copy,
  Trash2,
  Pencil,
  Bookmark,
  Sparkles,
  Languages,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import type { SavedText } from "@shared/schema";
import { supportedLanguages } from "@shared/schema";
import { Link } from "wouter";

const ITEMS_PER_PAGE = 10;

function getLanguageName(code: string | null | undefined): string {
  if (!code) return "";
  const lang = supportedLanguages.find((l) => l.code === code);
  return lang ? lang.name : code;
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}

export default function SavedItems() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SavedText | null>(null);
  const [editOriginal, setEditOriginal] = useState("");
  const [editPolished, setEditPolished] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: savedData, isLoading } = useQuery<{ success: boolean; savedTexts: SavedText[]; count: number }>({
    queryKey: ["/api/v1/a/saved-texts"],
    enabled: !!user,
  });

  const savedItems = savedData?.savedTexts || [];

  const updateMutation = useMutation({
    mutationFn: async (item: { id: string; originalText: string; polishedText: string }) => {
      const res = await apiRequest("PUT", `/api/v1/a/saved-texts/${item.id}`, {
        originalText: item.originalText,
        polishedText: item.polishedText,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/saved-texts"] });
      setEditingItem(null);
      toast({ title: "Saved item updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/a/saved-texts/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/saved-texts"] });
      setDeletingId(null);
      toast({ title: "Item deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const openEdit = (item: SavedText) => {
    setEditingItem(item);
    setEditOriginal(item.originalText);
    setEditPolished(item.polishedText);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      originalText: editOriginal,
      polishedText: editPolished,
    });
  };

  const filtered = savedItems.filter((item) => {
    if (filterType !== "all" && item.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.originalText.toLowerCase().includes(q) ||
        item.polishedText.toLowerCase().includes(q) ||
        (item.translatedText && item.translatedText.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = filtered.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  if (!user) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <Bookmark className="w-12 h-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold" data-testid="text-login-prompt">
            Sign in to view saved items
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            Your saved polished and translated texts will appear here after you log in.
          </p>
          <Link href="/login">
            <Button data-testid="button-login-redirect">Log in</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Saved Items
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your saved polished and translated texts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search saved items..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select
              value={filterType}
              onValueChange={(val) => {
                setFilterType(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="polish">Polish</SelectItem>
                <SelectItem value="translate">Translate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Bookmark className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground" data-testid="text-empty-state">
                {searchQuery || filterType !== "all"
                  ? "No items match your search"
                  : "No saved items yet"}
              </p>
              {!searchQuery && filterType === "all" && (
                <p className="text-sm text-muted-foreground">
                  Polish or translate text and save it to see it here
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedItems.map((item) => (
                  <Card key={item.id} className="p-4" data-testid={`card-saved-item-${item.id}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="gap-1">
                            {item.type === "translate" ? (
                              <Languages className="w-3 h-3" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            {item.type === "translate" ? "Translation" : "Polish"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {getLanguageName(item.sourceLanguage)}
                            {item.type === "translate" && item.targetLanguage
                              ? ` -> ${getLanguageName(item.targetLanguage)}`
                              : ""}
                          </span>
                          {item.outputFormat && (
                            <Badge variant="outline" className="text-xs">
                              {item.outputFormat}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-date-${item.id}`}>
                          {formatDate(item.createdAt)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Original</p>
                          <p className="text-sm" data-testid={`text-original-${item.id}`}>
                            {truncateText(item.originalText)}
                          </p>
                        </div>

                        {item.type === "translate" && item.translatedText && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-0.5">Translated</p>
                            <p className="text-sm" data-testid={`text-translated-${item.id}`}>
                              {truncateText(item.translatedText)}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Polished</p>
                          <p className="text-sm" data-testid={`text-polished-${item.id}`}>
                            {truncateText(item.polishedText)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCopy(item.polishedText, item.id)}
                          data-testid={`button-copy-${item.id}`}
                        >
                          {copiedId === item.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(item)}
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(item.id)}
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Saved Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Original Text</label>
              <Textarea
                value={editOriginal}
                onChange={(e) => setEditOriginal(e.target.value)}
                rows={4}
                data-testid="textarea-edit-original"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Polished Text</label>
              <Textarea
                value={editPolished}
                onChange={(e) => setEditPolished(e.target.value)}
                rows={4}
                data-testid="textarea-edit-polished"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the saved item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
