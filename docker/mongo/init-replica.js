// MongoDB Replica Set Initialization Script
// This runs on first startup of the primary node

try {
  // Check if replica set is already initialized
  const status = rs.status();
  print('Replica set already initialized');
} catch (e) {
  // Initialize replica set if not already done
  print('Initializing replica set...');

  rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'mongodb-primary:27017', priority: 2 },
      { _id: 1, host: 'mongodb-secondary:27017', priority: 1 }
    ]
  });

  print('Replica set initialized successfully');
}

// Wait for primary election
sleep(5000);

// Create payflow database and initial collections
const db = db.getSiblingDB('payflow');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'email', 'password', 'name'],
      properties: {
        userId: { bsonType: 'string' },
        email: { bsonType: 'string' },
        password: { bsonType: 'string' },
        name: { bsonType: 'string' }
      }
    }
  }
});

db.createCollection('wallets', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['walletId', 'userId', 'balance'],
      properties: {
        walletId: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        balance: { bsonType: 'number', minimum: 0 }
      }
    }
  }
});

db.createCollection('transactions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['transactionId', 'senderId', 'receiverId', 'amount', 'status'],
      properties: {
        transactionId: { bsonType: 'string' },
        senderId: { bsonType: 'string' },
        receiverId: { bsonType: 'string' },
        amount: { bsonType: 'number', minimum: 0 },
        status: { bsonType: 'string' }
      }
    }
  }
});

// Create indexes
db.users.createIndex({ userId: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.wallets.createIndex({ walletId: 1 }, { unique: true });
db.wallets.createIndex({ userId: 1 });
db.transactions.createIndex({ transactionId: 1 }, { unique: true });
db.transactions.createIndex({ senderId: 1, status: 1 });
db.transactions.createIndex({ receiverId: 1, status: 1 });
db.transactions.createIndex({ createdAt: -1 });

print('PayFlow database initialized with collections and indexes');
