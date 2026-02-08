# How to Import Your Historical Data

This guide explains how to get your data from your "master transaction sheet" into the Smart Broker USA dashboard.

## The Data Flow

The dashboard is designed to read data directly from the Firestore database. It does **not** connect to external spreadsheets. The process is:

**Your Spreadsheet** -> **Formatted JSON Data** -> **Import to Firestore** -> **View on Dashboard**

## Step-by-Step Import Process

Follow these steps for each agent and for each year of historical data you want to import.

### Step 1: Get the Agent's User ID

Each user who signs into the app gets a unique User ID from Firebase. You need this ID to associate data with the correct agent.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project (`smart-broker-usa`).
3.  In the left-hand menu, go to **Build -> Authentication**.
4.  In the **Users** tab, you will see a list of everyone who has signed up. Find the agent you want to import data for and copy their **User UID**. It will look something like `gHZ9n7s2b9X8fJ2kP3s5t8YxVOE2`.

### Step 2: Format Your Data into JSON

You need to convert the rows from your spreadsheet into a specific JSON format. The easiest way to do this is to use the structure from our mock data file as a template.

1.  Open the file `src/lib/mock-data.ts` in the editor.
2.  The `mockAgentDashboardData` object shows the exact structure needed. Copy this entire object into a text editor.
3.  Carefully replace all the placeholder values in your copied text with the real historical data from your spreadsheet for a specific agent and year.

**Important:** The structure must match exactly. Pay close attention to the `kpis`, `conversions`, and `stats` sections.

### Step 3: Import into Firestore

Now you will create a new document in Firestore to hold this data.

1.  In the Firebase Console, go to **Build -> Firestore Database**.
2.  Click **+ Start collection**.
3.  For **Collection ID**, enter `dashboards`.
4.  For **Document ID**, paste the **User UID** you copied in Step 1.
5.  Now, you are inside that agent's document. You need to create a sub-collection. Click **+ Start collection**.
6.  For **Collection ID**, enter `agent`.
7.  For **Document ID**, enter the **year** you are importing data for (e.g., `2023`).
8.  Now you can add the fields. Paste the JSON data you prepared in Step 2 into the fields of this new document. You can often switch to a "JSON" or "raw" view in the Firestore console to paste the entire structure at once.
9.  Click **Save**.

The final path to your data should look like this: `dashboards/{User UID}/agent/{year}`.

### Step 4: View in the App

That's it! Go to the application and sign in as that agent (or as an admin who can view their data). Use the year selector on the dashboard to choose the year you just imported. The dashboard will now display your historical data.

## A Note on "Closed Transactions Added by Staff"

The process described above is for importing large batches of historical data. For ongoing data entry (like staff adding new closed transactions), the principle is the same: the new data must ultimately be written to or aggregated into the correct `dashboards/{userId}/agent/{year}` document to appear on the dashboard.

The "Daily Tracker" page in the app is a simple example of this, where an agent's own input updates their dashboard totals. A more advanced system for staff would involve a dedicated admin interface that performs these same updates.
