import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoredEntries, reindexTotpEntries } from "../src/data/store";
import type { TotpEntryRecord } from "../src/types";
import { reorderVisibleEntries } from "../src/ui/views/entry-order";

const entries: TotpEntryRecord[] = [
	{
		id: "alpha",
		sortOrder: 0,
		issuer: "Alpha",
		accountName: "alpha@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "hidden-1",
		sortOrder: 1,
		issuer: "Hidden 1",
		accountName: "hidden-1@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "bravo",
		sortOrder: 2,
		issuer: "Bravo",
		accountName: "bravo@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "hidden-2",
		sortOrder: 3,
		issuer: "Hidden 2",
		accountName: "hidden-2@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "charlie",
		sortOrder: 4,
		issuer: "Charlie",
		accountName: "charlie@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "delta",
		sortOrder: 5,
		issuer: "Delta",
		accountName: "delta@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
];

test("reorderVisibleEntries moves a selected block together", () => {
	const nextOrderedIds = reorderVisibleEntries(
		entries,
		entries.map((entry) => entry.id),
		["bravo", "charlie"],
		"delta",
		"after",
	);

	assert.deepEqual(nextOrderedIds, [
		"alpha",
		"hidden-1",
		"hidden-2",
		"delta",
		"bravo",
		"charlie",
	]);
});

test("reorderVisibleEntries only reorders visible entries when filtering", () => {
	const nextOrderedIds = reorderVisibleEntries(
		entries,
		["alpha", "bravo", "charlie", "delta"],
		["charlie"],
		"alpha",
		"before",
	);

	assert.deepEqual(nextOrderedIds, [
		"charlie",
		"hidden-1",
		"alpha",
		"hidden-2",
		"bravo",
		"delta",
	]);
});

test("reorderVisibleEntries is a no-op when dropping onto the moved selection", () => {
	const nextOrderedIds = reorderVisibleEntries(
		entries,
		entries.map((entry) => entry.id),
		["bravo", "charlie"],
		"charlie",
		"before",
	);

	assert.deepEqual(
		nextOrderedIds,
		entries.map((entry) => entry.id),
	);
});

test("normalizeStoredEntries backfills missing sortOrder values from stored order", () => {
	const normalizedEntries = normalizeStoredEntries([
		{
			id: "first",
			issuer: "First",
			accountName: "first@example.com",
			secret: "JBSWY3DPEHPK3PXP",
			algorithm: "SHA-1",
			digits: 6,
			period: 30,
		},
		{
			id: "second",
			sortOrder: 7,
			issuer: "Second",
			accountName: "second@example.com",
			secret: "JBSWY3DPEHPK3PXP",
			algorithm: "SHA-1",
			digits: 6,
			period: 30,
		},
	]) as TotpEntryRecord[];

	assert.deepEqual(
		normalizedEntries.map((entry) => [entry.id, entry.sortOrder]),
		[
			["first", 0],
			["second", 1],
		],
	);
});

test("reindexTotpEntries preserves the caller-provided order", () => {
	const nextEntries = reindexTotpEntries([
		entries[4]!,
		entries[0]!,
		entries[2]!,
	]);

	assert.deepEqual(
		nextEntries.map((entry) => [entry.id, entry.sortOrder]),
		[
			["charlie", 0],
			["alpha", 1],
			["bravo", 2],
		],
	);
});
