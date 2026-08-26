import { useEffect, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";

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
  contentSource: z.enum(["tbn", "third_party"], { message: "Choose TBN content or third-party content" }),
  tbnMediaId: z.string().optional(),
  type: z.enum(["Film", "TVSeries", "TBN_FAST", "TBN_Linear", "WoF_FAST"]),
  year: z.string().refine(
    (value) => !value || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear() + 5),
    () => ({ message: `Year must be between 1900 and ${new Date().getFullYear() + 5}` }),
  ).optional(),
  description: z.string().optional(),
  notes: z.string().max(5000, "Notes must be 5,000 characters or fewer").optional(),
  broadcastRightsDuration: z.string().optional(),
  broadcastRightsTerm: z.enum(["none", "months", "years", "in_perpetuity"]),
  broadcastRightsCustomTerm: z.string().max(50, "Custom term must be 50 characters or fewer").optional(),
  digitalRightsDuration: z.string().optional(),
  digitalRightsTerm: z.enum(["none", "months", "years", "in_perpetuity"]),
  digitalRightsCustomTerm: z.string().max(50, "Custom term must be 50 characters or fewer").optional(),
  internationalRightsDuration: z.string().optional(),
  internationalRightsTerm: z.enum(["none", "months", "years", "in_perpetuity"]),
  internationalRightsCustomTerm: z.string().max(50, "Custom term must be 50 characters or fewer").optional(),
  internationalBroadcastAirAmount: z.string().refine(
    (value) => !value || (/^\d+$/.test(value) && Number(value) > 0),
    "Broadcast Air Amount must be a positive whole number",
  ).optional(),
  youtubeRightsDuration: z.string().optional(),
  youtubeRightsTerm: z.enum(["none", "months", "years", "in_perpetuity"]),
  youtubeRightsCustomTerm: z.string().max(50, "Custom term must be 50 characters or fewer").optional(),
  hasCleans: z.boolean().default(false),
  hasCaptions: z.boolean().default(false),
  seasons: z.array(seasonSchema).default([]),
}).superRefine((values, ctx) => {
  if (values.contentSource === "tbn" && !values.tbnMediaId?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tbnMediaId"], message: "TBN Media ID is required for TBN content" });
  }
  const rights = [
    ["broadcastRightsDuration", values.broadcastRightsDuration, values.broadcastRightsTerm, values.broadcastRightsCustomTerm],
    ["digitalRightsDuration", values.digitalRightsDuration, values.digitalRightsTerm, values.digitalRightsCustomTerm],
    ["internationalRightsDuration", values.internationalRightsDuration, values.internationalRightsTerm, values.internationalRightsCustomTerm],
    ["youtubeRightsDuration", values.youtubeRightsDuration, values.youtubeRightsTerm, values.youtubeRightsCustomTerm],
  ] as const;
  rights.forEach(([field, duration, term, customTerm]) => {
    if ((term === "months" || term === "years") && (!duration || !/^\d+$/.test(duration) || Number(duration) <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Enter a positive whole number" });
    } else if (term === "none" && duration && (!/^\d+$/.test(duration) || Number(duration) <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Enter a positive whole number" });
    } else if (term === "in_perpetuity" && duration) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Leave the number blank for this term" });
    } else if (term === "none" && customTerm?.trim() && !duration) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Enter a positive whole number" });
    }
  });
  if (values.type === "TVSeries") {
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
  }
});

type ContentFormValues = z.infer<typeof contentSchema>;
type RightsDurationName = "broadcastRightsDuration" | "digitalRightsDuration" | "internationalRightsDuration" | "youtubeRightsDuration";
type RightsTermName = "broadcastRightsTerm" | "digitalRightsTerm" | "internationalRightsTerm" | "youtubeRightsTerm";
type RightsCustomTermName = "broadcastRightsCustomTerm" | "digitalRightsCustomTerm" | "internationalRightsCustomTerm" | "youtubeRightsCustomTerm";

function RightsDurationFields({
  form, label, durationName, termName, customTermName, testId,
}: {
  form: ReturnType<typeof useForm<ContentFormValues>>;
  label: string;
  durationName: RightsDurationName;
  termName: RightsTermName;
  customTermName: RightsCustomTermName;
  testId: string;
}) {
  const term = form.watch(termName);
  const customTerm = form.watch(customTermName);
  const [termOpen, setTermOpen] = useState(false);
  const numberDisabled = term === "in_perpetuity";
  const termValue = term === "months"
    ? "Months"
    : term === "years"
      ? "Years"
      : term === "in_perpetuity"
        ? "In Perpetuity"
        : customTerm ?? "";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{label}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={durationName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number</FormLabel>
              <FormControl>
                <Input
                  key={`${testId}-${term}`}
                  {...field}
                  type="number"
                  min="1"
                  step="1"
                  placeholder={numberDisabled ? "Not needed" : "e.g. 6"}
                  disabled={numberDisabled}
                  data-testid={`input-${testId}-duration`}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={customTermName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Term</FormLabel>
              <Popover open={termOpen} onOpenChange={setTermOpen}>
                <FormControl>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={termOpen}
                      className="w-full justify-between font-normal"
                      data-testid={`select-${testId}-term`}
                    >
                      <span className={termValue ? "" : "text-muted-foreground"}>
                        {termValue || "Select or enter term..."}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                </FormControl>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-2">
                  <Input
                    ref={field.ref}
                    name={field.name}
                    value={term === "none" ? customTerm ?? "" : ""}
                    maxLength={50}
                    autoFocus
                    placeholder="Type a custom term..."
                    onBlur={field.onBlur}
                    onChange={(event) => {
                      form.setValue(termName, "none", { shouldValidate: true });
                      field.onChange(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (field.value ?? "").trim()) {
                        event.preventDefault();
                        setTermOpen(false);
                      }
                    }}
                    data-testid={`input-${testId}-custom-term`}
                  />
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {[
                      { value: "months" as const, label: "Months" },
                      { value: "years" as const, label: "Years" },
                      { value: "in_perpetuity" as const, label: "In Perpetuity" },
                    ].map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          form.setValue(termName, option.value, { shouldValidate: true });
                          field.onChange("");
                          if (option.value === "in_perpetuity") {
                            form.setValue(durationName, "", { shouldValidate: true });
                          }
                          setTermOpen(false);
                        }}
                      >
                        <Check className={`h-4 w-4 ${term === option.value ? "opacity-100" : "opacity-0"}`} />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

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
      contentSource: undefined,
      tbnMediaId: "",
      type: "Film",
      year: "",
      description: "",
      notes: "",
      broadcastRightsDuration: "",
      broadcastRightsTerm: "none",
      broadcastRightsCustomTerm: "",
      digitalRightsDuration: "",
      digitalRightsTerm: "none",
      digitalRightsCustomTerm: "",
      internationalRightsDuration: "",
      internationalRightsTerm: "none",
      internationalRightsCustomTerm: "",
      internationalBroadcastAirAmount: "",
      youtubeRightsDuration: "",
      youtubeRightsTerm: "none",
      youtubeRightsCustomTerm: "",
      hasCleans: false,
      hasCaptions: false,
      seasons: [],
    },
  });
  const seasons = useFieldArray({ control: form.control, name: "seasons" });
  const selectedType = form.watch("type");
  const selectedSource = form.watch("contentSource");

  useEffect(() => {
    if (open) {
      form.reset({
        title: content?.title ?? "",
        contentSource: content?.contentSource ?? undefined,
        tbnMediaId: content?.tbnMediaId ?? "",
        type: (content?.type as ContentFormValues["type"]) ?? "Film",
        year: content?.year ? String(content.year) : "",
        description: content?.description ?? "",
        notes: content?.notes ?? "",
        broadcastRightsDuration: content?.broadcastRightsDuration ? String(content.broadcastRightsDuration) : "",
        broadcastRightsTerm: content?.broadcastRightsTerm ?? "none",
        broadcastRightsCustomTerm: content?.broadcastRightsCustomTerm ?? "",
        digitalRightsDuration: content?.digitalRightsDuration ? String(content.digitalRightsDuration) : "",
        digitalRightsTerm: content?.digitalRightsTerm ?? "none",
        digitalRightsCustomTerm: content?.digitalRightsCustomTerm ?? "",
        internationalRightsDuration: content?.internationalRightsDuration ? String(content.internationalRightsDuration) : "",
        internationalRightsTerm: content?.internationalRightsTerm ?? "none",
        internationalRightsCustomTerm: content?.internationalRightsCustomTerm ?? "",
        internationalBroadcastAirAmount: content?.internationalBroadcastAirAmount ? String(content.internationalBroadcastAirAmount) : "",
        youtubeRightsDuration: content?.youtubeRightsDuration ? String(content.youtubeRightsDuration) : "",
        youtubeRightsTerm: content?.youtubeRightsTerm ?? "none",
        youtubeRightsCustomTerm: content?.youtubeRightsCustomTerm ?? "",
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
      contentSource: values.contentSource,
      tbnMediaId: values.contentSource === "tbn" ? values.tbnMediaId?.trim() || null : null,
      type: values.type as CreateContentItemRequestType,
      year: values.year ? parseInt(values.year, 10) : null,
      description: values.description || null,
      notes: values.notes || null,
      broadcastRightsDuration: values.broadcastRightsDuration ? Number(values.broadcastRightsDuration) : null,
      broadcastRightsTerm: values.broadcastRightsTerm === "none" ? null : values.broadcastRightsTerm,
      broadcastRightsCustomTerm: values.broadcastRightsTerm === "none" ? values.broadcastRightsCustomTerm?.trim() || null : null,
      digitalRightsDuration: values.digitalRightsDuration ? Number(values.digitalRightsDuration) : null,
      digitalRightsTerm: values.digitalRightsTerm === "none" ? null : values.digitalRightsTerm,
      digitalRightsCustomTerm: values.digitalRightsTerm === "none" ? values.digitalRightsCustomTerm?.trim() || null : null,
      internationalRightsDuration: values.internationalRightsDuration ? Number(values.internationalRightsDuration) : null,
      internationalRightsTerm: values.internationalRightsTerm === "none" ? null : values.internationalRightsTerm,
      internationalRightsCustomTerm: values.internationalRightsTerm === "none" ? values.internationalRightsCustomTerm?.trim() || null : null,
      internationalBroadcastAirAmount: values.internationalBroadcastAirAmount ? Number(values.internationalBroadcastAirAmount) : null,
      youtubeRightsDuration: values.youtubeRightsDuration ? Number(values.youtubeRightsDuration) : null,
      youtubeRightsTerm: values.youtubeRightsTerm === "none" ? null : values.youtubeRightsTerm,
      youtubeRightsCustomTerm: values.youtubeRightsTerm === "none" ? values.youtubeRightsCustomTerm?.trim() || null : null,
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
      <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Content" : "Add Title"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update metadata and season details for this catalog item."
              : "Add a new title to the content catalog."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Basic Information</h3>
              <p className="text-xs text-slate-500">Identify the title and whether it belongs to TBN.</p>
            </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contentSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content Source</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value === "third_party") form.setValue("tbnMediaId", "", { shouldValidate: true });
                      }}
                    >
                      <FormControl><SelectTrigger data-testid="select-content-source"><SelectValue placeholder="Choose source..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="tbn">TBN Content</SelectItem>
                        <SelectItem value="third_party">Third-Party Content</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedSource === "tbn" && (
                <FormField
                  control={form.control}
                  name="tbnMediaId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TBN Media ID</FormLabel>
                      <FormControl><Input placeholder="Enter TBN Media ID..." {...field} data-testid="input-tbn-media-id" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Rights Information</h3>
                <p className="text-xs text-slate-500">Enter any term, such as Weeks, Days, Hours, Months, Years, or In Perpetuity.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <RightsDurationFields form={form} label="Broadcast Rights" durationName="broadcastRightsDuration" termName="broadcastRightsTerm" customTermName="broadcastRightsCustomTerm" testId="broadcast-rights" />
                <RightsDurationFields form={form} label="Digital Rights" durationName="digitalRightsDuration" termName="digitalRightsTerm" customTermName="digitalRightsCustomTerm" testId="digital-rights" />
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  <RightsDurationFields form={form} label="International Rights" durationName="internationalRightsDuration" termName="internationalRightsTerm" customTermName="internationalRightsCustomTerm" testId="international-rights" />
                  <FormField
                    control={form.control}
                    name="internationalBroadcastAirAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Broadcast Air Amount</FormLabel>
                        <FormControl><Input type="number" min="1" step="1" placeholder="e.g. 4 allowed airings" {...field} data-testid="input-international-air-amount" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <RightsDurationFields form={form} label="YouTube Rights" durationName="youtubeRightsDuration" termName="youtubeRightsTerm" customTermName="youtubeRightsCustomTerm" testId="youtube-rights" />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="Additional title or rights notes..." className="min-h-[90px]" {...field} data-testid="input-content-notes" /></FormControl>
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
