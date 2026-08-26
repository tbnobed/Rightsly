import crypto from "node:crypto";

export type LegacyContactSource = { partnerId: string; company: string; notes: string | null };
export type ExistingContact = { id: string; name: string; email: string | null; importSourceKey: string | null };
export type ContactImportCandidate = {
  id: string;
  sourceKey: string;
  name: string;
  company: string;
  email: string | null;
  notes: string;
  ambiguous: boolean;
  duplicateContactId: string | null;
  duplicateCandidateId: string | null;
  warnings: string[];
};

const markerLine = /^Imported contacts(?: \(([^)]+)\))?:\s*(.*)$/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const nonNames = /^(terminated|terminated in jan|_|unknown)$/i;

export const normalizeContactEmail = (value: string) => value.trim().toLowerCase().replace(/[.,]+$/, "");
const fallbackName = (email: string) => email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function extractLegacyContactCandidates(
  partners: LegacyContactSource[],
  existing: ExistingContact[],
): ContactImportCandidate[] {
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [normalizeContactEmail(c.email!), c]));
  const bySource = new Map(existing.filter((c) => c.importSourceKey).map((c) => [c.importSourceKey!, c]));
  const candidates: ContactImportCandidate[] = [];

  for (const partner of partners) {
    const lines = partner.notes?.split(/\r?\n/) ?? [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const match = lines[lineIndex]!.match(markerLine);
      if (!match) continue;
      const block = [match[2] ?? ""];
      while (lineIndex + 1 < lines.length && !markerLine.test(lines[lineIndex + 1]!)) {
        block.push(lines[++lineIndex]!);
      }
      const markerSource = match[1]?.trim() || `partner:${partner.partnerId}`;
      const raw = block.join("\n").trim();
      const segments = raw.split("|").map((part) => part.trim()).filter(Boolean);
      const firstNamed = segments.find((part) => !part.includes("@") && !nonNames.test(part));
      const emails = [...new Set((raw.match(emailPattern) ?? []).map(normalizeContactEmail))];
      const values = emails.length ? emails : [null];

      values.forEach((email, index) => {
        const hasExplicitName = index === 0 && Boolean(firstNamed);
        const name = hasExplicitName ? firstNamed! : email ? fallbackName(email) : firstNamed || partner.company;
        const sourceKey = `${markerSource}:contact:${email ?? name.toLowerCase().replace(/\W+/g, "-")}`;
        const duplicate = bySource.get(sourceKey) ?? (email ? byEmail.get(email) : undefined);
        const warnings: string[] = [];
        if (!hasExplicitName) warnings.push("Name inferred from the email address or partner");
        if (emails.length > 1) warnings.push("Multiple addresses were found in one legacy note");
        if (duplicate) warnings.push(`Possible duplicate of ${duplicate.name}`);
        candidates.push({
          id: crypto.createHash("sha256").update(`${partner.partnerId}:${sourceKey}`).digest("hex").slice(0, 24),
          sourceKey,
          name,
          company: partner.company,
          email,
          notes: `Migrated from legacy contact details for ${partner.company}.`,
          ambiguous: warnings.length > 0,
          duplicateContactId: duplicate?.id ?? null,
          duplicateCandidateId: null,
          warnings,
        });
      });
    }
  }

  const firstByEmail = new Map<string, ContactImportCandidate>();
  for (const candidate of candidates) {
    if (!candidate.email || candidate.duplicateContactId) continue;
    const first = firstByEmail.get(candidate.email);
    if (!first) {
      firstByEmail.set(candidate.email, candidate);
      continue;
    }
    candidate.duplicateCandidateId = first.id;
    candidate.ambiguous = true;
    candidate.warnings.push(`Duplicate candidate for ${first.name} at ${first.company}`);
  }
  return candidates.sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
}