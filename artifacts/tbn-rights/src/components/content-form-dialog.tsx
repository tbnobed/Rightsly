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
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const seasonSchema = z.object({
  id: z.string().optional(),
  seasonNumber: z.string().refine(
    (value) => /^\d+$/.test(value) && Number(value) > 0,
    "Season number must be a positive whole number",
  ),
  title: z.string().optional(),
  year: z.string().refine(
    (value) => !value || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear() + 5),
    () => ({ message: `Year must be between 1900 and ${new Date().getFullYear() + 5}` }),
  ).optional(),
  episodeCount: z.string().refine(
    (value) => !value || (/^\d+$/.test(value) && Number(value) >= 0),
    "Episode count must be a whole number",
  ).optional(),
});

const contentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["Film", "TVSeries", "TBN_FAST", "TBN_Linear", "WoF_FAST"]),
  year: z.string().refine(
    (value) => !value || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear() + 5),
    () => ({ message: `Year must be between 1900 and ${new Date().getFullYear() + 5}` }),
  ).optional(),
  description: z.string().optional(),
  hasCleans: z.boolean().default(false),
  hasCaptions: z.boolean().default(false),
  seasons: z.array(seasonSchema).default([]),
}).superRefine((values, ctx) => {
  if (values.type !== "TVSeries") return;
  const seen = new Set<number>();
  values.seasons.forEach((season, index) => {
    const number = Number(season.seasonNumber);
    if (seen.has(number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seasons", index, "seasonNumber"],
        message: `Season ${number} is already listed`,
      });
    }
    seen.add(number);
  });
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
      seasons: [],
    },
  });
  const seasons = useFieldArray({ control: form.control, name: "seasons" });
  const selectedType = form.watch("type");

  useEffect(() => {
    if (open) {
      form.reset({
        title: content?.title ?? "",
        type: (content?.type as ContentFormValues["type"]) ?? "Film",
        year: content?.year ? String(content.year) : "",
        description: content?.description ?? "",
        hasCleans: content?.hasCleans ?? false,
        hasCaptions: content?.hasCaptions ?? false,
        seasons: (content?.seasons ?? []).map((season) => ({
          id: season.id,
          seasonNumber: String(season.seasonNumber),
          title: season.title ?? "",
          year: season.year ? String(season.year) : "",
          episodeCount: season.episodeCount !== null && season.episodeCount !== undefined
            ? String(season.episodeCount)
            : "",
        })),
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
      seasons: values.type === "TVSeries"
        ? values.seasons.map((season) => ({
            id: season.id,
            seasonNumber: Number(season.seasonNumber),
            title: season.title || null,
            year: season.year ? Number(season.year) : null,
            episodeCount: season.episodeCount ? Number(season.episodeCount) : null,
          }))
        : [],
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
      const error = err as {
        response?: { data?: { message?: string } };
        data?: { message?: string };
        message?: string;
      };
      toast({
        title: "Save failed",
        description: error.response?.data?.message
          ?? error.data?.message
          ?? error.message
          ?? "Could not save the content item. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Content" : "Add Title"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update metadata and season details for this catalog item."
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
                      <Input type="number" min="1900" max={new Date().getFullYear() + 5} placeholder={String(new Date().getFullYear())} {...field} data-testid="input-content-year" />
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

            {selectedType === "TVSeries" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50" data-testid="section-content-seasons">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">Seasons</h3>
                    <p className="text-xs text-slate-500">Add or edit the seasons available for licensing.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextNumber = Math.max(
                        0,
                        ...form.getValues("seasons").map((season) => Number(season.seasonNumber) || 0),
                      ) + 1;
                      seasons.append({
                        seasonNumber: String(nextNumber),
                        title: "",
                        year: "",
                        episodeCount: "",
                      });
                    }}
                    data-testid="button-add-season"
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add Season
                  </Button>
                </div>

                {seasons.fields.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">
                    No seasons yet. Add the first season to make season-specific licensing available.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {seasons.fields.map((season, index) => (
                      <div key={season.id} className="grid grid-cols-12 items-start gap-3 p-4">
                        <FormField
                          control={form.control}
                          name={`seasons.${index}.seasonNumber`}
                          render={({ field }) => (
                            <FormItem className="col-span-3 sm:col-span-2">
                              <FormLabel>Season</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" step="1" {...field} data-testid={`input-season-number-${index}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`seasons.${index}.title`}
                          render={({ field }) => (
                            <FormItem className="col-span-9 sm:col-span-4">
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Optional season title" {...field} data-testid={`input-season-title-${index}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`seasons.${index}.year`}
                          render={({ field }) => (
                            <FormItem className="col-span-5 sm:col-span-2">
                              <FormLabel>Year</FormLabel>
                              <FormControl>
                                <Input type="number" min="1900" max={new Date().getFullYear() + 5} {...field} data-testid={`input-season-year-${index}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`seasons.${index}.episodeCount`}
                          render={({ field }) => (
                            <FormItem className="col-span-5 sm:col-span-3">
                              <FormLabel>Episodes</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="1" {...field} data-testid={`input-season-episodes-${index}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="col-span-2 sm:col-span-1 pt-8 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => seasons.remove(index)}
                            aria-label={`Remove season ${form.getValues(`seasons.${index}.seasonNumber`)}`}
                            data-testid={`button-remove-season-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
