import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

import { CatalogImportCard } from "@/components/catalog-import-card";
import { Button } from "@/components/ui/button";

export default function ImportContentCatalog() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <Button asChild variant="ghost" className="-ml-3 text-slate-600">
        <Link href="/content">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Content Catalog
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Import Content Catalog
        </h1>
        <p className="mt-1 text-slate-500">
          Upload the TBN master catalog Excel workbook to add or update titles,
          seasons, and episodes.
        </p>
      </div>

      <CatalogImportCard />
    </div>
  );
}