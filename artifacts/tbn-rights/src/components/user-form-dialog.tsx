import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateUser,
  useUpdateUser,
  getListUsersQueryKey,
  User,
  CreateUserRequestRole,
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

const roleEnum = z.enum(["admin", "legal", "finance", "sales"]);

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: roleEnum,
  password: z.string().min(8, "Password must be at least 8 characters"),
  isActive: z.boolean().default(true),
});

const editSchema = createSchema.extend({
  email: z.string(), // read-only in edit mode
  password: z
    .string()
    .refine((v) => v === "" || v.length >= 8, "Password must be at least 8 characters")
    .optional(),
});

type UserFormValues = z.infer<typeof createSchema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!user;

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "sales",
      password: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: user?.name ?? "",
        email: user?.email ?? "",
        role: (user?.role as UserFormValues["role"]) ?? "sales",
        password: "",
        isActive: user?.isActive !== false,
      });
    }
  }, [open, user]);

  const isPending = createUser.isPending || updateUser.isPending;

  const onSubmit = async (values: UserFormValues) => {
    try {
      if (isEdit && user) {
        await updateUser.mutateAsync({
          id: user.id,
          data: {
            name: values.name,
            role: values.role,
            isActive: values.isActive,
            ...(values.password ? { password: values.password } : {}),
          },
        });
      } else {
        await createUser.mutateAsync({
          data: {
            name: values.name,
            email: values.email,
            role: values.role as CreateUserRequestRole,
            password: values.password,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({
        title: isEdit ? "User updated" : "User created",
        description: isEdit
          ? "The user's details have been updated."
          : "The new user can now sign in.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Save failed",
        description: "Could not save the user. The email may already be in use.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this user's role, status, or password."
              : "Create a new account with platform access."}
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
                    <Input placeholder="Full name..." {...field} data-testid="input-user-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@tbn.org"
                      disabled={isEdit}
                      {...field}
                      data-testid="input-user-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isEdit ? "New password" : "Password"}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={isEdit ? "Leave blank to keep" : "Min. 8 characters"}
                        {...field}
                        data-testid="input-user-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isEdit && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        data-testid="checkbox-user-active"
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">
                      Account active (can sign in)
                    </FormLabel>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-user">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={isPending}
                data-testid="button-save-user"
              >
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
