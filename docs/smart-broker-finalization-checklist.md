# Smart Broker USA — Simple Finalization Checklist

**Purpose:** This is the plain-English order for taking the work already built and published in GitHub and safely making it usable in the live Smart Broker system.

## The simple answer

The programming work is **saved and published to GitHub**. It is **not yet safe to say everything is live**.

There are two kinds of remaining work:

1. **Deploy and verify the released version** in Firebase/App Hosting.
2. **Turn on features that need a schedule or outside account**—for example, reminders, Facebook publishing, and connections to other applications—and confirm business rules I did not guess, especially recruiting incentives.

> Do these in the order below. Do not start with Facebook, reminders, or broad staff testing until the live release in Step 1 is verified.

| Step | Who should handle it | What “done” looks like |
|---|---|---|
| 1–2 | Development / deployment owner | A successful build and a confirmed live Smart Broker version. |
| 4–6 | Jim plus an administrator | Business settings and staff owners are confirmed. |
| 7–10 | Jim plus system administrators | Scheduled reminders and optional external connections are configured. |
| 11–12 | Jim plus staff test group | Real-world testing is completed without changing production financial data unnecessarily. |

## Step 1 — Confirm the new code is actually deployed

**Build repair completed:** The failure was not caused by a Smart Broker page importing `Html`. The build was inheriting `NODE_ENV=development` even though it was running a production build. The build command now explicitly sets `NODE_ENV=production`, and the clean build completed all 295 static pages.

The completed work has been pushed to GitHub `main` through commit **`67f69a8`**. That means the code is safely in the repository. It does **not** prove Firebase/App Hosting has released it.

The deployment owner should do the following:

1. Open the Firebase/App Hosting deployment area for Smart Broker USA.
2. Find the release tied to the current GitHub `main` branch.
3. Confirm the deployment was created after commit `67f69a8`.
4. Open the live Smart Broker URL in a normal browser window.
5. Confirm the page loads instead of showing a blank/white screen.
6. Record the displayed build number and release date.

> If no automatic deployment appears after the build fix, the deployment connection needs to be checked. Do not re-enter tokens in chat. Use the connected GitHub/Firebase account settings or have the deployment owner reconnect the existing integration.

## Step 2 — Perform a short live smoke test

Once the new build is live, test only a small number of controlled records. Do **not** create fake payments, send a real marketing post, or alter a real closed transaction merely to test the system.

| Area | Simple live test | Pass condition |
|---|---|---|
| Transaction save | Open one safe non-closed test or training transaction, change a harmless note, save, refresh. | The note is still there and the form shows a real Last Saved time. |
| Pending listing commission | In a safe Pending listing, enter a cooperating-agent offer as a percent or a dollar amount, save, refresh. | It remains saved and does not change the brokerage GCI/split numbers. |
| My Transactions | Test one normal agent and one Admin “View as Agent” session. | Each sees the correct transactions. |
| Contact saving | Add a safe test contact from a transaction. | It is available in the Contact Book/autocomplete after refresh. |
| Recruiting incentives | View the new recruiting management screen only. | No incentive is marked Paid or changed during this check. |

If any item fails, stop that item and report the exact screen, transaction address, user role, and error message. Do not compensate by manually editing Firestore records.

## Step 3 — Confirm recruiting-incentive rules before using “Mark Paid”

The system now calculates recruiting eligibility from real closed transaction commission information and has a protected **Mark Paid** button. That is correct technically, but I could not verify the business terms from the supplied video because the video transcript was unavailable.

Jim should confirm these six items in writing before anyone uses **Mark Paid**:

1. The GCI amount the recruit must reach.
2. The payment amount for a direct recruit.
3. Whether and how much a second-level recruit pays.
4. The qualification period—for example, first 12 months, calendar year, or another period.
5. Whether payments repeat every year or happen once.
6. What happens if a recruit becomes inactive, transfers, or leaves.

After confirming those rules, an administrator should enter the settings in the Recruiting Incentive Program configuration screen. Then review the list of agents marked **Referred By** and correct any incorrect relationships. The system will preserve a history of corrections.

**Important:** Do not mark any payout Paid until the terms are confirmed and the recruit’s qualifying closed GCI is reviewed.

## Step 4 — Set up Ask Your Broker

This feature is built, but it needs people and approved material.

1. Choose the broker or staff members who will answer escalated questions.
2. Add their user accounts as the designated reviewers in Admin Branding / Ask Your Broker settings.
3. Upload or add only approved policies, SOPs, forms guidance, and FAQs to the knowledge base.
4. Test one ordinary question and one legal/contract question.

The expected result is simple: normal questions can use approved material; legal, contract, termination, breach, agency-dispute, or fair-housing judgment questions should go to a human broker rather than get invented AI advice.

## Step 5 — Decide which apps should be visible

The new **Admin App Management** area controls whether external applications are **Hidden**, **Coming Soon**, or **Active**, and can limit access by role, office, team, or user.

For each of these, make one decision:

| App | Safe initial setting | Why |
|---|---|---|
| Smart Project Management | Coming Soon or limited pilot | It has no confirmed single sign-on connection. |
| Smart Inspections | Active only if the launcher is already used | Transaction review is connected; direct report import is not. |
| Smart Offer Intake | Coming Soon or pilot | External sign-on/integration still needs confirmation. |
| Smart Forms | Active as launcher/reference only | It remains its own signing system. |
| Smart Property ROI | Active as launcher/reference only | It remains its own calculator and scenario system. |

Do not promise staff that these apps automatically share sign-in, populate forms, or return completed files until the external app owner provides an approved integration contract.

## Step 6 — Turn on scheduled reminders only after you choose an owner

Four features are built but will not run automatically until a secure scheduler calls them. Pick **one owner**—either your technical administrator or an approved automation service.

| Scheduled feature | What it does | What the owner must configure |
|---|---|---|
| Daily activity digest | Sends agents one grouped daily summary of routine Staff/TC checklist activity. | A once-daily secure scheduled call. |
| Thursday open-house last call | Sends the last-call notice using your configured Central time. | A Thursday scheduled call at the desired time. |
| Transaction deadline reminders | Sends day-before and due-day notices and updates the Staff/TC deadline worklist. | A daily scheduled call at the configured Central time. |
| Hub scheduled posts | Publishes Hub posts whose scheduled date has arrived. | A regular secure scheduled call. |

Before activating each schedule, decide the sending time, confirm that email/SMS/in-app notification preferences are set correctly, and test with a small internal audience. The system is designed not to claim “Delivered” when the provider has not confirmed delivery.

## Step 7 — Decide whether to activate Facebook Page publishing

The internal Social Media queue is ready for draft captions, review, approval, archived posts, and a copy-caption fallback. Official Facebook Page publishing is intentionally **not active** until the proper Meta business setup is complete.

To activate it safely:

1. Decide which official Facebook Page will be used.
2. Create or use the brokerage’s Meta Business application.
3. Configure Facebook Login for Business and the exact secure callback URL.
4. Get the required Page permissions and tasks approved.
5. Store server configuration only in the approved deployment settings—not in email, chat, or source code.
6. Connect the Page in Smart Broker Social Connections.
7. Publish one approved non-sensitive test post.
8. Verify that a person who is **not** a Page administrator can open the final public post link.

Do not use the older Facebook Group code as a substitute. It uses a separate older token approach that should be security-reviewed before it is relied upon.

## Step 8 — Finish the native Hub content decision

The new Hub is ready to hold announcements, training, meetings, resources, documents, and videos. The old Google Keaty Hub should remain available while content is reviewed.

1. Have one person review the old Hub page by page.
2. Mark each item as **Move**, **Link**, **Archive**, or **Delete later**.
3. Move only material that is current, approved, and still useful.
4. Leave market feeds—Coming Soon, New Listings, Price Reductions, Back on Market, and Buyer Needs—as links to their existing Smart Broker pages instead of copying them into the Hub.
5. Do not delete the old Hub until the new Hub has been used successfully for at least one full communication cycle.

## Step 9 — Decide whether external app automation is worth doing

Smart Project, Smart Inspections, Smart Forms, and Smart Property are connected safely as launchers and transaction references. That is useful today.

If you want actual single sign-on, automatic prefill, automatic document return, or automatic scenario/report syncing, first obtain from each outside app owner:

1. Their API documentation.
2. Their sign-on or OAuth documentation.
3. Their webhook/completion-event documentation.
4. Their permission and data-sharing rules.
5. Written approval for the intended data flow.

Only after that review should an automatic connection be built. Until then, the current launcher/reference approach is the correct lower-risk method.

## Step 10 — Staff acceptance test

Choose a small test group: one agent, one TC, one Staff member, one Admin, and one broker reviewer. Ask each person to use their normal role for one short session.

They should test the screens that affect their job, not every feature. Staff should concentrate on Pending transactions, activity/checklists, closeout, deadline worklist, and open houses. Agents should concentrate on transactions, contacts, My Transactions, sign orders, Ask Your Broker, and Social Media drafts. Admin should review app controls, recruiting management, Hub, and notification logs.

Record only three things for each issue: the user role, the exact page/transaction, and what happened after Save. This prevents vague “it did not work” reports and avoids changing records unnecessarily.

## Step 11 — Declare the work complete

You can call this queue complete only after all four statements are true:

1. The production build finishes successfully.
2. The live Smart Broker version is confirmed on Firebase/App Hosting.
3. The short role-based smoke test passes or every discovered issue is resolved.
4. Each optional feature is either activated with its required account/scheduler or deliberately left in **Coming Soon** with an owner and a next review date.

## What I recommend you do first

**Start with Step 1: verify the new deployment in Firebase/App Hosting.** The coding work is in GitHub and the production build now passes; the remaining release question is whether the live site received the new build.

After that, the best business decision is Step 4: confirm the recruiting-incentive rules before anyone uses **Mark Paid**.

## References

[1]: ./master-task-queue-final-report-2026-09-06.md "Master Task Queue final report"
[2]: ./master-task-queue-progress.md "Task-by-task implementation and dependency log"
