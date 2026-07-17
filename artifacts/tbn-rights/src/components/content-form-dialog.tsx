import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateContent,
  useUpdateContent,
  getListContentQueryKey,
  getGetContentQueryKey,
  ContentItem,
  CreateContentItemRequestType,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";

const contentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["Film", "TVSeries", "TBN_FAST", "TBN_Linear", "WoF_FAST"]),
  year: z.string().optional(),
  description: z.string().optional(),
  hasCleans: z.boolean().default(false),
  hasCaptions: z.boolean().default(false),
});

type ContentFormValues = z.infer<typeof contentSchema>;

interface ContentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content?: ContentItem;
}

export function ContentFormDialog({ open, onOpenChange, content }: ContentFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!content;

  const createContent = useCreateContent();
  const updateContent = useUpdateContent();

  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
    defaultValues: {
      title: "",
      type: "Film",
      year: "",
      description: "",
      hasCleans: false,
      hasCaptions: false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: content?.title ?? "",
        type: (content?.type as ContentFormValues["type"]) ?? "Film",
        year: content?.year ? String(content.year) : "",
        description: content?.description ?? "",
        hasCleans: content?.hasCleans ?? false,
        hasCaptions: content?.hasCaptions ?? false,
      });
    }
  }, [open, content]);

  const isPending = createContent.isPending || updateContent.isPending;

  const onSubmit = async (values: ContentFormValues) => {
    const payload = {
      title: values.title,
      type: values.type as CreateContentItemRequestType,
      year: values.year ? parseInt(values.year, 10) : null,
      description: values.description || null,
      hasCleans: values.hasCleans,
      hasCaptions: values.hasCaptions,
    };

    try {
      if (isEdit && content) {
        await updateContent.mutateAsync({ id: content.id, data: payload });
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey(content.id) });
      } else {
        await createContent.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
      toast({
        title: isEdit ? "Content updated" : "Content created",
        description: isEdit
          ? "The catalog item has been updated."
          : "The new title has been added to the catalog.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Save failed",
        description: "Could not save the content item. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Content" : "Add Title"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update metadata for this catalog item."
              : "Add a new title to the content catalog."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter title..." {...field} data-testid="input-content-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-content-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Film">Film</SelectItem>
                        <SelectItem value="TVSeries">TV Series</SelectItem>
                        <SelectItem value="TBN_FAST">TBN FAST</SelectItem>
                        <SelectItem value="TBN_Linear">TBN Linear</SelectItem>
                        <SelectItem value="WoF_FAST">WoF FAST</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="2024" {...field} data-testid="input-content-year" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Synopsis..." {...field} data-testid="input-content-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 bg-slate-50/50">
              <FormField
                control={form.control}
                name="hasCleans"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        data-testid="checkbox-has-cleans"
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">Cleans available</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hasCaptions"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        data-testid="checkbox-has-captions"
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">Captions available</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-content">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={isPending}
                data-testid="button-save-content"
              >
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Title"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
