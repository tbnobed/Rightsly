import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileDown, CheckCircle, AlertCircle, FileSpreadsheet, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useImportContracts } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";

export default function ImportData() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number, failed: number, errors: any[] } | null>(null);
  const { toast } = useToast();
  
  const importMutation = useImportContracts();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(10);
    
    try {
      // Fake progress for UI feel
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 15, 90));
      }, 500);

      const response = await importMutation.mutateAsync({ 
        data: { file: file as unknown as Blob } 
      });
      
      clearInterval(interval);
      setProgress(100);
      setResult(response);
      
      if (response.failed > 0) {
        toast({
          variant: "destructive",
          title: "Import completed with errors",
          description: `Successfully imported ${response.imported} rows, but ${response.failed} failed.`,
        });
      } else {
        toast({
          title: "Import Successful",
          description: `Successfully imported all ${response.imported} rows.`,
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "There was a problem processing the file.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Usually calls useGetImportTemplate, but simulating link download for UI
    toast({ title: "Downloading Template", description: "Template file is downloading." });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bulk Import</h1>
        <p className="text-slate-500 mt-1">Import legacy contracts via CSV.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-lg">Upload Data</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!result ? (
              <div className="space-y-6">
                <div 
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${file ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
                >
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    {file ? (
                      <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-3" />
                    ) : (
                      <Upload className="w-12 h-12 text-slate-400 mb-3" />
                    )}
                    <span className="text-lg font-medium text-slate-900">
                      {file ? file.name : "Click to select a file"}
                    </span>
                    <span className="text-sm text-slate-500 mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : "CSV format only"}
                    </span>
                  </label>
                </div>

                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 font-medium">Processing...</span>
                      <span className="text-slate-900">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2 bg-slate-100" />
                  </div>
                )}

                <div className="flex justify-end">
                  <Button 
                    onClick={handleUpload} 
                    disabled={!file || isUploading}
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto"
                    data-testid="button-upload-csv"
                  >
                    {isUploading ? "Importing..." : "Run Import"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className={`p-3 rounded-full ${result.failed > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                    {result.failed > 0 ? <AlertCircle className="w-6 h-6 text-amber-600" /> : <CheckCircle className="w-6 h-6 text-emerald-600" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Import Complete</h3>
                    <p className="text-sm text-slate-600">Processed {result.imported + result.failed} rows from {file?.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                    <span className="block text-3xl font-bold text-emerald-600 mb-1">{result.imported}</span>
                    <span className="text-xs font-semibold text-emerald-800 uppercase">Successfully Imported</span>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${result.failed > 0 ? 'bg-red-50 border border-red-100' : 'bg-slate-50 border border-slate-100'}`}>
                    <span className={`block text-3xl font-bold mb-1 ${result.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{result.failed}</span>
                    <span className={`text-xs font-semibold uppercase ${result.failed > 0 ? 'text-red-800' : 'text-slate-500'}`}>Failed Rows</span>
                  </div>
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="mt-6 border border-red-100 rounded-lg overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 border-b border-red-100 font-semibold text-red-900 text-sm">
                      Error Details
                    </div>
                    <ul className="divide-y divide-red-100 max-h-48 overflow-y-auto bg-white">
                      {result.errors.map((err, i) => (
                        <li key={i} className="px-4 py-2 text-sm flex gap-3">
                          <span className="text-slate-500 font-mono w-12 shrink-0">Row {err.row}</span>
                          <span className="text-red-700">{err.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <Button variant="outline" onClick={() => { setFile(null); setResult(null); setProgress(0); }}>
                    Import Another File
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm h-fit">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-sm text-slate-600">
            <p>Upload a CSV file containing contract records. Ensure columns match the template exactly.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Required fields: Partner Name, Direction, End Date.</li>
              <li>Date format: YYYY-MM-DD.</li>
              <li>Territories should be comma-separated.</li>
            </ul>
            <Button variant="outline" className="w-full mt-4 bg-white" onClick={handleDownloadTemplate}>
              <FileDown className="w-4 h-4 mr-2" /> Download Template
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
