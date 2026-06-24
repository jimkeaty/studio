# Smart Broker USA: Open House Marketing Workflow & Constant Contact Integration Roadmap

This document outlines the new streamlined workflow for managing weekend open houses, generating marketing emails, and the roadmap for a future direct integration with Constant Contact.

## 1. The Current Workflow (Live Now)

We have completely overhauled the open house submission process to eliminate manual tracking and make marketing blasts effortless for the staff.

### Agent Experience
* **Automated Reminders:** Every Thursday at 8:00 AM, all active agents receive an automated email and in-app notification reminding them of the noon deadline. The email automatically lists all open houses already submitted for the weekend.
* **Full Visibility:** Agents can now see their past, current, and future submissions on their dashboard.
* **Self-Service Edits:** Agents can edit or cancel their submissions directly. If they make a change after Thursday noon, the system warns them that marketing may have already gone out, and immediately alerts the staff of a "Late Change."

### Staff Experience
* **The Open House Queue:** The Staff Queue now has a dedicated "Open Houses" tab showing all submissions for the upcoming weekend.
* **The Checklist:** Each submission has a built-in checklist: **MLS**, **Boomtown**, and **Email Blast**. Staff can check these off as they work.
* **One-Click Marketing Generation:** Instead of manually typing out the weekend schedule, staff simply click **"Generate Marketing Email"**. The system instantly compiles all active submissions into a formatted list (grouped by Saturday/Sunday) ready to be pasted into Constant Contact.
* **Marking Done:** Once the marketing is complete, staff click "Mark Done." The agent automatically receives a notification confirming exactly which platforms (MLS, Boomtown, Email) their open house was published to.

---

## 2. How to Use the New Email Generator (Testing the Workflow)

To test the new workflow and see how it saves time today:

1. Go to **Admin → Staff Queue** and click the **Open Houses** tab.
2. Ensure there are a few pending open house submissions (you can submit a test one from the agent dashboard if needed).
3. Click the **Generate Marketing Email** button at the top of the list.
4. A preview panel will appear with two options:
   * **Plain Text:** Click "Copy Text" and paste this directly into your existing Constant Contact template. It is perfectly formatted with dates, agent names, addresses, and times.
   * **HTML Source:** If you want to use the built-in Smart Broker styling, click "Copy HTML" and paste it into the custom HTML block in Constant Contact.
5. Once you've sent the email through Constant Contact, check the "Email Blast" box on the submissions in the Staff Queue and click **Mark Done**.

---

## 3. Roadmap: Direct Constant Contact Integration (Future Phase)

While the current generator eliminates the need to manually type the schedule, the ultimate goal is to remove Constant Contact from the manual workflow entirely. 

In the future phase, Smart Broker USA will connect directly to the Constant Contact API.

### How the Future Integration Will Work

1. **OAuth Connection:** In the Smart Broker Admin Settings, the broker will click "Connect Constant Contact" and log in once to authorize the platform.
2. **Template Selection:** The admin will select which Constant Contact list (e.g., "All Buyers & Sphere") and which email template to use for the weekly blast.
3. **The "Send Blast" Button:** On Thursday afternoons, instead of clicking "Generate Email" and copying the text, the staff will click a new button: **"Publish to Constant Contact"**.
4. **Automated Campaign Creation:** Smart Broker will automatically:
   * Create a new email campaign in Constant Contact.
   * Inject the weekend open house data (including property photos pulled from the MLS integration, if available).
   * Schedule or send the blast immediately to the selected lists.
5. **Analytics Sync:** Open rates and click rates for the open house blast will sync back to the Smart Broker dashboard so agents can see how much traffic their open house marketing generated.

### Why This Matters
This integration will reduce the weekly open house marketing task from a 30-minute manual data entry and formatting job into a single 5-second button click, ensuring 100% accuracy and consistent branding every single week.
