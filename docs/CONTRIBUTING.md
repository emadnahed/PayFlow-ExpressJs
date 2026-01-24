# Contributing to PayFlow

Thank you for your interest in contributing to PayFlow! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Git

### Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/payflow-expressjs.git
cd payflow-expressjs

# Install dependencies
npm install

# Start development services
npm run docker:up

# Run development server
npm run dev

# Run tests
npm test
```

## Development Workflow

### Branch Naming

Use descriptive branch names:

```
feature/add-user-notifications
fix/wallet-balance-race-condition
docs/update-api-reference
refactor/transaction-service
test/saga-compensation-flow
```

### Commit Messages

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(transactions): add retry logic for failed credits

fix(wallet): prevent race condition in concurrent debits

docs(api): update webhook payload examples

test(saga): add compensation flow tests
```

## Code Standards

### TypeScript Guidelines

```typescript
// Use explicit types
function processTransaction(tx: Transaction): Promise<TransactionResult> {
  // ...
}

// Avoid 'any' - use 'unknown' if type is uncertain
function handleError(error: unknown): void {
  if (error instanceof AppError) {
    // handle
  }
}

// Use interfaces for objects
interface CreateTransactionDTO {
  receiverId: string;
  amount: number;
  description?: string;
}

// Use enums for fixed values
enum TransactionStatus {
  INITIATED = 'INITIATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
```

### Code Style

The project uses ESLint and Prettier. Run before committing:

```bash
# Check linting
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### File Organization

```
src/services/feature-name/
├── feature.service.ts      # Business logic
├── feature.controller.ts   # Request handling
├── feature.routes.ts       # Route definitions
├── feature.validation.ts   # Input validation
├── feature.types.ts        # TypeScript types
└── index.ts                # Public exports
```

## Testing

### Test Structure

```
tests/
├── unit/              # Isolated function tests
├── integration/       # Service integration tests
├── e2e/               # API endpoint tests
├── chaos/             # Failure scenario tests
└── load/              # Performance tests
```

### Writing Tests

```typescript
// tests/e2e/wallet.test.ts
describe('Wallet Service', () => {
  describe('POST /wallets/me/deposit', () => {
    it('should deposit funds successfully', async () => {
      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 });

      expect(response.status).toBe(200);
      expect(response.body.data.balance).toBe(initialBalance + 100);
    });

    it('should reject invalid amounts', async () => {
      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: -50 });

      expect(response.status).toBe(400);
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Coverage Requirements

| Type | Minimum Coverage |
|------|------------------|
| Unit Tests | 80% |
| Integration Tests | 70% |
| E2E Tests | All critical paths |

## Pull Request Process

### Before Submitting

1. **Update from main:**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run all checks:**
   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run build
   ```

3. **Update documentation** if needed

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] New tests added

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed code
- [ ] Commented complex code
- [ ] Updated documentation
- [ ] No new warnings
```

### Review Process

1. Create PR against `main` branch
2. Fill out PR template
3. Request review from maintainers
4. Address feedback
5. Squash and merge after approval

## Architecture Decisions

When proposing significant changes:

1. **Open an issue first** to discuss the approach
2. **Include context** about why the change is needed
3. **Consider alternatives** and explain trade-offs
4. **Document the decision** in the PR

### Areas Requiring Discussion

- New service dependencies
- Database schema changes
- API contract changes
- Authentication/authorization changes
- Performance-critical code

## Adding New Features

### Service Template

```typescript
// src/services/new-feature/new-feature.service.ts
import { logger } from '../../observability/logger';
import { metrics } from '../../observability/metrics';

export class NewFeatureService {
  async performAction(data: ActionData): Promise<ActionResult> {
    const timer = metrics.startTimer('new_feature_action');

    try {
      logger.info({ action: 'new_feature.action', data }, 'Starting action');

      // Business logic here

      metrics.incrementCounter('new_feature_success');
      return result;
    } catch (error) {
      metrics.incrementCounter('new_feature_error');
      logger.error({ error, data }, 'Action failed');
      throw error;
    } finally {
      timer.end();
    }
  }
}
```

### Route Template

```typescript
// src/services/new-feature/new-feature.routes.ts
import { Router } from 'express';
import { authenticate } from '../../auth/auth.middleware';
import { validate } from '../../middlewares/validateRequest';
import { newFeatureController } from './new-feature.controller';
import { actionValidation } from './new-feature.validation';

const router = Router();

router.use(authenticate);

router.post(
  '/action',
  validate(actionValidation),
  newFeatureController.performAction
);

export default router;
```

## Security Guidelines

### Sensitive Data

- Never log passwords, tokens, or secrets
- Use environment variables for configuration
- Sanitize user input before processing
- Validate all external data

### Common Vulnerabilities

Avoid these in your code:

- SQL/NoSQL injection
- XSS (Cross-Site Scripting)
- CSRF (Cross-Site Request Forgery)
- Command injection
- Path traversal

### Security Review

Changes involving these require extra scrutiny:

- Authentication/authorization
- Cryptographic operations
- User input handling
- File operations
- External API calls

## Questions and Support

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and ideas
- **Pull Requests**: For code contributions

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in commit messages (Co-authored-by)

Thank you for contributing to PayFlow!
