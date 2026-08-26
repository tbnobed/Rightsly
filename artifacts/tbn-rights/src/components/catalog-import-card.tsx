import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListContentQueryKey,
  useImportContentCatalog,
  useValidateContentCatalogImport,
  type CatalogImportPreview,
  type CatalogImportResult,
} from "@workspace/api-client-react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function CatalogImportCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [result, setResult] = useState<CatalogImportResult | null>(null);
  const validateMutation = useValidateContentCatalogImport();
  const importMutation = useImportContentCatalog();

  const validate = async () => {
    if (!file) return;
    try {
      const nextPreview = await validateMutation.mutateAsync({ data: { file } });
      setPreview(nextPreview);
      setResult(null);
    } catch (error) {
      toast({
        title: "Catalog validation failed",
        description: error instanceof Error ? error.message : "Unable to validate the workbook.",
        variant: "destructive",
      });
    }
  };

  const runImport = async () => {
    if (!file || !preview || preview.invalid > 0) return;
    try {
      const nextResult = await importMutation.mutateAsync({ data: { file } });
      setResult(nextResult);
      await queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
      toast({
        title: nextResult.failed ? "Catalog import needs attention" : "Catalog imported",
        description: `${nextResult.imported} catalog rows imported.`,
        variant: nextResult.failed ? "destructive" : "default",
      });
      setPreview(null);
    } catch (error) {
      toast({
        title: "Catalog import failed",
        description: error instanceof Error ? error.message : "Unable to import the workbook.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Import TBN Content Catalog</CardTitle>
            <CardDescription className="mt-1">
              Import the Metadata sheet from the TBN master catalog. Titles, seasons,
              episodes, IDs, credits, dates, genres, formats, and ratings are preserved.
              Contract rights are not changed.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="catalog-file">Excel workbook (.xlsx)</Label>
          <Input
            id="catalog-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!file || validateMutation.isPending || importMutation.isPending}
            onClick={validate}
          >
            {validateMutation.isPending ? "Validating..." : preview ? "Validate Again" : "Preview Catalog"}
          </Button>
          <Button
            disabled={!file || !preview || preview.invalid > 0 || preview.ready === 0 || importMutation.isPending}
            onClick={runImport}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importMutation.isPending ? "Importing..." : "Import Ready Rows"}
          </Button>
        </div>

        {preview && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Populated rows", preview.total],
                ["Title groups", preview.titleCount],
                ["Ready", preview.ready],
                ["Unchanged", preview.duplicates],
                ["Episodes", preview.episodic],
                ["Standalone", preview.standalone],
                ["Invalid", preview.invalid],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            {preview.errors.length > 0 && (
              <IssueList title="Errors" issues={preview.errors} destructive />
            )}
            {preview.warnings.length > 0 && (
              <IssueList title="Warnings" issues={preview.warnings} />
            )}
            {preview.invalid === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                The workbook is valid and ready to import.
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 font-medium">
              {result.failed ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              Import complete
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.titlesCreated} titles created, {result.titlesUpdated} titles updated,{" "}
              {result.episodesCreated} episodes created, {result.episodesUpdated} episodes updated,
              and {result.duplicates} unchanged rows skipped.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IssueList({
  title,
  issues,
  destructive = false,
}: {
  title: string;
  issues: Array<{ row: number; message: string }>;
  destructive?: boolean;
}) {
  return (
    <div className={destructive ? "text-destructive" : "text-amber-700"}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertCircle className="h-4 w-4" />
        {title}
      </p>
      <ul className="mt-1 max-h-36 space-y-1 overflow-auto pl-6 text-sm">
        {issues.slice(0, 100).map((issue, index) => (
          <li key={`${issue.row}-${index}`}>
            Row {issue.row}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}