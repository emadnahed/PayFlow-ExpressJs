# KidsPay Platform — In-Depth Build Plan

> A gamified financial literacy platform where kids learn money skills by sending mocked currency to each other, completing quests, and managing their virtual wallet — powered by the PayFlow backend.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [System Architecture](#2-system-architecture)
3. [What PayFlow Already Provides](#3-what-payflow-already-provides)
4. [Backend Additions Required](#4-backend-additions-required)
5. [Mobile App Structure](#5-mobile-app-structure)
6. [Screen-by-Screen Breakdown](#6-screen-by-screen-breakdown)
7. [Gameplay & Mechanics](#7-gameplay--mechanics)
8. [Tech Stack](#8-tech-stack)
9. [API Contract (New Endpoints)](#9-api-contract-new-endpoints)
10. [Data Models (New)](#10-data-models-new)
11. [Phased Delivery Plan](#11-phased-delivery-plan)
12. [Security & Safety Considerations](#12-security--safety-considerations)

---

## 1. Vision & Goals

### What Is KidsPay?

KidsPay is a **multiplayer educational platform** where kids aged 7–14 learn real-world money concepts through gameplay. Each kid gets a virtual wallet loaded with fake "KidCoins". They can:

- Send and receive KidCoins with classmates/friends
- Earn coins by completing financial quests and challenges
- Spend coins in a virtual marketplace
- Save coins toward goals they set
- Compete on leaderboards
- Learn through bite-sized lessons and quizzes

No real money is ever involved. The platform simulates real banking mechanics in a safe, gamified environment.

### Core Learning Outcomes

| Concept | How It's Taught |
|---|---|
| Earning money | Quests, challenges, daily login rewards |
| Spending wisely | Virtual marketplace with limited coins |
| Saving | Goal tracker, locked savings jars |
| Sending/receiving | Peer transfers with mocked transactions |
| Budgeting | Spending limits, category tracking |
| Banking | Wallet, balance, transaction history |
| Interest | Savings jar earns small % over time (simulated) |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    KidsPay App (Expo)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Wallet  │ │  Quests  │ │  Market  │ │   Learn   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ REST API (HTTPS)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              PayFlow ExpressJS Backend                   │
│                                                          │
│  [Existing]                    [New to Add]              │
│  ├─ Auth (register/login)      ├─ User search            │
│  ├─ Wallet (balance/history)   ├─ Leaderboard            │
│  ├─ Transactions (send/recv)   ├─ Quests system          │
│  ├─ Webhooks (events)          ├─ Marketplace            │
│  └─ Health/metrics             └─ Starter balance        │
│                                                          │
│  MongoDB ──── Redis ──── BullMQ                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. What PayFlow Already Provides

These features work **out of the box** — zero backend changes needed.

### Authentication
- `POST /auth/register` — Create kid account
- `POST /auth/login` — Login with JWT
- `POST /auth/refresh` — Refresh tokens
- `GET /auth/me` — Get current profile

### Wallet
- `GET /wallets/me` — View KidCoin balance
- `GET /wallets/me/history` — See all credits and debits
- `POST /wallets/me/deposit` — Admin deposits starter coins (use for quest rewards too)

### Transactions (Peer Transfers)
- `POST /transactions` — Send KidCoins to another kid
- `GET /transactions` — List send/receive history
- `GET /transactions/:id` — Transaction detail

### Observability (already production-grade)
- Prometheus metrics, Pino logs, Sentry error tracking
- Correlation IDs on every request

---

## 4. Backend Additions Required

These are the **only new things** to build on the PayFlow backend. Estimated: **2–4 days total**.

### 4.1 Starter Balance on Registration (1 line)

When a new user registers, auto-deposit 500 KidCoins into their wallet.

**Change:** In `src/auth/auth.controller.ts` after wallet creation:
```typescript
await walletService.credit(wallet.walletId, 500, 'STARTER_BONUS');
```

---

### 4.2 User Search (Find Friends)

Kids need to find other kids by username to send coins.

**New endpoint:** `GET /users/search?q=username`

Returns a list of matching users (id, name, avatar only — no sensitive data).

---

### 4.3 Leaderboard

**New endpoint:** `GET /leaderboard?type=richest|most_generous&limit=10`

- `richest` — sorted by wallet balance
- `most_generous` — sorted by total coins sent (count of completed transactions)

---

### 4.4 Quest System

Quests are challenges that reward KidCoins on completion.

**New endpoints:**
- `GET /quests` — list available quests
- `GET /quests/my` — list kid's quest progress
- `POST /quests/:id/complete` — mark quest complete (server validates, then deposits reward)

**Quest types (server-verified):**
- First transaction sent
- Send to 3 different friends
- Save 100 coins (don't spend for 3 days)
- Complete a lesson
- Login 5 days in a row

---

### 4.5 Marketplace

Kids spend coins on virtual items (stickers, avatars, profile frames).

**New endpoints:**
- `GET /marketplace/items` — list purchasable items
- `POST /marketplace/buy/:itemId` — purchase item (deducts coins from wallet)
- `GET /marketplace/inventory` — items the kid owns

---

### 4.6 Savings Jar (Optional, Phase 2)

Kids lock coins into a jar. After N days, they get a small bonus (simulated interest).

**New endpoints:**
- `POST /savings/jars` — create jar with goal amount + duration
- `GET /savings/jars` — list jars
- `POST /savings/jars/:id/deposit` — add coins to jar
- `POST /savings/jars/:id/withdraw` — break the jar (no bonus) or mature (with bonus)

---

## 5. Mobile App Structure

**Tech Stack:** React Native + Expo + TypeScript

```
kidspay-app/
├── app/                        # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── home.tsx            # Wallet + quick actions
│   │   ├── send.tsx            # Send KidCoins
│   │   ├── quests.tsx          # Quests & challenges
│   │   ├── market.tsx          # Virtual marketplace
│   │   └── learn.tsx           # Lessons & quizzes
│   └── _layout.tsx
├── components/
│   ├── WalletCard.tsx
│   ├── TransactionItem.tsx
│   ├── QuestCard.tsx
│   ├── MarketItem.tsx
│   ├── LeaderboardRow.tsx
│   ├── LessonCard.tsx
│   └── QuizQuestion.tsx
├── store/
│   ├── auth.store.ts           # Zustand — user/token
│   ├── wallet.store.ts         # Zustand — balance/history
│   └── quest.store.ts          # Zustand — quest progress
├── api/
│   ├── client.ts               # Axios instance with JWT interceptor
│   ├── auth.api.ts
│   ├── wallet.api.ts
│   ├── transactions.api.ts
│   ├── quests.api.ts
│   └── leaderboard.api.ts
├── content/
│   ├── lessons.json            # Static lesson content
│   └── quizzes.json            # Static quiz questions
└── constants/
    └── theme.ts                # Colors, fonts, spacing
```

---

## 6. Screen-by-Screen Breakdown

### Home Tab
- Big colorful coin balance display
- Quick action buttons: Send, Receive (show QR / username), Quests
- Recent transactions feed (last 5)
- Daily streak counter + bonus claim button
- Active savings jars progress

### Send KidCoins Screen
- Search field → calls `GET /users/search`
- Pick friend from results or recents
- Enter amount + optional memo ("for lunch bet!")
- Confirm → `POST /transactions`
- Animated success with confetti

### Quests Tab
- Active quests with progress bars
- Completed quests with coin rewards earned
- Quest categories: Social (send to friends), Saver, Learner, Explorer
- Quest card tapped → see details + complete button

### Marketplace Tab
- Grid of virtual items: avatars, badge frames, emoji reactions
- Coin price on each item
- "Buy" triggers deduction from wallet
- Inventory section — items you own (equip avatar frames, etc.)

### Learn Tab
- Lesson cards (bite-sized, 2–3 min each):
  - "What is a wallet?"
  - "Why do we save?"
  - "What is a bank?"
  - "How does interest work?"
  - "What is a budget?"
  - "Good spending vs bad spending"
- Each lesson ends with a 3-question quiz
- Pass quiz → earn KidCoins + XP
- Progress tracker (lessons completed / total)

### Leaderboard Screen
- Tabs: Richest Kids / Most Generous
- Top 10 with avatars, names, coin amounts
- Your own rank highlighted even if not in top 10

### Profile Screen
- Avatar (from marketplace)
- Username, join date
- Stats: Total earned, Total sent, Lessons completed, Quests done
- Badge collection

---

## 7. Gameplay & Mechanics

### KidCoin Economy

| Source | Amount |
|---|---|
| Starter bonus (on signup) | 500 KC |
| Daily login | 10 KC |
| 5-day streak bonus | 50 KC |
| Complete a lesson | 20 KC |
| Pass a quiz | 15 KC |
| Complete a quest | 25–100 KC |
| Savings jar maturity bonus | 5% of amount |
| Receiving from friends | Variable |

### Spending Sinks (keep economy balanced)

| Sink | Cost |
|---|---|
| Basic avatar | 50 KC |
| Profile frame | 100 KC |
| Animated sticker pack | 150 KC |
| Premium badge | 200 KC |
| Emoji reaction | 30 KC |

### Quest Examples

| Quest | Reward | Trigger |
|---|---|---|
| First Send | 25 KC | Complete 1 transaction |
| Social Butterfly | 50 KC | Send to 5 different users |
| Saver Starter | 30 KC | Create first savings jar |
| Knowledge Seeker | 40 KC | Complete 3 lessons |
| Week Warrior | 75 KC | Login 7 days in a row |
| Big Spender | 25 KC | Buy first marketplace item |
| Generous Kid | 100 KC | Send 500 KC total across any transactions |

### XP & Levels (Frontend only — no backend needed)

Track XP locally in AsyncStorage:
- Level 1–5: Beginner → Pro → Expert → Master → Legend
- XP earned same ways as coins
- Level-up shows animation + unlocks avatar border

---

## 8. Tech Stack

### Mobile App

| Layer | Choice | Why |
|---|---|---|
| Framework | React Native + Expo SDK 52 | Fastest to ship, iOS + Android |
| Routing | Expo Router v3 | File-based, clean |
| State | Zustand | Lightweight, no boilerplate |
| API client | Axios | Interceptors for JWT refresh |
| UI base | NativeWind v4 | Tailwind in RN, fast to build |
| Animations | Reanimated 3 + Lottie | Smooth, delightful for kids |
| Icons | Expo Vector Icons | Built-in |
| Local storage | MMKV | Fast key-value (XP, settings) |
| Push notifications | Expo Notifications | Quest reminders, received coins |

### Backend (PayFlow — existing)

| Layer | Tech |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Database | MongoDB + Mongoose |
| Cache/Queue | Redis + BullMQ |
| Auth | JWT (access + refresh tokens) |
| Docs | OpenAPI + Scalar UI |

---

## 9. API Contract (New Endpoints)

### User Search
```
GET /users/search?q=:query

Response 200:
{
  "success": true,
  "data": [
    { "userId": "...", "name": "Tommy", "avatarUrl": null }
  ]
}
```

### Leaderboard
```
GET /leaderboard?type=richest&limit=10

Response 200:
{
  "success": true,
  "data": {
    "type": "richest",
    "entries": [
      { "rank": 1, "userId": "...", "name": "Sara", "balance": 1240 }
    ],
    "myRank": { "rank": 14, "balance": 430 }
  }
}
```

### Quests
```
GET /quests
GET /quests/my
POST /quests/:id/complete

Complete Response 200:
{
  "success": true,
  "data": {
    "quest": { "id": "...", "title": "First Send", "reward": 25 },
    "coinsAwarded": 25,
    "newBalance": 525
  }
}
```

### Marketplace
```
GET /marketplace/items
POST /marketplace/buy/:itemId

Buy Response 200:
{
  "success": true,
  "data": {
    "item": { "id": "...", "name": "Cool Avatar", "price": 50 },
    "coinsSpent": 50,
    "newBalance": 475
  }
}
```

---

## 10. Data Models (New)

### Quest
```typescript
{
  questId: string
  title: string
  description: string
  category: 'social' | 'saver' | 'learner' | 'explorer'
  reward: number           // KidCoins
  trigger: string          // 'first_transaction' | 'send_5_users' | ...
  isRepeatable: boolean
}
```

### UserQuestProgress
```typescript
{
  userId: string
  questId: string
  status: 'active' | 'completed'
  completedAt?: Date
  rewardClaimed: boolean
}
```

### MarketplaceItem
```typescript
{
  itemId: string
  name: string
  description: string
  category: 'avatar' | 'frame' | 'sticker' | 'badge' | 'reaction'
  price: number
  imageUrl: string
  isActive: boolean
}
```

### UserInventory
```typescript
{
  userId: string
  itemId: string
  purchasedAt: Date
  isEquipped: boolean
}
```

### SavingsJar
```typescript
{
  jarId: string
  userId: string
  name: string
  goalAmount: number
  currentAmount: number
  durationDays: number
  matureAt: Date
  status: 'active' | 'withdrawn' | 'matured'
  bonusRate: number        // e.g. 0.05 for 5%
}
```

---

## 11. Phased Delivery Plan

### Phase 1 — Working App (Week 1–2)
**Goal:** Kids can register, see balance, send coins to each other.

Backend:
- [ ] Add starter balance (500 KC) on registration
- [ ] Add `GET /users/search` endpoint

Mobile:
- [ ] Project setup (Expo + NativeWind + Zustand + Axios)
- [ ] Auth screens (register, login)
- [ ] Home screen with wallet balance
- [ ] Send coins screen (search user → amount → confirm)
- [ ] Transaction history screen
- [ ] JWT token storage + auto-refresh

**Milestone:** Demo-able. Kids can make accounts and send fake money.

---

### Phase 2 — Gamification (Week 3–4)
**Goal:** Quests, leaderboard, daily rewards make it engaging.

Backend:
- [ ] Quest model + seed data (10 quests)
- [ ] `GET /quests`, `GET /quests/my`, `POST /quests/:id/complete`
- [ ] `GET /leaderboard` endpoint
- [ ] Daily login reward endpoint

Mobile:
- [ ] Quests tab
- [ ] Leaderboard screen
- [ ] Daily streak UI + reward claim
- [ ] Push notification for received coins (Expo Notifications)
- [ ] Basic animation on coin send (confetti)

**Milestone:** Engaging loop. Kids have a reason to come back daily.

---

### Phase 3 — Learn & Earn (Week 5)
**Goal:** Lessons and quizzes teach financial concepts.

Mobile only:
- [ ] Learn tab with lesson cards
- [ ] Static lesson content (6–8 lessons in JSON)
- [ ] Quiz UI with 3 questions per lesson
- [ ] XP + coin reward on quiz completion (calls deposit endpoint)
- [ ] Progress tracker

**Milestone:** Educational content live. Platform achieves its learning goal.

---

### Phase 4 — Marketplace & Savings (Week 6–7)
**Goal:** Kids have things to spend and save for.

Backend:
- [ ] Marketplace item model + seed data
- [ ] `GET /marketplace/items`, `POST /marketplace/buy/:itemId`, `GET /marketplace/inventory`
- [ ] Savings jar model + endpoints

Mobile:
- [ ] Marketplace tab with item grid
- [ ] Inventory + equip avatar items
- [ ] Savings jar UI (create, deposit, track progress)
- [ ] Profile screen with stats + badges

**Milestone:** Full economy loop. Earn → Save → Spend cycle complete.

---

### Phase 5 — Polish & Safety (Week 8)
- [ ] Profanity filter on transaction memos
- [ ] Username moderation (no inappropriate names)
- [ ] Admin panel (simple): reset balances, disable accounts, seed quests
- [ ] Onboarding flow (3-screen tutorial on first launch)
- [ ] Accessibility: larger text, high contrast option
- [ ] App icons, splash screen, App Store assets

---

## 12. Security & Safety Considerations

Since this is for kids, extra care is needed:

| Concern | Solution |
|---|---|
| Inappropriate usernames | Allowlist of acceptable characters + word filter on registration |
| Toxic transaction memos | Filter memo text before saving (bad-words library) |
| Account takeover | Strong password requirements, no password sharing prompts in UI |
| Privacy | Never expose email/phone in user search — name + avatar only |
| Coin abuse (exploit quests) | Server-side quest validation, one-time rewards marked in DB |
| Marketplace price manipulation | Prices defined server-side only, never trust client |
| Data minimization | Collect only: name, username, password. No DOB, no real name required |

---

## Quick Start Checklist

```
Backend:
  [ ] Clone PayFlow repo
  [ ] Add starter balance on registration
  [ ] Add user search endpoint
  [ ] Seed quest + marketplace data

Mobile:
  [ ] npx create-expo-app kidspay --template
  [ ] Install: nativewind, zustand, axios, mmkv, reanimated, lottie
  [ ] Set EXPO_PUBLIC_API_URL=http://your-payflow-server
  [ ] Wire up auth → wallet → send flow
  [ ] Ship!
```

---

*Last updated: March 2026*
*Backend: PayFlow ExpressJS — /Users/emaad/Desktop/PayFlow-ExpressJs*
