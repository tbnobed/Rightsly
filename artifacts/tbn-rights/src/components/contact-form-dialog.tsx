import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  getListContactsQueryKey,
  Contact,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Trash2 } from "lucide-react";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email("Invalid email format").max(320).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
  readOnly?: boolean;
}

export function ContactFormDialog({ open, onOpenChange, contact, readOnly = false }: ContactFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!contact;
  const canEdit = user?.role === "admin" || user?.role === "content_admin" || user?.role === "legal";
  const isReadOnly = readOnly || !canEdit;
  const canDelete = user?.role === "admin" || user?.role === "content_admin";
  const [isDeleting, setIsDeleting] = useState(false);

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      company: "",
      title: "",
      email: "",
      phone: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (contact) {
        form.reset({
          name: contact.name,
          company: contact.company || "",
          title: contact.title || "",
          email: contact.email || "",
          phone: contact.phone || "",
          notes: contact.notes || "",
        });
      } else {
        form.reset({
          name: "",
          company: "",
          title: "",
          email: "",
          phone: "",
          notes: "",
        });
      }
    }
  }, [open, contact, form]);

  const isPending = createContact.isPending || updateContact.isPending || isDeleting;

  const onSubmit = async (values: ContactFormValues) => {
    const payload = {
      name: values.name,
      company: values.company || null,
      title: values.title || null,
      email: values.email || null,
      phone: values.phone || null,
      notes: values.notes || null,
    };

    try {
      if (isEdit && contact) {
        await updateContact.mutateAsync({ id: contact.id, data: payload });
      } else {
        await createContact.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({
        title: isEdit ? "Contact updated" : "Contact added",
        description: isEdit
          ? "The contact details have been saved."
          : "The new contact has been added to the directory.",
      });
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || err?.message || "Could not save the contact.";
      toast({
        title: "Save failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    try {
      setIsDeleting(true);
      await deleteContact.mutateAsync({ id: contact.id });
      queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({
        title: "Contact deleted",
        description: `${contact.name} has been removed from the directory.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || err?.message || "Could not delete the contact.";
      toast({
        title: "Delete failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isReadOnly ? "Contact Details" : isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? "Directory details for this contact."
              : isEdit
              ? "Update details for this contact."
              : "Add a new person to the directory."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" {...field} disabled={isReadOnly} data-testid="input-contact-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="General Counsel" {...field} disabled={isReadOnly} data-testid="input-contact-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Media" {...field} disabled={isReadOnly} data-testid="input-contact-company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@example.com" {...field} disabled={isReadOnly} data-testid="input-contact-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+1 (555) 123-4567" {...field} disabled={isReadOnly} data-testid="input-contact-phone" />
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
                    <Textarea 
                      placeholder="Context about this contact..." 
                      className="min-h-[100px]"
                      {...field} 
                      disabled={isReadOnly}
                      data-testid="input-contact-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0 mt-6 pt-4 border-t border-slate-100">
              {!isReadOnly && isEdit && canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 sm:mr-auto" data-testid="button-delete-contact">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete <strong>{contact.name}</strong> from the directory? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}>
                        {isDeleting ? "Deleting..." : "Delete Contact"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} data-testid="button-cancel-contact">
                {isReadOnly ? "Close" : "Cancel"}
              </Button>
              {!isReadOnly && (
                <Button
                  type="submit"
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  disabled={isPending}
                  data-testid="button-save-contact"
                >
                  {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Contact"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
