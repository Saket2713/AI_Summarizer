# AI Summarizer v2.0 — Complete ECS Deployment Guide

> Step-by-step guide to deploy the AI Summarizer fullstack application on AWS ECS (Fargate).
> The Docker image is **public** on DockerHub. The AWS sandbox has **no public internet access**.

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  VPC (Private Network — No Public Access)                                │
│                                                                          │
│   ┌─────────────────┐                                                    │
│   │  Internal ALB    │ ← Users inside VPC hit this on port 80            │
│   │  Port: 80        │                                                   │
│   └────────┬────────┘                                                    │
│            │ forwards to port 3000                                       │
│   ┌────────▼─────────────┐      ┌──────────────────────────┐            │
│   │  ECS Fargate Service │      │  RDS PostgreSQL           │            │
│   │  ┌─────────────────┐ │      │  Engine: PostgreSQL 16    │            │
│   │  │ AI Summarizer   │─┼──────│  Port: 5432               │            │
│   │  │ Container :3000 │ │      │  Private Subnet Only      │            │
│   │  └─────────────────┘ │      └──────────────────────────┘            │
│   └──────────────────────┘                                               │
│            │                                                             │
│            └──── outbound HTTPS :443 → RapidAPI (for summaries)          │
└──────────────────────────────────────────────────────────────────────────┘
```

**What happens when a user opens the app:**

```text
Browser → ALB:80 → Container:3000 → Serves React frontend (HTML/JS/CSS)
Browser → ALB:80/api/* → Container:3000 → Express API → RDS:5432 / RapidAPI:443
```

---

## Prerequisites

- AWS Account (sandbox with VPC already set up)
- Docker image pushed: `saketfirake2713/ai-summarizer:v2` (public DockerHub)
- VPC with at least **2 private subnets** in different AZs (required for ALB)

---

## Step 1 — Create Security Groups

> Create these 3 security groups FIRST. You'll reference them in later steps.

### Go to: **AWS Console → EC2 → Security Groups → Create Security Group**

### 1A. ALB Security Group (`sg-alb-ai-summarizer`)

| Field | Value |
| ----- | ----- |
| Name | `sg-alb-ai-summarizer` |
| Description | Security group for AI Summarizer ALB |
| VPC | Select your VPC |

**Inbound Rules:**

| Type | Protocol | Port Range | Source | Description |
| ---- | -------- | ---------- | ------ | ----------- |
| HTTP | TCP | 80 | Your VPC CIDR (e.g. `10.0.0.0/16`) | Allow HTTP from within VPC |

**Outbound Rules:**

| Type | Protocol | Port Range | Destination | Description |
| ---- | -------- | ---------- | ----------- | ----------- |
| All traffic | All | All | 0.0.0.0/0 | Allow all outbound (will be restricted by ECS SG) |

Click **Create Security Group**.

---

### 1B. ECS Task Security Group (`sg-ecs-ai-summarizer`)

| Field | Value |
| ----- | ----- |
| Name | `sg-ecs-ai-summarizer` |
| Description | Security group for AI Summarizer ECS tasks |
| VPC | Select your VPC |

**Inbound Rules:**

| Type | Protocol | Port Range | Source | Description |
| ---- | -------- | ---------- | ------ | ----------- |
| Custom TCP | TCP | 3000 | `sg-alb-ai-summarizer` | Allow traffic from ALB only |

**Outbound Rules:**

| Type | Protocol | Port Range | Destination | Description |
| ---- | -------- | ---------- | ----------- | ----------- |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Pull images, call RapidAPI, access Secrets Manager |
| Custom TCP | TCP | 5432 | `sg-rds-ai-summarizer` | Connect to RDS PostgreSQL |
| DNS (UDP) | UDP | 53 | 0.0.0.0/0 | DNS resolution |

> **Note:** If `sg-rds-ai-summarizer` doesn't exist yet, temporarily use 0.0.0.0/0 for port 5432. Come back and update it after creating the RDS security group.

Click **Create Security Group**.

---

### 1C. RDS Security Group (`sg-rds-ai-summarizer`)

| Field | Value |
| ----- | ----- |
| Name | `sg-rds-ai-summarizer` |
| Description | Security group for AI Summarizer RDS |
| VPC | Select your VPC |

**Inbound Rules:**

| Type | Protocol | Port Range | Source | Description |
| ---- | -------- | ---------- | ------ | ----------- |
| PostgreSQL | TCP | 5432 | `sg-ecs-ai-summarizer` | Allow connections from ECS tasks only |

**Outbound Rules:** Leave default (all outbound allowed).

Click **Create Security Group**.

> **Go back** and update `sg-ecs-ai-summarizer` outbound rule for port 5432 to point to `sg-rds-ai-summarizer` if you used 0.0.0.0/0 temporarily.

---

## Step 2 — Create RDS PostgreSQL Database

### Go to: **AWS Console → RDS → Create Database**

| Field | Value |
| ----- | ----- |
| Creation method | Standard create |
| Engine type | **PostgreSQL** |
| Engine version | **16.x** (latest 16) |
| Templates | **Free tier** (or Dev/Test) |
| DB instance identifier | `ai-summarizer-db` |
| Master username | `postgres` |
| Master password | Choose a strong password (save it!) |
| DB instance class | `db.t3.micro` |
| Storage type | `gp3`, 20 GiB |
| Storage autoscaling | Disable (for sandbox) |

**Connectivity:**

| Field | Value |
| ----- | ----- |
| VPC | Same VPC as your ECS cluster |
| DB subnet group | Select one with private subnets (or create new) |
| Public access | **No** |
| VPC security group | Choose existing → `sg-rds-ai-summarizer` |
| Availability Zone | No preference |

**Additional configuration:**

| Field | Value |
| ----- | ----- |
| Initial database name | `ai_summarizer` |
| Automated backups | Disable (for sandbox, saves cost) |
| Encryption | Default |

Click **Create Database**. Wait 5-10 minutes for it to become **Available**.

### After creation, note the Endpoint

Go to **RDS → Databases → ai-summarizer-db → Connectivity & Security**

Copy the **Endpoint**, it looks like:

```text
ai-summarizer-db.xxxxxxxxxx.us-east-1.rds.amazonaws.com
```

Your `DATABASE_URL` will be:

```text
postgresql://postgres:YOUR_PASSWORD@ai-summarizer-db.xxxxxxxxxx.us-east-1.rds.amazonaws.com:5432/ai_summarizer
```

---

## Step 3 — Create CloudWatch Log Group

### Go to: **AWS Console → CloudWatch → Log groups → Create log group**

| Field | Value |
| ----- | ----- |
| Log group name | `/ecs/ai-summarizer` |
| Retention | 7 days (saves cost in sandbox) |

Click **Create**.

---

## Step 4 — Store Secrets in Secrets Manager

### Go to: **AWS Console → Secrets Manager → Store a new secret**

| Field | Value |
| ----- | ----- |
| Secret type | **Other type of secret** |
| Key/value pairs | Add 3 key-value pairs (see below) |

**Key-value pairs:**

| Key | Value |
| --- | ----- |
| `DATABASE_URL` | `postgresql://postgres:YOUR_PASSWORD@ai-summarizer-db.xxxxxxxxxx.us-east-1.rds.amazonaws.com:5432/ai_summarizer` |
| `JWT_SECRET` | Generate a random string (e.g. run `openssl rand -hex 32` locally) |
| `RAPID_API_KEY` | Your RapidAPI key |

Click **Next**.

| Field | Value |
| ----- | ----- |
| Secret name | `ai-summarizer/env` |
| Description | Environment variables for AI Summarizer |

Click **Next → Next → Store**.

### After creation, note the Secret ARN

It looks like:

```text
arn:aws:secretsmanager:us-east-1:123456789012:secret:ai-summarizer/env-AbCdEf
```

---

## Step 5 — Create IAM Roles

### 5A. ECS Task Execution Role

### Go to: **AWS Console → IAM → Roles → Create role**

| Field | Value |
| ----- | ----- |
| Trusted entity | **AWS service** |
| Use case | **Elastic Container Service** → **Elastic Container Service Task** |

**Attach these policies:**

1. Search and attach: `AmazonECSTaskExecutionRolePolicy`

Click **Next**.

| Field | Value |
| ----- | ----- |
| Role name | `ecsTaskExecutionRole-ai-summarizer` |

Click **Create role**.

**Now add inline policy for Secrets Manager:**

1. Go to the role you just created
2. Click **Add permissions → Create inline policy**
3. Switch to **JSON** tab and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "arn:aws:secretsmanager:*:*:secret:ai-summarizer/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:log-group:/ecs/ai-summarizer:*"
        }
    ]
}
```

1. Name it `ai-summarizer-secrets-policy`
2. Click **Create policy**

---

## Step 6 — Create ECS Cluster

### Go to: **AWS Console → ECS → Clusters → Create cluster**

| Field | Value |
| ----- | ----- |
| Cluster name | `ai-summarizer-cluster` |
| Infrastructure | **AWS Fargate (serverless)** only — uncheck EC2 |

Click **Create**. This takes about 30 seconds.

---

## Step 7 — Create ECS Task Definition

### Go to: **AWS Console → ECS → Task definitions → Create new task definition**

Choose **Create new task definition with JSON** and paste this:

> **Before pasting:** Replace these placeholders:
>
> - `<account-id>` → Your AWS account ID (found in top-right of console)
> - `<region>` → Your AWS region (e.g. `us-east-1`)
> - `<secret-arn>` → The Secret ARN from Step 4

```json
{
    "family": "ai-summarizer-v2",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024",
    "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole-ai-summarizer",
    "containerDefinitions": [
        {
            "name": "ai-summarizer",
            "image": "saketfirake2713/ai-summarizer:v2",
            "essential": true,
            "portMappings": [
                {
                    "containerPort": 3000,
                    "hostPort": 3000,
                    "protocol": "tcp"
                }
            ],
            "environment": [
                { "name": "PORT", "value": "3000" },
                { "name": "NODE_ENV", "value": "production" }
            ],
            "secrets": [
                {
                    "name": "DATABASE_URL",
                    "valueFrom": "<secret-arn>:DATABASE_URL::"
                },
                {
                    "name": "JWT_SECRET",
                    "valueFrom": "<secret-arn>:JWT_SECRET::"
                },
                {
                    "name": "RAPID_API_KEY",
                    "valueFrom": "<secret-arn>:RAPID_API_KEY::"
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/ai-summarizer",
                    "awslogs-region": "<region>",
                    "awslogs-stream-prefix": "ecs"
                }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"],
                "interval": 30,
                "timeout": 5,
                "retries": 3,
                "startPeriod": 60
            }
        }
    ]
}
```

> **Note:** Health check uses `wget` instead of `curl` because Alpine-based Node images have `wget` but not `curl`.

Click **Create**.

---

## Step 8 — Create Target Group (for ALB)

### Go to: **AWS Console → EC2 → Target Groups → Create target group**

| Field | Value |
| ----- | ----- |
| Target type | **IP addresses** (required for Fargate) |
| Target group name | `tg-ai-summarizer` |
| Protocol | **HTTP** |
| Port | **3000** |
| VPC | Select your VPC |
| Protocol version | HTTP1 |

**Health check settings:**

| Field | Value |
| ----- | ----- |
| Health check protocol | HTTP |
| Health check path | `/api/health` |
| Healthy threshold | 3 |
| Unhealthy threshold | 3 |
| Timeout | 5 seconds |
| Interval | 30 seconds |
| Success codes | `200` |

Click **Next → Create target group** (don't register any targets manually — ECS will do it).

---

## Step 9 — Create Internal Application Load Balancer

### Go to: **AWS Console → EC2 → Load Balancers → Create Load Balancer**

Choose **Application Load Balancer** → Create.

| Field | Value |
| ----- | ----- |
| Name | `alb-ai-summarizer` |
| Scheme | **Internal** |
| IP address type | IPv4 |

**Network mapping:**

| Field | Value |
| ----- | ----- |
| VPC | Select your VPC |
| Availability Zones | Select **at least 2 AZs** with their **private subnets** |

**Security group:**

| Field | Value |
| ----- | ----- |
| Security group | `sg-alb-ai-summarizer` (remove the default SG) |

**Listeners:**

| Protocol | Port | Default action |
| -------- | ---- | -------------- |
| HTTP | 80 | Forward to → `tg-ai-summarizer` |

Click **Create load balancer**. Wait for it to become **Active** (1-2 minutes).

### After creation, note the ALB DNS name

Go to **EC2 → Load Balancers → alb-ai-summarizer → Description**

Copy the **DNS name**, it looks like:

```text
internal-alb-ai-summarizer-123456789.us-east-1.elb.amazonaws.com
```

**This is the URL you'll use to access your app!**

---

## Step 10 — Create ECS Service

### Go to: **AWS Console → ECS → Clusters → ai-summarizer-cluster → Create service**

**Environment:**

| Field | Value |
| ----- | ----- |
| Launch type | **FARGATE** |
| Platform version | **LATEST** |

**Deployment configuration:**

| Field | Value |
| ----- | ----- |
| Task definition family | `ai-summarizer-v2` |
| Revision | **LATEST** |
| Service name | `ai-summarizer-service` |
| Desired tasks | `1` |

**Networking:**

| Field | Value |
| ----- | ----- |
| VPC | Select your VPC |
| Subnets | Select **private subnets** (same ones used for ALB) |
| Security group | Use existing → `sg-ecs-ai-summarizer` |
| Public IP | **Turned OFF** |

**Load balancing:**

| Field | Value |
| ----- | ----- |
| Load balancer type | **Application Load Balancer** |
| Load balancer | `alb-ai-summarizer` |
| Container to load balance | `ai-summarizer 3000:3000` |
| Target group | Use existing → `tg-ai-summarizer` |

Click **Create service**.

---

## Step 11 — Verify Deployment

### Check task status

1. Go to **ECS → Clusters → ai-summarizer-cluster → Services → ai-summarizer-service**
2. Click the **Tasks** tab
3. Wait for task status to become **RUNNING** (1-3 minutes)

### If task fails to start, check logs

1. Click on the task ID
2. Click the **Logs** tab
3. Or go to **CloudWatch → Log groups → /ecs/ai-summarizer**

### Common issues

| Error | Fix |
| ----- | --- |
| `ResourceInitializationError` | ECS can't pull image or secrets. Check IAM role and security group outbound HTTPS (443). |
| `CannotPullContainerError` | ECS can't reach DockerHub. Ensure outbound 443 is allowed and NAT Gateway/VPC endpoints exist. |
| `Prisma migrate failed` | Can't connect to RDS. Check RDS security group allows 5432 from ECS SG. Check DATABASE_URL is correct. |
| `Task keeps restarting` | Check CloudWatch logs for the actual Node.js error. |

### Test the application

From any machine **inside the VPC** (e.g. an EC2 instance, VPN, or Cloud9):

```bash
# Health check
curl http://internal-alb-ai-summarizer-123456789.us-east-1.elb.amazonaws.com/api/health

# Should return: {"status":"ok","timestamp":"..."}
```

Open in browser (from within VPC):

```text
http://internal-alb-ai-summarizer-123456789.us-east-1.elb.amazonaws.com
```

You should see the AI Summarizer login page!

---

## Port Reference

```text
User (VPC) → ALB:80 → Container:3000 → RDS:5432
                                      → RapidAPI:443 (outbound)
```

| Component | Port | Protocol | Direction |
| --------- | ---- | -------- | --------- |
| ALB Listener | 80 | HTTP | Inbound from VPC |
| Container (Express) | 3000 | TCP | Receives from ALB |
| RDS PostgreSQL | 5432 | TCP | Outbound from Container |
| RapidAPI | 443 | HTTPS | Outbound from Container |
| Secrets Manager | 443 | HTTPS | Outbound from Container |
| DockerHub | 443 | HTTPS | Outbound from Container (image pull) |

---

## Deployment Checklist

- [ ] **Step 1:** Created 3 security groups (ALB, ECS, RDS)
- [ ] **Step 2:** Created RDS PostgreSQL, noted endpoint
- [ ] **Step 3:** Created CloudWatch log group `/ecs/ai-summarizer`
- [ ] **Step 4:** Stored secrets in Secrets Manager (`DATABASE_URL`, `JWT_SECRET`, `RAPID_API_KEY`), noted ARN
- [ ] **Step 5:** Created IAM execution role with Secrets Manager + Logs permissions
- [ ] **Step 6:** Created ECS cluster (Fargate)
- [ ] **Step 7:** Created task definition with JSON (replaced all placeholders)
- [ ] **Step 8:** Created target group (`tg-ai-summarizer`, port 3000, health check `/api/health`)
- [ ] **Step 9:** Created internal ALB, listener on port 80 → target group
- [ ] **Step 10:** Created ECS service, attached ALB and target group
- [ ] **Step 11:** Task is RUNNING, health check passes, app loads in browser

---

## Important Notes for Sandbox Environment

> **NAT Gateway:** Since your sandbox has no public internet access, your private subnets need a **NAT Gateway** (or VPC endpoints) for the ECS task to:
>
> - Pull the Docker image from DockerHub
> - Call the RapidAPI service
> - Access Secrets Manager
>
> If your sandbox doesn't have a NAT Gateway, ask your organization's cloud team to set one up, or use **VPC Endpoints** for ECR/Secrets Manager and switch to ECR (push the image to your private ECR registry instead of DockerHub).
