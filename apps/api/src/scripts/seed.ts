import type { ServiceCategory } from '@medbourse/shared';
import { hashPassword } from '../auth/password.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../db/connection.js';
import { City } from '../models/City.js';
import { Customer } from '../models/Customer.js';
import { Offering } from '../models/Offering.js';
import { Provider } from '../models/Provider.js';
import { User } from '../models/User.js';

/**
 * Idempotent development seed. Upserts demo accounts and catalog records into the
 * configured MONGODB_URI. It never deletes existing records.
 *
 * Usage: npm run db:seed -w @medbourse/api
 * The shared password can be overridden with SEED_PASSWORD.
 */
const PASSWORD = process.env.SEED_PASSWORD ?? 'medbourse-dev-2026';

async function upsertUser(email: string, role: 'super_admin' | 'staff', displayName: string) {
  const passwordHash = await hashPassword(PASSWORD);
  return User.findOneAndUpdate(
    { email },
    { $set: { role, displayName, isActive: true, passwordHash } },
    { upsert: true, new: true },
  ).exec();
}

async function upsertCity(slug: string, name: string, countryCode: string) {
  return City.findOneAndUpdate(
    { slug },
    { $set: { name, countryCode, isActive: true } },
    { upsert: true, new: true },
  ).exec();
}

async function upsertProvider(input: {
  name: string;
  category: ServiceCategory;
  cityId: string;
  countryCode: string;
  website: string | null;
  partnershipVerified: boolean;
}) {
  return Provider.findOneAndUpdate(
    { cityId: input.cityId, name: input.name },
    {
      $set: {
        category: input.category,
        countryCode: input.countryCode,
        website: input.website,
        isActive: true,
        partnershipVerified: input.partnershipVerified,
      },
    },
    { upsert: true, new: true },
  ).exec();
}

async function upsertOffering(input: {
  slug: string;
  title: string;
  summary: string;
  requirementsSummary: string;
  category: ServiceCategory;
  providerId: string;
  cityId: string;
  countryCode: string;
}) {
  return Offering.findOneAndUpdate(
    { slug: input.slug },
    {
      $set: {
        title: input.title,
        summary: input.summary,
        requirementsSummary: input.requirementsSummary,
        category: input.category,
        providerId: input.providerId,
        cityId: input.cityId,
        countryCode: input.countryCode,
        isActive: true,
      },
    },
    { upsert: true, new: true },
  ).exec();
}

async function main() {
  await connectDatabase();
  if (!isDatabaseConnected()) {
    throw new Error('Database is not connected; check MONGODB_URI');
  }

  const superAdmin = await upsertUser('root@medbourse.dev', 'super_admin', 'Demo Super Admin');
  const staff = await upsertUser('staff@medbourse.dev', 'staff', 'Demo Staff');

  const istanbul = await upsertCity('istanbul', 'Istanbul', 'TR');
  const ankara = await upsertCity('ankara', 'Ankara', 'TR');
  if (!istanbul || !ankara) {
    throw new Error('Failed to upsert seed cities');
  }

  const university = await upsertProvider({
    name: 'Bosphorus University (demo)',
    category: 'education',
    cityId: istanbul._id.toString(),
    countryCode: 'TR',
    website: 'https://example.edu',
    partnershipVerified: true,
  });
  const clinic = await upsertProvider({
    name: 'Anatolia Health Clinic (demo)',
    category: 'medical',
    cityId: ankara._id.toString(),
    countryCode: 'TR',
    website: 'https://example.health',
    partnershipVerified: false,
  });
  if (!university || !clinic) {
    throw new Error('Failed to upsert seed providers');
  }

  await upsertOffering({
    slug: 'bachelor-computer-science',
    title: 'Bachelor in Computer Science (demo)',
    summary: 'Four-year undergraduate program with English-language instruction.',
    requirementsSummary: 'High school diploma, transcript, and language proficiency evidence.',
    category: 'education',
    providerId: university._id.toString(),
    cityId: istanbul._id.toString(),
    countryCode: 'TR',
  });
  await upsertOffering({
    slug: 'dental-implant-package',
    title: 'Dental implant package (demo)',
    summary: 'Coordination for consultation, procedure, and follow-up appointments.',
    requirementsSummary: 'Recent panoramic X-ray and general health declaration.',
    category: 'medical',
    providerId: clinic._id.toString(),
    cityId: ankara._id.toString(),
    countryCode: 'TR',
  });

  await Customer.findOneAndUpdate(
    { email: 'layla@example.com' },
    {
      $set: {
        fullName: 'Layla Haddad',
        phone: '+971500000000',
        countryCode: 'AE',
        assignedManagerUserId: staff!._id,
        assignmentStatus: 'assigned',
        assignmentSource: 'manual',
        createdByUserId: superAdmin!._id,
      },
    },
    { upsert: true, new: true },
  ).exec();

  console.info('[seed] done');
  console.info(`[seed] super_admin: root@medbourse.dev / ${PASSWORD}`);
  console.info(`[seed] staff:       staff@medbourse.dev / ${PASSWORD}`);
  console.info('[seed] cities: istanbul, ankara · providers: 2 · offerings: 2 · customers: 1');
}

try {
  await main();
} catch (err) {
  const name = err instanceof Error ? err.message : 'Error';
  console.error(`[seed] failed (${name})`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
