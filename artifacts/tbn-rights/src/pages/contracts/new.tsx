import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useCreateContract, useListPartners, getListPartnersQueryKey, CreateContractRequestDirection } from "@workspace/api-client-react";
import { ArrowRight, Check, Briefcase, FileDown, FileUp, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  partnerId: z.string().min(1, "Partner is required"),
  licensor: z.string().optional(),
  licensee: z.string().optional(),
  startDate: z.string().optional(),
  endType: z.enum(["date", "perpetuity", "auto_renew"]),
  endDate: z.string().optional(),
  status: z.enum(["draft", "active", "expired", "in_perpetuity", "terminated"]).default("draft"),
  paymentTerms: z.enum(["net_30", "net_60", "net_90"]).nullable().optional(),
  royaltyType: z.enum(["revenue_share", "flat_fee", "other"]).nullable().optional(),
  notes: z.string().optional(),
  // For simplicity in wizard, handling complex nested objects manually before submit
});

export default function NewContractWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<CreateContractRequestDirection | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createContract = useCreateContract();
  
  const { data: partnersData } = useListPartners({
    query: { queryKey: getListPartnersQueryKey() }
  });
  const partners = partnersData?.data || [];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endType: "date",
      status: "draft",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!direction) return;
    
    try {
      // Build the request matching the schema
      const requestData = {
        direction,
        ...values,
        territories: ["Global"], // Defaulting for the wizard, edit later
        distributionTypes: [],
      };
      
      const result = await createContract.mutateAsync({ data: requestData as any });
      
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
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Select a partner..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {partners.map(p => (
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
                      <Input placeholder="TBN or Partner Name" {...field} value={field.value || ''} />
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
                      <Input placeholder="TBN or Partner Name" {...field} value={field.value || ''} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Term & Status</CardTitle>
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
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
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
                      <Input type="date" {...field} value={field.value || ''} />
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
                          <SelectTrigger className="bg-white">
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
                          <Input type="date" {...field} value={field.value || ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">Financials & Notes</CardTitle>
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
                        <SelectTrigger className="bg-white">
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
                        <SelectTrigger className="bg-white">
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
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Internal Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any additional context..." className="resize-none h-24 bg-white" {...field} value={field.value || ''} />
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
              {form.formState.isSubmitting ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
