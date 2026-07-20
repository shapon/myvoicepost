import { getUncachableRevenueCatClient } from './revenueCatClient';
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  listAppPublicApiKeys,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from '@replit/revenuecat-sdk';

const PROJECT_NAME = 'MyVoicePost';

const ENTITLEMENT_IDENTIFIER = 'myvoicepost_pro';
const ENTITLEMENT_DISPLAY_NAME = 'MyVoicePost Pro';

const APP_STORE_APP_NAME = 'MyVoicePost iOS';
const APP_STORE_BUNDLE_ID = 'com.myvoicepost.app';
const PLAY_STORE_APP_NAME = 'MyVoicePost Android';
const PLAY_STORE_PACKAGE_NAME = 'com.serpiancetech.myvoicepost';

const OFFERING_IDENTIFIER = 'default';
const OFFERING_DISPLAY_NAME = 'Default Offering';

type ProductConfig = {
  label: string;
  storeId: string;
  playStoreId: string;
  displayName: string;
  title: string;
  type: 'subscription' | 'non_renewing_subscription';
  duration?: 'P1W' | 'P1M' | 'P2M' | 'P3M' | 'P6M' | 'P1Y';
  prices: { amount_micros: number; currency: string }[];
  packageId: string;
  packageName: string;
};

const PRODUCTS: ProductConfig[] = [
  {
    label: 'Monthly',
    storeId: 'mvp_monthly',
    playStoreId: 'mvp_monthly:monthly',
    displayName: 'Monthly Pro',
    title: 'MyVoicePost Pro - Monthly',
    type: 'subscription',
    duration: 'P1M',
    prices: [
      { amount_micros: 9_990_000, currency: 'USD' },
      { amount_micros: 8_990_000, currency: 'EUR' },
    ],
    packageId: '$rc_monthly',
    packageName: 'Monthly',
  },
  {
    label: 'Yearly',
    storeId: 'mvp_yearly',
    playStoreId: 'mvp_yearly:yearly',
    displayName: 'Yearly Pro',
    title: 'MyVoicePost Pro - Yearly',
    type: 'subscription',
    duration: 'P1Y',
    prices: [
      { amount_micros: 59_990_000, currency: 'USD' },
      { amount_micros: 54_990_000, currency: 'EUR' },
    ],
    packageId: '$rc_annual',
    packageName: 'Yearly',
  },
  {
    label: 'Lifetime',
    storeId: 'mvp_lifetime',
    playStoreId: 'mvp_lifetime:lifetime',
    displayName: 'Lifetime Pro',
    title: 'MyVoicePost Pro - Lifetime',
    type: 'non_renewing_subscription',
    duration: undefined,
    prices: [
      { amount_micros: 149_990_000, currency: 'USD' },
      { amount_micros: 134_990_000, currency: 'EUR' },
    ],
    packageId: '$rc_lifetime',
    packageName: 'Lifetime',
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function ensureProduct(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  targetApp: App,
  config: ProductConfig,
  isTestStore: boolean,
  existingProducts: Product[],
): Promise<Product> {
  const storeId = isTestStore ? config.storeId : (targetApp.type === 'play_store' ? config.playStoreId : config.storeId);
  const existing = existingProducts.find(
    (p) => p.store_identifier === storeId && p.app_id === targetApp.id,
  );

  if (existing) {
    console.log(`  [${config.label}] Product already exists (${existing.id})`);
    return existing;
  }

  const body: CreateProductData['body'] = {
    store_identifier: storeId,
    app_id: targetApp.id,
    type: config.type,
    display_name: config.displayName,
  };

  if (isTestStore) {
    if (config.type === 'subscription' && config.duration) {
      body.subscription = { duration: config.duration };
    }
    body.title = config.title;
  }

  const { data: created, error } = await createProduct({
    client,
    path: { project_id: projectId },
    body,
  });

  if (error) throw new Error(`Failed to create ${config.label} product: ${JSON.stringify(error)}`);
  console.log(`  [${config.label}] Created product (${created.id})`);
  return created;
}

async function addTestStorePrices(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  product: Product,
  prices: { amount_micros: number; currency: string }[],
  label: string,
): Promise<void> {
  const { error } = await client.post<TestStorePricesResponse>({
    url: '/projects/{project_id}/products/{product_id}/test_store_prices',
    path: { project_id: projectId, product_id: product.id },
    body: { prices },
  });

  if (error) {
    const errObj = error as any;
    if (errObj?.type === 'resource_already_exists') {
      console.log(`  [${label}] Test store prices already set`);
    } else {
      throw new Error(`Failed to add test prices for ${label}: ${JSON.stringify(error)}`);
    }
  } else {
    console.log(`  [${label}] Test store prices added`);
  }
}

async function ensurePackage(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  offeringId: string,
  config: ProductConfig,
  existingPackages: Package[],
): Promise<Package> {
  const existing = existingPackages.find((p) => p.lookup_key === config.packageId);
  if (existing) {
    console.log(`  [${config.label}] Package already exists (${existing.id})`);
    return existing;
  }

  const { data: created, error } = await createPackages({
    client,
    path: { project_id: projectId, offering_id: offeringId },
    body: {
      lookup_key: config.packageId,
      display_name: config.packageName,
    },
  });

  if (error) throw new Error(`Failed to create ${config.label} package: ${JSON.stringify(error)}`);
  console.log(`  [${config.label}] Package created (${created.id})`);
  return created;
}

async function seedRevenueCat(): Promise<void> {
  console.log('\n🚀 Starting RevenueCat seed for MyVoicePost...\n');
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────
  console.log('📁 Ensuring project...');
  let project: Project;
  const { data: projectsData, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error('Failed to list projects');

  const existingProject = projectsData.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log(`  Project found: ${existingProject.id}`);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (error) throw new Error('Failed to create project');
    console.log(`  Project created: ${newProject.id}`);
    project = newProject;
  }

  // ── Apps ─────────────────────────────────────────────────────────────────
  console.log('\n📱 Ensuring apps...');
  const { data: appsData, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError) throw new Error('Failed to list apps');

  const testStoreApp = appsData.items.find((a) => a.type === 'test_store');
  if (!testStoreApp) throw new Error('No test_store app found in project');
  console.log(`  Test Store app: ${testStoreApp.id}`);

  let appStoreApp: App = appsData.items.find((a) => a.type === 'app_store')!;
  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: 'app_store',
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error('Failed to create App Store app');
    appStoreApp = newApp;
    console.log(`  App Store app created: ${appStoreApp.id}`);
  } else {
    console.log(`  App Store app found: ${appStoreApp.id}`);
  }

  let playStoreApp: App = appsData.items.find((a) => a.type === 'play_store')!;
  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: 'play_store',
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error('Failed to create Play Store app');
    playStoreApp = newApp;
    console.log(`  Play Store app created: ${playStoreApp.id}`);
  } else {
    console.log(`  Play Store app found: ${playStoreApp.id}`);
  }

  // ── Products ──────────────────────────────────────────────────────────────
  console.log('\n📦 Ensuring products...');
  const { data: existingProductsData, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error('Failed to list products');
  const existingProducts = existingProductsData.items ?? [];

  const testStoreProducts: Product[] = [];
  const appStoreProducts: Product[] = [];
  const playStoreProducts: Product[] = [];

  for (const config of PRODUCTS) {
    const testProd = await ensureProduct(client, project.id, testStoreApp, config, true, existingProducts);
    const appProd = await ensureProduct(client, project.id, appStoreApp, config, false, existingProducts);
    const playProd = await ensureProduct(client, project.id, playStoreApp, config, false, existingProducts);

    testStoreProducts.push(testProd);
    appStoreProducts.push(appProd);
    playStoreProducts.push(playProd);

    await addTestStorePrices(client, project.id, testProd, config.prices, config.label);
  }

  // ── Entitlement ───────────────────────────────────────────────────────────
  console.log('\n🔑 Ensuring entitlement...');
  let entitlement: Entitlement;
  const { data: entitlementsData, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error('Failed to list entitlements');

  const existingEntitlement = entitlementsData.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_IDENTIFIER,
  );
  if (existingEntitlement) {
    console.log(`  Entitlement found: ${existingEntitlement.id}`);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: ENTITLEMENT_IDENTIFIER,
        display_name: ENTITLEMENT_DISPLAY_NAME,
      },
    });
    if (error) throw new Error('Failed to create entitlement');
    console.log(`  Entitlement created: ${newEntitlement.id}`);
    entitlement = newEntitlement;
  }

  const allProductIds = [
    ...testStoreProducts.map((p) => p.id),
    ...appStoreProducts.map((p) => p.id),
    ...playStoreProducts.map((p) => p.id),
  ];

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });
  if (attachEntErr) {
    const e = attachEntErr as any;
    if (e?.type === 'unprocessable_entity_error') {
      console.log('  Products already attached to entitlement');
    } else {
      throw new Error(`Failed to attach products to entitlement: ${JSON.stringify(attachEntErr)}`);
    }
  } else {
    console.log(`  All products attached to entitlement`);
  }

  // ── Offering ──────────────────────────────────────────────────────────────
  console.log('\n🎁 Ensuring offering...');
  let offering: Offering;
  const { data: offeringsData, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error('Failed to list offerings');

  const existingOffering = offeringsData.items?.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (existingOffering) {
    console.log(`  Offering found: ${existingOffering.id}`);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: OFFERING_IDENTIFIER,
        display_name: OFFERING_DISPLAY_NAME,
      },
    });
    if (error) throw new Error('Failed to create offering');
    console.log(`  Offering created: ${newOffering.id}`);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error('Failed to set offering as current');
    console.log('  Offering set as current');
  }

  // ── Packages ──────────────────────────────────────────────────────────────
  console.log('\n📋 Ensuring packages...');
  const { data: existingPackagesData, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPackagesError) throw new Error('Failed to list packages');
  const existingPackages = existingPackagesData.items ?? [];

  for (let i = 0; i < PRODUCTS.length; i++) {
    const config = PRODUCTS[i];
    const pkg = await ensurePackage(client, project.id, offering.id, config, existingPackages);

    const products = [
      { product_id: testStoreProducts[i].id, eligibility_criteria: 'all' as const },
      { product_id: appStoreProducts[i].id, eligibility_criteria: 'all' as const },
      { product_id: playStoreProducts[i].id, eligibility_criteria: 'all' as const },
    ];

    const { error: attachPkgErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: { products },
    });
    if (attachPkgErr) {
      const e = attachPkgErr as any;
      if (e?.type === 'unprocessable_entity_error' && e?.message?.includes('Cannot attach product')) {
        console.log(`  [${config.label}] Products already attached to package`);
      } else {
        throw new Error(`Failed to attach products to ${config.label} package: ${JSON.stringify(attachPkgErr)}`);
      }
    } else {
      console.log(`  [${config.label}] Products attached to package`);
    }
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  console.log('\n🔐 Fetching public API keys...');
  const { data: testKeys, error: testKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: testStoreApp.id },
  });
  if (testKeysErr) throw new Error('Failed to list test store API keys');

  const { data: iosKeys, error: iosKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (iosKeysErr) throw new Error('Failed to list App Store API keys');

  const { data: androidKeys, error: androidKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (androidKeysErr) throw new Error('Failed to list Play Store API keys');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('✅ RevenueCat setup complete!');
  console.log('='.repeat(60));
  console.log('\nSet these environment variables:\n');
  console.log(`REVENUECAT_PROJECT_ID=${project.id}`);
  console.log(`REVENUECAT_TEST_STORE_APP_ID=${testStoreApp.id}`);
  console.log(`REVENUECAT_APPLE_APP_STORE_APP_ID=${appStoreApp.id}`);
  console.log(`REVENUECAT_GOOGLE_PLAY_STORE_APP_ID=${playStoreApp.id}`);
  console.log(
    `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=${testKeys?.items.map((k) => k.key).join(', ') ?? 'N/A'}`,
  );
  console.log(
    `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=${iosKeys?.items.map((k) => k.key).join(', ') ?? 'N/A'}`,
  );
  console.log(
    `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=${androidKeys?.items.map((k) => k.key).join(', ') ?? 'N/A'}`,
  );
  console.log('='.repeat(60) + '\n');
}

seedRevenueCat().catch((err) => {
  console.error('\n❌ Seed failed:', err.message ?? err);
  process.exit(1);
});
