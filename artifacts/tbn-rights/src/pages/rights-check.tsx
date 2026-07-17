import { useState } from "react";
import { useRightsCheck, getRightsCheckQueryKey, useListContent, getListContentQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Search, CheckCircle, XCircle, AlertTriangle, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";

const checkSchema = z.object({
  contentItemId: z.string().min(1, "Select content"),
  territory: z.string().min(1, "Select territory"),
  distributionType: z.string().min(1, "Select distribution type"),
  date: z.string().min(1, "Select check date"),
});

export default function RightsCheck() {
  const [hasChecked, setHasChecked] = useState(false);
  
  const { data: contentData } = useListContent(undefined, {
    query: { queryKey: getListContentQueryKey() }
  });
  
  const form = useForm<z.infer<typeof checkSchema>>({
    resolver: zodResolver(checkSchema),
    defaultValues: {
      territory: "Global",
      distributionType: "SVOD",
      date: new Date().toISOString().split('T')[0],
    },
  });

  const { data: checkResult, refetch, isFetching } = useRightsCheck(form.getValues(), {
    query: {
      enabled: false,
      queryKey: getRightsCheckQueryKey(form.getValues()),
    }
  });

  const onSubmit = async () => {
    await refetch();
    setHasChecked(true);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Rights Checker</h1>
        <p className="text-slate-500 mt-1">Verify content availability before drafting a new license.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1 border-slate-200 shadow-sm h-fit">
          <CardHeader className="bg-slate-50/80 border-b border-slate-100 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5 text-amber-500" /> Query Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="contentItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Title</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select a title..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {contentData?.data?.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="territory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Territory</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select territory..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Global">Global</SelectItem>
                          <SelectItem value="US">United States</SelectItem>
                          <SelectItem value="Canada">Canada</SelectItem>
                          <SelectItem value="UK">United Kingdom</SelectItem>
                          <SelectItem value="Europe">Europe</SelectItem>
                          <SelectItem value="LATAM">Latin America</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="distributionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Distribution Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SVOD">SVOD</SelectItem>
                          <SelectItem value="AVOD">AVOD</SelectItem>
                          <SelectItem value="FAST">FAST</SelectItem>
                          <SelectItem value="TVOD">TVOD</SelectItem>
                          <SelectItem value="Linear">Linear Broadcast</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="bg-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white mt-2" 
                  disabled={isFetching}
                  data-testid="button-run-check"
                >
                  {isFetching ? "Running Check..." : "Verify Availability"}
                  {!isFetching && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {hasChecked && checkResult ? (
            <div className="space-y-6">
              <Card className={`border-2 shadow-md overflow-hidden ${checkResult.available ? 'border-emerald-500/50' : 'border-red-500/50'}`}>
                <div className={`p-6 flex items-center justify-between text-white ${checkResult.available ? 'bg-emerald-600' : 'bg-red-600'}`}>
                  <div className="flex items-center gap-4">
                    {checkResult.available ? (
                      <ShieldCheck className="w-10 h-10 opacity-90" />
                    ) : (
                      <ShieldAlert className="w-10 h-10 opacity-90" />
                    )}
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">
                        {checkResult.available ? 'Rights Available' : 'Rights Conflict'}
                      </h2>
                      <p className="text-white/80 font-medium">
                        For {form.getValues('territory')} / {form.getValues('distributionType')} on {format(parseISO(form.getValues('date')), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <CardContent className="p-0">
                  {checkResult.conflicts.length > 0 && (
                    <div className="p-6 bg-red-50/50 border-b border-red-100">
                      <h3 className="font-bold text-red-900 mb-4 flex items-center">
                        <XCircle className="w-5 h-5 mr-2 text-red-600" /> 
                        Blocking Contracts
                      </h3>
                      <div className="space-y-3">
                        {checkResult.conflicts.map((conflict, i) => (
                          <div key={i} className="bg-white p-4 rounded-lg border border-red-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{conflict.partnerName}</p>
                              <p className="text-sm text-red-700 mt-1 font-medium">{conflict.reason}</p>
                            </div>
                            <Button size="sm" variant="outline" className="shrink-0" asChild>
                              <a href={`/contracts/${conflict.contractId}`} target="_blank" rel="noreferrer">View Contract</a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {checkResult.grants.length > 0 && (
                    <div className="p-6">
                      <h3 className="font-bold text-slate-900 mb-4 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2 text-emerald-500" /> 
                        Active Grants
                      </h3>
                      <div className="space-y-3">
                        {checkResult.grants.map((grant, i) => (
                          <div key={i} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-slate-900">{grant.partnerName}</span>
                                <Badge variant="outline" className="text-[10px] uppercase h-5">{grant.direction.replace('_', ' ')}</Badge>
                                {grant.exclusivity && (
                                  <Badge variant={grant.exclusivity === 'exclusive' ? 'default' : 'secondary'} className="text-[10px] h-5">
                                    {grant.exclusivity}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 mt-1">
                                Valid until {grant.endDate ? format(parseISO(grant.endDate), 'MMM d, yyyy') : 'Perpetuity'}
                              </p>
                            </div>
                            <Button size="sm" variant="ghost" asChild>
                              <a href={`/contracts/${grant.contractId}`} target="_blank" rel="noreferrer">View</a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {checkResult.grants.length === 0 && checkResult.conflicts.length === 0 && (
                    <div className="p-10 text-center">
                      <CheckCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">Clear title. No existing grants or conflicts found.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <ShieldCheck className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-slate-700 mb-2">Ready to Verify</h3>
              <p className="text-slate-500 text-center max-w-md">
                Enter your parameters on the left to check if the requested rights overlap with any existing exclusive grants.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
