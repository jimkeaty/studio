// scripts/check-noah-listings.mjs
// Reads Noah Norris's active listing transactions from Firestore and prints
// the commission fields so we can see exactly what's stored.
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function main() {
  // Search by agentDisplayName containing "Noah" or agentId containing "noah"
  const snap = await db.collection("transactions")
    .where("status", "==", "active")
    .get();

  const noahTxs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(tx =>
      String(tx.agentDisplayName || '').toLowerCase().includes('noah') ||
      String(tx.agentId || '').toLowerCase().includes('noah')
    );

  if (noahTxs.length === 0) {
    console.log("No active transactions found for Noah.");
    return;
  }

  for (const tx of noahTxs) {
    console.log("\n─────────────────────────────────────────");
    console.log("ID:                    ", tx.id);
    console.log("Address:               ", tx.address);
    console.log("agentId:               ", tx.agentId);
    console.log("agentDisplayName:      ", tx.agentDisplayName);
    console.log("status:                ", tx.status);
    console.log("closingType:           ", tx.closingType);
    console.log("listPrice:             ", tx.listPrice);
    console.log("sellerPayingListingAgent:", tx.sellerPayingListingAgent, "(type:", typeof tx.sellerPayingListingAgent, ")");
    console.log("sellerPayingBuyerAgent:", tx.sellerPayingBuyerAgent, "(type:", typeof tx.sellerPayingBuyerAgent, ")");
    console.log("commissionPercent:     ", tx.commissionPercent);
    console.log("splitSnapshot exists?  ", !!tx.splitSnapshot);
    if (tx.splitSnapshot) {
      console.log("  agentSplitPercent:  ", tx.splitSnapshot.agentSplitPercent);
    }
    console.log("agentPct:              ", tx.agentPct);
    console.log("updatedAt:             ", tx.updatedAt);
  }
}

main().catch(console.error).finally(() => process.exit(0));
