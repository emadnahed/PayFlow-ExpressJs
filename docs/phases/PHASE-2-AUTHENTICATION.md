# Phase 2: Authentication & User Management

## Status: Complete

## Goals
- Secure API with JWT authentication
- User registration and login
- Protected routes foundation

---

## Dependencies to Install
```bash
npm install bcryptjs jsonwebtoken express-validator
npm install -D @types/bcryptjs @types/jsonwebtoken
```

---

## Implementation

### Module Structure
```
src/auth/
├── auth.controller.ts    # Login, register, refresh handlers
├── auth.service.ts       # JWT generation, password hashing
├── auth.middleware.ts    # Protect routes middleware
├── auth.routes.ts        # /auth endpoints
└── auth.validation.ts    # Input validation schemas
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Create user + wallet |
| POST | `/auth/login` | No | Get JWT token |
| POST | `/auth/refresh` | No | Refresh access token (refresh token in body) |
| GET | `/auth/me` | Yes | Get current user |

---

## User Model Updates

Add to existing User model:
```typescript
interface IUser {
  // Existing fields...
  password: string;           // Hashed password
  isEmailVerified: boolean;   // Email verification status
  lastLoginAt?: Date;         // Last login timestamp
}
```

---

## JWT Strategy

### Token Structure
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}
```

### Token Expiry
- Access Token: 15 minutes
- Refresh Token: 7 days

---

## Auth Middleware

```typescript
// Usage on protected routes
router.get('/wallets/me', authMiddleware, walletController.getMyWallet);
```

---

## E2E Tests Required

1. **Registration**
   - Valid registration creates user + wallet
   - Duplicate email rejection
   - Weak password rejection

2. **Login**
   - Valid credentials return token
   - Invalid credentials rejected
   - Account not found handling

3. **Protected Routes**
   - Access with valid token
   - Rejection without token
   - Rejection with expired token

4. **Token Refresh**
   - Valid refresh returns new access token
   - Invalid refresh rejected

---

## Files to Create/Modify

### New Files
- `src/auth/auth.controller.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth.middleware.ts`
- `src/auth/auth.routes.ts`
- `src/auth/auth.validation.ts`
- `tests/e2e/auth.test.ts`

### Modify
- `src/models/User.ts` - Add password, verification fields
- `src/app.ts` - Mount auth routes
- `.env.example` - Add JWT_SECRET, JWT_EXPIRES_IN

---

## Success Criteria
- [ ] User can register with email/password
- [ ] User can login and receive JWT
- [ ] Protected routes reject unauthenticated requests
- [ ] Tokens can be refreshed
- [ ] All E2E tests pass

---

## Previous Phase
← [Phase 1: Foundation](./PHASE-1-FOUNDATION.md)

## Next Phase
→ [Phase 3: Wallet Service](./PHASE-3-WALLET-SERVICE.md)
