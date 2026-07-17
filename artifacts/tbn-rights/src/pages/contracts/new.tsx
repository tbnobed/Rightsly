import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import {
  useCreateContract,
  useListPartners,
  getListPartnersQueryKey,
  useListContent,
  getListContentQueryKey,
  useRequestUploadUrl,
  useCreateContractAttachment,
  CreateContractRequestDirection,
  type CreateContractRequest,
} from "@workspace/api-client-react";
import { ArrowRight, Briefcase, FileDown, FileUp, ChevronLeft, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

const TERRITORY_OPTIONS = ["Global", "US", "Canada", "UK"] as const;
const DISTRIBUTION_OPTIONS = ["AVOD", "SVOD", "TVOD", "FAST", "Linear", "VOD", "Broadcast"] as const;
const DEPARTMENT_OPTIONS = ["Acquisition", "Distribution"] as const;
const RIGHTS_IN_PLATFORMS = ["TBN Broadcast", "TBN+", "YouTube", "Socials", "Yippee"] as const;
const SOCIAL_PLATFORMS = ["All Socials", "Facebook", "Instagram", "TikTok", "Other"] as const;

const formSchema = z.object({
  partnerId: z.string().min(1, "Partner is required"),
  licensor: z.string().optional(),
  licensee: z.string().optional(),
  startDate: z.string().optional(),
  endType: z.enum(["date", "perpetuity", "auto_renew"]),
  endDate: z.string().optional(),
  status: z.enum(["draft", "active", "expired", "in_perpetuity", "terminated"]).default("draft"),
  territories: z.array(z.string()).default([]),
  otherTerritories: z.string().optional(),
  distributionTypes: z.array(z.string()).default([]),
  royaltyType: z.enum(["revenue_share", "flat_fee", "other"]).nullable().optional(),
  royaltyDetails: z.string().optional(),
  paymentTerms: z.enum(["net_30", "net_60", "net_90"]).nullable().optional(),
  websiteLink: z.string().optional(),
  notes: z.string().optional(),
  departmentTags: z.array(z.string()).default([]),
  // Rights In
  riPlatforms: z.array(z.string()).default([]),
  riYoutubeChannel: z.string().optional(),
  riSocialPlatforms: z.array(z.string()).default([]),
  riSocialHandle: z.string().optional(),
  riGrantOfRights: z.string().optional(),
  riExclusivitySameAsDuration: z.boolean().default(false),
  riExclusivityStartDate: z.string().optional(),
  riExclusivityEndDate: z.string().optional(),
  riMarketingRights: z.string().optional(),
  // Rights Out
  platform: z.string().optional(),
  roAutoRenew: z.boolean().default(false),
  roHasAmendment: z.boolean().default(false),
  roExclusivity: z.enum(["exclusive", "non_exclusive"]).nullable().optional(),
  roReportingFrequency: z.enum(["monthly", "quarterly", "annually"]).nullable().optional(),
  roMinPaymentThreshold: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/** Toggle a value inside a string[] form field. */
function toggleArrayValue(current: string[], value: string, checked: boolean) {
  if (checked) {
    return current.includes(value) ? current : [...current, value];
  }
  return current.filter((v) => v !== value);
}

export default function NewContractWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<CreateContractRequestDirection | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createContract = useCreateContract();
  const requestUploadUrl = useRequestUploadUrl();
  const createAttachment = useCreateContractAttachment();

  const { data: partnersData } = useListPartners(undefined, {
    query: { queryKey: getListPartnersQueryKey() },
  });
  const partners = partnersData?.data || [];

  // Linked content
  const [contentSearch, setContentSearch] = useState("");
  const debouncedContentSearch = useDebounce(contentSearch, 300);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);

  const contentParams = { pageSize: 200, search: debouncedContentSearch || undefined };
  const { data: contentData, isLoading: contentLoading } = useListContent(contentParams, {
    query: { queryKey: getListContentQueryKey(contentParams) },
  });
  const contentItems = contentData?.data || [];

  // Contract document
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endType: "date",
      status: "draft",
      territories: [],
      distributionTypes: [],
      departmentTags: [],
      riPlatforms: [],
      riSocialPlatforms: [],
      riExclusivitySameAsDuration: false,
      roAutoRenew: false,
      roHasAmendment: false,
    },
  });

  const toggleContent = (id: string, checked: boolean) => {
    setSelectedContentIds((prev) => toggleArrayValue(prev, id, checked));
  };

  const uploadDocument = async (contractId: string, file: File) => {
    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
      data: { name: file.name, size: file.size, contentType: file.type || "application/pdf" },
    });
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    });
    if (!putRes.ok) throw new Error("Upload to storage failed");
    await createAttachment.mutateAsync({
      id: contractId,
      data: {
        fileName: file.name,
        objectPath,
        contentType: file.type || "application/pdf",
        size: file.size,
      },
    });
  };

  const onSubmit = async (values: FormValues) => {
    if (!direction) return;

    try {
      const requestData: CreateContractRequest = {
        direction,
        partnerId: values.partnerId,
        licensor: values.licensor || null,
        licensee: values.licensee || null,
        status: values.status,
        startDate: values.startDate || null,
        endType: values.endType,
        endDate: values.endType === "date" ? values.endDate || null : null,
        territories: values.territories,
        otherTerritories: values.otherTerritories || null,
        distributionTypes: values.distributionTypes,
        royaltyType: values.royaltyType || null,
        royaltyDetails: values.royaltyDetails || null,
        paymentTerms: values.paymentTerms || null,
        websiteLink: values.websiteLink || null,
        notes: values.notes || null,
        departmentTags: values.departmentTags,
        contentItemIds: selectedContentIds,
      };

      if (direction === "rights_in") {
        requestData.rightsInDetails = {
          platforms: values.riPlatforms,
          youtubeChannel: values.riPlatforms.includes("YouTube") ? values.riYoutubeChannel || null : null,
          socialPlatforms: values.riPlatforms.includes("Socials") ? values.riSocialPlatforms : [],
          socialHandle: values.riPlatforms.includes("Socials") ? values.riSocialHandle || null : null,
          grantOfRights: values.riGrantOfRights || null,
          exclusivitySameAsDuration: values.riExclusivitySameAsDuration,
          exclusivityStartDate: values.riExclusivitySameAsDuration ? null : values.riExclusivityStartDate || null,
          exclusivityEndDate: values.riExclusivitySameAsDuration ? null : values.riExclusivityEndDate || null,
          marketingRights: values.riMarketingRights || null,
        };
      } else {
        requestData.platform = values.platform || null;
        requestData.rightsOutDetails = {
          autoRenew: values.roAutoRenew,
          hasAmendment: values.roHasAmendment,
          exclusivity: values.roExclusivity || null,
          reportingFrequency: values.roReportingFrequency || null,
          minPaymentThreshold:
            values.roMinPaymentThreshold && values.roMinPaymentThreshold !== ""
              ? Number(values.roMinPaymentThreshold)
              : null,
        };
      }

      const result = await createContract.mutateAsync({ data: requestData });

      if (selectedFile) {
        try {
          await uploadDocument(result.id, selectedFile);
        } catch {
          toast({
            variant: "destructive",
            title: "Contract created, but document upload failed",
            description: "You can re-upload the document from the contract page.",
          });
        }
      }

      toast({
        title: "Contract created",
        description: "Successfully created contract draft.",
      });

      setLocation(`/contracts/${result.id}`);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error creating contract",
        description: "Please check your inputs and try again.",
      });
    }
  };

  if (step === 1) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4 text-slate-500 -ml-3">
            <Link href="/contracts"><ChevronLeft className="w-4 h-4 mr-1" /> Back to Contracts</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Contract</h1>
          <p className="text-slate-500 mt-1">Step 1: Choose the direction of the rights.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card
            className={`cursor-pointer transition-all hover:border-amber-400 hover:shadow-md ${direction === 'rights_in' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200'}`}
            onClick={() => setDirection('rights_in')}
            data-testid="card-direction-rights-in"
          >
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                <FileDown className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Rights In</h3>
                <p className="text-slate-500 mt-2 text-sm">Content acquired by TBN from external licensors to distribute or broadcast.</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover:border-amber-400 hover:shadow-md ${direction === 'rights_out' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200'}`}
            onClick={() => setDirection('rights_out')}
            data-testid="card-direction-rights-out"
          >
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                <FileUp className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Rights Out</h3>
                <p className="text-slate-500 mt-2 text-sm">TBN-owned content licensed to external partners for their platforms.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end mt-8">
          <Button
            size="lg"
            className="bg-slate-900 hover:bg-slate-800 text-white"
            disabled={!direction}
            onClick={() => setStep(2)}
            data-testid="button-next-step"
          >
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="mb-4 text-slate-500 -ml-3">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Direction
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contract Details</h1>
          <p className="text-slate-500 mt-1">Step 2: Fill in the core agreement details.</p>
        </div>
        <div className="px-4 py-2 bg-slate-100 rounded-md font-semibold text-slate-700 capitalize flex items-center gap-2">
          {direction === 'rights_in' ? <FileDown className="w-4 h-4 text-blue-600" /> : <FileUp className="w-4 h-4 text-emerald-600" />}
          {direction?.replace('_', ' ')}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Parties */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Parties</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="partnerId"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Primary Partner</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white" data-testid="select-partner">
                          <SelectValue placeholder="Select a partner..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {partners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="licensor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Licensor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="TBN or Partner Name" {...field} value={field.value || ''} data-testid="input-licensor" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="licensee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Licensee Name</FormLabel>
                    <FormControl>
                      <Input placeholder="TBN or Partner Name" {...field} value={field.value || ''} data-testid="input-licensee" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Term & Status */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Term &amp; Status</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white" data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="in_perpetuity">In Perpetuity</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="hidden md:block"></div>
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ''} data-testid="input-start-date" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="endType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white" data-testid="select-end-type">
                            <SelectValue placeholder="Select end type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="date">Specific Date</SelectItem>
                          <SelectItem value="perpetuity">In Perpetuity</SelectItem>
                          <SelectItem value="auto_renew">Auto-Renewing</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {form.watch("endType") === "date" && (
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} data-testid="input-end-date" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rights & Platforms */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Rights &amp; Platforms</CardTitle>
              <CardDescription>Territories, distribution and direction-specific rights.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Territories */}
              <FormField
                control={form.control}
                name="territories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Territories</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {TERRITORY_OPTIONS.map((t) => (
                        <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={field.value?.includes(t)}
                            onCheckedChange={(c) => field.onChange(toggleArrayValue(field.value || [], t, c === true))}
                            data-testid={`checkbox-territory-${t.toLowerCase()}`}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="otherTerritories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Territories</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Latin America, EMEA" {...field} value={field.value || ''} data-testid="input-other-territories" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Distribution types */}
              <FormField
                control={form.control}
                name="distributionTypes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distribution Types</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {DISTRIBUTION_OPTIONS.map((d) => (
                        <label key={d} className="flex items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={field.value?.includes(d)}
                            onCheckedChange={(c) => field.onChange(toggleArrayValue(field.value || [], d, c === true))}
                            data-testid={`checkbox-distribution-${d.toLowerCase()}`}
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Department tags */}
              <FormField
                control={form.control}
                name="departmentTags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department Tags</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {DEPARTMENT_OPTIONS.map((dept) => (
                        <label key={dept} className="flex items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={field.value?.includes(dept)}
                            onCheckedChange={(c) => field.onChange(toggleArrayValue(field.value || [], dept, c === true))}
                            data-testid={`checkbox-department-${dept.toLowerCase()}`}
                          />
                          {dept}
                        </label>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              {/* Rights In specifics */}
              {direction === "rights_in" && (
                <div className="space-y-6 rounded-lg border border-blue-200 bg-blue-50/30 p-5">
                  <div className="flex items-center gap-2 text-blue-900 font-semibold">
                    <FileDown className="w-4 h-4" /> Rights In Details
                  </div>

                  <FormField
                    control={form.control}
                    name="riPlatforms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platforms</FormLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {RIGHTS_IN_PLATFORMS.map((p) => (
                            <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={field.value?.includes(p)}
                                onCheckedChange={(c) => field.onChange(toggleArrayValue(field.value || [], p, c === true))}
                                data-testid={`checkbox-ri-platform-${p.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                              />
                              {p}
                            </label>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch("riPlatforms")?.includes("YouTube") && (
                    <FormField
                      control={form.control}
                      name="riYoutubeChannel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>YouTube Channel</FormLabel>
                          <FormControl>
                            <Input placeholder="Channel name or URL" {...field} value={field.value || ''} data-testid="input-youtube-channel" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}

                  {form.watch("riPlatforms")?.includes("Socials") && (
                    <div className="space-y-4 rounded-md border border-blue-100 bg-white/60 p-4">
                      <FormField
                        control={form.control}
                        name="riSocialPlatforms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Social Platforms</FormLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {SOCIAL_PLATFORMS.map((s) => (
                                <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                                  <Checkbox
                                    checked={field.value?.includes(s)}
                                    onCheckedChange={(c) => field.onChange(toggleArrayValue(field.value || [], s, c === true))}
                                    data-testid={`checkbox-social-${s.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                                  />
                                  {s}
                                </label>
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="riSocialHandle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Social Handle</FormLabel>
                            <FormControl>
                              <Input placeholder="@handle" {...field} value={field.value || ''} data-testid="input-social-handle" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="riGrantOfRights"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grant of Rights</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Describe the rights granted..." className="resize-none h-24 bg-white" {...field} value={field.value || ''} data-testid="input-grant-of-rights" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="riExclusivitySameAsDuration"
                    render={({ field }) => (
                      <FormItem>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            data-testid="checkbox-exclusivity-same-as-duration"
                          />
                          Exclusivity same as contract duration
                        </label>
                      </FormItem>
                    )}
                  />

                  {!form.watch("riExclusivitySameAsDuration") && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="riExclusivityStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exclusivity Start Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ''} data-testid="input-exclusivity-start" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="riExclusivityEndDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exclusivity End Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ''} data-testid="input-exclusivity-end" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="riMarketingRights"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Marketing Rights</FormLabel>
                        <FormControl>
                          <Input placeholder="Describe marketing rights..." {...field} value={field.value || ''} data-testid="input-marketing-rights" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Rights Out specifics */}
              {direction === "rights_out" && (
                <div className="space-y-6 rounded-lg border border-emerald-200 bg-emerald-50/30 p-5">
                  <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                    <FileUp className="w-4 h-4" /> Rights Out Details
                  </div>

                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform</FormLabel>
                        <FormControl>
                          <Input placeholder="Partner platform" {...field} value={field.value || ''} data-testid="input-platform" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-wrap gap-6">
                    <FormField
                      control={form.control}
                      name="roAutoRenew"
                      render={({ field }) => (
                        <FormItem>
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(c) => field.onChange(c === true)}
                              data-testid="checkbox-auto-renew"
                            />
                            Auto-renew
                          </label>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="roHasAmendment"
                      render={({ field }) => (
                        <FormItem>
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(c) => field.onChange(c === true)}
                              data-testid="checkbox-has-amendment"
                            />
                            Has amendment
                          </label>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="roExclusivity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exclusivity</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="bg-white" data-testid="select-exclusivity">
                                <SelectValue placeholder="Select exclusivity" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="exclusive">Exclusive</SelectItem>
                              <SelectItem value="non_exclusive">Non-Exclusive</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="roReportingFrequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reporting Frequency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="bg-white" data-testid="select-reporting-frequency">
                                <SelectValue placeholder="Select frequency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                              <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="roMinPaymentThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Payment Threshold</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} value={field.value || ''} data-testid="input-min-payment-threshold" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financials */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Financials</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="royaltyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Royalty Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger className="bg-white" data-testid="select-royalty-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="revenue_share">Revenue Share</SelectItem>
                        <SelectItem value="flat_fee">Flat Fee</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger className="bg-white" data-testid="select-payment-terms">
                          <SelectValue placeholder="Select terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="net_30">Net 30</SelectItem>
                        <SelectItem value="net_60">Net 60</SelectItem>
                        <SelectItem value="net_90">Net 90</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {form.watch("royaltyType") && (
                <FormField
                  control={form.control}
                  name="royaltyDetails"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Royalty Details</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            form.watch("royaltyType") === "revenue_share"
                              ? "e.g. 70/30 split %"
                              : form.watch("royaltyType") === "flat_fee"
                                ? "License fee amount"
                                : "Details"
                          }
                          {...field}
                          value={field.value || ''}
                          data-testid="input-royalty-details"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="websiteLink"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Website Link</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} value={field.value || ''} data-testid="input-website-link" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Linked Content */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Linked Content</CardTitle>
              <CardDescription>
                Select catalog titles covered by this contract.
                {selectedContentIds.length > 0 && (
                  <span className="ml-1 font-medium text-slate-700" data-testid="text-selected-content-count">
                    {selectedContentIds.length} selected
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Input
                placeholder="Search catalog..."
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                className="bg-white"
                data-testid="input-content-search"
              />
              <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100" data-testid="container-content-list">
                {contentLoading ? (
                  <div className="p-6 text-center text-slate-400 text-sm">Loading catalog…</div>
                ) : contentItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">No content found.</div>
                ) : (
                  contentItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                      data-testid={`row-content-${item.id}`}
                    >
                      <Checkbox
                        checked={selectedContentIds.includes(item.id)}
                        onCheckedChange={(c) => toggleContent(item.id, c === true)}
                        data-testid={`checkbox-content-${item.id}`}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.type}
                          {item.year ? ` · ${item.year}` : ""}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contract Document */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Contract Document</CardTitle>
              <CardDescription>Optionally attach a signed contract (PDF, DOC, DOCX).</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                data-testid="input-contract-document"
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" className="bg-white" onClick={() => fileInputRef.current?.click()} data-testid="button-select-document">
                  <Upload className="w-4 h-4 mr-2" /> Choose File
                </Button>
                {selectedFile ? (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <span className="truncate max-w-xs" data-testid="text-selected-document-name">{selectedFile.name}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      data-testid="button-remove-document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">No file selected</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <Label className="sr-only">Internal Notes</Label>
                    <FormControl>
                      <Textarea placeholder="Any additional context..." className="resize-none h-24 bg-white" {...field} value={field.value || ''} data-testid="input-notes" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 pb-12">
            <Button variant="outline" type="button" onClick={() => setLocation("/contracts")}>
              Cancel
            </Button>
            <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm" disabled={form.formState.isSubmitting} data-testid="button-create-contract">
              {form.formState.isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
              ) : (
                "Create Draft"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
