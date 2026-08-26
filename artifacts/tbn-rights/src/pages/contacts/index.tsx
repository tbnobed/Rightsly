import { useState } from "react";
import { useListContacts, getListContactsQueryKey, Contact, usePreviewContactImport, useApproveContactImport, getPreviewContactImportQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Search, Plus, Mail, Phone, SearchX, Upload } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ContactsList() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const canEdit = user?.role === "admin" || user?.role === "legal";
  const previewImport = usePreviewContactImport({ query: { enabled: importOpen, queryKey: getPreviewContactImportQueryKey() } });
  const approveImport = useApproveContactImport({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        previewImport.refetch();
        setSelectedCandidates([]);
        toast({ title: "Contact import complete", description: `${result.created} created, ${result.skipped} skipped.` });
      },
    },
  });

  const { data, isLoading, isError, refetch } = useListContacts({
    page,
    pageSize: 24,
    search: debouncedSearch || undefined,
  }, {
    query: {
      queryKey: getListContactsQueryKey({ page, pageSize: 24, search: debouncedSearch || undefined }),
    }
  });

  const handleEdit = (contact: Contact) => {
    setSelectedContact(contact);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setSelectedContact(undefined);
    setFormOpen(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 flex flex-col h-[calc(100vh-3rem)] md:h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contacts</h1>
          <p className="text-slate-500 mt-1">A shared directory for counsel, distributors, vendors, and media contacts.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search contacts..."
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              data-testid="input-search-contacts"
            />
          </div>
          {canEdit && (
            <>
            <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-import-contacts">
              <Upload className="w-4 h-4 mr-2" /> Review Legacy
            </Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm shrink-0" onClick={handleCreate} data-testid="button-new-contact">
              <Plus className="w-4 h-4 mr-2" /> Add Contact
            </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 -mx-4 px-4 md:mx-0 md:px-0">
        {isLoading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="border-slate-200">
                <CardContent className="p-5">
                  <div className="flex gap-3 mb-4">
                    <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <div className="p-12 text-center border border-red-100 bg-red-50 text-red-600 rounded-lg flex flex-col items-center">
            <SearchX className="h-10 w-10 mb-3 opacity-50" />
            <p className="font-medium">Failed to load contacts</p>
            <Button variant="outline" className="mt-4 bg-white" onClick={() => refetch()} data-testid="button-retry-contacts">Try again</Button>
          </div>
        ) : data?.data && data.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
            {data.data.map(contact => (
              <Card 
                key={contact.id} 
                className="border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full"
                data-testid={`card-contact-${contact.id}`}
              >
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-lg shrink-0 border border-slate-200">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate" title={contact.name} data-testid={`text-contact-name-${contact.id}`}>{contact.name}</h3>
                      {(contact.title || contact.company) && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2" title={[contact.title, contact.company].filter(Boolean).join(' at ')}>
                          {contact.title && <span className="font-medium text-slate-700">{contact.title}</span>}
                          {contact.title && contact.company && <span> at </span>}
                          {contact.company && <span className="text-slate-600">{contact.company}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2.5 mt-auto pt-4 border-t border-slate-100">
                    {contact.email ? (
                      <div className="flex items-center text-sm text-slate-600 group">
                        <Mail className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
                        <a href={`mailto:${contact.email}`} className="truncate hover:text-blue-600 hover:underline" data-testid={`link-contact-email-${contact.id}`}>
                          {contact.email}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-slate-400">
                        <Mail className="h-3.5 w-3.5 mr-2 opacity-50 shrink-0" />
                        <span>No email</span>
                      </div>
                    )}
                    
                    {contact.phone ? (
                      <div className="flex items-center text-sm text-slate-600">
                        <Phone className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
                        <a href={`tel:${contact.phone}`} className="truncate hover:text-blue-600 hover:underline" data-testid={`link-contact-phone-${contact.id}`}>
                          {contact.phone}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-slate-400">
                        <Phone className="h-3.5 w-3.5 mr-2 opacity-50 shrink-0" />
                        <span>No phone</span>
                      </div>
                    )}
                  </div>
                  {contact.notes && (
                    <div className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded line-clamp-2" data-testid={`text-contact-notes-${contact.id}`}>
                      {contact.notes}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full justify-center"
                    onClick={() => handleEdit(contact)}
                    data-testid={`button-view-contact-${contact.id}`}
                  >
                    {canEdit ? "View or edit details" : "View details"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="p-12 flex flex-col items-center justify-center text-center bg-white border border-slate-200 rounded-lg shadow-sm h-64">
            <SearchX className="h-10 w-10 text-slate-300 mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No contacts found</h3>
            <p className="text-slate-500 max-w-sm mt-1">
              {search ? "No contacts match your search query." : "The directory is empty."}
            </p>
            {canEdit && !search && (
              <Button className="mt-4" onClick={handleCreate} data-testid="button-add-first-contact">
                <Plus className="w-4 h-4 mr-2" /> Add First Contact
              </Button>
            )}
          </div>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 shrink-0">
          <p className="text-sm text-slate-500">
            Showing <span className="font-medium text-slate-900">{(page - 1) * data.pageSize + 1}</span> to <span className="font-medium text-slate-900">{Math.min(page * data.pageSize, data.total)}</span> of <span className="font-medium text-slate-900">{data.total}</span> contacts
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              data-testid="button-previous-contacts"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage(p => p + 1)}
              data-testid="button-next-contacts"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={selectedContact}
        readOnly={!canEdit}
      />
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Review legacy contacts</DialogTitle>
            <DialogDescription>Select only the people you want added. Partner notes remain unchanged.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto space-y-2 pr-2">
            {previewImport.isLoading ? <Skeleton className="h-32 w-full" /> : previewImport.data?.candidates.length ? previewImport.data.candidates.map((candidate) => {
              const disabled = Boolean(candidate.duplicateContactId || candidate.duplicateCandidateId);
              const checked = selectedCandidates.includes(candidate.id);
              return (
                <label key={candidate.id} className={`flex gap-3 rounded-lg border p-3 ${disabled ? "bg-slate-50 opacity-70" : "bg-white"}`}>
                  <Checkbox disabled={disabled} checked={checked} onCheckedChange={(value) => setSelectedCandidates((current) => value ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{candidate.name}</span>
                      <span className="text-sm text-slate-500">{candidate.company}</span>
                      {candidate.ambiguous && <Badge variant="outline">Review</Badge>}
                      {candidate.duplicateContactId && <Badge variant="secondary">Already exists</Badge>}
                      {candidate.duplicateCandidateId && <Badge variant="secondary">Repeated in legacy notes</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">{candidate.email || "No email found"}</p>
                    {candidate.warnings.length > 0 && <p className="text-xs text-amber-700 mt-1">{candidate.warnings.join(" · ")}</p>}
                  </div>
                </label>
              );
            }) : <p className="py-10 text-center text-slate-500">No legacy contact candidates remain.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
            <Button disabled={!selectedCandidates.length || approveImport.isPending} onClick={() => approveImport.mutate({ data: { candidateIds: selectedCandidates } })}>
              {approveImport.isPending ? "Importing..." : `Import ${selectedCandidates.length} selected`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
