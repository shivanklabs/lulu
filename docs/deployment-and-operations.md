# MediBridge: Production Deployment & Operations Guide

This operational manual specifies the production deployment, backup/recovery, key rotation, and regulatory compliance protocols for the MediBridge healthcare platform.

---

## 1. Production Architecture Overview

MediBridge deploys as a containerized modular monolith with independent client and API services:

- **Frontend Client**: Static SPA compiled with Vite and served via an unprivileged Nginx container with hardened Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), and X-Frame-Options headers.
- **Backend API Server**: Node.js 24 Alpine LTS container running an unprivileged `node` user with health checks, structured Pino logging, and AES-256-GCM at-rest encryption.
- **Database**: MongoDB 7.0+ with replica-set enabled for multi-document ACID transactions.
- **File Storage**: Private, authenticated streaming proxy endpoint (`/api/v1/medical-records/:id/files/:fileId`) with real-time ABAC consent checks.

---

## 2. Containerized Deployment (Docker Compose)

### 2.1 Generating Cryptographically Secure Production Keys
Prior to production deployment, generate high-entropy 256-bit secrets for each independent key (keys must be distinct):

```bash
# Generate PHI Master Encryption Key (32 bytes / 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT Secrets, Action Confirmation Secret, and Prescription Signing Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> [!IMPORTANT]
> In production (`NODE_ENV=production`), server startup fails immediately if secrets are missing, weak (<32 characters), non-distinct, or equal to known development fallback values.

### 2.2 Production Database Requirement: MongoDB Replica Set
Multi-document ACID transactions (`session.withTransaction()`) are strictly enforced across appointment slot claiming, appointment scheduling, and encounter-scoped consent creation. Standalone MongoDB instances do not support transactions.
- **Docker Compose (Staging / Demo)**: Configured automatically with `--replSet rs0` and a healthcheck initialization script.
- **Production (Enterprise / Cloud Atlas)**: A minimum 3-node replica set (`primary-secondary-secondary` or `primary-secondary-arbiter`) with write concern `majority` is mandatory. Specify the replica set in your connection string: `mongodb://user:pass@host1:27017,host2:27017,host3:27017/medibridge?replicaSet=rs0&w=majority`.

### 2.2 Starting Services
```bash
# Build and start all services in detached mode
docker compose up -d --build

# Verify container health status
docker compose ps
```

---

## 3. Cryptographic Key Management & Rotation Protocol

MediBridge employs AES-256-GCM authenticated encryption for Protected Health Information (PHI) stored in MongoDB.

### Ciphertext Envelope Format
All encrypted database fields adhere to the versioned envelope:
```
enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
```

- `v1`: Cryptographic version prefix identifying key epoch.
- `iv_hex`: Unique 96-bit (12-byte) initialization vector generated per encryption via `crypto.randomBytes(12)`. IV reuse is strictly forbidden.
- `auth_tag_hex`: 128-bit authentication tag verified prior to decryption to detect tampering.

### Key Rotation Procedure
1. When rotating master keys, configure the new key as `PHI_ENCRYPTION_KEY_V2`.
2. Update the encryption utility to encrypt new records using `enc:v2:`.
3. Read operations examine the version prefix (`v1` or `v2`) and decrypt using the corresponding key.
4. Execute background migration script to re-encrypt historical `enc:v1:` records into `enc:v2:`.
5. Once all historical records have transitioned to `v2`, decommission `v1`.

### 3.2 Prescription Signature Envelope & Keyring Rotation
Prescriptions store tamper-evident cryptographic digests formatted as:
```
sig:<version>:<hmac_sha256_hex>
```
- **Current version**: `sig:v1:<hmac_sha256_hex>`, signed using `PRESCRIPTION_SIGNING_KEY`.
- **Controlled Verification Keyring**: `getPrescriptionVerificationKeyring()` maps key versions (e.g. `v1`, `v2`) to their respective HMAC secrets.
- **Zero-Invalidation Key Rotation**: When rotating prescription signing keys, historical `v1` signatures remain verifiable through the keyring, while new prescriptions are issued under `v2`.
- **Legacy Compatibility**: Pre-existing unversioned 64-character hex records are verified against `PRESCRIPTION_SIGNING_KEY` with a read-only fallback to `JWT_ACCESS_SECRET`. Note: Server-side HMAC integrity digests do not substitute for legally recognized asymmetric PKI/DSC digital signatures under the Indian IT Act (2000).

---

## 4. Backup & Disaster Recovery (DR)

### 4.1 Automated Daily Backups
Execute daily compressed mongodump snapshots with oplog tailing:

```bash
# Automated backup command
mongodump --uri="mongodb://mongodb:27017/medibridge" \
  --oplog \
  --gzip \
  --archive="/backups/medibridge-$(date +%Y%m%d_%H%M%S).gz"
```

### 4.2 Restoring from Disaster
```bash
# Restore entire database with point-in-time oplog replay
mongorestore --uri="mongodb://mongodb:27017/medibridge" \
  --oplogReplay \
  --gzip \
  --archive="/backups/medibridge-target-backup.gz"
```

### 4.3 Retention & Immutability Policy
- Backup archives must be stored in private, write-once-read-many (WORM) storage.
- Statutory record retention under the Digital Personal Data Protection Act (DPDPA 2023) mandates that backups be preserved in accordance with clinical governance guidelines.

---

## 5. Audit Trail & Regulatory Compliance Invariants

1. **Append-Only Enforcement**: Database users allocated to the application tier must be granted strictly `find` and `insert` permissions on the `auditlogs` collection. No `update` or `delete` privileges are granted.
2. **Automated PHI Redaction**: Application loggers (Pino) automatically redact credentials, tokens, authorization headers, and clinical text to prevent PHI exposure in logs.
3. **Immediate Consent Revocation**: When a patient revokes consent via `DELETE /api/v1/consent/:id`, subsequent attempts to stream medical files or access records yield `403 Forbidden` instantly.
4. **Single-Use Action Nonces**: AI agent actions stage an HMAC-SHA256 token valid for 5 minutes. The nonce is expended atomically at confirmation, rendering replay attacks impossible.
