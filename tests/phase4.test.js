import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommerceProject, proposeChange, applyChange, DEMO_COMMAND } from '../src/data/commerce.ts';
import { generateMultiServiceOpenApi, detectContractDrift } from '../src/data/openapiSynth.ts';
import { generateTerraform, generateKubernetes, generateAllIac } from '../src/data/iacGenerator.ts';
import { auditProtocolsAndResilience } from '../src/data/protocolAuditor.ts';
import { generateTypeScriptSdk } from '../src/data/sdkGenerator.ts';
import { createVerifiedDevOpsZip } from '../src/data/export.ts';
import { unzipSync, strFromU8 } from 'fflate';

test('OpenAPI 3.1 Multi-Service: paths come only from the model\'s API operations', () => {
  const project = makeCommerceProject();
  const spec = generateMultiServiceOpenApi(project);

  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.info.title.includes('Multi-Service API'));
  // The sample models one operation, so the contract has exactly one path and invents no others.
  assert.deepEqual(Object.keys(spec.paths), ['/auth/login']);
  assert.equal(spec.paths['/auth/login'].post.tags[0], 'Auth Service');
  assert.deepEqual(Object.keys(spec.components.schemas), ['ErrorResponse']);
  assert.ok(!spec.paths['/auth/login'].post.responses['429'], 'no rate limit without a requirement');

  // A login rate limit covers the sign-in operation, not an unrelated payment endpoint.
  const withPayments = applyChange(project, proposeChange('Split payments into a separate service'));
  const limited = applyChange(withPayments, proposeChange('Add rate limiting to the authentication endpoint'));
  const limitedSpec = generateMultiServiceOpenApi(limited);
  assert.ok(limitedSpec.paths['/auth/login'].post.responses['429']);
  assert.ok(!limitedSpec.paths['/payments'].post.responses['429']);
  assert.match(limitedSpec.paths['/payments'].post.responses['200'].description, /Successful response from Payment Service/);
});

test('Contract Drift Analysis: detects requirement drift vs API specifications', () => {
  // Baseline project has no rate-limiting requirement
  const baseline = makeCommerceProject();
  const baselineDrift = detectContractDrift(baseline);

  assert.equal(baselineDrift.isFullyCompliant, false);
  assert.ok(baselineDrift.criticalCount >= 1, 'Missing rate-limit requirement must trigger a CRITICAL drift');
  assert.ok(baselineDrift.drifts.some((d) => d.id === 'drift-rate-limit-missing'));

  // Applied change introduces rate limiting requirement
  const updated = applyChange(baseline, proposeChange(DEMO_COMMAND));
  const updatedDrift = detectContractDrift(updated);

  // Missing rate-limit critical drift is resolved
  assert.equal(
    updatedDrift.drifts.some((d) => d.id === 'drift-rate-limit-missing'),
    false,
    'Applied rate limit requirement resolves missing drift'
  );
});

test('Infrastructure as Code: generates Terraform HCL and Kubernetes manifests from graph', () => {
  const project = makeCommerceProject();
  const iac = generateAllIac(project);

  // Verify Terraform HCL
  assert.ok(iac.terraformHcl.includes('provider "aws"'));
  assert.ok(iac.terraformHcl.includes('resource "aws_vpc" "main"'));
  assert.ok(iac.terraformHcl.includes('resource "aws_db_instance" "postgres"'));
  assert.ok(iac.terraformHcl.includes('resource "aws_elasticache_cluster" "redis"'));
  assert.ok(iac.terraformHcl.includes('resource "aws_msk_cluster" "kafka"'));
  assert.ok(iac.terraformHcl.includes('resource "aws_apigatewayv2_api" "gateway"'));

  // Verify Kubernetes YAML
  assert.ok(iac.kubernetesYaml.includes('kind: Deployment'));
  assert.ok(iac.kubernetesYaml.includes('kind: Service'));
  assert.ok(iac.kubernetesYaml.includes('kind: Ingress'));
  assert.ok(iac.kubernetesYaml.includes('name: auth'));
  assert.ok(iac.kubernetesYaml.includes('name: catalog'));
  assert.ok(iac.kubernetesYaml.includes('name: orders'));
});

test('Protocol & Resilience Auditor: detects synchronous chains and circuit breaker requirements', () => {
  const project = makeCommerceProject();
  const report = auditProtocolsAndResilience(project);

  assert.ok(report.findings.length > 0);
  assert.ok(report.score >= 0 && report.score <= 100);

  // Baseline has no Redis fallback requirement -> must flag as CRITICAL
  const redisFinding = report.findings.find((f) => f.id.includes('cache-fallback-missing'));
  assert.ok(redisFinding, 'Missing Redis fallback must be flagged');
  assert.equal(redisFinding.severity, 'CRITICAL');

  // Verify asynchronous decoupling recommendation for external payment provider reached via Kafka
  const asyncFinding = report.findings.find((f) => f.id.includes('async-external'));
  assert.ok(asyncFinding, 'Asynchronous decoupling of payment via Kafka must be recognized');
});

test('TypeScript SDK Synthesizer: one client method per API operation in the model', () => {
  const project = applyChange(makeCommerceProject(), proposeChange('Split payments into a separate service'));
  const sdk = generateTypeScriptSdk(project);

  assert.ok(sdk.includes('export class CommercePlatformClient'));
  assert.ok(sdk.includes('async apiLogin(body: Record<string, unknown> = {}): Promise<unknown>'));
  assert.ok(sdk.includes("this.request<unknown>('/auth/login'"));
  assert.ok(sdk.includes('async apiPaymentCreate(body: Record<string, unknown> = {}): Promise<unknown>'));
  assert.ok(sdk.includes("this.request<unknown>('/payments'"));
  assert.ok(sdk.includes("from the model's 2 API operations"));
  assert.ok(!/listProducts|createOrder|LoginRequest|\/api\/v1\//.test(sdk), 'no sample-only methods or paths');
});

test('DevOps Verified Export: packages full production deployment bundle in ZIP', () => {
  const project = makeCommerceProject();
  const { data, files } = createVerifiedDevOpsZip(project);

  assert.ok(files.includes('infrastructure/main.tf'));
  assert.ok(files.includes('infrastructure/k8s-manifests.yaml'));
  assert.ok(files.includes('sdk/client.ts'));
  assert.ok(files.includes('openapi-3.1-multiservice.json'));
  assert.ok(files.includes('contract-drift-report.json'));

  const unpacked = unzipSync(data);
  const tfContent = strFromU8(unpacked['infrastructure/main.tf']);
  assert.ok(tfContent.includes('aws_db_instance'));

  const sdkContent = strFromU8(unpacked['sdk/client.ts']);
  assert.ok(sdkContent.includes('CommercePlatformClient'));
});

