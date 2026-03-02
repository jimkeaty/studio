import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const root = await db.listCollections();
  console.log("ROOT COLLECTIONS:");
  for (const c of root) console.log(" -", c.id);

  // Check if dashboards exist
  const usersSnap = await db.collection("users").limit(1).get().catch(() => null);
  if (usersSnap && !usersSnap.empty) {
    const uid = usersSnap.docs[0].id;
    console.log("\nSample user uid:", uid);

    const dash2026 = await db.collection("dashboards").doc(uid).collection("agent").doc("2026").get();
    console.log("dashboards/{uid}/agent/2026 exists?", dash2026.exists);

    const dash2025 = await db.collection("dashboards").doc(uid).collection("agent").doc("2025").get();
    console.log("dashboards/{uid}/agent/2025 exists?", dash2025.exists);
  } else {
    console.log("\nNo users docs found (or no permission to read users).");
  }

  // Check agentYearRollups 2026 sample
  const ry = await db.collection("agentYearRollups").where("year", "==", 2026).limit(5).get().catch(() => null);
  if (ry) {
    console.log("\nagentYearRollups year=2026 sample docs:", ry.size);
    ry.forEach(d => console.log(" -", d.id));
  } else {
    console.log("\nCould not query agentYearRollups (permission or missing collection).");
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
