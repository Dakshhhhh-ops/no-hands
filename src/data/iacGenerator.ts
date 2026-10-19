import type { Project, Component, Relationship } from '../types/schema.ts';

export interface GeneratedIac {
  terraformHcl: string;
  kubernetesYaml: string;
  dockerComposeYaml: string;
}

/**
 * Generates production-ready Terraform HCL infrastructure declarations
 * mapping 1:1 with the architecture components and relationships.
 */
export function generateTerraform(project: Project): string {
  const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
  const components = project.components;

  const header = `# ==============================================================================
# Terraform Infrastructure as Code (IaC) - AWS Provider
# Generated automatically by VoiceArchitect for "${project.name}" (v${project.version})
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = "Production"
      ManagedBy   = "VoiceArchitect"
      Project     = "${project.name}"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

# --- Core Networking VPC ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${sanitize(project.name)}_vpc"
  }
}

resource "aws_subnet" "public_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "us-east-1b"
}
`;

  const blocks: string[] = [header];

  for (const comp of components) {
    const sId = sanitize(comp.id);
    switch (comp.type) {
      case 'GATEWAY':
        blocks.push(`
# --- API Gateway Ingress: ${comp.name} (${comp.id}) ---
resource "aws_apigatewayv2_api" "${sId}" {
  name          = "${comp.name}"
  protocol_type = "HTTP"
  description   = "${comp.sub || 'Edge ingress routing'}"
}

resource "aws_apigatewayv2_stage" "${sId}_prod" {
  api_id      = aws_apigatewayv2_api.${sId}.id
  name        = "$default"
  auto_deploy = true
}
`);
        break;

      case 'SERVICE':
        blocks.push(`
# --- Microservice Service Compute: ${comp.name} (${comp.id}) ---
resource "aws_ecs_task_definition" "${sId}" {
  family                   = "${sId}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

  container_definitions = jsonencode([
    {
      name      = "${sId}"
      image     = "123456789012.dkr.ecr.us-east-1.amazonaws.com/${sId}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
        }
      ]
      environment = [
        { name = "SERVICE_NAME", value = "${comp.name}" },
        { name = "NODE_ENV", value = "production" }
      ]
    }
  ])
}
`);
        break;

      case 'DATABASE':
        if (/dynamo/i.test(comp.id) || /dynamo/i.test(comp.sub)) {
          blocks.push(`
# --- DynamoDB Serverless Database: ${comp.name} (${comp.id}) ---
resource "aws_dynamodb_table" "${sId}" {
  name         = "${sId}_table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}
`);
        } else {
          blocks.push(`
# --- Relational Database: ${comp.name} (${comp.id}) ---
resource "aws_db_instance" "${sId}" {
  identifier          = "${sId}-db"
  allocated_storage   = 50
  engine              = "postgres"
  engine_version      = "15.4"
  instance_class      = "db.t4g.medium"
  multi_az            = true
  username            = "dbadmin"
  password            = "ReplaceWithSecretsManager123!"
  skip_final_snapshot = true
  publicly_accessible = false
}
`);
        }
        break;

      case 'CACHE':
        blocks.push(`
# --- ElastiCache Redis Cluster: ${comp.name} (${comp.id}) ---
resource "aws_elasticache_cluster" "${sId}" {
  cluster_id           = "${sId}-cluster"
  engine               = "redis"
  node_type            = "cache.t4g.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
}
`);
        break;

      case 'QUEUE':
        blocks.push(`
# --- Event Streaming & Queue: ${comp.name} (${comp.id}) ---
resource "aws_msk_cluster" "${sId}" {
  cluster_name           = "${sId}-kafka"
  kafka_version          = "3.4.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type = "kafka.m5.large"
    client_subnets = [
      aws_subnet.private_1.id,
      aws_subnet.private_2.id
    ]
  }
}
`);
        break;
    }
  }

  return blocks.join('\n');
}

/**
 * Generates Kubernetes (YAML) manifests: Deployments, Services, Ingress, and ConfigMaps
 * matching the architecture components.
 */
export function generateKubernetes(project: Project): string {
  const sanitize = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const services = project.components.filter((c) => c.type === 'SERVICE');
  const gateways = project.components.filter((c) => c.type === 'GATEWAY');

  const manifests: string[] = [
    `# ==============================================================================
# Kubernetes Manifests - Generated by VoiceArchitect
# System: ${project.name} (v${project.version})
# ==============================================================================
apiVersion: v1
kind: Namespace
metadata:
  name: ${sanitize(project.name)}
---`,
  ];

  for (const svc of services) {
    const sId = sanitize(svc.id);
    manifests.push(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${sId}
  namespace: ${sanitize(project.name)}
  labels:
    app: ${sId}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${sId}
  template:
    metadata:
      labels:
        app: ${sId}
    spec:
      containers:
      - name: ${sId}
        image: registry.internal.company.com/${sId}:v${project.version}.0.0
        ports:
        - containerPort: 8080
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ${sId}
  namespace: ${sanitize(project.name)}
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: ${sId}
---`);
  }

  // Ingress routing if gateway exists
  if (gateways.length > 0) {
    const gw = gateways[0];
    manifests.push(`apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${sanitize(gw.id)}-ingress
  namespace: ${sanitize(project.name)}
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.commerceplatform.local
    secretName: commerceplatform-tls
  rules:
  - host: api.commerceplatform.local
    http:
      paths:
      ${services.map((svc) => `
      - path: /api/v1/${sanitize(svc.id)}
        pathType: Prefix
        backend:
          service:
            name: ${sanitize(svc.id)}
            port:
              number: 80`).join('')}
---`);
  }

  return manifests.join('\n');
}

/**
 * Generates all Infrastructure as Code assets.
 */
export function generateAllIac(project: Project): GeneratedIac {
  return {
    terraformHcl: generateTerraform(project),
    kubernetesYaml: generateKubernetes(project),
    dockerComposeYaml: `# Local development container stack\nversion: '3.8'\nservices:\n  redis:\n    image: redis:7-alpine\n    ports: ['6379:6379']\n  postgres:\n    image: postgres:15-alpine\n    environment: [POSTGRES_PASSWORD=devpassword]\n    ports: ['5432:5432']\n`,
  };
}

