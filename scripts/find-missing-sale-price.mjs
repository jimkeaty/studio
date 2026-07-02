// scripts/find-missing-sale-price.mjs
// Finds all 2026 transactions that are closed but have no salePrice (or salePrice = 0).
import admin from "firebase-admin";
admin.initializeApp();
const db = admin.firestore();

async function main() {
  // Fetch all transactions with a closeDate in 2026
  const snap = await db.collection("transactions").get();

  const results = [];

  for (const doc of snap.docs) {
    const t = { id: doc.id, ...doc.data() };

    // Only look at closed transactions
    if (t.status !== "closed" && t.status !== "Closed") continue;

    // Check if closeDate is in 2026
    let closeDate = null;
    if (t.closeDate) {
      if (typeof t.closeDate.toDate === "function") {
        closeDate = t.closeDate.toDate();
      } else if (typeof t.closeDate === "string") {
        closeDate = new Date(t.closeDate);
      }
    }
    if (!closeDate || closeDate.getFullYear() !== 2026) continue;

    // Check for missing or zero salePrice
    const salePrice = t.salePrice ?? t.salesPrice ?? t.sale_price ?? null;
    if (!salePrice || Number(salePrice) === 0) {
      results.push({
        id: t.id,
        address: t.address || t.streetAddress || "(no address)",
        agent: t.agentDisplayName || t.agentId || "(unknown agent)",
        closeDate: closeDate.toISOString().slice(0, 10),
        status: t.status,
        salePrice: salePrice,
        listPrice: t.listPrice ?? t.list_price ?? null,
        grossCommission: t.splitSnapshot?.grossCommission ?? t.grossCommission ?? null,
      });
    }
  }

  if (results.length === 0) {
    console.log("✅ All 2026 closed transactions have a sale price.");
    return;
  }

  console.log(`\n⚠️  Found ${results.length} closed 2026 transaction(s) with no sale price:\n`);
  console.log(
    ["#", "Address", "Agent", "Close Date", "List Price", "Gross Comm", "Doc ID"]
      .join(" | ")
  );
  console.log("-".repeat(120));

  results.forEach((r, i) => {
    console.log(
      [
        String(i + 1).padStart(2),
        (r.address || "").slice(0, 35).padEnd(35),
        (r.agent || "").slice(0, 25).padEnd(25),
        r.closeDate,
        r.listPrice != null ? `$${Number(r.listPrice).toLocaleString()}` : "(none)",
        r.grossCommission != null ? `$${Number(r.grossCommission).toLocaleString()}` : "(none)",
        r.id,
      ].join(" | ")
    );
  });
}

main().catch(err => { console.error(err); process.exit(1); });
