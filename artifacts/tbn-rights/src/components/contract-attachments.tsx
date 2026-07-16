import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListContractAttachments,
  getListContractAttachmentsQueryKey,
  useCreateContractAttachment,
  useDeleteContractAttachment,
  useRequestUploadUrl,
  type ContractAttachment,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Upload, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const API_BASE = `${import.meta.env.BASE_URL}api`;

async function openAttachment(att: ContractAttachment) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}/storage${att.objectPath}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("Failed to download file");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ContractAttachments({ contractId, canEdit }: { contractId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments, isLoading } = useListContractAttachments(contractId);
  const requestUploadUrl = useRequestUploadUrl();
  const createAttachment = useCreateContractAttachment();
  const deleteAttachment = useDeleteContractAttachment();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListContractAttachmentsQueryKey(contractId) });

  async function handleFile(file: File) {
    setUploading(true);
    try {
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

      await invalidate();
      toast({ title: "Document attached", description: file.name });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(att: ContractAttachment) {
    try {
      await deleteAttachment.mutateAsync({ id: contractId, attachmentId: att.id });
      await invalidate();
      toast({ title: "Attachment removed", description: att.fileName });
    } catch {
      toast({ title: "Failed to remove attachment", variant: "destructive" });
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/80 pb-4">
        <div>
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>Signed contracts and related files</CardDescription>
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              data-testid="input-attachment-file"
            />
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              data-testid="button-upload-attachment"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {uploading ? "Uploading…" : "Upload PDF"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading documents…</div>
        ) : attachments && attachments.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {attachments.map((att) => (
              <li key={att.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors" data-testid={`row-attachment-${att.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{att.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {formatSize(att.size)}
                      {att.uploadedByName ? ` · ${att.uploadedByName}` : ""}
                      {att.createdAt ? ` · ${new Date(att.createdAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openAttachment(att).catch(() =>
                        toast({ title: "Failed to open document", variant: "destructive" })
                      )
                    }
                    data-testid={`button-download-${att.id}`}
                  >
                    <Download className="w-4 h-4 mr-1" /> View
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(att)}
                      data-testid={`button-delete-${att.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center">
            <FileText className="w-8 h-8 text-slate-300 mb-2" />
            <p>No documents attached to this contract yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
