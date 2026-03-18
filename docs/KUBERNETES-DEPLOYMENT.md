# Kubernetes Deployment Guide for PayFlow

> **A Beginner's Journey to Horizontally Scalable Backend**

This guide walks you through deploying PayFlow on a VPS using Kubernetes (K8s). By the end, you'll have a production-ready, horizontally scalable backend.

---

## Table of Contents

1. [Understanding the Big Picture](#1-understanding-the-big-picture)
2. [Prerequisites](#2-prerequisites)
3. [VPS Setup](#3-vps-setup)
4. [Installing Kubernetes (K3s)](#4-installing-kubernetes-k3s)
5. [Container Registry Setup](#5-container-registry-setup)
6. [Kubernetes Fundamentals](#6-kubernetes-fundamentals)
7. [Creating Kubernetes Manifests](#7-creating-kubernetes-manifests)
8. [Deploying the Application](#8-deploying-the-application)
9. [Horizontal Pod Autoscaling](#9-horizontal-pod-autoscaling)
10. [Monitoring & Observability](#10-monitoring--observability)
11. [Common Operations](#11-common-operations)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Understanding the Big Picture

### What is Kubernetes?

Think of Kubernetes as a **smart manager** for your containers:

```
Without Kubernetes:
┌─────────────────────────────────────┐
│            Your VPS                 │
│  ┌─────────┐                        │
│  │ PayFlow │  ← Single point of     │
│  │   API   │    failure             │
│  └─────────┘                        │
└─────────────────────────────────────┘

With Kubernetes:
┌─────────────────────────────────────┐
│            Your VPS                 │
│  ┌─────────────────────────────┐    │
│  │     Kubernetes (K3s)        │    │
│  │  ┌───────┐ ┌───────┐ ┌───────┐  │
│  │  │PayFlow│ │PayFlow│ │PayFlow│  │ ← Auto-healing
│  │  │ Pod 1 │ │ Pod 2 │ │ Pod 3 │  │ ← Auto-scaling
│  │  └───────┘ └───────┘ └───────┘  │ ← Load balanced
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Key Benefits

| Feature | What It Means |
|---------|---------------|
| **Self-healing** | If a container crashes, K8s restarts it automatically |
| **Horizontal Scaling** | Add/remove containers based on load |
| **Rolling Updates** | Deploy new versions without downtime |
| **Service Discovery** | Containers find each other automatically |
| **Load Balancing** | Traffic distributed across all containers |

### Architecture Overview

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                     Your VPS                              │
                    │                                                           │
Internet            │    ┌─────────────────────────────────────────────────┐   │
   │                │    │                Kubernetes Cluster                │   │
   ▼                │    │                                                  │   │
┌──────┐            │    │   ┌─────────┐      ┌─────────────────────────┐  │   │
│Users │ ──HTTPS──▶ │    │   │ Ingress │ ───▶ │    PayFlow Service      │  │   │
└──────┘            │    │   │ (nginx) │      │  (Load Balancer)        │  │   │
                    │    │   └─────────┘      └───────────┬─────────────┘  │   │
                    │    │                                │                 │   │
                    │    │              ┌─────────────────┼─────────────────┤   │
                    │    │              ▼                 ▼                 ▼   │
                    │    │         ┌────────┐       ┌────────┐       ┌────────┐│
                    │    │         │PayFlow │       │PayFlow │       │PayFlow ││
                    │    │         │ Pod 1  │       │ Pod 2  │       │ Pod 3  ││
                    │    │         └────────┘       └────────┘       └────────┘│
                    │    │              │                 │                 │   │
                    │    │              └─────────────────┼─────────────────┘   │
                    │    │                                ▼                     │
                    │    │                    ┌─────────────────────┐           │
                    │    │                    │  MongoDB + Redis    │           │
                    │    │                    │  (StatefulSets)     │           │
                    │    │                    └─────────────────────┘           │
                    │    └─────────────────────────────────────────────────┘   │
                    └──────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites

### Your Machine (Development)

```bash
# Check you have these installed
docker --version    # Docker 20.10+
kubectl version     # Kubernetes CLI (we'll install this)
```

### VPS Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Recommended VPS Providers

- **DigitalOcean** - Simple, $24/mo for 4GB droplet
- **Hetzner** - Best value, €5-15/mo for good specs
- **Linode** - Reliable, $24/mo for 4GB
- **Vultr** - Global locations, $24/mo for 4GB

---

## 3. VPS Setup

### 3.1 Initial Server Setup

SSH into your new VPS:

```bash
ssh root@your-vps-ip
```

Update system and create a non-root user:

```bash
# Update packages
apt update && apt upgrade -y

# Create a user (replace 'payflow' with your username)
adduser payflow
usermod -aG sudo payflow

# Setup SSH for new user
mkdir -p /home/payflow/.ssh
cp ~/.ssh/authorized_keys /home/payflow/.ssh/
chown -R payflow:payflow /home/payflow/.ssh

# Disable root SSH login (security)
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### 3.2 Configure Firewall

```bash
# Install and configure UFW
apt install ufw -y

# Allow SSH (important - don't lock yourself out!)
ufw allow OpenSSH

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Kubernetes API (for remote kubectl)
ufw allow 6443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

### 3.3 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
usermod -aG docker payflow

# Start and enable Docker
systemctl enable docker
systemctl start docker

# Verify
docker --version
```

---

## 4. Installing Kubernetes (K3s)

We'll use **K3s** - a lightweight Kubernetes distribution perfect for VPS:

### Why K3s?

| Feature | K3s | Full K8s |
|---------|-----|----------|
| Memory Usage | ~512 MB | ~2+ GB |
| Setup Time | 30 seconds | Hours |
| Complexity | Simple | Complex |
| Production Ready | Yes | Yes |

### 4.1 Install K3s

```bash
# Install K3s (as the payflow user)
curl -sfL https://get.k3s.io | sh -

# Wait for K3s to be ready
sudo k3s kubectl get nodes

# Configure kubectl for your user
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
chmod 600 ~/.kube/config

# Verify installation
kubectl get nodes
# Should show: your-hostname   Ready    control-plane,master   ...
```

### 4.2 Install kubectl on Your Local Machine

To manage the cluster from your development machine:

**macOS:**
```bash
brew install kubectl
```

**Linux:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
```

**Windows (PowerShell):**
```powershell
choco install kubernetes-cli
```

### 4.3 Connect Local kubectl to VPS

```bash
# On your VPS, get the kubeconfig
sudo cat /etc/rancher/k3s/k3s.yaml

# On your local machine, create/edit ~/.kube/config
# Replace 127.0.0.1 with your VPS IP in the config
```

Or use this script on your local machine:

```bash
# Replace YOUR_VPS_IP with actual IP
VPS_IP=YOUR_VPS_IP

scp payflow@$VPS_IP:/etc/rancher/k3s/k3s.yaml ~/.kube/config-payflow

# Edit the file to replace 127.0.0.1 with VPS IP
sed -i '' "s/127.0.0.1/$VPS_IP/" ~/.kube/config-payflow

# Set as current config
export KUBECONFIG=~/.kube/config-payflow

# Test connection
kubectl get nodes
```

---

## 5. Container Registry Setup

You need somewhere to store your Docker images. Options:

### Option A: Docker Hub (Free, Simple)

```bash
# Login to Docker Hub
docker login

# Tag and push your image
docker build -t yourusername/payflow:v1.0.0 .
docker push yourusername/payflow:v1.0.0
```

### Option B: GitHub Container Registry (Free, Integrated)

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag and push
docker build -t ghcr.io/yourusername/payflow:v1.0.0 .
docker push ghcr.io/yourusername/payflow:v1.0.0
```

### Option C: Self-Hosted Registry (Advanced)

For production, consider running your own registry on the VPS:

```bash
# We'll cover this in the advanced section
```

### Create Registry Secret in K8s

```bash
# For Docker Hub
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL

# For GitHub Container Registry
kubectl create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  --docker-email=YOUR_EMAIL
```

---

## 6. Kubernetes Fundamentals

Before we deploy, let's understand the key concepts:

### Core Objects

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAMESPACE                                │
│  (Logical grouping - like folders for your K8s resources)       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      DEPLOYMENT                          │    │
│  │  (Manages how many pods run and how to update them)      │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │                      POD                         │    │    │
│  │  │  (Smallest deployable unit - runs your container)│    │    │
│  │  │                                                  │    │    │
│  │  │  ┌──────────────────────────────────────────┐   │    │    │
│  │  │  │              CONTAINER                    │   │    │    │
│  │  │  │  (Your actual PayFlow application)        │   │    │    │
│  │  │  └──────────────────────────────────────────┘   │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                       SERVICE                            │    │
│  │  (Stable network endpoint to reach your pods)            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                       INGRESS                            │    │
│  │  (Routes external traffic to services - handles HTTPS)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   CONFIGMAP / SECRET                     │    │
│  │  (Configuration and sensitive data for your app)         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Reference

| Object | Purpose | Example |
|--------|---------|---------|
| **Pod** | Runs container(s) | One instance of PayFlow |
| **Deployment** | Manages pod replicas | "Keep 3 PayFlow pods running" |
| **Service** | Network endpoint | "Route traffic to PayFlow pods" |
| **Ingress** | External access | "api.payflow.com → PayFlow service" |
| **ConfigMap** | Configuration | PORT=3000, LOG_LEVEL=info |
| **Secret** | Sensitive config | JWT_SECRET, DB_PASSWORD |
| **PVC** | Persistent storage | MongoDB data |

---

## 7. Creating Kubernetes Manifests

Create a `k8s/` directory in your project:

```bash
mkdir -p k8s/{base,overlays/{dev,staging,production}}
```

### Project Structure

```
k8s/
├── base/                    # Common configurations
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml            # Horizontal Pod Autoscaler
│   ├── mongodb/
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── pvc.yaml
│   └── redis/
│       ├── statefulset.yaml
│       ├── service.yaml
│       └── pvc.yaml
└── overlays/               # Environment-specific configs
    ├── dev/
    ├── staging/
    └── production/
```

### 7.1 Namespace

`k8s/base/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: payflow
  labels:
    app: payflow
    environment: production
```

### 7.2 ConfigMap

`k8s/base/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: payflow-config
  namespace: payflow
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  # Non-sensitive configuration
  REDIS_PORT: "6379"
  MONGODB_PORT: "27017"
```

### 7.3 Secrets

`k8s/base/secrets.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: payflow-secrets
  namespace: payflow
type: Opaque
stringData:
  # IMPORTANT: In production, use sealed-secrets or external secret manager
  # These are base64 encoded automatically
  JWT_SECRET: "your-super-secret-jwt-key-change-this"
  MONGODB_URI: "mongodb://mongodb:27017/payflow"
  REDIS_HOST: "redis"
```

> **Security Note:** Never commit real secrets to git. Use:
> - [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
> - [External Secrets Operator](https://external-secrets.io/)
> - Or create secrets manually: `kubectl create secret`

### 7.4 Deployment

`k8s/base/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payflow-api
  namespace: payflow
  labels:
    app: payflow
    component: api
spec:
  replicas: 3  # Start with 3 pods
  selector:
    matchLabels:
      app: payflow
      component: api

  # Deployment strategy for zero-downtime updates
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1    # At most 1 pod can be unavailable
      maxSurge: 1          # At most 1 extra pod during update

  template:
    metadata:
      labels:
        app: payflow
        component: api
    spec:
      # Pull images from private registry
      imagePullSecrets:
        - name: regcred

      # Don't run as root
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001

      containers:
        - name: payflow
          image: yourusername/payflow:v1.0.0
          imagePullPolicy: Always

          ports:
            - containerPort: 3000
              name: http

          # Environment from ConfigMap and Secrets
          envFrom:
            - configMapRef:
                name: payflow-config
            - secretRef:
                name: payflow-secrets

          # Resource limits (important for autoscaling)
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"      # 0.25 CPU cores
            limits:
              memory: "512Mi"
              cpu: "500m"      # 0.5 CPU cores

          # Liveness probe - restart if unhealthy
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # Readiness probe - don't route traffic until ready
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          # Startup probe - give app time to start
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 30  # 30 * 5 = 150 seconds max startup time

      # Pod scheduling preferences
      affinity:
        # Spread pods across nodes (if you have multiple)
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: payflow
                topologyKey: kubernetes.io/hostname
```

### 7.5 Service

`k8s/base/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payflow-api
  namespace: payflow
  labels:
    app: payflow
    component: api
spec:
  type: ClusterIP  # Internal only, Ingress handles external
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: payflow
    component: api
```

### 7.6 Ingress

`k8s/base/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: payflow-ingress
  namespace: payflow
  annotations:
    # K3s uses Traefik by default
    kubernetes.io/ingress.class: traefik
    # Enable HTTPS redirect
    traefik.ingress.kubernetes.io/router.middlewares: default-redirect-https@kubernetescrd
    # Rate limiting (optional)
    traefik.ingress.kubernetes.io/router.middlewares: payflow-ratelimit@kubernetescrd
spec:
  rules:
    - host: api.yourdomain.com  # Replace with your domain
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: payflow-api
                port:
                  number: 80

  # TLS configuration (requires cert-manager or manual certs)
  tls:
    - hosts:
        - api.yourdomain.com
      secretName: payflow-tls
```

### 7.7 MongoDB StatefulSet

`k8s/base/mongodb/statefulset.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: payflow
spec:
  serviceName: mongodb
  replicas: 1  # Start with 1, increase for replica set
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
        - name: mongodb
          image: mongo:7
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: mongodb-data
              mountPath: /data/db
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            exec:
              command:
                - mongosh
                - --eval
                - "db.adminCommand('ping')"
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command:
                - mongosh
                - --eval
                - "db.adminCommand('ping')"
            initialDelaySeconds: 5
            periodSeconds: 5

  volumeClaimTemplates:
    - metadata:
        name: mongodb-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

`k8s/base/mongodb/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: payflow
spec:
  type: ClusterIP
  ports:
    - port: 27017
      targetPort: 27017
  selector:
    app: mongodb
```

### 7.8 Redis StatefulSet

`k8s/base/redis/statefulset.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: payflow
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command:
            - redis-server
            - --appendonly
            - "yes"
            - --maxmemory
            - "256mb"
            - --maxmemory-policy
            - "allkeys-lru"
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: redis-data
              mountPath: /data
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
          livenessProbe:
            exec:
              command:
                - redis-cli
                - ping
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            exec:
              command:
                - redis-cli
                - ping
            initialDelaySeconds: 5
            periodSeconds: 5

  volumeClaimTemplates:
    - metadata:
        name: redis-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 2Gi
```

`k8s/base/redis/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: payflow
spec:
  type: ClusterIP
  ports:
    - port: 6379
      targetPort: 6379
  selector:
    app: redis
```

---

## 8. Deploying the Application

### 8.1 Build and Push Docker Image

```bash
# From your project root
docker build -t yourusername/payflow:v1.0.0 .

# Push to registry
docker push yourusername/payflow:v1.0.0
```

### 8.2 Apply Kubernetes Manifests

```bash
# Create namespace first
kubectl apply -f k8s/base/namespace.yaml

# Apply all configurations
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secrets.yaml

# Deploy databases first
kubectl apply -f k8s/base/mongodb/
kubectl apply -f k8s/base/redis/

# Wait for databases to be ready
kubectl -n payflow wait --for=condition=ready pod -l app=mongodb --timeout=120s
kubectl -n payflow wait --for=condition=ready pod -l app=redis --timeout=60s

# Deploy the application
kubectl apply -f k8s/base/deployment.yaml
kubectl apply -f k8s/base/service.yaml
kubectl apply -f k8s/base/ingress.yaml
```

### 8.3 Verify Deployment

```bash
# Check all resources
kubectl -n payflow get all

# Check pod status
kubectl -n payflow get pods -w  # Watch mode

# Check pod logs
kubectl -n payflow logs -f deployment/payflow-api

# Check a specific pod
kubectl -n payflow describe pod <pod-name>

# Test the service internally
kubectl -n payflow run test --rm -it --image=curlimages/curl -- \
  curl http://payflow-api/health
```

---

## 9. Horizontal Pod Autoscaling

This is where the magic happens - automatic scaling!

### 9.1 HPA Configuration

`k8s/base/hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payflow-api-hpa
  namespace: payflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payflow-api

  minReplicas: 2       # Never go below 2 pods
  maxReplicas: 10      # Never exceed 10 pods

  metrics:
    # Scale based on CPU usage
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale up when CPU > 70%

    # Scale based on Memory usage
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80  # Scale up when Memory > 80%

  # Scaling behavior
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
      policies:
        - type: Percent
          value: 10              # Scale down max 10% at a time
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0    # Scale up immediately
      policies:
        - type: Percent
          value: 100             # Can double pods if needed
          periodSeconds: 15
        - type: Pods
          value: 4               # Or add max 4 pods at a time
          periodSeconds: 15
      selectPolicy: Max          # Use the policy that adds more pods
```

### 9.2 Apply HPA

```bash
kubectl apply -f k8s/base/hpa.yaml

# Watch autoscaling in action
kubectl -n payflow get hpa -w
```

### 9.3 Test Autoscaling

Generate load to trigger scaling:

```bash
# Install a load testing tool in the cluster
kubectl -n payflow run load-test --rm -it --image=busybox -- \
  /bin/sh -c "while true; do wget -q -O- http://payflow-api/health; done"

# In another terminal, watch the HPA
kubectl -n payflow get hpa -w

# Watch pods scale up
kubectl -n payflow get pods -w
```

### 9.4 Understanding HPA Decisions

```
Current State                   HPA Decision
─────────────────────────────────────────────────
CPU: 30%, Memory: 40%          → No change (below targets)
CPU: 75%, Memory: 50%          → Scale UP (CPU > 70%)
CPU: 50%, Memory: 85%          → Scale UP (Memory > 80%)
CPU: 20%, Memory: 30%          → Scale DOWN (after 5 min)
  (for 5 minutes)
```

---

## 10. Monitoring & Observability

### 10.1 Install Prometheus & Grafana (Quick Setup)

K3s comes with metrics-server. For full monitoring, add Prometheus:

```bash
# Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus Stack (includes Grafana)
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

### 10.2 Access Grafana Dashboard

```bash
# Port-forward to access locally
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80

# Default credentials: admin / prom-operator
# Open: http://localhost:3000
```

### 10.3 Useful kubectl Commands for Monitoring

```bash
# Resource usage by pod
kubectl -n payflow top pods

# Resource usage by node
kubectl top nodes

# Events (useful for debugging)
kubectl -n payflow get events --sort-by='.lastTimestamp'

# Describe a pod for detailed info
kubectl -n payflow describe pod <pod-name>

# Check HPA status
kubectl -n payflow describe hpa payflow-api-hpa
```

---

## 11. Common Operations

### 11.1 Deploying Updates

```bash
# Build new image
docker build -t yourusername/payflow:v1.1.0 .
docker push yourusername/payflow:v1.1.0

# Update deployment (rolling update)
kubectl -n payflow set image deployment/payflow-api \
  payflow=yourusername/payflow:v1.1.0

# Watch the rollout
kubectl -n payflow rollout status deployment/payflow-api
```

### 11.2 Rollback

```bash
# Undo last deployment
kubectl -n payflow rollout undo deployment/payflow-api

# Rollback to specific revision
kubectl -n payflow rollout history deployment/payflow-api
kubectl -n payflow rollout undo deployment/payflow-api --to-revision=2
```

### 11.3 Scaling Manually

```bash
# Scale to 5 replicas
kubectl -n payflow scale deployment/payflow-api --replicas=5

# Scale to 0 (stop all pods)
kubectl -n payflow scale deployment/payflow-api --replicas=0
```

### 11.4 Accessing Logs

```bash
# All pods
kubectl -n payflow logs -f -l app=payflow

# Specific pod
kubectl -n payflow logs -f payflow-api-xxxxx

# Previous container (after crash)
kubectl -n payflow logs payflow-api-xxxxx --previous
```

### 11.5 Executing Commands in Pod

```bash
# Get a shell
kubectl -n payflow exec -it deployment/payflow-api -- /bin/sh

# Run a specific command
kubectl -n payflow exec deployment/payflow-api -- node -v
```

---

## 12. Troubleshooting

### Common Issues and Solutions

#### Pod Stuck in Pending

```bash
kubectl -n payflow describe pod <pod-name>
# Look for Events section
```

**Causes:**
- Insufficient resources → Scale down other workloads or add nodes
- Image pull error → Check image name and registry credentials
- PVC not bound → Check storage class availability

#### Pod CrashLoopBackOff

```bash
# Check logs
kubectl -n payflow logs <pod-name> --previous

# Common causes:
# - Application error on startup
# - Missing environment variables
# - Database connection failed
```

#### Service Not Accessible

```bash
# Check endpoints
kubectl -n payflow get endpoints payflow-api

# Should show pod IPs. If empty:
# - Check pod labels match service selector
# - Check pods are Running and Ready
```

#### HPA Not Scaling

```bash
kubectl -n payflow describe hpa payflow-api-hpa

# Check if metrics-server is running
kubectl -n kube-system get pods | grep metrics-server

# Verify resource requests are set in deployment
# HPA needs resource requests to calculate utilization
```

### Debug Checklist

1. **Check pod status:** `kubectl -n payflow get pods`
2. **Check events:** `kubectl -n payflow get events`
3. **Check logs:** `kubectl -n payflow logs <pod>`
4. **Describe resource:** `kubectl -n payflow describe <resource> <name>`
5. **Check endpoints:** `kubectl -n payflow get endpoints`
6. **Test connectivity:** `kubectl run test --rm -it --image=curlimages/curl -- curl <url>`

---

## Quick Reference Card

```bash
# ==================== CLUSTER STATUS ====================
kubectl get nodes                    # Node status
kubectl -n payflow get all           # All resources
kubectl -n payflow get pods -w       # Watch pods

# ==================== DEPLOYMENT ====================
kubectl apply -f k8s/base/           # Apply all manifests
kubectl -n payflow rollout status deployment/payflow-api
kubectl -n payflow rollout undo deployment/payflow-api

# ==================== SCALING ====================
kubectl -n payflow get hpa           # Check autoscaler
kubectl -n payflow scale deployment/payflow-api --replicas=5

# ==================== DEBUGGING ====================
kubectl -n payflow logs -f deployment/payflow-api
kubectl -n payflow describe pod <pod-name>
kubectl -n payflow exec -it <pod-name> -- /bin/sh

# ==================== CLEANUP ====================
kubectl delete namespace payflow     # Remove everything
```

---

## Next Steps

1. **Set up CI/CD:** Automate deployments with GitHub Actions
2. **Add TLS:** Configure cert-manager for automatic HTTPS
3. **Database Backups:** Set up automated MongoDB backups
4. **Multi-node cluster:** Add worker nodes for high availability
5. **GitOps:** Use ArgoCD or Flux for declarative deployments

---

## Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [K3s Documentation](https://docs.k3s.io/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes Patterns Book (Free)](https://k8spatterns.io/)

---

**Happy Deploying!**

Remember: The best way to learn Kubernetes is by doing. Start with a simple deployment, break things, fix them, and gradually add complexity.
