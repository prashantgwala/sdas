import 'dotenv/config';
import dns from 'node:dns';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const DB_NAME = process.env.DB_NAME || '';
if (!DB_NAME.startsWith('sdas_qa_')) {
  throw new Error('Refusing to run database tests without an isolated sdas_qa_* DB_NAME');
}

let db;

function indexByName(indexes, keySpec) {
  return indexes.find((index) => JSON.stringify(index.key) === JSON.stringify(keySpec));
}

async function orphans(collection, match, localField, foreignCollection) {
  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: foreignCollection,
        localField,
        foreignField: '_id',
        as: '__ref',
      },
    },
    { $match: { __ref: { $size: 0 } } },
    { $count: 'count' },
  ];
  const [result] = await db.collection(collection).aggregate(pipeline).toArray();
  return result?.count ?? 0;
}

async function collectionExists(name) {
  const found = await db.listCollections({ name }).toArray();
  return found.length > 0;
}

async function maxSuffix(collection, field, prefix) {
  const docs = await db.collection(collection).find({ [field]: { $regex: `^${prefix}-` } }).project({ [field]: 1 }).toArray();
  let max = 0;
  for (const doc of docs) {
    const parts = String(doc[field]).split('-');
    const value = Number.parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

before(async () => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be available to the QA runner');
  if (String(process.env.MONGODB_URI).startsWith('mongodb+srv://')) {
    const servers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
      .split(',')
      .map((server) => server.trim())
      .filter(Boolean);
    if (servers.length > 0) dns.setServers(servers);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 20000 });
  db = mongoose.connection.db;
});

after(async () => {
  await mongoose.disconnect();
});

describe('Database - connectivity and schema', () => {
  it('connects to the isolated QA database via ping', async () => {
    const result = await db.admin().ping();
    assert.equal(result.ok, 1);
    assert.equal(db.databaseName, DB_NAME);
  });

  it('has every required operational collection', async () => {
    const required = [
      'users',
      'roles',
      'permissions',
      'sessions',
      'grievances',
      'grievancecategories',
      'grievanceactions',
      'timelineevents',
      'digitalfiles',
      'filemovements',
      'filenotes',
      'applications',
      'applicationtypes',
      'documents',
      'departments',
      'systemsettings',
      'auditlogs',
      'notifications',
      'counters',
    ];
    for (const name of required) {
      assert.ok(await collectionExists(name), `missing collection ${name}`);
    }
  });

  it('declares unique and lookup indexes on core collections', async () => {
    const checks = [
      ['users', { email: 1 }, { unique: true }],
      ['users', { mobile: 1 }, { unique: true }],
      ['roles', { key: 1 }, { unique: true }],
      ['permissions', { code: 1 }, { unique: true }],
      ['systemsettings', { key: 1 }, { unique: true }],
      ['counters', { key: 1 }, { unique: true }],
      ['grievances', { grievanceId: 1 }, { unique: true }],
      ['grievances', { department: 1, status: 1, priority: 1, createdAt: -1 }, {}],
      ['grievances', { citizen: 1, createdAt: -1 }, {}],
      ['digitalfiles', { fileId: 1 }, { unique: true }],
      ['digitalfiles', { fileNumber: 1 }, { unique: true }],
      ['digitalfiles', { department: 1, status: 1, createdAt: -1 }, {}],
      ['filemovements', { file: 1, dispatchedAt: -1 }, {}],
      ['filemovements', { toUser: 1, status: 1 }, {}],
      ['applications', { applicationId: 1 }, { unique: true }],
      ['applications', { citizen: 1, createdAt: -1 }, {}],
      ['timelineevents', { entityType: 1, entityId: 1, createdAt: -1 }, {}],
      ['documents', { entityType: 1, entityId: 1, createdAt: -1 }, {}],
      ['auditlogs', { createdAt: -1 }, {}],
      ['sessions', { expiresAt: 1 }, { expireAfterSeconds: 0 }],
      ['sessions', { refreshTokenHash: 1 }, { unique: true }],
      ['otptokens', { expiresAt: 1 }, { expireAfterSeconds: 0 }],
      ['loginattempts', { createdAt: 1 }, { expireAfterSeconds: 7776000 }],
      ['notifications', { createdAt: 1 }, { expireAfterSeconds: 31536000 }],
    ];
    for (const [collection, keySpec, expected] of checks) {
      if (!(await collectionExists(collection))) continue;
      const indexes = await db.collection(collection).indexes();
      const index = indexByName(indexes, keySpec);
      assert.ok(index, `${collection} missing index ${JSON.stringify(keySpec)}`);
      if (expected.unique) assert.equal(index.unique, true, `${collection} ${JSON.stringify(keySpec)} must be unique`);
      if (expected.expireAfterSeconds !== undefined) {
        assert.equal(index.expireAfterSeconds, expected.expireAfterSeconds, `${collection} TTL mismatch`);
      }
    }
  });

  it('enforces the unique email constraint at the database level', async () => {
    const user = await db.collection('users').findOne({ email: 'qa.admin@sdas.test' });
    assert.ok(user, 'QA admin must exist');
    const duplicate = { ...user };
    delete duplicate._id;
    let inserted = null;
    try {
      const result = await db.collection('users').insertOne(duplicate);
      inserted = result.insertedId;
      assert.fail('duplicate email was accepted by the database');
    } catch (error) {
      assert.equal(error.code, 11000, `expected duplicate key error, got ${error.code ?? error.message}`);
    } finally {
      if (inserted) await db.collection('users').deleteOne({ _id: inserted });
    }
  });

  it('uses indexes for core lookups instead of collection scans', async () => {
    const queries = [
      ['users', { email: 'qa.admin@sdas.test' }, 'email_1'],
      ['grievances', { status: 'CLOSED' }, null],
      ['digitalfiles', { department: new mongoose.Types.ObjectId('6af5399bcb390cdaceee47f2') }, null],
      ['applications', { status: 'APPROVED' }, null],
    ];
    for (const [collection, filter, expectedIndex] of queries) {
      const plan = await db.collection(collection).find(filter).explain('queryPlanner');
      const serialised = JSON.stringify(plan);
      assert.ok(!serialised.includes('COLLSCAN'), `${collection} query used a collection scan`);
      if (expectedIndex) assert.ok(serialised.includes(expectedIndex), `${collection} did not use ${expectedIndex}`);
    }
  });
});

describe('Database - relationships and consistency', () => {
  it('has no orphan references between core collections', async () => {
    const checks = [
      ['grievances', { department: { $ne: null } }, 'department', 'departments'],
      ['grievances', { citizen: { $ne: null } }, 'citizen', 'users'],
      ['grievances', { category: { $ne: null } }, 'category', 'grievancecategories'],
      ['grievances', { assignedOfficer: { $ne: null } }, 'assignedOfficer', 'users'],
      ['digitalfiles', { department: { $ne: null } }, 'department', 'departments'],
      ['digitalfiles', { createdBy: { $ne: null } }, 'createdBy', 'users'],
      ['digitalfiles', { currentCustodian: { $ne: null } }, 'currentCustodian', 'users'],
      ['filemovements', { file: { $ne: null } }, 'file', 'digitalfiles'],
      ['filemovements', { toUser: { $ne: null } }, 'toUser', 'users'],
      ['filemovements', { fromUser: { $ne: null } }, 'fromUser', 'users'],
      ['applications', { type: { $ne: null } }, 'type', 'applicationtypes'],
      ['applications', { citizen: { $ne: null } }, 'citizen', 'users'],
      ['applications', { department: { $ne: null } }, 'department', 'departments'],
      ['timelineevents', { entityType: 'GRIEVANCE' }, 'entityId', 'grievances'],
      ['timelineevents', { entityType: 'FILE' }, 'entityId', 'digitalfiles'],
      ['timelineevents', { entityType: 'APPLICATION' }, 'entityId', 'applications'],
      ['documents', { entityType: 'GRIEVANCE' }, 'entityId', 'grievances'],
      ['documents', { entityType: 'FILE' }, 'entityId', 'digitalfiles'],
      ['documents', { entityType: 'APPLICATION' }, 'entityId', 'applications'],
      ['grievanceactions', { grievance: { $ne: null } }, 'grievance', 'grievances'],
      ['auditlogs', { actor: { $ne: null } }, 'actor', 'users'],
    ];
    for (const [collection, match, field, foreign] of checks) {
      if (!(await collectionExists(collection)) || !(await collectionExists(foreign))) continue;
      const count = await orphans(collection, match, field, foreign);
      assert.equal(count, 0, `${collection}.${field} has ${count} orphan reference(s)`);
    }
  });

  it('keeps status timestamps and assignments internally consistent', async () => {
    const checks = [
      ['grievances', { status: 'CLOSED', closedAt: null }],
      ['grievances', { status: 'RESOLVED', resolvedAt: null }],
      ['grievances', { status: 'ASSIGNED', assignedOfficer: null }],
      ['grievances', { status: 'PENDING_APPROVAL', 'resolution.text': { $in: [null, ''] } }],
      ['filemovements', { status: 'RECEIVED', receivedAt: null }],
      ['filemovements', { status: 'DISPATCHED', dispatchedAt: null }],
      ['digitalfiles', { status: 'DISPATCHED', currentCustodian: null }],
      ['applications', { status: { $in: ['APPROVED', 'REJECTED', 'CLOSED'] }, 'decision.outcome': null }],
    ];
    for (const [collection, filter] of checks) {
      const count = await db.collection(collection).countDocuments(filter);
      assert.equal(count, 0, `${collection} has ${count} inconsistent document(s) for ${JSON.stringify(filter)}`);
    }
  });

  it('keeps ID sequences ahead of the highest issued identifier', async () => {
    const pairs = [
      ['GRV', 'grievances', 'grievanceId'],
      ['FID', 'digitalfiles', 'fileId'],
      ['FILE', 'digitalfiles', 'fileNumber'],
      ['APP', 'applications', 'applicationId'],
      ['MOV', 'filemovements', 'movementNumber'],
    ];
    for (const [prefix, collection, field] of pairs) {
      const counter = await db.collection('counters').findOne({ key: { $regex: `^${prefix}-` } });
      const highest = await maxSuffix(collection, field, prefix);
      if (highest === 0) continue;
      assert.ok(counter, `missing counter for ${prefix}`);
      assert.ok(counter.value >= highest, `${prefix} counter ${counter.value} is behind issued id ${highest}`);
    }
  });

  it('records an audit trail and internal timeline for completed workflows', async () => {
    const closed = await db.collection('grievances').findOne({ status: 'CLOSED' });
    assert.ok(closed, 'expected at least one closed grievance from the workflow suite');
    const audit = await db.collection('auditlogs').countDocuments({ entityId: closed._id });
    assert.ok(audit > 0, 'closed grievance has no audit records');
    const timeline = await db.collection('timelineevents').countDocuments({
      entityType: 'GRIEVANCE',
      entityId: closed._id,
    });
    assert.ok(timeline > 0, 'closed grievance has no timeline records');
    const completion = await db.collection('timelineevents').findOne({
      entityType: 'GRIEVANCE',
      entityId: closed._id,
      action: 'CLOSED',
    });
    assert.ok(completion, 'closed grievance is missing the CLOSED timeline entry');
  });

  it('never persists plaintext credentials or Aadhaar identifiers', async () => {
    const user = await db.collection('users').findOne({ email: 'qa.admin@sdas.test' });
    assert.ok(user.passwordHash);
    assert.equal(user.password, undefined, 'plaintext password must not be stored');
    assert.equal(user.aadhaar, undefined);
    assert.equal(user.aadhar, undefined);

    const aadhaarApps = await db
      .collection('applications')
      .countDocuments({ 'formData.aadhaar': { $exists: true } });
    assert.equal(aadhaarApps, 0, 'applications must not store Aadhaar numbers');

    const aadhaarFields = await db
      .collection('applicationtypes')
      .aggregate([
        {
          $project: {
            keys: {
              $map: {
                input: { $ifNull: ['$requiredDocuments', []] },
                as: 'item',
                in: '$$item.key',
              },
            },
          },
        },
        { $match: { keys: { $regex: /aadhaar|aadhar/i } } },
        { $count: 'count' },
      ])
      .toArray();
    assert.equal(aadhaarFields[0]?.count ?? 0, 0, 'application types must not require Aadhaar documents');
  });
});

describe('Database - CRUD and transactions', () => {
  it('supports create, read, update and delete round trips', async () => {
    const scratch = db.collection('qa_scratch');
    const marker = `qa-${Date.now()}`;
    const inserted = await scratch.insertOne({ marker, value: 1, nested: { flag: false } });
    const read = await scratch.findOne({ _id: inserted.insertedId });
    assert.equal(read.marker, marker);
    assert.equal(read.nested.flag, false);

    const updated = await scratch.updateOne({ _id: inserted.insertedId }, { $set: { value: 2, 'nested.flag': true } });
    assert.equal(updated.modifiedCount, 1);
    const afterUpdate = await scratch.findOne({ _id: inserted.insertedId });
    assert.equal(afterUpdate.value, 2);
    assert.equal(afterUpdate.nested.flag, true);

    const deleted = await scratch.deleteOne({ _id: inserted.insertedId });
    assert.equal(deleted.deletedCount, 1);
    assert.equal(await scratch.countDocuments({ _id: inserted.insertedId }), 0);
  });

  it('rolls back aborted transactions without leaving partial writes', async (t) => {
    const scratch = db.collection('qa_scratch');
    const marker = `qa-tx-${Date.now()}`;
    const session = await mongoose.startSession();
    let transactional = true;
    try {
      await session.withTransaction(async () => {
        await scratch.insertOne({ marker, phase: 'committed' }, { session });
      });
      const committed = await scratch.countDocuments({ marker });
      assert.equal(committed, 1, 'committed transaction did not persist');

      await assert.rejects(
        session.withTransaction(async () => {
          await scratch.insertOne({ marker: `${marker}-abort`, phase: 'aborted' }, { session });
          throw new Error('QA forced abort');
        }),
      );
      const aborted = await scratch.countDocuments({ marker: `${marker}-abort` });
      assert.equal(aborted, 0, 'aborted transaction left a partial write');
    } catch (error) {
      if (error.code === 20 || /replica set/i.test(String(error.message))) {
        transactional = false;
        t.skip('MongoDB deployment does not support multi-document transactions');
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
      await scratch.deleteMany({ marker: { $regex: `^${marker}` } });
    }
    if (!transactional) t.diagnostic('transactions unavailable');
  });
});
