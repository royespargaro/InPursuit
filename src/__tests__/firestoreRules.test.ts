import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rulesText = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('firestore.rules static security invariant verification (no emulator execution)', () => {
  it('enforces a global default deny rule', () => {
    expect(rulesText).toMatch(/match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
  });

  it('prevents self-assigned admin privileges and list enumeration on /admins', () => {
    expect(rulesText).toMatch(/match \/admins\/\{userId\}[\s\S]*?allow get: if isOwner\(userId\) && isValidId\(userId\);[\s\S]*?allow list, write: if false;/);
  });

  it('restricts all /entitlements mutations strictly to verified admins', () => {
    const entBlock = rulesText.match(/match \/entitlements\/\{userId\}[\s\S]*?allow delete: if [^;]+;/)?.[0] ?? '';
    expect(entBlock).toContain('allow get: if (isOwner(userId) || isAdmin())');
    expect(entBlock).toContain('allow list: if isAdmin();');
    expect(entBlock).toContain('allow create: if isAdmin()');
    expect(entBlock).toContain('allow update: if isAdmin()');
    expect(entBlock).toContain('allow delete: if isAdmin()');
  });

  it('fails closed on client-created paymentRequests and guards admin approval invariants', () => {
    const payBlock = rulesText.match(/match \/paymentRequests\/\{requestId\}[\s\S]*?allow delete: if [^;]+;/)?.[0] ?? '';
    expect(payBlock).toContain('allow create: if false;');
    expect(payBlock).toContain("existing().status == 'pending'");
    expect(payBlock).toContain("incoming().diff(existing()).affectedKeys().hasOnly(['status', 'reviewedAt', 'reviewedBy', 'adminNote'])");
    expect(rulesText).toContain("plan == 'monthly' && amountIdr == 29000");
    expect(rulesText).toContain("plan == 'annual' && amountIdr == 249000");
  });

  it('validates all 3 DailyPlan priorityTaskIds indices and guards v4 workspaces from v3 downgrades', () => {
    expect(rulesText).toContain('(data.priorityTaskIds.size() < 1 || isValidId(data.priorityTaskIds[0]))');
    expect(rulesText).toContain('(data.priorityTaskIds.size() < 2 || isValidId(data.priorityTaskIds[1]))');
    expect(rulesText).toContain('(data.priorityTaskIds.size() < 3 || isValidId(data.priorityTaskIds[2]))');
    expect(rulesText).toContain('existing().schemaVersion == 3');
    expect(rulesText).toContain('existing().schemaVersion == 2');
    expect(rulesText).toContain('addedKeys().hasOnly(');
    expect(rulesText).toContain('changedKeys().hasOnly(');
    expect(rulesText).toContain("'syncVersion'");
    expect(rulesText).toContain('Firestore Rules CEL cannot loop over arbitrary-length lists');
  });

  it('isolates /users/{userId}/mindArchitecture/{docId} strictly to verified owners and enforces bounded schema', () => {
    const mindBlock = rulesText.match(/match \/mindArchitecture\/\{docId\}[\s\S]*?allow delete: if [^;]+;/)?.[0] ?? '';
    expect(mindBlock).toContain("allow get: if isOwner(userId) && isValidId(userId) && docId == 'default'");
    expect(mindBlock).toContain('allow create: if isOwner(userId) && isVerified()');
    expect(mindBlock).toContain('isValidMindArchitectureDoc(incoming(), docId)');
    expect(mindBlock).toContain('incoming().schemaVersion == existing().schemaVersion');
    expect(rulesText).toContain('isBoundedMapList(data.customDataset.nodes, 600)');
    expect(rulesText).toContain('isBoundedMapList(data.customDataset.edges, 1200)');
  });
});
