import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  partnersTable,
  contentItemsTable,
  seasonsTable,
  contractsTable,
  contractContentTable,
  revenueReportsTable,
} from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Idempotency guard: skip if data already exists (unless SEED_FORCE=true).
  // This makes it safe to run the seed on every `docker compose up`.
  if (process.env.SEED_FORCE !== "true") {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) {
      console.log("Database already seeded — skipping. (Set SEED_FORCE=true to re-seed.)");
      return;
    }
  }

  // Clear in reverse dependency order
  await db.delete(revenueReportsTable);
  await db.delete(contractContentTable);
  await db.delete(contractsTable);
  await db.delete(seasonsTable);
  await db.delete(contentItemsTable);
  await db.delete(partnersTable);
  await db.delete(usersTable);

  // --- Users ---
  const adminPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin1234!", 12);
  const legalPass = await bcrypt.hash("Legal1234!", 12);
  const financePass = await bcrypt.hash("Finance1234!", 12);
  const salesPass = await bcrypt.hash("Sales1234!", 12);

  const adminUser = { id: crypto.randomUUID(), email: process.env.ADMIN_EMAIL || "admin@tbn.org", name: "Admin User", role: "admin" as const, passwordHash: adminPass, isActive: true };
  const legalUser = { id: crypto.randomUUID(), email: "legal@tbn.org", name: "Sarah Mitchell", role: "legal" as const, passwordHash: legalPass, isActive: true };
  const financeUser = { id: crypto.randomUUID(), email: "finance@tbn.org", name: "Marcus Chen", role: "finance" as const, passwordHash: financePass, isActive: true };
  const salesUser = { id: crypto.randomUUID(), email: "sales@tbn.org", name: "Jordan Rivers", role: "sales" as const, passwordHash: salesPass, isActive: true };

  await db.insert(usersTable).values([adminUser, legalUser, financeUser, salesUser]);
  console.log("✓ Users seeded");

  // Demo/mock data (partners, content, contracts, revenue) is only seeded
  // when explicitly requested via SEED_DEMO_DATA=true.
  if (process.env.SEED_DEMO_DATA !== "true") {
    console.log("Skipping demo data (set SEED_DEMO_DATA=true to include sample partners/content/contracts).");
    printLogins(adminUser.email);
    return;
  }

  // --- Partners ---
  const tubi = { id: crypto.randomUUID(), name: "Tubi TV", type: "Licensee" as const, website: "https://tubi.tv", notes: "Major FAST/AVOD partner" };
  const prime = { id: crypto.randomUUID(), name: "Amazon Prime Video", type: "Licensee" as const, website: "https://primevideo.com", notes: "SVOD partner" };
  const roku = { id: crypto.randomUUID(), name: "Roku Channel", type: "Licensee" as const, website: "https://roku.com", notes: "FAST partner" };
  const daystar = { id: crypto.randomUUID(), name: "Daystar Television", type: "Licensor" as const, website: "https://daystar.com", notes: "Content licensor for religious programming" };
  const faithLife = { id: crypto.randomUUID(), name: "FaithLife Media", type: "Both" as const, website: "https://faithlife.com", notes: "Bidirectional partnership" };
  const pluto = { id: crypto.randomUUID(), name: "Pluto TV", type: "Licensee" as const, website: "https://pluto.tv", notes: "FAST platform" };

  await db.insert(partnersTable).values([tubi, prime, roku, daystar, faithLife, pluto]);
  console.log("✓ Partners seeded");

  // --- Content ---
  const johnPaul = { id: crypto.randomUUID(), type: "Film" as const, title: "John Paul the Great", description: "Documentary on the life of Pope John Paul II", year: 2022 };
  const promised = { id: crypto.randomUUID(), type: "Film" as const, title: "The Promised Land", description: "Epic biblical drama", year: 2021 };
  const revelation = { id: crypto.randomUUID(), type: "TVSeries" as const, title: "Revelation: The End Times", description: "Documentary series on biblical prophecy", year: 2023 };
  const tbnFastChannel = { id: crypto.randomUUID(), type: "TBN_FAST" as const, title: "TBN FAST Channel", description: "24/7 TBN programming stream", year: 2023 };
  const tbnLinear = { id: crypto.randomUUID(), type: "TBN_Linear" as const, title: "TBN Linear Network", description: "Main TBN broadcast feed", year: 1973 };
  const wofFast = { id: crypto.randomUUID(), type: "WoF_FAST" as const, title: "Word of Faith FAST", description: "WoF dedicated FAST channel", year: 2022 };
  const hopeMission = { id: crypto.randomUUID(), type: "Film" as const, title: "Mission of Hope", description: "True story of humanitarian aid in Africa", year: 2020 };
  const graceJourney = { id: crypto.randomUUID(), type: "TVSeries" as const, title: "Grace & Journey", description: "Faith-based reality series", year: 2022 };

  await db.insert(contentItemsTable).values([johnPaul, promised, revelation, tbnFastChannel, tbnLinear, wofFast, hopeMission, graceJourney]);

  // Seasons for TV series
  await db.insert(seasonsTable).values([
    { id: crypto.randomUUID(), contentItemId: revelation.id, seasonNumber: 1, title: "The Four Horsemen", year: 2023, episodeCount: 8 },
    { id: crypto.randomUUID(), contentItemId: revelation.id, seasonNumber: 2, title: "The Great Tribulation", year: 2024, episodeCount: 6 },
    { id: crypto.randomUUID(), contentItemId: graceJourney.id, seasonNumber: 1, title: "Season One", year: 2022, episodeCount: 12 },
    { id: crypto.randomUUID(), contentItemId: graceJourney.id, seasonNumber: 2, title: "Season Two", year: 2023, episodeCount: 10 },
  ]);
  console.log("✓ Content seeded");

  // --- Contracts ---
  // Rights Out to Tubi - active FAST/AVOD deal for John Paul film
  const tubiContract = {
    id: crypto.randomUUID(),
    direction: "rights_out" as const,
    partnerId: tubi.id,
    licensor: "TBN",
    licensee: "Tubi TV",
    status: "active" as const,
    startDate: "2024-01-01",
    endType: "date" as const,
    endDate: "2025-12-31",
    territories: ["US", "Canada"] as any,
    distributionTypes: ["FAST", "AVOD"] as any,
    platform: "Tubi",
    royaltyType: "revenue_share" as const,
    royaltyDetails: "70/30",
    paymentTerms: "net_30" as const,
    notes: "Non-exclusive FAST deal for faith-based films",
    rightsOutAutoRenew: false,
    rightsOutHasAmendment: false,
    rightsOutExclusivity: "non_exclusive",
    rightsOutReportingFrequency: "quarterly",
    rightsOutMinPaymentThreshold: "500",
    createdBy: adminUser.id,
  };

  // Rights Out to Amazon Prime - active SVOD for Promised Land film, expiring soon
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 35);
  const primeContract = {
    id: crypto.randomUUID(),
    direction: "rights_out" as const,
    partnerId: prime.id,
    licensor: "TBN",
    licensee: "Amazon Prime Video",
    status: "active" as const,
    startDate: "2022-06-01",
    endType: "date" as const,
    endDate: thirtyDays.toISOString().split("T")[0],
    territories: ["US"] as any,
    distributionTypes: ["SVOD"] as any,
    platform: "Prime Video",
    royaltyType: "flat_fee" as const,
    royaltyDetails: "$25,000 per film per year",
    paymentTerms: "net_60" as const,
    notes: "Exclusive SVOD window for US territory",
    rightsOutAutoRenew: true,
    rightsOutHasAmendment: false,
    rightsOutExclusivity: "exclusive",
    rightsOutReportingFrequency: "annually",
    createdBy: legalUser.id,
  };

  // Rights In from Daystar
  const daystarContract = {
    id: crypto.randomUUID(),
    direction: "rights_in" as const,
    partnerId: daystar.id,
    licensor: "Daystar Television",
    licensee: "TBN",
    status: "active" as const,
    startDate: "2023-03-01",
    endType: "date" as const,
    endDate: "2025-02-28",
    territories: ["US", "Canada", "UK"] as any,
    distributionTypes: ["FAST", "Linear"] as any,
    royaltyType: "flat_fee" as const,
    royaltyDetails: "$10,000/month",
    paymentTerms: "net_30" as const,
    notes: "Acquisition of Daystar library content for broadcast",
    rightsInPlatforms: ["TBN Broadcast", "TBN+"] as any,
    rightsInGrantOfRights: "Non-exclusive broadcast rights for programming library",
    rightsInExclusivitySameAsDuration: true,
    createdBy: legalUser.id,
  };

  // Rights Out to Roku - perpetual FAST deal
  const rokuContract = {
    id: crypto.randomUUID(),
    direction: "rights_out" as const,
    partnerId: roku.id,
    licensor: "TBN",
    licensee: "Roku Channel",
    status: "in_perpetuity" as const,
    startDate: "2021-01-01",
    endType: "perpetuity" as const,
    territories: ["Global"] as any,
    distributionTypes: ["FAST"] as any,
    platform: "The Roku Channel",
    royaltyType: "revenue_share" as const,
    royaltyDetails: "80/20",
    paymentTerms: "net_90" as const,
    rightsOutAutoRenew: false,
    rightsOutExclusivity: "non_exclusive",
    rightsOutReportingFrequency: "monthly",
    createdBy: adminUser.id,
  };

  // Draft contract
  const plutoContract = {
    id: crypto.randomUUID(),
    direction: "rights_out" as const,
    partnerId: pluto.id,
    licensor: "TBN",
    licensee: "Pluto TV",
    status: "draft" as const,
    startDate: "2025-01-01",
    endType: "date" as const,
    endDate: "2026-12-31",
    territories: ["US"] as any,
    distributionTypes: ["FAST", "VOD"] as any,
    platform: "Pluto TV",
    royaltyType: "revenue_share" as const,
    royaltyDetails: "75/25",
    paymentTerms: "net_30" as const,
    rightsOutExclusivity: "non_exclusive",
    rightsOutReportingFrequency: "quarterly",
    createdBy: legalUser.id,
  };

  await db.insert(contractsTable).values([tubiContract, primeContract, daystarContract, rokuContract, plutoContract]);

  // Link content to contracts
  await db.insert(contractContentTable).values([
    { contractId: tubiContract.id, contentItemId: johnPaul.id },
    { contractId: tubiContract.id, contentItemId: hopeMission.id },
    { contractId: primeContract.id, contentItemId: promised.id },
    { contractId: daystarContract.id, contentItemId: revelation.id },
    { contractId: daystarContract.id, contentItemId: graceJourney.id },
    { contractId: rokuContract.id, contentItemId: tbnFastChannel.id },
    { contractId: rokuContract.id, contentItemId: wofFast.id },
    { contractId: plutoContract.id, contentItemId: johnPaul.id },
    { contractId: plutoContract.id, contentItemId: promised.id },
  ]);
  console.log("✓ Contracts seeded");

  // --- Revenue Reports ---
  const today = new Date();
  const q1End = new Date(today.getFullYear(), 3, 1); // April 1
  const q2End = new Date(today.getFullYear(), 6, 1); // July 1
  const prevMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  await db.insert(revenueReportsTable).values([
    // Tubi quarterly reports
    {
      id: crypto.randomUUID(),
      contractId: tubiContract.id,
      period: `Q1 ${today.getFullYear()}`,
      expectedDate: q1End.toISOString().split("T")[0],
      receivedDate: new Date(today.getFullYear(), 3, 15).toISOString().split("T")[0],
      amount: "3420.50",
      status: "received" as const,
    },
    {
      id: crypto.randomUUID(),
      contractId: tubiContract.id,
      period: `Q2 ${today.getFullYear()}`,
      expectedDate: q2End.toISOString().split("T")[0],
      amount: null,
      status: "expected" as const,
    },
    // Roku monthly reports
    {
      id: crypto.randomUUID(),
      contractId: rokuContract.id,
      period: prevMonth.toLocaleString("default", { month: "long", year: "numeric" }),
      expectedDate: new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split("T")[0],
      amount: null,
      status: "expected" as const,
    },
    // Amazon Prime annual
    {
      id: crypto.randomUUID(),
      contractId: primeContract.id,
      period: `Annual ${today.getFullYear()}`,
      expectedDate: new Date(today.getFullYear(), 11, 31).toISOString().split("T")[0],
      amount: null,
      status: "expected" as const,
    },
  ]);
  console.log("✓ Revenue reports seeded");

  printLogins(adminUser.email);
}

function printLogins(adminEmail: string) {
  console.log("\n✅ Database seeded successfully!");
  console.log(`\nAdmin login: ${adminEmail} / ${process.env.ADMIN_PASSWORD || "Admin1234!"}`);
  console.log("Legal login: legal@tbn.org / Legal1234!");
  console.log("Finance login: finance@tbn.org / Finance1234!");
  console.log("Sales login: sales@tbn.org / Sales1234!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
