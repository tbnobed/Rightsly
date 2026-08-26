import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  contentItemsTable,
  episodesTable,
  seasonsTable,
} from "@workspace/db";
import { logAudit } from "./audit";
import type { AuthenticatedUser } from "./auth";
import {
  parseCatalogImportXlsx,
  type CatalogImportIssue,
  type CatalogImportRecord,
} from "./catalogImportCore";

export { parseCatalogImportXlsx } from "./catalogImportCore";

type CatalogPreview = {
  total: number;
  ready: number;
  duplicates: number;
  invalid: number;
  titleCount: number;
  episodic: number;
  standalone: number;
  errors: CatalogImportIssue[];
  warnings: CatalogImportIssue[];
};

const normalizeTitle = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);

export function titleCatalogKey(title: string) {
  return `tbn-master:title:${hash(normalizeTitle(title))}`;
}

export function episodeCatalogKey(record: CatalogImportRecord) {
  if (record.internalId) {
    return `tbn-master:episode-id:${record.internalId.trim().toLocaleLowerCase("en-US")}`;
  }
  return `tbn-master:episode:${hash([
    normalizeTitle(record.title ?? ""),
    record.seasonNumber ?? "",
    record.episodeNumber ?? "",
    record.episodeTitle?.trim().toLocaleLowerCase("en-US") ?? "",
  ].join("|"))}`;
}

function episodeValues(record: CatalogImportRecord) {
  return {
    internalId: record.internalId,
    episodeNumber: record.episodeNumber,
    episodeNumberText: record.episodeNumberText,
    title: record.episodeTitle,
    description: record.description,
    mediaFormat: record.format,
    genres: record.genres,
    director: record.director,
    actors: record.actors,
    year: record.yearReleased,
    releaseDate: record.releaseDate,
    contentRating: record.rating,
    sourceSheet: "Metadata",
    sourceRow: record.sourceRow,
  };
}

function titleMetadata(record: CatalogImportRecord) {
  return {
    catalogInternalId: record.internalId,
    description: record.description,
    mediaFormat: record.format,
    genres: record.genres,
    director: record.director,
    actors: record.actors,
    year: record.yearReleased,
    releaseDate: record.releaseDate,
    contentRating: record.rating,
  };
}

function sameValues(
  existing: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  return Object.entries(values).every(([key, value]) =>
    (existing[key] ?? null) === (value ?? null));
}

async function analyzeRecords(records: CatalogImportRecord[]): Promise<CatalogPreview> {
  const preview: CatalogPreview = {
    total: records.length,
    ready: 0,
    duplicates: 0,
    invalid: 0,
    titleCount: new Set(records.flatMap((record) => record.title ? [normalizeTitle(record.title)] : [])).size,
    episodic: records.filter((record) => record.kind === "episodic").length,
    standalone: records.filter((record) => record.kind === "standalone").length,
    errors: records.flatMap((record) => record.errors),
    warnings: [],
  };

  const valid = records.filter((record) => record.errors.length === 0 && record.title);
  preview.invalid = records.length - valid.length;
  const episodeRecords = valid.filter((record) => record.kind === "episodic");
  const episodeKeys = episodeRecords.map(episodeCatalogKey);
  const titleKeys = valid.map((record) => titleCatalogKey(record.title!));
  const [existingEpisodes, existingTitles, allTitles, allSeasons] = await Promise.all([
    episodeKeys.length
      ? db.select().from(episodesTable).where(inArray(episodesTable.catalogKey, episodeKeys))
      : [],
    titleKeys.length
      ? db.select().from(contentItemsTable).where(inArray(contentItemsTable.catalogImportKey, titleKeys))
      : [],
    db.select({
      id: contentItemsTable.id,
      title: contentItemsTable.title,
      catalogImportKey: contentItemsTable.catalogImportKey,
    }).from(contentItemsTable),
    db.select({
      id: seasonsTable.id,
      seasonNumber: seasonsTable.seasonNumber,
    }).from(seasonsTable),
  ]);
  const episodeByKey = new Map(existingEpisodes.map((episode) => [episode.catalogKey, episode]));
  const titleByKey = new Map(existingTitles.map((title) => [title.catalogImportKey!, title]));
  const titlesByNormalizedName = new Map<string, typeof allTitles>();
  for (const title of allTitles) {
    const key = normalizeTitle(title.title);
    titlesByNormalizedName.set(key, [...(titlesByNormalizedName.get(key) ?? []), title]);
  }
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const fileKeys = new Set<string>();
  const fileInternalIds = new Set<string>();

  for (const record of valid) {
    const desiredTitleKey = titleCatalogKey(record.title!);
    const desiredTitle = titleByKey.get(desiredTitleKey);
    const collidingTitles = (titlesByNormalizedName.get(normalizeTitle(record.title!)) ?? [])
      .filter((title) => title.catalogImportKey !== desiredTitleKey);
    if (!desiredTitle && collidingTitles.length) {
      preview.invalid++;
      preview.errors.push({
        row: record.sourceRow,
        message: `A Rightsly title named "${record.title}" already exists but is not linked to this catalog`,
      });
      continue;
    }
    const key = record.kind === "episodic"
      ? episodeCatalogKey(record)
      : titleCatalogKey(record.title!);
    const internalKey = record.internalId?.trim().toLocaleLowerCase("en-US") ?? null;
    if (fileKeys.has(key) || (internalKey && fileInternalIds.has(internalKey))) {
      preview.invalid++;
      preview.errors.push({ row: record.sourceRow, message: "Duplicate catalog identity in workbook" });
      continue;
    }
    fileKeys.add(key);
    if (internalKey) fileInternalIds.add(internalKey);

    if (record.kind === "episodic") {
      const existing = episodeByKey.get(key);
      if (existing && existing.contentItemId !== desiredTitle?.id) {
        preview.invalid++;
        preview.errors.push({
          row: record.sourceRow,
          message: "Episode identity is already linked to a different catalog title",
        });
      } else if (
        existing &&
        sameValues(existing, episodeValues(record)) &&
        (existing.seasonId ? seasonNumberById.get(existing.seasonId) ?? null : null) === record.seasonNumber
      ) {
        preview.duplicates++;
        preview.warnings.push({ row: record.sourceRow, message: "Episode is unchanged and will be skipped" });
      } else {
        preview.ready++;
      }
    } else {
      const existing = titleByKey.get(key);
      if (existing && sameValues(existing, titleMetadata(record))) {
        preview.duplicates++;
        preview.warnings.push({ row: record.sourceRow, message: "Title is unchanged and will be skipped" });
      } else {
        preview.ready++;
      }
    }
  }
  return preview;
}

export async function previewCatalogImport(buffer: Buffer) {
  const parsed = await parseCatalogImportXlsx(buffer);
  return analyzeRecords(parsed.records);
}

export async function importCatalog(buffer: Buffer, user: AuthenticatedUser) {
  const parsed = await parseCatalogImportXlsx(buffer);
  const preview = await analyzeRecords(parsed.records);
  if (preview.invalid) {
    return {
      imported: 0,
      failed: preview.invalid,
      duplicates: preview.duplicates,
      titlesCreated: 0,
      titlesUpdated: 0,
      episodesCreated: 0,
      episodesUpdated: 0,
      errors: preview.errors,
      warnings: preview.warnings,
    };
  }

  const valid = parsed.records.filter((record) => record.errors.length === 0 && record.title);
  const groups = new Map<string, CatalogImportRecord[]>();
  for (const record of valid) {
    const key = titleCatalogKey(record.title!);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const result = await db.transaction(async (tx) => {
    let titlesCreated = 0;
    let titlesUpdated = 0;
    let episodesCreated = 0;
    let episodesUpdated = 0;
    let duplicates = 0;
    let standaloneImported = 0;

    for (const [catalogImportKey, rows] of groups) {
      const title = rows[0].title!;
      const episodic = rows.some((row) => row.kind === "episodic");
      let [content] = await tx.select().from(contentItemsTable)
        .where(eq(contentItemsTable.catalogImportKey, catalogImportKey));
      if (!content) {
        const exactMatches = (await tx.select().from(contentItemsTable))
          .filter((item) => normalizeTitle(item.title) === normalizeTitle(title));
        if (exactMatches.length) {
          throw new Error(
            `A Rightsly title named "${title}" already exists but is not linked to this catalog`,
          );
        }
      }

      const standalone = rows.find((row) => row.kind === "standalone");
      let contentWasCreated = false;
      if (!content) {
        [content] = await tx.insert(contentItemsTable).values({
          id: crypto.randomUUID(),
          type: episodic ? "TVSeries" : "Film",
          title,
          contentSource: "tbn",
          tbnMediaId: null,
          catalogImportKey,
          ...(standalone ? titleMetadata(standalone) : {}),
        }).returning();
        titlesCreated++;
        contentWasCreated = true;
      } else {
        const values = {
          catalogImportKey,
          type: episodic ? "TVSeries" as const : content.type,
          ...(standalone ? titleMetadata(standalone) : {}),
        };
        const changed = !sameValues(content, values);
        if (changed) {
          [content] = await tx.update(contentItemsTable).set({ ...values, updatedAt: new Date() })
            .where(eq(contentItemsTable.id, content.id)).returning();
          titlesUpdated++;
          if (standalone) standaloneImported++;
        } else if (standalone) {
          duplicates++;
        }
      }
      if (contentWasCreated && standalone) {
        standaloneImported++;
      }

      const seasonNumbers = [...new Set(rows.flatMap((row) =>
        row.kind === "episodic" && row.seasonNumber ? [row.seasonNumber] : []))];
      const existingSeasons = seasonNumbers.length
        ? await tx.select().from(seasonsTable).where(and(
            eq(seasonsTable.contentItemId, content.id),
            inArray(seasonsTable.seasonNumber, seasonNumbers),
          ))
        : [];
      const seasonByNumber = new Map(existingSeasons.map((season) => [season.seasonNumber, season]));
      for (const seasonNumber of seasonNumbers) {
        if (!seasonByNumber.has(seasonNumber)) {
          const [season] = await tx.insert(seasonsTable).values({
            id: crypto.randomUUID(),
            contentItemId: content.id,
            seasonNumber,
            episodeCount: rows.filter((row) => row.kind === "episodic" && row.seasonNumber === seasonNumber).length,
          }).returning();
          seasonByNumber.set(seasonNumber, season);
        }
      }

      for (const record of rows.filter((row) => row.kind === "episodic")) {
        const catalogKey = episodeCatalogKey(record);
        const [existing] = await tx.select().from(episodesTable)
          .where(eq(episodesTable.catalogKey, catalogKey));
        const values = {
          contentItemId: content.id,
          seasonId: record.seasonNumber ? seasonByNumber.get(record.seasonNumber)?.id ?? null : null,
          catalogKey,
          ...episodeValues(record),
          updatedAt: new Date(),
        };
        if (!existing) {
          await tx.insert(episodesTable).values({ id: crypto.randomUUID(), ...values });
          episodesCreated++;
        } else if (sameValues(existing, {
          contentItemId: values.contentItemId,
          seasonId: values.seasonId,
          ...episodeValues(record),
        })) {
          duplicates++;
        } else {
          await tx.update(episodesTable).set(values).where(eq(episodesTable.id, existing.id));
          episodesUpdated++;
        }
      }
    }

    return {
      titlesCreated,
      titlesUpdated,
      episodesCreated,
      episodesUpdated,
      duplicates,
      standaloneImported,
    };
  });

  const imported = result.episodesCreated + result.episodesUpdated + result.standaloneImported;
  await logAudit({
    user,
    action: "create",
    entityType: "content_catalog_import",
    after: { ...result, rows: parsed.records.length },
  });
  return {
    imported,
    failed: 0,
    titlesCreated: result.titlesCreated,
    titlesUpdated: result.titlesUpdated,
    episodesCreated: result.episodesCreated,
    episodesUpdated: result.episodesUpdated,
    duplicates: result.duplicates,
    errors: [],
    warnings: preview.warnings,
  };
}