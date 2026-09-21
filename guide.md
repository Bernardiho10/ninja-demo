# ninja-bet: Developer Demo Implementation & Presentation Guide (V2)

> **Purpose:** Step-by-step developer implementation blueprint and executive presentation guide for demonstrating Ninja API to developers and decision-makers. Grounded in feedback from Technical Director Okechukwu Ugwu.

---

## Part 1: What Was Wrong With Our Approach & Why We Changed It

Before diving into code and presenting, here is the clear, candid diagnosis of what was wrong previously:

### 1. We built a fake betting app instead of a developer magnet
- **The Mistake:** We spent energy modeling odds, match fixtures, sports league tabs, bet slips, and complex anti-bonus-farming duplicate account checks.
- **The Boss's Correction:** Developers don't care how to run a sportsbook; they know how to build their own business logic. They came to see **how Ninja solves identity verification**.
- **The Fix:** Strip the fluff. Focus exclusively on the **3 Identity Checkpoints**.

### 2. We made two calls on registration instead of one
- **The Mistake:** We ran `lookup` followed by `verify`.
- **The Boss's Correction:** `lookup` returns raw registry data. When a customer signs up, they are already providing their details. The industry-standard approach is a single `verify` call matching their name, NIN, and verifying they are $\ge 18$ via Date of Birth (DOB).
- **The Fix:** One clean call to `POST /api/identity/identify` with `mode: "verify"`.

### 3. The user action was disconnected from the Ninja code
- **The Mistake:** Clicking buttons immediately triggered backend actions with no explanation of what was happening under the hood.
- **The Boss's Correction:** Developers need to see the exact code before it runs.
- **The Fix:** Implement the **Code-First Slide-Out / Drawer**: clicking *"Verify NIN"* reveals the code payload first. The user clicks *"Noted, Proceed"* to fire the call.

### 4. The guided tour was frustrating and broke the UI
- **The Mistake:** A forced overlay with fixed cutout holes covered buttons, blocked inspection, and trapped the user.
- **The Boss's Correction:** Developers inspect elements and explore freely.
- **The Fix:** Replace the forced tour with an intuitive **3-Checkpoint Progress Bar** (Sign-up $\rightarrow$ Bank BVN $\rightarrow$ Withdrawal).

### 5. Over-reliance on database state caused demo collisions
- **The Mistake:** Accounts got locked, phone numbers clashed, and background restarts broke demo flow.
- **The Boss's Correction:** Use browser storage (`localStorage`). This makes the demo self-healing, instant-resetting, and able to run statically on **GitHub Pages**.

---

## Part 2: Step-by-Step Implementation Roadmap

```
ninja-bet/web/src/
├── index.html              # Clean, unified Single-Page Application (SPA)
├── index.ts                # Reactive state machine (localStorage + API client)
├── index.css               # Modern, developer-focused dark theme (BOU standard)
├── lib/
│   ├── checkpoints.ts      # Logic for Checkpoint 1, 2, and 3
│   ├── codeModal.ts        # Compact Code-First Slide-out / Drawer
│   ├── linkScenarios.ts    # 3 Flow Link Scenarios (Pre-filled, Unfilled, Custom)
│   └── telemetry.ts        # Live HTTP request/response inspector
```

### Checkpoint 1: Registration with Code-First Slide-Out
1. **The Form:**
   - Fields: First Name, Last Name, Phone Number, NIN, Date of Birth.
   - Presets: `James Bond (49 yrs, Pass)`, `Chinedu Okafor (Name Mismatch, Reject)`, `Tobi Minor (16 yrs, Underage Block)`.
   - **Simulation Parameters Box:** Developer chooses initial simulated wallet balance (default: ₦10,000).
2. **The Code-First Action:**
   - User clicks *"Verify NIN & Create Account"*.
   - A sleek slide-out shows:
     ```bash
     curl -X POST https://api.sandbox.ninja.boucloud.io/api/identity/identify \
       -H "Authorization: Bearer $NINJA_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{
         "idType": "nin",
         "mode": "verify",
         "idNumber": "77777777777",
         "firstName": "James",
         "lastName": "Bond",
         "dateOfBirth": "1975-01-01"
       }'
     ```
   - User clicks **`[ Noted, Proceed → ]`**.
3. **Execution & Advancement:**
   - Call fires $\rightarrow$ response returns $\rightarrow$ state updates $\rightarrow$ advances to Checkpoint 2.

### Checkpoint 2: Bank Account & BVN Ownership Verification
1. **The Context:**
   - Player now has funds in their wallet. They need to register a destination bank account before withdrawing.
2. **The Form:**
   - Bank Name (e.g. Access Bank, GTBank), Account Number (10 digits), BVN (11 digits).
   - Presets: `Matched BVN (James Bond - 77777777777)`, `Mismatched Mule BVN (22222222222)`.
3. **The Code-First Action:**
   - User clicks *"Verify BVN & Save Account"*.
   - Slide-out shows BVN verify call:
     ```json
     {
       "idType": "bvn",
       "mode": "verify",
       "idNumber": "77777777777",
       "firstName": "James",
       "lastName": "Bond"
     }
     ```
   - User clicks **`[ Noted, Proceed → ]`**.
   - If matched $\rightarrow$ Account is verified and saved. Advance to Checkpoint 3.
   - If mismatched $\rightarrow$ Immediate alert: *"AML Mismatch: Account rejected. BVN does not belong to registered player."*

### Checkpoint 3: High-Value Withdrawal & Hosted Selfie Biometric 2FA
1. **The Context:**
   - Player requests to withdraw their funds.
   - To protect against Account Takeover (ATO), the operator enforces biometric liveness verification before disbursing.
2. **The 3 Flow Link Scenarios:**
   - Developer selects scenario tab:
     - **Scenario A: Pre-filled Form (Recommended)**
       Passes `values: { first_name: "James", last_name: "Bond" }`. The user only completes the live camera liveness check.
     - **Scenario B: Unfilled Form**
       Cold verification where the user manually types all information into Ninja's hosted portal.
     - **Scenario C: Custom Fields / Strictness Tiers**
       Passes custom tracking via `customer_ref: "player_123:wtd_456"` and selects liveness threshold (Medium: 85%).
3. **The Code-First Action:**
   - Slide-out displays `POST /api/flows/{flow_id}/links` payload.
   - User clicks **`[ Generate Secure Link & Launch → ]`**.
4. **Outcome & Disbursement:**
   - Hosted camera flow launches in modal or new tab.
   - Quick simulation buttons (`⚡ Simulate Pass 97%` / `⚡ Simulate Fail 2%`) available for camera-free testing.
   - Upon pass: Operator code executes disbursement logic and balance updates to ₦0.

---

## Part 3: Executive Presentation Script (What to Say to Your Boss / Integrators)

Use this script during live presentations. It speaks directly to business outcomes, developer experience, and regulatory compliance.

### Opening (0:00 - 1:00)
> *"Good morning. Today I'm demonstrating **ninja-bet**, our developer-first integration blueprint for Ninja API in Nigerian iGaming and Fintech.*  
>  
> *Rather than overwhelming developers with simulated betting games, this demo zeroes in on the **three critical moments** where compliance and identity matter:  
> 1. **Player Sign-up:** Verifying NIN and guaranteeing age $\ge 18$ via Date of Birth.  
> 2. **Adding Bank Details:** Matching BVN ownership to prevent payout mule fraud.  
> 3. **Withdrawals:** Enforcing Layer-2 Biometric 2FA against Account Takeover (ATO) before funds leave.*  
>  
> *Crucially, we've implemented a **Code-First** developer experience: whenever you click an action, we show you the exact Ninja request payload before executing it, so developers instantly understand how to build it into their own stack."*

---

### Checkpoint 1: Registration Demo (1:00 - 3:00)
> *"Let's begin with Checkpoint 1: Sign-Up.*  
>  
> *Notice we have our quick presets here: an adult player, a name mismatch, and an underage minor. Under NLRC regulations, we cannot accept self-declared age or synthetic names.*  
>  
> *Notice also this **Simulation Parameters** box: developers can configure their starting balance right here—let's set it to ₦250,000.*  
>  
> *Watch what happens when I click 'Verify NIN & Create Account'. Notice that instead of silently submitting, this compact slide-out appears with the exact code about to be sent.*  
>  
> *Notice we use **one single call**: `POST /api/identity/identify` with `mode: verify`. We pass the NIN, name, and date of birth. We don't do a redundant lookup call because the user already supplied their details—we are verifying those details synchronously against the NIMC database.*  
>  
> *Now I click 'Noted, Proceed'. Ninja verifies the identity in real time, confirms age is over 18, and provisions the player with their simulated ₦250,000 wallet balance. We now advance directly to Checkpoint 2."*

---

### Checkpoint 2: Bank Account & BVN Ownership (3:00 - 5:00)
> *"Now the player has winnings and wants to register a withdrawal bank account.*  
>  
> *The biggest fraud vector in sports betting is **payout mule accounts**—someone registers under one identity, but withdraws into a friend's or money mule's bank account.*  
>  
> *Let's test what happens if a fraudster inputs a mismatched BVN—say, `22222222222`. When we click 'Verify BVN', our code slide-out shows the verification call matching the BVN against the registered player's name.*  
>  
> *When we execute it: rejected immediately. The system halts the setup and alerts that the BVN name does not match the player on file.*  
>  
> *Now let's switch to the legitimate BVN: `77777777777`. We click 'Verify BVN', confirm the call, and it succeeds 100%. The verified bank account is saved to the player's profile."*

---

### Checkpoint 3: Biometric Withdrawal & Link Scenarios (5:00 - 7:30)
> *"Finally, Checkpoint 3: Withdrawing Cash.*  
>  
> *When a player requests a withdrawal, password-only security is insufficient because of Account Takeovers (credential stuffing or session theft). We enforce Layer-2 Biometric Facial Verification.*  
>  
> *Here we showcase **three different integration scenarios** that Ninja supports:  
> - **Scenario 1 (Recommended): Pre-filled Form.** Because we already verified James Bond at registration, we pre-fill `values` with his name so he only has to take a live selfie.  
> - **Scenario 2: Unfilled Form.** A cold KYC link where Ninja collects the identity details from scratch.  
> - **Scenario 3: Custom Field Tracking.** Embedding our internal bet/withdrawal reference via `customer_ref`.*  
>  
> *Let's generate the pre-filled link. We click 'Generate Verification Link', view the `CreateFlowLink` code, and launch the hosted flow.*  
>  
> *The player completes the selfie on their phone or webcam, or we click 'Simulate Pass (97%)'. The moment Ninja clears the biometric match, our operator withdrawal logic executes and disburses the ₦250,000 to their verified account.*  
>  
> *Notice: the entire demo runs client-side with reactive browser storage. There are no database locks, and this entire repository is built to be hosted directly on **GitHub Pages** for any developer in the world to test immediately."*

---

## Part 4: Key Answers to Expected Boss / Developer Questions

| Question | Authoritative Answer |
| :--- | :--- |
| **Q: Why don't you do a lookup on registration?** | *"Lookup returns unverified raw registry records and is designed for back-office investigations or KYB. On player signup, the customer has already entered their name and DOB; a single `verify` call checks those claims directly against NIMC in a single network round-trip."* |
| **Q: Does Ninja hold or touch customer withdrawal funds?** | *"No. Ninja is strictly an identity and fraud prevention layer. Ninja runs the biometric liveness gate; once Ninja returns `status: passed`, the operator's own payment processor (e.g. Paystack, Flutterwave) executes the disbursement."* |
| **Q: Why pre-fill the hosted selfie flow?** | *"Because asking a logged-in user to re-type their first and last name creates unnecessary drop-off. By pre-filling `values`, the user jumps straight into the camera liveness check, maximizing conversion."* |
| **Q: Can this run without running a local Go server?** | *"Yes! By utilizing localStorage state and high-fidelity mock fallback, the frontend can be deployed statically to GitHub Pages as an instant zero-install interactive demo."* |
