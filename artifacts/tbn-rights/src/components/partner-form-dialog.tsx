import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreatePartner,
  useUpdatePartner,
  getListPartnersQueryKey,
  getGetPartnerQueryKey,
  Partner,
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

const partnerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Licensor", "Licensee", "Both"]),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type PartnerFormValues = z.infer<typeof partnerSchema>;

interface PartnerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: Partner;
}

export function PartnerFormDialog({ open, onOpenChange, partner }: PartnerFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!partner;

  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      name: "",
      type: "Licensee",
      website: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: partner?.name ?? "",
        type: (partner?.type as PartnerFormValues["type"]) ?? "Licensee",
        website: partner?.website ?? "",
        notes: partner?.notes ?? "",
      });
    }
  }, [open, partner]);

  const isPending = createPartner.isPending || updatePartner.isPending;

  const onSubmit = async (values: PartnerFormValues) => {
    const payload = {
      name: values.name,
      type: values.type,
      website: values.website || null,
      notes: values.notes || null,
    };

    try {
      if (isEdit && partner) {
        await updatePartner.mutateAsync({ id: partner.id, data: payload });
        queryClient.invalidateQueries({ queryKey: getGetPartnerQueryKey(partner.id) });
      } else {
        await createPartner.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({
        title: isEdit ? "Partner updated" : "Partner created",
        description: isEdit
          ? "Partner details have been updated."
          : "The new partner has been added.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Save failed",
        description: "Could not save the partner. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Partner" : "Add Partner"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update details for this partner."
              : "Add a new licensor or licensee."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Partner name..." {...field} data-testid="input-partner-name" />
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
                        <SelectTrigger data-testid="select-partner-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Licensor">Licensor</SelectItem>
                        <SelectItem value="Licensee">Licensee</SelectItem>
                        <SelectItem value="Both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} data-testid="input-partner-website" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes..." {...field} data-testid="input-partner-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-partner">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={isPending}
                data-testid="button-save-partner"
              >
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Partner"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
